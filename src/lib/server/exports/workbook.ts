import ExcelJS from 'exceljs';
import type { TargetStatus } from '#lib/types';
import { sanitizeSegment } from './names';
import type { ExportPlan, ExportPlanRow, UnitAggregate } from '#lib/server/domain/exports';

/**
 * Libro XLSX de una exportación: **una fila por trabajo** con un hipervínculo
 * relativo al PDF de evidencia del trabajo (que se generará junto al ZIP).
 *
 * Dos variantes:
 * - `extended` (por defecto): hoja `Resumen` + una hoja por servicio con todas
 *   las columnas (edificio, tipo, elementos, requisitos, fotos, revisión…).
 * - `simple`: solo hojas por servicio con `Edificio · Trabajo · Estado ·
 *   Evidencia · Notas` (sin `Resumen`).
 *
 * Solo se usan **valores** (sin fórmulas) para que el resultado sea determinista.
 * El estilizado es estático (superencabezados, tinte por columna, color por
 * estado y chip de PDF), también sin fórmulas ni formato condicional dependiente
 * de referencias.
 */

export type WorkbookVariant = 'simple' | 'extended';

const STATUS_LABEL: Record<TargetStatus, string> = {
	pending: 'Pendiente',
	in_progress: 'En progreso',
	in_review: 'En revisión',
	rejected: 'Rechazado',
	approved: 'Aprobado'
};

/** Prioridad para derivar el estado de un trabajo dividido (más atención primero). */
const STATUS_PRIORITY: Record<TargetStatus, number> = {
	rejected: 4,
	in_review: 3,
	in_progress: 2,
	approved: 1,
	pending: 0
};

interface DerivedRow {
	status: TargetStatus;
	elementApproved: number;
	elementTotal: number;
	requiredTotal: number;
	requiredSatisfied: number;
	photoCount: number;
	lastSubmissionAt: Date | null;
	decision: 'approved' | 'rejected' | null;
	reviewerName: string | null;
	reviewedAt: Date | null;
	rejectionReason: string | null;
}

function deriveRow(row: ExportPlanRow): DerivedRow {
	const units = row.units;
	const approved = units.filter((unit) => unit.status === 'approved');
	const direct = row.mode === 'direct';
	const allApproved = units.length > 0 && approved.length === units.length;

	let representative: UnitAggregate | undefined;
	let status: TargetStatus;
	let decision: 'approved' | 'rejected' | null;

	if (direct) {
		representative = units[0];
		status = representative?.status ?? 'pending';
		decision = representative?.decision ?? null;
	} else if (allApproved) {
		status = 'approved';
		decision = 'approved';
		representative = approved[approved.length - 1];
	} else {
		representative = units.reduce<UnitAggregate | undefined>(
			(best, unit) =>
				!best || STATUS_PRIORITY[unit.status] > STATUS_PRIORITY[best.status] ? unit : best,
			undefined
		);
		status = representative?.status ?? 'pending';
		decision = representative?.decision ?? null;
	}

	let lastSubmissionAt: Date | null = null;
	let requiredTotal = 0;
	let requiredSatisfied = 0;
	let photoCount = 0;
	for (const unit of units) {
		requiredTotal += unit.requiredTotal;
		requiredSatisfied += unit.requiredSatisfied;
		photoCount += unit.photoCount;
		if (unit.lastSubmissionAt && (!lastSubmissionAt || unit.lastSubmissionAt > lastSubmissionAt)) {
			lastSubmissionAt = unit.lastSubmissionAt;
		}
	}

	return {
		status,
		elementApproved: approved.length,
		elementTotal: units.length,
		requiredTotal,
		requiredSatisfied,
		photoCount,
		lastSubmissionAt,
		decision,
		reviewerName: representative?.reviewerName ?? null,
		reviewedAt: representative?.reviewedAt ?? null,
		rejectionReason: status === 'rejected' ? (representative?.rejectionReason ?? null) : null
	};
}

interface ColumnDef {
	header: string;
	key: string;
	width: number;
}

