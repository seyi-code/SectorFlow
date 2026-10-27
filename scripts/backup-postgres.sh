#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"
URL="${DATABASE_URL:-postgresql://sectorflow:sectorflow_dev@localhost:5433/sectorflow}"
FILE="$OUT_DIR/sectorflow-$STAMP.sql.gz"
pg_dump "$URL" | gzip > "$FILE"
find "$OUT_DIR" -name 'sectorflow-*.sql.gz' -mtime +14 -delete 2>/dev/null || true
echo "Done: $FILE"
