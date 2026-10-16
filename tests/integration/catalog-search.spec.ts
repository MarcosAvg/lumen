import { beforeEach, expect, it } from 'vitest';
import { hashPassword } from '#lib/server/auth/password';
import {
	createCatalog,
	createCatalogItem,
	listCatalogs,
	moveCatalogItem,
	searchCatalogItems
} from '#lib/server/domain/catalogs';
import { createService } from '#lib/server/domain/services';
import { createFirstAdmin } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

await describeWithDatabase('Catálogos · búsqueda, usos y orden', ({ db, client }) => {
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

	it('busca ítems con filtro, paginación y usos', async () => {
		const admin = await seedAdmin();
		const catalog = await createCatalog(db, { name: 'Pisos', actorId: admin });
		const itemA = await createCatalogItem(db, {
			catalogId: catalog.id,
			name: 'Piso 34',
			actorId: admin
		});
		await createCatalogItem(db, { catalogId: catalog.id, name: 'Piso 35', actorId: admin });
		await createCatalogItem(db, { catalogId: catalog.id, name: 'Piso 36', actorId: admin });

		// Un trabajo vinculado a un ítem cuenta como uso.
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});
		await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			catalogItemId: itemA.id,
			actorId: admin
		});

		const all = await searchCatalogItems(db, catalog.id, { limit: 2, offset: 0 });
		expect(all.total).toBe(3);
		expect(all.items).toHaveLength(2);

		const filtered = await searchCatalogItems(db, catalog.id, { q: '34' });
		expect(filtered.total).toBe(1);
		expect(filtered.items[0].name).toBe('Piso 34');
		expect(filtered.items[0].impact.works).toBe(1);

		const noMatch = await searchCatalogItems(db, catalog.id, { q: 'zzz' });
		expect(noMatch.total).toBe(0);
	});

	it('reordena ítems arriba/abajo de forma normalizada', async () => {
		const admin = await seedAdmin();
		const catalog = await createCatalog(db, { name: 'Pisos', actorId: admin });
		const first = await createCatalogItem(db, { catalogId: catalog.id, name: 'A', actorId: admin });
		await createCatalogItem(db, { catalogId: catalog.id, name: 'B', actorId: admin });
		await createCatalogItem(db, { catalogId: catalog.id, name: 'C', actorId: admin });

		await moveCatalogItem(db, { itemId: first.id, direction: 1, actorId: admin });
		const afterDown = await searchCatalogItems(db, catalog.id);
		expect(afterDown.items.map((item) => item.name)).toEqual(['B', 'A', 'C']);
		expect(afterDown.items.map((item) => item.sortOrder)).toEqual([0, 1, 2]);

		// Mover de nuevo el mismo ítem continúa desplazándolo.
		await moveCatalogItem(db, { itemId: first.id, direction: 1, actorId: admin });
		const afterExtra = await searchCatalogItems(db, catalog.id);
		expect(afterExtra.items.map((item) => item.name)).toEqual(['B', 'C', 'A']);
	});

	it('lista catálogos filtrando por nombre', async () => {
		const admin = await seedAdmin();
		await createCatalog(db, { name: 'Edificios', purpose: 'buildings', actorId: admin });
		await createCatalog(db, { name: 'Pisos', actorId: admin });

		expect(await listCatalogs(db)).toHaveLength(2);
		const filtered = await listCatalogs(db, 'piso');
		expect(filtered).toHaveLength(1);
		expect(filtered[0].name).toBe('Pisos');
	});
});
