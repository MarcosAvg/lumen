import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import {
	catalogItems,
	contracts,
	elements,
	evidenceSubmissions,
	evidenceTargets,
	photoRequirements,
	photos,
	reviews,
	services,
	users,
	works
} from '#lib/server/db/schema';
import type { TargetStatus, WorkMode } from '#lib/types';
import { NameRegistry, sanitizeSegment } from '#lib/server/exports/names';
import { DomainError } from './errors';
import {
	additionalFolderLabel,
	getRegistry,
	loadSubmissionPhotos,
	photosToFiles,
	type ArchiveFile,
	type SubmissionPhotoRow
} from './exports-shared';

// ZIP de entrega (extraído a `exports-submission.ts`; se re-exporta aquí).
export { getSubmissionArchive } from './exports-submission';
export type { SubmissionArchive } from './exports-submission';
export type { ArchiveFile } from './exports-shared';

/**
 * Exportaciones ZIP (docs/06 §10). `buildExportPlan` calcula **una vez** las
 * rutas y los datos; de ahí salen el ZIP (fotos) y el XLSX (datos + enlaces).
 *
 *   contrato ▸ edificio ▸ servicio ▸ trabajo ▸ (elemento) ▸ requisito ▸ fotos
 *   servicio ▸ trabajo ▸ (elemento) ▸ requisito ▸ fotos
 *   trabajo ▸ (elemento) ▸ requisito ▸ fotos
 *   entrega ▸ requisito ▸ fotos
 *
 * Solo se incluyen **fotos de la última entrega aprobada** de cada objetivo; el
 * XLSX refleja **todo** el estado.
 */

const NO_BUILDING_LABEL = 'Sin edificio';
/** Agregados de una unidad (trabajo directo o elemento) para el XLSX. */
export interface UnitAggregate {
	status: TargetStatus;
	requiredTotal: number;
	requiredSatisfied: number;
	photoCount: number;
	lastSubmissionAt: Date | null;
	decision: 'approved' | 'rejected' | null;
	reviewerName: string | null;
	reviewedAt: Date | null;
	rejectionReason: string | null;
}

export interface ExportPlanRow {
	workId: string;
	workName: string;
	mode: WorkMode;
	/** Carpeta del trabajo relativa a la raíz del ZIP, p. ej. `Servicio/Trabajo`. */
	workPath: string;
	/** Nombre del PDF de evidencia del trabajo (se genera al exportar). */
	pdfName: string;
	/** Ruta del PDF relativa a la raíz del ZIP = enlace del XLSX. */
	pdfPath: string;
	files: ArchiveFile[];
	/** Bloques (elemento/requisito) con las fotos aprobadas, para el PDF. */
	photoBlocks: PdfBlock[];
	serviceId: string;
	serviceName: string;
	buildingName: string | null;
	units: UnitAggregate[];
}

export interface ExportPlan {
	kind: 'contract' | 'service' | 'work';
	/** Contrato del ámbito (para el fondo del PDF). */
	contractId: string | null;
	/** Nombre saneado de la raíz (carpeta del ZIP y base del XLSX). */
	root: string;
	/** Título sin sanear del ámbito. */
	title: string;
	services: { id: string; name: string; buildingName: string | null }[];
	rows: ExportPlanRow[];
}

export type ExportScope =
	| { kind: 'contract'; contractId: string }
	| { kind: 'service'; serviceId: string }
	| { kind: 'work'; workId: string };

export interface ServiceArchive {
	serviceId: string;
	fileName: string;
	files: ArchiveFile[];
	plan: ExportPlan;
}

export interface WorkArchive {
	workId: string;
	serviceId: string;
	fileName: string;
	files: ArchiveFile[];
	plan: ExportPlan;
}

export interface ContractArchive {
	contractId: string;
	fileName: string;
	files: ArchiveFile[];
	plan: ExportPlan;
}
/** Foto dentro de un bloque del PDF (elemento/requisito). */
export interface PdfBlockPhoto {
	storagePath: string;
	uploadedAt: Date | null;
	uploadedByName: string | null;
}

