import { asc, eq, inArray } from 'drizzle-orm';
import { photos, submissionPhotos } from '#lib/server/db/schema';
import { ADDITIONAL_GROUP_LABEL, NO_REQUIREMENT_GROUP_LABEL } from '#lib/types';
import type { Database } from '#lib/server/db';
import { NameRegistry } from '#lib/server/exports/names';

/**
 * Piezas compartidas por el ZIP de entrega (`exports-submission`) y el
 * constructor de plan (`exports`). Extraído para evitar dependencias circulares.
 */

export interface ArchiveFile {
	/** Ruta dentro del ZIP (POSIX, sin traversal). */
	path: string;
	/** Ruta relativa del binario dentro del almacenamiento. */
	storagePath: string;
}

export interface SubmissionPhotoRow {
	groupOrder: number;
	photoOrder: number;
	groupKind: 'requirement' | 'additional';
	requirementName: string | null;
	storagePath: string;
	uploadedAt: Date | null;
	uploadedByName: string | null;
}

export async function loadSubmissionPhotos(
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
			storagePath: photos.storagePath,
			uploadedAt: submissionPhotos.photoUploadedAtSnapshot,
			uploadedByName: submissionPhotos.photoUploadedByName
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
			storagePath: row.storagePath,
			uploadedAt: row.uploadedAt,
			uploadedByName: row.uploadedByName
		});
		bySubmission.set(row.submissionId, list);
	}
	return bySubmission;
}

/** Etiqueta de carpeta para el grupo sin requisito según haya o no grupos de requisito. */
export function additionalFolderLabel(rows: SubmissionPhotoRow[]): string {
	return rows.some((row) => row.requirementName !== null)
		? ADDITIONAL_GROUP_LABEL
		: NO_REQUIREMENT_GROUP_LABEL;
}

/** Construye las rutas de un ZIP a partir de las fotos de una entrega. */
export function photosToFiles(
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

export function getRegistry(map: Map<string, NameRegistry>, parent: string): NameRegistry {
	const existing = map.get(parent);
	if (existing) return existing;
	const created = new NameRegistry();
	map.set(parent, created);
	return created;
}
