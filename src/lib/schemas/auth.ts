import { z } from 'zod';

export const usernameSchema = z
	.string()
	.trim()
	.min(3, 'El usuario debe tener al menos 3 caracteres.')
	.max(32, 'El usuario no puede superar 32 caracteres.')
	.regex(/^[A-Za-z0-9._-]+$/, 'El usuario solo admite letras, números, punto, guion y guion bajo.');

export const displayNameSchema = z
	.string()
	.trim()
	.min(1, 'El nombre visible es obligatorio.')
	.max(80, 'El nombre visible no puede superar 80 caracteres.');

export const passwordSchema = z
	.string()
	.min(10, 'La contraseña debe tener al menos 10 caracteres.')
	.max(200, 'La contraseña no puede superar 200 caracteres.');

export const loginSchema = z.object({
	username: usernameSchema,
	password: z.string().min(1, 'La contraseña es obligatoria.')
});

export const setupSchema = z
	.object({
		username: usernameSchema,
		displayName: displayNameSchema,
		password: passwordSchema,
		confirmPassword: z.string()
	})
	.refine((data) => data.password === data.confirmPassword, {
		path: ['confirmPassword'],
		message: 'Las contraseñas no coinciden.'
	});
