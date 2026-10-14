# Estado de implementación de Lumen

> Documento de seguimiento para que cualquier agente continúe el desarrollo sin perder contexto.
> Última actualización: **Etapa 1 completada**.

## Resumen

| Etapa                                             | Estado        |
| ------------------------------------------------- | ------------- |
| 0 — Proyecto y entorno reproducible               | ✅ Completada |
| 1 — Identidad, sesiones, roles y asignaciones     | ✅ Completada |
| 2 — Catálogos, servicios y trabajos               | ⏳ Pendiente  |
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

- Los imports internos usan el alias **`#lib`** (SvelteKit 3 **eliminó `$lib`**). tsconfig y
  `components.json` apuntan a `#lib`.
- El **origen público** se fija en **build** vía `paths.origin` (desde `ORIGIN`), porque
  `@sveltejs/adapter-node` 6 ya no lee `ORIGIN` en tiempo de ejecución. En Compose se pasa como
  build-arg; sin definirlo, adapter-node deriva el origen del proxy (`host` + `https`).
- Las rutas usan `resolve()` de `$app/paths` (routes tipadas); los componentes shadcn quedan
  exentos de `svelte/no-navigation-without-resolve`.

## Etapa 1 — Identidad, sesiones, roles y asignaciones

### Modelo de datos (`drizzle/0001_identity.sql`)

| Tabla                 | Notas                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| `users`               | `role` enum, `is_active`, `disabled_at`; índice **único funcional** `lower(username)` |
| `sessions`            | `token_hash` (SHA-256) único, `expires_at`, `revoked_at`, `user_agent`, `ip`          |
| `services`            | Esqueleto (Etapa 2 amplía edificio/catálogos con migración aditiva)                   |
| `service_assignments` | **único parcial** `(service_id, user_id, assignment_role) WHERE revoked_at IS NULL`   |
| `audit_events`        | Registro de acciones críticas (roles, asignaciones, altas, contraseñas)               |

### Backend (`#lib/server`)

- `auth/password.ts`: Argon2id (19 MiB, 2 iteraciones) mediante `@node-rs/argon2`.
- `auth/token.ts`: token de sesión aleatorio (32 bytes) + hash SHA-256 persistido.
- `auth/session.ts`: `insertSession`, `findActiveSession` (join + `is_active` + vigencia), revocación.
- `auth/cookies.ts`: cookie `lumen_session` `HttpOnly`/`SameSite=Lax`/`Secure` según HTTPS.
- `auth/start-session.ts` y `auth/guards.ts` (`requireUser`, `requireAdmin`, `requireServiceAccess`).
- `hooks.server.ts`: resuelve `event.locals.user` en cada petición (nunca confía en la cookie).
- `domain/users.ts`: `createFirstAdmin` y cambios de estado de `users`/roles con **advisory lock**
  (`pg_advisory_xact_lock`) — protege el último admin y serializa el primer arranque.
- `domain/services.ts` / `domain/assignments.ts`: ámbito por servicio y asignaciones.
- `domain/audit.ts`: eventos de auditoría dentro de la transacción.

### Rutas

- `/setup` (asistente atómico de primera cuenta), `/login`, `/logout` (POST).
- `(app)/dashboard`, `(app)/admin/users` (crear, activar/desactivar, cambiar rol con confirmación de
  revocaciones, restablecer contraseña), `(app)/admin/services` (crear/listar) y
  `(app)/admin/services/[serviceId]` (asignar/revocar técnicos y supervisores).
- `(app)/services/[serviceId]`: detalle protegido por `requireServiceAccess` (404 opaco fuera de ámbito).
- `/` redirige según estado (setup → login → dashboard).

### Pruebas

