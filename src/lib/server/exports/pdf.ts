import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import type { Storage } from '#lib/server/storage/storage';
import type { PdfBlock } from '#lib/server/domain/exports';
import { DomainError } from '#lib/server/domain/errors';

/**
 * PDF de evidencia: **sin portada** por trabajo, cabecera corrida y hasta
 * **4 fotografías por página** (2×2). Cada foto lleva su leyenda pegada debajo
 * (`Trabajo · Elemento · Requisito`, sin fecha ni autor). El fondo del contrato
 * se dibuja opaco en todas las páginas, con los márgenes configurados.
 *
 * El PDF recopilado de un servicio reutiliza el mismo layout por trabajo, añade
 * una portada y numera las páginas de forma global.
 */

export interface WorkPdfHeader {
	contractName: string;
	buildingName: string | null;
	serviceName: string;
	workName: string;
	mode: 'direct' | 'divided';
}

export interface PdfMargins {
	/** Milímetros. */
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export const DEFAULT_PDF_MARGINS: PdfMargins = { top: 50, bottom: 50, left: 15, right: 15 };

export interface WorkPdfInput {
	header: WorkPdfHeader;
	blocks: PdfBlock[];
	/** Ruta absoluta del fondo del contrato (PNG) o `null`. */
	backgroundAbsolutePath: string | null;
	/** Márgenes del contrato en milímetros. */
	margins: PdfMargins;
}

export interface WorkPdfOptions {
	/** El PDF recopilado desactiva la numeración por trabajo y la pinta al final. */
	pageNumbers?: boolean;
	/** Añade el título del trabajo al inicio de su primera página. */
	sectionTitle?: boolean;
}

export interface ServicePdfInput {
	contractName: string;
	buildingName: string | null;
	serviceName: string;
	generatedAt?: Date;
	/** Solo trabajos con evidencia aprobada. */
	works: { header: WorkPdfHeader; blocks: PdfBlock[] }[];
	backgroundAbsolutePath: string | null;
	margins: PdfMargins;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const GAP = 12;
/** Puntos por milímetro. */
const MM = 72 / 25.4;
const MAX_COLUMNS = 2;
const MAX_ROWS = 2; // tope: 4 fotografías por página
/** Mínimos para que las fotos se vean: si no caben, se reduce la rejilla. */
const MIN_CELL_WIDTH = 110;
const MIN_ROW_AREA = 130;
const LEGEND_SIZE = 8;
const LEGEND_OFFSET = 2; // pegada a la imagen

const BRAND_COLOR = rgb(30 / 255, 75 / 255, 141 / 255);
const COVER_BACKGROUND = rgb(237 / 255, 242 / 255, 246 / 255);
const HEADER_COLOR = rgb(0.13, 0.15, 0.2);
const MUTED_COLOR = rgb(0.38, 0.42, 0.48);
const LEGEND_COLOR = rgb(0.25, 0.25, 0.3);
const LINE_COLOR = rgb(0.82, 0.82, 0.87);

/** Leyenda de cada foto: trabajo · elemento · requisito (omite lo que no aplique). */
export function photoLegend(
	workName: string,
	elementName: string | null,
	requirementName: string | null
): string {
	return [workName, elementName, requirementName]
		.filter((part): part is string => Boolean(part && part.trim()))
		.join('  ·  ');
}

/** Las fuentes estándar codifican en WinAnsi: se sustituye lo no representable. */
function toWinAnsi(value: string): string {
	return (value ?? '').replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, '?');
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
	const clean = toWinAnsi(text);
	if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
	let cut = clean;
	while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
		cut = cut.slice(0, -1);
	}
	return `${cut}…`;
}

function pageLabelBaseline(margins: PdfMargins): number {
	return Math.max(margins.bottom * MM - 16, 12);
}

/** Numera todas las páginas de `doc` salvo las que se indiquen al inicio. */
function drawPageNumbers(
	doc: PDFDocument,
	font: PDFFont,
	margins: PdfMargins,
	startIndex = 0,
	startNumber = 1
): void {
	const pages = doc.getPages();
	const baseline = pageLabelBaseline(margins);
	for (let index = startIndex; index < pages.length; index += 1) {
		pages[index].drawText(String(startNumber + index - startIndex), {
			x: PAGE_WIDTH / 2 - 4,
			y: baseline,
			size: 8,
			font,
			color: LEGEND_COLOR
		});
	}
}

