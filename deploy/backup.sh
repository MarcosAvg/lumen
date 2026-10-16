#!/usr/bin/env bash
#
# Copia de seguridad de Lumen usando solo Docker (no requiere Node en el host).
# Crea `backups/<fecha>/{db.dump,photos.tar.gz,manifest.json}`.
#
# Uso:
#   ./deploy/backup.sh
#   BACKUP_DIR=/mnt/backups ./deploy/backup.sh
#
# Respalda **juntos** la base y el volumen de fotos (ver docs/deployment.md).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=./lib.sh
source "$ROOT/deploy/lib.sh"

POSTGRES_USER="${POSTGRES_USER:-$(lumen_env_value POSTGRES_USER)}"
POSTGRES_USER="${POSTGRES_USER:-lumen}"
POSTGRES_DB="${POSTGRES_DB:-$(lumen_env_value POSTGRES_DB)}"
POSTGRES_DB="${POSTGRES_DB:-lumen}"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/$STAMP"
mkdir -p "$OUT"

echo "→ Base de datos…"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner \
	>"$OUT/db.dump"

echo "→ Fotografías…"
docker compose exec -T app tar -C /data/photos -czf - . >"$OUT/photos.tar.gz"

cat >"$OUT/manifest.json" <<EOF
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database": "$POSTGRES_DB",
  "files": {
    "db.dump": { "bytes": $(wc -c <"$OUT/db.dump"), "sha256": "$(lumen_sha256 "$OUT/db.dump")" },
    "photos.tar.gz": { "bytes": $(wc -c <"$OUT/photos.tar.gz"), "sha256": "$(lumen_sha256 "$OUT/photos.tar.gz")" }
  }
}
EOF

echo "✔ Copia creada en $OUT"
echo "  Recuerda: conserva varias generaciones y prueba una restauración periódicamente."
