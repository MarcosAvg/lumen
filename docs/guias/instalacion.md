# Instalación y primer arranque

> **Audiencia:** operación e instalación.
> **Estado:** vigente.
> **Fuente canónica de:** requisitos, Compose, Cloudflare Tunnel e instalación
> inicial.

## 1. Requisitos

- Docker + Docker Compose v2.
- Un dominio gestionado en Cloudflare.
- `cloudflared` en Docker, unido a la red `proxy`, o como servicio del host.
- Almacenamiento persistente para PostgreSQL y para las fotografías.
- 2 GB de RAM como mínimo razonable para PostgreSQL y el procesado de imágenes.
- No se requiere Node en el servidor.

## 2. Arranque rápido

```bash
git clone https://github.com/MarcosAvg/lumen.git
cd lumen
./install.sh --email tu@correo
```

`install.sh` es opcional. Genera `.env`, la contraseña de PostgreSQL y las claves
VAPID, comprueba la red `proxy`, levanta Compose y espera a que `/health`
responda.

Con un `.env` propio:

```bash
docker compose pull
docker compose up -d
```

La aplicación queda en la red externa `proxy` como **`lumen:3000`** y no publica
puertos en el host.

Detener sin perder datos:

```bash
docker compose down
```

`docker compose down -v` elimina también los volúmenes persistentes.

## 3. Servicios de Compose

| Servicio | Función |
|---|---|
| `db` | PostgreSQL 17 con volumen `postgres_data`; no se publica |
| `migrate` | Aplica las migraciones Drizzle una vez y termina |
| `app` | Lumen; en la red `proxy` como `lumen:3000`; sin puertos de host |

Orden garantizado: `db` sana → `migrate` termina → `app` arranca.

La configuración por defecto incluye rotación de logs (10 MB × 3 por servicio) y
no impone límites de CPU/RAM: Docker usa los recursos del host.

## 4. Almacenamiento

Por defecto se usan volúmenes nombrados (`postgres_data` y `lumen_photos`).
Docker los gestiona e inicializa con el propietario de la imagen.

Para guardar los datos en una ruta del host:

```yaml
services:
  db:
    volumes:
      - /opt/appdata/lumen/db:/var/lib/postgresql/data
  app:
    volumes:
      - /opt/appdata/lumen/data:/data/photos
```

Eliminar del compose los volúmenes nombrados que se sustituyen. Antes de
arrancar:

```bash
sudo mkdir -p /opt/appdata/lumen/db /opt/appdata/lumen/data
sudo chown -R 70:70 /opt/appdata/lumen/db       # PostgreSQL alpine
sudo chown -R 1000:1000 /opt/appdata/lumen/data # usuario node de la app
```

- La app corre como `node` (uid 1000); PostgreSQL alpine como uid 70.
- Docker no ajusta el propietario de un bind mount. Si el directorio no existe,
  lo crea como `root` y la app no podrá escribir.
- Para migrar desde volúmenes nombrados, copiar el contenido de
  `/var/lib/docker/volumes/lumen_postgres_data/_data` y
  `lumen_lumen_photos/_data` a las nuevas rutas y repetir el `chown`.
- Los scripts de `deploy/` siguen funcionando porque usan `docker compose exec`.

`network_mode: host` no sustituye a este esquema ni resuelve permisos. Para
publicar el dominio se mantiene la red `proxy` y el túnel a `lumen:3000`.

## 5. Publicación con Cloudflare Tunnel

`cloudflared` abre una conexión saliente a Cloudflare; no hay IP de origen
expuesta ni puertos entrantes.

```text
Internet → Cloudflare (TLS + WAF) → cloudflared → lumen:3000
```

La red `proxy` debe existir:

```bash
docker network create proxy
```

En **Zero Trust → Tunnels → Public Hostname**:

| Campo | Valor |
|---|---|
| Subdominio | `lumen` (o el elegido) |
| Dominio | `midominio.com` |
| Servicio | `http://lumen:3000` |

Notas:

- El puerto es el interno del contenedor (3000), no un puerto del host.
- No hay que abrir puertos en el firewall.
- Cloudflare entrega `X-Forwarded-Proto: https` y `CF-Connecting-IP`; la app las
  usa para derivar el origen y la IP real.
- Desactivar Rocket Loader y Auto Minify: rompen la hidratación y la CSP.
- Añadir bypass de caché para `/api/*`, `/login`, `/setup`, `/health`, `/sw.js`
  y `/manifest.webmanifest`.
- Cloudflare corta a los 100 s en planes Free/Pro. Las exportaciones grandes
  pueden dar `524`.
- `sw.js` es el punto más sensible de la PWA: si se cachea, los clientes quedan
  en una versión antigua.

### cloudflared en el host

El compose base no publica puertos. Añadir un `compose.override.yaml` local
(ignorado por git):

```yaml
services:
  app:
    ports:
      - '127.0.0.1:8090:3000'
```

y apuntar el túnel a `http://127.0.0.1:8090`.

### Proxy inverso alternativo

Si se usa un proxy propio (Nginx Proxy Manager, Traefik, etc.), debe unirse a la
red `proxy` y reenviar a `lumen:3000`; si corre en el host, añadir el override
con `ports`. Debe enviar `Host`, `X-Forwarded-Proto` y `X-Forwarded-For`. Si no
es Cloudflare, ajustar `ADDRESS_HEADER` y `XFF_DEPTH` según el número de saltos.
No es la configuración por defecto.

## 6. Imagen publicada

El workflow `release.yml` publica `ghcr.io/marcosavg/lumen:<tag>` al etiquetar y
actualiza `:latest`. La imagen es multi-arquitectura (`linux/amd64` y
`linux/arm64`).

```bash
docker compose pull && docker compose up -d
```

Para fijar una versión, definir `LUMEN_TAG` en `.env`.

**Compilar en local:**

```bash
./install.sh --build
# o bien
docker compose up -d --build
```

## 7. Primer arranque

1. Publicar el dominio con el túnel.
2. Abrir el dominio y completar **Configurar Lumen**.
3. Crear la cuenta administradora.
4. Crear técnicos y supervisores, contratos y el primer servicio.
5. Verificar `/health` y activar las notificaciones push desde Ajustes.

La configuración de variables está en
[`../referencia/variables-entorno.md`](../referencia/variables-entorno.md).
La actualización, el respaldo y los problemas frecuentes están en
[`operacion.md`](operacion.md).
