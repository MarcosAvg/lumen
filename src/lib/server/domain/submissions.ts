import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	evidenceSubmissions,
	evidenceTargets,
	photos,
	reviews,
	serviceAssignments,
	submissionPhotos,
	users
} from '#lib/server/db/schema';
import type { TargetStatus, WorkMode } from '#lib/types';
import { recordAudit } from './audit';
import { DomainError } from './errors';
import { createReviewNotifications, createSubmissionNotifications } from './notifications';
import { dispatchPushToUsers } from './push';
import { listRequirements } from './requirements';
import { getTargetContext, isEditableStatus } from './targets';

export interface SubmitResult {
	submissionId: string;
	sequenceNo: number;
	version: number;
}

interface ReadyPhoto {
	id: string;
	requirementId: string | null;
	sortOrder: number;
	uploadedBy: string | null;
	uploadedAt: Date;
}

/**
 * Envía la evidencia vigente como una **instantánea inmutable**. En una sola
 * transacción bloquea el objetivo, valida requisitos y versión, congela grupos,
 * orden e IDs, y pasa el objetivo a `in_review`.
 */
export async function submitEvidence(
	db: Database,
	input: { targetId: string; expectedVersion: number; userId: string }
): Promise<SubmitResult> {
	const outcome = await db.transaction(async (tx) => {
		const [locked] = await tx
			.select()
			.from(evidenceTargets)
			.where(eq(evidenceTargets.id, input.targetId))
			.for('update');
		if (!locked) throw new DomainError(404, 'Evidencia no encontrada.');
		if (!isEditableStatus(locked.currentStatus)) {
			throw new DomainError(409, 'La evidencia no es editable en su estado actual.');
		}
		if (locked.version !== input.expectedVersion) {
			throw new DomainError(409, 'La evidencia cambió. Actualiza antes de enviar.');
		}

		const requirements = await listRequirements(tx, input.targetId);
		const photoRows: ReadyPhoto[] = await tx
			.select({
				id: photos.id,
				requirementId: photos.requirementId,
				sortOrder: photos.sortOrder,
				uploadedBy: photos.uploadedBy,
				uploadedAt: photos.uploadedAt
			})
			.from(photos)
			.where(
				and(
					eq(photos.targetId, input.targetId),
					isNull(photos.removedAt),
					eq(photos.processingStatus, 'ready')
				)
			)
			.orderBy(photos.sortOrder);

		const byRequirement = new Map<string | null, ReadyPhoto[]>();
		for (const photo of photoRows) {
			const list = byRequirement.get(photo.requirementId) ?? [];
			list.push(photo);
			byRequirement.set(photo.requirementId, list);
		}

		const required = requirements.filter((requirement) => requirement.isRequired);
		if (required.length > 0) {
			for (const requirement of required) {
				if ((byRequirement.get(requirement.id) ?? []).length === 0) {
					throw new DomainError(409, `Falta al menos una fotografía en «${requirement.name}».`);
				}
			}
		} else if (photoRows.length === 0) {
			throw new DomainError(409, 'Añade al menos una fotografía para enviar.');
		}

		const context = await getTargetContext(tx, input.targetId);

		const [maxSeq] = await tx
			.select({ value: sql<number>`coalesce(max(${evidenceSubmissions.sequenceNo}), 0)` })
			.from(evidenceSubmissions)
			.where(eq(evidenceSubmissions.targetId, input.targetId));
		const sequenceNo = (maxSeq?.value ?? 0) + 1;

		const [submission] = await tx
			.insert(evidenceSubmissions)
			.values({
				targetId: input.targetId,
				sequenceNo,
				submittedBy: input.userId,
				evidenceVersion: locked.version,
				targetNameSnapshot: context.label,
				workNameSnapshot: context.workName,
				serviceNameSnapshot: context.serviceName
			})
			.returning({ id: evidenceSubmissions.id });

		let groupOrder = 0;
		for (const requirement of requirements) {
			const group = byRequirement.get(requirement.id) ?? [];
			let photoOrder = 0;
			for (const photo of group) {
				await tx.insert(submissionPhotos).values({
					submissionId: submission.id,
					photoId: photo.id,
					groupKind: 'requirement',
					requirementNameSnapshot: requirement.name,
					groupSortOrder: groupOrder,
					photoSortOrder: photoOrder,
					photoUploadedBySnapshot: photo.uploadedBy,
					photoUploadedAtSnapshot: photo.uploadedAt
				});
				photoOrder += 1;
			}
			groupOrder += 1;
		}

		let additionalOrder = 0;
		for (const photo of byRequirement.get(null) ?? []) {
			await tx.insert(submissionPhotos).values({
				submissionId: submission.id,
				photoId: photo.id,
				groupKind: 'additional',
				requirementNameSnapshot: null,
				groupSortOrder: groupOrder,
				photoSortOrder: additionalOrder,
				photoUploadedBySnapshot: photo.uploadedBy,
				photoUploadedAtSnapshot: photo.uploadedAt
			});
			additionalOrder += 1;
		}

		const [updated] = await tx
			.update(evidenceTargets)
			.set({
				currentStatus: 'in_review',
				latestSubmissionId: submission.id,
				version: sql`${evidenceTargets.version} + 1`,
				updatedAt: new Date()
			})
			.where(eq(evidenceTargets.id, input.targetId))
			.returning({ version: evidenceTargets.version });

		await recordAudit(tx, {
			actorUserId: input.userId,
			serviceId: context.serviceId,
			entityType: 'evidence_submission',
			entityId: submission.id,
			action: 'submission.created',
			metadata: { targetId: input.targetId, sequenceNo }
		});

		// Notificaciones internas para supervisores asignados, dentro de la transacción.
		const outbound = await createSubmissionNotifications(tx, {
			serviceId: context.serviceId,
			targetId: input.targetId,
			submissionId: submission.id,
			sequenceNo,
			serviceName: context.serviceName,
			workName: context.workName,
			label: context.label
		});

		return { submissionId: submission.id, sequenceNo, version: updated.version, outbound };
	});

	// Push best-effort, después del commit: nunca revierte la entrega.
	await dispatchPushToUsers(db, outcome.outbound.recipientIds, outcome.outbound.message).catch(
		(error) => console.error('[push] envío tras entrega falló', error)
	);

	return {
		submissionId: outcome.submissionId,
		sequenceNo: outcome.sequenceNo,
		version: outcome.version
	};
}

