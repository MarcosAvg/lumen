# Estado de implementación de Lumen

> Documento de seguimiento para que cualquier agente continúe el desarrollo sin perder contexto.
> Última actualización: **Etapa 3 completada**.

## Resumen

| Etapa                                             | Estado        |
| ------------------------------------------------- | ------------- |
| 0 — Proyecto y entorno reproducible               | ✅ Completada |
| 1 — Identidad, sesiones, roles y asignaciones     | ✅ Completada |
| 2 — Catálogos, servicios y trabajos               | ✅ Completada |
| 3 — Captura y almacenamiento fotográfico          | ✅ Completada |
| 4 — Envíos, revisiones e historial inmutable      | ⏳ Pendiente  |
| 5 — Cambios estructurales y destrucción explícita | ⏳ Pendiente  |
| 6 — Bandeja interna y Web Push                    | ⏳ Pendiente  |
| 7 — Búsqueda y exportaciones                      | ⏳ Pendiente  |
| 8 — Calidad, operaciones y publicación            | ⏳ Pendiente  |

## Stack real en uso

- **SvelteKit 3** + **Svelte 5** (runes forzadas) + **TypeScript 6** estricto, `@sveltejs/adapter-node`.
- **Tailwind CSS 4** + **shadcn-svelte 1.7** (estilo `nova`, base `neutral`).
- **PostgreSQL 17** + **Drizzle ORM 0.45** / **Drizzle Kit 0.31** (cliente `postgres.js`).
- **Zod 4**, **`@node-rs/argon2` 2.2** (Argon2id) y **`sharp`** (procesado de imágenes).
- **pnpm 9.15.4**, **Vitest 4**, **ESLint 10** + **Prettier 3**.

## Convenciones del proyecto (SvelteKit 3)

- Imports internos con el alias **`#lib`** (SvelteKit 3 eliminó `$lib`).
- El **origen público** se fija en **build** vía `paths.origin` (build-arg `ORIGIN` en Compose).
- Rutas con `resolve()`; los componentes shadcn quedan exentos de la regla de navegación.

## Etapa 3 — Captura y almacenamiento fotográfico

### Modelo de datos (`drizzle/0003_photos.sql`)

| Tabla                | Notas                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `photo_requirements` | `target_id`, `name`, `is_required` (default `true`), `sort_order`                                                                                                                                                        |
| `photos`             | `target_id`, `requirement_id` (`NULL` = **Adicionales**, `ON DELETE SET NULL`), `sort_order`, `storage_path`, `thumbnail_path`, mime/tamaño/dimensiones/checksum, `processing_status`, `uploaded_by/at`, `removed_by/at` |

Evidencia vigente = `removed_at IS NULL` y `processing_status = 'ready'`.

### Almacenamiento y pipeline (`#lib/server/storage`)

- `storage.ts`: rutas **relativas internas** (`objects/ab/cd/<id>.jpg`, `thumbnails/ab/cd/<id>.webp`), escritura **atómica** (temporal + rename) y borrado tolerante.
- `images.ts`: validación **por contenido** con `sharp` (JPEG/PNG/WebP; HEIC solo si el binario lo soporta), corrección de orientación, **eliminación de metadatos (incl. GPS)**, límite de lado mayor (`IMAGE_MAX_DIMENSION`), salida JPEG (~82) y miniatura WebP (`IMAGE_THUMB_DIMENSION`); `limitInputPixels` anti-bomba y semáforo de procesado.
- `index.ts`: instancia con la raíz de `PHOTO_STORAGE_PATH`.

### Dominio

- `targets.ts`: resolución canónica del objetivo (trabajo directo o elemento) y estado editable.
- `requirements.ts`: CRUD de requisitos con bloqueo por **historia de envíos** (defensivo hasta la Etapa 4, vía `to_regclass`); borrar requisito mueve sus fotos a **Adicionales** preservando orden/autoría y sube la versión.
- `photos.ts`: `appendPhoto` (seguro en concurrencia con `SELECT … FOR UPDATE`, sin exigir versión), `removePhoto` (soft removal con CAS de `version`), `reorderPhotos` (solo dentro del grupo, conjunto exacto de ids) y `getPhotoAccessContext`.

