#!/usr/bin/env bash
#
# Lumen · instalador de autoalojamiento.
#
# Genera `.env` (contraseña y claves Web Push), levanta Docker Compose y espera a
# que la app responda. La app queda en `127.0.0.1:8090`, para publicarla con
# Cloudflare Tunnel (ver docs/deployment.md).
#
# Uso:
#   ./install.sh                     # instala con la imagen publicada
#   ./install.sh --build             # compila la imagen en local
#   ./install.sh --email tu@correo   # sujeto VAPID (por defecto admin@example.com)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
# shellcheck source=./deploy/lib.sh
source "$ROOT/deploy/lib.sh"

BUILD=0
EMAIL=""

usage() {
	cat <<'EOF'
Uso: ./install.sh [opciones]

  --build              Compila la imagen en local en lugar de usar GHCR.
  --email <correo>     Sujeto VAPID para Web Push (mailto:<correo>).
  -h, --help           Muestra esta ayuda.

La app queda en 127.0.0.1:8090; el dominio se publica con Cloudflare Tunnel.
EOF
}

while [ $# -gt 0 ]; do
	case "$1" in
		--build) BUILD=1; shift ;;
		--email) EMAIL="${2:?falta el correo}"; shift 2 ;;
		-h | --help) usage; exit 0 ;;
		*) echo "Opción desconocida: $1" >&2; usage; exit 1 ;;
	esac
done

command -v docker >/dev/null 2>&1 || {
	echo "Docker no está instalado. Instálalo antes de continuar." >&2
	exit 1
}

# Escribe o reemplaza una clave en `.env`.
set_env() {
	local key="$1" value="$2"
	if grep -q "^${key}=" .env; then
		sed -i "s|^${key}=.*|${key}=${value}|" .env
	else
		echo "${key}=${value}" >>.env
	fi
}

# --- 1. `.env` con secretos aleatorios (solo si no existe) ---------------------
if [ ! -f .env ]; then
	{
		echo "# Generado por install.sh el $(date -u +%Y-%m-%dT%H:%M:%SZ)"
		echo "POSTGRES_PASSWORD=$(lumen_random_secret)"
		echo "TZ=${TZ:-UTC}"
		echo "LUMEN_TAG=latest"
	} >.env
	echo "→ .env creado con contraseña aleatoria."
else
	echo "→ Usando el .env existente."
fi

# Sujeto VAPID (Web Push). Obligatorio en la práctica: algunos servicios push lo exigen.
if [ -n "$EMAIL" ]; then
	set_env VAPID_SUBJECT "mailto:${EMAIL}"
elif ! grep -q '^VAPID_SUBJECT=' .env; then
	set_env VAPID_SUBJECT "mailto:admin@example.com"
fi

COMPOSE=(docker compose -f compose.yaml)

# Si `cloudflared` (o NPM) corre en una red Docker, se añade el override.
PROXY_NETWORK="${PROXY_NETWORK:-$(lumen_env_value PROXY_NETWORK)}"
[ -n "$PROXY_NETWORK" ] && COMPOSE+=(-f compose.proxy.yaml)

APP_PORT="${APP_PORT:-$(lumen_env_value APP_PORT)}"
APP_PORT="${APP_PORT:-8090}"

# --- 2. Claves Web Push (push es parte del núcleo) ----------------------------
if ! grep -q '^VAPID_PRIVATE_KEY=..' .env 2>/dev/null; then
	echo "→ Generando claves Web Push (VAPID)…"
	if keys="$("${COMPOSE[@]}" run --rm --no-deps $([ "$BUILD" = 1 ] && echo --build) \
		--entrypoint node app scripts/generate-vapid.mjs 2>/dev/null)"; then
		printf '%s\n' "$keys" |
			sed -n 's/^\(VAPID_\(PUBLIC\|PRIVATE\)_KEY=.*\)$/\1/p' >>.env
		echo "→ Claves VAPID añadidas a .env."
	else
		echo "⚠ No se pudieron generar las claves VAPID; revisa la imagen o ejecuta el generador a mano." >&2
	fi
fi

# --- 3. Arranque ---------------------------------------------------------------
echo "→ Levantando Lumen…"
"${COMPOSE[@]}" up -d $([ "$BUILD" = 1 ] && echo --build)

# --- 4. Espera a /health (dentro del contenedor) -------------------------------
echo "→ Esperando a que la app responda…"
ready=0
for _ in $(seq 1 60); do
	if "${COMPOSE[@]}" exec -T app node -e \
		"fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
		>/dev/null 2>&1; then
		ready=1
		break
	fi
	sleep 2
done

echo
if [ "$ready" = 1 ]; then
	echo "✔ Lumen está en marcha."
else
	echo "⚠ La app aún no responde. Revisa: docker compose logs -f app"
fi

if [ -n "$PROXY_NETWORK" ]; then
	echo "  Red «${PROXY_NETWORK}»: el túnel debe apuntar a http://lumen:3000"
else
	echo "  App escuchando en http://127.0.0.1:${APP_PORT}"
	echo "  Publica el dominio con Cloudflare Tunnel → http://127.0.0.1:${APP_PORT}"
fi
echo "  Guía: docs/deployment.md"
echo
echo "Primer arranque: abre el dominio y completa «Configurar Lumen» para crear el administrador."