interface ColumnSet {
	columns: ColumnDef[];
	/** Columnas del bloque «inspección» (resto = «resultados y evidencia»). */
	split: number;
	includeSummary: boolean;
}

const SIMPLE_SET: ColumnSet = {
	columns: [
		{ header: 'Edificio', key: 'building', width: 26 },
		{ header: 'Trabajo', key: 'work', width: 30 },
		{ header: 'Estado', key: 'status', width: 14 },
		{ header: 'Evidencia', key: 'evidence', width: 12 },
		{ header: 'Notas', key: 'notes', width: 30 }
	],
	split: 3,
	includeSummary: false
};

const EXTENDED_SET: ColumnSet = {
	columns: [
		{ header: 'Edificio', key: 'building', width: 24 },
		{ header: 'Servicio', key: 'service', width: 24 },
		{ header: 'Trabajo', key: 'work', width: 28 },
		{ header: 'Tipo', key: 'mode', width: 10 },
		{ header: 'Elementos', key: 'elements', width: 12 },
		{ header: 'Estado', key: 'status', width: 14 },
		{ header: 'Requisitos', key: 'requirements', width: 12 },
		{ header: 'Fotografías', key: 'photos', width: 12 },
		{ header: 'Última entrega', key: 'lastDelivery', width: 15 },
		{ header: 'Decisión', key: 'decision', width: 13 },
		{ header: 'Revisor', key: 'reviewer', width: 18 },
		{ header: 'Fecha decisión', key: 'reviewedAt', width: 15 },
		{ header: 'Motivo de rechazo', key: 'reason', width: 30 },
		{ header: 'Evidencia', key: 'evidence', width: 12 },
		{ header: 'Notas', key: 'notes', width: 24 }
	],
	split: 8,
	includeSummary: true
};

/** Columnas centradas por variante (el resto del bloque se alinea a la izquierda). */
const SIMPLE_CENTER = new Set(['status', 'evidence']);
const EXTENDED_CENTER = new Set([
	'mode',
	'elements',
	'status',
	'requirements',
	'photos',
	'lastDelivery',
	'decision',
	'reviewedAt',
	'evidence'
]);

/** Columnas con ajuste de texto (se calcula su alto de fila). */
const SIMPLE_WRAP = new Set(['building', 'work', 'notes']);
const EXTENDED_WRAP = new Set(['building', 'service', 'work', 'reason', 'notes']);

function columnSet(variant: WorkbookVariant): ColumnSet {
	return variant === 'simple' ? SIMPLE_SET : EXTENDED_SET;
}

const TITLE_FILL = 'FF1B365D';
const INSPECTION_FILL = 'FF4338CA';
const RESULTS_FILL = 'FF0D9488';
const INSPECTION_TINT = 'FFEEF0FB';
const RESULTS_TINT = 'FFE5F5F2';
const TITLE_TINT = 'FFE9EDF4';
const PDF_FILL = 'FFC0392B';
const BORDER_COLOR = 'FFD0D7DE';

/** Alturas de fila (en puntos). */
const TITLE_HEIGHT = 26;
const LEGEND_HEIGHT = 16;
const SUPER_HEIGHT = 16;
const HEADER_HEIGHT = 22;
const ROW_HEIGHT = 22;

/** Color de texto y relleno suave por estado (estático, sin formato condicional). */
const STATUS_STYLE: Record<TargetStatus, { font: string; fill: string }> = {
	approved: { font: 'FF0F7B3A', fill: 'FFE7F6EC' },
	rejected: { font: 'FFB42318', fill: 'FFFEE4E2' },
	in_review: { font: 'FFB54708', fill: 'FFFEF0C7' },
	in_progress: { font: 'FF1D4ED8', fill: 'FFDBEAFE' },
	pending: { font: 'FF475467', fill: 'FFF2F4F7' }
};

interface SuperBlock {
	from: number;
	to: number;
	label: string;
	fill: string;
	tint: string;
}

