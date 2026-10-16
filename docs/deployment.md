# Despliegue, seguridad y operación de Lumen

Guía operativa para **autoalojar** Lumen, ponerlo detrás de HTTPS, actualizarlo,
respaldarlo y restaurarlo. Complementa `docs/04-arquitectura.md` y el `README.md`.

> Para desplegar **sin clonar el repositorio**, usa la guía autocontenida
> [`../DEPLOY.md`](../DEPLOY.md). Índice de toda la documentación: [`README.md`](README.md).

## 1. Requisitos

- **Docker + Docker Compose** (todo lo demás va en contenedores). No hace falta Node en el servidor.
- Un **dominio** apuntando al servidor, si quieres HTTPS y Web Push (Lumen es online-only y los
  avisos push requieren un origen seguro). Para solo probar en local basta con `localhost`.
- Almacenamiento persistente para PostgreSQL y para el volumen de fotos (volúmenes Docker).

## 2. Arranque en 3 pasos

```bash
git clone https://github.com/MarcosAvg/lumen.git
cd lumen
./install.sh                 # crea .env con secretos aleatorios y arranca
```

- App local en `http://localhost` (Caddy sirve HTTP en el puerto 80 por defecto).
- `install.sh` es **opcional**: `docker compose up -d` también funciona con los valores por defecto
  del `compose.yaml` (útil para una prueba rápida).
- Primer arranque: abre la app y completa **Configurar Lumen** para crear la cuenta administradora.

**Con dominio y HTTPS** (Caddy emite el certificado automáticamente):

```bash
./install.sh --domain lumen.midominio.com
```

o, manualmente, define `DOMAIN` en `.env` y levanta:

```bash
docker compose up -d
```

**Compilar la imagen en local** (en lugar de usar la publicada en GHCR):

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Detener sin perder datos: `docker compose down` (usa `down -v` solo para borrar volúmenes).

## 3. Servicios del `compose.yaml`

| Servicio | Función |
|---|---|
| `db` | PostgreSQL 17 con volumen `postgres_data`. **No se publica al exterior.** |
| `migrate` | Aplica migraciones Drizzle una sola vez y termina. |
| `app` | Lumen (imagen GHCR por defecto). Solo en la red interna. |
| `caddy` | Único ingreso: HTTP local y HTTPS automático con `DOMAIN`. |

- La app **no** se publica directamente: todo el acceso pasa por Caddy, que envía `X-Forwarded-Proto`
  y `X-Forwarded-For` (la app los usa para derivar el origen y la IP real).
- El orden está garantizado: `db` sana → `migrate` termina → `app` arranca → `caddy` expone.
- Rotación de logs y límites de memoria/CPU tienen valores por defecto (ver `.env.example`).

### Overrides

- `compose.build.yaml`: compila la imagen en local.
- `compose.dev.yaml`: publica PostgreSQL en `127.0.0.1:5432` para `pnpm dev`, `pnpm db:migrate` y las
  pruebas de integración.

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d db
```

## 4. HTTPS con Caddy

- `DOMAIN` es una **dirección de sitio** de Caddy:
  - `http://localhost` (por defecto) → sirve **HTTP** en el puerto 80 para pruebas locales.
  - `lumen.midominio.com` → obtiene y renueva un certificado de **Let's Encrypt** y redirige HTTP a HTTPS.
- `deploy/Caddyfile` reenvía a `app:3000` y añade `X-Forwarded-Proto`/`X-Forwarded-For`, que la app usa
  (`PROTOCOL_HEADER`, `ADDRESS_HEADER`, `XFF_DEPTH`) para conocer el origen y la IP reales.
- Puertos públicos configurables con `HTTP_PORT`/`HTTPS_PORT` (por defecto 80/443).
- Avisos de expiración (opcional): descomenta la línea `email tu@correo` en las opciones globales de
  `deploy/Caddyfile`.

> Si ya tienes un proxy (Nginx/Traefik), puedes reemplazar el servicio `caddy` publicando `app` y
> enviando `X-Forwarded-Proto`/`X-Forwarded-For`; recuerda que la app **exige** esas cabeceras.

### Por qué no hay que reconstruir al cambiar de dominio

La imagen **deriva el origen público de cada petición** (SvelteKit usa `paths.origin` si está fijado;
si no, el origen de la petición). Por eso la misma imagen sirve para cualquier dominio. Solo si quieres
fijarlo a la fuerza, compila con `ORIGIN=https://… pnpm build` (afecta a builds locales, no a la
imagen publicada).

## 5. Variables de entorno

Copia `.env.example` a `.env` (o deja que `install.sh` lo genere). Ninguna variable contiene secretos
reales por defecto.

| Variable | Uso |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciales de PostgreSQL |
| `LUMEN_IMAGE` / `LUMEN_TAG` | Imagen y etiqueta a usar (`ghcr.io/marcosavg/lumen:latest`) |
| `DOMAIN` | Dirección de sitio de Caddy: `http://localhost` (por defecto) o un dominio (HTTPS) |
| `HTTP_PORT` / `HTTPS_PORT` | Puertos públicos de Caddy (por defecto `80`/`443`) |
| `PHOTO_STORAGE_PATH` | Ruta del volumen de fotos (en Compose, `/data/photos`) |
| `MAX_UPLOAD_BYTES` | Tamaño máximo por archivo |
| `BODY_SIZE_LIMIT` | Límite del cuerpo HTTP de adapter-node (debe superar `MAX_UPLOAD_BYTES`) |
| `IMAGE_MAX_DIMENSION` / `IMAGE_THUMB_DIMENSION` | Normalización y miniaturas |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (opcional) |
| `TZ` | Zona horaria de presentación (persistencia en UTC) |
| `APP_MEM_LIMIT` / `APP_CPUS` (y `DB_*`, `CADDY_*`) | Límites de recursos de cada contenedor |
| `ADDRESS_HEADER` / `XFF_DEPTH` | (Ya fijados en Compose) IP real tras el proxy |

