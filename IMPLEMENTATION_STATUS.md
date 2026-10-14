# Estado de implementación de Lumen

> Documento de seguimiento para que cualquier agente continúe el desarrollo sin perder contexto.
> Última actualización: **Etapa 0 completada**.

## Resumen

| Etapa                                             | Estado        |
| ------------------------------------------------- | ------------- |
| 0 — Proyecto y entorno reproducible               | ✅ Completada |
| 1 — Identidad, sesiones, roles y asignaciones     | ⏳ Pendiente  |
| 2 — Catálogos, servicios y trabajos               | ⏳ Pendiente  |
| 3 — Captura y almacenamiento fotográfico          | ⏳ Pendiente  |
| 4 — Envíos, revisiones e historial inmutable      | ⏳ Pendiente  |
| 5 — Cambios estructurales y destrucción explícita | ⏳ Pendiente  |
| 6 — Bandeja interna y Web Push                    | ⏳ Pendiente  |
| 7 — Búsqueda y exportaciones                      | ⏳ Pendiente  |
| 8 — Calidad, operaciones y publicación            | ⏳ Pendiente  |

El repositorio dejó de ser documentación y ahora es una **aplicación SvelteKit ejecutable** con
PostgreSQL, migraciones versionadas y despliegue con Docker Compose.

## Stack real en uso

- **SvelteKit 3** + **Svelte 5** (runes forzadas) + **TypeScript 6** estricto, `@sveltejs/adapter-node`.
- **Tailwind CSS 4** (`@tailwindcss/vite`) + **shadcn-svelte 1.7** (estilo `nova`, color base `neutral`).
- **PostgreSQL 17** (contenedor) + **Drizzle ORM 0.45** / **Drizzle Kit 0.31** (cliente `postgres.js`).
- **Zod 4** para validación de entorno (Standard Schema).
- **pnpm 9.15.4** (fijado en `packageManager`), **Vitest 4**, **ESLint 10** + **Prettier 3**.

## Qué se implementó (Etapa 0)

1. **Proyecto y tooling**: scaffold oficial `sv` (Svelte 5 + SvelteKit + TS), Prettier, ESLint,
   Vitest, Tailwind y adapter-node. `strict: true` en TypeScript.
2. **Variables de entorno** (`src/env.ts`): configuración central con `defineEnvVars` y Zod.
   - `DATABASE_URL`, `ORIGIN` requeridas al arrancar (opcionales durante el build vía `building`).
   - `PHOTO_STORAGE_PATH`, `MAX_UPLOAD_BYTES`, `IMAGE_MAX_DIMENSION`, `IMAGE_THUMB_DIMENSION`, `TZ`
     con valores por defecto.
   - `VAPID_PUBLIC_KEY` (pública), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` opcionales: la app arranca
     sin Web Push configurado.
3. **Base de datos** (`src/lib/server/db/`):
   - Conexión **perezosa** (`getDatabase()`) para que el `build`/análisis de rutas no requiera BD.
   - `drizzle.config.ts` con `dialect: postgresql`, `strict` y `verbose`.
   - **Migraciones versionadas** en `drizzle/` + runner `scripts/migrate.mjs` (solo `drizzle-orm`,
     usable en desarrollo y en la imagen de producción). Migración inicial `0000_init.sql` habilita
     `pgcrypto` (para `gen_random_bytes` en tokens futuros).
4. **Salud del sistema**:
   - `src/lib/server/db/health.ts` → conectividad, estado de migraciones y `setupRequired`.
   - `GET /health` (JSON, `200`/`503`) para healthchecks y balanceadores.
   - Página raíz (`/`) con el estado del sistema y aviso de configuración inicial pendiente.
5. **Docker**:
   - `Dockerfile` multi-stage (deps → build → runtime) con `node:24-slim`, usuario sin privilegios
     `node`, `pnpm prune --prod`, `VOLUME /data/photos`.
   - `compose.yaml` con `db` (PostgreSQL 17, healthcheck, puerto publicado solo en 127.0.0.1),
     `migrate` (servicio de un solo uso que aplica migraciones) y `app` (healthcheck, `init: true`).
   - Volúmenes persistentes separados `postgres_data` y `lumen_photos`.
   - `.env.example` sin secretos reales y `.dockerignore`.
6. **Documentación de trabajo**: restaurado el `README.md` de Lumen (el scaffold lo había
   sobrescrito) y añadido este archivo.

## Cómo ejecutar

```bash
# 1. Configurar variables
cp .env.example .env   # ajustar POSTGRES_PASSWORD y ORIGIN

