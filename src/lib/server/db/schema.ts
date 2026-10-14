import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';

/**
 * Esquema Drizzle de Lumen.
 *
 * Etapa 1: identidad, sesiones y asignaciones.
 * Etapa 2: catálogos, servicios (edificio), trabajos, elementos y objetivos.
 *
 * Convenciones (docs/03-modelo-datos.md):
 * - IDs `uuid` para recursos expuestos; fechas `timestamptz` en UTC.
 * - Nombres de usuario case-insensitive mediante índice funcional sobre `lower(username)`.
 * - El nombre visible de trabajos/elementos es `COALESCE(catalog_item.name, custom_name)`
 *   con la invariante de tener **exactamente un origen de nombre** (vínculo XOR personalizado).
 */

export const userRole = pgEnum('user_role', ['admin', 'supervisor', 'technician']);

export const assignmentRole = pgEnum('assignment_role', ['technician', 'supervisor']);

export const catalogPurpose = pgEnum('catalog_purpose', ['general', 'buildings']);

export const workMode = pgEnum('work_mode', ['direct', 'divided']);

export const photoProcessingStatus = pgEnum('photo_processing_status', [
	'processing',
	'ready',
	'failed'
]);

export const targetStatus = pgEnum('target_status', [
	'pending',
	'in_progress',
	'in_review',
	'rejected',
	'approved'
]);

export const reviewDecision = pgEnum('review_decision', ['approved', 'rejected']);

export const submissionGroupKind = pgEnum('submission_group_kind', ['requirement', 'additional']);

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		username: text('username').notNull(),
		displayName: text('display_name').notNull(),
		passwordHash: text('password_hash').notNull(),
		role: userRole('role').notNull(),
		isActive: boolean('is_active').notNull().default(true),
		disabledAt: timestamp('disabled_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [uniqueIndex('users_username_lower_idx').on(sql`lower(${table.username})`)]
);

export const sessions = pgTable(
	'sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		tokenHash: text('token_hash').notNull(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		userAgent: text('user_agent'),
		ip: text('ip')
	},
	(table) => [
		uniqueIndex('sessions_token_hash_idx').on(table.tokenHash),
		index('sessions_user_expires_idx').on(table.userId, table.expiresAt)
	]
);

export const catalogs = pgTable('catalogs', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	description: text('description'),
	purpose: catalogPurpose('purpose'),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const catalogItems = pgTable(
	'catalog_items',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		catalogId: uuid('catalog_id')
			.notNull()
			.references(() => catalogs.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		// Sin duplicados dentro del mismo catálogo (case-insensitive); otros catálogos no se afectan.
		uniqueIndex('catalog_items_catalog_name_lower_idx').on(
			table.catalogId,
			sql`lower(${table.name})`
		)
	]
);

export const catalogItemRelations = pgTable(
	'catalog_item_relations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		fromItemId: uuid('from_item_id')
			.notNull()
			.references(() => catalogItems.id, { onDelete: 'cascade' }),
		toItemId: uuid('to_item_id')
			.notNull()
			.references(() => catalogItems.id, { onDelete: 'cascade' }),
		relationType: text('relation_type'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('catalog_item_relations_unique').on(
			table.fromItemId,
			table.toItemId,
			table.relationType
		),
		check('catalog_item_relations_not_self', sql`${table.fromItemId} <> ${table.toItemId}`)
	]
);

export const services = pgTable(
	'services',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		description: text('description'),
		buildingCatalogItemId: uuid('building_catalog_item_id').references(() => catalogItems.id, {
			onDelete: 'set null'
		}),
		buildingNameSnapshot: text('building_name_snapshot'),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('services_building_item_idx').on(table.buildingCatalogItemId)]
);

export const serviceAssignments = pgTable(
	'service_assignments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		serviceId: uuid('service_id')
			.notNull()
			.references(() => services.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		assignmentRole: assignmentRole('assignment_role').notNull(),
		assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
		assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
		revokedAt: timestamp('revoked_at', { withTimezone: true })
	},
	(table) => [
		uniqueIndex('service_assignments_active_unique')
			.on(table.serviceId, table.userId, table.assignmentRole)
			.where(sql`${table.revokedAt} is null`),
		index('service_assignments_user_revoked_idx').on(table.userId, table.revokedAt)
	]
);

