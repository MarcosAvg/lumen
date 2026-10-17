# Despliegue, seguridad y operación de Lumen

Guía operativa para **autoalojar** Lumen detrás de **Cloudflare Tunnel**,
actualizarlo, respaldarlo y restaurarlo. Complementa `docs/04-arquitectura.md` y
el `README.md`.

## 1. Requisitos

- **Docker + Docker Compose** (no hace falta Node en el servidor).
- Un **dominio gestionado en Cloudflare**.
- **`cloudflared`** instalado como servicio en el host.
- Almacenamiento persistente para PostgreSQL y para las fotografías (volúmenes
  Docker).
- **2 GB de RAM** como mínimo razonable (PostgreSQL + procesado de imágenes).

## 2. Arranque en 3 pasos

```bash
git clone https://github.com/MarcosAvg/lumen.git
cd lumen
./install.sh --email tu@correo      # .env, claves VAPID y arranque
```

- La aplicación queda en **`http://127.0.0.1:8090`**, sin puertos públicos.
- `install.sh` genera la contraseña de PostgreSQL y las claves VAPID, levanta
  Compose y espera a que `/health` responda.
- Primer arranque: se publica el dominio con el túnel (§4) y se completa
  **Configurar Lumen** para crear la cuenta administradora.

**Compilar la imagen en local** (en lugar de usar GHCR):

```bash
./install.sh --build
# o bien: docker compose up -d --build
```

Detener sin perder datos: `docker compose down` (`down -v` borra los volúmenes).

## 3. Servicios del `compose.yaml`

| Servicio  | Función                                                          |
| --------- | ---------------------------------------------------------------- |
| `db`      | PostgreSQL 17 con volumen `postgres_data`. No se publica.        |
| `migrate` | Aplica las migraciones Drizzle una sola vez y termina.           |
| `app`     | Lumen. Escucha solo en `127.0.0.1:8090`; la alcanza `cloudflared`. |

- Orden garantizado: `db` sana → `migrate` termina → `app` arranca.
- Rotación de logs activa (10 MB × 3 por servicio).
- Sin límites de CPU/RAM: Docker usa los recursos del host.

### Override de desarrollo

`compose.dev.yaml` publica PostgreSQL en `127.0.0.1:5432` para `pnpm dev`,
`pnpm db:migrate` y las pruebas de integración:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d db
```

## 4. Publicación con Cloudflare Tunnel

`cloudflared` abre una conexión **saliente** a Cloudflare; no hay IP de origen
expuesta ni puertos entrantes.

```
Internet → Cloudflare (TLS + WAF) → cloudflared (host) → 127.0.0.1:8090
```

En **Zero Trust → Tunnels → Public Hostname**:

| Campo      | Valor                   |
| ---------- | ----------------------- |
| Subdominio | `lumen` (o el elegido)  |
| Dominio    | `midominio.com`         |
| Servicio   | `http://127.0.0.1:8090` |

- Usar `127.0.0.1`, **no** `localhost` (Docker publica en IPv4).
- No abrir `8090` en el firewall.
- Cloudflare entrega `X-Forwarded-Proto: https` y `CF-Connecting-IP`; la app las
  usa para derivar el origen y la IP real (`ADDRESS_HEADER=cf-connecting-ip`).

### Ajustes de Cloudflare

| Ajuste                    | Valor                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| Rocket Loader / Auto Minify | **Off** (rompen la hidratación de Svelte y la CSP con nonces)       |
| Cache Rules               | **Bypass** para `/api/*`, `/login`, `/setup`, `/health`, `/sw.js`, `/manifest.webmanifest` |
| Bot Fight Mode            | Off (puede bloquear POST legítimos)                                   |
| Timeout                   | **100 s** en planes Free/Pro: las exportaciones grandes pueden dar 524 |

`sw.js` es el punto más sensible de la PWA: si se cachea, los clientes quedan en
una versión antigua.

### Alternativa con proxy inverso

El proyecto asume el túnel. Si se usa un proxy propio (Nginx Proxy Manager,
Traefik…), debe reenviar a `127.0.0.1:8090` con `Host`, `X-Forwarded-Proto` y
`X-Forwarded-For`; en ese caso hay que cambiar `ADDRESS_HEADER` y valorar
`XFF_DEPTH` según el número de saltos. No es la configuración por defecto.

## 5. Variables de entorno

Copia `.env.example` a `.env` (o deja que `install.sh` lo genere).

| Variable                                                   | Obligatoria | Uso                                              |
| ---------------------------------------------------------- | ----------- | ------------------------------------------------ |
| `POSTGRES_PASSWORD`                                        | Sí          | Contraseña de PostgreSQL (evita `@ : / %`)       |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Sí          | Web Push; el sujeto debe ser `mailto:…`          |
| `TZ`                                                       | No          | Zona horaria de presentación (por defecto `UTC`) |
| `LUMEN_TAG`                                                | No          | Versión de la imagen (por defecto `latest`)      |

El resto de parámetros (tamaño de subida, dimensiones de imagen, límites de tasa)
tiene valores por defecto en el código y no se expone en `.env`.

