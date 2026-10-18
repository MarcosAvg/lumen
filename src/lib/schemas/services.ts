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

export const serviceLifecycleSchema = z.enum(['planned', 'active', 'inactive', 'archived'], {
	message: 'Estado de servicio inválido.'
});

export const contractLifecycleSchema = z.enum(['active', 'inactive', 'archived'], {
	message: 'Estado de contrato inválido.'
});

export const setServiceLifecycleSchema = z.object({
	serviceId: z.uuid('Servicio inválido.'),
	lifecycle: serviceLifecycleSchema
});

export const setContractLifecycleSchema = z.object({
	contractId: z.uuid('Contrato inválido.'),
	lifecycle: contractLifecycleSchema
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

const marginMm = z.coerce
	.number()
	.int('Los márgenes deben ser números enteros (mm).')
	.min(10, 'El margen mínimo es 10 mm.')
	.max(80, 'El margen máximo es 80 mm.');

/** Márgenes del PDF de evidencia del contrato, en milímetros. */
export const contractPdfMarginsSchema = z.object({
	contractId: z.uuid('Contrato inválido.'),
	marginTop: marginMm,
	marginBottom: marginMm,
	marginLeft: marginMm,
	marginRight: marginMm
});

export const assignContractUserSchema = z.object({
	contractId: z.uuid('Contrato inválido.'),
	userId: z.uuid('Usuario inválido.'),
	role: z.enum(['technician', 'supervisor'], { message: 'Rol de asignación inválido.' })
});

export const revokeContractAssignmentSchema = z.object({
	assignmentId: z.uuid('Asignación inválida.')
});
