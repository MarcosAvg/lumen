# Estado de implementación de Lumen

> Documento de seguimiento para que cualquier agente continúe el desarrollo sin perder contexto.
> Última actualización: **Etapa 6 completada**.

## Resumen

| Etapa                                             | Estado        |
| ------------------------------------------------- | ------------- |
| 0 — Proyecto y entorno reproducible               | ✅ Completada |
| 1 — Identidad, sesiones, roles y asignaciones     | ✅ Completada |
| 2 — Catálogos, servicios y trabajos               | ✅ Completada |
| 3 — Captura y almacenamiento fotográfico          | ✅ Completada |
| 4 — Envíos, revisiones e historial inmutable      | ✅ Completada |
| 5 — Cambios estructurales y destrucción explícita | ✅ Completada |
| 6 — Bandeja interna y Web Push                    | ✅ Completada |
| 7 — Búsqueda y exportaciones                      | ⏳ Pendiente  |
| 8 — Calidad, operaciones y publicación            | ⏳ Pendiente  |

## Stack real en uso

- **SvelteKit 3** + **Svelte 5** (runes forzadas) + **TypeScript 6** estricto, `@sveltejs/adapter-node`.
- **Tailwind CSS 4** + **shadcn-svelte 1.7** (estilo `nova`, base `neutral`).
- **PostgreSQL 17** + **Drizzle ORM 0.45** / **Drizzle Kit 0.31** (cliente `postgres.js`).
- **Zod 4**, **`@node-rs/argon2` 2.2** (Argon2id), **`sharp`** (procesado de imágenes) y
  **`web-push`** (Web Push VAPID).
- **pnpm 9.15.4**, **Vitest 4**, **ESLint 10** + **Prettier 3**.

## Convenciones del proyecto (SvelteKit 3)

- Imports internos con el alias **`#lib`** (SvelteKit 3 eliminó `$lib`).
- El **origen público** se fija en **build** vía `paths.origin` (build-arg `ORIGIN` en Compose).
- Rutas con `resolve()`; los componentes shadcn quedan exentos de la regla de navegación.
- CSRF de SvelteKit activo: las peticiones mutantes (POST/DELETE) deben llevar `Origin` acorde
  al origen de build (los navegadores lo hacen automáticamente).

## Etapa 4 — Envíos, revisiones e historial inmutable

### Modelo de datos (`drizzle/0004_submissions.sql`)

`evidence_submissions` (UNIQUE `target_id, sequence_no`), `submission_photos` (`photo_id`
**RESTRICT**, UNIQUE `submission_id, photo_id`, snapshots de grupo/orden/autoría), `reviews`
(UNIQUE `submission_id`, CHECK rechazo ⇒ motivo), y `evidence_targets.latest_submission_id`.

### Dominio (`#lib/server/domain/submissions.ts`)

`submitEvidence` (transacción + `FOR UPDATE`, valida estado/versión, exige ≥1 foto por requisito
obligatorio o ≥1 total, congela grupos/orden/IDs), `reviewSubmission` (una sola decisión),
`getHistory`, `getSubmissionDetail`, `getLatestRejection`, `listPendingReviews`.

### Corrección PHOTO‑04 (regresión de Etapa 4, arreglada en Etapa 5)

`getPhotoAccessContext` expone `historicalReference` (EXISTS sobre `submission_photos`) y
`isPhotoAvailable` permite descargar una foto retirada del borrador **si quedó congelada en una
entrega**. Antes, `content`/`thumbnail` devolvían `404` al mirar solo `removedAt`, rompiendo el
criterio «foto histórica visible y descargable».

## Etapa 5 — Cambios estructurales y destrucción explícita

### Dominio (`#lib/server/domain/structure.ts`)

- `getElementImpact` / `getWorkImpact` / `getServiceImpact`: recuento (trabajos, elementos,
  objetivos, entregas, fotos vigentes/totales) para el resumen previo.
- `deleteElement` / `deleteWork` / `deleteService`: transacción con **orden explícito de borrado**
  (`submission_photos → reviews → evidence_submissions → photo_requirements → photos →
evidence_targets → works/elements/service`). El orden es obligatorio: confiar en las cascadas
  viola el `RESTRICT` de `submission_photos.photo_id`.
