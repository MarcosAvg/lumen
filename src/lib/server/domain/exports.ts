import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import {
	catalogItems,
	elements,
	evidenceSubmissions,
	evidenceTargets,
	photos,
	reviews,
	services,
	submissionPhotos,
	users,
	works
} from '#lib/server/db/schema';
import type { TargetStatus, WorkMode } from '#lib/types';
import { ADDITIONAL_GROUP_LABEL, NO_REQUIREMENT_GROUP_LABEL } from '#lib/types';
import { toCsv } from '#lib/server/exports/csv';
import { NameRegistry, sanitizeSegment } from '#lib/server/exports/names';
import { DomainError } from './errors';
import { getTargetContext } from './targets';

/**
 * Exportaciones (docs/06 §10): ZIP de entrega desde snapshot, ZIP de servicio
 * con solo entregas aprobadas y `resumen.csv`, y CSV administrativo. Solo se
 * generan **listas de entradas**; el streaming lo hace la capa HTTP.
 */

export interface ArchiveFile {
	/** Ruta dentro del ZIP (POSIX, sin traversal). */
	path: string;
	/** Ruta relativa del binario dentro del almacenamiento. */
	storagePath: string;
}

export interface SubmissionArchive {
	submissionId: string;
	sequenceNo: number;
	serviceId: string;
	fileName: string;
	files: ArchiveFile[];
}

export interface ServiceArchive {
	serviceId: string;
	fileName: string;
	files: ArchiveFile[];
	resumen: string;
}

export interface ServiceCsv {
	fileName: string;
	content: string;
}

const STATUS_LABEL: Record<TargetStatus, string> = {
	pending: 'Pendiente',
	in_progress: 'En progreso',
	in_review: 'En revisión',
	rejected: 'Rechazado',
	approved: 'Aprobado'
};

interface SubmissionPhotoRow {
	groupOrder: number;
	photoOrder: number;
	groupKind: 'requirement' | 'additional';
	requirementName: string | null;
	storagePath: string;
}

async function loadSubmissionPhotos(
	db: Database,
	submissionIds: string[]
): Promise<Map<string, SubmissionPhotoRow[]>> {
	const bySubmission = new Map<string, SubmissionPhotoRow[]>();
	if (submissionIds.length === 0) return bySubmission;

	const rows = await db
		.select({
			submissionId: submissionPhotos.submissionId,
			groupOrder: submissionPhotos.groupSortOrder,
			photoOrder: submissionPhotos.photoSortOrder,
			groupKind: submissionPhotos.groupKind,
			requirementName: submissionPhotos.requirementNameSnapshot,
			storagePath: photos.storagePath
		})
		.from(submissionPhotos)
		.innerJoin(photos, eq(photos.id, submissionPhotos.photoId))
		.where(inArray(submissionPhotos.submissionId, submissionIds))
		.orderBy(asc(submissionPhotos.groupSortOrder), asc(submissionPhotos.photoSortOrder));

	for (const row of rows) {
		const list = bySubmission.get(row.submissionId) ?? [];
		list.push({
			groupOrder: row.groupOrder,
			photoOrder: row.photoOrder,
			groupKind: row.groupKind,
			requirementName: row.requirementName,
			storagePath: row.storagePath
		});
		bySubmission.set(row.submissionId, list);
	}
	return bySubmission;
}

/** Etiqueta de carpeta para el grupo sin requisito según haya o no grupos de requisito. */
function additionalFolderLabel(rows: SubmissionPhotoRow[]): string {
	return rows.some((row) => row.requirementName !== null)
		? ADDITIONAL_GROUP_LABEL
		: NO_REQUIREMENT_GROUP_LABEL;
}