/** Bloque del PDF: un requisito (y elemento en trabajos divididos). */
export interface PdfBlock {
	elementName: string | null;
	requirementName: string | null;
	photos: PdfBlockPhoto[];
}

const visibleBuildingName = sql<
	string | null
>`coalesce(${catalogItems.name}, ${services.buildingNameSnapshot})`;
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

/** Agregados por objetivo para el XLSX (estado completo, no solo aprobados). */
async function loadTargetAggregates(
	db: Database,
	targetIds: string[]
): Promise<Map<string, UnitAggregate>> {
	const result = new Map<string, UnitAggregate>();
	if (targetIds.length === 0) return result;

	const requiredCount = sql<number>`cast(count(*) as int)`;
	const satisfiedCount = sql<number>`cast(count(distinct ${photoRequirements.id}) as int)`;

	const [requiredRows, satisfiedRows, photoRows, submissionRows] = await Promise.all([
		db
			.select({ targetId: photoRequirements.targetId, value: requiredCount })
			.from(photoRequirements)
			.where(
				and(inArray(photoRequirements.targetId, targetIds), eq(photoRequirements.isRequired, true))
			)
			.groupBy(photoRequirements.targetId),
		db
			.select({ targetId: photoRequirements.targetId, value: satisfiedCount })
			.from(photoRequirements)
			.innerJoin(photos, eq(photos.requirementId, photoRequirements.id))
			.where(
				and(
					inArray(photoRequirements.targetId, targetIds),
					eq(photoRequirements.isRequired, true),
					isNull(photos.removedAt),
					eq(photos.processingStatus, 'ready')
				)
			)
			.groupBy(photoRequirements.targetId),
		db
			.select({
				targetId: photos.targetId,
				value: sql<number>`cast(count(*) as int)`
			})
			.from(photos)
			.where(
				and(
					inArray(photos.targetId, targetIds),
					isNull(photos.removedAt),
					eq(photos.processingStatus, 'ready')
				)
			)
			.groupBy(photos.targetId),
		// Última entrega de cada objetivo (la de mayor número de secuencia).
		db
			.selectDistinctOn([evidenceSubmissions.targetId], {
				targetId: evidenceSubmissions.targetId,
				submissionId: evidenceSubmissions.id,
				submittedAt: evidenceSubmissions.submittedAt
			})
			.from(evidenceSubmissions)
			.where(inArray(evidenceSubmissions.targetId, targetIds))
			.orderBy(evidenceSubmissions.targetId, desc(evidenceSubmissions.sequenceNo))
	]);

	const requiredByTarget = new Map(requiredRows.map((row) => [row.targetId, row.value]));
	const satisfiedByTarget = new Map(satisfiedRows.map((row) => [row.targetId, row.value]));
	const photosByTarget = new Map(photoRows.map((row) => [row.targetId, row.value]));

	const submissionIds = submissionRows.map((row) => row.submissionId);
	const reviewRows = submissionIds.length
		? await db
				.select({
					submissionId: reviews.submissionId,
					decision: reviews.decision,
					reason: reviews.reason,
					reviewedAt: reviews.reviewedAt,
					reviewerName: sql<string | null>`coalesce(${reviews.reviewerName}, ${users.displayName})`
				})
				.from(reviews)
				.leftJoin(users, eq(users.id, reviews.reviewerId))
				.where(inArray(reviews.submissionId, submissionIds))
		: [];
	const reviewBySubmission = new Map(reviewRows.map((row) => [row.submissionId, row]));

	for (const submission of submissionRows) {
		const review = reviewBySubmission.get(submission.submissionId);
		result.set(submission.targetId, {
			status: 'pending',
			requiredTotal: requiredByTarget.get(submission.targetId) ?? 0,
			requiredSatisfied: satisfiedByTarget.get(submission.targetId) ?? 0,
			photoCount: photosByTarget.get(submission.targetId) ?? 0,
			lastSubmissionAt: submission.submittedAt,
			decision: review?.decision ?? null,
			reviewerName: review?.reviewerName ?? null,
			reviewedAt: review?.reviewedAt ?? null,
			rejectionReason: review?.decision === 'rejected' ? (review.reason ?? null) : null
		});
	}
	// Objetivos sin entregas: agregados a cero.
	for (const targetId of targetIds) {
		if (!result.has(targetId)) {
			result.set(targetId, {
				status: 'pending',
				requiredTotal: requiredByTarget.get(targetId) ?? 0,
				requiredSatisfied: satisfiedByTarget.get(targetId) ?? 0,
				photoCount: photosByTarget.get(targetId) ?? 0,
				lastSubmissionAt: null,
				decision: null,
				reviewerName: null,
				reviewedAt: null,
				rejectionReason: null
			});
		}
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
	aggregates: Map<string, UnitAggregate>;
}

/** Carga trabajos, elementos, objetivos y datos de un conjunto de servicios. */
async function loadUnitsForServices(
	db: Database,
	serviceIds: string[],
	options: { aggregates: boolean } = { aggregates: true }
): Promise<LoadedUnits> {
	const empty: LoadedUnits = {
		works: [],
		elements: [],
		targets: [],
		approved: new Map(),
		photosBySubmission: new Map(),
		aggregates: new Map()
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

	const targetIds = targetRows.map((row) => row.id);
	const approved = await latestApprovedSubmissions(db, targetIds);
	// El estado autoritativo vive en el objetivo; los agregados amplían el resto.
	const aggregates = options.aggregates
		? await loadTargetAggregates(db, targetIds)
		: new Map<string, UnitAggregate>();
	for (const target of targetRows) {
		const aggregate = aggregates.get(target.id);
		if (aggregate) {
			aggregate.status = target.status;
		} else {
			aggregates.set(target.id, {
				status: target.status,
				requiredTotal: 0,
				requiredSatisfied: 0,
				photoCount: 0,
				lastSubmissionAt: null,
				decision: null,
				reviewerName: null,
				reviewedAt: null,
				rejectionReason: null
			});
		}
	}
	const photosBySubmission = await loadSubmissionPhotos(
		db,
		[...approved.values()].map((entry) => entry.submissionId)
	);

	return {
		works: workRows,
		elements: elementRows,
		targets: targetRows,
		approved,
		photosBySubmission,
		aggregates
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

/** Fotos aprobadas de un trabajo, con la carpeta de cada unidad. */
function workFiles(
	state: LoadedUnits,
	work: WorkRef,
	workPath: string,
	dirRegistries: Map<string, NameRegistry>
): ArchiveFile[] {
	const files: ArchiveFile[] = [];
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
	return files;
}

/** Bloques del PDF: por elemento (divididos) y requisito, con fotos aprobadas. */
function buildPhotoBlocks(state: LoadedUnits, work: WorkRef): PdfBlock[] {
	const blocks: PdfBlock[] = [];
	for (const unit of unitsForWork(state, work)) {
		if (!unit.target) continue;
		const submission = state.approved.get(unit.target.id);
		if (!submission) continue;
		const rows = state.photosBySubmission.get(submission.submissionId) ?? [];
		const byRequirement = new Map<string | null, SubmissionPhotoRow[]>();
		for (const row of rows) {
			const list = byRequirement.get(row.requirementName) ?? [];
			list.push(row);
			byRequirement.set(row.requirementName, list);
		}
		for (const [requirementName, photos] of byRequirement) {
			blocks.push({
				elementName: unit.element?.name ?? null,
				requirementName,
				photos: photos.map((photo) => ({
					storagePath: photo.storagePath,
					uploadedAt: photo.uploadedAt,
					uploadedByName: photo.uploadedByName
				}))
			});
		}
	}
	return blocks;
}

/** Nombre del PDF de evidencia de un trabajo: solo el nombre del trabajo. */
function pdfNameFor(workName: string): string {
	return `${sanitizeSegment(workName, 'trabajo')}.pdf`;
}

export interface ExportPlanOptions {
	/** Calcula requisitos, fotos y revisión por objetivo (solo para `extended`). */
	aggregates?: boolean;
	/**
	 * Si se incluyen fotografías: el PDF vive en la carpeta del trabajo. Si no,
	 * los PDF caen directamente en la carpeta del servicio.
	 */
	photos?: boolean;
}

export async function buildExportPlan(
	db: Database,
	scope: ExportScope,
	options: ExportPlanOptions = {}
): Promise<ExportPlan> {
	// 1. Resolver el ámbito: nombre del ámbito y servicios implicados.
	let scopeName: string;
	let contractId: string | null;
	let serviceRows: { id: string; name: string; buildingName: string | null }[];
	let restrictWorkId: string | null = null;

	if (scope.kind === 'contract') {
		const [contract] = await db
			.select({ name: contracts.name })
			.from(contracts)
			.where(eq(contracts.id, scope.contractId))
			.limit(1);
		if (!contract) throw new DomainError(404, 'Contrato no encontrado.');
		scopeName = contract.name;
		contractId = scope.contractId;
		serviceRows = await db
			.select({ id: services.id, name: services.name, buildingName: visibleBuildingName })
			.from(services)
			.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
			.where(eq(services.contractId, scope.contractId))
			.orderBy(asc(services.createdAt));
	} else if (scope.kind === 'service') {
		const [service] = await db
			.select({
				id: services.id,
				name: services.name,
				buildingName: visibleBuildingName,
				contractId: services.contractId
			})
			.from(services)
			.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
			.where(eq(services.id, scope.serviceId))
			.limit(1);
		if (!service) throw new DomainError(404, 'Servicio no encontrado.');
		scopeName = service.name;
		contractId = service.contractId;
		serviceRows = [service];
	} else {
		const workCatalog = alias(catalogItems, 'work_catalog');
		const [work] = await db
			.select({
				id: works.id,
				serviceId: works.serviceId,
				name: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`
			})
			.from(works)
			.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
			.where(eq(works.id, scope.workId))
			.limit(1);
		if (!work) throw new DomainError(404, 'Trabajo no encontrado.');
		const [service] = await db
			.select({
				id: services.id,
				name: services.name,
				buildingName: visibleBuildingName,
				contractId: services.contractId
			})
			.from(services)
			.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
			.where(eq(services.id, work.serviceId))
			.limit(1);
		if (!service) throw new DomainError(404, 'Servicio no encontrado.');
		scopeName = work.name;
		contractId = service.contractId;
		serviceRows = [service];
		restrictWorkId = work.id;
	}

	// 2. Cargar trabajos/elementos/objetivos/agregados de esos servicios.
	const state = await loadUnitsForServices(
		db,
		serviceRows.map((row) => row.id),
		{ aggregates: options.aggregates !== false }
	);
	const serviceById = new Map(serviceRows.map((row) => [row.id, row]));

	const root = sanitizeSegment(scopeName, scope.kind);
	const dirRegistries = new Map<string, NameRegistry>();
	const rows: ExportPlanRow[] = [];

	const inScope = (work: WorkRef): boolean => {
		if (restrictWorkId) return work.id === restrictWorkId;
		return serviceById.has(work.serviceId);
	};

	// 3. Recorrer en orden de edificio → servicio → trabajo (contrato) o directo.
	const scopedWorks = state.works.filter(inScope);

	const buildRow = (work: WorkRef, workPath: string, servicePath: string): ExportPlanRow => {
		const service = serviceById.get(work.serviceId);
		const units = unitsForWork(state, work);
		const unitAggregates = units.map(
			(unit) =>
				(unit.target ? state.aggregates.get(unit.target.id) : null) ?? {
					status: 'pending' as TargetStatus,
					requiredTotal: 0,
					requiredSatisfied: 0,
					photoCount: 0,
					lastSubmissionAt: null,
					decision: null,
					reviewerName: null,
					reviewedAt: null,
					rejectionReason: null
				}
		);
		const files = workFiles(state, work, workPath, dirRegistries);
		// Con fotografías el PDF va en la carpeta del trabajo; sin ellas, cae en la
		// carpeta del servicio (no hay carpetas de elemento/requisito).
		const pdfDir = options.photos === false ? servicePath : workPath;
		const pdfName = getRegistry(dirRegistries, pdfDir).unique(pdfNameFor(work.name), work.id);
		return {
			workId: work.id,
			workName: work.name,
			mode: work.mode,
			workPath,
			pdfName,
			pdfPath: `${pdfDir}/${pdfName}`,
			files,
			photoBlocks: buildPhotoBlocks(state, work),
			serviceId: work.serviceId,
			serviceName: service?.name ?? '',
			buildingName: service?.buildingName ?? null,
			units: unitAggregates
		};
	};

	if (scope.kind === 'work') {
		for (const work of scopedWorks) rows.push(buildRow(work, root, root));
	} else if (scope.kind === 'service') {
		for (const work of scopedWorks) {
			const workFolder = getRegistry(dirRegistries, root).unique(work.name, work.id);
			rows.push(buildRow(work, `${root}/${workFolder}`, root));
		}
	} else {
		// Contrato: agrupar por edificio y servicio, en orden estable.
		const byBuilding = new Map<string, typeof serviceRows>();
		for (const service of serviceRows) {
			const key = service.buildingName?.trim() ? service.buildingName : NO_BUILDING_LABEL;
			const list = byBuilding.get(key) ?? [];
			list.push(service);
			byBuilding.set(key, list);
		}
		for (const [building, list] of [...byBuilding.entries()].sort(([a], [b]) =>
			a.localeCompare(b, 'es')
		)) {
			const buildingPath = `${root}/${getRegistry(dirRegistries, root).unique(building, building)}`;
			for (const service of list) {
				const servicePath = `${buildingPath}/${getRegistry(dirRegistries, buildingPath).unique(
					service.name,
					service.id
				)}`;
				for (const work of scopedWorks.filter((row) => row.serviceId === service.id)) {
					const workFolder = getRegistry(dirRegistries, servicePath).unique(work.name, work.id);
					rows.push(buildRow(work, `${servicePath}/${workFolder}`, servicePath));
				}
			}
		}
	}

	return { kind: scope.kind, contractId, root, title: scopeName, services: serviceRows, rows };
}

function planFiles(plan: ExportPlan): ArchiveFile[] {
	return plan.rows.flatMap((row) => row.files);
}

export async function getServiceArchive(
	db: Database,
	serviceId: string,
	options: ExportPlanOptions = {}
): Promise<ServiceArchive> {
	const plan = await buildExportPlan(db, { kind: 'service', serviceId }, options);
	return {
		serviceId,
		fileName: `servicio-${plan.root}.zip`,
		files: planFiles(plan),
		plan
	};
}

export async function getWorkArchive(
	db: Database,
	workId: string,
	options: ExportPlanOptions = {}
): Promise<WorkArchive> {
	const plan = await buildExportPlan(db, { kind: 'work', workId }, options);
	const row = plan.rows[0];
	if (!row) throw new DomainError(404, 'Trabajo no encontrado.');
	return {
		workId,
		serviceId: row.serviceId,
		fileName: `trabajo-${plan.root}.zip`,
		files: planFiles(plan),
		plan
	};
}

export async function getContractArchive(
	db: Database,
	contractId: string,
	options: ExportPlanOptions = {}
): Promise<ContractArchive> {
	const plan = await buildExportPlan(db, { kind: 'contract', contractId }, options);
	return {
		contractId,
		fileName: `contrato-${plan.root}.zip`,
		files: planFiles(plan),
		plan
	};
}
