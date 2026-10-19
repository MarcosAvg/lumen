import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { catalogItems, elements, evidenceTargets, services, works } from '#lib/server/db/schema';
import type { WorkMode } from '#lib/types';
import { recordAudit } from './audit';
import { assertCatalogItemAvailableForService } from './catalog-scope';
import { DomainError } from './errors';
import { insertRequirements, type RequirementInput } from './requirements';
import { visibleWorkName } from './works-shared';

/**
 * Generación masiva de estructura (trabajos/elementos/requisitos) a partir de
 * catálogos. Extraído de `works.ts`; se re-exporta desde allí.
 */

// --- Generación masiva -------------------------------------------------------

export interface GenerationElement {
	catalogItemId: string | null;
	name: string;
	include: boolean;
}

export interface GenerationWork {
	catalogItemId: string | null;
	name: string;
	include: boolean;
	elements: GenerationElement[];
}

export interface GenerationPlan {
	works: GenerationWork[];
	totalWorks: number;
	totalElements: number;
	warnings: string[];
}

export interface PlanGenerationInput {
	serviceId: string;
	workItemIds: string[];
	elementItemIds: string[];
}

/**
 * Construye (sin escribir) la estructura propuesta: cada trabajo seleccionado con
 * los elementos elegidos. Si existen relaciones entre ítems de los catálogos,
 * limitan los elementos de ese trabajo; si no, se aplican todos a cada trabajo.
 */
export async function planGeneration(
	db: Database,
	input: PlanGenerationInput
): Promise<GenerationPlan> {
	const [service] = await db
		.select({ id: services.id })
		.from(services)
		.where(eq(services.id, input.serviceId))
		.limit(1);
	if (!service) throw new DomainError(404, 'Servicio no encontrado.');

	const workItems = input.workItemIds.length
		? await db
				.select({ id: catalogItems.id, name: catalogItems.name })
				.from(catalogItems)
				.where(inArray(catalogItems.id, input.workItemIds))
		: [];
	if (workItems.length === 0) {
		throw new DomainError(400, 'Selecciona al menos un trabajo de catálogo.');
	}

	const elementItems = input.elementItemIds.length
		? await db
				.select({ id: catalogItems.id, name: catalogItems.name })
				.from(catalogItems)
				.where(inArray(catalogItems.id, input.elementItemIds))
		: [];

	const workOrder = new Map(input.workItemIds.map((id, index) => [id, index]));
	const elementOrder = new Map(input.elementItemIds.map((id, index) => [id, index]));
	workItems.sort((a, b) => (workOrder.get(a.id) ?? 0) - (workOrder.get(b.id) ?? 0));
	elementItems.sort((a, b) => (elementOrder.get(a.id) ?? 0) - (elementOrder.get(b.id) ?? 0));

	for (const item of [...workItems, ...elementItems]) {
		await assertCatalogItemAvailableForService(db, input.serviceId, item.id);
	}

	const existingNames = new Set(
		(
			await db
				.select({ name: visibleWorkName })
				.from(works)
				.leftJoin(catalogItems, eq(catalogItems.id, works.catalogItemId))
				.where(eq(works.serviceId, input.serviceId))
		).map((row) => row.name.trim().toLowerCase())
	);

	const warnings: string[] = [];
	const seen = new Set<string>();
	let totalElements = 0;

	if (workItems.length > 1 && elementItems.length > 1) {
		warnings.push(
			'Los elementos seleccionados se aplicarán a todos los trabajos. Revisa la vista previa y quita los que no correspondan.'
		);
	}

	const planWorks: GenerationWork[] = workItems.map((workItem) => {
		const elementList = elementItems.map((item) => ({
			catalogItemId: item.id,
			name: item.name,
			include: true
		}));
		totalElements += elementList.length;

		const key = workItem.name.trim().toLowerCase();
		if (seen.has(key))
			warnings.push(`Nombre de trabajo repetido en la propuesta: «${workItem.name}».`);
		seen.add(key);
		if (existingNames.has(key)) {
			warnings.push(`El servicio ya tiene un trabajo llamado «${workItem.name}».`);
		}

		return {
			catalogItemId: workItem.id,
			name: workItem.name,
			include: true,
			elements: elementList
		};
	});

	return { works: planWorks, totalWorks: planWorks.length, totalElements, warnings };
}

