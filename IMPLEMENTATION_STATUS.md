# Estado de implementación de Lumen

> Documento de seguimiento para que cualquier agente continúe el desarrollo sin perder contexto.
> Última actualización: **Etapa 2 completada**.

## Resumen

| Etapa                                             | Estado        |
| ------------------------------------------------- | ------------- |
| 0 — Proyecto y entorno reproducible               | ✅ Completada |
| 1 — Identidad, sesiones, roles y asignaciones     | ✅ Completada |
| 2 — Catálogos, servicios y trabajos               | ✅ Completada |
| 3 — Captura y almacenamiento fotográfico          | ⏳ Pendiente  |
| 4 — Envíos, revisiones e historial inmutable      | ⏳ Pendiente  |
| 5 — Cambios estructurales y destrucción explícita | ⏳ Pendiente  |
| 6 — Bandeja interna y Web Push                    | ⏳ Pendiente  |
| 7 — Búsqueda y exportaciones                      | ⏳ Pendiente  |
| 8 — Calidad, operaciones y publicación            | ⏳ Pendiente  |

## Stack real en uso

- **SvelteKit 3** + **Svelte 5** (runes forzadas) + **TypeScript 6** estricto, `@sveltejs/adapter-node`.
- **Tailwind CSS 4** + **shadcn-svelte 1.7** (estilo `nova`, base `neutral`).
- **PostgreSQL 17** (contenedor) + **Drizzle ORM 0.45** / **Drizzle Kit 0.31** (cliente `postgres.js`).
- **Zod 4** (validación, Standard Schema) y **`@node-rs/argon2` 2.2** (Argon2id).
- **pnpm 9.15.4**, **Vitest 4**, **ESLint 10** + **Prettier 3**.

## Convenciones del proyecto (SvelteKit 3)

- Imports internos con el alias **`#lib`** (SvelteKit 3 **eliminó `$lib`**).
- El **origen público** se fija en **build** vía `paths.origin` (desde `ORIGIN`); en Compose se
  pasa como build-arg. Sin definirlo, adapter-node deriva el origen del proxy.
- Rutas con `resolve()` de `$app/paths` (routes tipadas); los componentes shadcn quedan exentos de
  `svelte/no-navigation-without-resolve`.

## Etapa 2 — Catálogos, servicios y trabajos

### Modelo de datos (`drizzle/0002_structure.sql`)

| Tabla                    | Notas                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `catalogs`               | `purpose` (`general`/`buildings`), orden, descripción                                                                                   |
| `catalog_items`          | **único case-insensitive dentro del catálogo** (`catalog_id, lower(name)`)                                                              |
| `catalog_item_relations` | único `(from,to,type)`; `CHECK from <> to`; solo catálogos distintos                                                                    |
| `services` (ampliar)     | `building_catalog_item_id` (`SET NULL`) + `building_name_snapshot`                                                                      |
| `works`                  | `mode` (`direct`/`divided`), `catalog_item_id`/`custom_name` con **XOR**                                                                |
| `elements`               | `work_id`, `catalog_item_id`/`custom_name` con **XOR**                                                                                  |
| `evidence_targets`       | XOR `work_id`/`element_id`, `UNIQUE(work_id)`/`UNIQUE(element_id)`, `version`; `latest_submission_id` **sin FK** (se enlaza en Etapa 4) |

### Backend (`#lib/server/domain`)

- `catalogs.ts`: CRUD de catálogos/ítems/relaciones y **borrado preservador** del ítem (copia el
  nombre a `custom_name`, snapshot de edificio, borra relaciones; nunca toca evidencia).
- `works.ts`: `createWork`/`createElement` **creando el objetivo correcto** (directo → target del
  padre; dividido → sin target de padre; elemento → target propio); `updateWork`/`updateElement`
  (renombrar una instancia **desvincula**); `listWorksDetailed`/`listElementsDetailed`; resolución
  de nombre `COALESCE(catalog_item.name, custom_name)`.
- `works.ts` (progreso): `getServiceProgress` según docs/03 §10 — nunca se persiste; servicio
  completado si tiene ≥1 trabajo y todos aprobados; dividido sin elementos nunca aprobado.
- `works.ts` (generación): `planGeneration` (sin escritura, con conteos y avisos de duplicados) y
  `applyGeneration` transaccional; si hay **relaciones** entre ítems, acotan los elementos por
  trabajo, si no se aplica la selección a cada trabajo. Con elementos → `divided`; sin ellos → `direct`.