export interface ReviewResult {
	decision: 'approved' | 'rejected';
	targetId: string;
	serviceId: string;
}

/**
 * Revisa una entrega. Solo la **primera** decisión se aplica: el bloqueo del
 * objetivo más el índice único por entrega impiden decisiones dobles.
 */
export async function reviewSubmission(
	db: Database,
	input: {
		submissionId: string;
		decision: 'approved' | 'rejected';
		reason?: string | null;
		reviewerId: string;
	}
): Promise<ReviewResult> {
	const outcome = await db.transaction(async (tx) => {
		const [submission] = await tx
			.select()
			.from(evidenceSubmissions)
			.where(eq(evidenceSubmissions.id, input.submissionId))
			.limit(1);
		if (!submission) throw new DomainError(404, 'Entrega no encontrada.');

		const [locked] = await tx
			.select()
			.from(evidenceTargets)
			.where(eq(evidenceTargets.id, submission.targetId))
			.for('update');
		if (!locked) throw new DomainError(404, 'Evidencia no encontrada.');

		if (locked.currentStatus !== 'in_review' || locked.latestSubmissionId !== submission.id) {
			throw new DomainError(409, 'Esta entrega ya fue revisada. Se muestra la decisión existente.');
		}

		const reason = input.reason?.trim() ?? '';
		if (input.decision === 'rejected' && reason.length === 0) {
			throw new DomainError(400, 'El motivo del rechazo es obligatorio.');
		}

		let reviewId: string;
		try {
			const [created] = await tx
				.insert(reviews)
				.values({
					submissionId: submission.id,
					reviewerId: input.reviewerId,
					decision: input.decision,
					reason: reason.length > 0 ? reason : null
				})
				.returning({ id: reviews.id });
			reviewId = created.id;
		} catch (error) {
			if ((error as { cause?: { code?: string }; code?: string }).cause?.code === '23505') {
				throw new DomainError(409, 'Esta entrega ya fue revisada.');
			}
			throw error;
		}

		const context = await getTargetContext(tx, submission.targetId);
		await tx
			.update(evidenceTargets)
			.set({
				currentStatus: input.decision,
				version: sql`${evidenceTargets.version} + 1`,
				updatedAt: new Date()
			})
			.where(eq(evidenceTargets.id, submission.targetId));

		await recordAudit(tx, {
			actorUserId: input.reviewerId,
			serviceId: context.serviceId,
			entityType: 'review',
			entityId: submission.id,
			action: input.decision === 'approved' ? 'submission.approved' : 'submission.rejected',
			metadata: { targetId: submission.targetId, reason: reason || null }
		});

		// Notificaciones internas para los técnicos asignados, dentro de la transacción.
		const outbound = await createReviewNotifications(tx, {
			serviceId: context.serviceId,
			targetId: submission.targetId,
			submissionId: submission.id,
			reviewId,
			decision: input.decision,
			serviceName: context.serviceName,
			workName: context.workName,
			label: context.label,
			targetDeepLink: context.workId ? `/works/${context.workId}` : `/elements/${context.elementId}`
		});

		return {
			decision: input.decision,
			targetId: submission.targetId,
			serviceId: context.serviceId,
			outbound
		};
	});

	// Push best-effort, después del commit: nunca revierte la revisión.
	await dispatchPushToUsers(db, outcome.outbound.recipientIds, outcome.outbound.message).catch(
		(error) => console.error('[push] envío tras revisión falló', error)
	);

	return {
		decision: outcome.decision,
		targetId: outcome.targetId,
		serviceId: outcome.serviceId
	};
}

