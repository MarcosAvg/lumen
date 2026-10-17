# Variables de entorno y configuración

> **Audiencia:** operación y desarrollo.
> **Estado:** vigente.
> **Fuente canónica de:** `.env`, variables fijas de Compose y valores por
> defecto.

La configuración de producción vive en `.env` (plantilla en `.env.example`).
`install.sh` genera la contraseña de PostgreSQL y las claves VAPID. En desarrollo
se puede usar el mismo archivo con `DATABASE_URL` y `TEST_DATABASE_URL`
descomentadas.

## 1. Variables de `.env`

| Variable | Obligatoria | Uso |
|---|---:|---|
| `POSTGRES_PASSWORD` | Sí | Contraseña de PostgreSQL. Evitar `@ : / %`, porque se interpola en la URL |
| `VAPID_PUBLIC_KEY` | Para Web Push | Clave pública VAPID |
| `VAPID_PRIVATE_KEY` | Para Web Push | Clave privada VAPID; es un secreto |
| `VAPID_SUBJECT` | Para Web Push | Contacto del operador, normalmente `mailto:…` |
| `TZ` | No | Zona de presentación; por defecto `UTC` |
| `LUMEN_TAG` | No | Etiqueta de imagen; por defecto `latest` |

La aplicación arranca sin claves VAPID: en ese caso no hay push, pero la bandeja
interna sigue funcionando. Para producción se recomienda generarlas con
`install.sh` o `pnpm vapid:generate`.

## 2. Variables fijas de Compose

Estas variables las define `compose.yaml` para el contenedor de la app:

| Variable | Valor por defecto | Uso |
|---|---|---|
| `DATABASE_URL` | Construida por Compose con `POSTGRES_PASSWORD` | Conexión interna a PostgreSQL |
| `PHOTO_STORAGE_PATH` | `/data/photos` | Ruta del volumen de fotos y miniaturas |
| `BODY_SIZE_LIMIT` | `30M` | Límite del cuerpo HTTP de adapter-node; debe superar `MAX_UPLOAD_BYTES` |
| `PROTOCOL_HEADER` | `x-forwarded-proto` | Protocolo confiado del proxy o túnel |
| `ADDRESS_HEADER` | `cf-connecting-ip` | IP real entregada por Cloudflare |

Para cambiar `BODY_SIZE_LIMIT` o las cabeceras hay que editar el servicio `app`
en `compose.yaml` (o un override local). No se leen desde `.env` en la
configuración por defecto.

## 3. Variables avanzadas de la aplicación

Tienen valores por defecto en `src/env.ts` y no se exponen en `.env.example`.
Se pueden definir en el entorno del contenedor si hace falta ajustarlas:

| Variable | Valor por defecto | Uso |
|---|---:|---|
| `MAX_UPLOAD_BYTES` | 25 MiB | Tamaño máximo por archivo |
| `IMAGE_MAX_DIMENSION` | 2560 px | Lado mayor de la foto normalizada |
| `IMAGE_THUMB_DIMENSION` | 400 px | Lado mayor de la miniatura |
| `ORIGIN` | — | Solo para build/prerender y pruebas; el origen público se deriva en runtime |

`ORIGIN` no se hornea como origen público. En producción la app usa
`PROTOCOL_HEADER` y la petición para construir URLs absolutas y validar CSRF.

## 4. Desarrollo

| Variable | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL local, por ejemplo `postgres://lumen:...@127.0.0.1:5432/lumen` |
| `TEST_DATABASE_URL` | Base para integración y E2E; por defecto `lumen_test` |

Los contenedores de producción no usan estas dos variables de desarrollo.
Véase [`../desarrollo/setup.md`](../desarrollo/setup.md).
