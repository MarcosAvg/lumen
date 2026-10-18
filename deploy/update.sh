#!/usr/bin/env bash
#
# Actualización segura de Lumen: respaldo, pull, migración explícita y recreación
# de la app. No confía en que `docker compose up -d` reutilice un runner de
# migraciones antiguo.
#
# Uso:
#   ./deploy/update.sh              # respaldo + actualización
#   ./deploy/update.sh --no-backup  # sin respaldo (no recomendado)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKUP=1
case "${1:-}" in
	--no-backup) BACKUP=0 ;;
	-h | --help)
		echo "Uso: $0 [--no-backup]"
		exit 0
		;;
	'') ;;
	*)
		echo "Opción desconocida: $1" >&2
		exit 1
		;;
esac

if [ ! -f .env ]; then
	echo "Falta .env. Usa primero ./install.sh." >&2
	exit 1
fi

COMPOSE=(docker compose -f compose.yaml)

echo "→ Asegurando PostgreSQL…"
"${COMPOSE[@]}" up -d db

if [ "$BACKUP" = 1 ]; then
	if "${COMPOSE[@]}" ps --status running --services app | grep -qx app; then
		echo "→ Respaldando base de datos y fotos…"
		./deploy/backup.sh
	else
		echo "⚠ La app no está en marcha; se omite el respaldo." >&2
		echo "  Para actualizar sin respaldo: ./deploy/update.sh --no-backup" >&2
		exit 1
	fi
fi

echo "→ Descargando la imagen publicada…"
"${COMPOSE[@]}" pull

echo "→ Aplicando migraciones con la imagen nueva…"
# Se ejecuta el runner desde la imagen de `app` para garantizar que incluye el
# journal y los SQL de esta versión, aunque el contenedor `migrate` fuera antiguo.
"${COMPOSE[@]}" run --rm --no-deps --entrypoint node app scripts/migrate.mjs

echo "→ Recreando la app…"
"${COMPOSE[@]}" up -d --force-recreate app

echo "→ Esperando a que /health confirme base y migraciones…"
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

if [ "$ready" != 1 ]; then
	echo "✘ La app no supera /health. Últimos logs:" >&2
	"${COMPOSE[@]}" logs --tail=100 app >&2 || true
	exit 1
fi

echo "✔ Lumen actualizado y saludable."