/** Bloques de superencabezado de una hoja de servicio según su variante. */
function serviceBlocks(variant: WorkbookVariant): SuperBlock[] {
	const set = columnSet(variant);
	return [
		{ from: 1, to: set.split, label: 'Inspección', fill: INSPECTION_FILL, tint: INSPECTION_TINT },
		{
			from: set.split + 1,
			to: set.columns.length,
			label: variant === 'simple' ? 'Evidencia' : 'Resultados y evidencia',
			fill: RESULTS_FILL,
			tint: RESULTS_TINT
		}
	];
}

const SUMMARY_BLOCKS: SuperBlock[] = [
	{ from: 1, to: 2, label: 'Servicio', fill: TITLE_FILL, tint: TITLE_TINT },
	{ from: 3, to: 8, label: 'Avance', fill: TITLE_FILL, tint: TITLE_TINT }
];

/** Tinte claro de la columna (1-based) según el bloque al que pertenece. */
function tintOf(blocks: SuperBlock[], columnIndex: number): string {
	const block = blocks.find((item) => columnIndex >= item.from && columnIndex <= item.to);
	return block?.tint ?? 'FFFFFFFF';
}

/** El libro vive en la raíz del ZIP; los enlaces son relativos a esa raíz. */
function relativeToRoot(plan: ExportPlan, path: string): string {
	const prefix = `${plan.root}/`;
	return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function lastColumnLetter(count: number): string {
	let n = count;
	let letters = '';
	while (n > 0) {
		const rem = (n - 1) % 26;
		letters = String.fromCharCode(65 + rem) + letters;
		n = Math.floor((n - 1) / 26);
	}
	return letters;
}

function sheetName(base: string, used: Set<string>): string {
	const cleaned = (base || 'Servicio')
		.replace(/[\\/*?:[\]]/g, '-')
		.replace(/\s+/g, ' ')
		.trim();
	const capped = sanitizeSegment(cleaned, 'Servicio').slice(0, 31) || 'Servicio';
	let candidate = capped;
	let index = 1;
	while (used.has(candidate.toLowerCase())) {
		const suffix = ` (${index})`;
		candidate = `${capped.slice(0, 31 - suffix.length)}${suffix}`;
		index += 1;
	}
	used.add(candidate.toLowerCase());
	return candidate;
}

function thinBorder(): Partial<ExcelJS.Borders> {
	return {
		top: { style: 'thin', color: { argb: BORDER_COLOR } },
		left: { style: 'thin', color: { argb: BORDER_COLOR } },
		bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
		right: { style: 'thin', color: { argb: BORDER_COLOR } }
	};
}

function formatStamp(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Alto de fila estimado a partir del texto de las columnas con ajuste (sin fórmulas). */
function estimatedHeight(entries: { text: string; width: number }[], base = ROW_HEIGHT): number {
	let lines = 1;
	for (const { text, width } of entries) {
		if (!text) continue;
		const perLine = Math.max(8, Math.floor(width - 2));
		const needed = text.length > perLine ? Math.ceil(text.length / perLine) : 1;
		if (needed > lines) lines = needed;
	}
	return Math.min(88, Math.max(base, lines * 15 + 6));
}

function applyStatusStyle(cell: ExcelJS.Cell, status: TargetStatus): void {
	const style = STATUS_STYLE[status];
	cell.font = { bold: true, color: { argb: style.font } };
	cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
}

/** Chip de PDF: fondo rojo y texto blanco, conservando el hipervínculo. */
function applyPdfStyle(cell: ExcelJS.Cell): void {
	cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
	cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PDF_FILL } };
}

function styleTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, columns: number): void {
	ws.mergeCells(`A1:${lastColumnLetter(columns)}1`);
	ws.mergeCells(`A2:${lastColumnLetter(columns)}2`);
	const titleCell = ws.getCell('A1');
	titleCell.value = title;
	titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
	titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
	titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
	ws.getRow(1).height = TITLE_HEIGHT;
	const subtitleCell = ws.getCell('A2');
	subtitleCell.value = subtitle;
	subtitleCell.font = { italic: true, color: { argb: 'FF444444' } };
	subtitleCell.alignment = { horizontal: 'left', vertical: 'middle' };
	ws.getRow(2).height = LEGEND_HEIGHT;
}

/** Fila de superencabezados: bloques combinados que rotulan cada área de la hoja. */
function styleSuperHeader(ws: ExcelJS.Worksheet, rowNumber: number, blocks: SuperBlock[]): void {
	const row = ws.getRow(rowNumber);
	for (const block of blocks) {
		for (let column = block.from; column <= block.to; column += 1) {
			row.getCell(column).border = thinBorder();
		}
		if (block.to > block.from) ws.mergeCells(rowNumber, block.from, rowNumber, block.to);
		const cell = row.getCell(block.from);
		cell.value = block.label;
		cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: block.fill } };
		cell.alignment = { horizontal: 'center', vertical: 'middle' };
	}
	row.height = SUPER_HEIGHT;
}

