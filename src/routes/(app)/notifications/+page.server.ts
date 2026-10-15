import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import {
	countNotifications,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead
} from '#lib/server/domain/notifications';
import { parseForm } from '#lib/server/forms';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 30;
const markReadSchema = z.object({ notificationId: z.uuid('Notificación inválida.') });

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const page = Math.max(Number(url.searchParams.get('page') ?? '1') || 1, 1);
	const [items, total] = await Promise.all([
		listNotifications(getDatabase().db, user.id, {
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE
		}),
		countNotifications(getDatabase().db, user.id)
	]);
	return { title: 'Notificaciones', items, total, page, pageSize: PAGE_SIZE };
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
