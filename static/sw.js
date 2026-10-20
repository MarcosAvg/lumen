// Service worker de Lumen: Web Push, clic en notificación y modo consulta.
//
// No cachea respuestas privadas ni fotos. Solo precachea la página estática de
// consulta y los assets de la aplicación. Los datos offline viven en IndexedDB.
const CACHE_NAME = 'lumen-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.add(OFFLINE_URL))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith('lumen-offline-') && key !== CACHE_NAME)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// Navegación: red primero; sin red, página de consulta offline.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => {
				const cached = await caches.match(OFFLINE_URL);
				return (
					cached ??
					new Response('Sin conexión. Abre Lumen con red para sincronizar datos.', {
						status: 503,
						headers: { 'Content-Type': 'text/plain; charset=utf-8' }
					})
				);
			})
		);
		return;
	}

	// Assets inmutables de SvelteKit y recursos de la PWA.
	if (
		url.pathname.startsWith('/_app/') ||
		url.pathname.startsWith('/icons/') ||
		url.pathname === '/manifest.webmanifest'
	) {
		event.respondWith(
			caches.match(request).then(
				(cached) =>
					cached ??
					fetch(request).then((response) => {
						if (response.ok) {
							const copy = response.clone();
							void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
						}
						return response;
					})
			)
		);
	}
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