### API (`/api`)

`POST /api/targets/[id]/photos` (multipart, **por archivo**, sin falso éxito), `DELETE /api/targets/[id]/photos/[photoId]` (con `version`), `PUT /api/targets/[id]/photo-order`, `GET /api/photos/[id]/content` y `/thumbnail` (streaming autenticado), y CRUD de requisitos (`/requirements`, `/requirement-order`). Errores coherentes `400/401/403|404/409/413/415/500`.

### Autorización

- `requireCapture(targetId)`: administrador o **técnico asignado** (supervisor asignado → `403`).
- `requirePhotoAccess(photoId)`: ámbito del servicio; fuera de ámbito → `401/404` opaco.

### UI

`evidence-capture.svelte`: una sola pantalla con secciones plegables (requisitos + **Adicionales al final**), subida múltiple con **progreso XHR** y reintento, retiro con confirmación, reordenación con botones, visor con descarga, banner de **conflicto `409`** y panel admin de requisitos. Integrada en `works/[workId]` (directo) y `elements/[elementId]` (dividido).

### Mantenimiento

`scripts/cleanup.mjs` + `scripts/lib/cleanup.mjs` (`pnpm maintenance:cleanup`): borra temporales de staging y binarios sin referencia, con antigüedad mínima; nunca toca archivos referenciados.

### Docker

`BODY_SIZE_LIMIT` (por defecto `512K` en adapter-node) se fija a `30M` en Compose; el volumen `lumen_photos` persiste objetos y miniaturas.

## Cómo ejecutar

```bash
cp .env.example .env
docker compose up -d --build
curl http://localhost:3000/health
```

Desarrollo: `docker compose up -d db` + `pnpm install` + `pnpm db:migrate` + `pnpm dev`.

Scripts: `dev`, `build`, `start`, `check`, `lint`, `format`, `test`, `test:integration`,
`db:generate`, `db:migrate`, `db:studio`, `maintenance:cleanup`.

## Pruebas realizadas y resultados

| Prueba                                      | Resultado                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                | ✅ 0 errores, 0 avisos                                                                                                     |
| `pnpm lint`                                 | ✅ Limpio                                                                                                                  |
| `pnpm test` (unit: `cn` + pipeline `sharp`) | ✅ 6/6                                                                                                                     |
| `pnpm test:integration` (PostgreSQL real)   | ✅ 32/32                                                                                                                   |
| `pnpm build`                                | ✅                                                                                                                         |
| E2E subida real (servidor compilado)        | ✅ requisito, subida, miniatura WebP, JPEG, `409` por versión obsoleta, retiro                                             |
| E2E autorización                            | ✅ anónimo `401`; supervisor no asignado `404`; técnico asignado ve y sube; supervisor asignado ve pero no captura (`403`) |
| Script de limpieza                          | ✅ ejecuta y conserva binarios referenciados                                                                               |

## Decisiones tomadas

- Objetos **JPEG** + miniaturas **WebP**.
- Subida con **XMLHttpRequest** (progreso y reintento).
- **Procesado síncrono** (no quedan filas `processing` colgadas).
- Limpieza por **script/módulo** (`maintenance:cleanup`), sin exponerla en la web.

## Problemas conocidos / consideraciones

- El bloqueo de requisitos por historia de envíos es **defensivo**: se activará de verdad en la
  Etapa 4 cuando exista `evidence_submissions` (la función ya lo detecta y se probará a fondo).
- Sin limitación de tasa en subidas/login (Etapa 8).
- Sin envíos, revisiones ni historial (Etapa 4); sin notificaciones (Etapa 6).
- `to_regclass` se usa para no abortar transacciones al comprobar tablas aún inexistentes.

## Próximos pasos (Etapa 4)

1. `evidence_submissions`, `submission_photos`, `reviews` (+ FK `latest_submission_id`).
2. Envío transaccional con snapshot congelado (grupo/orden/IDs) y bloqueo `in_review`.
3. Cola de revisión y decisión atómica (aprobar/rechazar con motivo obligatorio).
4. Congelación real de requisitos tras el primer envío e historial inmutable.
5. Pruebas REQ-01..04, SUB-01/02 y REV-01..03.
