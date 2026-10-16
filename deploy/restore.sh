#!/usr/bin/env bash
#
# Restauración de Lumen usando solo Docker. **Destructivo**: pisa la base y las
# fotos actuales. Prueba siempre primero en un entorno separado.
#
# Uso:
#   ./deploy/restore.sh backups/20260101T030000Z
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=./lib.sh
source "$ROOT/deploy/lib.sh"

BACKUP_DIR="${1:?uso: ./deploy/restore.sh <carpeta-del-backup>}"
DUMP="$BACKUP_DIR/db.dump"
PHOTOS="$BACKUP_DIR/photos.tar.gz"

if [ ! -f "$DUMP" ] || [ ! -f "$PHOTOS" ]; then
	echo "El backup está incompleto: faltan db.dump o photos.tar.gz en $BACKUP_DIR." >&2
	exit 1
fi

POSTGRES_USER="${POSTGRES_USER:-$(lumen_env_value POSTGRES_USER)}"
POSTGRES_USER="${POSTGRES_USER:-lumen}"
POSTGRES_DB="${POSTGRES_DB:-$(lumen_env_value POSTGRES_DB)}"
POSTGRES_DB="${POSTGRES_DB:-lumen}"

echo "⚠  Esto reemplaza los datos actuales de «$POSTGRES_DB» y el volumen de fotos."
read -r -p "Escribe RESTAURAR para continuar: " confirm
[ "$confirm" = "RESTAURAR" ] || {
	echo "Cancelado."
	exit 1
}

echo "→ Restaurando base de datos…"
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
	--clean --if-exists --no-owner <"$DUMP"

echo "→ Restaurando fotografías…"
docker compose exec -T app tar -xzf - -C /data/photos <"$PHOTOS"

echo "✔ Restauración completada. Reinicia la app: docker compose restart app"
