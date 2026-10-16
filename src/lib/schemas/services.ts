import { z } from 'zod';

export const createServiceSchema = z.object({
	contractId: z.uuid('Contrato inválido.'),
	name: z
		.string()
		.trim()
		.min(1, 'El nombre del servicio es obligatorio.')
		.max(120, 'El nombre no puede superar 120 caracteres.'),
	description: z
		.string()
		.trim()
		.max(2000, 'La descripción no puede superar 2000 caracteres.')
		.optional()
		.default('')
});

export const updateServiceSchema = z.object({
	serviceId: z.uuid('Servicio inválido.'),
	contractId: z.uuid('Contrato inválido.'),
	name: z
		.string()
		.trim()
		.min(1, 'El nombre del servicio es obligatorio.')
		.max(120, 'El nombre no puede superar 120 caracteres.'),
	description: z
		.string()
		.trim()
		.max(2000, 'La descripción no puede superar 2000 caracteres.')
		.optional()
		.default(''),
	buildingItemId: z
		.union([z.uuid('Edificio inválido.'), z.literal('')])
		.optional()
		.default('')
});

export const assignUserSchema = z.object({
	serviceId: z.uuid('Servicio inválido.'),
	userId: z.uuid('Usuario inválido.'),
	role: z.enum(['technician', 'supervisor'], { message: 'Rol de asignación inválido.' })
});

export const revokeAssignmentSchema = z.object({
	assignmentId: z.uuid('Asignación inválida.')
});

export const createContractSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'El nombre del contrato es obligatorio.')
		.max(120, 'El nombre no puede superar 120 caracteres.'),
	description: z
		.string()
		.trim()
		.max(2000, 'La descripción no puede superar 2000 caracteres.')
		.optional()
		.default('')
});

export const updateContractSchema = z.object({
	contractId: z.uuid('Contrato inválido.'),
	name: z
		.string()
		.trim()
		.min(1, 'El nombre del contrato es obligatorio.')
		.max(120, 'El nombre no puede superar 120 caracteres.'),
	description: z
		.string()
		.trim()
		.max(2000, 'La descripción no puede superar 2000 caracteres.')
		.optional()
		.default('')
});

export const assignContractUserSchema = z.object({
	contractId: z.uuid('Contrato inválido.'),
	userId: z.uuid('Usuario inválido.'),
	role: z.enum(['technician', 'supervisor'], { message: 'Rol de asignación inválido.' })
});

export const revokeContractAssignmentSchema = z.object({
	assignmentId: z.uuid('Asignación inválida.')
});