export const works = pgTable(
	'works',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		serviceId: uuid('service_id')
			.notNull()
			.references(() => services.id, { onDelete: 'cascade' }),
		mode: workMode('mode').notNull(),
		catalogItemId: uuid('catalog_item_id').references(() => catalogItems.id, {
			onDelete: 'set null'
		}),
		customName: text('custom_name'),
		description: text('description'),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('works_service_sort_idx').on(table.serviceId, table.sortOrder),
		index('works_catalog_item_idx').on(table.catalogItemId),
		check(
			'works_name_source_check',
			sql`(${table.catalogItemId} is null) <> (${table.customName} is null)`
		)
	]
);

export const elements = pgTable(
	'elements',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		workId: uuid('work_id')
			.notNull()
			.references(() => works.id, { onDelete: 'cascade' }),
		catalogItemId: uuid('catalog_item_id').references(() => catalogItems.id, {
			onDelete: 'set null'
		}),
		customName: text('custom_name'),
		description: text('description'),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('elements_work_sort_idx').on(table.workId, table.sortOrder),
		index('elements_catalog_item_idx').on(table.catalogItemId),
		check(
			'elements_name_source_check',
			sql`(${table.catalogItemId} is null) <> (${table.customName} is null)`
		)
	]
);

export const evidenceTargets = pgTable(
	'evidence_targets',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		workId: uuid('work_id').references(() => works.id, { onDelete: 'cascade' }),
		elementId: uuid('element_id').references(() => elements.id, { onDelete: 'cascade' }),
		currentStatus: targetStatus('current_status').notNull().default('pending'),
		version: integer('version').notNull().default(0),
		// FK a `evidence_submissions` añadida en la Etapa 4 (ciclo de referencias resuelto con tipo `AnyPgColumn`).
		latestSubmissionId: uuid('latest_submission_id').references(
			(): AnyPgColumn => evidenceSubmissions.id,
			{ onDelete: 'set null' }
		),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('evidence_targets_work_unique').on(table.workId),
		uniqueIndex('evidence_targets_element_unique').on(table.elementId),
		check(
			'evidence_targets_scope_check',
			sql`(${table.workId} is null) <> (${table.elementId} is null)`
		)
	]
);

export const photoRequirements = pgTable(
	'photo_requirements',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		targetId: uuid('target_id')
			.notNull()
			.references(() => evidenceTargets.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		isRequired: boolean('is_required').notNull().default(true),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('photo_requirements_target_sort_idx').on(table.targetId, table.sortOrder)]
);

export const photos = pgTable(
	'photos',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		targetId: uuid('target_id')
			.notNull()
			.references(() => evidenceTargets.id, { onDelete: 'cascade' }),
		// `NULL` representa el grupo virtual «Adicionales».
		requirementId: uuid('requirement_id').references(() => photoRequirements.id, {
			onDelete: 'set null'
		}),
		sortOrder: integer('sort_order').notNull().default(0),
		storagePath: text('storage_path').notNull(),
		thumbnailPath: text('thumbnail_path').notNull(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		width: integer('width'),
		height: integer('height'),
		checksum: text('checksum'),
		processingStatus: photoProcessingStatus('processing_status').notNull().default('processing'),
		uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
		uploadedByName: text('uploaded_by_name'),
		uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
		removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
		removedByName: text('removed_by_name'),
		removedAt: timestamp('removed_at', { withTimezone: true })
	},
	(table) => [
		index('photos_target_group_sort_idx').on(
			table.targetId,
			table.removedAt,
			table.requirementId,
			table.sortOrder
		)
	]
);

export const evidenceSubmissions = pgTable(
	'evidence_submissions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		targetId: uuid('target_id')
			.notNull()
			.references(() => evidenceTargets.id, { onDelete: 'cascade' }),
		// Número 1, 2, 3… por objetivo; asignado serializando con el bloqueo del target.
		sequenceNo: integer('sequence_no').notNull(),
		submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
		submittedByName: text('submitted_by_name'),
		submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
		evidenceVersion: integer('evidence_version').notNull(),
		targetNameSnapshot: text('target_name_snapshot'),
		workNameSnapshot: text('work_name_snapshot'),
		serviceNameSnapshot: text('service_name_snapshot')
	},
	(table) => [
		uniqueIndex('evidence_submissions_target_sequence_unique').on(table.targetId, table.sequenceNo)
	]
);

