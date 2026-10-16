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

function columnSet(variant: WorkbookVariant): ColumnSet {
	return variant === 'simple' ? SIMPLE_SET : EXTENDED_SET;
}

const TITLE_FILL = 'FF1B365D';
const INSPECTION_FILL = 'FF4338CA';
const RESULTS_FILL = 'FF0D9488';
const LINK_COLOR = 'FF0563C1';

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

function styleTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, columns: number): void {
	ws.mergeCells(`A1:${lastColumnLetter(columns)}1`);
	ws.mergeCells(`A2:${lastColumnLetter(columns)}2`);
	const titleCell = ws.getCell('A1');
	titleCell.value = title;
	titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
	titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
	titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
	ws.getRow(1).height = 26;
	const subtitleCell = ws.getCell('A2');
	subtitleCell.value = subtitle;
	subtitleCell.font = { italic: true, color: { argb: 'FF444444' } };
	subtitleCell.alignment = { horizontal: 'left', vertical: 'middle' };
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
			fgColor: { argb: index <= set.split ? INSPECTION_FILL : RESULTS_FILL }
		};
	}
	row.height = 20;
}

function addServiceSheet(
	wb: ExcelJS.Workbook,
	plan: ExportPlan,
	service: { id: string; name: string; buildingName: string | null },
	usedNames: Set<string>,
	variant: WorkbookVariant
): void {
	const rows = plan.rows.filter((row) => row.serviceId === service.id);
	if (rows.length === 0) return;
	const set = columnSet(variant);

	const ws = wb.addWorksheet(sheetName(service.name, usedNames), {
		views: [{ state: 'frozen', ySplit: 3 }]
	});
	ws.columns = set.columns;

	const scopeLabel = plan.kind === 'contract' ? `Contrato: ${plan.title} | ` : '';
	styleTitle(
		ws,
		'REGISTRO DE EVIDENCIAS',
		`${scopeLabel}Servicio: ${service.name}${service.buildingName ? ` | Edificio: ${service.buildingName}` : ''}`,
		set.columns.length
	);

	const headerRow = ws.getRow(3);
	set.columns.forEach((column, index) => {
		headerRow.getCell(index + 1).value = column.header;
	});
	styleHeader(ws, 3, set);
	ws.autoFilter = {
		from: { row: 3, column: 1 },
		to: { row: 3, column: set.columns.length }
	};

	for (const row of rows) {
		const derived = deriveRow(row);
		const evidence = { text: 'PDF', hyperlink: relativeToRoot(plan, row.pdfPath) };

		if (variant === 'simple') {
			const added = ws.addRow({
				building: service.buildingName ?? 'Sin edificio',
				work: row.workName,
				status: STATUS_LABEL[derived.status],
				evidence,
				notes: ''
			});
			added.getCell('status').alignment = { horizontal: 'center' };
			added.getCell('evidence').font = { color: { argb: LINK_COLOR }, underline: true, bold: true };
			added.getCell('evidence').alignment = { horizontal: 'center' };
			continue;
		}

		const added = ws.addRow({
			building: service.buildingName ?? 'Sin edificio',
			service: service.name,
			work: row.workName,
			mode: row.mode === 'direct' ? 'Directo' : 'Dividido',
			elements: row.mode === 'divided' ? `${derived.elementApproved}/${derived.elementTotal}` : '—',
			status: STATUS_LABEL[derived.status],
			requirements:
				derived.requiredTotal > 0 ? `${derived.requiredSatisfied}/${derived.requiredTotal}` : '—',
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

		added.getCell('lastDelivery').numFmt = 'DD-MM-YYYY';
		added.getCell('reviewedAt').numFmt = 'DD-MM-YYYY';
		added.getCell('evidence').font = { color: { argb: LINK_COLOR }, underline: true, bold: true };
		added.getCell('evidence').alignment = { horizontal: 'center' };
		added.getCell('status').alignment = { horizontal: 'center' };
		added.getCell('mode').alignment = { horizontal: 'center' };
	}
}

function addSummarySheet(wb: ExcelJS.Workbook, plan: ExportPlan): void {
	const ws = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 4 }] });
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
	ws.columns = [
		{ key: 'building', width: 26 },
		{ key: 'service', width: 30 },
		{ key: 'works', width: 11 },
		{ key: 'approved', width: 11 },
		{ key: 'inReview', width: 12 },
		{ key: 'rejected', width: 12 },
		{ key: 'pending', width: 12 },
		{ key: 'percent', width: 11 }
	];

	const label = plan.kind === 'contract' ? `Contrato: ${plan.title}` : plan.title;
	styleTitle(ws, 'RESUMEN DE EVIDENCIAS', label, headers.length);

	const headerRow = ws.getRow(4);
	headers.forEach((header, index) => {
		const cell = headerRow.getCell(index + 1);
		cell.value = header;
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
	});
	headerRow.height = 20;

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
		row.getCell('percent').numFmt = '0%';
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
	totals.font = { bold: true };
	totals.getCell('percent').numFmt = '0%';
}

/** Genera el XLSX de un plan de exportación en la variante indicada. */
export async function buildWorkbook(
	plan: ExportPlan,
	variant: WorkbookVariant = 'extended'
): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'Lumen';
	wb.created = new Date();

	const set = columnSet(variant);
	if (set.includeSummary) addSummarySheet(wb, plan);

	const usedNames = new Set<string>(['resumen']);
	for (const service of plan.services) {
		addServiceSheet(wb, plan, service, usedNames, variant);
	}
	// Ámbito de trabajo: si el servicio no aporta filas, se crea su hoja.
	if (wb.worksheets.length === (set.includeSummary ? 1 : 0) && plan.rows.length > 0) {
		const first = plan.rows[0];
		addServiceSheet(
			wb,
			plan,
			{ id: first.serviceId, name: first.serviceName, buildingName: first.buildingName },
			usedNames,
			variant
		);
	}

	const buffer = await wb.xlsx.writeBuffer();
	return Buffer.from(buffer);
}
