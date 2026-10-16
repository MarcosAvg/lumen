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

**Requisitos:** Docker y Docker Compose v2. No se requiere Node en el servidor.

```bash
git clone https://github.com/MarcosAvg/lumen.git
cd lumen
./install.sh                 # genera .env con secretos y arranca la aplicación
```

Al finalizar, la aplicación queda disponible en `http://127.0.0.1:8090`, a la
espera del proxy inverso. Después se abre el dominio público y se completa el
asistente **Configurar Lumen** para crear la cuenta administradora.

`install.sh` es opcional: `docker compose up -d` también funciona con los valores
por defecto.

| Comando                                       | Efecto                                           |
| --------------------------------------------- | ------------------------------------------------ |
| `./install.sh --domain lumen.midominio.com`   | Añade Caddy con HTTPS automático                 |
| `./install.sh --caddy`                        | Añade Caddy en HTTP (puerto 80)                  |
| `./install.sh --build`                        | Compila la imagen en local en lugar de usar GHCR |
| `./install.sh --vapid`                        | Genera claves Web Push y las añade a `.env`      |
| `docker compose pull && docker compose up -d` | Arranca con la imagen publicada en GHCR          |
| `docker compose up -d --build`                | Compila la imagen en local                       |

La imagen publicada (`ghcr.io/marcosavg/lumen`) es **multi-arquitectura** (`amd64`
y `arm64`) y se usa por defecto. Para desplegar **sin clonar el repositorio** se
descarga [`compose.yaml`](compose.yaml) (y [`deploy/Caddyfile`](deploy/Caddyfile)
si se usa Caddy) y se ejecuta `docker compose pull && docker compose up -d`.

Detener sin pérdida de datos: `docker compose down`. El comando `down -v` elimina
además los volúmenes persistentes.

## Publicación con proxy inverso

La aplicación se publica únicamente en `127.0.0.1:${APP_PORT}` (por defecto
`8090`). El proxy inverso (Nginx, Traefik, Caddy…) gestiona TLS y reenvía
**siempre** estas cabeceras, que la aplicación exige:

| Cabecera            | Motivo                                                                  |
| ------------------- | ----------------------------------------------------------------------- |
| `Host`              | Construcción de URLs y validación del origen                            |
| `X-Forwarded-Proto` | Sin ella la aplicación asume `https` y el login por HTTP responde `403` |
| `X-Forwarded-For`   | La exige el limitador de tasa; sin ella la aplicación responde `500`    |

Ejemplo con **Nginx**:

```nginx
server {
	listen 443 ssl http2;
	server_name lumen.midominio.com;

	# ssl_certificate ...; ssl_certificate_key ...;

	client_max_body_size 30m;   # >= BODY_SIZE_LIMIT
	proxy_read_timeout 300s;    # ZIP/PDF de evidencias

	location / {
		proxy_pass http://127.0.0.1:8090;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
	}
}
```

Con un proxy en contenedor (por ejemplo, Traefik) el destino es `http://app:3000`
en la red de Compose, o `127.0.0.1:${APP_PORT}` si el proxy corre en el host. Si
hay un CDN delante, se ajusta `XFF_DEPTH` al número de proxies.

**Sin proxy inverso**, el Caddy incluido emite y renueva el certificado:

```bash
docker compose --profile caddy up -d                              # HTTP en el puerto 80
DOMAIN=lumen.midominio.com docker compose --profile caddy up -d   # HTTPS (Let's Encrypt)
```

Ejemplos ampliados, avisos y diagnóstico: [`DEPLOY.md`](DEPLOY.md) y
[`docs/deployment.md`](docs/deployment.md).

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

La configuración se define por variables de entorno o mediante un archivo `.env`
(opcional). Valores habituales:

