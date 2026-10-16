# Lumen

**Lumen** es una PWA autohospedada para equipos pequeños de servicios en campo:
los técnicos capturan **evidencia fotográfica compartida**, los supervisores
asignados la **aprueban o rechazan por entrega** y los administradores organizan
servicios, trabajos, catálogos y usuarios.

> **Estado:** implementación v1 en curso (etapas 0–8 completadas). El repositorio
> es una **aplicación ejecutable** con CI; el avance está en
> [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) y la operación en
> [`docs/deployment.md`](docs/deployment.md).

## Quickstart (autoalojamiento)

Requisitos: **Docker + Docker Compose v2** (no hace falta Node en el servidor) y un
**proxy inverso** propio (Nginx, Traefik, Caddy…).

```bash
git clone https://github.com/MarcosAvg/lumen.git
cd lumen
./install.sh                 # genera .env con secretos y arranca la app
```

La app queda en **http://127.0.0.1:8090**, lista para tu proxy: configura que
reenvíe ahí enviando `Host`, `X-Forwarded-Proto` y `X-Forwarded-For` (la app los
exige). Ejemplos y avisos en [`DEPLOY.md`](DEPLOY.md) §3. Después abre
`https://tu-dominio` y completa **Configurar Lumen**.

**¿Sin proxy?** Añade Caddy con HTTPS automático:

```bash
./install.sh --domain lumen.midominio.com   # o ./install.sh --caddy (HTTP local)
```

¿Prefieres no clonar el repo? Copia el `compose.yaml` autocontenido de
[`DEPLOY.md`](DEPLOY.md) en una carpeta y ejecuta `docker compose up -d`.

La imagen publicada (`ghcr.io/marcosavg/lumen`, **multi-arquitectura amd64/arm64**)
se usa por defecto; `docker compose up --build` compila en local.

## Qué incluye

- **Servicios → trabajos**: un trabajo puede ser **directo** o **dividido en elementos**.
- **Requisitos fotográficos** obligatorios u opcionales (p. ej. Antes, Durante,
  Después) con fotos adicionales siempre permitidas.
- **Evidencia compartida** entre los técnicos asignados de un trabajo/elemento.
- **Entregas inmutables** a revisión; el historial y las fotos anteriores se conservan.
- **Revisión atómica**: aprobar o rechazar con motivo obligatorio y confirmación.
- **Avisos** por bandeja interna y **Web Push** opcional (VAPID).
- **Búsqueda global** según permisos y **exportaciones** (fotos, ZIP por entrega y
  por servicio, PDF de evidencia y registro XLSX).

## Roles

| Rol               | Alcance                  | Operaciones principales                                                                                             |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Administrador** | Todos los servicios      | Gestionar usuarios, roles, asignaciones, catálogos, servicios, trabajos y requisitos; capturar y revisar; exportar  |
| **Supervisor**    | Solo servicios asignados | Consultar evidencias, revisar entregas pendientes, consultar historial y descargar/exportar evidencias              |
| **Técnico**       | Solo servicios asignados | Capturar, retirar y ordenar fotos compartidas; enviar entregas; consultar historial y descargar/exportar evidencias |

La autorización es **del servidor**: una URL directa, descarga o búsqueda no
concede acceso fuera de los servicios autorizados.

## Cómo se usa

1. En el **primer arranque** se configura una cuenta de administrador local.
2. El administrador crea usuarios, catálogos y servicios; asigna técnicos y supervisores.
3. Define trabajos directos o divididos, elementos y requisitos fotográficos.
4. Los técnicos asignados capturan fotos y **envían una entrega**.
5. Un supervisor asignado o un administrador **confirma** la aprobación o el
   rechazo (con motivo).
6. Si se rechaza, los técnicos corrigen y envían una nueva versión; el historial queda consultable.
7. El servicio se marca **completado** cuando todos sus trabajos están aprobados.

## Configuración

Todo se define por entorno o en un `.env` (opcional). Valores habituales:

