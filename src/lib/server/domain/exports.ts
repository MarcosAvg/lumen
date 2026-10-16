import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import {
	catalogItems,
	contracts,
	elements,
	evidenceSubmissions,
	evidenceTargets,
	photos,
	reviews,
	services,
	submissionPhotos,
	works
} from '#lib/server/db/schema';
import type { TargetStatus, WorkMode } from '#lib/types';
import { ADDITIONAL_GROUP_LABEL, NO_REQUIREMENT_GROUP_LABEL } from '#lib/types';
import { NameRegistry, sanitizeSegment } from '#lib/server/exports/names';
import { DomainError } from './errors';
import { getTargetContext } from './targets';

/**
 * Exportaciones ZIP (docs/06 §10). Solo se generan **listas de entradas**; el
 * streaming lo hace la capa HTTP. Jerarquía consistente en todos los niveles:
 *
 *   contrato ▸ edificio ▸ servicio ▸ trabajo ▸ (elemento) ▸ requisito ▸ fotos
 *   servicio ▸ trabajo ▸ (elemento) ▸ requisito ▸ fotos
 *   trabajo ▸ (elemento) ▸ requisito ▸ fotos
 *   entrega ▸ requisito ▸ fotos
 *
 * Solo se incluye la **última entrega aprobada** de cada objetivo.
 */

export const NO_BUILDING_LABEL = 'Sin edificio';

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
}

export interface WorkArchive {
	workId: string;
	serviceId: string;
	fileName: string;
	files: ArchiveFile[];
}

export interface ContractArchive {
	contractId: string;
	fileName: string;
	files: ArchiveFile[];
}

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

/** Última entrega **aprobada** por objetivo. */
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

interface WorkRef {
	id: string;
	serviceId: string;
	mode: WorkMode;
	name: string;
}

interface ElementRef {
	id: string;
	workId: string;
	name: string;
}

interface TargetRef {
	id: string;
	workId: string | null;
	elementId: string | null;
	status: TargetStatus;
}

interface LoadedUnits {
	works: WorkRef[];
	elements: ElementRef[];
	targets: TargetRef[];
	approved: Map<string, { submissionId: string; sequenceNo: number }>;
	photosBySubmission: Map<string, SubmissionPhotoRow[]>;
}