export interface ApplyGenerationInput {
	serviceId: string;
	works: GenerationWork[];
	/** Requisitos a aplicar a cada objetivo creado (directos y elementos). */
	requirements?: RequirementInput[];
	requirementIsRequired?: boolean;
	actorId: string;
}

export interface ApplyGenerationResult {
	worksCreated: number;
	elementsCreated: number;
}

export async function applyGeneration(
	db: Database,
	input: ApplyGenerationInput
): Promise<ApplyGenerationResult> {
	return db.transaction(async (tx) => {
		const [service] = await tx
			.select({ id: services.id, lifecycle: services.lifecycle })
			.from(services)
			.where(eq(services.id, input.serviceId))
			.limit(1);
		if (!service) throw new DomainError(404, 'Servicio no encontrado.');
		if (service.lifecycle === 'archived') {
			throw new DomainError(409, 'Un servicio archivado no admite cambios de estructura.');
		}

		const includedWorks = input.works.filter((work) => work.include && work.name.trim());
		if (includedWorks.length === 0) {
			throw new DomainError(400, 'No hay trabajos seleccionados para generar.');
		}

		const [base] = await tx
			.select({ value: sql<number>`coalesce(max(${works.sortOrder}), -1) + 1` })
			.from(works)
			.where(eq(works.serviceId, input.serviceId));

		let sortOrder = base?.value ?? 0;
		let worksCreated = 0;
		let elementsCreated = 0;
		const requirements = input.requirements ?? [];
		const requirementIsRequired = input.requirementIsRequired ?? true;

		for (const work of includedWorks) {
			const includedElements = work.elements.filter((el) => el.include && el.name.trim());
			const mode: WorkMode = includedElements.length > 0 ? 'divided' : 'direct';
			const name = await resolvePlannedName(tx, work.catalogItemId, work.name, input.serviceId);

			const [createdWork] = await tx
				.insert(works)
				.values({
					serviceId: input.serviceId,
					mode,
					catalogItemId: name.catalogItemId,
					customName: name.customName,
					sortOrder
				})
				.returning({ id: works.id });
			sortOrder += 1;
			worksCreated += 1;

			if (mode === 'direct') {
				const [target] = await tx
					.insert(evidenceTargets)
					.values({ workId: createdWork.id })
					.returning({ id: evidenceTargets.id });
				if (requirements.length > 0) {
					await insertRequirements(tx, {
						targetId: target.id,
						serviceId: input.serviceId,
						requirements,
						isRequired: requirementIsRequired
					});
				}
			}

			let elementSort = 0;
			for (const element of includedElements) {
				const elementName = await resolvePlannedName(
					tx,
					element.catalogItemId,
					element.name,
					input.serviceId
				);
				const [createdElement] = await tx
					.insert(elements)
					.values({
						workId: createdWork.id,
						catalogItemId: elementName.catalogItemId,
						customName: elementName.customName,
						sortOrder: elementSort
					})
					.returning({ id: elements.id });
				elementSort += 1;
				elementsCreated += 1;
				const [target] = await tx
					.insert(evidenceTargets)
					.values({ elementId: createdElement.id })
					.returning({ id: evidenceTargets.id });
				if (requirements.length > 0) {
					await insertRequirements(tx, {
						targetId: target.id,
						serviceId: input.serviceId,
						requirements,
						isRequired: requirementIsRequired
					});
				}
			}
		}

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: input.serviceId,
			entityType: 'service',
			entityId: input.serviceId,
			action: 'works.generated',
			metadata: { worksCreated, elementsCreated, requirements: requirements.length }
		});

		return { worksCreated, elementsCreated };
	});
}

async function resolvePlannedName(
	tx: Database,
	catalogItemId: string | null,
	name: string,
	serviceId: string
): Promise<{ catalogItemId: string | null; customName: string | null }> {
	const trimmed = name.trim();
	if (!catalogItemId) return { catalogItemId: null, customName: trimmed };
	const [item] = await tx
		.select({ id: catalogItems.id, name: catalogItems.name })
		.from(catalogItems)
		.where(eq(catalogItems.id, catalogItemId))
		.limit(1);
	if (!item) throw new DomainError(404, 'Ítem de catálogo no encontrado.');
	await assertCatalogItemAvailableForService(tx, serviceId, item.id);
	if (item.name === trimmed) return { catalogItemId: item.id, customName: null };
	return { catalogItemId: null, customName: trimmed };
}
