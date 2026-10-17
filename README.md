# Lumen

PWA autohospedada para equipos de servicios en campo: los técnicos capturan
**evidencia fotográfica compartida**, los supervisores asignados la **aprueban o
rechazan por entrega** y la administración organiza servicios, trabajos, catálogos
y usuarios.

> **Estado:** v1 completa (etapas 0–8 y desarrollos posteriores). El avance por
> etapas y las decisiones se registran en
> [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md); la operación, en
> [`docs/deployment.md`](docs/deployment.md).

## Índice

- [Características](#características)
- [Roles y permisos](#roles-y-permisos)
- [Puesta en marcha](#puesta-en-marcha)
- [Publicación con proxy inverso](#publicación-con-proxy-inverso)
- [Uso](#uso)
- [Configuración](#configuración)
- [Desarrollo](#desarrollo)
- [Operación](#operación)
- [Solución de problemas](#solución-de-problemas)
- [Stack y alcance](#stack-y-alcance)
- [Principios de diseño](#principios-de-diseño)
- [Documentación](#documentación)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

## Características

- **Servicios y trabajos**: jerarquía contrato → servicio → trabajo; cada trabajo
  puede ser **directo** o **dividido en elementos**.
- **Requisitos fotográficos** obligatorios u opcionales (por ejemplo, Antes,
  Durante y Después), con fotos adicionales siempre permitidas.
- **Evidencia compartida** entre los técnicos asignados al trabajo o elemento,
  con registro de autoría de cada acción.
- **Entregas inmutables** a revisión: el historial de entregas y revisiones se
  conserva íntegro y las decisiones se anexan.
- **Revisión atómica**: aprobar o rechazar (con motivo obligatorio y confirmación)
  se valida y ejecuta en el servidor.
- **Avisos** mediante bandeja interna persistente y **Web Push** opcional (VAPID).
- **Búsqueda global** acotada a los permisos y **exportaciones** (fotos, ZIP por
  entrega, servicio, trabajo y contrato, PDF de evidencia y registro XLSX).

## Roles y permisos

| Rol               | Alcance                  | Operaciones principales                                                                                            |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Administrador** | Todos los servicios      | Gestionar usuarios, roles, asignaciones, catálogos, servicios, trabajos y requisitos; capturar y revisar; exportar |
| **Supervisor**    | Solo servicios asignados | Consultar evidencias, revisar entregas pendientes, consultar el historial y descargar o exportar evidencias        |
| **Técnico**       | Solo servicios asignados | Capturar, retirar y ordenar fotos compartidas; enviar entregas; consultar el historial y descargar o exportar      |

La autorización se resuelve **en el servidor**: una URL directa, una descarga o
una búsqueda no conceden acceso fuera del ámbito autorizado.

## Puesta en marcha

**Requisitos:** Docker y Docker Compose v2, un dominio en Cloudflare y
`cloudflared` en el host. No se requiere Node en el servidor.

```bash
git clone https://github.com/MarcosAvg/lumen.git
cd lumen
./install.sh                 # .env con secretos, VAPID y arranque
```

Al finalizar, la aplicación escucha en `http://127.0.0.1:8090` y las claves de
Web Push quedan generadas. Después se publica el dominio con Cloudflare Tunnel
(ver la sección siguiente) y se completa el asistente **Configurar Lumen** para
crear la cuenta administradora.

`install.sh` es opcional: `docker compose up -d` funciona con un `.env` propio.
Requiere que exista la red Docker `proxy` (o la indicada en `PROXY_NETWORK`); si
no existe, `install.sh` muestra cómo crearla.

| Comando                                       | Efecto                                           |
| --------------------------------------------- | ------------------------------------------------ |
| `./install.sh --email tu@correo`              | Define el sujeto VAPID (`mailto:tu@correo`)      |
| `./install.sh --build`                        | Compila la imagen en local en lugar de usar GHCR |
| `docker compose pull && docker compose up -d` | Arranca con la imagen publicada en GHCR          |
| `docker compose up -d --build`                | Compila la imagen en local                       |

La imagen publicada (`ghcr.io/marcosavg/lumen`) es **multi-arquitectura** (`amd64`
y `arm64`) y se usa por defecto. Para desplegar **sin clonar el repositorio** se
descarga [`compose.yaml`](compose.yaml), se crea un `.env` como el de
[`.env.example`](.env.example) y se ejecuta `docker compose pull && docker compose up -d`.

Detener sin pérdida de datos: `docker compose down`. El comando `down -v` elimina
además los volúmenes persistentes.

## Publicación con Cloudflare Tunnel

La aplicación escucha **solo en `127.0.0.1:8090`** y no abre puertos a Internet.
`cloudflared`, como servicio del host, publica el dominio a través de Cloudflare:

```
Internet → Cloudflare (TLS + WAF) → cloudflared (host) → 127.0.0.1:8090
```

En **Zero Trust → Tunnels → Public Hostname**:

| Campo      | Valor                   |
| ---------- | ----------------------- |
| Subdominio | `lumen` (o el elegido)  |
| Dominio    | `midominio.com`         |
| Servicio   | `http://127.0.0.1:8090` |

Notas de operación:

- Usar `127.0.0.1`, no `localhost` (Docker publica en IPv4).
- No abrir `8090` en el firewall: el túnel no requiere puertos entrantes.
- La aplicación confía en `X-Forwarded-Proto` y `CF-Connecting-IP`, cabeceras que
  Cloudflare entrega a través del túnel.
- Desactivar **Rocket Loader** y **Auto Minify**, y añadir una regla de
  **bypass de caché** para `/api/*`, `/login`, `/setup`, `/health` y `/sw.js`.
- Cloudflare corta las peticiones a los **100 s** (planes Free y Pro): las
  exportaciones muy grandes pueden agotar ese tiempo.

Un proxy inverso propio (Nginx Proxy Manager, Traefik…) sigue siendo válido para
otros servicios, pero Lumen no lo necesita.

**Si `cloudflared` corre en Docker**, no puede alcanzar `127.0.0.1`: la app se
conecta a su red. Por defecto se llama `proxy`; si usas otra, defínela en `.env`:

```dotenv
PROXY_NETWORK=npm_default   # opcional; por defecto `proxy`
```

Si la red no existe, créala (`docker network create proxy`, o el nombre elegido).
El _Service_ del túnel pasa a ser **`http://lumen:3000`** (puerto del contenedor,
no el publicado en el host). `install.sh` comprueba que la red existe.

## Uso

1. El **primer arranque** configura una cuenta de administrador local.
2. La administración crea usuarios, catálogos y servicios, y asigna técnicos y
   supervisores.
3. Se definen trabajos directos o divididos, sus elementos y los requisitos
   fotográficos.
4. Los técnicos asignados capturan fotos y **envían una entrega**.
5. Un supervisor asignado o un administrador **confirma** la aprobación o el
   rechazo (con motivo).
6. Tras un rechazo, los técnicos corrigen y envían una nueva versión; el
   historial permanece consultable.
7. El servicio se marca **completado** cuando todos sus trabajos están aprobados.

## Configuración

La configuración se define en `.env` (plantilla en [`.env.example`](.env.example)):

| Variable                                                   | Obligatoria | Uso                                              |
| ---------------------------------------------------------- | ----------- | ------------------------------------------------ |
| `POSTGRES_PASSWORD`                                        | Sí          | Contraseña de PostgreSQL (evita `@ : / %`)       |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Sí          | Web Push; el sujeto debe ser `mailto:…`          |
| `TZ`                                                       | No          | Zona horaria de presentación (por defecto `UTC`) |
| `LUMEN_TAG`                                                | No          | Versión de la imagen (por defecto `latest`)      |
| `APP_PORT`                                                 | No          | Puerto local de depuración (por defecto `8090`)  |
| `PROXY_NETWORK`                                            | No          | Red Docker de `cloudflared` (si corre en Docker) |

`install.sh` genera la contraseña y las claves VAPID. Referencia completa:
[`docs/deployment.md` §5](docs/deployment.md#5-variables-de-entorno).

### Notificaciones push

Web Push forma parte del núcleo. `install.sh` genera las claves **VAPID** y el
sujeto se define con `--email tu@correo` (en iOS, además, añadir la PWA a la
pantalla de inicio):

```bash
./install.sh --email tu@correo
# o bien: pnpm vapid:generate  (el resultado se copia en .env)
```

En **Ajustes** se activa el push por dispositivo y se envía una **notificación de
prueba** para verificar la configuración.

## Desarrollo

**Requisitos:** Node.js ≥ 22, pnpm 9 y Docker (únicamente para el PostgreSQL del
compose).

```bash
cp .env.example .env         # descomenta DATABASE_URL y TEST_DATABASE_URL
docker compose -f compose.yaml -f compose.dev.yaml up -d db   # PostgreSQL en 127.0.0.1:5432
pnpm install
pnpm db:migrate                # carga .env automáticamente
pnpm dev                       # http://localhost:5173
```

En desarrollo, `PHOTO_STORAGE_PATH` apunta a `./data/photos` (ignorado por git);
en el contenedor de producción se emplea el volumen `lumen_photos` en
`/data/photos`.

Comprobaciones y pruebas:

```bash
pnpm check             # svelte-check (tipos)
pnpm lint              # Prettier + ESLint
pnpm test              # pruebas unitarias (Vitest)
pnpm test:integration  # integración con PostgreSQL real
pnpm test:e2e          # E2E con Playwright (escritorio y móvil)
pnpm build             # build de producción (adapter-node)
```

Las pruebas de integración usan `TEST_DATABASE_URL` (por defecto
`postgres://lumen:cambia-esta-clave@127.0.0.1:5432/lumen_test`, que se crea y
migra automáticamente) y se omiten con un aviso si no hay PostgreSQL disponible.
Las pruebas E2E preparan su propia base de datos y requieren
`pnpm exec playwright install --with-deps chromium` una vez.

### Scripts

| Script                                     | Descripción                                                           |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `dev` / `build` / `start`                  | Servidor de desarrollo, build de producción y arranque del build      |
| `check` / `check:watch`                    | Comprobación de tipos con svelte-check                                |
| `lint` / `format`                          | Comprobación (Prettier + ESLint) y formateo                           |
| `test` / `test:watch`                      | Pruebas unitarias con Vitest                                          |
| `test:integration` / `test:e2e`            | Integración con PostgreSQL y E2E con Playwright                       |
| `db:generate` / `db:migrate` / `db:studio` | Migraciones de Drizzle: generar, aplicar y explorar                   |
| `maintenance:cleanup`                      | Limpieza de temporales y huérfanos, y de suscripciones push revocadas |
| `vapid:generate`                           | Generación de un par de claves VAPID                                  |

El respaldo y la restauración son scripts de `deploy/`, no de `pnpm`:
`./deploy/backup.sh` y `./deploy/restore.sh`.

## Operación

Con Docker (no requiere Node en el host):

```bash
./deploy/backup.sh                  # BD + fotos en ./backups/<fecha>
./deploy/restore.sh backups/<fecha> # restauración (destructiva; pide confirmación)
docker compose exec app node scripts/cleanup.mjs   # temporales, huérfanos y push revocado
docker compose pull && docker compose up -d        # actualizar a la última imagen
```

El respaldo y la limpieza pueden programarse con cron. Los detalles de retención,
prueba de restauración y verificación están en
[`docs/deployment.md`](docs/deployment.md) §7–§10.

## Solución de problemas

| Síntoma                                      | Causa probable o solución                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `docker compose up` falla al traer la imagen | No hay imagen publicada: usar `docker compose pull` o `up --build`.                      |
| La aplicación no responde                    | Revisar `docker compose logs app`; comprobar que `db` está sana y `migrate` terminó.     |
| El dominio no abre                           | Revisar la ruta del túnel (`http://127.0.0.1:8090`) y que `cloudflared` esté activo.     |
| `403` en formularios (login o configuración) | `X-Forwarded-Proto` no llega como `https`; revisar la ruta del túnel.                    |
| `500` «Address header…»                      | Falta `CF-Connecting-IP`: la petición no pasó por Cloudflare (acceso directo al puerto). |
| `413` al subir fotos                         | Supera el límite de Cloudflare (100 MB) o `BODY_SIZE_LIMIT` (30 MB).                     |
| `524` en exportaciones                       | Cloudflare corta a los 100 s; usar un subdominio sin proxy o dividir la exportación.     |
| La PWA no se actualiza                       | Cloudflare está cacheando `/sw.js`; añadir una regla de bypass.                          |
| Las notificaciones push no llegan            | Revisar las claves VAPID y que el sujeto sea `mailto:…`; en iOS hace falta instalarla.   |

## Stack y alcance

**Stack:** Svelte 5 + SvelteKit + TypeScript (monolito) · Tailwind CSS +
shadcn-svelte (PWA en línea) · PostgreSQL + Drizzle ORM/Kit · Docker Compose +
Cloudflare Tunnel · Web Push VAPID, sin Redis ni Firebase obligatorios.

**Fuera del alcance de la v1:** sincronización sin conexión, mensajería entre
usuarios, comentarios por fotografía, revisión de fotos individuales, gestión
integral de contratos y facturación, inventario obligatorio, estructura rígida de
activos, edición simultánea en tiempo real (WebSocket) e informes PDF de negocio.

## Principios de diseño

1. La **evidencia pertenece al trabajo o elemento**, no a un técnico: se registra
   la autoría de cada acción, pero la edición es colectiva entre los técnicos
   asignados.
2. El **historial de entregas y revisiones es inmutable** mientras el objeto
   exista; la eliminación administrativa explícita es la única excepción.
3. La **vista principal muestra siempre la evidencia vigente**; el historial queda
   apartado.
4. Los **catálogos son reutilizables y opcionales**: la aplicación no asume
   industria, edificio, marca ni tipo de equipo.
5. **Sin infraestructura innecesaria:** SvelteKit y PostgreSQL con volúmenes
   persistentes bastan para equipos pequeños.
6. **Primero consistencia y permisos, después apariencia:** ninguna operación
   crítica depende solo de validaciones del navegador.

## Documentación

| Archivo                                                  | Propósito                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`docs/README.md`](docs/README.md)                       | Índice de la documentación (especificación, operación y estado)              |
| [`docs/01-producto.md`](docs/01-producto.md)             | Modelo funcional, reglas de negocio, permisos e invariantes                  |
| [`docs/02-flujos.md`](docs/02-flujos.md)                 | Flujos paso a paso y errores esperados                                       |
| [`docs/03-modelo-datos.md`](docs/03-modelo-datos.md)     | Esquema relacional, integridad, historial y concurrencia                     |
| [`docs/04-arquitectura.md`](docs/04-arquitectura.md)     | Componentes, seguridad, archivos, PWA, Docker, respaldo y API                |
| [`docs/05-interfaz-pwa.md`](docs/05-interfaz-pwa.md)     | Pantallas, navegación, interacciones y accesibilidad                         |
| [`docs/06-implementacion.md`](docs/06-implementacion.md) | Etapas, matriz de pruebas y criterios de aceptación                          |
| [`docs/deployment.md`](docs/deployment.md)               | Referencia operativa: Cloudflare Tunnel, variables, actualización y respaldo |
| [`AGENTS.md`](AGENTS.md)                                 | Reglas de trabajo para agentes de programación y criterios del proyecto      |

## Contribuir

El proyecto se distribuye bajo licencia MIT y las contribuciones son bienvenidas.
Antes de abrir un _pull request_:

1. Ejecutar `pnpm check`, `pnpm lint` y las pruebas (`pnpm test`,
   `pnpm test:integration`, `pnpm test:e2e`).
2. Mantener la coherencia con la especificación de `docs/` y actualizar la
   documentación afectada en el mismo cambio.
3. Describir el motivo y el alcance del cambio, y añadir pruebas de regresión al
   corregir un incidente.

Para reportar errores o proponer mejoras puede abrirse un _issue_ o un _pull
request_ en el repositorio.

## Licencia

Distribuido bajo la licencia **MIT**. Consultar [`LICENSE`](LICENSE).

Copyright © 2026 Marcos Valenzuela.