export const submissionPhotos = pgTable(
	'submission_photos',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		submissionId: uuid('submission_id')
			.notNull()
			.references(() => evidenceSubmissions.id, { onDelete: 'cascade' }),
		// `RESTRICT`: una foto usada en una entrega no puede borrarse físicamente.
		photoId: uuid('photo_id')
			.notNull()
			.references(() => photos.id, { onDelete: 'restrict' }),
		groupKind: submissionGroupKind('group_kind').notNull(),
		requirementNameSnapshot: text('requirement_name_snapshot'),
		groupSortOrder: integer('group_sort_order').notNull(),
		photoSortOrder: integer('photo_sort_order').notNull(),
		photoUploadedBySnapshot: uuid('photo_uploaded_by_snapshot').references(() => users.id, {
			onDelete: 'set null'
		}),
		photoUploadedByName: text('photo_uploaded_by_name'),
		photoUploadedAtSnapshot: timestamp('photo_uploaded_at_snapshot', { withTimezone: true })
	},
	(table) => [
		uniqueIndex('submission_photos_submission_photo_unique').on(table.submissionId, table.photoId),
		index('submission_photos_order_idx').on(
			table.submissionId,
			table.groupSortOrder,
			table.photoSortOrder
		)
	]
);

export const reviews = pgTable(
	'reviews',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		submissionId: uuid('submission_id')
			.notNull()
			.references(() => evidenceSubmissions.id, { onDelete: 'cascade' }),
		reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
		reviewerName: text('reviewer_name'),
		decision: reviewDecision('decision').notNull(),
		reason: text('reason'),
		reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('reviews_submission_unique').on(table.submissionId),
		check(
			'reviews_reason_check',
			sql`${table.decision} <> 'rejected' or (${table.reason} is not null and length(trim(${table.reason})) > 0)`
		)
	]
);

export const notifications = pgTable(
	'notifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		recipientUserId: uuid('recipient_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// Las referencias al ámbito se eliminan en cascada con el borrado destructivo.
		serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
		targetId: uuid('target_id').references(() => evidenceTargets.id, { onDelete: 'cascade' }),
		submissionId: uuid('submission_id').references(() => evidenceSubmissions.id, {
			onDelete: 'cascade'
		}),
		reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'cascade' }),
		eventType: text('event_type').notNull(),
		title: text('title').notNull(),
		body: text('body').notNull(),
		deepLink: text('deep_link').notNull(),
		// Clave idempotente por destinatario: evita duplicados en reintentos.
		eventKey: text('event_key').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		readAt: timestamp('read_at', { withTimezone: true })
	},
	(table) => [
		uniqueIndex('notifications_recipient_event_unique').on(table.recipientUserId, table.eventKey),
		index('notifications_recipient_read_idx').on(
			table.recipientUserId,
			table.readAt,
			table.createdAt
		),
		index('notifications_service_idx').on(table.serviceId)
	]
);

export const pushSubscriptions = pgTable(
	'push_subscriptions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		userAgent: text('user_agent'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
		revokedAt: timestamp('revoked_at', { withTimezone: true })
	},
	(table) => [
		uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint),
		index('push_subscriptions_user_idx').on(table.userId, table.revokedAt)
	]
);

export const auditEvents = pgTable(
	'audit_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
		actorName: text('actor_name'),
		serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
		entityType: text('entity_type').notNull(),
		entityId: text('entity_id'),
		action: text('action').notNull(),
		metadata: jsonb('metadata_json').$type<Record<string, unknown>>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('audit_events_created_idx').on(table.createdAt)]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ServiceAssignment = typeof serviceAssignments.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Catalog = typeof catalogs.$inferSelect;
export type CatalogItem = typeof catalogItems.$inferSelect;
export type Work = typeof works.$inferSelect;
export type Element = typeof elements.$inferSelect;
export type EvidenceTarget = typeof evidenceTargets.$inferSelect;
export type PhotoRequirement = typeof photoRequirements.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type EvidenceSubmission = typeof evidenceSubmissions.$inferSelect;
export type SubmissionPhoto = typeof submissionPhotos.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
