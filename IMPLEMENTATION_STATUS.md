# Estado de implementación de Lumen

> Documento de seguimiento para que cualquier agente continúe el desarrollo sin perder contexto.
> Última actualización: **Etapa 8 completada**.

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
| 7 — Búsqueda y exportaciones                      | ✅ Completada |
| 8 — Calidad, operaciones y publicación            | ✅ Completada |

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

### Corrección del rechazo (regresión de Etapa 4)

El formulario de rechazo no enviaba `decision`, pero la acción validaba con `reviewSchema` (que la
exige), así que **fallaba en silencio** y la entrega quedaba `in_review`. Se añadió `rejectSchema`
(solo valida el motivo) y la decisión se fija en servidor; se añadió cobertura unitaria y E2E del
rechazo.

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

## Etapa 7 — Búsqueda, exportaciones y paginación

### Búsqueda global

- `#lib/server/domain/search.ts` (`searchByName`): nombre visible actual de servicios, trabajos y
  elementos, `ILIKE` con comillas escapadas y **ámbito resuelto en servidor** (admin todo; resto,
  asignación vigente). `GET /api/search?q=...` y página `(app)/search` con formulario en el header.

### Exportaciones (`archiver`, streaming)

- `#lib/server/exports/names.ts`: saneado anti-traversal y desambiguación de nombres.
- `#lib/server/exports/csv.ts`: comillas/escapes, UTF-8 con BOM y **neutralización de fórmulas**.
- `#lib/server/domain/exports.ts`:
  - `getSubmissionArchive` → ZIP de entrega desde `submission_photos` (grupos y orden congelados).
  - `getServiceArchive` → ZIP de servicio con **solo la última entrega aprobada** por objetivo,
    jerarquía directa/dividida y `resumen.csv` con las unidades omitidas.
  - `getServicesCsv` → CSV administrativo (una fila por trabajo directo o elemento, sin fotos).
- `#lib/server/exports/zip.ts`: `ZipArchive` en streaming (`Content-Disposition` seguro).
- API: `GET /api/submissions/[id]/export.zip`, `GET /api/services/[id]/export.zip`,
  `GET /api/admin/exports/services.csv` (solo admin). Autorización por ámbito revalidada al descargar.
- UI: botones «Descargar ZIP de esta entrega», «Exportar evidencias aprobadas (ZIP)» y «Exportar CSV».

### Filtros y paginación

- `listPendingReviews` admite filtros (servicio, rango de fechas, texto) y `limit/offset` con total;
  la cola de revisión los expone con paginación.
- `listNotifications`/`countNotifications` con paginación en la bandeja.

### Pendientes menores cerrados

- Secciones **plegables** por grupo en la captura.
- Prueba dedicada **NOTIF‑02** (tras revocar el acceso, el recurso enlazado deja de autorizarse).
- `hasSubmissions` simplificado (sin el guard `to_regclass`) y comentario del layout corregido.

## Etapa 8 — Calidad, operaciones y publicación

### Seguridad

- `#lib/server/security/rate-limit.ts`: limitador de **ventana deslizante en memoria** (por
  instancia) aplicado a **login**, **setup** y **subida de fotos** → `429` con `Retry-After`.
