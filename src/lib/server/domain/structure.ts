import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	catalogItems,
	elements,
	evidenceSubmissions,
	evidenceTargets,
	photoRequirements,
	photos,
	reviews,
	services,
	submissionPhotos,
	works
} from '#lib/server/db/schema';
import type { WorkMode } from '#lib/types';
import { recordAudit } from './audit';
import { DomainError } from './errors';
import { countNotificationsForTargets } from './notifications';

/**
 * Cambios estructurales posteriores (docs/producto/reglas.md): borrado explícito con impacto
 * y conversión `direct ↔ divided` sin entregas previas.
 */

function countInt() {
	return sql<number>`cast(count(*) as int)`;
}

// --- Recolección de objetivos -------------------------------------------------

async function targetIdsForElement(db: Database, elementId: string): Promise<string[]> {
	const rows = await db
		.select({ id: evidenceTargets.id })
		.from(evidenceTargets)
		.where(eq(evidenceTargets.elementId, elementId));
	return rows.map((row) => row.id);
}

async function targetIdsForWork(db: Database, workId: string): Promise<string[]> {
	const direct = await db
		.select({ id: evidenceTargets.id })
		.from(evidenceTargets)
		.where(eq(evidenceTargets.workId, workId));
	const viaElements = await db
		.select({ id: evidenceTargets.id })
		.from(evidenceTargets)
		.innerJoin(elements, eq(elements.id, evidenceTargets.elementId))
		.where(eq(elements.workId, workId));
	return [...direct, ...viaElements].map((row) => row.id);
}

async function targetIdsForService(db: Database, serviceId: string): Promise<string[]> {
	const workIds = await db
		.select({ id: works.id })
		.from(works)
		.where(eq(works.serviceId, serviceId));
	const ids = workIds.map((row) => row.id);
	if (ids.length === 0) return [];

	const direct = await db
		.select({ id: evidenceTargets.id })
		.from(evidenceTargets)
		.where(inArray(evidenceTargets.workId, ids));
	const viaElements = await db
		.select({ id: evidenceTargets.id })
		.from(evidenceTargets)
		.innerJoin(elements, eq(elements.id, evidenceTargets.elementId))
		.where(inArray(elements.workId, ids));
	return [...direct, ...viaElements].map((row) => row.id);
}

// --- Resumen de impacto --------------------------------------------------------

export interface StructuralImpact {
	works: number;
	elements: number;
	targets: number;
	submissions: number;
	photos: number;
	activePhotos: number;
	notifications: number;
}

async function impactForTargets(
	db: Database,
	targetIds: string[]
): Promise<Omit<StructuralImpact, 'works' | 'elements'>> {
	if (targetIds.length === 0) {
		return { targets: 0, submissions: 0, photos: 0, activePhotos: 0, notifications: 0 };
	}
	const [photoCount] = await db
		.select({ value: countInt() })
		.from(photos)
		.where(inArray(photos.targetId, targetIds));
	const [activeCount] = await db
		.select({ value: countInt() })
		.from(photos)
		.where(and(inArray(photos.targetId, targetIds), isNull(photos.removedAt)));
	const [submissionCount] = await db
		.select({ value: countInt() })
		.from(evidenceSubmissions)
		.where(inArray(evidenceSubmissions.targetId, targetIds));
	const notifications = await countNotificationsForTargets(db, targetIds);

	return {
		targets: targetIds.length,
		submissions: submissionCount?.value ?? 0,
		photos: photoCount?.value ?? 0,
		activePhotos: activeCount?.value ?? 0,
		notifications
	};
}

async function countChildren(
	db: Database,
	workIds: string[]
): Promise<{ works: number; elements: number }> {
	if (workIds.length === 0) return { works: 0, elements: 0 };
	const [elementCount] = await db
		.select({ value: countInt() })
		.from(elements)
		.where(inArray(elements.workId, workIds));
	return { works: workIds.length, elements: elementCount?.value ?? 0 };
}

