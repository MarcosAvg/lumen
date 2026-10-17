import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	contractAssignments,
	evidenceSubmissions,
	evidenceTargets,
	photos,
	reviews,
	serviceAssignments,
	services,
	submissionPhotos,
	users
} from '#lib/server/db/schema';
import type { TargetStatus, WorkMode } from '#lib/types';
import { missingRequirementMessage, submitReadiness } from '#lib/evidence/submit-readiness';
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

/** Nombre visible del usuario, o `null` si no existe. */
async function displayNameOf(db: Database, userId: string | null): Promise<string | null> {
	if (!userId) return null;
	const [row] = await db
		.select({ name: users.displayName })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row?.name ?? null;
}

/** Mapa `userId -> displayName` para congelar varios autores de una vez. */
async function displayNamesOf(db: Database, ids: string[]): Promise<Map<string, string>> {
	const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
	if (unique.length === 0) return new Map();
	const rows = await db
		.select({ id: users.id, name: users.displayName })
		.from(users)
		.where(inArray(users.id, unique));
	return new Map(rows.map((row) => [row.id, row.name]));
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

		const readiness = submitReadiness(requirements, photoRows);
		if (!readiness.ready) {
			throw new DomainError(409, missingRequirementMessage(readiness));
		}

		const context = await getTargetContext(tx, input.targetId);
		const submitterName = await displayNameOf(tx, input.userId);
		const authorNames = await displayNamesOf(
			tx,
			photoRows.map((photo) => photo.uploadedBy).filter((id): id is string => Boolean(id))
		);

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
				submittedByName: submitterName,
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
					photoUploadedByName: photo.uploadedBy
						? (authorNames.get(photo.uploadedBy) ?? null)
						: null,
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
				photoUploadedByName: photo.uploadedBy ? (authorNames.get(photo.uploadedBy) ?? null) : null,
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
			label: context.label,
			actorId: input.userId
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
					reviewerName: await displayNameOf(tx, input.reviewerId),
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
			targetDeepLink: context.workId
				? `/works/${context.workId}`
				: `/elements/${context.elementId}`,
			actorId: input.reviewerId
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
			submittedByName: sql<
				string | null
			>`coalesce(${evidenceSubmissions.submittedByName}, ${users.displayName})`
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
			submittedByName: sql<
				string | null
			>`coalesce(${evidenceSubmissions.submittedByName}, ${users.displayName})`,
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
			reviewerName: sql<string | null>`coalesce(${reviews.reviewerName}, ${users.displayName})`
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
			uploadedByName: sql<
				string | null
			>`coalesce(${submissionPhotos.photoUploadedByName}, ${users.displayName})`,
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
			reviewerName: sql<string | null>`coalesce(${reviews.reviewerName}, ${users.displayName})`
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

export interface PendingReviewFilters {
	serviceId?: string | null;
	from?: Date | null;
	to?: Date | null;
	q?: string | null;
	limit?: number;
	offset?: number;
}

export interface PendingReviewPage {
	items: PendingReview[];
	total: number;
}

/**
 * Entregas pendientes de revisión dentro del ámbito del usuario: administrador
 * (todas) o supervisor (solo servicios asignados como supervisor). Admite filtros
 * por servicio, rango de fechas y texto, con paginación en servidor.
 */
export async function listPendingReviews(
	db: Database,
	user: { id: string; role: string },
	filters: PendingReviewFilters = {}
): Promise<PendingReviewPage> {
	let allowedServiceIds: string[] | null = null;
	if (user.role !== 'admin') {
		const rows = await db
			.select({ serviceId: services.id })
			.from(services)
			.innerJoin(serviceAssignments, eq(serviceAssignments.serviceId, services.id))
			.innerJoin(
				contractAssignments,
				and(
					eq(contractAssignments.contractId, services.contractId),
					eq(contractAssignments.userId, serviceAssignments.userId),
					eq(contractAssignments.assignmentRole, serviceAssignments.assignmentRole),
					isNull(contractAssignments.revokedAt)
				)
			)
			.where(
				and(
					eq(serviceAssignments.userId, user.id),
					eq(serviceAssignments.assignmentRole, 'supervisor'),
					isNull(serviceAssignments.revokedAt)
				)
			);
		allowedServiceIds = [...new Set(rows.map((row) => row.serviceId))];
		if (allowedServiceIds.length === 0) return { items: [], total: 0 };
	}

	const conditions = [
		eq(evidenceTargets.currentStatus, 'in_review'),
		eq(evidenceTargets.latestSubmissionId, evidenceSubmissions.id)
	];
	if (filters.from) conditions.push(gte(evidenceSubmissions.submittedAt, filters.from));
	if (filters.to) conditions.push(lte(evidenceSubmissions.submittedAt, filters.to));

	const submissions = await db
		.select({
			id: evidenceSubmissions.id,
			targetId: evidenceSubmissions.targetId,
			sequenceNo: evidenceSubmissions.sequenceNo,
			submittedAt: evidenceSubmissions.submittedAt,
			submittedByName: sql<
				string | null
			>`coalesce(${evidenceSubmissions.submittedByName}, ${users.displayName})`
		})
		.from(evidenceSubmissions)
		.innerJoin(evidenceTargets, eq(evidenceTargets.id, evidenceSubmissions.targetId))
		.leftJoin(users, eq(users.id, evidenceSubmissions.submittedBy))
		.where(and(...conditions))
		.orderBy(desc(evidenceSubmissions.submittedAt));

	const query = filters.q?.trim().toLowerCase() ?? '';
	const matched: PendingReview[] = [];
	for (const submission of submissions) {
		const context = await getTargetContext(db, submission.targetId);
		if (allowedServiceIds && !allowedServiceIds.includes(context.serviceId)) continue;
		if (filters.serviceId && context.serviceId !== filters.serviceId) continue;
		if (query) {
			const haystack = `${context.serviceName} ${context.workName} ${context.label}`.toLowerCase();
			if (!haystack.includes(query)) continue;
		}
		matched.push({
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

	const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
	const offset = Math.max(filters.offset ?? 0, 0);
	return { items: matched.slice(offset, offset + limit), total: matched.length };
}
