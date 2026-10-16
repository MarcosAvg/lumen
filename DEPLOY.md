# Despliegue de Lumen (autoalojamiento con Docker Compose)

Guía **autocontenida** para levantar Lumen en un servidor con un único
`docker compose up`. No requiere clonar el repositorio: el `compose.yaml` de más
abajo incluye la aplicación, PostgreSQL y las migraciones.

Lumen **no incluye** un proxy inverso: como en el resto de proyectos self-host, lo
gestionas tú (Nginx, Traefik, Caddy…). El compose publica la app en
`127.0.0.1:8090` y tu proxy termina TLS y reenvía ahí. Si no tienes proxy, hay un
**Caddy opcional** al final.

> Esta es la versión **autocontenida** (sirve sin clonar el repo). La referencia
> operativa **canónica** es [`docs/deployment.md`](docs/deployment.md) (seguridad,
> backup/restauración, mantenimiento y resolución de problemas).

## 1. Requisitos

- **Docker** y **Docker Compose v2** (`docker compose version`).
- Un **proxy inverso** con TLS (o el Caddy opcional de la sección 7) para HTTPS;
  Lumen es online-only y Web Push requiere un origen seguro.
- Un **dominio** apuntando al servidor si vas a publicarlo.

Arquitecturas soportadas por la imagen publicada: **amd64** (VPS x86-64) y
**arm64** (Raspberry Pi, VPS ARM).

## 2. Despliegue rápido

1. Crea una carpeta y guarda el archivo `compose.yaml` de la sección 4 dentro.
   (También está disponible como archivo en el repositorio:
   `deploy/compose.standalone.yaml`.)
2. Opcional: crea un `.env` en la misma carpeta:
   ```dotenv
   POSTGRES_PASSWORD=cambia-esta-clave
   APP_PORT=8090
   ```
3. Arranca:
   ```bash
   docker compose up -d
   docker compose ps          # `app` debe quedar "healthy"
   ```
4. Configura tu proxy para reenviar a `127.0.0.1:8090` (sección 3) y abre
   `https://tu-dominio` para completar **Configurar Lumen**.

Sin `.env` también funciona (usa valores por defecto). Detener sin perder datos:
`docker compose down` (usa `down -v` **solo** para borrar los volúmenes).

## 3. Proxy inverso (lo gestionas tú)

Tu proxy debe reenviar a `127.0.0.1:8090` enviando **siempre** estas cabeceras; la
app las exige para derivar el origen público y la IP real:

| Cabecera            | Por qué                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `Host`              | La app construye URLs y valida el origen con él                         |
| `X-Forwarded-Proto` | Sin ella la app **asume `https`** y el login por HTTP da **403 (CSRF)** |
| `X-Forwarded-For`   | `ADDRESS_HEADER` la exige; sin ella el rate limiting da **500**         |

Ejemplo con **Nginx** (TLS ya configurado):

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
		proxy_set_header X-Real-IP $remote_addr;
	}
}
```

Con **Traefik**, apunta el servicio a `http://127.0.0.1:8090` (o al contenedor
`app` si Traefik comparte la red de Compose) y deja que gestione TLS; Traefik añade
las cabeceras `X-Forwarded-*` por defecto.

> Si tu proxy corre en **otro contenedor** (no en el host), no basta con
> `127.0.0.1`: une ambos a la misma red y usa `http://app:3000`, o publica el
> puerto con `APP_BIND=0.0.0.0`.
>
> Si pones un **CDN** por delante, ajusta `XFF_DEPTH` (número de proxies) en el
> entorno de `app`.

## 4. `compose.yaml`

Copia este archivo como `compose.yaml`.