- `convertWorkMode`: conversión `direct ↔ divided` **solo sin ninguna entrega** (rechazada o
  aprobada) en cualquiera de sus objetivos. Exige reasignar explícitamente todos los requisitos y
  fotos adicionales (`409` si el conjunto no coincide) y cancela sin cambios, o no hace nada.
- `getWorkForConversion`: datos del asistente (modo, requisitos y fotos por objetivo), sin mutar.

### Limpieza diferida (`#lib/server/storage/orphans.ts`)

`removeUnreferencedFiles` borra, **después del commit** y best-effort, los binarios que quedaron
sin fila en `photos`. Si falla, `scripts/cleanup.mjs` los recoge más tarde. Los paths son UUID por
foto, por lo que no se reutilizan.

### API

- `GET`/`DELETE /api/elements/[elementId]`
- `GET`/`DELETE /api/works/[workId]`
- `GET`/`DELETE /api/services/[serviceId]`
- `POST /api/works/[workId]/convert` (cuerpo `convertWorkModeSchema`)

Todas exigen **administrador**; el `GET` devuelve el impacto y el `DELETE` responde `200` con lo
eliminado y los archivos limpiados.

### UI

- `#lib/components/destructive-delete.svelte`: botón que consulta el impacto y exige confirmación
  con el resumen antes de borrar.
- `#lib/components/convert-work-mode.svelte`: asistente con mapeo manual (elementos destino +
  reasignación de requisitos/fotos) o confirmación explícita para unificar.
- Páginas: `services/[serviceId]` (eliminar trabajo), `works/[workId]` (eliminar elemento +
  conversión), `admin/services/[serviceId]` (eliminar servicio).

### Requisitos ya cubiertos desde etapas previas

- Congelado de requisitos tras el primer envío (REQ‑04) y borrado de requisito preenvío
  trasladando sus fotos a Adicionales (REQ‑03): implementados en `requirements.ts`.

## Etapa 6 — Bandeja interna y Web Push

### Modelo de datos (`drizzle/0005_notifications.sql`)

| Tabla                | Notas                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notifications`      | `recipient_user_id`, `service_id`/`target_id`/`submission_id`/`review_id` (todos **cascade**), `event_type`, `title`, `body`, `deep_link`, `event_key`, `read_at`; **UNIQUE(`recipient_user_id`,`event_key`)** para idempotencia |
| `push_subscriptions` | `user_id`, `endpoint` **único**, `p256dh`, `auth`, `user_agent`, `last_success_at`, `revoked_at`                                                                                                                                 |

### Dominio

- `#lib/server/domain/notifications.ts`: `resolveServiceRecipients` (usuarios **activos** con
  asignación **vigente** del rol), `createSubmissionNotifications` (supervisores, **sin admins**),
  `createReviewNotifications` (técnicos), `listNotifications`, `unreadNotificationCount`,
  `markNotificationRead`, `markAllNotificationsRead`. Inserción idempotente con
  `ON CONFLICT (recipient_user_id, event_key)`.
- `#lib/server/domain/push.ts`: VAPID (`isPushConfigured`, `getVapidPublicKey`),
  `savePushSubscription`/`removePushSubscription`, `dispatchPushToUsers` **best‑effort** (revoca
  `404/410`, `last_success_at`, nunca lanza) y `assertValidSubscription`.
- `submissions.ts`: las notificaciones se crean **dentro** de la transacción de envío/revisión; el
  push se dispara **después del commit** (cubre API y acciones de página). Un fallo de push no
  revierte la operación (NOTIF‑01).
- `structure.ts`: el resumen de impacto incluye el número de notificaciones vinculadas.

### API y UI

- `GET /api/push/vapid` (config + clave pública), `POST`/`DELETE /api/push/subscriptions`.
- Bandeja `(app)/notifications` con marcar una/todas como leídas y deep links protegidos; campana
  con contador en el layout; `(app)/settings` para activar/quitar push por dispositivo.
- PWA: `static/manifest.webmanifest`, iconos 192/512, `static/sw.js` (push + `notificationclick`,
  **sin caché**) y registro del service worker desde el layout.
- `pnpm vapid:generate` (`scripts/generate-vapid.mjs`) para generar las claves.

## Cómo ejecutar

Guía completa en el [`README.md`](README.md) (§ «Desarrollo local»). Resumen:

