# Despliegue de Lumen (autoalojamiento con Docker Compose)

Guía **autocontenida** para levantar Lumen en un servidor con un único
`docker compose up`. No requiere clonar el repositorio: el `compose.yaml` de más
abajo incluye todo (aplicación, PostgreSQL, migraciones y el proxy HTTPS Caddy).

> Detalle operativo completo (seguridad, backup/restauración, mantenimiento,
> resolución de problemas): [`docs/deployment.md`](docs/deployment.md).

## 1. Requisitos

- **Docker** y **Docker Compose ≥ 2.23** (por el Caddyfile embebido con `configs.content`).
  Comprueba con `docker compose version`.
- Un **dominio** que apunte al servidor si quieres HTTPS y Web Push (Lumen es
  online-only y los avisos push requieren un origen seguro). Para probar en
  local basta con `localhost`.
- Puertos **80/443** libres (o cámbialos con `HTTP_PORT`/`HTTPS_PORT`).

Arquitecturas soportadas por la imagen publicada: **amd64** (VPS x86-64) y
**arm64** (Raspberry Pi, VPS ARM).

## 2. Despliegue rápido

1. Crea una carpeta y guarda el archivo `compose.yaml` de la sección 3 dentro.
   (También está disponible como archivo en el repositorio:
   `deploy/compose.standalone.yaml`.)
2. Opcional: crea un `.env` en la misma carpeta para fijar la contraseña de
   PostgreSQL y el dominio:
   ```dotenv
   POSTGRES_PASSWORD=cambia-esta-clave
   DOMAIN=lumen.midominio.com
   ```
3. Arranca:
   ```bash
   docker compose up -d
   ```
4. Abre `http://localhost` (o `https://tu-dominio`) y completa **Configurar
   Lumen** para crear la cuenta administradora.

Sin `.env` también funciona (usa valores por defecto). Detener sin perder datos:
`docker compose down` (usa `down -v` **solo** para borrar los volúmenes).

### HTTPS con dominio