function styleHeader(ws: ExcelJS.Worksheet, rowNumber: number, set: ColumnSet): void {
	const row = ws.getRow(rowNumber);
	for (let index = 1; index <= set.columns.length; index += 1) {
		const cell = row.getCell(index);
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: index > set.split ? RESULTS_FILL : INSPECTION_FILL }
		};
		cell.border = thinBorder();
	}
	row.height = HEADER_HEIGHT;
}

function addServiceSheet(
	wb: ExcelJS.Workbook,
	plan: ExportPlan,
	service: { id: string; name: string; buildingName: string | null },
	usedNames: Set<string>,
	variant: WorkbookVariant,
	generatedAt: Date
): void {
	const rows = plan.rows.filter((row) => row.serviceId === service.id);
	if (rows.length === 0) return;
	const set = columnSet(variant);
	const center = variant === 'simple' ? SIMPLE_CENTER : EXTENDED_CENTER;
	const wrap = variant === 'simple' ? SIMPLE_WRAP : EXTENDED_WRAP;
	const blocks = serviceBlocks(variant);

	const ws = wb.addWorksheet(sheetName(service.name, usedNames), {
		views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
		properties: { tabColor: { argb: RESULTS_FILL } }
	});
	// Solo `key`/`width`: los encabezados se escriben explícitamente más abajo.
	ws.columns = set.columns.map(({ key, width }) => ({ key, width }));

	const scopeLabel = plan.kind === 'contract' ? `Contrato: ${plan.title} | ` : '';
	const scopeText = `${scopeLabel}Servicio: ${service.name}${service.buildingName ? ` | Edificio: ${service.buildingName}` : ''}`;
	styleTitle(
		ws,
		'REGISTRO DE EVIDENCIAS',
		`${scopeText} | Generado el ${formatStamp(generatedAt)}`,
		set.columns.length
	);

	styleSuperHeader(ws, 3, blocks);

	const headerRow = ws.getRow(4);
	set.columns.forEach((column, index) => {
		headerRow.getCell(index + 1).value = column.header;
	});
	styleHeader(ws, 4, set);
	ws.autoFilter = {
		from: { row: 4, column: 1 },
		to: { row: 4, column: set.columns.length }
	};

	for (const row of rows) {
		const derived = deriveRow(row);
		const evidence = { text: 'PDF', hyperlink: relativeToRoot(plan, row.pdfPath) };
		const added =
			variant === 'simple'
				? ws.addRow({
						building: service.buildingName ?? 'Sin edificio',
						work: row.workName,
						status: STATUS_LABEL[derived.status],
						evidence,
						notes: ''
					})
				: ws.addRow({
						building: service.buildingName ?? 'Sin edificio',
						service: service.name,
						work: row.workName,
						mode: row.mode === 'direct' ? 'Directo' : 'Dividido',
						elements:
							row.mode === 'divided' ? `${derived.elementApproved}/${derived.elementTotal}` : '—',
						status: STATUS_LABEL[derived.status],
						requirements:
							derived.requiredTotal > 0
								? `${derived.requiredSatisfied}/${derived.requiredTotal}`
								: '—',
						photos: derived.photoCount,
						lastDelivery: derived.lastSubmissionAt ?? null,
						decision:
							derived.decision === 'approved'
								? 'Aprobada'
								: derived.decision === 'rejected'
									? 'Rechazada'
									: derived.status === 'in_review'
										? 'En revisión'
										: '—',
						reviewer: derived.reviewerName ?? '',
						reviewedAt: derived.reviewedAt ?? null,
						reason: derived.rejectionReason ?? '',
						evidence,
						notes: ''
					});

		const wrapEntries: { text: string; width: number }[] = [];
		set.columns.forEach((column, index) => {
			const cell = added.getCell(column.key);
			cell.border = thinBorder();
			cell.alignment = {
				vertical: 'middle',
				horizontal: center.has(column.key) ? 'center' : 'left',
				wrapText: wrap.has(column.key)
			};
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: tintOf(blocks, index + 1) }
			};
			if (wrap.has(column.key) && typeof cell.value === 'string') {
				wrapEntries.push({ text: cell.value, width: column.width });
			}
		});
		added.height = estimatedHeight(wrapEntries);

		applyPdfStyle(added.getCell('evidence'));
		applyStatusStyle(added.getCell('status'), derived.status);

		if (variant === 'extended') {
			added.getCell('lastDelivery').numFmt = 'DD-MM-YYYY';
			added.getCell('reviewedAt').numFmt = 'DD-MM-YYYY';
			const decisionCell = added.getCell('decision');
			if (derived.decision === 'approved') applyStatusStyle(decisionCell, 'approved');
			else if (derived.decision === 'rejected') applyStatusStyle(decisionCell, 'rejected');
			else if (derived.status === 'in_review') applyStatusStyle(decisionCell, 'in_review');
			else applyStatusStyle(decisionCell, 'pending');
		}
	}
}