## 6. Imagen publicada (GHCR)

El workflow `release.yml` publica `ghcr.io/marcosavg/lumen:<tag>` al etiquetar (`git tag v1.0.0`) y
actualiza `:latest`. La imagen es **multi-arquitectura** (`linux/amd64` y `linux/arm64`), así que sirve
tanto en VPS x86-64 como en Raspberry Pi / VPS ARM. El compose usa esa imagen por defecto:

```bash
docker compose pull && docker compose up -d
```

Para fijar una versión, define `LUMEN_TAG=v1.0.0` en `.env`.

## 7. Actualización

```bash
./deploy/backup.sh            # 1. respalda
docker compose pull           # 2. trae la imagen nueva
docker compose run --rm migrate   # 3. migra (idempotente)
docker compose up -d          # 4. recrea los contenedores
curl http://127.0.0.1:3000/health
```

El runner de migraciones usa un bloqueo de asesoría, así que despliegues solapados no aplican dos veces.

## 8. Web Push (opcional)

```bash
./install.sh --vapid          # genera y añade las claves a .env
# o bien: pnpm vapid:generate
```

Con `--vapid`, `install.sh` ejecuta el generador dentro de un contenedor y añade
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` a `.env`. La clave privada es un **secreto**:
no la compartas ni la incluyas en imágenes. Sin VAPID, la bandeja interna sigue operativa y
**Ajustes** indica «Push no configurado». Web Push requiere HTTPS.

## 9. Copias de seguridad y restauración

Respalda **juntos** PostgreSQL y el volumen de fotos, o dos copias tomadas en momentos distintos
pueden no coincidir.

```bash
./deploy/backup.sh                      # ./backups/<fecha>/{db.dump,photos.tar.gz,manifest.json}
BACKUP_DIR=/mnt/backups ./deploy/backup.sh
```

- **Solo necesita Docker** (no Node). Usa `pg_dump --format=custom` y archiva el volumen de fotos.
- `manifest.json` incluye tamaño y `sha256` de cada archivo.

Restauración (pide confirmación; **destructiva**):

```bash
./deploy/restore.sh backups/<fecha>
docker compose restart app
```

Prueba siempre primero en un entorno separado. Verifica tras restaurar: recuento de fotos, que las
miniaturas cargan, que el historial de entregas sigue accesible y que las descargas (foto/ZIP) funcionan.

Con Node en el host también puedes usar `pnpm backup` y `pnpm restore`.

**Retención y prueba:** conserva varias generaciones y realiza una **prueba de restauración periódica**.

### Programar respaldo y limpieza (cron)

```cron
# Respaldo diario a las 03:00 y limpieza de temporales/huérfanos a las 04:00
0 3 * * * cd /opt/lumen && ./deploy/backup.sh >>/var/log/lumen-backup.log 2>&1
0 4 * * * cd /opt/lumen && docker compose exec -T app node scripts/cleanup.mjs >>/var/log/lumen-cleanup.log 2>&1
```

La limpieza también purga las **suscripciones push revocadas** con más de 30 días de antigüedad
(las activas nunca se tocan).

## 10. Mantenimiento y observabilidad

```bash
docker compose exec app node scripts/cleanup.mjs   # purga staging/huérfanos, push revocado y registra uso de disco
docker compose logs -f app
```

- Nunca borra archivos referenciados por entregas.
- `/health` responde `200` solo si la base responde y las migraciones están aplicadas; `503` en caso
  contrario, sin exponer detalles.
- Registra en logs: fallos de conversión, limpieza, errores de BD, tiempos de ZIP y errores push.
- Una caída de PostgreSQL o del volumen de fotos se traduce en errores claros; **no** se confirman
  envíos/aprobaciones parciales.

## 11. Seguridad

- **Rate limiting** en login, setup y subidas (en memoria; por instancia si hay varias réplicas).
- **CSRF/Origin** verificado por SvelteKit; no desactivarlo.
- Sesiones en cookies `HttpOnly`/`Secure`/`SameSite`; nunca autenticación en `localStorage`.
- Autorización de ámbito en cada lectura, descarga, búsqueda y ZIP (revalidada al descargar).
- Validación de archivos por **contenido** (JPEG/PNG/WebP) y límites de tamaño/píxeles.
- **PostgreSQL no se publica** al exterior; solo el proxy (Caddy, perfil `proxy`) expone 80/443.
- Los contenedores de la app corren como usuario sin privilegios `node`.
- Mantén la imagen actualizada y revisa dependencias periódicamente.

## 12. Resolución de problemas

| Síntoma | Causa probable / solución |
|---|---|
| `docker compose up` falla al traer la imagen | No hay imagen publicada: usa `-f compose.build.yaml`. |
| La app no responde | `docker compose logs app`; ¿`db` sana y `migrate` terminó? |
| HTTPS no emite certificado | `DOMAIN` debe resolver al servidor y los puertos 80/443 estar libres. |
| El puerto 80/443 está ocupado | Cambia `HTTP_PORT`/`HTTPS_PORT` en `.env`. |
| `403` en formularios (login/setup) | La app necesita `X-Forwarded-Proto`/`X-Forwarded-For`: accede por Caddy (servicio incluido), no directo al contenedor. |
| `500` con «Address header was specified…» | Igual que el anterior: falta `X-Forwarded-For`; usa el proxy incluido. |
| Cookies no persisten en móvil | Accede por HTTPS con un dominio real. |
| Empujes push no llegan | Requiere HTTPS y claves VAPID; la bandeja interna funciona igual. |
