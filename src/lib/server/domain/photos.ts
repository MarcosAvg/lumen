import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	evidenceTargets,
	photoRequirements,
	photos,
	submissionPhotos,
	users
} from '#lib/server/db/schema';
import { ImageError, processImage } from '#lib/server/storage/images';
import type { Storage } from '#lib/server/storage/storage';
import { recordAudit } from './audit';
import { DomainError } from './errors';
import { listRequirements, type RequirementRow } from './requirements';
import { getTargetContext, isEditableStatus, type TargetContext } from './targets';

async function displayNameOf(db: Database, userId: string | null): Promise<string | null> {
	if (!userId) return null;
	const [row] = await db
		.select({ name: users.displayName })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row?.name ?? null;
}

export type PhotoProcessingStatus = 'processing' | 'ready' | 'failed';

export interface PhotoRow {
	id: string;
	requirementId: string | null;
	sortOrder: number;
	mimeType: string;
	sizeBytes: number;
	width: number | null;
	height: number | null;
	uploadedBy: string | null;
	uploadedAt: Date;
}

export interface EvidenceView {
	target: TargetContext;
	requirements: RequirementRow[];
	photos: PhotoRow[];
}

/** Condición de un grupo de evidencia: un requisito concreto o Adicionales (`null`). */
function groupWhere(targetId: string, requirementId: string | null) {
	return requirementId
		? and(
				eq(photos.targetId, targetId),
				eq(photos.requirementId, requirementId),
				isNull(photos.removedAt)
			)
		: and(eq(photos.targetId, targetId), isNull(photos.requirementId), isNull(photos.removedAt));
}

export async function loadEvidence(db: Database, targetId: string): Promise<EvidenceView> {
	const target = await getTargetContext(db, targetId);
	const requirements = await listRequirements(db, targetId);
	const photoRows = await db
		.select({
			id: photos.id,
			requirementId: photos.requirementId,
			sortOrder: photos.sortOrder,
			mimeType: photos.mimeType,
			sizeBytes: photos.sizeBytes,
			width: photos.width,
			height: photos.height,
			uploadedBy: photos.uploadedBy,
			uploadedAt: photos.uploadedAt
		})
		.from(photos)
		.where(
			and(
				eq(photos.targetId, targetId),
				isNull(photos.removedAt),
				eq(photos.processingStatus, 'ready')
			)
		)
		.orderBy(asc(photos.sortOrder), asc(photos.uploadedAt));

	return { target, requirements, photos: photoRows };
}

export interface AppendPhotoInput {
	targetId: string;
	requirementId: string | null;
	buffer: Buffer;
	userId: string;
	maxDimension: number;
	thumbDimension: number;
	maxPixels?: number;
}

/**
 * Añade una fotografía: procesa la imagen (validación por contenido, orientación,
 * sin metadatos, límites) y la persiste con su miniatura. El **append** es seguro
 * en concurrencia: no exige versión, pero serializa con un bloqueo de fila del
 * objetivo para asignar una posición única y avanzar la versión.
 */
