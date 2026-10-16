import { eq } from 'drizzle-orm';
import { evidenceSubmissions } from '#lib/server/db/schema';
import type { Database } from '#lib/server/db';
import { DomainError } from './errors';
import {
	additionalFolderLabel,
	loadSubmissionPhotos,
	photosToFiles,
	type ArchiveFile
} from './exports-shared';
import { getTargetContext } from './targets';

/**
 * ZIP de una entrega (snapshot inmutable): grupos, orden y autores congelados.
 * Extraído de `exports.ts`; se re-exporta desde allí.
 */

export interface SubmissionArchive {
	submissionId: string;
	sequenceNo: number;
	serviceId: string;
	fileName: string;
	files: ArchiveFile[];
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