# 2. Levantar todo (construye imagen, migra y arranca)
docker compose up -d --build
curl http://localhost:3000/health   # {"status":"ok",...}

# Reiniciar sin perder datos
docker compose down && docker compose up -d
```

Desarrollo en el host (el contenedor `db` publica `127.0.0.1:5432`):

```bash
docker compose up -d db     # solo PostgreSQL
pnpm install
pnpm db:migrate             # carga .env automáticamente
pnpm dev                    # http://localhost:5173
```

Scripts disponibles: `dev`, `build`, `start`, `check`, `lint`, `format`, `test`, `db:generate`,
`db:migrate`, `db:studio`.

> **Nota de entorno:** el puerto `3000` puede estar ocupado por otros servicios del host. El puerto
> publicado de la app es configurable con `APP_PORT` (p. ej. `APP_PORT=3080 docker compose up -d`).

## Pruebas realizadas y resultados

| Prueba                                       | Resultado                                       |
| -------------------------------------------- | ----------------------------------------------- |
| `pnpm check` (svelte-check)                  | ✅ 0 errores, 0 avisos                          |
| `pnpm lint` (Prettier + ESLint)              | ✅ Limpio                                       |
| `pnpm test` (Vitest)                         | ✅ 2 pruebas de `cn`                            |
| `pnpm build` (adapter-node)                  | ✅ Correcto                                     |
| `docker compose up -d --build`               | ✅ `app` y `db` en estado `healthy`             |
| `GET /health` con BD y migraciones           | ✅ `200 {"status":"ok","migrations":"applied"}` |
| Instalación nueva (volúmenes frescos)        | ✅ Migra y arranca healthy                      |
| Esquema `drizzle` eliminado (sin migrar)     | ✅ `503 {"migrations":"pending"}` y aviso       |
| Reaplicar migraciones                        | ✅ Vuelve a `applied` (idempotente)             |
| BD detenida                                  | ✅ `503 {"database":"down"}`                    |
| Persistencia de `/data/photos` tras reinicio | ✅ Archivo escrito por `node` sobrevive         |
| Persistencia de la BD tras reinicio          | ✅ Fila de migración intacta                    |

Las pruebas de concurrencia/permisos exigidas por `docs/06` se añadirán en las etapas que
introducen esas operaciones (no aplican a la infraestructura vacía actual). Las pruebas con
transacciones reales de PostgreSQL se incorporarán junto con el dominio (Etapa 1+).

## Decisiones tomadas (ajustables)

- **UUID** para recursos expuestos (no `bigint`); `gen_random_uuid()` está en el núcleo de PG 13+.
- **Sesiones** con token opaco hasheado (se implementará en Etapa 1).
- **Migraciones** con runner propio (`scripts/migrate.mjs`), sin `drizzle-kit` en producción y sin
  `db:push` destructivo.
- **Puerto** de app configurable (`APP_PORT`).
- Eliminado el script `db:push` del scaffold para no favorecer sincronizaciones destructivas.

## Problemas conocidos / consideraciones

- Sin PWA (manifest/service worker) todavía: se incorporará en etapas posteriores (6/8).
- Sin autenticación: `/health` y `/` son públicas; la configuración inicial (`setupRequired`) se
  usará en la Etapa 1.
- El `AGENTS.md` recibió una cabecera `## Project Configuration` del CLI `sv` (esperado).
- `postgres.js` con `onnotice` silenciado para evitar ruido de avisos en logs.

## Próximos pasos (Etapa 1)

1. Esquema Drizzle de `users`, `sessions`, `service_assignments` + migración.
2. Hash de contraseñas (Argon2id), login/logout con cookies seguras y rotación de sesión.
3. Asistente de primer arranque **atómico** (sin carrera) y protección del último administrador.
4. Helpers de autorización central (`getSessionUser`, `requireAdmin`, `requireServiceAccess`).
5. CRUD de usuarios, activación y cambios de rol con resolución de asignaciones incompatibles.
6. Pruebas AUTH-01…05 con PostgreSQL real.
