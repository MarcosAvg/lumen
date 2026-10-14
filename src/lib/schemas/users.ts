import { z } from 'zod';
import { displayNameSchema, passwordSchema, usernameSchema } from './auth';

export const roleSchema = z.enum(['admin', 'supervisor', 'technician'], {
	message: 'Rol inválido.'
});

export const createUserSchema = z.object({
	username: usernameSchema,
	displayName: displayNameSchema,
	password: passwordSchema,
	role: roleSchema
});

export const userTargetSchema = z.object({
	userId: z.uuid('Usuario inválido.')
});

export const changeRoleSchema = z.object({
	userId: z.uuid('Usuario inválido.'),
	role: roleSchema,
	confirmRevoke: z.string().optional()
});

export const resetPasswordSchema = z.object({
	userId: z.uuid('Usuario inválido.'),
	password: passwordSchema
});
