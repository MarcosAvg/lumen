# Estado de implementación de Lumen

> Seguimiento para que cualquier agente continúe el desarrollo sin perder contexto.
> **v1 completa** (etapas 0–8 y desarrollos posteriores). La especificación vive en
> [`docs/`](docs/README.md); el detalle histórico, en el `git log`.

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

- **SvelteKit 3** + **Svelte 5** (runes) + **TypeScript 6** estricto, `@sveltejs/adapter-node`.
- **Tailwind CSS 4** + **shadcn-svelte** (estilo `nova`, base `neutral`).
- **PostgreSQL 17** + **Drizzle ORM/Kit** (cliente `postgres.js`); migraciones versionadas.
- **Zod 4**, **`@node-rs/argon2`** (Argon2id), **`sharp`** (imágenes), **`web-push`** (VAPID),
  **`exceljs`** (XLSX), **`pdf-lib`** (PDF) y **`archiver`** (ZIP en streaming).
- **pnpm 9.15.4**, **Vitest 4**, **ESLint 10** + **Prettier 3**, **Playwright** (E2E).

## Convenciones (SvelteKit 3)

- Imports internos con el alias **`#lib`** (SvelteKit 3 retiró `$lib`).
- El **origen público se deriva de la petición** (runtime): no se hornea `ORIGIN`. Cloudflare Tunnel
  entrega `X-Forwarded-Proto`/`CF-Connecting-IP` (`PROTOCOL_HEADER`/`ADDRESS_HEADER`).
- Rutas con `resolve()`; los componentes shadcn quedan exentos de la regla de navegación.
- **CSRF** de SvelteKit activo: las mutaciones exigen `Origin` acorde (el proxy lo preserva).

## Qué está implementado (por área)

- **Identidad y ámbito**: sesiones en cookie `HttpOnly`/`Secure`/`SameSite`, Argon2id, rate limiting
  (login/setup/subidas); jerarquía **contrato ▸ servicio ▸ trabajo/elemento**; autorización
  centralizada (`guards`) revalidada en lectura, descarga, búsqueda y ZIP.
- **Catálogos**: propósitos `general`/`buildings`/`requirements`, selección en dos pasos, relaciones
  por ítem y por lote, y vínculos con renombrado que desvincula y borrado que preserva el nombre.
- **Servicios, trabajos y elementos**: directo/dividido, conversión con reasignación obligatoria,
  borrado destructivo con resumen de impacto y confirmación.
- **Evidencia**: subida múltiple (cámara y galería), normalización y miniaturas con `sharp`,
  secciones plegables, orden y retirada; requisitos congelados tras el primer envío; «Fotografías»
  (sin requisitos) vs «Adicionales».
- **Envíos y revisiones**: snapshot inmutable con grupos/orden/autores, historial, decisión atómica
  con confirmación y motivo de rechazo obligatorio.
- **Notificaciones**: bandeja interna persistente (idempotente por destinatario+evento) y Web Push
  VAPID _best-effort_ tras el commit, con icono/badge, notificación de prueba y purga de suscripciones
  revocadas antiguas.
- **Búsqueda y exportaciones**: búsqueda global acotada por ámbito; ZIP por contrato/servicio/trabajo/
  entrega, **PDF de evidencia por trabajo** (márgenes y fondo por contrato) y **registro XLSX**
  (simple/extendida) con hipervínculos relativos.
- **UX/PWA**: tablas unificadas (`DataTable`) y tarjetas en móvil, sidebar y barra inferior por rol,
  modales, estados de error/carga propios, CSP, service worker **sin caché** (online-only) y
  refresco automático de contadores (30 s + foco, sin WebSockets).
- **Operación**: `compose.yaml` único (imagen GHCR multi-arquitectura o `--build`), `install.sh`,
  `deploy/backup.sh`/`restore.sh` (solo Docker), limpieza por cron, CI
  (check/lint/unit/integración/build/E2E) y publicación de la imagen en GHCR por tag.

## Pruebas y verificación

| Prueba                                    | Resultado  |
| ----------------------------------------- | ---------- |
| `pnpm check`                              | ✅ 0/0     |
| `pnpm lint`                               | ✅         |
| `pnpm test` (unit)                        | ✅ 33/33   |
| `pnpm test:integration` (PostgreSQL real) | ✅ 101/101 |
| `pnpm test:e2e` (escritorio + móvil)      | ✅ 60/60   |
| `pnpm build`                              | ✅         |
| Drill de restauración (BD + fotos)        | ✅         |

## Decisiones clave

- **Borrado destructivo**: orden explícito dentro de transacción; limpieza de archivos _best-effort_
  tras el commit, con `maintenance:cleanup` como red de seguridad.
- **Conversión de modo**: solo sin ninguna entrega; exige confirmar/mapear requisitos y fotos.
- **Exportaciones** en streaming (`archiver`); XLSX con valores deterministas (sin fórmulas); PDF con
  `pdf-lib`.
- **Notificaciones** dentro de la transacción; push después del commit (nunca revierte la operación).
- **Rate limiting** en memoria por instancia; **CSP** de SvelteKit en modo `auto`; **origen en runtime**.

## Problemas conocidos y próximos pasos

- El rate limiting es por instancia (suficiente para un contenedor).
- Programar `./deploy/backup.sh` y `pnpm maintenance:cleanup` por cron y probar restauraciones.
- Publicar la imagen por tag (`git tag`) y desplegar con Cloudflare Tunnel
  ([`docs/deployment.md`](docs/deployment.md)).