```yaml
name: lumen

# Lumen · autoalojamiento en un solo archivo, con tu propio proxy inverso.
#
# Servicios:
#   - `db`      PostgreSQL 17 con volumen persistente (no publicado al exterior).
#   - `migrate` aplica las migraciones de Drizzle una vez y termina.
#   - `app`     Lumen (imagen GHCR multi-arquitectura: amd64 y arm64), publicado solo
#               en `127.0.0.1:${APP_PORT:-8090}`.
#
# El proxy inverso (Nginx, Traefik, Caddy…) lo gestionas tú: termina TLS y reenvía a
# `127.0.0.1:8090` enviando `Host`, `X-Forwarded-Proto` y `X-Forwarded-For` (la app
# las exige para el origen y la IP real). Ejemplos y avisos en DEPLOY.md.
#
# Cómo usarlo:
#   docker compose up -d                       # app en http://127.0.0.1:8090
#   POSTGRES_PASSWORD=... docker compose up -d # contraseña propia
#
# No requiere clonar el repositorio. El detalle operativo está en DEPLOY.md y
# docs/deployment.md.

# --- Extensión: rotación de logs ------------------------------------------------
# Evita que los logs de los contenedores llenen el disco del servidor.
x-logging: &logging
  driver: json-file
  options:
    max-size: '10m'
    max-file: '3'

# --- Extensión: URL interna de PostgreSQL ---------------------------------------
# Se construye contra el host `db` (red interna) y se reutiliza en `migrate` y `app`.
x-database-url: &database-url postgres://${POSTGRES_USER:-lumen}:${POSTGRES_PASSWORD:-lumen}@db:5432/${POSTGRES_DB:-lumen}

# --- Extensión: entorno común de la app -----------------------------------------
# El origen público se deriva de la petición (no se hornea en la imagen). Tu proxy es
# el único ingreso y debe añadir `X-Forwarded-Proto`/`X-Forwarded-For`; sin ellas la
# app responde 403/500.
x-app-environment: &app-environment
  DATABASE_URL: *database-url
  PHOTO_STORAGE_PATH: /data/photos
  # Límite del cuerpo HTTP de adapter-node; debe superar MAX_UPLOAD_BYTES.
  BODY_SIZE_LIMIT: ${BODY_SIZE_LIMIT:-30M}
  PROTOCOL_HEADER: x-forwarded-proto
  ADDRESS_HEADER: x-forwarded-for
  XFF_DEPTH: '1'
  MAX_UPLOAD_BYTES: ${MAX_UPLOAD_BYTES:-26214400}
  IMAGE_MAX_DIMENSION: ${IMAGE_MAX_DIMENSION:-2560}
  IMAGE_THUMB_DIMENSION: ${IMAGE_THUMB_DIMENSION:-400}
  TZ: ${TZ:-UTC}
  # Web Push es opcional: sin estas claves, la bandeja interna sigue funcionando.
  VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
  VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
  VAPID_SUBJECT: ${VAPID_SUBJECT:-}

services:
  # Base de datos. NO se publica ningún puerto: solo la alcanzan `migrate` y `app`
  # por la red interna de Compose.
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    security_opt: ['no-new-privileges:true']
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-lumen}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-lumen}
      POSTGRES_DB: ${POSTGRES_DB:-lumen}
    volumes:
      # Datos SQL. Respáldalo junto con `lumen_photos`.
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      # `$$` escapa la interpolación de Compose para que la evalúe la shell del contenedor.
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}']
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s
    logging: *logging
    deploy:
      resources:
        limits:
          memory: ${DB_MEM_LIMIT:-1g}
          cpus: ${DB_CPUS:-2}

  # Servicio efímero: aplica las migraciones y termina. `app` espera a que complete.
  migrate:
    image: ${LUMEN_IMAGE:-ghcr.io/marcosavg/lumen}:${LUMEN_TAG:-latest}
    restart: 'no'
    security_opt: ['no-new-privileges:true']
    environment:
      DATABASE_URL: *database-url
    command: ['node', 'scripts/migrate.mjs']
    depends_on:
      db:
        condition: service_healthy
    logging: *logging
    # Sin límites de recursos: es un proceso corto que termina tras migrar.

  # Aplicación. Se publica SOLO en 127.0.0.1 (tu proxy reenvía ahí). Corre como usuario
  # sin privilegios y con `init`.
  app:
    image: ${LUMEN_IMAGE:-ghcr.io/marcosavg/lumen}:${LUMEN_TAG:-latest}
    restart: unless-stopped
    init: true
    security_opt: ['no-new-privileges:true']
    cap_drop: ['ALL']
    stop_grace_period: 15s
    environment: *app-environment
    volumes:
      # Fotografías normalizadas y miniaturas. Respáldalo junto con `postgres_data`.
      - lumen_photos:/data/photos
    ports:
      - '127.0.0.1:${APP_PORT:-8090}:3000'
    depends_on:
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    healthcheck:
      # `/health` responde 200 solo si la base responde y las migraciones están aplicadas.
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
        ]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s
    logging: *logging
    deploy:
      resources:
        limits:
          memory: ${APP_MEM_LIMIT:-1g}
          cpus: ${APP_CPUS:-2}

# Volúmenes persistentes. `down` los conserva; `down -v` los borra (pierde datos).
volumes:
  postgres_data: # base de datos SQL
  lumen_photos: # fotografías y miniaturas
```

