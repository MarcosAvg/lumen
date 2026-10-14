# Estado de implementación de Lumen

> Documento de seguimiento para que cualquier agente continúe el desarrollo sin perder contexto.
> Última actualización: **Etapa 4 completada**.

## Resumen

| Etapa                                             | Estado        |
| ------------------------------------------------- | ------------- |
| 0 — Proyecto y entorno reproducible               | ✅ Completada |
| 1 — Identidad, sesiones, roles y asignaciones     | ✅ Completada |
| 2 — Catálogos, servicios y trabajos               | ✅ Completada |
| 3 — Captura y almacenamiento fotográfico          | ✅ Completada |
| 4 — Envíos, revisiones e historial inmutable      | ✅ Completada |
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

## Etapa 4 — Envíos, revisiones e historial inmutable

### Modelo de datos (`drizzle/0004_submissions.sql`)

| Tabla                  | Notas                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evidence_submissions` | `target_id`, `sequence_no`, `submitted_by`, `submitted_at`, `evidence_version`, snapshots de nombres; **`UNIQUE(target_id, sequence_no)`**                                                                           |
| `submission_photos`    | `submission_id`, `photo_id` **`RESTRICT`**, `group_kind` (`requirement`/`additional`), `requirement_name_snapshot`, `group_sort_order`, `photo_sort_order`, autoría congelada; **`UNIQUE(submission_id, photo_id)`** |
| `reviews`              | `submission_id` **`UNIQUE`**, `reviewer_id`, `decision`, `reason`, `reviewed_at`; **`CHECK`** rechazo ⇒ motivo no vacío                                                                                              |
| `evidence_targets`     | FK **`latest_submission_id`** → `evidence_submissions` (`SET NULL`)                                                                                                                                                  |

### Dominio (`#lib/server/domain/submissions.ts`)

- `submitEvidence`: transacción con `SELECT … FOR UPDATE`; valida estado y versión, exige **≥1 foto por requisito obligatorio** (o **≥1 foto total** si no hay obligatorios), calcula `sequence_no`, congela grupos/orden/IDs en `submission_photos` y pasa el objetivo a `in_review`.
- `reviewSubmission`: lock del objetivo; exige `latest_submission_id` y `in_review`; inserta `reviews` (el `UNIQUE` garantiza una sola decisión); rechazo con **motivo obligatorio**; `approved` bloquea el objetivo, `rejected` desbloquea la corrección.
- `getHistory` / `getSubmissionDetail`: historial **inmutable** de solo lectura, descendente.
- `getLatestRejection`: motivo del último rechazo para destacarlo en la evidencia actual.
- `listPendingReviews`: cola de revisión por ámbito (admin: todas; supervisor: servicios asignados).
- El **bloqueo de requisitos** por historia de envíos pasa a ser real (REQ‑04).

### Autorización

- `requireReview(submissionId)`: administrador o **supervisor asignado** (técnico → `403`).
- El acceso al historial/detalle se valida por el ámbito del servicio (opaco `404`).

### API

`POST /api/targets/[id]/submit` (body `{ version }`) y `POST /api/submissions/[id]/review` (body `{ decision, reason }`).

### UI

- Pestañas **«Evidencia actual | Historial»** en la pantalla de evidencia; vista inicial = Actual.
- **Enviar evidencia** con diálogo de confirmación (total de fotos y aviso de bloqueo) y manejo de `409`.
- Motivo del **rechazo destacado** en la pestaña Actual; corrección y reenvío.
- **Historial** descendente con #, autor, fecha y estado; detalle de entrega con galería congelada, grupos/orden originales, revisor y motivo.
- **Cola de revisión** `(app)/reviews` (supervisor/admin) y detalle con **Aprobar / Rechazar** (motivo obligatorio); el ZIP por entrega se difiere a la Etapa 7.

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

| Prueba                                      | Resultado                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm check`                                | ✅ 0 errores, 0 avisos                                                                         |
| `pnpm lint`                                 | ✅ Limpio                                                                                      |
| `pnpm test` (unit: `cn` + pipeline `sharp`) | ✅ 6/6                                                                                         |
| `pnpm test:integration` (PostgreSQL real)   | ✅ 40/40                                                                                       |
| `pnpm build`                                | ✅                                                                                             |
| E2E envío/revisión (servidor compilado)     | ✅ entrega #1, rechazo con motivo, segunda decisión `409`, corrección y entrega #2, aprobación |
| E2E autorización de revisión                | ✅ supervisor no asignado `404`; asignado puede revisar; rechazo sin motivo bloqueado          |
| Páginas nuevas                              | ✅ detalle de entrega, cola de revisión y evidencia → `200`                                    |

## Decisiones tomadas

- **ZIP por entrega**: diferido a la Etapa 7 (en la Etapa 4 solo descarga de foto individual).
- **Historial**: pestañas dentro de la pantalla de evidencia.
- Procesado de imágenes síncrono; limpieza por script; sin dependencias externas obligatorias.

## Problemas conocidos / consideraciones

- Sin limitación de tasa en login/subidas (Etapa 8).
- ZIP de entrega/servicio y CSV administrativo (Etapa 7); notificaciones (Etapa 6); borrado
  destructivo y conversión `direct ↔ divided` (Etapa 5).
- La autorización se evalúa antes que la validación de contenido (p. ej. un revisor no asignado
  recibe `404` aunque el motivo esté vacío), lo que es intencional (no filtra recursos).

## Próximos pasos (Etapa 5)

1. Cambios estructurales en cualquier estado: crear/borrar trabajos y elementos recalculando avances.
2. Asistente `direct ↔ divided` solo sin envíos previos, con reasignación manual completa.
3. Eliminación destructiva de servicio/trabajo/elemento con resumen de impacto y confirmación.
4. Limpieza diferida de binarios sin referencias tras el commit.
5. Pruebas WORK‑02/03/04 y DEL‑01.