/** Construye las rutas de un ZIP a partir de las fotos de una entrega. */
function photosToFiles(
	parent: string,
	rows: SubmissionPhotoRow[],
	submissionKey: string,
	additionalLabel: string
): ArchiveFile[] {
	const files: ArchiveFile[] = [];
	const registries = new Map<string, NameRegistry>();
	let currentGroup = Number.NaN;
	let folder = '';
	let indexInGroup = 0;

	for (const row of rows) {
		if (row.groupOrder !== currentGroup) {
			currentGroup = row.groupOrder;
			const registry = getRegistry(registries, parent);
			const name = row.requirementName ?? additionalLabel;
			folder = registry.unique(name, `${submissionKey}-${row.groupOrder}`);
			indexInGroup = 0;
		}
		indexInGroup += 1;
		const file = `${String(indexInGroup).padStart(2, '0')}.jpg`;
		files.push({ path: `${parent}/${folder}/${file}`, storagePath: row.storagePath });
	}
	return files;
}

function getRegistry(map: Map<string, NameRegistry>, parent: string): NameRegistry {
	const existing = map.get(parent);
	if (existing) return existing;
	const created = new NameRegistry();
	map.set(parent, created);
	return created;
}

export async function getSubmissionArchive(
	db: Database,
	submissionId: string
): Promise<SubmissionArchive> {
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

	const context = await getTargetContext(db, submission.targetId);
	const photosBySubmission = await loadSubmissionPhotos(db, [submission.id]);
	const rows = photosBySubmission.get(submission.id) ?? [];

	return {
		submissionId: submission.id,
		sequenceNo: submission.sequenceNo,
		serviceId: context.serviceId,
		fileName: `entrega-${submission.sequenceNo}.zip`,
		files: photosToFiles(
			`entrega-${submission.sequenceNo}`,
			rows,
			submission.id,
			additionalFolderLabel(rows)
		)
	};
}

/** Última entrega **aprobada** por objetivo (usada por el ZIP de servicio). */
async function latestApprovedSubmissions(
	db: Database,
	targetIds: string[]
): Promise<Map<string, { submissionId: string; sequenceNo: number }>> {
	const result = new Map<string, { submissionId: string; sequenceNo: number }>();
	if (targetIds.length === 0) return result;

	const rows = await db
		.select({
			targetId: evidenceSubmissions.targetId,
			submissionId: evidenceSubmissions.id,
			sequenceNo: evidenceSubmissions.sequenceNo,
			decision: reviews.decision
		})
		.from(evidenceSubmissions)
		.innerJoin(reviews, eq(reviews.submissionId, evidenceSubmissions.id))
		.where(and(inArray(evidenceSubmissions.targetId, targetIds), eq(reviews.decision, 'approved')))
		.orderBy(asc(evidenceSubmissions.sequenceNo));

	for (const row of rows) {
		result.set(row.targetId, { submissionId: row.submissionId, sequenceNo: row.sequenceNo });
	}
	return result;
}

