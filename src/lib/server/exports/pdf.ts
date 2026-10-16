import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import type { Storage } from '#lib/server/storage/storage';
import type { PdfBlock, PdfBlockPhoto } from '#lib/server/domain/exports';

/**
 * PDF de evidencia de un trabajo: **sin portada**, con cabecera corrida y
 * bloques (elemento/requisito) de hasta **4 fotografías por página** (2×2),
 * cada una con su pie (requisito · fecha · autor). El fondo del contrato se
 * dibuja en todas las páginas con un panel claro semitransparente encima.
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
const MARGIN = 40;
const TOP = 58;
const BOTTOM = 46;
const GAP = 12;
const COLUMNS = 2;
const ROWS_PER_PAGE = 2; // máximo 4 fotografías por página
const CAPTION_HEIGHT = 18;

const HEADER_COLOR = rgb(0.13, 0.15, 0.2);
const HEADING_COLOR = rgb(0.1, 0.1, 0.15);
const CAPTION_COLOR = rgb(0.38, 0.38, 0.44);
const LINE_COLOR = rgb(0.82, 0.82, 0.87);

/** Las fuentes estándar codifican en WinAnsi: se sustituye lo no representable. */
function toWinAnsi(value: string): string {
	return (value ?? '').replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, '?');
}

function formatDate(value: Date | null): string {
	if (!value) return '';
	const date = new Date(value);
	const dd = String(date.getDate()).padStart(2, '0');
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	return `${dd}-${mm}-${date.getFullYear()}`;
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

	const contentWidth = PAGE_WIDTH - MARGIN * 2;
	const cellWidth = (contentWidth - GAP) / COLUMNS;
	const cellHeight = cellWidth * 0.75;
	const rowHeight = cellHeight + CAPTION_HEIGHT;

	let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	let cursorY = 0;
	let rowsOnPage = 0;

	const drawHeader = () => {
		if (background) {
			page.drawImage(background, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
		}
		// Panel claro para que fotos y texto se lean sobre cualquier fondo.
		page.drawRectangle({
			x: 0,
			y: 0,
			width: PAGE_WIDTH,
			height: PAGE_HEIGHT,
			color: rgb(1, 1, 1),
			opacity: 0.88
		});
		const parts = [
			input.header.contractName,
			input.header.buildingName,
			input.header.serviceName,
			input.header.workName
		].filter((part): part is string => Boolean(part && part.trim()));
		page.drawText(fit(parts.join('  ·  '), bold, 9, contentWidth), {
			x: MARGIN,
			y: PAGE_HEIGHT - 32,
			size: 9,
			font: bold,
			color: HEADER_COLOR
		});
		page.drawLine({
			start: { x: MARGIN, y: PAGE_HEIGHT - 40 },
			end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 40 },
			thickness: 0.5,
			color: LINE_COLOR
		});
		cursorY = PAGE_HEIGHT - TOP;
		rowsOnPage = 0;
	};

	const addPage = () => {
		if (doc.getPageCount() > 0) {
			page.drawText(String(doc.getPageCount()), {
				x: PAGE_WIDTH / 2 - 4,
				y: 24,
				size: 8,
				font,
				color: CAPTION_COLOR
			});
		}
		page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		drawHeader();
	};

	drawHeader();

	for (const block of input.blocks) {
		if (block.photos.length === 0) continue;
		const heading =
			[block.elementName, block.requirementName].filter(Boolean).join('  ·  ') || 'Fotografías';

		// El encabezado de sección necesita sitio para él y al menos una fila.
		if (rowsOnPage >= ROWS_PER_PAGE || cursorY - 24 - rowHeight < BOTTOM) addPage();
		page.drawText(fit(heading, bold, 11, contentWidth), {
			x: MARGIN,
			y: cursorY - 11,
			size: 11,
			font: bold,
			color: HEADING_COLOR
		});
		cursorY -= 22;

		for (let index = 0; index < block.photos.length; index += COLUMNS) {
			const rowPhotos = block.photos.slice(index, index + COLUMNS);
			if (rowsOnPage >= ROWS_PER_PAGE || cursorY - rowHeight < BOTTOM) addPage();
			const rowTop = cursorY;
			for (let column = 0; column < rowPhotos.length; column += 1) {
				const photo: PdfBlockPhoto = rowPhotos[column];
				const x = MARGIN + column * (cellWidth + GAP);
				const image = await embedPhoto(photo.storagePath);
				if (image) {
					const scale = Math.min(cellWidth / image.width, cellHeight / image.height);
					const width = image.width * scale;
					const height = image.height * scale;
					page.drawImage(image, {
						x: x + (cellWidth - width) / 2,
						y: rowTop - cellHeight + (cellHeight - height) / 2,
						width,
						height
					});
				}
				const caption = [formatDate(photo.uploadedAt), photo.uploadedByName]
					.filter(Boolean)
					.join(' · ');
				if (caption) {
					page.drawText(fit(caption, font, 7, cellWidth), {
						x,
						y: rowTop - cellHeight - 9,
						size: 7,
						font,
						color: CAPTION_COLOR
					});
				}
			}
			cursorY = rowTop - rowHeight;
			rowsOnPage += 1;
		}
	}

	// Número de página en la última página (las anteriores lo reciben al pasar).
	page.drawText(String(doc.getPageCount()), {
		x: PAGE_WIDTH / 2 - 4,
		y: 24,
		size: 8,
		font,
		color: CAPTION_COLOR
	});

	const bytes = await doc.save();
	return Buffer.from(bytes);
}
