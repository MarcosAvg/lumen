import type { Database } from '#lib/server/db';
import { getContractPdfContext } from '#lib/server/domain/contracts';
import { DomainError } from '#lib/server/domain/errors';
import type { ExportPlan, ExportPlanRow } from '#lib/server/domain/exports';
import type { Storage } from '#lib/server/storage/storage';
import { sanitizeSegment } from './names';
import type { ExportRequestOptions } from './options';
import { DEFAULT_PDF_MARGINS, buildServicePdf, buildWorkPdf } from './pdf';
import { buildWorkbook } from './workbook';

/** Entrada binaria generada para el ZIP (registro XLSX o PDF de evidencia). */
export interface ZipExtra {
	name: string;
	content: Buffer;
}

export interface ServicePdfResult {
	fileName: string;
	path: string;
	content: Buffer;
}

interface PdfContext {
	contractName: string;
	backgroundAbsolutePath: string | null;
	margins: typeof DEFAULT_PDF_MARGINS;
}

function hasPhotos(row: ExportPlanRow): boolean {
	return row.photoBlocks.some((block) => block.photos.length > 0);
}

/** Carpeta del servicio dentro del ZIP, derivada de la ruta de sus trabajos. */
function serviceFolderPath(plan: ExportPlan, serviceId: string): string {
	if (plan.kind !== 'contract') return plan.root;
	const row = plan.rows.find((item) => item.serviceId === serviceId);
	if (!row) return plan.root;
	const separator = row.workPath.lastIndexOf('/');
	return separator === -1 ? plan.root : row.workPath.slice(0, separator);
}

function compiledFileName(serviceName: string): string {
	return `${sanitizeSegment(serviceName, 'servicio')} - Evidencia.pdf`;
}

/** Ruta de un PDF recopilado de servicio dentro del ZIP. */
export function compiledServicePath(
	plan: ExportPlan,
	serviceId: string,
	serviceName: string
): string {
	return `${serviceFolderPath(plan, serviceId)}/${compiledFileName(serviceName)}`;
}

/** Ruta del PDF recopilado en un plan de ámbito servicio. */
export function servicePdfPath(plan: ExportPlan): string {
	const service = plan.services[0];
	return compiledServicePath(plan, service?.id ?? '', service?.name ?? plan.title);
}

async function pdfContext(db: Database, storage: Storage, plan: ExportPlan): Promise<PdfContext> {
	const context = plan.contractId ? await getContractPdfContext(db, plan.contractId) : null;
	return {
		contractName: context?.name ?? plan.title,
		backgroundAbsolutePath: context?.backgroundPath
			? storage.absolute(context.backgroundPath)
			: null,
		margins: context?.margins ?? DEFAULT_PDF_MARGINS
	};
}

/**
 * Genera el PDF recopilado de un servicio con todos sus trabajos que tengan
 * evidencia aprobada. No incluye trabajos vacíos.
 */
export async function buildServicePdfForService(
	db: Database,
	storage: Storage,
	plan: ExportPlan,
	serviceId: string,
	context?: PdfContext
): Promise<ServicePdfResult> {
	const rows = plan.rows.filter((row) => row.serviceId === serviceId && hasPhotos(row));
	const serviceName =
		plan.services.find((service) => service.id === serviceId)?.name ??
		rows[0]?.serviceName ??
		plan.title;

	if (rows.length === 0) {
		throw new DomainError(409, 'El servicio no tiene evidencia aprobada para generar el PDF.');
	}

	const resolved = context ?? (await pdfContext(db, storage, plan));
	const fileName = compiledFileName(serviceName);
	const content = await buildServicePdf(
		{
			contractName: resolved.contractName,
			buildingName: rows[0]?.buildingName ?? null,
			serviceName,
			works: rows.map((row) => ({
				header: {
					contractName: resolved.contractName,
					buildingName: row.buildingName,
					serviceName: row.serviceName,
					workName: row.workName,
					mode: row.mode
				},
				blocks: row.photoBlocks
			})),
			backgroundAbsolutePath: resolved.backgroundAbsolutePath,
			margins: resolved.margins
		},
		storage
	);

	return {
		fileName,
		path: `${serviceFolderPath(plan, serviceId)}/${fileName}`,
		content
	};
}

/** Genera el PDF recopilado de un plan de ámbito servicio. */
export async function buildServicePdfForPlan(
	db: Database,
	storage: Storage,
	plan: ExportPlan
): Promise<ServicePdfResult> {
	const serviceId = plan.services[0]?.id ?? plan.rows[0]?.serviceId;
	if (!serviceId) {
		throw new DomainError(409, 'El servicio no tiene evidencia aprobada para generar el PDF.');
	}
	return buildServicePdfForService(db, storage, plan, serviceId);
}

/**
 * Genera el registro XLSX y los PDF de evidencia según las opciones del modal.
 * El PDF recopilado es un archivo adicional y no altera el XLSX.
 */
export async function buildExportExtras(
	db: Database,
	storage: Storage,
	plan: ExportPlan,
	options: ExportRequestOptions
): Promise<ZipExtra[]> {
	const extras: ZipExtra[] = [];
	const rowsWithPhotos = plan.rows.filter(hasPhotos);
	const hasApprovedPhotos = rowsWithPhotos.length > 0;

	if (options.xlsx) {
		extras.push({
			name: `${plan.root}/${plan.root}.xlsx`,
			content: await buildWorkbook(plan, options.variant)
		});
	}

	const includePerWork = options.pdf;
	const includeCompiled =
		options.compiledPdf && (plan.kind === 'service' || plan.kind === 'contract');
	if ((!includePerWork && !includeCompiled) || !hasApprovedPhotos) return extras;

	const context = await pdfContext(db, storage, plan);

	if (includePerWork) {
		for (const row of rowsWithPhotos) {
			extras.push({
				name: row.pdfPath,
				content: await buildWorkPdf(
					{
						header: {
							contractName: context.contractName,
							buildingName: row.buildingName,
							serviceName: row.serviceName,
							workName: row.workName,
							mode: row.mode
						},
						blocks: row.photoBlocks,
						backgroundAbsolutePath: context.backgroundAbsolutePath,
						margins: context.margins
					},
					storage
				)
			});
		}
	}

	if (includeCompiled) {
		const serviceIds = [...new Set(rowsWithPhotos.map((row) => row.serviceId))];
		for (const serviceId of serviceIds) {
			const compiled = await buildServicePdfForService(db, storage, plan, serviceId, context);
			extras.push({ name: compiled.path, content: compiled.content });
		}
	}

	return extras;
}