export async function appendPhoto(
	db: Database,
	storage: Storage,
	input: AppendPhotoInput
): Promise<{ photo: PhotoRow; version: number }> {
	const target = await getTargetContext(db, input.targetId);
	if (!isEditableStatus(target.status)) {
		throw new DomainError(409, 'La evidencia no es editable en su estado actual.');
	}

	if (input.requirementId) {
		const [requirement] = await db
			.select({ id: photoRequirements.id })
			.from(photoRequirements)
			.where(
				and(
					eq(photoRequirements.id, input.requirementId),
					eq(photoRequirements.targetId, input.targetId)
				)
			)
			.limit(1);
		if (!requirement) throw new DomainError(404, 'Requisito no encontrado en este objetivo.');
	}

	let processed;
	try {
		processed = await processImage(input.buffer, {
			maxDimension: input.maxDimension,
			thumbDimension: input.thumbDimension,
			maxPixels: input.maxPixels
		});
	} catch (error) {
		if (error instanceof ImageError) throw new DomainError(error.status, error.message);
		throw error;
	}

	const id = randomUUID();
	const objectRel = storage.objectRelPath(id);
	const thumbRel = storage.thumbRelPath(id);

	try {
		try {
			await storage.save(objectRel, processed.jpeg);
			await storage.save(thumbRel, processed.thumbnail);
		} catch (error) {
			console.error('[storage] No se pudo guardar la fotografía.', error);
			throw new DomainError(
				503,
				'No se pudo guardar la fotografía. Revisa el almacenamiento del servidor.'
			);
		}

		return await db.transaction(async (tx) => {
			const [locked] = await tx
				.select({ version: evidenceTargets.version, status: evidenceTargets.currentStatus })
				.from(evidenceTargets)
				.where(eq(evidenceTargets.id, input.targetId))
				.for('update');
			if (!locked) throw new DomainError(404, 'Evidencia no encontrada.');
			if (!isEditableStatus(locked.status)) {
				throw new DomainError(409, 'La evidencia no es editable en su estado actual.');
			}

			const [next] = await tx
				.select({ value: sql<number>`coalesce(max(${photos.sortOrder}), -1) + 1` })
				.from(photos)
				.where(groupWhere(input.targetId, input.requirementId));

			const [created] = await tx
				.insert(photos)
				.values({
					id,
					targetId: input.targetId,
					requirementId: input.requirementId,
					sortOrder: next?.value ?? 0,
					storagePath: objectRel,
					thumbnailPath: thumbRel,
					mimeType: 'image/jpeg',
					sizeBytes: processed.jpeg.length,
					width: processed.width,
					height: processed.height,
					checksum: processed.checksum,
					processingStatus: 'ready',
					uploadedBy: input.userId,
					uploadedByName: await displayNameOf(tx, input.userId)
				})
				.returning({
					id: photos.id,
					requirementId: photos.requirementId,
					sortOrder: photos.sortOrder,
					mimeType: photos.mimeType,
					sizeBytes: photos.sizeBytes,
					width: photos.width,
					height: photos.height,
					uploadedBy: photos.uploadedBy,
					uploadedAt: photos.uploadedAt
				});

			const [updated] = await tx
				.update(evidenceTargets)
				.set({
					version: sql`${evidenceTargets.version} + 1`,
					currentStatus: sql`(case when ${evidenceTargets.currentStatus} = 'pending' then 'in_progress' else ${evidenceTargets.currentStatus} end)::target_status`,
					updatedAt: new Date()
				})
				.where(eq(evidenceTargets.id, input.targetId))
				.returning({ version: evidenceTargets.version });

			await recordAudit(tx, {
				actorUserId: input.userId,
				serviceId: target.serviceId,
				entityType: 'photo',
				entityId: id,
				action: 'photo.uploaded',
				metadata: { targetId: input.targetId, requirementId: input.requirementId }
			});

			return { photo: created, version: updated.version };
		});
	} catch (error) {
		// Evita dejar binarios huérfanos si la persistencia falla.
		await storage.remove(objectRel);
		await storage.remove(thumbRel);
		throw error;
	}
}

export interface RemovePhotoInput {
	targetId: string;
	photoId: string;
	expectedVersion: number;
	userId: string;
}

/** Retiro lógico (soft removal): la foto no se borra físicamente. */
export async function removePhoto(
	db: Database,
	input: RemovePhotoInput
): Promise<{ version: number }> {
	return db.transaction(async (tx) => {
		const [locked] = await tx
			.select({ version: evidenceTargets.version, status: evidenceTargets.currentStatus })
			.from(evidenceTargets)
			.where(eq(evidenceTargets.id, input.targetId))
			.for('update');
		if (!locked) throw new DomainError(404, 'Evidencia no encontrada.');
		if (!isEditableStatus(locked.status)) {
			throw new DomainError(409, 'La evidencia no es editable en su estado actual.');
		}
		if (locked.version !== input.expectedVersion) {
			throw new DomainError(409, 'Otro usuario modificó esta evidencia. Actualiza para continuar.');
		}

		const [removed] = await tx
			.update(photos)
			.set({
				removedAt: new Date(),
				removedBy: input.userId,
				removedByName: await displayNameOf(tx, input.userId)
			})
			.where(
				and(
					eq(photos.id, input.photoId),
					eq(photos.targetId, input.targetId),
					isNull(photos.removedAt)
				)
			)
			.returning({ id: photos.id });
		if (!removed) throw new DomainError(404, 'Fotografía no encontrada en la evidencia vigente.');

		const [updated] = await tx
			.update(evidenceTargets)
			.set({ version: sql`${evidenceTargets.version} + 1`, updatedAt: new Date() })
			.where(eq(evidenceTargets.id, input.targetId))
			.returning({ version: evidenceTargets.version });

		await recordAudit(tx, {
			actorUserId: input.userId,
			entityType: 'photo',
			entityId: input.photoId,
			action: 'photo.removed',
			metadata: { targetId: input.targetId }
		});

		return { version: updated.version };
	});
}