export async function getElementImpact(
	db: Database,
	elementId: string
): Promise<StructuralImpact | null> {
	const [element] = await db
		.select({ id: elements.id })
		.from(elements)
		.where(eq(elements.id, elementId))
		.limit(1);
	if (!element) return null;
	const impact = await impactForTargets(db, await targetIdsForElement(db, elementId));
	return { works: 0, elements: 1, ...impact };
}

export async function getWorkImpact(
	db: Database,
	workId: string
): Promise<StructuralImpact | null> {
	const [work] = await db.select({ id: works.id }).from(works).where(eq(works.id, workId)).limit(1);
	if (!work) return null;
	const children = await countChildren(db, [workId]);
	const impact = await impactForTargets(db, await targetIdsForWork(db, workId));
	return { ...children, ...impact };
}

export async function getServiceImpact(
	db: Database,
	serviceId: string
): Promise<StructuralImpact | null> {
	const [service] = await db
		.select({ id: services.id })
		.from(services)
		.where(eq(services.id, serviceId))
		.limit(1);
	if (!service) return null;
	const workIds = (
		await db.select({ id: works.id }).from(works).where(eq(works.serviceId, serviceId))
	).map((row) => row.id);
	const children = await countChildren(db, workIds);
	const impact = await impactForTargets(db, await targetIdsForService(db, serviceId));
	return { ...children, ...impact };
}

// --- Borrado destructivo -------------------------------------------------------

export interface DeleteResult {
	orphanedPaths: string[];
	targets: number;
	submissions: number;
	photos: number;
}

/**
 * Elimina las filas dependientes de un conjunto de objetivos en **orden explícito**
 * para respetar el `RESTRICT` de `submission_photos.photo_id`. Devuelve las rutas
 * de los binarios que quedan sin referencia (limpieza diferida tras el commit).
 */
async function purgeTargets(tx: Database, targetIds: string[]): Promise<string[]> {
	if (targetIds.length === 0) return [];

	const photoRows = await tx
		.select({ storagePath: photos.storagePath, thumbnailPath: photos.thumbnailPath })
		.from(photos)
		.where(inArray(photos.targetId, targetIds));
	const paths = photoRows.flatMap((row) => [row.storagePath, row.thumbnailPath]);

	const submissionRows = await tx
		.select({ id: evidenceSubmissions.id })
		.from(evidenceSubmissions)
		.where(inArray(evidenceSubmissions.targetId, targetIds));
	const submissionIds = submissionRows.map((row) => row.id);

	if (submissionIds.length > 0) {
		await tx.delete(submissionPhotos).where(inArray(submissionPhotos.submissionId, submissionIds));
		await tx.delete(reviews).where(inArray(reviews.submissionId, submissionIds));
		await tx.delete(evidenceSubmissions).where(inArray(evidenceSubmissions.id, submissionIds));
	}

	await tx.delete(photoRequirements).where(inArray(photoRequirements.targetId, targetIds));
	await tx.delete(photos).where(inArray(photos.targetId, targetIds));
	await tx.delete(evidenceTargets).where(inArray(evidenceTargets.id, targetIds));

	return paths;
}

/** Borra un elemento y toda su evidencia (destructivo y explícito). */
export async function deleteElement(
	db: Database,
	input: { elementId: string; actorId: string }
): Promise<DeleteResult> {
	return db.transaction(async (tx) => {
		const [element] = await tx
			.select({ id: elements.id, serviceId: works.serviceId })
			.from(elements)
			.innerJoin(works, eq(works.id, elements.workId))
			.where(eq(elements.id, input.elementId))
			.limit(1);
		if (!element) throw new DomainError(404, 'Elemento no encontrado.');

		const targetIds = await targetIdsForElement(tx, element.id);
		const stats = await impactForTargets(tx, targetIds);
		const orphanedPaths = await purgeTargets(tx, targetIds);
		await tx.delete(elements).where(eq(elements.id, element.id));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: element.serviceId,
			entityType: 'element',
			entityId: element.id,
			action: 'element.deleted',
			metadata: stats
		});

		return {
			orphanedPaths,
			targets: stats.targets,
			submissions: stats.submissions,
			photos: stats.photos
		};
	});
}

