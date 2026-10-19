import { beforeEach, expect, it } from 'vitest';
import { hashPassword } from '#lib/server/auth/password';
import {
	createCatalog,
	createCatalogItem,
	createCatalogType,
	deleteCatalogType,
	listCatalogsAvailableForService,
	listCatalogTypes,
	updateCatalogType
} from '#lib/server/domain/catalogs';
import { createRequirement } from '#lib/server/domain/requirements';
import { createService, updateService } from '#lib/server/domain/services';
import { createFirstAdmin } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

await describeWithDatabase('Catálogos · tipos y ámbito de edificios', ({ db, client }) => {
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
		const types = await listCatalogTypes(db);
		const buildingType = types.find((type) => type.systemRole === 'building');
		const areaType = types.find((type) => type.name === 'Áreas');
		if (!buildingType || !areaType) throw new Error('Faltan tipos base.');

		const buildingCatalog = await createCatalog(db, {
			name: 'Edificios',
			typeId: buildingType.id,
			actorId: admin
		});
		const buildingA = await createCatalogItem(db, {
			catalogId: buildingCatalog.id,
			name: 'Torre A',
			actorId: admin
		});
		const buildingB = await createCatalogItem(db, {
			catalogId: buildingCatalog.id,
			name: 'Torre B',
			actorId: admin
		});

		const areaCatalog = await createCatalog(db, {
			name: 'Pisos',
			typeId: areaType.id,
			allBuildings: false,
			buildingCatalogItemIds: [buildingA.id],
			actorId: admin
		});
		const areaA = await createCatalogItem(db, {
			catalogId: areaCatalog.id,
			name: 'Piso 1',
			actorId: admin
		});
		const globalCatalog = await createCatalog(db, {
			name: 'Equipos',
			typeId: areaType.id,
			actorId: admin
		});
		const globalItem = await createCatalogItem(db, {
			catalogId: globalCatalog.id,
			name: 'UMA 01',
			actorId: admin
		});

		const contractId = await seedContract(db, admin);
		const serviceA = await createService(db, {
			contractId,
			name: 'Servicio A',
			actorId: admin
		});
		await updateService(db, {
			serviceId: serviceA.id,
			name: 'Servicio A',
			buildingCatalogItemId: buildingA.id,
			actorId: admin
		});
		const serviceB = await createService(db, {
			contractId,
			name: 'Servicio B',
			actorId: admin
		});
		await updateService(db, {
			serviceId: serviceB.id,
			name: 'Servicio B',
			buildingCatalogItemId: buildingB.id,
			actorId: admin
		});

		return { admin, buildingType, areaType, buildingA, areaA, globalItem, serviceA, serviceB };
	}

	it('filtra catálogos con ámbito por el edificio del servicio', async () => {
		const { areaA, globalItem, serviceA, serviceB } = await seed();

		const availableA = await listCatalogsAvailableForService(db, serviceA.id);
		expect(availableA.some((catalog) => catalog.items.some((item) => item.id === areaA.id))).toBe(
			true
		);
		expect(
			availableA.some((catalog) => catalog.items.some((item) => item.id === globalItem.id))
		).toBe(true);

		const availableB = await listCatalogsAvailableForService(db, serviceB.id);
		expect(availableB.some((catalog) => catalog.items.some((item) => item.id === areaA.id))).toBe(
			false
		);
		expect(
			availableB.some((catalog) => catalog.items.some((item) => item.id === globalItem.id))
		).toBe(true);
	});

	it('rechaza en servidor ítems fuera del ámbito del servicio', async () => {
		const { admin, areaA, globalItem, serviceA, serviceB } = await seed();

		await expect(
			createWork(db, {
				serviceId: serviceB.id,
				mode: 'direct',
				catalogItemId: areaA.id,
				actorId: admin
			})
		).rejects.toBeInstanceOf(Error);

		const work = await createWork(db, {
			serviceId: serviceA.id,
			mode: 'direct',
			catalogItemId: areaA.id,
			actorId: admin
		});
		if (!work.targetId) throw new Error('Falta el objetivo del trabajo.');

		await expect(
			createRequirement(db, {
				targetId: work.targetId,
				catalogItemId: areaA.id,
				isRequired: true,
				actorId: admin
			})
		).resolves.toBeTruthy();

		await expect(
			createRequirement(db, {
				targetId: work.targetId,
				catalogItemId: globalItem.id,
				isRequired: true,
				actorId: admin
			})
		).resolves.toBeTruthy();
	});

	it('no usa ítems del catálogo de edificios para nombrar trabajos', async () => {
		const { admin, buildingA, serviceA } = await seed();
		await expect(
			createWork(db, {
				serviceId: serviceA.id,
				mode: 'direct',
				catalogItemId: buildingA.id,
				actorId: admin
			})
		).rejects.toBeInstanceOf(Error);
	});

	it('exige que el edificio del servicio venga del tipo Edificio', async () => {
		const { admin, areaA, serviceA } = await seed();
		await expect(
			updateService(db, {
				serviceId: serviceA.id,
				name: 'Servicio A',
				buildingCatalogItemId: areaA.id,
				actorId: admin
			})
		).rejects.toBeInstanceOf(Error);
	});

	it('administra tipos y protege el tipo Edificio', async () => {
		const { admin, areaType, buildingType } = await seed();
		const created = await createCatalogType(db, {
			name: 'Sistemas',
			sortOrder: 25,
			actorId: admin
		});

		await updateCatalogType(db, {
			typeId: created.id,
			name: 'Sistemas críticos',
			sortOrder: 26,
			actorId: admin
		});
		expect((await listCatalogTypes(db)).find((type) => type.id === created.id)?.name).toBe(
			'Sistemas críticos'
		);

		await createCatalog(db, { name: 'Climatización', typeId: created.id, actorId: admin });
		await expect(
			deleteCatalogType(db, { typeId: created.id, actorId: admin })
		).rejects.toBeInstanceOf(Error);
		await expect(
			deleteCatalogType(db, { typeId: buildingType.id, actorId: admin })
		).rejects.toBeInstanceOf(Error);

		const unused = await createCatalogType(db, { name: 'Sin uso', actorId: admin });
		await deleteCatalogType(db, { typeId: unused.id, actorId: admin });
		expect((await listCatalogTypes(db)).some((type) => type.id === unused.id)).toBe(false);
		expect(areaType.id).toBeTruthy();
	});
});