```bash
cp .env.example .env
docker compose up -d --build        # app + db + migraciones
# o desarrollo:
docker compose up -d db && pnpm install && pnpm db:migrate && pnpm dev
```

Scripts: `dev`, `build`, `start`, `check`, `lint`, `format`, `test`, `test:integration`,
`db:generate`, `db:migrate`, `db:studio`, `maintenance:cleanup`, `vapid:generate`.

## Pruebas realizadas y resultados

| Prueba                                      | Resultado                                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                | ✅ 0 errores, 0 avisos                                                                                                                                                                           |
| `pnpm lint`                                 | ✅ Limpio                                                                                                                                                                                        |
| `pnpm test` (unit: `cn` + pipeline `sharp`) | ✅ 6/6                                                                                                                                                                                           |
| `pnpm test:integration` (PostgreSQL real)   | ✅ 55/55                                                                                                                                                                                         |
| `pnpm build`                                | ✅                                                                                                                                                                                               |
| E2E HTTP (servidor compilado, Etapa 4)      | ✅ entrega, rechazo, segunda decisión `409`, corrección y aprobación                                                                                                                             |
| E2E HTTP PHOTO‑04                           | ✅ foto retirada de entrega histórica descarga `200`; sin historial, `404`                                                                                                                       |
| E2E HTTP Etapa 5                            | ✅ conversión `direct→divided` `200`, conversión con entrega `409`, borrado de elemento/trabajo/servicio `200`                                                                                   |
| E2E HTTP Etapa 6                            | ✅ `/api/push/vapid` (`configured:false`), alta de suscripción `200`, endpoint `http` `400`, bandeja y ajustes `200`, `manifest`/`sw.js`/icono `200`, entrega genera notificación del supervisor |

Pruebas de la Etapa 5 (`tests/integration/structural-changes.spec.ts`): WORK‑03 (conversión con
entrega histórica prohibida), WORK‑04 (reasignación completa o sin cambios), dividido→directo,
DEL‑01 (borrado de servicio con historial aislado) y limpieza de binarios huérfanos.

Pruebas de la Etapa 6 (`tests/integration/notifications.spec.ts`): alcance de destinatarios
(supervisores/técnicos asignados activos, ajenos e inactivos excluidos), idempotencia, marcado de
leído propio, cascada al borrar servicio, CRUD de suscripciones con reasignación de endpoint y
NOTIF‑01 (sin VAPID, el envío se omite y la notificación persiste).

## Decisiones tomadas

- **Borrado destructivo**: orden explícito dentro de transacción; limpieza de archivos best-effort
  tras el commit, con `maintenance:cleanup` como red de seguridad.
- **Conversión de modo**: se exige confirmar/mapear el conjunto completo de requisitos y fotos;
  cualquier entrega previa la bloquea.
- **ZIP por entrega/servicio y CSV administrativo**: diferidos a la Etapa 7.
- **Notificaciones**: internas en la transacción del envío/revisión (idempotentes por
  `recipient_user_id` + `event_key`); push VAPID best-effort tras el commit con `web-push`.
- **Service worker**: sin caché de respuestas (Lumen es online-only); solo push y `notificationclick`.
- **Procesado de imágenes síncrono**; limpieza por script y por borrado; sin dependencias externas
  más allá de `web-push` (canal estándar requerido por Web Push).

## Problemas conocidos / consideraciones

- Sin limitación de tasa en login/subidas (Etapa 8).
- Búsqueda/ZIP/CSV (Etapa 7); push requiere HTTPS y claves VAPID (opcional).
- `scripts/cleanup.mjs` debe programarse (cron) para garantizar la purga de huérfanos antiguos.
- La autorización se evalúa antes que la validación de contenido (p. ej. un revisor no asignado
  recibe `404` aunque el motivo esté vacío), lo que es intencional (no filtra recursos).

## Próximos pasos (Etapa 7)

1. Búsqueda global por nombre visible, filtrada por sesión, rol y asignaciones, con paginación.
2. Descarga de foto en evidencia actual e histórica (ya disponible por endpoint).
3. ZIP de entrega desde snapshot (grupos y orden congelados).
4. ZIP de servicio (última entrega aprobada por objetivo + `resumen.csv` con omitidos).
5. CSV administrativo (admin) y streaming/temporales acotados; pruebas EXP‑01/02/03 y SEARCH‑01.