/** Borra un trabajo entero con sus elementos y evidencia. */
export async function deleteWork(
	db: Database,
	input: { workId: string; actorId: string }
): Promise<DeleteResult> {
	return db.transaction(async (tx) => {
		const [work] = await tx
			.select({ id: works.id, serviceId: works.serviceId })
			.from(works)
			.where(eq(works.id, input.workId))
			.limit(1);
		if (!work) throw new DomainError(404, 'Trabajo no encontrado.');

		const targetIds = await targetIdsForWork(tx, work.id);
		const stats = await impactForTargets(tx, targetIds);
		const orphanedPaths = await purgeTargets(tx, targetIds);
		await tx.delete(works).where(eq(works.id, work.id));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: work.serviceId,
			entityType: 'work',
			entityId: work.id,
			action: 'work.deleted',
			metadata: stats
		});

		return {
			orphanedPaths,
			targets: stats.targets,
			submissions: stats.submissions,
			photos: stats.photos
		};
	});
}

/** Borra un servicio entero (trabajos, elementos, evidencia y asignaciones). */
export async function deleteService(
	db: Database,
	input: { serviceId: string; actorId: string }
): Promise<DeleteResult> {
	return db.transaction(async (tx) => {
		const [service] = await tx
			.select({ id: services.id, name: services.name })
			.from(services)
			.where(eq(services.id, input.serviceId))
			.limit(1);
		if (!service) throw new DomainError(404, 'Servicio no encontrado.');

		const targetIds = await targetIdsForService(tx, service.id);
		const stats = await impactForTargets(tx, targetIds);
		const orphanedPaths = await purgeTargets(tx, targetIds);
		// La cascada elimina trabajos, elementos y asignaciones.
		await tx.delete(services).where(eq(services.id, service.id));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: null,
			entityType: 'service',
			entityId: service.id,
			action: 'service.deleted',
			metadata: { name: service.name, ...stats }
		});

		return {
			orphanedPaths,
			targets: stats.targets,
			submissions: stats.submissions,
			photos: stats.photos
		};
	});
}

// --- Conversión direct ↔ divided ----------------------------------------------

export interface ModeConversionElement {
	name: string;
	catalogItemId?: string | null;
}

export interface ConvertDirectToDividedInput {
	workId: string;
	targetMode: 'divided';
	actorId: string;
	elements: ModeConversionElement[];
	/** Cada requisito existente debe indicar el índice del elemento destino. */
	requirements: { requirementId: string; elementIndex: number }[];
	/** Cada foto adicional vigente debe indicar el índice del elemento destino. */
	additionalPhotos: { photoId: string; elementIndex: number }[];
}

export interface ConvertDividedToDirectInput {
	workId: string;
	targetMode: 'direct';
	actorId: string;
	/** Confirmación explícita del conjunto completo de requisitos a reasignar. */
	requirements: string[];
	/** Confirmación explícita del conjunto completo de fotos a reasignar. */
	additionalPhotos: string[];
}

export type ConvertWorkModeInput = ConvertDirectToDividedInput | ConvertDividedToDirectInput;

export interface ConvertWorkModeResult {
	mode: WorkMode;
	elementCount: number;
}

export interface ConversionRequirement {
	id: string;
	name: string;
}

export interface ConversionPhoto {
	id: string;
}

export interface ConversionElement {
	id: string;
	name: string;
	requirements: ConversionRequirement[];
	additionalPhotos: ConversionPhoto[];
}

export interface WorkConversionData {
	workId: string;
	mode: WorkMode;
	hasSubmissions: boolean;
	direct: { requirements: ConversionRequirement[]; additionalPhotos: ConversionPhoto[] } | null;
	elements: ConversionElement[];
}

