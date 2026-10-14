# Estado de implementación de Lumen

> Documento de seguimiento para que cualquier agente continúe el desarrollo sin perder contexto.
> Última actualización: **Etapa 5 completada**.

## Resumen

| Etapa                                             | Estado        |
| ------------------------------------------------- | ------------- |
| 0 — Proyecto y entorno reproducible               | ✅ Completada |
| 1 — Identidad, sesiones, roles y asignaciones     | ✅ Completada |
| 2 — Catálogos, servicios y trabajos               | ✅ Completada |
| 3 — Captura y almacenamiento fotográfico          | ✅ Completada |
| 4 — Envíos, revisiones e historial inmutable      | ✅ Completada |
| 5 — Cambios estructurales y destrucción explícita | ✅ Completada |
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

## Cómo ejecutar

Guía completa en el [`README.md`](README.md) (§ «Desarrollo local»). Resumen:

```bash
cp .env.example .env
docker compose up -d --build        # app + db + migraciones
# o desarrollo:
docker compose up -d db && pnpm install && pnpm db:migrate && pnpm dev
```

Scripts: `dev`, `build`, `start`, `check`, `lint`, `format`, `test`, `test:integration`,
`db:generate`, `db:migrate`, `db:studio`, `maintenance:cleanup`.

## Pruebas realizadas y resultados

| Prueba                                      | Resultado                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                | ✅ 0 errores, 0 avisos                                                                                         |
| `pnpm lint`                                 | ✅ Limpio                                                                                                      |
| `pnpm test` (unit: `cn` + pipeline `sharp`) | ✅ 6/6                                                                                                         |
| `pnpm test:integration` (PostgreSQL real)   | ✅ 47/47                                                                                                       |
| `pnpm build`                                | ✅                                                                                                             |
| E2E HTTP (servidor compilado, Etapa 4)      | ✅ entrega, rechazo, segunda decisión `409`, corrección y aprobación                                           |
| E2E HTTP PHOTO‑04                           | ✅ foto retirada de entrega histórica descarga `200`; sin historial, `404`                                     |
| E2E HTTP Etapa 5                            | ✅ conversión `direct→divided` `200`, conversión con entrega `409`, borrado de elemento/trabajo/servicio `200` |

Pruebas de la Etapa 5 (`tests/integration/structural-changes.spec.ts`): WORK‑03 (conversión con
entrega histórica prohibida), WORK‑04 (reasignación completa o sin cambios), dividido→directo,
DEL‑01 (borrado de servicio con historial aislado) y limpieza de binarios huérfanos.

## Decisiones tomadas

- **Borrado destructivo**: orden explícito dentro de transacción; limpieza de archivos best-effort
  tras el commit, con `maintenance:cleanup` como red de seguridad.
- **Conversión de modo**: se exige confirmar/mapear el conjunto completo de requisitos y fotos;
  cualquier entrega previa la bloquea.
- **ZIP por entrega/servicio y CSV administrativo**: diferidos a la Etapa 7.
- **Procesado de imágenes síncrono**; limpieza por script y por borrado; sin dependencias externas.

## Problemas conocidos / consideraciones

- Sin limitación de tasa en login/subidas (Etapa 8).
- Notificaciones y Web Push (Etapa 6); búsqueda/ZIP/CSV (Etapa 7).
- `scripts/cleanup.mjs` debe programarse (cron) para garantizar la purga de huérfanos antiguos.
- La autorización se evalúa antes que la validación de contenido (p. ej. un revisor no asignado
  recibe `404` aunque el motivo esté vacío), lo que es intencional (no filtra recursos).

## Próximos pasos (Etapa 6)

1. Notificaciones SQL idempotentes dentro de la transacción de envío/revisión.
2. Bandeja interna con contador, marcado individual/total y enlaces reautorizados.
3. Suscripciones Web Push (VAPID), service worker e instalación PWA.
4. Destinatarios: supervisores asignados al enviar; técnicos asignados al revisar; admitir fallo
   de push sin revertir la operación.
5. Pruebas NOTIF‑01/NOTIF‑02 y gestión de suscripciones inválidas.