export interface HistoryEntry {
	id: string;
	sequenceNo: number;
	submittedAt: Date;
	submittedByName: string | null;
	photoCount: number;
	decision: 'approved' | 'rejected' | null;
	reviewedAt: Date | null;
	reviewerName: string | null;
	reason: string | null;
}

export async function getHistory(db: Database, targetId: string): Promise<HistoryEntry[]> {
	const submissions = await db
		.select({
			id: evidenceSubmissions.id,
			sequenceNo: evidenceSubmissions.sequenceNo,
			submittedAt: evidenceSubmissions.submittedAt,
			submittedByName: users.displayName
		})
		.from(evidenceSubmissions)
		.leftJoin(users, eq(users.id, evidenceSubmissions.submittedBy))
		.where(eq(evidenceSubmissions.targetId, targetId))
		.orderBy(desc(evidenceSubmissions.sequenceNo));

	if (submissions.length === 0) return [];
	const ids = submissions.map((submission) => submission.id);

	const counts = await db
		.select({
			submissionId: submissionPhotos.submissionId,
			value: sql<number>`cast(count(*) as int)`
		})
		.from(submissionPhotos)
		.where(inArray(submissionPhotos.submissionId, ids))
		.groupBy(submissionPhotos.submissionId);
	const countBySubmission = new Map(counts.map((row) => [row.submissionId, row.value]));

	const reviewRows = await db
		.select({
			submissionId: reviews.submissionId,
			decision: reviews.decision,
			reason: reviews.reason,
			reviewedAt: reviews.reviewedAt,
			reviewerName: users.displayName
		})
		.from(reviews)
		.leftJoin(users, eq(users.id, reviews.reviewerId))
		.where(inArray(reviews.submissionId, ids));
	const reviewBySubmission = new Map(reviewRows.map((row) => [row.submissionId, row]));

	return submissions.map((submission) => {
		const review = reviewBySubmission.get(submission.id);
		return {
			id: submission.id,
			sequenceNo: submission.sequenceNo,
			submittedAt: submission.submittedAt,
			submittedByName: submission.submittedByName,
			photoCount: countBySubmission.get(submission.id) ?? 0,
			decision: review?.decision ?? null,
			reviewedAt: review?.reviewedAt ?? null,
			reviewerName: review?.reviewerName ?? null,
			reason: review?.reason ?? null
		};
	});
}