- Cabeceras de seguridad en `hooks.server.ts` (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`) y **CSP** vía
  configuración de SvelteKit (`csp` mode `auto`) en `vite.config.ts`.
- Validación de imágenes por **contenido** con allowlist JPEG/PNG/WebP (ya en `images.ts`).

### Accesibilidad y sin conexión

- Banner «sin conexión» global (`offline-banner.svelte`); en la captura se **deshabilitan** la
  subida y el envío sin red, sin fingir éxito (Lumen es online-only).
- Enlace «Saltar al contenido» y `main#contenido` en el layout de la app.

### Operaciones

- `scripts/backup.mjs` / `scripts/restore.mjs` (+ `scripts/lib/backup.mjs`): `pg_dump`/`pg_restore`
  y tar del volumen de fotos con `manifest.json` (tamaños y `sha256`); usan `pg_dump` local o el
  contenedor `db` de Compose.
- **Restauración probada** (drill real): backup de BD + fotos, restauración en una base separada y
  en un directorio nuevo, verificando filas y archivos.
- `maintenance:cleanup` ahora **registra el uso de disco** del volumen de fotos.

### E2E, dependencias y publicación

- **Playwright** (`e2e/`, `playwright.config.ts`, `scripts/e2e-server.mjs`): flujo crítico en
  **escritorio y móvil** (acceso, servicio, trabajo, captura, envío, revisión, búsqueda) y
  comprobación de cabeceras.
- Dependencias actualizadas dentro de rango; lockfile reproducible.
- `.github/workflows/ci.yml` (check, lint, unit, integración con Postgres, build y E2E) y
  `.github/workflows/release.yml` (imagen a **GHCR** por tag).
- `docs/deployment.md`: HTTPS/proxy, `ADDRESS_HEADER`/`XFF_DEPTH`, migraciones, VAPID,
  backups/restauración, mantenimiento, seguridad y GHCR.

## Rediseño de UI/UX (post-etapa 8)

Auditoría y refuerzo de jerarquía, navegación y modales, sin tocar dominio ni permisos:

- **Sidebar de navegación** (shadcn) colapsable en escritorio y `Sheet` en móvil, con secciones
  **General** y **Administración** (según rol), estado activo por prefijo de ruta, cabecera con
  buscador, campana y `DropdownMenu` de usuario (Ajustes, Cerrar sesión).
- **Jerarquía/contexto**: `Breadcrumb` en servicio, trabajo, elemento y entrega; componente
  `PageHeader` reutilizable.
- **Modales reales** (`AlertDialog`/`Dialog`): confirmación de **envío**, **aprobación**, **rechazo
  con motivo** y **borrado destructivo** (con resumen de impacto); formularios de **nuevo servicio**,
  **nuevo trabajo** y **añadir elemento** en diálogos.
- **Tabs** de componente para «Evidencia actual | Historial».
- **Toasts** (sonner) en acciones de cliente (p. ej. borrado), manteniendo alertas inline para
  errores de validación de formularios.
- Componentes nuevos instalados: `sidebar, dialog, alert-dialog, sheet, dropdown-menu, tabs, select,
textarea, table, breadcrumb, tooltip, avatar, collapsible, skeleton, progress, sonner`.
- E2E actualizado (selectores de sidebar y diálogos): 6/6 en escritorio y móvil.

## Catálogos: selección en dos pasos y usos

Se eliminó el volcado plano de catálogos en selectores:

- **Selección en dos pasos** (`catalog-item-picker` y su variante multi con chips): primero se elige
  el **catálogo** y después un ítem de ese catálogo con **búsqueda**. Sustituye a los `<select>`
  masivos al crear trabajo/elemento, en el **edificio** del servicio, en las relaciones y en la
  generación en lote. Un combobox interno (`catalog-item-combobox`/`-multi-combobox`) reutiliza la
  búsqueda de ítems.
- **Filtrado por propósito**: el selector de edificio usa catálogos `buildings` (con respaldo a
  todos si no hay ninguno marcado); trabajos/elementos excluyen los de edificios.
- **Acumulación** en generación en lote: los ítems elegidos se conservan como chips al cambiar de
  catálogo (se pueden componer desde varios).
- **Pantallas de catálogo**: búsqueda en la lista; en el detalle, búsqueda y paginación de ítems,
  columna de **usos** (trabajos/elementos/edificios) y **reordenar** ítems (arriba/abajo).
- `ServiceSummary` expone `buildingCatalogItemId` para preseleccionar el edificio actual.

**Modales de trabajo/elemento**: el origen del nombre se elige con pestañas mutuamente excluyentes
«Desde catálogo» (catálogo → ítem) y «Nombre propio» (input), evitando ambigüedad y garantizando que
se envía exactamente un origen; el modo inicial es catálogo si el servicio tiene catálogos.

**Elementos**: se pueden crear **al crear el trabajo dividido** y **dentro del propio trabajo** con un
editor reutilizable que permite **elegir varios ítems de un catálogo a la vez** o añadir nombres
propios. `createWork` acepta `elements` y `addElements` crea N elementos con sus objetivos en una
transacción; el antiguo «Añadir elemento» del servicio se retiró.

**Generación en lote**: pasó de ser una **ruta separada** a un **modal** en el servicio
(`generate-structure-dialog`) con dos pasos (selección → vista previa → aplicar) apoyado en endpoints
JSON `.../generate/preview` y `.../generate/apply`; la ruta antigua se eliminó.

**Relaciones de catálogo**: se gestionan **por ítem** (botón «Relaciones (N)» que abre un modal con
los dos sentidos, alta individual y quitado) y **en lote** (modal «Relacionar en lote» que enlaza
varios ítems de este catálogo con un único ítem de otro catálogo, en cualquiera de los dos sentidos,
con resumen previo). El sentido origen → destino es explícito porque la generación en lote depende de
él. La API `POST /api/catalogs/[catalogId]/relations/batch` usa `createRelationsBatch` (validación de
catálogos distintos, **omisión de pares existentes**, transaccional) y `DELETE
/api/catalogs/[catalogId]/relations/[relationId]` elimina una relación. La migración
`0007_relation_unique_null_type` añade un índice único **parcial** para `relation_type IS NULL`,
cerrando el hueco del índice par+tipo (los `NULL` son distintos en Postgres), con deduplicación
previa de las relaciones existentes sin tipo.

**Nomenclatura de evidencia**: si el objetivo **no tiene requisitos**, el grupo de fotografías se
muestra como **«Fotografías»** (captura, historial y carpetas del ZIP); si tiene requisitos, se
mantiene **«Adicionales»**. Sin cambios de modelo (sigue siendo el grupo `additional`).

**Catálogos de requisitos y tipos**: el `purpose` de catálogo admite ahora **`requirements`**
(además de `general` y `buildings`), y la lista de catálogos se organiza en **pestañas por tipo** con
contadores. Los selectores respetan el tipo: trabajos/elementos usan `general`, el edificio del
servicio usa `buildings` (con respaldo a no-requisitos) y los requisitos usan `requirements`.

Los requisitos pueden **ligarse a un ítem** de un catálogo de requisitos con nombre **dinámico**:
`photo_requirements` pasa a `catalog_item_id` + `custom_name` con XOR (migración
`0008_requirement_catalog_link`), el nombre visible es `coalesce(catalog_items.name, custom_name)`,
renombrar a mano desvincula y borrar el ítem/catálogo copia el nombre y desvincula. Se pueden añadir
**varios requisitos a la vez** desde el catálogo (`POST /api/targets/[targetId]/requirements/batch`,
omite duplicados por nombre y es transaccional) o escribir requisitos libres. Las entregas conservan
`requirement_name_snapshot`, así que el historial no cambia.

**Requisitos al crear**: el helper `insertRequirements` (dominio) se reutiliza para aplicar un
conjunto de requisitos —de catálogo o libres— **al crear un trabajo** (objetivo directo o cada
elemento), **al añadir elementos** y **al generar en lote** (a cada objetivo creado). El editor
`requirements-editor` (multi-picker + nombre propio + «Obligatorio») se integra en los tres modales.

**Rediseño de escritorio**: el área de contenido crece según la plantilla (`max-w-[1600px]` en
listados, tablero, búsqueda y revisiones; `max-w-[1400px]` en fichas) y la cabecera es sticky. Los
listados (Servicios, Usuarios, Catálogos, Revisiones, Notificaciones, ítems de catálogo, tablero y
mesa de revisión) pasan a **tablas densas** reutilizando `ui/table` (`DataTable`). Las fichas de
Servicio, Trabajo y Entrega se reorganizan en **dos columnas** con rail de datos/acciones, y el
progreso usa un **instrumento medido** (`ProgressMeter`). Se añaden primitivas (`PageHeader`,
`EmptyState`, `DataTable`, `ProgressMeter`) y una paleta base fría con colores de estado
(`--state-*`). Todo el escritorio se añade con `lg:`/`xl:`; el móvil conserva su comportamiento.

**Mesa de revisión y búsqueda**: Revisiones pasa a `PageHeader` + **toolbar** (sin tarjeta) + tabla con
enlace al servicio y columna de **antigüedad** relativa (`formatRelativeAge`, resaltada a partir de
24 h) para priorizar. Buscar usa `PageHeader` + toolbar y resultados **agrupados por tipo**
(Servicios/Trabajos/Elementos). Ajustes adopta `PageHeader`. Se elimina el patrón de cabecera antigua
en estas pantallas.

**Consistencia estética (contrato de UI)**: se crean `NativeSelect`, `LabeledCheckbox` y `StatusBadge`.
Los **14 `<select>` crudos** y los checkboxes ad-hoc se sustituyen por los componentes compartidos
(altura única `h-9` en `Input`/`NativeSelect` y botón `default`), `StatusBadge` cablea los tokens
`--state-*` en evidencia, trabajos, servicio, entregas e histórico, y se unifica la escala de las
cabeceras de ficha (`lg:text-3xl`), los vacíos (`EmptyState`) y el padding de tarjetas (fuera los
parches `pt-6`). Contrato documentado en `docs/05`.

**UX móvil**: los técnicos estrenan **barra de navegación inferior** (zona del pulgar, ítems por rol:
técnico/supervisor/admin con «Más»), la cabecera móvil sustituye el buscador por un icono, los
controles ganan **área táctil ≥ 44 px** y los diálogos pasan a **bottom sheet**. Los listados
(Servicios, Usuarios, Catálogos, Revisiones, Notificaciones) muestran **tarjetas** en `< md` y tabla
en escritorio; la captura usa **barra de acción fija** y oculta la nav inferior. Se añaden
_safe areas_ (`viewport-fit=cover`, `env(safe-area-inset-*)`) y `theme-color` claro/oscuro.

**Móvil minimalista y tarjeta enlazada**: se **ocultan los breadcrumbs** en `< md` (basta el `h1` y la
barra inferior); Tablero y Buscar también usan **tarjetas** en móvil (ningún listado con scroll
horizontal); y se elimina la navegación duplicada: el **nombre del recurso es el enlace** y, en móvil,
un **enlace estirado** hace que **toda la tarjeta** navegue (acciones secundarias en `z-10`). Se alinean
los botones de las barras a la altura de los campos (`h-9`).

**Cabecera compacta, nav siempre y badges alineados**: la **barra inferior se muestra siempre**
(incluida la captura, con la barra de acción fija **por encima**); el título baja a `text-xl` en móvil
(`lg:text-3xl`) y la descripción se **oculta en listados** y se **limita a 2 líneas** en fichas. Los
badges pasan **fuera del `h1`**, alineados con un patrón `flex items-center gap-3` (título
`min-w-0 truncate` + badges `shrink-0`).

**Exportación ZIP solo para admin y supervisor**: los **técnicos no exportan** ZIP (capturan y envían).
La política `canExportZip(role)` se aplica con `requireExportZip` (403) en `GET
/api/services/[serviceId]/export.zip` y `GET /api/submissions/[submissionId]/export.zip`, **antes** del
chequeo de ámbito; los botones «Exportar ZIP»/«Descargar ZIP» se ocultan a los técnicos. Las descargas
de **foto individual** no cambian. `docs/01`, `docs/04` y `docs/05` actualizados; unit de la política y
E2E con un técnico (403 y sin botón).

**Confirmaciones destructivas en modal**: se convierten en **`AlertDialog`** las confirmaciones que
estaban **inline**: retirar fotografía, eliminar requisito (antes sin confirmación), eliminar ítem de
catálogo, eliminar catálogo y revocar asignación. El visor de fotos (lightbox) pasa al componente
**`Dialog`**. E2E comprueban `role="alertdialog"` en cada caso. Regla documentada en `docs/05`.

**Fila clicable**: las filas dejaban de parecer «listas planas». En las **tablas** el enlace principal
se **estira sobre toda la fila** (fila `relative`, acciones en `z-10`); las **listas internas**
(trabajos, elementos) van en un **contenedor con borde y divisores** (`divide-y overflow-hidden
rounded-lg border`) con filas clicables (`hover:bg-muted/50`, `active:bg-muted/70`); las **tarjetas
móviles** ganan feedback táctil (`active:bg-muted/50`). E2E nuevo `row-click` pulsa fuera del nombre y
verifica la navegación.

**Chips, medidores y cabecera de servicio**: se añade `Chip` (fondo tenue + texto del color, sin borde)
y `StatusBadge` lo reutiliza; el modo Directo/Dividido va en chip neutro y los chips van **alineados al
final** de cada fila. `ProgressMeter` deja de mostrar la etiqueta «objetivos aprobados» (barra + `X/Y` +
`%`) y aparece `MiniMeter` para el progreso de elementos. La cabecera del servicio integra los
metadatos (Edificio/acceso) como etiqueta tenue + valor y el medidor como firma, sin la tarjeta aparte.

**Acceso a asignaciones desde la ficha**: la ficha del servicio gana (solo admin) un botón
**«Gestionar asignaciones»** en la cabecera y un enlace **«Asignar»** en la tarjeta de Participantes,
que llevan a `/admin/services/[serviceId]` (asignar/revocar). Antes solo se llegaba desde el listado de
Servicios. E2E extendido: el admin ve el acceso y navega; el técnico no lo ve.

**Limpieza**: se corrigió un caso de no-determinismo en `cleanupOrphans` (`mtimeMs` marginalmente
por delante de `now`) que hacía intermitente la prueba de limpieza.

**Borrado de servicio**: el administrador puede eliminarlo desde la **página del servicio** (Zona de
peligro) y desde la **lista de Servicios de administración**, con resumen de impacto y confirmación.
Los límites de tasa (login/setup/subidas) son **configurables por entorno** (`RATE_LIMIT_*`).

**Errores HTTP**: un `DomainError` (p. ej. 404) que escapaba de un `load` o una acción se mostraba
como **500**. `#lib/server/http.ts` (`toHttpError`/`orHttp`) traduce los errores de dominio a
`HttpError` con su estado; se aplica en guardas y en los `load` de servicios/trabajos/elementos/
entregas y administración. Además, **eliminar un catálogo redirige** a la lista (evita reejecutar el
`load` sobre el catálogo borrado). Enlaces antiguos y recursos fuera de ámbito devuelven 404.

**Eliminación de usuarios con firma**: se puede **eliminar** una cuenta (además de desactivarla) y su
**nombre se conserva** en el historial. La migración `0006_author_snapshots` añade nombres
congelados (`submitted_by_name`, `reviewer_name`, `photo_uploaded_by_name`, `uploaded_by_name`,
`removed_by_name`, `actor_name`) que se rellenan al actuar y se leen con `coalesce(snapshot, users)`;
`deleteUser` protege al último administrador activo. Borrado con **impacto y confirmación** en
`admin/users` (`/api/users/[userId]`). `docs/01` actualizado.

**Alta y edición de usuarios**: tanto **Nuevo usuario** como **Editar** son **modales** en
`admin/users` (botón «Nuevo usuario» en la cabecera y «Editar» por fila). El de edición reúne tres
secciones con su propio botón: **Datos** (`updateUserProfile` cambia nombre visible y nombre de
usuario, normaliza y rechaza duplicados con `409`), **Rol** (`changeRole`, mostrando las asignaciones
incompatibles a revocar y confirmación dentro del propio modal) y **Contraseña** (`resetPassword`,
que además cierra sus sesiones). Ambos usan **enhance** progresivo: ante un fallo el modal permanece
abierto con el error visible y solo se cierra cuando la acción confirma éxito, sin que un aviso previo
los cierre o vacíe los campos. La firma histórica queda **congelada** (el renombrado no reescribe el
pasado). El helper de integración cierra su cliente de Postgres para no agotar el pool.

## Cómo ejecutar

Guía completa en el [`README.md`](README.md) (§ «Desarrollo local»). Resumen:

```bash
cp .env.example .env
docker compose up -d --build        # app + db + migraciones
# o desarrollo:
docker compose up -d db && pnpm install && pnpm db:migrate && pnpm dev
```

Scripts: `dev`, `build`, `start`, `check`, `lint`, `format`, `test`, `test:integration`,
`test:e2e`, `db:generate`, `db:migrate`, `db:studio`, `maintenance:cleanup`, `backup`, `restore`,
`vapid:generate`.

## Pruebas realizadas y resultados

| Prueba                                         | Resultado                                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                   | ✅ 0 errores, 0 avisos                                                                                                                                                                           |
| `pnpm lint`                                    | ✅ Limpio                                                                                                                                                                                        |
| `pnpm test` (unit)                             | ✅ 11/11                                                                                                                                                                                         |
| `pnpm test:integration` (PostgreSQL real)      | ✅ 66/66                                                                                                                                                                                         |
| `pnpm test:e2e` (Playwright, escritorio+móvil) | ✅ 8/8                                                                                                                                                                                           |
| `pnpm build`                                   | ✅                                                                                                                                                                                               |
| Drill de restauración                          | ✅ backup BD+fotos y restauración en base/directorio separados (filas y archivos verificados)                                                                                                    |
| E2E HTTP (servidor compilado, Etapa 4)         | ✅ entrega, rechazo, segunda decisión `409`, corrección y aprobación                                                                                                                             |
| E2E HTTP PHOTO‑04                              | ✅ foto retirada de entrega histórica descarga `200`; sin historial, `404`                                                                                                                       |
| E2E HTTP Etapa 5                               | ✅ conversión `direct→divided` `200`, conversión con entrega `409`, borrado de elemento/trabajo/servicio `200`                                                                                   |
| E2E HTTP Etapa 6                               | ✅ `/api/push/vapid` (`configured:false`), alta de suscripción `200`, endpoint `http` `400`, bandeja y ajustes `200`, `manifest`/`sw.js`/icono `200`, entrega genera notificación del supervisor |
| E2E HTTP Etapa 7                               | ✅ ZIP entrega/servicio `200` (contenido y `resumen.csv` verificados con `unzip`), CSV admin con `Entregas` correctas `200`, CSV a técnico `403`, búsqueda filtrada por ámbito                   |

Pruebas de la Etapa 5 (`tests/integration/structural-changes.spec.ts`): WORK‑03 (conversión con
entrega histórica prohibida), WORK‑04 (reasignación completa o sin cambios), dividido→directo,
DEL‑01 (borrado de servicio con historial aislado) y limpieza de binarios huérfanos.

Pruebas de la Etapa 6 (`tests/integration/notifications.spec.ts`): alcance de destinatarios
(supervisores/técnicos asignados activos, ajenos e inactivos excluidos), idempotencia, marcado de
leído propio, cascada al borrar servicio, CRUD de suscripciones con reasignación de endpoint,
NOTIF‑01 (sin VAPID, el envío se omite y la notificación persiste) y NOTIF‑02 (tras revocar acceso).

Pruebas de la Etapa 7 (`tests/integration/search-exports.spec.ts`): SEARCH‑01 (ámbito), EXP‑01
(ZIP de entrega con grupos/orden del snapshot), EXP‑02 (ZIP de servicio solo aprobados + resumen de
omitidos), saneado de nombres y neutralización de fórmulas en CSV, paginación/filtros de la cola de
revisión.

Pruebas de la Etapa 8: unit `rate-limit.spec.ts` (ventana deslizante y bloqueo con `Retry-After`);
E2E Playwright del flujo crítico en escritorio y móvil y de las cabeceras de seguridad/CSP; drill
de restauración manual documentado y ejecutado.

## Decisiones tomadas

- **Borrado destructivo**: orden explícito dentro de transacción; limpieza de archivos best-effort
  tras el commit, con `maintenance:cleanup` como red de seguridad.
- **Conversión de modo**: se exige confirmar/mapear el conjunto completo de requisitos y fotos;
  cualquier entrega previa la bloquea.
- **Exportaciones**: ZIP en **streaming** con `archiver` (sin cargar en memoria); el ZIP de entrega
  usa el snapshot congelado y el de servicio solo la última entrega aprobada + `resumen.csv`.
- **CSV administrativo**: solo admin, sin fotos, con BOM y neutralización de fórmulas.
- **Notificaciones**: internas en la transacción del envío/revisión (idempotentes por
  `recipient_user_id` + `event_key`); push VAPID best-effort tras el commit con `web-push`.
- **Service worker**: sin caché de respuestas (Lumen es online-only); solo push y `notificationclick`.
- **Procesado de imágenes síncrono**; limpieza por script y por borrado; dependencias externas
  limitadas a `web-push` (canal estándar de Web Push) y `archiver` (ZIP).
- **Rate limiting** en memoria (una instancia); con varias réplicas cada una aplica su límite.
- **CSP compatible** (`csp` de SvelteKit en modo `auto`) y cabeceras de seguridad en el hook.
- **Backup/restore** con `pg_dump`/`pg_restore` (local o contenedor `db`) + tar del volumen y
  `manifest.json` con checksums; restauración verificada en entorno separado.

## Problemas conocidos / consideraciones

- El rate limiting es por instancia (suficiente para un contenedor; documentado en despliegue).
- `scripts/cleanup.mjs` debe programarse (cron) para garantizar la purga de huérfanos antiguos.
- La autorización se evalúa antes que la validación de contenido (p. ej. un revisor no asignado
  recibe `404` aunque el motivo esté vacío), lo que es intencional (no filtra recursos).

## Próximos pasos (mantenimiento v1)

1. Programar `pnpm backup` y `pnpm maintenance:cleanup` por cron y ejecutar pruebas de restauración
   periódicas.
2. Publicar imagen versionada en GHCR (`git tag`) y desplegar detrás de HTTPS siguiendo
   `docs/deployment.md`.
3. Mantener dependencias dentro de rango; las versiones mayores (TypeScript 7, Vitest 5) se
   adoptarán de forma deliberada, no por `pnpm update`.
