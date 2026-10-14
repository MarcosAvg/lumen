import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import {
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead
} from '#lib/server/domain/notifications';
import { parseForm } from '#lib/server/forms';
import type { Actions, PageServerLoad } from './$types';

const markReadSchema = z.object({ notificationId: z.uuid('Notificación inválida.') });

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	return { items: await listNotifications(getDatabase().db, user.id) };
};

export const actions: Actions = {
	read: async ({ locals, request }) => {
		const user = requireUser(locals);
		const parsed = parseForm(markReadSchema, await request.formData());
		if (!parsed.ok) return fail(400, { message: 'Notificación inválida.' });
		await markNotificationRead(getDatabase().db, user.id, parsed.data.notificationId);
		return { success: 'Notificación marcada como leída.' };
	},

	readAll: async ({ locals }) => {
		const user = requireUser(locals);
		const count = await markAllNotificationsRead(getDatabase().db, user.id);
		return { success: `${count} notificación(es) marcada(s) como leída(s).` };
	}
};