export interface SubmissionPhotoView {
	id: string;
	photoId: string;
	groupKind: 'requirement' | 'additional';
	requirementNameSnapshot: string | null;
	groupSortOrder: number;
	photoSortOrder: number;
	uploadedByName: string | null;
	uploadedAt: Date | null;
}

export interface SubmissionDetail {
	submission: {
		id: string;
		sequenceNo: number;
		submittedAt: Date;
		submittedByName: string | null;
		targetNameSnapshot: string | null;
		workNameSnapshot: string | null;
		serviceNameSnapshot: string | null;
	};
	review: {
		decision: 'approved' | 'rejected';
		reason: string | null;
		reviewedAt: Date;
		reviewerName: string | null;
	} | null;
	photos: SubmissionPhotoView[];
	context: { targetId: string; serviceId: string; serviceName: string; label: string };
}

export async function getSubmissionDetail(
	db: Database,
	submissionId: string
): Promise<SubmissionDetail> {
	const [submission] = await db
		.select({
			id: evidenceSubmissions.id,
			targetId: evidenceSubmissions.targetId,
			sequenceNo: evidenceSubmissions.sequenceNo,
			submittedAt: evidenceSubmissions.submittedAt,
			submittedByName: users.displayName,
			targetNameSnapshot: evidenceSubmissions.targetNameSnapshot,
			workNameSnapshot: evidenceSubmissions.workNameSnapshot,
			serviceNameSnapshot: evidenceSubmissions.serviceNameSnapshot
		})
		.from(evidenceSubmissions)
		.leftJoin(users, eq(users.id, evidenceSubmissions.submittedBy))
		.where(eq(evidenceSubmissions.id, submissionId))
		.limit(1);
	if (!submission) throw new DomainError(404, 'Entrega no encontrada.');

	const context = await getTargetContext(db, submission.targetId);

	const [review] = await db
		.select({
			decision: reviews.decision,
			reason: reviews.reason,
			reviewedAt: reviews.reviewedAt,
			reviewerName: users.displayName
		})
		.from(reviews)
		.leftJoin(users, eq(users.id, reviews.reviewerId))
		.where(eq(reviews.submissionId, submissionId))
		.limit(1);

	const photoRows = await db
		.select({
			id: submissionPhotos.id,
			photoId: submissionPhotos.photoId,
			groupKind: submissionPhotos.groupKind,
			requirementNameSnapshot: submissionPhotos.requirementNameSnapshot,
			groupSortOrder: submissionPhotos.groupSortOrder,
			photoSortOrder: submissionPhotos.photoSortOrder,
			uploadedByName: users.displayName,
			uploadedAt: submissionPhotos.photoUploadedAtSnapshot
		})
		.from(submissionPhotos)
		.leftJoin(users, eq(users.id, submissionPhotos.photoUploadedBySnapshot))
		.where(eq(submissionPhotos.submissionId, submissionId))
		.orderBy(submissionPhotos.groupSortOrder, submissionPhotos.photoSortOrder);

	return {
		submission: {
			id: submission.id,
			sequenceNo: submission.sequenceNo,
			submittedAt: submission.submittedAt,
			submittedByName: submission.submittedByName,
			targetNameSnapshot: submission.targetNameSnapshot,
			workNameSnapshot: submission.workNameSnapshot,
			serviceNameSnapshot: submission.serviceNameSnapshot
		},
		review: review ?? null,
		photos: photoRows,
		context: {
			targetId: submission.targetId,
			serviceId: context.serviceId,
			serviceName: context.serviceName,
			label: context.label
		}
	};
}

export interface SubmissionContext {
	id: string;
	targetId: string;
	serviceId: string;
	sequenceNo: number;
	status: TargetStatus;
	workMode: WorkMode;
}

