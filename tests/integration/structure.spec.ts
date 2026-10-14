import { beforeEach, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { hashPassword } from '#lib/server/auth/password';
import {
	createCatalog,
	createCatalogItem,
	createRelation,
	deleteCatalogItem,
	getCatalogItemImpact,
	renameCatalogItem
} from '#lib/server/domain/catalogs';
import { DomainError } from '#lib/server/domain/errors';
import { createService, getServiceForUser, updateService } from '#lib/server/domain/services';
import { createFirstAdmin } from '#lib/server/domain/users';
import {
	applyGeneration,
	createElement,
	createWork,
	getServiceProgress,
	listElementsDetailed,
	listWorksDetailed,
	planGeneration,
	updateWork
} from '#lib/server/domain/works';
import { evidenceTargets } from '#lib/server/db/schema';
import { describeWithDatabase, truncateAll } from './helpers/db';

const PASSWORD = 'contrasena-segura';

await describeWithDatabase('Estructura · catálogos, trabajos y objetivos', ({ db, client }) => {
	beforeEach(async () => {
		await truncateAll(client);
	});

	async function seedAdmin(): Promise<string> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
		return id;
	}

	async function seedItem(catalogId: string, name: string, actorId: string) {
		return createCatalogItem(db, { catalogId, name, actorId });
	}

	it('un trabajo directo crea un objetivo propio y cero elementos', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, { name: 'Servicio', actorId: admin });

		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo directo',
			actorId: admin
		});

		const targets = await db
			.select()
			.from(evidenceTargets)
			.where(eq(evidenceTargets.workId, work.id));
		expect(targets).toHaveLength(1);
		expect(work.targetId).toBe(targets[0].id);

		const list = await listWorksDetailed(db, service.id);
		expect(list).toHaveLength(1);
		expect(list[0].elementCount).toBe(0);
	});

	it('un trabajo dividido con dos elementos crea dos objetivos y ninguno en el padre', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, { name: 'Servicio', actorId: admin });
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Piso 34',
			actorId: admin
		});

		expect(
			await db.select().from(evidenceTargets).where(eq(evidenceTargets.workId, work.id))
		).toHaveLength(0);

		const e1 = await createElement(db, { workId: work.id, name: 'UMA 01', actorId: admin });
		const e2 = await createElement(db, { workId: work.id, name: 'UMA 02', actorId: admin });

		const elementTargets = await db
			.select()
			.from(evidenceTargets)
			.where(inArray(evidenceTargets.elementId, [e1.id, e2.id]));
		expect(elementTargets).toHaveLength(2);

		const list = await listWorksDetailed(db, service.id);
		expect(list[0].elementCount).toBe(2);
		expect(list[0].approved).toBe(false);
	});

	it('un servicio vacío y un trabajo dividido sin elementos nunca se completan', async () => {
		const admin = await seedAdmin();
		const empty = await createService(db, { name: 'Vacío', actorId: admin });
		const emptyProgress = await getServiceProgress(db, empty.id);
		expect(emptyProgress.completed).toBe(false);
		expect(emptyProgress.totalTargets).toBe(0);

		const service = await createService(db, { name: 'Con dividido vacío', actorId: admin });
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Dividido',
			actorId: admin
		});
		const progress = await getServiceProgress(db, service.id);
		expect(progress.works.find((item) => item.id === work.id)?.approved).toBe(false);
		expect(progress.completed).toBe(false);
	});

	it('CAT-01: renombrar el ítem maestro actualiza los objetos aún vinculados', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, { name: 'Servicio', actorId: admin });
		const catalog = await createCatalog(db, { name: 'Pisos', actorId: admin });
		const item = await seedItem(catalog.id, 'Piso 1', admin);
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			catalogItemId: item.id,
			actorId: admin
		});

		await renameCatalogItem(db, { itemId: item.id, name: 'Piso 01', actorId: admin });

		const list = await listWorksDetailed(db, service.id);
		expect(list.find((row) => row.id === work.id)?.name).toBe('Piso 01');
	});

	it('CAT-02: renombrar una instancia la desvincula y conserva su nombre propio', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, { name: 'Servicio', actorId: admin });
		const catalog = await createCatalog(db, { name: 'Pisos', actorId: admin });
		const item = await seedItem(catalog.id, 'Piso 1', admin);
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			catalogItemId: item.id,
			actorId: admin
		});

		await updateWork(db, { id: work.id, name: 'Piso especial', actorId: admin });
		await renameCatalogItem(db, { itemId: item.id, name: 'Piso 1 (renombrado)', actorId: admin });

		const list = await listWorksDetailed(db, service.id);
		expect(list.find((row) => row.id === work.id)?.name).toBe('Piso especial');
	});

	it('CAT-03: eliminar el ítem preserva nombres de trabajos, elementos y edificio', async () => {
		const admin = await seedAdmin();
		const catalog = await createCatalog(db, { name: 'Edificios', actorId: admin });
		const building = await seedItem(catalog.id, 'Edificio A', admin);

		const service = await createService(db, { name: 'Servicio', actorId: admin });
		await updateService(db, {
			serviceId: service.id,
			name: 'Servicio',
			buildingCatalogItemId: building.id,
			actorId: admin
		});
		expect((await getServiceForUser(db, adminUser(admin), service.id)).service.buildingName).toBe(
			'Edificio A'
		);

		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			catalogItemId: building.id,
			actorId: admin
		});

		const impact = await getCatalogItemImpact(db, building.id);
		expect(impact.works).toBe(1);
		expect(impact.services).toBe(1);

		await deleteCatalogItem(db, { itemId: building.id, actorId: admin });

		const works = await listWorksDetailed(db, service.id);
		expect(works.find((row) => row.id === work.id)?.name).toBe('Edificio A');
		expect((await getServiceForUser(db, adminUser(admin), service.id)).service.buildingName).toBe(
			'Edificio A'
		);
	});

	it('las relaciones solo enlazan catálogos distintos', async () => {
		const admin = await seedAdmin();
		const catalogA = await createCatalog(db, { name: 'Pisos', actorId: admin });
		const catalogB = await createCatalog(db, { name: 'UMAs', actorId: admin });
		const a1 = await seedItem(catalogA.id, 'Piso 34', admin);
		const a2 = await seedItem(catalogA.id, 'Piso 35', admin);
		const b1 = await seedItem(catalogB.id, 'UMA 03', admin);

		const relation = await createRelation(db, {
			fromItemId: a1.id,
			toItemId: b1.id,
			actorId: admin
		});
		expect(relation.id).toBeTruthy();

		await expect(
			createRelation(db, { fromItemId: a1.id, toItemId: a2.id, actorId: admin })
		).rejects.toBeInstanceOf(DomainError);
	});

	it('generación 34×4 crea la estructura esperada', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, { name: 'Edificio', actorId: admin });
		const floors = await createCatalog(db, { name: 'Pisos', actorId: admin });
		const umas = await createCatalog(db, { name: 'UMAs', actorId: admin });

		const floorIds: string[] = [];
		for (let i = 1; i <= 34; i += 1) {
			const item = await seedItem(floors.id, `Piso ${i}`, admin);
			floorIds.push(item.id);
		}
		const umaIds: string[] = [];
		for (let i = 1; i <= 4; i += 1) {
			const item = await seedItem(umas.id, `UMA ${i}`, admin);
			umaIds.push(item.id);
		}

		const plan = await planGeneration(db, {
			serviceId: service.id,
			workItemIds: floorIds,
			elementItemIds: umaIds
		});
		expect(plan.totalWorks).toBe(34);
		expect(plan.totalElements).toBe(34 * 4);

		const result = await applyGeneration(db, {
			serviceId: service.id,
			works: plan.works,
			actorId: admin
		});
		expect(result.worksCreated).toBe(34);
		expect(result.elementsCreated).toBe(34 * 4);

		const works = await listWorksDetailed(db, service.id);
		expect(works).toHaveLength(34);
		expect(works.every((work) => work.mode === 'divided' && work.elementCount === 4)).toBe(true);

		const [firstElement] = await listElementsDetailed(db, works[0].id);
		expect(firstElement.name).toBe('UMA 1');
	});

	it('WORK-01/WORK-02: aprobar un dividido y añadir un elemento lo vuelve incompleto sin revertir aprobaciones', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, { name: 'Servicio', actorId: admin });
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Dividido',
			actorId: admin
		});
		const e1 = await createElement(db, { workId: work.id, name: 'E1', actorId: admin });
		const e2 = await createElement(db, { workId: work.id, name: 'E2', actorId: admin });

		// Simula la aprobación de los objetivos existentes (el flujo real llega en la Etapa 4).
		await db
			.update(evidenceTargets)
			.set({ currentStatus: 'approved' })
			.where(inArray(evidenceTargets.elementId, [e1.id, e2.id]));

		let progress = await getServiceProgress(db, service.id);
		expect(progress.completed).toBe(true);
		expect(progress.works[0].approved).toBe(true);

		// Añadir un elemento pendiente recalcula el estado sin tocar las aprobaciones anteriores.
		await createElement(db, { workId: work.id, name: 'E3', actorId: admin });

		progress = await getServiceProgress(db, service.id);
		expect(progress.completed).toBe(false);
		expect(progress.works[0].approved).toBe(false);
		expect(progress.works[0].approvedElements).toBe(2);

		const stillApproved = await db
			.select()
			.from(evidenceTargets)
			.where(inArray(evidenceTargets.elementId, [e1.id, e2.id]));
		expect(stillApproved.every((row) => row.currentStatus === 'approved')).toBe(true);
	});

	it('editar el edificio o el nombre del servicio no altera los trabajos', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, { name: 'Servicio', actorId: admin });
		const catalog = await createCatalog(db, { name: 'Edificios', actorId: admin });
		const building = await seedItem(catalog.id, 'Edificio A', admin);
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo',
			actorId: admin
		});

		await updateService(db, {
			serviceId: service.id,
			name: 'Servicio renombrado',
			buildingCatalogItemId: building.id,
			actorId: admin
		});

		const works = await listWorksDetailed(db, service.id);
		expect(works).toHaveLength(1);
		expect(works[0].id).toBe(work.id);
		expect(works[0].name).toBe('Trabajo');
	});
});

function adminUser(id: string) {
	return { id, username: 'admin', displayName: 'Admin', role: 'admin' as const };
}