| Variable                                                   | Por defecto                      | Uso                                                              |
| ---------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                        | `lumen`                          | Contraseña de PostgreSQL (debe cambiarse en producción)          |
| `APP_PORT`                                                 | `8090`                           | Puerto local de la aplicación al que apunta el proxy inverso     |
| `LUMEN_IMAGE` / `LUMEN_TAG`                                | `ghcr.io/marcosavg/lumen:latest` | Imagen y etiqueta a usar                                         |
| `DOMAIN` _(Caddy)_                                         | `http://localhost`               | Dirección de sitio de Caddy; un dominio activa HTTPS             |
| `HTTP_PORT` / `HTTPS_PORT` _(Caddy)_                       | `80` / `443`                     | Puertos públicos del Caddy opcional                              |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | —                                | Web Push (opcional)                                              |
| `MAX_UPLOAD_BYTES`                                         | `26214400` (25 MiB)              | Tamaño máximo por archivo                                        |
| `TZ`                                                       | `UTC`                            | Zona horaria de presentación (la persistencia es siempre en UTC) |

Referencia completa: [`docs/deployment.md` §5](docs/deployment.md#5-variables-de-entorno)
y [`.env.example`](.env.example).

### Notificaciones push (opcional)

La **bandeja interna opera siempre**. Web Push requiere claves **VAPID** y HTTPS
(en iOS, además, añadir la PWA a la pantalla de inicio):

```bash
./install.sh --vapid           # genera las claves y las añade a .env
# o bien: pnpm vapid:generate  (el resultado se copia en .env)
```

En **Ajustes** se activa el push por dispositivo y se envía una **notificación de
prueba** para verificar la configuración.

## Desarrollo

**Requisitos:** Node.js ≥ 22, pnpm 9 y Docker (únicamente para el PostgreSQL del
compose).

```bash
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
| La aplicación no es accesible desde Internet | Configurar el proxy a `127.0.0.1:${APP_PORT}`, o usar Caddy (`--profile caddy`).         |
| `403` en formularios (login o configuración) | Falta `X-Forwarded-Proto` en el proxy; sin ella la aplicación asume `https`.             |
| `500` «Address header…»                      | Falta `X-Forwarded-For` en el proxy (limitador de tasa).                                 |
| `413` al subir fotos                         | Aumentar `client_max_body_size` del proxy (≥ `BODY_SIZE_LIMIT`, 30M).                    |
| HTTPS no emite certificado (Caddy)           | `DOMAIN` debe resolver al servidor y los puertos 80/443 estar libres.                    |
| Puertos 80/443 ocupados (Caddy)              | Ya existe un proxy inverso: omitir el perfil `caddy` o cambiar `HTTP_PORT`/`HTTPS_PORT`. |
| Las notificaciones push no llegan            | Requieren HTTPS y claves VAPID; la bandeja interna funciona igual.                       |

## Stack y alcance

**Stack:** Svelte 5 + SvelteKit + TypeScript (monolito) · Tailwind CSS +
shadcn-svelte (PWA en línea) · PostgreSQL + Drizzle ORM/Kit · Docker Compose
(proxy inverso propio o Caddy opcional) · Web Push VAPID, sin Redis ni Firebase
obligatorios.

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

| Archivo                                                  | Propósito                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`docs/README.md`](docs/README.md)                       | Índice de la documentación (especificación, operación y estado)         |
| [`docs/01-producto.md`](docs/01-producto.md)             | Modelo funcional, reglas de negocio, permisos e invariantes             |
| [`docs/02-flujos.md`](docs/02-flujos.md)                 | Flujos paso a paso y errores esperados                                  |
| [`docs/03-modelo-datos.md`](docs/03-modelo-datos.md)     | Esquema relacional, integridad, historial y concurrencia                |
| [`docs/04-arquitectura.md`](docs/04-arquitectura.md)     | Componentes, seguridad, archivos, PWA, Docker, respaldo y API           |
| [`docs/05-interfaz-pwa.md`](docs/05-interfaz-pwa.md)     | Pantallas, navegación, interacciones y accesibilidad                    |
| [`docs/06-implementacion.md`](docs/06-implementacion.md) | Etapas, matriz de pruebas y criterios de aceptación                     |
| [`docs/deployment.md`](docs/deployment.md)               | Referencia operativa: HTTPS, variables, actualización y respaldo        |
| [`DEPLOY.md`](DEPLOY.md)                                 | Guía breve de despliegue con `docker compose`                           |
| [`AGENTS.md`](AGENTS.md)                                 | Reglas de trabajo para agentes de programación y criterios del proyecto |

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
