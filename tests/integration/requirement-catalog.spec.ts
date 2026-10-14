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
import { createWork } from '#lib/server/domain/works';
import { describeWithDatabase, truncateAll } from './helpers/db';

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
		const service = await createService(db, { name: 'Servicio', actorId: admin });
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo',
			actorId: admin
		});
		return { admin, targetId: work.targetId as string };
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
});
