import { beforeEach, expect, it } from 'vitest';
import { hashPassword } from '#lib/server/auth/password';
import {
	createCatalog,
	createCatalogItem,
	deleteCatalogItem,
	renameCatalogItem
} from '#lib/server/domain/catalogs';
import { DomainError } from '#lib/server/domain/errors';
import {
	createRequirement,
	createRequirementsBatch,
	listRequirements,
	updateRequirement
} from '#lib/server/domain/requirements';
import { createService } from '#lib/server/domain/services';
import { createFirstAdmin } from '#lib/server/domain/users';
import { getTargetForElement, getTargetForWork } from '#lib/server/domain/targets';
import {
	addElements,
	applyGeneration,
	createWork,
	listElementsDetailed,
	listWorksDetailed
} from '#lib/server/domain/works';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

await describeWithDatabase('Requisitos desde catálogo', ({ db, client }) => {
	beforeEach(async () => {
		await truncateAll(client);
	});

	async function seed() {
		const passwordHash = await hashPassword(PASSWORD);
		const { id: admin } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo',
			actorId: admin
		});
		return { admin, serviceId: service.id, targetId: work.targetId as string };
	}

	async function requirementCatalog(admin: string, name = 'Requisitos') {
		const catalog = await createCatalog(db, { name, purpose: 'requirements', actorId: admin });
		return catalog.id;
	}

	it('un requisito ligado muestra el nombre del ítem y sigue sus renombrados', async () => {
		const { admin, targetId } = await seed();
		const catalogId = await requirementCatalog(admin);
		const item = await createCatalogItem(db, { catalogId, name: 'Antes', actorId: admin });

		const { id } = await createRequirement(db, {
			targetId,
			catalogItemId: item.id,
			isRequired: true,
			actorId: admin
		});

		let [requirement] = await listRequirements(db, targetId);
		expect(requirement.name).toBe('Antes');
		expect(requirement.catalogItemId).toBe(item.id);

		await renameCatalogItem(db, { itemId: item.id, name: 'Antes (renombrado)', actorId: admin });
		[requirement] = await listRequirements(db, targetId);
		expect(requirement.name).toBe('Antes (renombrado)');
		expect(requirement.catalogItemId).toBe(item.id);

		// El renombrado del ítem no altera la identidad del requisito.
		expect(requirement.id).toBe(id);
	});

	it('renombrar a mano el requisito lo desvincula y fija el nombre propio', async () => {
		const { admin, targetId } = await seed();
		const catalogId = await requirementCatalog(admin);
		const item = await createCatalogItem(db, { catalogId, name: 'Antes', actorId: admin });

		const { id } = await createRequirement(db, {
			targetId,
			catalogItemId: item.id,
			isRequired: true,
			actorId: admin
		});
		await updateRequirement(db, {
			requirementId: id,
			name: 'Propio',
			isRequired: true,
			actorId: admin
		});

		let [requirement] = await listRequirements(db, targetId);
		expect(requirement.name).toBe('Propio');
		expect(requirement.catalogItemId).toBeNull();

		await renameCatalogItem(db, { itemId: item.id, name: 'Otro', actorId: admin });
		[requirement] = await listRequirements(db, targetId);
		expect(requirement.name).toBe('Propio');
	});

	it('al eliminar el ítem del catálogo el requisito conserva el nombre', async () => {
		const { admin, targetId } = await seed();
		const catalogId = await requirementCatalog(admin);
		const item = await createCatalogItem(db, { catalogId, name: 'Antes', actorId: admin });

		await createRequirement(db, {
			targetId,
			catalogItemId: item.id,
			isRequired: true,
			actorId: admin
		});
		await deleteCatalogItem(db, { itemId: item.id, actorId: admin });

		const [requirement] = await listRequirements(db, targetId);
		expect(requirement.name).toBe('Antes');
		expect(requirement.catalogItemId).toBeNull();
	});

	it('el lote añade varios y omite duplicados existentes', async () => {
		const { admin, targetId } = await seed();
		const catalogId = await requirementCatalog(admin);
		const antes = await createCatalogItem(db, { catalogId, name: 'Antes', actorId: admin });
		const despues = await createCatalogItem(db, { catalogId, name: 'Después', actorId: admin });
		const detalle = await createCatalogItem(db, { catalogId, name: 'Detalle', actorId: admin });

		const first = await createRequirementsBatch(db, {
			targetId,
			catalogItemIds: [antes.id, despues.id, detalle.id, antes.id],
			isRequired: true,
			actorId: admin
		});
		expect(first.created).toBe(3);
		expect(first.requirements).toHaveLength(3);

		const second = await createRequirementsBatch(db, {
			targetId,
			catalogItemIds: [antes.id, despues.id, detalle.id],
			isRequired: true,
			actorId: admin
		});
		expect(second.created).toBe(0);
		expect(second.skipped).toBe(3);
	});

	it('no acepta ítems que no sean de un catálogo de requisitos', async () => {
		const { admin, targetId } = await seed();
		const general = await createCatalog(db, { name: 'General', actorId: admin });
		const item = await createCatalogItem(db, {
			catalogId: general.id,
			name: 'Piso',
			actorId: admin
		});

		await expect(
			createRequirement(db, {
				targetId,
				catalogItemId: item.id,
				isRequired: true,
				actorId: admin
			})
		).rejects.toBeInstanceOf(DomainError);
	});

	it('al crear un trabajo directo aplica los requisitos (catálogo y propios)', async () => {
		const { admin, serviceId } = await seed();
		const catalogId = await requirementCatalog(admin);
		const antes = await createCatalogItem(db, { catalogId, name: 'Antes', actorId: admin });

		const work = await createWork(db, {
			serviceId,
			mode: 'direct',
			name: 'Trabajo con requisitos',
			requirements: [{ catalogItemId: antes.id }, { name: 'Detalle propio' }],
			requirementIsRequired: true,
			actorId: admin
		});

		const requirements = await listRequirements(db, work.targetId as string);
		expect(requirements.map((row) => row.name).sort()).toEqual(['Antes', 'Detalle propio']);
	});

	it('en un trabajo dividido aplica el mismo conjunto a cada elemento', async () => {
		const { admin, serviceId } = await seed();
		const catalogId = await requirementCatalog(admin);
		const antes = await createCatalogItem(db, { catalogId, name: 'Antes', actorId: admin });

		const work = await createWork(db, {
			serviceId,
			mode: 'divided',
			name: 'Edificio',
			elements: [{ name: 'Piso 1' }, { name: 'Piso 2' }],
			requirements: [{ catalogItemId: antes.id }],
			actorId: admin
		});

		expect(work.elementIds).toHaveLength(2);
		for (const elementId of work.elementIds) {
			const target = await getTargetForElement(db, elementId);
			const requirements = await listRequirements(db, target.id);
			expect(requirements.map((row) => row.name)).toEqual(['Antes']);
		}
	});

	it('aplica requisitos a los elementos añadidos después', async () => {
		const { admin, serviceId } = await seed();
		const catalogId = await requirementCatalog(admin);
		const antes = await createCatalogItem(db, { catalogId, name: 'Antes', actorId: admin });

		const work = await createWork(db, {
			serviceId,
			mode: 'divided',
			name: 'Edificio',
			elements: [{ name: 'Piso 1' }],
			actorId: admin
		});
		const { elementIds } = await addElements(db, {
			workId: work.id,
			elements: [{ name: 'Piso 2' }],
			requirements: [{ catalogItemId: antes.id }],
			actorId: admin
		});

		const target = await getTargetForElement(db, elementIds[0]);
		expect((await listRequirements(db, target.id)).map((row) => row.name)).toEqual(['Antes']);
	});

	it('la generación en lote aplica requisitos a cada objetivo creado', async () => {
		const { admin, serviceId } = await seed();
		const catalogId = await requirementCatalog(admin);
		const antes = await createCatalogItem(db, { catalogId, name: 'Antes', actorId: admin });

		await applyGeneration(db, {
			serviceId,
			works: [
				{ catalogItemId: null, name: 'Directo', include: true, elements: [] },
				{
					catalogItemId: null,
					name: 'Dividido',
					include: true,
					elements: [
						{ catalogItemId: null, name: 'Elem 1', include: true },
						{ catalogItemId: null, name: 'Elem 2', include: true }
					]
				}
			],
			requirements: [{ catalogItemId: antes.id }],
			requirementIsRequired: true,
			actorId: admin
		});

		const works = await listWorksDetailed(db, serviceId);
		const direct = works.find((row) => row.name === 'Directo');
		expect(direct).toBeTruthy();
		const directTarget = await getTargetForWork(db, direct!.id);
		expect((await listRequirements(db, directTarget.id)).map((row) => row.name)).toEqual(['Antes']);

		const divided = works.find((row) => row.name === 'Dividido');
		expect(divided).toBeTruthy();
		const elements = await listElementsDetailed(db, divided!.id);
		expect(elements).toHaveLength(2);
		for (const element of elements) {
			const target = await getTargetForElement(db, element.id);
			expect((await listRequirements(db, target.id)).map((row) => row.name)).toEqual(['Antes']);
		}
	});
});