export async function getServiceArchive(db: Database, serviceId: string): Promise<ServiceArchive> {
	const [service] = await db
		.select({ id: services.id, name: services.name })
		.from(services)
		.where(eq(services.id, serviceId))
		.limit(1);
	if (!service) throw new DomainError(404, 'Servicio no encontrado.');

	const workCatalog = alias(catalogItems, 'work_catalog');
	const elementCatalog = alias(catalogItems, 'element_catalog');

	const workRows = await db
		.select({
			id: works.id,
			mode: works.mode,
			label: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`
		})
		.from(works)
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.where(eq(works.serviceId, serviceId))
		.orderBy(asc(works.sortOrder), asc(works.createdAt));

	const workIds = workRows.map((row) => row.id);
	const elementRows = workIds.length
		? await db
				.select({
					id: elements.id,
					workId: elements.workId,
					label: sql<string>`coalesce(${elementCatalog.name}, ${elements.customName})`
				})
				.from(elements)
				.leftJoin(elementCatalog, eq(elementCatalog.id, elements.catalogItemId))
				.where(inArray(elements.workId, workIds))
				.orderBy(asc(elements.sortOrder), asc(elements.createdAt))
		: [];
	const elementIds = elementRows.map((row) => row.id);

	const targetCondition =
		workIds.length > 0 && elementIds.length > 0
			? or(inArray(evidenceTargets.workId, workIds), inArray(evidenceTargets.elementId, elementIds))
			: workIds.length > 0
				? inArray(evidenceTargets.workId, workIds)
				: elementIds.length > 0
					? inArray(evidenceTargets.elementId, elementIds)
					: null;

	const targetRows = targetCondition
		? await db
				.select({
					id: evidenceTargets.id,
					workId: evidenceTargets.workId,
					elementId: evidenceTargets.elementId,
					status: evidenceTargets.currentStatus
				})
				.from(evidenceTargets)
				.where(targetCondition)
		: [];

	const targetByWork = new Map(
		targetRows.filter((row) => row.workId).map((row) => [row.workId as string, row])
	);
	const targetByElement = new Map(
		targetRows.filter((row) => row.elementId).map((row) => [row.elementId as string, row])
	);
	const approved = await latestApprovedSubmissions(
		db,
		targetRows.map((row) => row.id)
	);
	const photosBySubmission = await loadSubmissionPhotos(
		db,
		[...approved.values()].map((entry) => entry.submissionId)
	);

	const root = sanitizeSegment(service.name, 'servicio');
	const files: ArchiveFile[] = [];
	const resumen: (string | null)[][] = [
		['Servicio', 'Trabajo', 'Elemento', 'Tipo', 'Estado', 'Incluido', 'Motivo']
	];

	// Registro por directorio para no colisionar nombres de trabajo bajo el servicio.
	const dirRegistries = new Map<string, NameRegistry>();
	const workFolders = new Map<string, string>();

	interface Unit {
		workName: string;
		elementName: string | null;
		workId: string;
		elementId: string | null;
		targetId: string | null;
		status: TargetStatus;
	}

	const units: Unit[] = [];
	for (const work of workRows) {
		if (work.mode === 'direct') {
			const target = targetByWork.get(work.id);
			units.push({
				workName: work.label,
				elementName: null,
				workId: work.id,
				elementId: null,
				targetId: target?.id ?? null,
				status: target?.status ?? 'pending'
			});
		}
	}
	for (const element of elementRows) {
		const work = workRows.find((row) => row.id === element.workId);
		const target = targetByElement.get(element.id);
		units.push({
			workName: work?.label ?? '',
			elementName: element.label,
			workId: element.workId,
			elementId: element.id,
			targetId: target?.id ?? null,
			status: target?.status ?? 'pending'
		});
	}

	for (const unit of units) {
		let workFolder = workFolders.get(unit.workId);
		if (!workFolder) {
			workFolder = getRegistry(dirRegistries, root).unique(unit.workName, unit.workId);
			workFolders.set(unit.workId, workFolder);
		}

		const isApproved = unit.targetId ? approved.has(unit.targetId) : false;
		const parent = unit.elementName
			? `${root}/${workFolder}/${getRegistry(dirRegistries, `${root}/${workFolder}`).unique(
					unit.elementName,
					unit.elementId as string
				)}`
			: `${root}/${workFolder}`;

		resumen.push([
			service.name,
			unit.workName,
			unit.elementName ?? '',
			unit.elementName ? 'Elemento' : 'Trabajo directo',
			STATUS_LABEL[unit.status],
			isApproved ? 'Sí' : 'No',
			isApproved ? '' : omissionReason(unit.status)
		]);

		if (!isApproved || !unit.targetId) continue;
		const submission = approved.get(unit.targetId);
		if (!submission) continue;
		const rows = photosBySubmission.get(submission.submissionId) ?? [];
		files.push(
			...photosToFiles(parent, rows, submission.submissionId, additionalFolderLabel(rows))
		);
	}

	return {
		serviceId: service.id,
		fileName: `servicio-${sanitizeSegment(service.name, 'servicio')}.zip`,
		files,
		resumen: toCsv(resumen)
	};
}

function omissionReason(status: TargetStatus): string {
	if (status === 'approved') return 'Sin entrega aprobada';
	return `Omitido: ${STATUS_LABEL[status]}`;
}

export interface ServicesCsvFilters {
	serviceId?: string | null;
	status?: TargetStatus | null;
}

export async function getServicesCsv(
	db: Database,
	filters: ServicesCsvFilters = {}
): Promise<ServiceCsv> {
	const workCatalog = alias(catalogItems, 'work_catalog');
	const elementCatalog = alias(catalogItems, 'element_catalog');

	const workRows = await db
		.select({
			serviceId: services.id,
			serviceName: services.name,
			workId: works.id,
			workLabel: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`,
			unitType: sql<string>`'Trabajo directo'`,
			unitId: works.id,
			unitLabel: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`,
			mode: works.mode
		})
		.from(works)
		.innerJoin(services, eq(services.id, works.serviceId))
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.where(filters.serviceId ? eq(services.id, filters.serviceId) : undefined)
		.orderBy(asc(services.name), asc(works.sortOrder), asc(works.createdAt));

	const elementRows = await db
		.select({
			serviceId: services.id,
			serviceName: services.name,
			workId: works.id,
			workLabel: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`,
			unitType: sql<string>`'Elemento'`,
			unitId: elements.id,
			unitLabel: sql<string>`coalesce(${elementCatalog.name}, ${elements.customName})`,
			mode: sql<WorkMode>`'divided'`
		})
		.from(elements)
		.innerJoin(works, eq(works.id, elements.workId))
		.innerJoin(services, eq(services.id, works.serviceId))
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.leftJoin(elementCatalog, eq(elementCatalog.id, elements.catalogItemId))
		.where(filters.serviceId ? eq(services.id, filters.serviceId) : undefined)
		.orderBy(
			asc(services.name),
			asc(works.sortOrder),
			asc(elements.sortOrder),
			asc(elements.createdAt)
		);

	// Estado autoritativo por unidad (solo trabajos directos tienen objetivo propio).
	const targetRows = await db
		.select({
			id: evidenceTargets.id,
			workId: evidenceTargets.workId,
			elementId: evidenceTargets.elementId,
			status: evidenceTargets.currentStatus,
			latestSubmissionId: evidenceTargets.latestSubmissionId
		})
		.from(evidenceTargets);
	const statusByWork = new Map(
		targetRows.filter((row) => row.workId).map((row) => [row.workId as string, row])
	);
	const statusByElement = new Map(
		targetRows.filter((row) => row.elementId).map((row) => [row.elementId as string, row])
	);

	const submissionCounts = await db
		.select({
			targetId: evidenceSubmissions.targetId,
			total: sql<number>`cast(count(*) as int)`
		})
		.from(evidenceSubmissions)
		.groupBy(evidenceSubmissions.targetId);
	const countByTarget = new Map(submissionCounts.map((row) => [row.targetId, row.total]));

	const reviewRows = await db
		.select({
			submissionId: reviews.submissionId,
			decision: reviews.decision,
			reason: reviews.reason,
			reviewedAt: reviews.reviewedAt,
			reviewerName: users.displayName
		})
		.from(reviews)
		.leftJoin(users, eq(users.id, reviews.reviewerId));
	const reviewBySubmission = new Map(reviewRows.map((row) => [row.submissionId, row]));

	const header = [
		'Servicio',
		'Trabajo',
		'Unidad',
		'Tipo',
		'Estado',
		'Entregas',
		'Decisión',
		'Revisor',
		'Fecha de decisión',
		'Motivo de rechazo'
	];
	const rows: (string | number | null)[][] = [header];

	const units = [...workRows.filter((row) => row.mode === 'direct'), ...elementRows];
	for (const unit of units) {
		const target =
			unit.unitType === 'Elemento'
				? statusByElement.get(unit.unitId)
				: statusByWork.get(unit.unitId);
		const status: TargetStatus = target?.status ?? 'pending';
		if (filters.status && status !== filters.status) continue;

		const latestSubmissionId = target?.latestSubmissionId ?? null;
		const review = latestSubmissionId ? reviewBySubmission.get(latestSubmissionId) : undefined;

		rows.push([
			unit.serviceName,
			unit.workLabel,
			unit.unitLabel,
			unit.unitType,
			STATUS_LABEL[status],
			target ? (countByTarget.get(target.id) ?? 0) : 0,
			review ? (review.decision === 'approved' ? 'Aprobada' : 'Rechazada') : '',
			review?.reviewerName ?? '',
			review?.reviewedAt ? review.reviewedAt.toISOString() : '',
			review?.decision === 'rejected' ? (review.reason ?? '') : ''
		]);
	}

	return {
		fileName: 'lumen-servicios.csv',
		content: toCsv(rows, { bom: true })
	};
}