function drawCover(doc: PDFDocument, input: ServicePdfInput, font: PDFFont, bold: PDFFont): void {
	const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	const left = 56;
	const right = 56;
	const contentWidth = PAGE_WIDTH - left - right;
	const generatedAt = input.generatedAt ?? new Date();
	const photoCount = input.works.reduce(
		(total, work) => total + work.blocks.reduce((sum, block) => sum + block.photos.length, 0),
		0
	);

	page.drawRectangle({
		x: 0,
		y: 0,
		width: PAGE_WIDTH,
		height: PAGE_HEIGHT,
		color: COVER_BACKGROUND
	});
	page.drawRectangle({
		x: 0,
		y: PAGE_HEIGHT - 12,
		width: PAGE_WIDTH,
		height: 12,
		color: BRAND_COLOR
	});

	page.drawText('LUMEN', {
		x: left,
		y: PAGE_HEIGHT - 64,
		size: 10,
		font: bold,
		color: BRAND_COLOR
	});
	page.drawText('EVIDENCIA FOTOGRÁFICA', {
		x: left,
		y: PAGE_HEIGHT - 82,
		size: 8,
		font,
		color: MUTED_COLOR
	});

	page.drawText(fit(input.serviceName, bold, 26, contentWidth), {
		x: left,
		y: 560,
		size: 26,
		font: bold,
		color: HEADER_COLOR
	});

	const location = [
		input.contractName,
		input.buildingName ? `Edificio: ${input.buildingName}` : null
	].filter((part): part is string => Boolean(part && part.trim()));
	if (location.length > 0) {
		page.drawText(fit(location.join('  ·  '), font, 10, contentWidth), {
			x: left,
			y: 534,
			size: 10,
			font,
			color: MUTED_COLOR
		});
	}

	page.drawLine({
		start: { x: left, y: 500 },
		end: { x: PAGE_WIDTH - right, y: 500 },
		thickness: 0.6,
		color: LINE_COLOR
	});

	const summary = [
		['Trabajos incluidos', String(input.works.length)],
		['Fotografías incluidas', String(photoCount)],
		['Generado', generatedAt.toISOString().slice(0, 10)]
	];
	summary.forEach(([label, value], index) => {
		const y = 450 - index * 32;
		page.drawText(label, { x: left, y, size: 9, font, color: MUTED_COLOR });
		page.drawText(value, { x: left + 180, y, size: 11, font: bold, color: HEADER_COLOR });
	});

	page.drawText('Documento generado desde Lumen', {
		x: left,
		y: 56,
		size: 8,
		font,
		color: MUTED_COLOR
	});
}