function addSummarySheet(wb: ExcelJS.Workbook, plan: ExportPlan, generatedAt: Date): void {
	const ws = wb.addWorksheet('Resumen', {
		views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
		properties: { tabColor: { argb: TITLE_FILL } }
	});
	const headers = [
		'Edificio',
		'Servicio',
		'Trabajos',
		'Aprobados',
		'En revisión',
		'Rechazados',
		'Pendientes',
		'% avance'
	];
	const columns: ColumnDef[] = [
		{ header: headers[0], key: 'building', width: 26 },
		{ header: headers[1], key: 'service', width: 30 },
		{ header: headers[2], key: 'works', width: 11 },
		{ header: headers[3], key: 'approved', width: 11 },
		{ header: headers[4], key: 'inReview', width: 12 },
		{ header: headers[5], key: 'rejected', width: 12 },
		{ header: headers[6], key: 'pending', width: 12 },
		{ header: headers[7], key: 'percent', width: 11 }
	];
	ws.columns = columns.map(({ key, width }) => ({ key, width }));

	const label = plan.kind === 'contract' ? `Contrato: ${plan.title}` : plan.title;
	const scopeText = `${label} | Generado el ${formatStamp(generatedAt)}`;
	styleTitle(ws, 'RESUMEN DE EVIDENCIAS', scopeText, headers.length);

	styleSuperHeader(ws, 4, SUMMARY_BLOCKS);

	const headerRow = ws.getRow(5);
	headers.forEach((header, index) => {
		const cell = headerRow.getCell(index + 1);
		cell.value = header;
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
		cell.border = thinBorder();
	});
	headerRow.height = HEADER_HEIGHT;

	const centerKeys = new Set(['works', 'approved', 'inReview', 'rejected', 'pending', 'percent']);
	const wrapKeys = new Set(['building', 'service']);

	let totalWorks = 0;
	let totalApproved = 0;
	for (const service of plan.services) {
		const rows = plan.rows.filter((row) => row.serviceId === service.id);
		if (rows.length === 0) continue;
		let approved = 0;
		let inReview = 0;
		let rejected = 0;
		let pending = 0;
		for (const row of rows) {
			const derived = deriveRow(row);
			switch (derived.status) {
				case 'approved':
					approved += 1;
					break;
				case 'in_review':
					inReview += 1;
					break;
				case 'rejected':
					rejected += 1;
					break;
				default:
					pending += 1;
			}
		}
		totalWorks += rows.length;
		totalApproved += approved;
		const row = ws.addRow({
			building: service.buildingName ?? 'Sin edificio',
			service: service.name,
			works: rows.length,
			approved,
			inReview,
			rejected,
			pending,
			percent: rows.length > 0 ? approved / rows.length : 0
		});

		const wrapEntries: { text: string; width: number }[] = [];
		columns.forEach((column, index) => {
			const cell = row.getCell(column.key);
			cell.border = thinBorder();
			cell.alignment = {
				vertical: 'middle',
				horizontal: centerKeys.has(column.key) ? 'center' : 'left',
				wrapText: wrapKeys.has(column.key)
			};
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: tintOf(SUMMARY_BLOCKS, index + 1) }
			};
			if (wrapKeys.has(column.key) && typeof cell.value === 'string') {
				wrapEntries.push({ text: cell.value, width: column.width });
			}
		});
		row.height = estimatedHeight(wrapEntries);
		row.getCell('percent').numFmt = '0%';
		if (approved > 0) applyStatusStyle(row.getCell('approved'), 'approved');
		if (inReview > 0) applyStatusStyle(row.getCell('inReview'), 'in_review');
		if (rejected > 0) applyStatusStyle(row.getCell('rejected'), 'rejected');
		if (pending > 0) applyStatusStyle(row.getCell('pending'), 'pending');
	}

	const lastDataRow = ws.rowCount;
	if (lastDataRow >= 6) {
		// La regla `dataBar` admite `color` en tiempo de ejecución, pero el tipo
		// publicado de `exceljs@4.4.0` todavía no lo declara.
		ws.addConditionalFormatting({
			ref: `H6:H${lastDataRow}`,
			rules: [
				{
					type: 'dataBar',
					cfvo: [
						{ type: 'num', value: 0 },
						{ type: 'num', value: 1 }
					],
					color: { argb: RESULTS_FILL },
					minLength: 0,
					maxLength: 100,
					gradient: true,
					showValue: true
				} as unknown as ExcelJS.ConditionalFormattingRule
			]
		});
	}

	const totals = ws.addRow({
		building: '',
		service: 'TOTAL',
		works: totalWorks,
		approved: totalApproved,
		inReview: '',
		rejected: '',
		pending: '',
		percent: totalWorks > 0 ? totalApproved / totalWorks : 0
	});
	for (let index = 1; index <= columns.length; index += 1) {
		const cell = totals.getCell(index);
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
		cell.border = thinBorder();
		cell.alignment = {
			vertical: 'middle',
			horizontal: index >= 3 ? 'center' : 'left'
		};
	}
	totals.height = ROW_HEIGHT;
	totals.getCell('percent').numFmt = '0%';
}