/** Datos para el asistente `direct ↔ divided` (solo informativo; no muta). */
export async function getWorkForConversion(
	db: Database,
	workId: string
): Promise<WorkConversionData> {
	const [work] = await db
		.select({ id: works.id, mode: works.mode })
		.from(works)
		.where(eq(works.id, workId))
		.limit(1);
	if (!work) throw new DomainError(404, 'Trabajo no encontrado.');

	const targetIds = await targetIdsForWork(db, work.id);
	let hasSubmissions = false;
	if (targetIds.length > 0) {
		const [row] = await db
			.select({ value: countInt() })
			.from(evidenceSubmissions)
			.where(inArray(evidenceSubmissions.targetId, targetIds));
		hasSubmissions = (row?.value ?? 0) > 0;
	}

	const requirements = targetIds.length
		? await db
				.select({
					id: photoRequirements.id,
					name: sql<string>`coalesce(${catalogItems.name}, ${photoRequirements.customName})`,
					targetId: photoRequirements.targetId
				})
				.from(photoRequirements)
				.leftJoin(catalogItems, eq(catalogItems.id, photoRequirements.catalogItemId))
				.where(inArray(photoRequirements.targetId, targetIds))
				.orderBy(asc(photoRequirements.sortOrder), asc(photoRequirements.createdAt))
		: [];
	const activePhotos = targetIds.length
		? await db
				.select({ id: photos.id, targetId: photos.targetId })
				.from(photos)
				.where(
					and(
						inArray(photos.targetId, targetIds),
						isNull(photos.requirementId),
						isNull(photos.removedAt)
					)
				)
		: [];

	const requirementsByTarget = new Map<string, ConversionRequirement[]>();
	for (const requirement of requirements) {
		const list = requirementsByTarget.get(requirement.targetId) ?? [];
		list.push({ id: requirement.id, name: requirement.name });
		requirementsByTarget.set(requirement.targetId, list);
	}
	const photosByTarget = new Map<string, ConversionPhoto[]>();
	for (const photo of activePhotos) {
		const list = photosByTarget.get(photo.targetId) ?? [];
		list.push({ id: photo.id });
		photosByTarget.set(photo.targetId, list);
	}

	if (work.mode === 'direct') {
		const [directTarget] = await db
			.select({ id: evidenceTargets.id })
			.from(evidenceTargets)
			.where(eq(evidenceTargets.workId, work.id))
			.limit(1);
		return {
			workId: work.id,
			mode: 'direct',
			hasSubmissions,
			direct: directTarget
				? {
						requirements: requirementsByTarget.get(directTarget.id) ?? [],
						additionalPhotos: photosByTarget.get(directTarget.id) ?? []
					}
				: { requirements: [], additionalPhotos: [] },
			elements: []
		};
	}

	const elementRows = await db
		.select({
			id: elements.id,
			name: sql<string>`coalesce(${catalogItems.name}, ${elements.customName})`,
			targetId: evidenceTargets.id
		})
		.from(elements)
		.innerJoin(evidenceTargets, eq(evidenceTargets.elementId, elements.id))
		.leftJoin(catalogItems, eq(catalogItems.id, elements.catalogItemId))
		.where(eq(elements.workId, work.id))
		.orderBy(asc(elements.sortOrder), asc(elements.createdAt));

	return {
		workId: work.id,
		mode: 'divided',
		hasSubmissions,
		direct: null,
		elements: elementRows.map((row) => ({
			id: row.id,
			name: row.name,
			requirements: requirementsByTarget.get(row.targetId) ?? [],
			additionalPhotos: photosByTarget.get(row.targetId) ?? []
		}))
	};
}

async function assertNoSubmissions(tx: Database, targetIds: string[]): Promise<void> {
	if (targetIds.length === 0) return;
	const [row] = await tx
		.select({ value: countInt() })
		.from(evidenceSubmissions)
		.where(inArray(evidenceSubmissions.targetId, targetIds));
	if ((row?.value ?? 0) > 0) {
		throw new DomainError(
			409,
			'No se puede convertir un trabajo que ya tiene entregas (aunque estén rechazadas).'
		);
	}
}

function assertSetEqual(actual: string[], expected: string[], message: string): void {
	const expectedSet = new Set(expected);
	const actualSet = new Set(actual);
	const same =
		expectedSet.size === actualSet.size && [...expectedSet].every((id) => actualSet.has(id));
	if (!same) throw new DomainError(409, message);
}