## 6. Imagen publicada (GHCR)

El workflow `release.yml` publica `ghcr.io/marcosavg/lumen:<tag>` al etiquetar
(`git tag v0.2.0`) y actualiza `:latest`. La imagen es **multi-arquitectura**
(`linux/amd64` y `linux/arm64`), así que sirve tanto en VPS x86-64 como en ARM.

```bash
docker compose pull && docker compose up -d
```

Para fijar una versión, define `LUMEN_TAG=v0.2.0` en `.env`.

## 7. Actualización

```bash
./deploy/backup.sh              # 1. respalda
docker compose pull             # 2. trae la imagen nueva
docker compose run --rm migrate # 3. migra (idempotente)
docker compose up -d            # 4. recrea los contenedores
```

El runner de migraciones usa un bloqueo de asesoría, así que despliegues
solapados no aplican dos veces.

## 8. Web Push

Web Push forma parte del núcleo. `install.sh` genera las claves automáticamente;
también puede hacerse a mano:

```bash
pnpm vapid:generate             # copiar el resultado en .env
```

La clave privada es un **secreto**: no compartirla ni incluirla en imágenes.
Requiere HTTPS (lo aporta Cloudflare) y, en iOS, añadir la PWA a la pantalla de
inicio. En **Ajustes** se activa el push por dispositivo y se envía una
**notificación de prueba**.

## 9. Copias de seguridad y restauración

Respaldar **juntos** PostgreSQL y el volumen de fotos:

```bash
./deploy/backup.sh                      # ./backups/<fecha>/{db.dump,photos.tar.gz,manifest.json}
BACKUP_DIR=/mnt/backups ./deploy/backup.sh
```

- Solo necesita Docker (no Node): `pg_dump --format=custom` y archivo del volumen.
- `manifest.json` incluye tamaño y `sha256` de cada archivo.

Restauración (pide confirmación; **destructiva**):

```bash
./deploy/restore.sh backups/<fecha>
docker compose restart app
```

Probar siempre primero en un entorno separado. Tras restaurar, verificar el
recuento de fotos, las miniaturas, el historial de entregas y las descargas.

### Programar respaldo y limpieza (cron)

```cron
# Respaldo diario a las 03:00 y limpieza a las 04:00
0 3 * * * cd /opt/lumen && ./deploy/backup.sh >>/var/log/lumen-backup.log 2>&1
0 4 * * * cd /opt/lumen && docker compose exec -T app node scripts/cleanup.mjs >>/var/log/lumen-cleanup.log 2>&1
```

La limpieza también purga las **suscripciones push revocadas** con más de 30 días
de antigüedad.

## 10. Mantenimiento y observabilidad

```bash
docker compose exec app node scripts/cleanup.mjs   # temporales, huérfanos y push revocado
docker compose logs -f app
docker compose exec app node -e "fetch('http://127.0.0.1:3000/health').then(r => console.log(r.status))"
```

- Nunca borra archivos referenciados por entregas.
- `/health` responde `200` solo si la base responde y las migraciones están
  aplicadas; `503` en caso contrario.
- Registra fallos de conversión, limpieza, errores de BD, tiempos de ZIP y errores
  push.

## 11. Seguridad

- **Rate limiting** en login, setup y subidas (en memoria; por instancia).
- **CSRF/Origin** verificado por SvelteKit; no desactivarlo.
- Sesiones en cookies `HttpOnly`/`Secure`/`SameSite`; nunca en `localStorage`.
- Autorización de ámbito en cada lectura, descarga, búsqueda y ZIP.
- Validación de archivos por **contenido** (JPEG/PNG/WebP) y límites de
  tamaño/píxeles.
- **PostgreSQL no se publica**; la app escucha solo en `127.0.0.1`.
- Contenedores como usuario sin privilegios, `cap_drop: ALL` y
  `no-new-privileges`.
- Mantener la imagen actualizada y revisar dependencias periódicamente.

## 12. Resolución de problemas

| Síntoma                                     | Causa probable / solución                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `docker compose up` falla al traer la imagen | No hay imagen publicada: usar `docker compose pull` o `up --build`.                       |
| La app no responde                          | `docker compose logs app`; ¿`db` sana y `migrate` terminó?                                |
| El dominio no abre                          | Revisar la ruta del túnel (`http://127.0.0.1:8090`) y que `cloudflared` esté activo.      |
| `403` en formularios                        | `X-Forwarded-Proto` no llega como `https`; revisar la ruta del túnel.                     |
| `500` «Address header…»                     | Falta `CF-Connecting-IP`: la petición no pasó por Cloudflare.                             |
| `413` al subir fotos                        | Límite de Cloudflare (100 MB) o `BODY_SIZE_LIMIT` (30 MB).                                |
| `524` al exportar                           | Cloudflare corta a los 100 s; usar un subdominio sin proxy o dividir la exportación.      |
| La PWA no se actualiza                      | `/sw.js` cacheado: añadir una regla de bypass en Cloudflare.                              |
| Push no llega                               | Revisar claves VAPID y el sujeto `mailto:`; en iOS hace falta instalar la PWA.            |
