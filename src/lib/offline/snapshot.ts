/**
 * Almacenamiento local del snapshot de consulta offline.
 *
 * El service worker no cachea respuestas privadas: el snapshot vive en
 * IndexedDB y se borra al cerrar sesión. La página `offline.html` lee el mismo
 * registro sin depender del servidor.
 */
const DB_NAME = 'lumen-offline';
const STORE_NAME = 'snapshot';
const RECORD_KEY = 'current';

export const OFFLINE_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface OfflineSnapshotRecord {
	userId: string;
	savedAt: number;
	data: unknown;
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE_NAME)) {
				request.result.createObjectStore(STORE_NAME);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB no disponible.'));
	});
}

function transaction<T>(
	mode: IDBTransactionMode,
	operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	return openDatabase().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const tx = db.transaction(STORE_NAME, mode);
				const request = operation(tx.objectStore(STORE_NAME));
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error ?? new Error('Error de IndexedDB.'));
				tx.oncomplete = () => db.close();
				tx.onerror = () => {
					db.close();
					reject(tx.error ?? new Error('Error de IndexedDB.'));
				};
			})
	);
}

export async function saveOfflineSnapshot(userId: string, data: unknown): Promise<void> {
	try {
		await transaction('readwrite', (store) =>
			store.put({ userId, savedAt: Date.now(), data } satisfies OfflineSnapshotRecord, RECORD_KEY)
		);
	} catch {
		// La consulta offline es opcional: si el navegador no permite IndexedDB,
		// la app sigue funcionando online.
	}
}

export async function loadOfflineSnapshot(): Promise<OfflineSnapshotRecord | null> {
	try {
		const record = await transaction<OfflineSnapshotRecord | undefined>('readonly', (store) =>
			store.get(RECORD_KEY)
		);
		return record ?? null;
	} catch {
		return null;
	}
}

export async function clearOfflineSnapshot(): Promise<void> {
	try {
		await transaction('readwrite', (store) => store.delete(RECORD_KEY));
	} catch {
		// Ignorado: no hay nada que borrar o IndexedDB no está disponible.
	}
}
