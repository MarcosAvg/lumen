import { z } from 'zod';

/** Forma mínima de un `PushSubscription` enviado por el navegador. */
export const pushSubscriptionSchema = z.object({
	endpoint: z.url('El endpoint de push no es válido.').max(2048),
	keys: z.object({
		p256dh: z.string().min(1, 'Falta la clave pública del dispositivo.').max(255),
		auth: z.string().min(1, 'Falta el secreto de autenticación.').max(255)
	})
});

export const removePushSubscriptionSchema = z.object({
	endpoint: z.url('El endpoint de push no es válido.').max(2048)
});