/** Carga trabajos, elementos, objetivos y fotos aprobadas de unos servicios. */
async function loadUnitsForServices(db: Database, serviceIds: string[]): Promise<LoadedUnits> {
	const empty: LoadedUnits = {
		works: [],
		elements: [],
		targets: [],
		approved: new Map(),
		photosBySubmission: new Map()
	};
	if (serviceIds.length === 0) return empty;

	const workCatalog = alias(catalogItems, 'work_catalog');
	const elementCatalog = alias(catalogItems, 'element_catalog');

	const workRows: WorkRef[] = await db
		.select({
			id: works.id,
			serviceId: works.serviceId,
			mode: works.mode,
			name: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`
		})
		.from(works)
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.where(inArray(works.serviceId, serviceIds))
		.orderBy(asc(works.sortOrder), asc(works.createdAt));

	const workIds = workRows.map((row) => row.id);
	const elementRows: ElementRef[] = workIds.length
		? await db
				.select({
					id: elements.id,
					workId: elements.workId,
					name: sql<string>`coalesce(${elementCatalog.name}, ${elements.customName})`
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

	const targetRows: TargetRef[] = targetCondition
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

	const approved = await latestApprovedSubmissions(
		db,
		targetRows.map((row) => row.id)
	);
	const photosBySubmission = await loadSubmissionPhotos(
		db,
		[...approved.values()].map((entry) => entry.submissionId)
	);

	return {
		works: workRows,
		elements: elementRows,
		targets: targetRows,
		approved,
		photosBySubmission
	};
}

/** Unidades (elementos) de un trabajo con su objetivo. Trabajo directo → una unidad sin elemento. */
function unitsForWork(
	state: LoadedUnits,
	work: WorkRef
): { element: ElementRef | null; target: TargetRef | null }[] {
	if (work.mode === 'direct') {
		const target = state.targets.find((row) => row.workId === work.id) ?? null;
		return [{ element: null, target }];
	}
	return state.elements
		.filter((element) => element.workId === work.id)
		.map((element) => ({
			element,
			target: state.targets.find((row) => row.elementId === element.id) ?? null
		}));
}

/**
 * Añade las fotos aprobadas de un trabajo bajo `parentPath`.
 * `includeWorkFolder` = false cuando `parentPath` ya **es** la carpeta del trabajo.
 */
function addWorkFiles(
	files: ArchiveFile[],
	dirRegistries: Map<string, NameRegistry>,
	state: LoadedUnits,
	work: WorkRef,
	parentPath: string,
	includeWorkFolder: boolean
): void {
	const workPath = includeWorkFolder
		? `${parentPath}/${getRegistry(dirRegistries, parentPath).unique(work.name, work.id)}`
		: parentPath;

	for (const unit of unitsForWork(state, work)) {
		const unitPath = unit.element
			? `${workPath}/${getRegistry(dirRegistries, workPath).unique(unit.element.name, unit.element.id)}`
			: workPath;
		if (!unit.target) continue;
		const submission = state.approved.get(unit.target.id);
		if (!submission) continue;
		const rows = state.photosBySubmission.get(submission.submissionId) ?? [];
		files.push(
			...photosToFiles(unitPath, rows, submission.submissionId, additionalFolderLabel(rows))
		);
	}
}

export async function getServiceArchive(db: Database, serviceId: string): Promise<ServiceArchive> {
	const [service] = await db
		.select({ id: services.id, name: services.name })
		.from(services)
		.where(eq(services.id, serviceId))
		.limit(1);
	if (!service) throw new DomainError(404, 'Servicio no encontrado.');

	const state = await loadUnitsForServices(db, [service.id]);
	const root = sanitizeSegment(service.name, 'servicio');
	const files: ArchiveFile[] = [];
	const dirRegistries = new Map<string, NameRegistry>();

	for (const work of state.works) {
		addWorkFiles(files, dirRegistries, state, work, root, true);
	}

	return {
		serviceId: service.id,
		fileName: `servicio-${sanitizeSegment(service.name, 'servicio')}.zip`,
		files
	};
}

export async function getWorkArchive(db: Database, workId: string): Promise<WorkArchive> {
	const workCatalog = alias(catalogItems, 'work_catalog');
	const [work] = await db
		.select({
			id: works.id,
			serviceId: works.serviceId,
			mode: works.mode,
			name: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`
		})
		.from(works)
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.where(eq(works.id, workId))
		.limit(1);
	if (!work) throw new DomainError(404, 'Trabajo no encontrado.');

	const state = await loadUnitsForServices(db, [work.serviceId]);
	const root = sanitizeSegment(work.name, 'trabajo');
	const files: ArchiveFile[] = [];
	const dirRegistries = new Map<string, NameRegistry>();
	addWorkFiles(files, dirRegistries, state, work, root, false);

	return {
		workId: work.id,
		serviceId: work.serviceId,
		fileName: `trabajo-${sanitizeSegment(work.name, 'trabajo')}.zip`,
		files
	};
}

const visibleBuildingName = sql<
	string | null
>`coalesce(${catalogItems.name}, ${services.buildingNameSnapshot})`;

export async function getContractArchive(
	db: Database,
	contractId: string
): Promise<ContractArchive> {
	const [contract] = await db
		.select({ id: contracts.id, name: contracts.name })
		.from(contracts)
		.where(eq(contracts.id, contractId))
		.limit(1);
	if (!contract) throw new DomainError(404, 'Contrato no encontrado.');

	const serviceRows = await db
		.select({ id: services.id, name: services.name, buildingName: visibleBuildingName })
		.from(services)
		.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
		.where(eq(services.contractId, contractId))
		.orderBy(asc(services.createdAt));

	const state = await loadUnitsForServices(
		db,
		serviceRows.map((row) => row.id)
	);
	const root = sanitizeSegment(contract.name, 'contrato');
	const files: ArchiveFile[] = [];
	const dirRegistries = new Map<string, NameRegistry>();

	// Agrupar servicios por edificio (solo edificios con servicios); los que no
	// tienen edificio van a «Sin edificio».
	const byBuilding = new Map<string, typeof serviceRows>();
	for (const service of serviceRows) {
		const key = service.buildingName?.trim() ? service.buildingName : NO_BUILDING_LABEL;
		const list = byBuilding.get(key) ?? [];
		list.push(service);
		byBuilding.set(key, list);
	}

	for (const [building, serviceList] of [...byBuilding.entries()].sort(([a], [b]) =>
		a.localeCompare(b, 'es')
	)) {
		const buildingFolder = getRegistry(dirRegistries, root).unique(building, building);
		const buildingPath = `${root}/${buildingFolder}`;
		for (const service of serviceList) {
			const servicePath = `${buildingPath}/${getRegistry(dirRegistries, buildingPath).unique(
				service.name,
				service.id
			)}`;
			for (const work of state.works.filter((row) => row.serviceId === service.id)) {
				addWorkFiles(files, dirRegistries, state, work, servicePath, true);
			}
		}
	}

	return {
		contractId: contract.id,
		fileName: `contrato-${sanitizeSegment(contract.name, 'contrato')}.zip`,
		files
	};
}