| Variable                                                   | Por defecto                      | Uso                                                        |
| ---------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                        | `lumen`                          | Contraseña de PostgreSQL (cámbiala en producción)          |
| `APP_PORT`                                                 | `8090`                           | Puerto local donde se publica la app (tu proxy apunta ahí) |
| `LUMEN_IMAGE` / `LUMEN_TAG`                                | `ghcr.io/marcosavg/lumen:latest` | Imagen y etiqueta a usar                                   |
| `DOMAIN` _(Caddy)_                                         | `http://localhost`               | Dirección de sitio de Caddy; un dominio activa HTTPS       |
| `HTTP_PORT` / `HTTPS_PORT` _(Caddy)_                       | `80` / `443`                     | Puertos públicos del Caddy opcional                        |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | —                                | Web Push (opcional)                                        |
| `MAX_UPLOAD_BYTES`                                         | `26214400` (25 MiB)              | Tamaño máximo por archivo                                  |
| `TZ`                                                       | `UTC`                            | Zona horaria de presentación (persistencia en UTC)         |

Lista completa y notas: [`docs/deployment.md`](docs/deployment.md#5-variables-de-entorno)
y [`.env.example`](.env.example).

### Notificaciones push (opcional)

La **bandeja interna funciona siempre**. Web Push requiere claves **VAPID** y HTTPS
(en iOS, además, añadir la PWA a la pantalla de inicio):

```bash
./install.sh --vapid           # genera las claves y las añade a .env
# o bien: pnpm vapid:generate  (copia el resultado en .env)
```

En **Ajustes** se activa el push por dispositivo y se envía una **notificación de
prueba** para comprobar la configuración.

## Desarrollo

Requisitos: **Node.js ≥ 22**, **pnpm 9** y Docker (solo el PostgreSQL del compose).

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d db   # PostgreSQL en 127.0.0.1:5432
pnpm install
pnpm db:migrate                # carga .env automáticamente
pnpm dev                       # http://localhost:5173
```

> En desarrollo, `PHOTO_STORAGE_PATH` apunta a `./data/photos` (ignorado por git).
> En el contenedor de producción se usa el volumen `lumen_photos` en `/data/photos`.

Comprobaciones y pruebas:

```bash
pnpm check             # svelte-check (tipos)
pnpm lint              # Prettier + ESLint
pnpm test              # pruebas unitarias (Vitest)
pnpm test:integration  # integración con PostgreSQL real
pnpm test:e2e          # E2E con Playwright (escritorio y móvil)
pnpm build             # build de producción (adapter-node)
```

Las pruebas de integración usan `TEST_DATABASE_URL`
(`postgres://lumen:cambia-esta-clave@127.0.0.1:5432/lumen_test`, se crea y migra sola)
y se omiten con un aviso si no hay PostgreSQL. Las E2E preparan su propia base y
requieren `pnpm exec playwright install --with-deps chromium` una vez.

### Scripts

| Script                                     | Descripción                                                     |
| ------------------------------------------ | --------------------------------------------------------------- |
| `dev` / `build` / `start`                  | servidor de desarrollo, build de producción, arranque del build |
| `check` / `lint` / `format`                | tipos, lint y formateo                                          |
| `test` / `test:integration` / `test:e2e`   | pruebas unitarias, con base de datos real y E2E (Playwright)    |
| `db:generate` / `db:migrate` / `db:studio` | migraciones Drizzle (generar, aplicar, explorar)                |
| `maintenance:cleanup`                      | limpieza de temporales/huérfanos y suscripciones push revocadas |
| `backup` / `restore`                       | respaldo y restauración de BD + fotos                           |
| `vapid:generate`                           | genera un par de claves VAPID para Web Push                     |

## Despliegue y operación

Guías: [`DEPLOY.md`](DEPLOY.md) (autocontenida, con el `compose.yaml` completo) y
[`docs/deployment.md`](docs/deployment.md) (HTTPS, actualización, seguridad y
resolución de problemas).

Con Docker (no requiere Node en el host):

```bash
./deploy/backup.sh                  # BD + fotos en ./backups/<fecha>
./deploy/restore.sh backups/<fecha> # restauración (destructiva; pide confirmación)
docker compose exec app node scripts/cleanup.mjs   # temporales, huérfanos y push revocado
docker compose pull && docker compose up -d        # actualizar a la última imagen
```

Programa el respaldo y la limpieza con cron (ver `docs/deployment.md`).

## Solución de problemas

| Síntoma                                      | Causa probable / solución                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `docker compose up` falla al traer la imagen | No hay imagen publicada: usa `docker compose pull` o `up --build`.                   |
| La app no responde                           | `docker compose logs app`; ¿`db` sana y `migrate` terminó?                           |
| No sé cómo publicar la app                   | Proxy a `127.0.0.1:${APP_PORT}`, o Caddy (`--profile caddy` / `install.sh --caddy`). |
| `403` en formularios                         | Falta `X-Forwarded-Proto` en el proxy (sin ella la app asume `https`).               |
| `500` «Address header…»                      | Falta `X-Forwarded-For` en el proxy.                                                 |
| `413` al subir fotos                         | Sube `client_max_body_size` del proxy (≥ `BODY_SIZE_LIMIT`, 30M).                    |
| HTTPS no emite certificado (Caddy)           | `DOMAIN` debe resolver al servidor y 80/443 estar libres.                            |
| Puertos 80/443 ocupados (Caddy)              | Ya tienes un proxy: no uses Caddy; o cambia `HTTP_PORT`/`HTTPS_PORT`.                |
| Push no llega                                | Requiere HTTPS y claves VAPID; la bandeja interna funciona igual.                    |

## Documentación

| Archivo                                                  | Propósito                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                 | Reglas de trabajo para el agente de programación, prioridades y criterios generales |
| [`docs/README.md`](docs/README.md)                       | Índice de la documentación (especificación, operación y estado)                     |
| [`DEPLOY.md`](DEPLOY.md)                                 | Guía autocontenida de despliegue con `docker compose` (sin clonar el repo)          |
| [`docs/01-producto.md`](docs/01-producto.md)             | Modelo funcional, reglas, permisos e invariantes                                    |
| [`docs/02-flujos.md`](docs/02-flujos.md)                 | Flujos paso a paso y errores esperados                                              |
| [`docs/03-modelo-datos.md`](docs/03-modelo-datos.md)     | Esquema lógico relacional, integridad, historial y concurrencia                     |
| [`docs/04-arquitectura.md`](docs/04-arquitectura.md)     | Componentes, seguridad, archivos, PWA, Docker, respaldo y API                       |
| [`docs/05-interfaz-pwa.md`](docs/05-interfaz-pwa.md)     | Pantallas, navegación, interacciones y accesibilidad                                |
| [`docs/06-implementacion.md`](docs/06-implementacion.md) | Plan por etapas, pruebas, entrega y criterios de aceptación                         |

**Orden recomendado de lectura para el agente:** `AGENTS.md` → producto → flujos →
modelo de datos → arquitectura → interfaz → implementación.

## Principios de producto

1. **La evidencia pertenece al trabajo/elemento, no a un técnico.** Se registra autoría de cada acción, pero la edición es colectiva entre técnicos asignados.
2. **El historial de entregas y revisiones es inmutable** mientras el objeto exista. La eliminación destructiva administrativa de un elemento/trabajo/servicio es una excepción explícita y advertida.
3. **La vista principal siempre muestra evidencia vigente**, y el historial está apartado.
4. **Los catálogos son reutilizables y opcionales**; la aplicación no debe asumir una industria, edificio, marca o tipo de equipo concreto.
5. **No añadir infraestructura sin necesidad:** para equipos pequeños, SvelteKit + PostgreSQL + volúmenes persistentes son suficientes.
6. **Primero consistencia y permisos, luego apariencia:** ninguna operación crítica debe depender solo de validaciones en el navegador.

## Stack

Svelte 5 + SvelteKit + TypeScript (monolito) · Tailwind CSS + shadcn-svelte (PWA en
línea) · PostgreSQL + Drizzle ORM/Kit · Docker Compose (proxy inverso propio o Caddy opcional) · Web Push VAPID sin
Redis ni Firebase obligatorios.

**Fuera del alcance v1:** sincronización sin conexión, mensajería entre usuarios,
comentarios por fotografía, revisión de fotos individuales, gestión integral de
contratos/facturación, inventario obligatorio, estructura rígida de activos, edición
simultánea en tiempo real mediante WebSockets, informes PDF obligatorios.

## Licencia

Este repositorio no declara todavía una licencia; el uso y la redistribución quedan
por definir por su autor.