- **Sin** `DOMAIN` → Caddy sirve `http://localhost` (pruebas locales).
- **Con** `DOMAIN=lumen.midominio.com` → Caddy obtiene y renueva el certificado
  (Let's Encrypt) automáticamente y sirve HTTPS en 80/443.

```bash
DOMAIN=lumen.midominio.com docker compose up -d
```

Opcional: para recibir avisos de expiración, añade un bloque global `email` al
Caddyfile embebido (dentro del `{ ... }` de `admin off`).

### Actualizar

```bash
docker compose pull          # trae la imagen nueva (GHCR)
docker compose run --rm migrate
docker compose up -d
curl -fsS http://127.0.0.1/health   # o https://tu-dominio/health
```

## 3. `compose.yaml`

Copia este archivo como `compose.yaml`. El Caddyfile va embebido en
`configs.caddyfile.content` (por eso `DOMAIN` se escribe `{$$DOMAIN:...}`: el
`$$` escapa la interpolación de Compose y Caddy recibe `{$DOMAIN:...}`).

```yaml
name: lumen

# Lumen · autoalojamiento en un solo archivo (`docker compose up -d`).
#
#   - `db`      PostgreSQL 17 con volumen persistente (no publicado al exterior).
#   - `migrate` aplica migraciones una vez y termina.
#   - `app`     Lumen (imagen GHCR multi-arquitectura: amd64 y arm64).
#   - `caddy`   único ingreso: sirve http://localhost y, con `DOMAIN`, HTTPS automático.
#
# No requiere clonar el repositorio: el Caddyfile va embebido con `configs`.
# Requiere Docker Compose ≥ 2.23 (soporte de `configs.content`).
#
# Uso:
#   docker compose up -d                       # http://localhost
#   DOMAIN=lumen.midominio.com docker compose up -d   # HTTPS automático
#   POSTGRES_PASSWORD=... docker compose up -d        # contraseña propia
#
# El detalle operativo completo está en DEPLOY.md y docs/deployment.md.

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

x-logging: &logging
  driver: json-file
  options:
    max-size: '10m'
    max-file: '3'

x-app-environment: &app-environment
  DATABASE_URL: postgres://${POSTGRES_USER:-lumen}:${POSTGRES_PASSWORD:-lumen}@db:5432/${POSTGRES_DB:-lumen}
  PHOTO_STORAGE_PATH: /data/photos
  BODY_SIZE_LIMIT: ${BODY_SIZE_LIMIT:-30M}
  PROTOCOL_HEADER: x-forwarded-proto
  ADDRESS_HEADER: x-forwarded-for
  XFF_DEPTH: '1'
  MAX_UPLOAD_BYTES: ${MAX_UPLOAD_BYTES:-26214400}
  IMAGE_MAX_DIMENSION: ${IMAGE_MAX_DIMENSION:-2560}
  IMAGE_THUMB_DIMENSION: ${IMAGE_THUMB_DIMENSION:-400}
  TZ: ${TZ:-UTC}
  VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
  VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
  VAPID_SUBJECT: ${VAPID_SUBJECT:-}

services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-lumen}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-lumen}
      POSTGRES_DB: ${POSTGRES_DB:-lumen}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
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

  migrate:
    image: ${LUMEN_IMAGE:-ghcr.io/marcosavg/lumen}:${LUMEN_TAG:-latest}
    restart: 'no'
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-lumen}:${POSTGRES_PASSWORD:-lumen}@db:5432/${POSTGRES_DB:-lumen}
    command: ['node', 'scripts/migrate.mjs']
    depends_on:
      db:
        condition: service_healthy
    logging: *logging

  app:
    image: ${LUMEN_IMAGE:-ghcr.io/marcosavg/lumen}:${LUMEN_TAG:-latest}
    restart: unless-stopped
    init: true
    environment: *app-environment
    volumes:
      - lumen_photos:/data/photos
    depends_on:
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    healthcheck:
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

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
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
    logging: *logging
    deploy:
      resources:
        limits:
          memory: ${CADDY_MEM_LIMIT:-256m}
          cpus: ${CADDY_CPUS:-1}

volumes:
  postgres_data:
  lumen_photos:
  caddy_data:
  caddy_config:
```

## 4. Variables de entorno (opcionales)

| Variable                                                   | Uso                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| `POSTGRES_PASSWORD`                                        | Contraseña de PostgreSQL (cámbiala en producción)    |
| `DOMAIN`                                                   | Dominio público; habilita HTTPS automático           |
| `HTTP_PORT` / `HTTPS_PORT`                                 | Puertos públicos de Caddy (por defecto `80`/`443`)   |
| `LUMEN_IMAGE` / `LUMEN_TAG`                                | Imagen y etiqueta (`ghcr.io/marcosavg/lumen:latest`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (opcional)                                  |
| `TZ`                                                       | Zona horaria de presentación (persistencia en UTC)   |

Web Push es opcional: sin VAPID, la bandeja interna sigue funcionando. Genera un
par de claves con `pnpm vapid:generate` (repositorio) o deja que lo haga
`./install.sh --vapid` si has clonado el repo.

## 5. Copias de seguridad

Respalda **juntos** la base y el volumen de fotos. Con el repositorio clonado:

```bash
./deploy/backup.sh                      # ./backups/<fecha>/{db.dump,photos.tar.gz,manifest.json}
./deploy/restore.sh backups/<fecha>     # restauración (destructiva; pide confirmación)
```

Con solo el `compose.yaml` (sin clonar), equivale a:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ); mkdir -p backups/$STAMP
docker compose exec -T db pg_dump -U lumen -d lumen --format=custom --no-owner > backups/$STAMP/db.dump
docker compose exec -T app tar -C /data/photos -czf - . > backups/$STAMP/photos.tar.gz
```

Restaura sobre una base y un volumen existentes:

```bash
docker compose exec -T db pg_restore -U lumen -d lumen --clean --if-exists --no-owner < backups/<fecha>/db.dump
docker compose exec -T app tar -xzf - -C /data/photos < backups/<fecha>/photos.tar.gz
docker compose restart app
```

## 6. Seguridad y notas

- **PostgreSQL no se publica** al exterior; el único ingreso es Caddy (80/443).
- El **origen público se deriva de la petición**, así que la misma imagen sirve
  para cualquier dominio sin reconstruir.
- La aplicación corre como usuario sin privilegios `node`; hay healthchecks y
  rotación de logs.
- Mantén la imagen actualizada (`docker compose pull`) y guarda la contraseña de
  PostgreSQL fuera del repositorio.
- La **bandeja de notificaciones** interna funciona siempre; Web Push requiere
  HTTPS y claves VAPID.

> Si ya tienes un proxy (Nginx/Traefik), puedes quitar el servicio `caddy` y
> publicar `app` directamente, pero **debes** enviar `X-Forwarded-Proto` y
> `X-Forwarded-For` (la app los exige para el origen y la IP real).