## 5. Variables de entorno (opcionales)

| Variable                                                   | Uso                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                        | Contraseña de PostgreSQL (cámbiala en producción)         |
| `APP_PORT`                                                 | Puerto local donde se publica la app (por defecto `8090`) |
| `LUMEN_IMAGE` / `LUMEN_TAG`                                | Imagen y etiqueta (`ghcr.io/marcosavg/lumen:latest`)      |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (opcional)                                       |
| `TZ`                                                       | Zona horaria de presentación (persistencia en UTC)        |

Web Push es opcional: sin VAPID, la bandeja interna sigue funcionando. Genera un
par de claves con `pnpm vapid:generate` (repositorio) o `./install.sh --vapid`.

## 6. Actualizar y respaldar

```bash
# Actualizar
docker compose pull
docker compose run --rm migrate
docker compose up -d
curl -fsS http://127.0.0.1:8090/health

# Respaldo (base + fotos, con el repositorio clonado)
./deploy/backup.sh
./deploy/restore.sh backups/<fecha>
```

Sin clonar, equivale a:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ); mkdir -p backups/$STAMP
docker compose exec -T db pg_dump -U lumen -d lumen --format=custom --no-owner > backups/$STAMP/db.dump
docker compose exec -T app tar -C /data/photos -czf - . > backups/$STAMP/photos.tar.gz
```

## 7. Caddy opcional (si no tienes proxy)

Añade este servicio a tu `compose.yaml` para obtener HTTPS automático (Let's
Encrypt). Caddy pasa a ser el único ingreso en 80/443 y añade las cabeceras.

```yaml
configs:
  caddyfile:
    content: |
      {
        admin off
      }

      {$$DOMAIN:http://localhost} {
        encode zstd gzip
        reverse_proxy app:3000
      }

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    security_opt: ['no-new-privileges:true']
    environment:
      DOMAIN: ${DOMAIN:-http://localhost}
    ports:
      - '${HTTP_PORT:-80}:80'
      - '${HTTPS_PORT:-443}:443'
      - '${HTTPS_PORT:-443}:443/udp'
    configs:
      - source: caddyfile
        target: /etc/caddy/Caddyfile
    volumes:
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      app:
        condition: service_started
```

Y declara los volúmenes `caddy_data` y `caddy_config` en la sección `volumes`.
Con `DOMAIN=lumen.midominio.com` obtiene y renueva el certificado automáticamente;
con `DOMAIN=http://localhost` sirve HTTP en el puerto 80 para pruebas locales.

> En el repositorio esto ya existe como override: `docker compose -f compose.yaml
-f compose.caddy.yaml up -d`.

## 8. Seguridad y notas

- **PostgreSQL no se publica**; el único ingreso es tu proxy (o Caddy opcional).
- El **origen público se deriva de la petición**, así que la misma imagen sirve
  para cualquier dominio sin reconstruir.
- La aplicación corre como usuario sin privilegios `node`; hay healthchecks y
  rotación de logs.
- Mantén la imagen actualizada (`docker compose pull`) y guarda la contraseña de
  PostgreSQL fuera del repositorio.
- La **bandeja de notificaciones** interna funciona siempre; Web Push requiere
  HTTPS y claves VAPID.
