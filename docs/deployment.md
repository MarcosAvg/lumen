# Despliegue, seguridad y operación de Lumen

Guía operativa para instalar Lumen detrás de HTTPS, actualizarlo, respaldarlo y
restaurarlo. Complementa `docs/04-arquitectura.md` y el `README.md`.

## 1. Requisitos

- Docker + Docker Compose, o Node.js ≥ 22 + PostgreSQL 17 para una instalación sin contenedores.
- Un **proxy inverso con HTTPS** delante de la app. Lumen es **online-only** y usa Web Push,
  que requiere un origen seguro.
- Almacenamiento persistente para PostgreSQL y para el volumen de fotos.

## 2. Variables de entorno

Copia `.env.example` a `.env`. Ninguna variable contiene secretos reales por defecto.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `ORIGIN` | URL pública HTTPS; se fija en **build** (CSRF/URLs absolutas) |
| `PHOTO_STORAGE_PATH` | Ruta del volumen de fotos (en Compose, `/data/photos`) |
| `MAX_UPLOAD_BYTES` | Tamaño máximo por archivo |
| `IMAGE_MAX_DIMENSION` / `IMAGE_THUMB_DIMENSION` | Normalización y miniaturas |
| `BODY_SIZE_LIMIT` | Límite del cuerpo HTTP de adapter-node (debe superar `MAX_UPLOAD_BYTES`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (opcional). Genera con `pnpm vapid:generate` |
| `TZ` | Zona horaria de presentación (persistencia en UTC) |
| `ADDRESS_HEADER` / `XFF_DEPTH` | (Solo con proxy) para obtener la IP real del cliente |

> `ORIGIN` forma parte de la imagen: cambiarla requiere **reconstruir** (`docker compose build`).

## 3. Poner en marcha con Docker Compose

```bash
cp .env.example .env      # ajusta POSTGRES_PASSWORD, ORIGIN y, si aplica, VAPID_*
docker compose up -d --build
curl http://localhost:3000/health
```

- El servicio `migrate` aplica las migraciones una sola vez antes de arrancar `app`.
- Primer arranque: abre la app y completa **Configurar Lumen** para crear la cuenta administradora.
- `docker compose down` detiene sin perder datos; `down -v` **borra** los volúmenes.

### Imagen publicada (GHCR)

El workflow `release.yml` publica `ghcr.io/<owner>/<repo>:<tag>` al etiquetar (`git tag v1.0.0`).
Para usar la imagen en lugar de construir en el servidor, sustituye `build:` por:

```yaml
image: ghcr.io/<owner>/<repo>:v1.0.0
```

y ejecuta `docker compose pull` antes de `up`.

## 4. Proxy inverso

- Termina TLS en el proxy y reenvía a `app:3000`.
- Envía `X-Forwarded-Proto` y `X-Forwarded-For`. Configura en la app
  `ADDRESS_HEADER=x-forwarded-for` y `XFF_DEPTH=1` para que el **rate limiting** vea la IP real.
- La app añade cabeceras de seguridad (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`) y una **CSP** compatible con SvelteKit.

## 5. Migraciones al actualizar

```bash
docker compose pull           # si usas imagen publicada
docker compose run --rm migrate
docker compose up -d app
```

El runner usa un bloqueo de asesoría, por lo que despliegues solapados no aplican dos veces.

## 6. Web Push (opcional)

```bash
pnpm vapid:generate   # imprime VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
```

Guarda la clave privada **solo** en secretos. Sin VAPID, la bandeja interna sigue operativa y la
página **Ajustes** indica «Push no configurado». La clave privada nunca debe registrarse en logs.

## 7. Copias de seguridad y restauración

Respalda **juntos** PostgreSQL y el volumen de fotos, o dos copias tomadas en momentos distintos
pueden no coincidir.

```bash
pnpm backup                              # ./backups/<fecha>/{db.dump,photos.tar.gz,manifest.json}
BACKUP_DIR=/mnt/backups pnpm backup
```

- `db.dump`: `pg_dump --format=custom`. `photos.tar.gz`: contenido del volumen de fotos.
- `manifest.json` incluye tamaño y `sha256` de cada archivo.
- Los scripts usan `pg_dump`/`pg_restore` locales si existen; si no, los ejecutan dentro del
  contenedor `db` de Compose y archivan el volumen mediante un contenedor del servicio `app`.

Restauración (siempre primero en un entorno separado):

```bash
# Sobre una base distinta, para no pisar producción durante la verificación:
RESTORE_DATABASE=lumen_restore pnpm restore ./backups/<fecha>
```

Verifica tras restaurar: recuento de fotos, que las miniaturas cargan, que el historial de
entregas sigue accesible y que las descargas (foto/ZIP) funcionan.

**Retención:** conserva varias generaciones y realiza una **prueba de restauración periódica**.
Documenta que el respaldo y la verificación son parte del procedimiento, no solo la copia.

## 8. Mantenimiento y observabilidad

```bash
pnpm maintenance:cleanup    # purga staging/huérfanos y registra uso de disco
```

- Programa `maintenance:cleanup` por cron (p. ej. diario). Nunca borra archivos referenciados.
- `/health` responde `200` solo si la base responde y las migraciones están aplicadas; `503` en
  caso contrario, sin exponer detalles.
- Registra en logs: fallos de conversión, limpieza, errores de BD, tiempos de ZIP y errores push.
- Una caída de PostgreSQL o del volumen de fotos se traduce en errores claros; **no** se confirman
  envíos/aprobaciones parciales.

## 9. Seguridad

- **Rate limiting** en login, setup y subidas (en memoria; por instancia si hay varias réplicas).
- **CSRF/Origin** verificado por SvelteKit; no desactivarlo.
- Sesiones en cookies `HttpOnly`/`Secure`/`SameSite`; nunca autenticación en `localStorage`.
- Autorización de ámbito en cada lectura, descarga, búsqueda y ZIP (revalidada al descargar).
- Validación de archivos por **contenido** (JPEG/PNG/WebP) y límites de tamaño/píxeles.
- No publique PostgreSQL a Internet; mantén el puerto `db` en `127.0.0.1` o en la red interna.

## 10. Flujo de actualización recomendado

1. Respalda (sección 7).
2. Actualiza la imagen/versión y aplica migraciones (sección 5).
3. Verifica `/health` y una descarga de ejemplo.
4. Revisa logs de limpieza, push y errores.
