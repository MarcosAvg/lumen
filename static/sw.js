// Service worker de Lumen: Web Push y clic en notificación.
//
// Deliberadamente NO cachea respuestas: Lumen es online-only y nunca debe servir
// evidencia privada desde caché a otra sesión del mismo dispositivo.

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	let payload;
	try {
		payload = event.data ? event.data.json() : {};
	} catch {
		payload = { title: 'Lumen', body: event.data ? event.data.text() : '' };
	}

	const title = payload.title || 'Lumen';
	const options = {
		body: payload.body || '',
		tag: payload.tag || undefined,
		icon: '/icons/icon-192.png',
		badge: '/icons/badge-96.png',
		data: { url: payload.url || '/' }
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || '/';

	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const client of windows) {
				if ('focus' in client) {
					await client.focus();
					if ('navigate' in client) await client.navigate(url);
					return;
				}
			}
			if (self.clients.openWindow) await self.clients.openWindow(url);
		})()
	);
});