export async function buildWorkPdf(
	input: WorkPdfInput,
	storage: Storage,
	options: WorkPdfOptions = {}
): Promise<Buffer> {
	const doc = await PDFDocument.create();
	doc.setCreator('Lumen');
	doc.setTitle(input.header.workName);
	doc.setProducer('Lumen');

	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);

	let background: PDFImage | null = null;
	if (input.backgroundAbsolutePath) {
		try {
			background = await doc.embedPng(await readFile(input.backgroundAbsolutePath));
		} catch {
			background = null; // Un fondo ilegible no debe impedir la exportación.
		}
	}

	const imageCache = new Map<string, PDFImage>();
	async function embedPhoto(storagePath: string): Promise<PDFImage | null> {
		const cached = imageCache.get(storagePath);
		if (cached) return cached;
		try {
			const image = await doc.embedJpg(await readFile(storage.absolute(storagePath)));
			imageCache.set(storagePath, image);
			return image;
		} catch {
			return null;
		}
	}

	const marginTop = input.margins.top * MM;
	const marginBottom = input.margins.bottom * MM;
	const marginLeft = input.margins.left * MM;
	const marginRight = input.margins.right * MM;
	const contentWidth = PAGE_WIDTH - marginLeft - marginRight;
	const contentTop = PAGE_HEIGHT - marginTop;
	const contentBottom = marginBottom;
	const available = contentTop - contentBottom;

	// Si los márgenes dejan poco ancho o alto, se reduce la rejilla (tope 4 fotos).
	const columns = contentWidth - GAP >= MAX_COLUMNS * MIN_CELL_WIDTH ? MAX_COLUMNS : 1;
	const cellWidth = (contentWidth - GAP * (columns - 1)) / columns;
	const rowsPerPage = available >= MAX_ROWS * MIN_ROW_AREA ? MAX_ROWS : 1;
	const rowArea = available / rowsPerPage;
	const imageArea = Math.max(60, rowArea - (LEGEND_SIZE + LEGEND_OFFSET + 6));
	const headerBaseline = contentTop + 16;
	const sectionTitleBaseline = contentTop + 32;
	const sectionMetaBaseline = contentTop + 18;
	const sectionLineBaseline = contentTop + 10;
	const hasRoomForSectionTitle = marginTop >= 22 * MM;

	let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	let rowsOnPage = 0;

	const drawChrome = (firstPageOfSection: boolean) => {
		// Fondo opaco, sin velo: se dibuja tal cual a página completa.
		if (background) {
			page.drawImage(background, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
		}

		if (options.sectionTitle && firstPageOfSection && hasRoomForSectionTitle) {
			const meta = [
				input.header.contractName,
				input.header.buildingName,
				input.header.serviceName
			].filter((part): part is string => Boolean(part && part.trim()));
			page.drawText(fit(input.header.workName, bold, 12, contentWidth), {
				x: marginLeft,
				y: sectionTitleBaseline,
				size: 12,
				font: bold,
				color: HEADER_COLOR
			});
			if (meta.length > 0) {
				page.drawText(fit(meta.join('  ·  '), font, 8, contentWidth), {
					x: marginLeft,
					y: sectionMetaBaseline,
					size: 8,
					font,
					color: MUTED_COLOR
				});
			}
			page.drawLine({
				start: { x: marginLeft, y: sectionLineBaseline },
				end: { x: PAGE_WIDTH - marginRight, y: sectionLineBaseline },
				thickness: 0.7,
				color: BRAND_COLOR
			});
		} else {
			const parts = [
				input.header.contractName,
				input.header.buildingName,
				input.header.serviceName,
				input.header.workName
			].filter((part): part is string => Boolean(part && part.trim()));
			page.drawText(fit(parts.join('  ·  '), bold, 9, contentWidth), {
				x: marginLeft,
				y: headerBaseline,
				size: 9,
				font: bold,
				color: HEADER_COLOR
			});
			page.drawLine({
				start: { x: marginLeft, y: headerBaseline - 10 },
				end: { x: PAGE_WIDTH - marginRight, y: headerBaseline - 10 },
				thickness: 0.5,
				color: LINE_COLOR
			});
		}
		rowsOnPage = 0;
	};

	const addPage = () => {
		page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		drawChrome(false);
	};

	drawChrome(true);

	// Lista plana de fotos con su leyenda.
	const entries = input.blocks.flatMap((block) =>
		block.photos.map((photo) => ({
			storagePath: photo.storagePath,
			legend: photoLegend(input.header.workName, block.elementName, block.requirementName)
		}))
	);

	for (let index = 0; index < entries.length; index += columns) {
		if (rowsOnPage >= rowsPerPage) addPage();
		const rowEntries = entries.slice(index, index + columns);
		const rowTop = contentTop - rowsOnPage * rowArea;
		for (let column = 0; column < rowEntries.length; column += 1) {
			const entry = rowEntries[column];
			const x = marginLeft + column * (cellWidth + GAP);
			const image = await embedPhoto(entry.storagePath);
			if (!image) continue;
			const scale = Math.min(cellWidth / image.width, imageArea / image.height);
			const width = image.width * scale;
			const height = image.height * scale;
			const imageX = x + (cellWidth - width) / 2;
			const imageTop = rowTop - (imageArea - height) / 2;
			const imageY = imageTop - height;
			page.drawImage(image, { x: imageX, y: imageY, width, height });
			// Leyenda pegada al borde inferior de la imagen.
			page.drawText(fit(entry.legend, font, LEGEND_SIZE, cellWidth), {
				x: imageX,
				y: imageY - LEGEND_SIZE - LEGEND_OFFSET,
				size: LEGEND_SIZE,
				font,
				color: LEGEND_COLOR
			});
		}
		rowsOnPage += 1;
	}

	if (options.pageNumbers !== false) {
		drawPageNumbers(doc, font, input.margins);
	}

	const bytes = await doc.save();
	return Buffer.from(bytes);
}

/**
 * PDF recopilado de un servicio: portada y una sección por trabajo. Solo debe
 * recibir trabajos con evidencia aprobada; si no hay ninguno, es un error de
 * negocio.
 */
export async function buildServicePdf(input: ServicePdfInput, storage: Storage): Promise<Buffer> {
	if (input.works.length === 0) {
		throw new DomainError(409, 'El servicio no tiene evidencia aprobada para generar el PDF.');
	}

	const doc = await PDFDocument.create();
	doc.setCreator('Lumen');
	doc.setTitle(input.serviceName);
	doc.setProducer('Lumen');

	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	drawCover(doc, input, font, bold);

	for (const work of input.works) {
		if (!work.blocks.some((block) => block.photos.length > 0)) continue;
		const workBuffer = await buildWorkPdf(
			{
				header: work.header,
				blocks: work.blocks,
				backgroundAbsolutePath: input.backgroundAbsolutePath,
				margins: input.margins
			},
			storage,
			{ pageNumbers: false, sectionTitle: true }
		);
		const workDoc = await PDFDocument.load(workBuffer);
		const pages = await doc.copyPages(workDoc, workDoc.getPageIndices());
		for (const page of pages) doc.addPage(page);
	}

	if (doc.getPageCount() === 1) {
		throw new DomainError(409, 'El servicio no tiene evidencia aprobada para generar el PDF.');
	}

	drawPageNumbers(doc, font, input.margins, 1, 1);

	const bytes = await doc.save();
	return Buffer.from(bytes);
}
