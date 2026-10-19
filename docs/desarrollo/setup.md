# Entorno de desarrollo y pruebas

> **Audiencia:** desarrollo.
> **Estado:** vigente.
> **Fuente canónica de:** entorno local, migraciones, scripts y comandos de
> verificación.

## 1. Requisitos

- Node.js ≥ 22.
- pnpm 9.
- Docker, solo para el PostgreSQL de desarrollo.
- Chrome o Chromium para Playwright.

## 2. Primer arranque

```bash
cp .env.example .env
# Descomentar DATABASE_URL y TEST_DATABASE_URL
mkdir -p data/photos

docker compose -f compose.yaml -f compose.dev.yaml up -d db
pnpm install
pnpm db:migrate
pnpm dev
```

La aplicación queda en `http://localhost:5173`.

`.env.example` incluye `PHOTO_STORAGE_PATH=./data/photos` para desarrollo. Es
importante que esa ruta exista y sea escribible; si falta, las subidas
responden con un error de almacenamiento. En producción Compose fija
`/data/photos`, sobre el volumen `lumen_photos`.

La referencia de variables está en
[`../referencia/variables-entorno.md`](../referencia/variables-entorno.md).

## 3. Base de datos

- `DATABASE_URL`: PostgreSQL local.
- `TEST_DATABASE_URL`: base para integración y E2E. Por defecto
  `postgres://lumen:cambia-esta-clave@127.0.0.1:5432/lumen_test`.
- Las pruebas de integración se omiten con un aviso si no hay PostgreSQL
  disponible.
- Las pruebas E2E preparan su propia base y su propio servidor.

Migraciones:

```bash
pnpm db:generate   # genera una migración desde el schema
pnpm db:migrate    # aplica migraciones
pnpm db:studio     # explorador de Drizzle
```

No se usa `push` destructivo contra producción. Las migraciones se versionan en
`drizzle/`.

## 4. Comprobaciones

```bash
pnpm check             # svelte-check
pnpm lint              # Prettier + ESLint
pnpm test              # unitarias
pnpm test:integration  # PostgreSQL real, en paralelo por worker
pnpm test:e2e          # E2E rápido: escritorio + móvil smoke
pnpm test:e2e:all      # E2E completo antes de publicar
pnpm build             # build de producción
```

Para E2E, instalar el navegador una vez:

```bash
pnpm exec playwright install --with-deps chromium
```

`test:integration` crea bases `lumen_test_1`, `lumen_test_2`… para aislar
workers. El usuario de PostgreSQL debe poder crear bases. `test:e2e` ejecuta
todo escritorio y una selección móvil marcada con `@mobile`; `test:e2e:all`
ejecuta también el resto de móvil. `test:e2e:fast` requiere un build E2E previo
(por ejemplo, tras ejecutar `pnpm test:e2e` una vez).

Para cambios puramente visuales de tokens o paleta, el flujo recomendado es
`pnpm verify:visual`: lint, build y prueba de tema. No hace falta ejecutar
unitarias, integración ni el E2E completo. La suite completa queda para CI o
antes de publicar.

## 5. Scripts

| Script | Descripción |
|---|---|
| `dev` / `build` / `start` | Desarrollo, build de producción y arranque |
| `check` / `check:watch` | Comprobación de tipos |
| `lint` / `format` | Prettier + ESLint y formateo |
| `test` / `test:watch` | Unitarias con Vitest |
| `test:integration` | PostgreSQL real; una base por worker |
| `test:e2e` / `test:e2e:all` | Playwright rápido y completo |
| `test:e2e:desktop` / `test:e2e:mobile` | Ejecutar solo una plataforma |
| `test:e2e:fast` | Reutiliza el último build local de E2E |
| `test:theme` / `test:smoke` | Tema y smoke rápido de UI |
| `verify:visual` | Lint + build + prueba de tema |
| `db:generate` / `db:migrate` / `db:studio` | Migraciones y explorador |
| `maintenance:cleanup` | Temporales, huérfanos y push revocado |
| `vapid:generate` | Par de claves VAPID |
| `icons:generate` | Iconos PWA desde los SVG de `static/icons` |

El respaldo y la restauración son scripts de `deploy/`, no de `pnpm`:
`./deploy/backup.sh` y `./deploy/restore.sh`.

## 6. Convenciones del repositorio

- Imports internos con `#lib` y `#lib/*`.
- Rutas con `resolve()`; los componentes de shadcn-svelte quedan exentos.
- Cambios de evidencia con transacciones y versión optimista.
- Validación de entrada en servidor con esquemas.
- No mezclar paths de usuario con rutas internas de almacenamiento.
- Actualizar la documentación canónica en el mismo cambio.

La organización de la documentación está en
[`../README.md`](../README.md). Las reglas para agentes, en
[`../../AGENTS.md`](../../AGENTS.md).

## 7. Depuración rápida

```bash
docker compose -f compose.yaml -f compose.dev.yaml logs -f db
pnpm check
pnpm test -- --reporter=verbose
pnpm exec playwright test --project=escritorio
```

Si una prueba E2E falla, revisar `test-results/` y el reporte HTML de Playwright.
No usar datos de producción en pruebas.