/**
 * Convierte el modo de un trabajo **solo si no existe ninguna entrega** en sus
 * objetivos. Requiere reasignar explícitamente todos los requisitos y fotos, o
 * cancela sin cambios (docs/producto/reglas.md, WORK-03/WORK-04).
 */
export async function convertWorkMode(
	db: Database,
	input: ConvertWorkModeInput
): Promise<ConvertWorkModeResult> {
	return db.transaction(async (tx) => {
		const [work] = await tx
			.select({ id: works.id, serviceId: works.serviceId, mode: works.mode })
			.from(works)
			.where(eq(works.id, input.workId))
			.for('update')
			.limit(1);
		if (!work) throw new DomainError(404, 'Trabajo no encontrado.');

		const targetIds = await targetIdsForWork(tx, work.id);
		await assertNoSubmissions(tx, targetIds);

		if (input.targetMode === work.mode) {
			throw new DomainError(409, 'El trabajo ya tiene ese modo.');
		}

		const result =
			input.targetMode === 'divided'
				? await convertToDivided(tx, work, input)
				: await convertToDirect(tx, work, input);

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: work.serviceId,
			entityType: 'work',
			entityId: work.id,
			action: 'work.mode_converted',
			metadata: { from: work.mode, to: input.targetMode, elements: result.elementCount }
		});

		return result;
	});
}

async function convertToDivided(
	tx: Database,
	work: { id: string; serviceId: string; mode: WorkMode },
	input: ConvertDirectToDividedInput
): Promise<ConvertWorkModeResult> {
	const [directTarget] = await tx
		.select({ id: evidenceTargets.id })
		.from(evidenceTargets)
		.where(eq(evidenceTargets.workId, work.id))
		.limit(1);
	if (!directTarget) throw new DomainError(409, 'El trabajo directo no tiene evidencia asociada.');

	const existingRequirements = await tx
		.select({ id: photoRequirements.id })
		.from(photoRequirements)
		.where(eq(photoRequirements.targetId, directTarget.id))
		.orderBy(asc(photoRequirements.sortOrder), asc(photoRequirements.createdAt));
	const existingPhotos = await tx
		.select({ id: photos.id })
		.from(photos)
		.where(
			and(
				eq(photos.targetId, directTarget.id),
				isNull(photos.removedAt),
				isNull(photos.requirementId)
			)
		);

	if (input.elements.length === 0) {
		throw new DomainError(400, 'Añade al menos un elemento para dividir el trabajo.');
	}

	const requirementIds = existingRequirements.map((row) => row.id);
	assertSetEqual(
		input.requirements.map((row) => row.requirementId),
		requirementIds,
		'Debes reasignar todos los requisitos o cancelar la conversión.'
	);
	const photoIds = existingPhotos.map((row) => row.id);
	assertSetEqual(
		input.additionalPhotos.map((row) => row.photoId),
		photoIds,
		'Debes reasignar todas las fotografías adicionales o cancelar la conversión.'
	);

	const requirementTarget = new Map(
		input.requirements.map((row) => [row.requirementId, row.elementIndex])
	);
	const photoTarget = new Map(input.additionalPhotos.map((row) => [row.photoId, row.elementIndex]));

	// Crea elementos y sus objetivos.
	const targetByIndex: string[] = [];
	for (let index = 0; index < input.elements.length; index += 1) {
		const element = input.elements[index];
		const name = element.name.trim();
		if (!name) throw new DomainError(400, 'Cada elemento necesita un nombre.');
		const [created] = await tx
			.insert(elements)
			.values({
				workId: work.id,
				catalogItemId: element.catalogItemId || null,
				customName: element.catalogItemId ? null : name,
				sortOrder: index
			})
			.returning({ id: elements.id });
		const [target] = await tx
			.insert(evidenceTargets)
			.values({ elementId: created.id })
			.returning({ id: evidenceTargets.id });
		targetByIndex.push(target.id);
	}

	// Reasigna requisitos y sus fotos.
	for (const requirement of existingRequirements) {
		const index = requirementTarget.get(requirement.id) as number;
		if (!Number.isInteger(index) || index < 0 || index >= targetByIndex.length) {
			throw new DomainError(400, 'Requisito asignado a un elemento inexistente.');
		}
		await tx
			.update(photoRequirements)
			.set({ targetId: targetByIndex[index] })
			.where(eq(photoRequirements.id, requirement.id));
		await tx
			.update(photos)
			.set({ targetId: targetByIndex[index] })
			.where(eq(photos.requirementId, requirement.id));
	}

	// Reasigna fotos adicionales.
	for (const photo of existingPhotos) {
		const index = photoTarget.get(photo.id) as number;
		if (!Number.isInteger(index) || index < 0 || index >= targetByIndex.length) {
			throw new DomainError(400, 'Fotografía adicional asignada a un elemento inexistente.');
		}
		await tx.update(photos).set({ targetId: targetByIndex[index] }).where(eq(photos.id, photo.id));
	}

	// Elimina el objetivo directo (ya sin evidencia) y fija el modo.
	await tx.delete(evidenceTargets).where(eq(evidenceTargets.id, directTarget.id));
	await tx
		.update(works)
		.set({ mode: 'divided', updatedAt: new Date() })
		.where(eq(works.id, work.id));

	return { mode: 'divided', elementCount: targetByIndex.length };
}

