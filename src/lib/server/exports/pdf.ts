import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import type { Storage } from '#lib/server/storage/storage';
import type { PdfBlock } from '#lib/server/domain/exports';

/**
 * PDF de evidencia de un trabajo: **sin portada**, cabecera corrida y hasta
 * **4 fotografías por página** (2×2). Cada foto lleva su **leyenda pegada debajo**
 * (`Trabajo · Elemento · Requisito`, sin fecha ni autor). El fondo del contrato
 * se dibuja **opaco** en todas las páginas, con márgenes amplios (5 cm).
 */

export interface WorkPdfHeader {
	contractName: string;
	buildingName: string | null;
	serviceName: string;
	workName: string;
	mode: 'direct' | 'divided';
}

export interface WorkPdfInput {
	header: WorkPdfHeader;
	blocks: PdfBlock[];
	/** Ruta absoluta del fondo del contrato (PNG) o `null`. */
	backgroundAbsolutePath: string | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 40;
/** 5 cm aproximadamente, arriba y abajo. */
const MARGIN_TOP = 141.7;
const MARGIN_BOTTOM = 141.7;
const GAP = 12;
const COLUMNS = 2;
const ROWS_PER_PAGE = 2; // máximo 4 fotografías por página
const LEGEND_SIZE = 8;
const LEGEND_OFFSET = 2; // pegada a la imagen

const HEADER_COLOR = rgb(0.13, 0.15, 0.2);
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

export async function buildWorkPdf(input: WorkPdfInput, storage: Storage): Promise<Buffer> {
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

	const contentWidth = PAGE_WIDTH - MARGIN_X * 2;
	const cellWidth = (contentWidth - GAP) / COLUMNS;
	const contentTop = PAGE_HEIGHT - MARGIN_TOP;
	const available = contentTop - MARGIN_BOTTOM;
	// Reparte las filas dentro del área útil para dejar 5 cm arriba y abajo.
	const rowArea = available / ROWS_PER_PAGE;
	const imageArea = rowArea - (LEGEND_SIZE + LEGEND_OFFSET + 6);

	let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	let rowsOnPage = 0;

	const drawChrome = () => {
		// Fondo opaco, sin velo: se dibuja tal cual a página completa.
		if (background) {
			page.drawImage(background, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
		}
		const parts = [
			input.header.contractName,
			input.header.buildingName,
			input.header.serviceName,
			input.header.workName
		].filter((part): part is string => Boolean(part && part.trim()));
		page.drawText(fit(parts.join('  ·  '), bold, 9, contentWidth), {
			x: MARGIN_X,
			y: PAGE_HEIGHT - 96,
			size: 9,
			font: bold,
			color: HEADER_COLOR
		});
		page.drawLine({
			start: { x: MARGIN_X, y: PAGE_HEIGHT - 106 },
			end: { x: PAGE_WIDTH - MARGIN_X, y: PAGE_HEIGHT - 106 },
			thickness: 0.5,
			color: LINE_COLOR
		});
		rowsOnPage = 0;
	};

	const addPage = () => {
		if (doc.getPageCount() > 0) {
			page.drawText(String(doc.getPageCount()), {
				x: PAGE_WIDTH / 2 - 4,
				y: 60,
				size: 8,
				font,
				color: LEGEND_COLOR
			});
		}
		page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		drawChrome();
	};

	drawChrome();

	// Lista plana de fotos con su leyenda.
	const entries = input.blocks.flatMap((block) =>
		block.photos.map((photo) => ({
			storagePath: photo.storagePath,
			legend: photoLegend(input.header.workName, block.elementName, block.requirementName)
		}))
	);

	for (let index = 0; index < entries.length; index += COLUMNS) {
		if (rowsOnPage >= ROWS_PER_PAGE) addPage();
		const rowEntries = entries.slice(index, index + COLUMNS);
		const rowTop = contentTop - rowsOnPage * rowArea;
		for (let column = 0; column < rowEntries.length; column += 1) {
			const entry = rowEntries[column];
			const x = MARGIN_X + column * (cellWidth + GAP);
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

	// Número de página en la última página (las anteriores lo reciben al pasar).
	page.drawText(String(doc.getPageCount()), {
		x: PAGE_WIDTH / 2 - 4,
		y: 60,
		size: 8,
		font,
		color: LEGEND_COLOR
	});

	const bytes = await doc.save();
	return Buffer.from(bytes);
}