export interface ReorderPhotosInput {
	targetId: string;
	requirementId: string | null;
	orderedIds: string[];
	expectedVersion: number;
	userId: string;
}

/** Reordena solo dentro de un grupo; exige el conjunto exacto de fotos vigentes. */
export async function reorderPhotos(
	db: Database,
	input: ReorderPhotosInput
): Promise<{ version: number }> {
	return db.transaction(async (tx) => {
		const [locked] = await tx
			.select({ version: evidenceTargets.version, status: evidenceTargets.currentStatus })
			.from(evidenceTargets)
			.where(eq(evidenceTargets.id, input.targetId))
			.for('update');
		if (!locked) throw new DomainError(404, 'Evidencia no encontrada.');
		if (!isEditableStatus(locked.status)) {
			throw new DomainError(409, 'La evidencia no es editable en su estado actual.');
		}
		if (locked.version !== input.expectedVersion) {
			throw new DomainError(409, 'Otro usuario modificó esta evidencia. Actualiza para continuar.');
		}

		const current = await tx
			.select({ id: photos.id })
			.from(photos)
			.where(groupWhere(input.targetId, input.requirementId));
		const currentIds = new Set(current.map((row) => row.id));

		if (
			currentIds.size !== input.orderedIds.length ||
			!input.orderedIds.every((id) => currentIds.has(id))
		) {
			throw new DomainError(409, 'El orden no coincide con las fotografías del grupo.');
		}

		let order = 0;
		for (const id of input.orderedIds) {
			await tx.update(photos).set({ sortOrder: order }).where(eq(photos.id, id));
			order += 1;
		}

		const [updated] = await tx
			.update(evidenceTargets)
			.set({ version: sql`${evidenceTargets.version} + 1`, updatedAt: new Date() })
			.where(eq(evidenceTargets.id, input.targetId))
			.returning({ version: evidenceTargets.version });

		await recordAudit(tx, {
			actorUserId: input.userId,
			entityType: 'photo',
			entityId: input.targetId,
			action: 'photos.reordered',
			metadata: { requirementId: input.requirementId }
		});

		return { version: updated.version };
	});
}

export interface PhotoAccessContext {
	id: string;
	targetId: string;
	serviceId: string;
	storagePath: string;
	thumbnailPath: string;
	mimeType: string;
	processingStatus: PhotoProcessingStatus;
	removedAt: Date | null;
	/** La foto forma parte de alguna entrega (histórica), aunque se retirara del borrador. */
	historicalReference: boolean;
}

/** Contexto de una foto para autorizar su descarga/miniatura. */
export async function getPhotoAccessContext(
	db: Database,
	photoId: string
): Promise<PhotoAccessContext> {
	const [photo] = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
	if (!photo) throw new DomainError(404, 'Fotografía no encontrada.');

	const target = await getTargetContext(db, photo.targetId);

	// Una foto retirada del borrador sigue siendo accesible si quedó congelada en
	// una entrega: protege la evidencia histórica (docs/referencia/pruebas.md).
	const [link] = await db
		.select({ id: submissionPhotos.id })
		.from(submissionPhotos)
		.where(eq(submissionPhotos.photoId, photo.id))
		.limit(1);

	return {
		id: photo.id,
		targetId: photo.targetId,
		serviceId: target.serviceId,
		storagePath: photo.storagePath,
		thumbnailPath: photo.thumbnailPath,
		mimeType: photo.mimeType,
		processingStatus: photo.processingStatus,
		removedAt: photo.removedAt,
		historicalReference: Boolean(link)
	};
}

/**
 * Disponibilidad de un binario: solo las fotos `ready` de la evidencia vigente o
 * las retiradas que forman parte de una entrega histórica.
 */
export function isPhotoAvailable(
	photo: Pick<PhotoAccessContext, 'processingStatus' | 'removedAt' | 'historicalReference'>
): boolean {
	if (photo.processingStatus !== 'ready') return false;
	return !photo.removedAt || photo.historicalReference;
}
