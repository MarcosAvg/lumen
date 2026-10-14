import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

/**
 * Esquema Drizzle de Lumen (Etapa 1: identidad, sesiones y asignaciones).
 *
 * Convenciones (docs/03-modelo-datos.md):
 * - IDs `uuid` para recursos expuestos; fechas `timestamptz` en UTC.
 * - Nombres de usuario case-insensitive mediante índice funcional sobre `lower(username)`.
 * - Las asignaciones activas son únicas por `(servicio, usuario, rol)`.
 */

export const userRole = pgEnum('user_role', ['admin', 'supervisor', 'technician']);

export const assignmentRole = pgEnum('assignment_role', ['technician', 'supervisor']);

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

// Esqueleto de servicio en la Etapa 1: lo mínimo para poder asignar usuarios.
// El edificio y los vínculos a catálogos se añaden en la Etapa 2 (migración aditiva).
export const services = pgTable('services', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	description: text('description'),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

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

export const auditEvents = pgTable(
	'audit_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
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