- `services.ts`: `updateService` (nombre/descripción/edificio con snapshot) y `buildingName`
  resuelto dinámicamente.

### Rutas / UI

- `/admin/catalogs` y `/admin/catalogs/[catalogId]`: ítems, renombrar, **borrar con diálogo de
  impacto** (recuento de trabajos/elementos/servicios afectados) y relaciones entre catálogos.
- `/services/[serviceId]`: edificio, progreso, trabajos con estado; admin edita datos/edificio y
  crea trabajos y elementos (manual o desde catálogo).
- `/admin/services/[serviceId]/generate`: selección de catálogos → **preview editable**
  (incluir/excluir + renombrar por fila + avisos) → aplicar.
- `/works/[workId]`: trabajo directo (placeholder de captura) o lista de elementos con estado; admin
  renombra trabajo y elementos.

### Pruebas

- Integración (PostgreSQL real): un directo crea target y cero elementos; dividido con 2 elementos
  crea 2 targets y ninguno en el padre; servicio vacío/dividido vacío nunca completados; CAT-01/02/03
  (renombrar maestro, desvincular instancia, borrar ítem preservando nombres de trabajo/elemento/
  edificio); relaciones solo entre catálogos distintos; **generación 34×4** correcta; aprobar un
  dividido y añadir elemento lo vuelve incompleto sin revertir aprobaciones (WORK-01/02); editar
  edificio/nombre no altera trabajos.

## Cómo ejecutar

```bash
cp .env.example .env
docker compose up -d --build       # app + db + migraciones
curl http://localhost:3000/health
```

Desarrollo: `docker compose up -d db` + `pnpm install` + `pnpm db:migrate` + `pnpm dev`.

Scripts: `dev`, `build`, `start`, `check`, `lint`, `format`, `test`, `test:integration`,
`db:generate`, `db:migrate`, `db:studio`.

> `pnpm test:integration` usa `TEST_DATABASE_URL` (por defecto
> `postgres://lumen:cambia-esta-clave@127.0.0.1:5432/lumen_test`); se omite con aviso si no hay
> PostgreSQL. El puerto de la app es configurable con `APP_PORT` (por defecto 3000).

## Pruebas realizadas y resultados

| Prueba                   | Resultado                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`             | ✅ 0 errores, 0 avisos                                                                                               |
| `pnpm lint`              | ✅ Limpio                                                                                                            |
| `pnpm test` (unit)       | ✅ 2/2                                                                                                               |
| `pnpm test:integration`  | ✅ 25/25                                                                                                             |
| `pnpm build`             | ✅                                                                                                                   |
| E2E (servidor compilado) | ✅ setup, catálogo+ítem, servicio, trabajos directo/dividido, elemento                                               |
| E2E páginas nuevas       | ✅ `/admin/catalogs`, `/admin/catalogs/[id]`, `/services/[id]`, `/works/[id]`, `/admin/services/[id]/generate` → 200 |
| E2E generación           | ✅ preview y apply por HTTP (campos indexados)                                                                       |

## Decisiones tomadas

- **Duplicados de ítems**: bloqueo case-insensitive dentro del mismo catálogo.
- **Generación masiva**: preview editable (incluir/excluir + renombrar) y aplicación transaccional.
- **Borrado destructivo** de servicio/trabajo/elemento: **diferido a Etapa 5**; aquí solo el borrado
  preservador de ítems de catálogo.

## Problemas conocidos / consideraciones

- Sin limitación de tasa en login/uploads (Etapa 8).
- Sin captura de fotos ni requisitos (Etapa 3); los objetivos quedan en `pending`.
- Sin PWA ni notificaciones todavía.
- El borrado destructivo administrativo (servicio/trabajo/elemento) y la conversión `direct ↔ divided`
  llegan en la Etapa 5.

## Próximos pasos (Etapa 3)

1. `photo_requirements` por objetivo (obligatorios por defecto) y grupo virtual Adicionales.
2. `photos` con staging seguro, validación real de formato/tamaño, normalización y miniaturas.
3. Pantalla de captura con secciones plegables, subida múltiple, retiro (soft removal) y reordenación
   solo dentro del grupo; concurrencia optimista (`version`).
4. Bloqueo de mutaciones de requisitos tras el primer envío (se completará en la Etapa 4).
5. Pruebas PHOTO-01..04 y limpieza de huérfanos.
