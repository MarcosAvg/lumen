#!/usr/bin/env bash
#
# Lumen · instalador de autoalojamiento.
#
# Crea `.env` con secretos aleatorios (si no existe), levanta Docker Compose y
# espera a que la app responda. Pensado para que un `docker compose up -d`
# también funcione sin argumentos; este script añade secretos y HTTPS.
#
# Uso:
#   ./install.sh                                   # local: http://localhost
#   ./install.sh --domain lumen.midominio.com      # HTTPS automático
#   ./install.sh --build                           # compila la imagen en local
#   ./install.sh --http-port 8080                  # cambia el puerto HTTP público
#   ./install.sh --vapid                           # genera y añade claves Web Push
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DOMAIN=""
BUILD=0
VAPID=0
HTTP_PORT_OVERRIDE=""
HTTPS_PORT_OVERRIDE=""

usage() {
	cat <<'EOF'
Uso: ./install.sh [opciones]

  --domain <dominio>    Dominio público; activa HTTPS automático (Let's Encrypt).
  --build               Compila la imagen en local en lugar de usar GHCR.
  --http-port <puerto>  Puerto HTTP público (por defecto 80).
  --https-port <puerto> Puerto HTTPS público (por defecto 443).
  --vapid               Genera claves Web Push y las añade a `.env`.
  -h, --help            Muestra esta ayuda.
EOF
}

random_secret() {
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -hex 24
	else
		LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 48
	fi
}

while [ $# -gt 0 ]; do
	case "$1" in
		--domain) DOMAIN="${2:?falta el dominio}"; shift 2 ;;
		--build) BUILD=1; shift ;;
		--http-port) HTTP_PORT_OVERRIDE="${2:?falta el puerto}"; shift 2 ;;
		--https-port) HTTPS_PORT_OVERRIDE="${2:?falta el puerto}"; shift 2 ;;
		--vapid) VAPID=1; shift ;;
		-h | --help) usage; exit 0 ;;
		*) echo "Opción desconocida: $1" >&2; usage; exit 1 ;;
	esac
done

if ! command -v docker >/dev/null 2>&1; then
	echo "Docker no está instalado. Instálalo antes de continuar." >&2
	exit 1
fi

# --- 1. `.env` con secretos aleatorios (solo si no existe) ---------------------
if [ ! -f .env ]; then
	{
		echo "# Generado por install.sh el $(date -u +%Y-%m-%dT%H:%M:%SZ)"
		echo "POSTGRES_USER=lumen"
		echo "POSTGRES_PASSWORD=$(random_secret)"
		echo "POSTGRES_DB=lumen"
		echo "LUMEN_IMAGE=ghcr.io/marcosavg/lumen"
		echo "LUMEN_TAG=latest"
		echo "TZ=${TZ:-UTC}"
		[ -n "$HTTP_PORT_OVERRIDE" ] && echo "HTTP_PORT=${HTTP_PORT_OVERRIDE}"
		[ -n "$HTTPS_PORT_OVERRIDE" ] && echo "HTTPS_PORT=${HTTPS_PORT_OVERRIDE}"
		[ -n "$DOMAIN" ] && echo "DOMAIN=${DOMAIN}"
	} >.env
	echo "→ .env creado con contraseña aleatoria."
else
	echo "→ Usando el .env existente."
	[ -n "$DOMAIN" ] && echo "→ --domain ignorado: ya existe .env (edítalo a mano si hace falta)."
fi

# --- 2. Compose: override de build --------------------------------------------
COMPOSE=(docker compose -f compose.yaml)
[ "$BUILD" = 1 ] && COMPOSE+=(-f compose.build.yaml)

# Valores efectivos (--flag > entorno > .env > por defecto) para mensajes y comprobaciones.
env_value() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n1; }
HTTP_PORT="${HTTP_PORT_OVERRIDE:-${HTTP_PORT:-$(env_value HTTP_PORT)}}"
HTTP_PORT="${HTTP_PORT:-80}"
EFFECTIVE_DOMAIN="${DOMAIN:-$(env_value DOMAIN)}"

# --- 3. VAPID opcional ---------------------------------------------------------
if [ "$VAPID" = 1 ] && ! grep -q '^VAPID_PRIVATE_KEY=..' .env 2>/dev/null; then
	echo "→ Generando claves Web Push (VAPID)…"
	if keys="$("${COMPOSE[@]}" run --rm --no-deps --entrypoint node app scripts/generate-vapid.mjs 2>/dev/null)"; then
		printf '%s\n' "$keys" | sed -n 's/^\(VAPID_[A-Z_]*=.*\)$/\1/p' >>.env
		echo "→ Claves VAPID añadidas a .env."
	else
		echo "→ No se pudieron generar las claves VAPID; se omite (push deshabilitado)." >&2
	fi
fi

# --- 4. Arranque ---------------------------------------------------------------
echo "→ Levantando Lumen…"
"${COMPOSE[@]}" up -d $([ "$BUILD" = 1 ] && echo --build)

# --- 5. Espera a /health (dentro del contenedor) ------------------------------
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

# Comprobación opcional a través de Caddy (ingreso real).
if [ "$ready" = 1 ] && command -v curl >/dev/null 2>&1; then
	if ! curl -fsS -H "Host: localhost" "http://127.0.0.1:${HTTP_PORT}/health" >/dev/null 2>&1; then
		echo "⚠ Caddy aún no responde en el puerto ${HTTP_PORT}; revisa: docker compose logs -f caddy"
	fi
fi

if [ -n "$EFFECTIVE_DOMAIN" ]; then
	case "$EFFECTIVE_DOMAIN" in
		http://* | https://*) echo "  URL: ${EFFECTIVE_DOMAIN}" ;;
		*) echo "  URL pública: https://${EFFECTIVE_DOMAIN}  (Caddy emite el certificado; puede tardar unos segundos)" ;;
	esac
else
	if [ "$HTTP_PORT" = 80 ]; then
		echo "  URL local: http://localhost"
	else
		echo "  URL local: http://localhost:${HTTP_PORT}"
	fi
	echo "  Para HTTPS y Web Push: edita DOMAIN en .env (p. ej. DOMAIN=lumen.midominio.com) y ejecuta"
	echo "  docker compose up -d"
fi
echo
echo "Primer arranque: abre la app y completa «Configurar Lumen» para crear el administrador."