/** Contexto mínimo para autorizar la revisión de una entrega. */
export async function getSubmissionContext(
	db: Database,
	submissionId: string
): Promise<SubmissionContext> {
	const [submission] = await db
		.select({
			id: evidenceSubmissions.id,
			targetId: evidenceSubmissions.targetId,
			sequenceNo: evidenceSubmissions.sequenceNo
		})
		.from(evidenceSubmissions)
		.where(eq(evidenceSubmissions.id, submissionId))
		.limit(1);
	if (!submission) throw new DomainError(404, 'Entrega no encontrada.');

	const target = await getTargetContext(db, submission.targetId);
	return {
		id: submission.id,
		targetId: submission.targetId,
		serviceId: target.serviceId,
		sequenceNo: submission.sequenceNo,
		status: target.status,
		workMode: target.mode
	};
}

export interface RejectionInfo {
	reason: string;
	reviewedAt: Date;
	reviewerName: string | null;
}

/** Último rechazo del objetivo (para destacar el motivo en la evidencia actual). */
export async function getLatestRejection(
	db: Database,
	targetId: string
): Promise<RejectionInfo | null> {
	const [row] = await db
		.select({
			reason: reviews.reason,
			reviewedAt: reviews.reviewedAt,
			reviewerName: users.displayName
		})
		.from(reviews)
		.innerJoin(evidenceSubmissions, eq(evidenceSubmissions.id, reviews.submissionId))
		.leftJoin(users, eq(users.id, reviews.reviewerId))
		.where(and(eq(evidenceSubmissions.targetId, targetId), eq(reviews.decision, 'rejected')))
		.orderBy(desc(reviews.reviewedAt))
		.limit(1);
	if (!row || !row.reason) return null;
	return { reason: row.reason, reviewedAt: row.reviewedAt, reviewerName: row.reviewerName };
}

export interface PendingReview {
	submissionId: string;
	sequenceNo: number;
	submittedAt: Date;
	submittedByName: string | null;
	targetId: string;
	label: string;
	workName: string;
	serviceId: string;
	serviceName: string;
}

/**
 * Entregas pendientes de revisión dentro del ámbito del usuario: administrador
 * (todas) o supervisor (solo servicios asignados como supervisor).
 */
export async function listPendingReviews(
	db: Database,
	user: { id: string; role: string }
): Promise<PendingReview[]> {
	let allowedServiceIds: string[] | null = null;
	if (user.role !== 'admin') {
		const rows = await db
			.select({ serviceId: serviceAssignments.serviceId })
			.from(serviceAssignments)
			.where(
				and(
					eq(serviceAssignments.userId, user.id),
					eq(serviceAssignments.assignmentRole, 'supervisor'),
					isNull(serviceAssignments.revokedAt)
				)
			);
		allowedServiceIds = rows.map((row) => row.serviceId);
		if (allowedServiceIds.length === 0) return [];
	}

	const submissions = await db
		.select({
			id: evidenceSubmissions.id,
			targetId: evidenceSubmissions.targetId,
			sequenceNo: evidenceSubmissions.sequenceNo,
			submittedAt: evidenceSubmissions.submittedAt,
			submittedByName: users.displayName
		})
		.from(evidenceSubmissions)
		.innerJoin(evidenceTargets, eq(evidenceTargets.id, evidenceSubmissions.targetId))
		.leftJoin(users, eq(users.id, evidenceSubmissions.submittedBy))
		.where(
			and(
				eq(evidenceTargets.currentStatus, 'in_review'),
				eq(evidenceTargets.latestSubmissionId, evidenceSubmissions.id)
			)
		)
		.orderBy(desc(evidenceSubmissions.submittedAt));

	const result: PendingReview[] = [];
	for (const submission of submissions) {
		const context = await getTargetContext(db, submission.targetId);
		if (allowedServiceIds && !allowedServiceIds.includes(context.serviceId)) continue;
		result.push({
			submissionId: submission.id,
			sequenceNo: submission.sequenceNo,
			submittedAt: submission.submittedAt,
			submittedByName: submission.submittedByName,
			targetId: submission.targetId,
			label: context.label,
			workName: context.workName,
			serviceId: context.serviceId,
			serviceName: context.serviceName
		});
	}

	return result;
}
