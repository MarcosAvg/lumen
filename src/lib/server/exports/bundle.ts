import type { Database } from '#lib/server/db';
import { getContractPdfContext } from '#lib/server/domain/contracts';
import type { ExportPlan } from '#lib/server/domain/exports';
import type { Storage } from '#lib/server/storage/storage';
import type { ExportRequestOptions } from './options';
import { buildWorkPdf } from './pdf';
import { buildWorkbook } from './workbook';

/** Entrada binaria generada para el ZIP (registro XLSX o PDF de evidencia). */
export interface ZipExtra {
	name: string;
	content: Buffer;
}

/**
 * Genera el registro XLSX y los PDF de evidencia por trabajo según las opciones
 * del modal. Los trabajos sin evidencia aprobada no producen PDF.
 */
export async function buildExportExtras(
	db: Database,
	storage: Storage,
	plan: ExportPlan,
	options: ExportRequestOptions
): Promise<ZipExtra[]> {
	const extras: ZipExtra[] = [];

	if (options.xlsx) {
		extras.push({
			name: `${plan.root}/${plan.root}.xlsx`,
			content: await buildWorkbook(plan, options.variant)
		});
	}

	if (options.pdf && plan.rows.some((row) => row.photoBlocks.some((b) => b.photos.length > 0))) {
		const context = plan.contractId ? await getContractPdfContext(db, plan.contractId) : null;
		const backgroundAbsolutePath = context?.backgroundPath
			? storage.absolute(context.backgroundPath)
			: null;

		for (const row of plan.rows) {
			if (!row.photoBlocks.some((block) => block.photos.length > 0)) continue;
			extras.push({
				name: row.pdfPath,
				content: await buildWorkPdf(
					{
						header: {
							contractName: context?.name ?? plan.title,
							buildingName: row.buildingName,
							serviceName: row.serviceName,
							workName: row.workName,
							mode: row.mode
						},
						blocks: row.photoBlocks,
						backgroundAbsolutePath
					},
					storage
				)
			});
		}
	}

	return extras;
}