async function convertToDirect(
	tx: Database,
	work: { id: string; serviceId: string; mode: WorkMode },
	input: ConvertDividedToDirectInput
): Promise<ConvertWorkModeResult> {
	const elementRows = await tx
		.select({ id: elements.id })
		.from(elements)
		.where(eq(elements.workId, work.id))
		.orderBy(asc(elements.sortOrder), asc(elements.createdAt));
	if (elementRows.length === 0) {
		// Un trabajo dividido sin elementos: solo cambia el modo.
		await tx.insert(evidenceTargets).values({ workId: work.id });
		await tx
			.update(works)
			.set({ mode: 'direct', updatedAt: new Date() })
			.where(eq(works.id, work.id));
		return { mode: 'direct', elementCount: 0 };
	}

	const elementIds = elementRows.map((row) => row.id);
	const elementTargets = await tx
		.select({ id: evidenceTargets.id })
		.from(evidenceTargets)
		.where(inArray(evidenceTargets.elementId, elementIds));
	const elementTargetIds = elementTargets.map((row) => row.id);

	const requirements = await tx
		.select({ id: photoRequirements.id })
		.from(photoRequirements)
		.where(inArray(photoRequirements.targetId, elementTargetIds));
	const activePhotos = await tx
		.select({ id: photos.id })
		.from(photos)
		.where(
			and(
				inArray(photos.targetId, elementTargetIds),
				isNull(photos.removedAt),
				isNull(photos.requirementId)
			)
		);

	assertSetEqual(
		input.requirements,
		requirements.map((row) => row.id),
		'Debes reasignar todos los requisitos de los elementos o cancelar la conversión.'
	);
	assertSetEqual(
		input.additionalPhotos,
		activePhotos.map((row) => row.id),
		'Debes reasignar todas las fotografías adicionales o cancelar la conversión.'
	);

	const [directTarget] = await tx
		.insert(evidenceTargets)
		.values({ workId: work.id })
		.returning({ id: evidenceTargets.id });

	await tx
		.update(photoRequirements)
		.set({ targetId: directTarget.id })
		.where(inArray(photoRequirements.targetId, elementTargetIds));
	await tx
		.update(photos)
		.set({ targetId: directTarget.id })
		.where(inArray(photos.targetId, elementTargetIds));

	// Elimina los objetivos de los elementos (ya sin evidencia) y los elementos.
	await tx.delete(evidenceTargets).where(inArray(evidenceTargets.id, elementTargetIds));
	await tx.delete(elements).where(inArray(elements.id, elementIds));
	await tx
		.update(works)
		.set({ mode: 'direct', updatedAt: new Date() })
		.where(eq(works.id, work.id));

	return { mode: 'direct', elementCount: 0 };
}
