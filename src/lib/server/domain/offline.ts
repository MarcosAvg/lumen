import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { catalogItems, evidenceTargets, photoRequirements } from '#lib/server/db/schema';
import type { ServiceLifecycle, SessionUser, TargetStatus, WorkMode } from '#lib/types';
import { listServicesForUser } from './services';
import { getServiceProgress, listElementsDetailed, listWorksDetailed } from './works';

export interface OfflineRequirement {
	id: string;
	name: string;
	isRequired: boolean;
	sortOrder: number;
}

export interface OfflineElement {
	id: string;
	name: string;
	description: string | null;
	status: TargetStatus;
	requirements: OfflineRequirement[];
}

export interface OfflineWork {
	id: string;
	name: string;
	mode: WorkMode;
	description: string | null;
	workStatus: TargetStatus | null;
	approved: boolean;
	elementCount: number;
	approvedElements: number;
	/** Requisitos del objetivo cuando el trabajo es directo. */
	requirements: OfflineRequirement[];
	elements: OfflineElement[];
}

export interface OfflineService {
	id: string;
	name: string;
	description: string | null;
	lifecycle: ServiceLifecycle;
	contractName: string;
	buildingName: string | null;
	progress: {
		totalTargets: number;
		approvedTargets: number;
		percent: number;
		completed: boolean;
	};
	works: OfflineWork[];
}

export interface OfflineSnapshot {
	generatedAt: string;
	user: {
		id: string;
		displayName: string;
		role: SessionUser['role'];
	};
	services: OfflineService[];
}

/**
 * Snapshot de solo lectura para técnicos y supervisores. No incluye fotos ni
 * datos de administración: solo servicios asignados y su estructura/estado.
 */
export async function getOfflineSnapshot(
	db: Database,
	user: SessionUser
): Promise<OfflineSnapshot> {
	const services = await listServicesForUser(db, user);

	const snapshotServices = await Promise.all(
		services.map(async (service) => {
			const [works, progress] = await Promise.all([
				listWorksDetailed(db, service.id),
				getServiceProgress(db, service.id)
			]);

			const snapshotWorks = await Promise.all(
				works.map(async (work) => {
					const elements = work.mode === 'divided' ? await listElementsDetailed(db, work.id) : [];
					const elementIds = elements.map((element) => element.id);

					const targets =
						work.mode === 'direct'
							? await db
									.select({
										id: evidenceTargets.id,
										workId: evidenceTargets.workId,
										elementId: evidenceTargets.elementId
									})
									.from(evidenceTargets)
									.where(eq(evidenceTargets.workId, work.id))
							: elementIds.length > 0
								? await db
										.select({
											id: evidenceTargets.id,
											workId: evidenceTargets.workId,
											elementId: evidenceTargets.elementId
										})
										.from(evidenceTargets)
										.where(inArray(evidenceTargets.elementId, elementIds))
								: [];

					const requirementsByTarget = new Map<string, OfflineRequirement[]>();
					if (targets.length > 0) {
						const rows = await db
							.select({
								targetId: photoRequirements.targetId,
								id: photoRequirements.id,
								name: sql<string>`coalesce(${catalogItems.name}, ${photoRequirements.customName})`,
								isRequired: photoRequirements.isRequired,
								sortOrder: photoRequirements.sortOrder
							})
							.from(photoRequirements)
							.leftJoin(catalogItems, eq(catalogItems.id, photoRequirements.catalogItemId))
							.where(
								inArray(
									photoRequirements.targetId,
									targets.map((target) => target.id)
								)
							)
							.orderBy(asc(photoRequirements.sortOrder), asc(photoRequirements.createdAt));
						for (const row of rows) {
							const list = requirementsByTarget.get(row.targetId) ?? [];
							list.push({
								id: row.id,
								name: row.name,
								isRequired: row.isRequired,
								sortOrder: row.sortOrder
							});
							requirementsByTarget.set(row.targetId, list);
						}
					}

					const directTarget = targets.find((target) => target.workId === work.id);
					return {
						id: work.id,
						name: work.name,
						mode: work.mode,
						description: work.description,
						workStatus: work.workStatus,
						approved: work.approved,
						elementCount: work.elementCount,
						approvedElements: work.approvedElements,
						requirements: directTarget ? (requirementsByTarget.get(directTarget.id) ?? []) : [],
						elements: elements.map((element) => {
							const target = targets.find((row) => row.elementId === element.id);
							return {
								id: element.id,
								name: element.name,
								description: element.description,
								status: element.status,
								requirements: target ? (requirementsByTarget.get(target.id) ?? []) : []
							};
						})
					} satisfies OfflineWork;
				})
			);

			return {
				id: service.id,
				name: service.name,
				description: service.description,
				lifecycle: service.lifecycle,
				contractName: service.contractName,
				buildingName: service.buildingName,
				progress: {
					totalTargets: progress.totalTargets,
					approvedTargets: progress.approvedTargets,
					percent: progress.percent,
					completed: progress.completed
				},
				works: snapshotWorks
			} satisfies OfflineService;
		})
	);

	return {
		generatedAt: new Date().toISOString(),
		user: {
			id: user.id,
			displayName: user.displayName,
			role: user.role
		},
		services: snapshotServices
	};
}