- **Unitarias** (`pnpm test`): `cn` en `src/lib/**`.
- **Integración** (`pnpm test:integration`) contra PostgreSQL real en `lumen_test` (creada y migrada
  por el propio test), con `truncate` entre casos:
  - AUTH-05: dos primeros arranques simultáneos → exactamente un admin.
  - Login correcto/incorrecto (usuario case-insensitive).
  - AUTH-04: desactivar invalida sesiones activas.
  - Protección del último admin (desactivar y degradar).
  - Cambio de rol con revocación de asignaciones incompatibles (y confirmación obligatoria).
  - Restablecer contraseña revoca sesiones; usuario duplicado rechazado.
  - AUTH-01 y ámbito por servicio: técnico/supervisor no asignado bloqueado; asignado accede;
    administrador global; revocación quita acceso; rol de asignación incompatible rechazado;
    no se asignan usuarios inactivos; asignación duplicada idempotente.

## Cómo ejecutar

```bash
cp .env.example .env          # ajustar POSTGRES_PASSWORD y ORIGIN
docker compose up -d --build  # app + db + migraciones
curl http://localhost:3000/health
```

Desarrollo en el host (el contenedor `db` publica `127.0.0.1:5432`):

```bash
docker compose up -d db
pnpm install
pnpm db:migrate               # carga .env automáticamente
pnpm dev                      # http://localhost:5173
```

Scripts: `dev`, `build`, `start`, `check`, `lint`, `format`, `test`, `test:integration`,
`db:generate`, `db:migrate`, `db:studio`.

> `pnpm test:integration` usa `TEST_DATABASE_URL` (por defecto
> `postgres://lumen:cambia-esta-clave@127.0.0.1:5432/lumen_test`). Requiere PostgreSQL accesible;
> si no lo está, las suites se omiten con un aviso.
>
> El puerto publicado de la app es configurable con `APP_PORT` (por defecto 3000).

## Pruebas realizadas y resultados

| Prueba                             | Resultado                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm check`                       | ✅ 0 errores, 0 avisos                                                        |
| `pnpm lint` (Prettier + ESLint)    | ✅ Limpio                                                                     |
| `pnpm test` (unit)                 | ✅ 2/2                                                                        |
| `pnpm test:integration`            | ✅ 15/15                                                                      |
| `pnpm build`                       | ✅                                                                            |
| `docker compose up -d --build`     | ✅ `app` y `db` healthy                                                       |
| E2E setup (servidor compilado)     | ✅ Crea admin, emite sesión, `/dashboard` 200, segundo setup `409`            |
| E2E login/CSRF/logout (contenedor) | ✅ login 303 + cookie, dashboard 200, login inválido 400, CSRF sin Origin 403 |
| Fuera de ámbito                    | ✅ Cubierto por integración (AUTH-01) y `404` opaco                           |

## Decisiones tomadas

- **UUID** y **sesiones con token opaco hasheado**.
- **`#lib`** como alias (no `$lib`).
- **`paths.origin` en build** para CSRF; en Compose se pasa `ORIGIN` como build-arg.
- Migraciones con runner propio; sin `db:push`.
- `no-navigation-without-resolve` exento solo para `#lib/components/ui/**`.

## Problemas conocidos / consideraciones

- **Sin limitación de tasa** en login/uploads todavía (Etapa 8, endurecimiento). Mensaje de error de
  login es neutro.
- La UI de servicios es un **esqueleto** (nombre/descripción/participantes); el edificio, catálogos y
  la estructura de trabajos llegan en la Etapa 2.
- Sin PWA (manifest/service worker) ni notificaciones (Etapas 6/8).
- `ORIGIN` ya no se valida en runtime: cambiarlo exige reconstruir la imagen.

## Próximos pasos (Etapa 2)

1. `catalogs`, `catalog_items`, `catalog_item_relations`.
2. Ampliar `services` (edificio con `building_catalog_item_id` + snapshot) y `works`/`elements`.
3. `evidence_targets` con XOR `work_id`/`element_id` y únicos.
4. Nombres vinculados dinámicos y desvinculación al renombrar instancias; borrado preservador de ítems.
5. Generación masiva desde catálogos con **preview** y excepciones; progreso derivado.
6. Pruebas CAT-1..3 y WORK-1/2 con PostgreSQL real.
