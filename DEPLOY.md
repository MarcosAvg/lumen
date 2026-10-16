# Despliegue de Lumen

Guía corta para autoalojar Lumen con Docker Compose. El detalle operativo
(seguridad, copias de seguridad, mantenimiento y resolución de problemas) está en
[`docs/deployment.md`](docs/deployment.md).

## Requisitos

- Docker + Docker Compose v2.
- Un **proxy inverso** con TLS (Nginx, Traefik, Caddy…) o el Caddy opcional (abajo).
- Un dominio si vas a publicarlo. La imagen publicada es **amd64 y arm64**.

## Puesta en marcha

```bash
git clone https://github.com/MarcosAvg/lumen.git
cd lumen
./install.sh                 # .env con secretos + arranca la app
```

La app queda en **`http://127.0.0.1:8090`** (configurable con `APP_PORT`), lista
para tu proxy. Después abre `https://tu-dominio` y completa **Configurar Lumen**.

Equivalentes sin script:

```bash
docker compose pull && docker compose up -d   # imagen GHCR (por defecto)
docker compose up -d --build                   # compila en local
```

Detener sin perder datos: `docker compose down` (`down -v` borra los volúmenes).

## Proxy inverso

Reenvía a `127.0.0.1:8090` enviando **siempre** `Host`, `X-Forwarded-Proto` y
`X-Forwarded-For` (la app los exige; sin ellos el login da 403/500).

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

Con **Traefik** (u otro proxy en contenedor) apunta a `http://app:3000` en la red
de Compose, o a `127.0.0.1:8090` si corre en el host. Con un CDN delante ajusta
`XFF_DEPTH`.

**¿Sin proxy?** Usa el Caddy incluido (HTTPS automático):

```bash
docker compose --profile caddy up -d                     # HTTP en el puerto 80
DOMAIN=lumen.midominio.com docker compose --profile caddy up -d   # HTTPS (Let's Encrypt)
```

## Actualizar y respaldar

```bash
docker compose pull && docker compose up -d    # actualizar
./deploy/backup.sh                             # BD + fotos en ./backups/<fecha>
./deploy/restore.sh backups/<fecha>            # restauración (destructiva)
```

## Notas

- **PostgreSQL no se publica**; la app solo escucha en `127.0.0.1`.
- El **origen público se deriva de la petición**: la misma imagen sirve para
  cualquier dominio sin reconstruir.
- Web Push requiere HTTPS y claves VAPID (`./install.sh --vapid`); la bandeja
  interna funciona igual sin ellas.