/** Genera el XLSX de un plan de exportación en la variante indicada. */
export async function buildWorkbook(
	plan: ExportPlan,
	variant: WorkbookVariant = 'extended'
): Promise<Buffer> {
	const generatedAt = new Date();
	const wb = new ExcelJS.Workbook();
	wb.creator = 'Lumen';
	wb.lastModifiedBy = 'Lumen';
	wb.created = generatedAt;
	wb.modified = generatedAt;
	wb.title = 'Registro de evidencias';
	wb.subject = plan.kind === 'contract' ? `Contrato: ${plan.title}` : plan.title;
	wb.company = 'Lumen';
	wb.description = 'Registro XLSX de evidencias generado por Lumen.';

	const set = columnSet(variant);
	if (set.includeSummary) addSummarySheet(wb, plan, generatedAt);

	const usedNames = new Set<string>(['resumen']);
	for (const service of plan.services) {
		addServiceSheet(wb, plan, service, usedNames, variant, generatedAt);
	}
	// Ámbito de trabajo: si el servicio no aporta filas, se crea su hoja.
	if (wb.worksheets.length === (set.includeSummary ? 1 : 0) && plan.rows.length > 0) {
		const first = plan.rows[0];
		addServiceSheet(
			wb,
			plan,
			{ id: first.serviceId, name: first.serviceName, buildingName: first.buildingName },
			usedNames,
			variant,
			generatedAt
		);
	}

	const buffer = await wb.xlsx.writeBuffer();
	return Buffer.from(buffer);
}
