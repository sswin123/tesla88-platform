#!/usr/bin/env bash
# =============================================================================
# migrate-receipt-storage.sh
#
# Migrates Deposit Receipt files from website_uploads volume to erp_uploads
# volume so that ERP MediaService can read them.
#
# Background:
#   Old upload path: website_uploads:/data/uploads/receipts/<uuid>.<ext>
#   ERP read path:   erp_uploads:/uploads/media/receipts/<uuid>.<ext>
#
# This script copies files between the two volumes without touching the DB —
# storage_key values remain unchanged.
#
# Usage:
#   bash scripts/migrate-receipt-storage.sh
#   bash scripts/migrate-receipt-storage.sh --dry-run
#   COMPOSE_FILE=docker-compose.production.yml bash scripts/migrate-receipt-storage.sh
#
# Idempotent: already-migrated files are skipped (cp -n / no-clobber).
# Safe:       source volume is mounted read-only.
# Resumable:  re-running after partial failure continues where it left off.
# =============================================================================

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
  esac
done

# Ask Docker Compose for the canonical project name (reads the YAML, no containers needed).
# Falls back to lowercased directory name if compose config is unavailable.
PROJECT_NAME=$(docker compose -f "$COMPOSE_FILE" config 2>/dev/null | grep '^name:' | awk '{print $2}')
if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]')
fi

echo "============================================"
echo " Deposit Receipt Storage Migration"
echo "============================================"
echo " Compose file : $COMPOSE_FILE"
echo " Project name : $PROJECT_NAME"
echo " Dry run      : $DRY_RUN"
echo ""

# ── Step 1: Confirm volumes exist ────────────────────────────────────────────
WEBSITE_VOLUME="${PROJECT_NAME}_website_uploads"
ERP_VOLUME="${PROJECT_NAME}_erp_uploads"

echo "[step 1] Checking Docker volumes..."

if ! docker volume inspect "$WEBSITE_VOLUME" &>/dev/null; then
  echo "ERROR: Volume '$WEBSITE_VOLUME' not found."
  echo "       Check your project name or run: docker volume ls"
  exit 1
fi

if ! docker volume inspect "$ERP_VOLUME" &>/dev/null; then
  echo "ERROR: Volume '$ERP_VOLUME' not found."
  exit 1
fi

echo "  ✓ $WEBSITE_VOLUME"
echo "  ✓ $ERP_VOLUME"
echo ""

# ── Step 2: Count source files ───────────────────────────────────────────────
echo "[step 2] Counting source files in website_uploads:/data/uploads/receipts/ ..."

SOURCE_COUNT=$(docker run --rm \
  -v "${WEBSITE_VOLUME}:/src:ro" \
  alpine sh -c '
    if [ -d /src/receipts ] && [ "$(ls -A /src/receipts 2>/dev/null)" ]; then
      ls /src/receipts | wc -l | tr -d " "
    else
      echo 0
    fi
  ')

echo "  Source files : $SOURCE_COUNT"

if [ "$SOURCE_COUNT" -eq 0 ]; then
  echo ""
  echo "  No receipt files found in source volume. Nothing to migrate."
  echo "  This is expected if no deposits were made via the old upload path."
  exit 0
fi

echo ""

# ── Step 3: Dry run preview ──────────────────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  echo "[step 3] DRY RUN — listing files that would be migrated:"
  docker run --rm \
    -v "${WEBSITE_VOLUME}:/src:ro" \
    -v "${ERP_VOLUME}:/dst" \
    alpine sh -c '
      for f in /src/receipts/*; do
        name=$(basename "$f")
        if [ -f "/dst/receipts/$name" ]; then
          echo "  SKIP (exists) : '"''"'$name'"''"'"
        else
          echo "  COPY          : '"''"'$name'"''"'"
        fi
      done
    '
  echo ""
  echo "Dry run complete. Re-run without --dry-run to execute."
  exit 0
fi

# ── Step 4: Execute migration ─────────────────────────────────────────────────
echo "[step 4] Migrating files (source is read-only; skipping existing files)..."

RESULT=$(docker run --rm \
  -v "${WEBSITE_VOLUME}:/src:ro" \
  -v "${ERP_VOLUME}:/dst" \
  alpine sh -c '
    set -e

    SRC=/src/receipts
    DST=/dst/receipts

    if [ ! -d "$SRC" ]; then
      echo "SOURCE_COUNT=0 COPIED=0 SKIPPED=0"
      exit 0
    fi

    mkdir -p "$DST"

    COPIED=0
    SKIPPED=0
    FAILED=0

    for f in "$SRC"/*; do
      [ -f "$f" ] || continue
      name=$(basename "$f")
      dst_file="$DST/$name"
      if [ -f "$dst_file" ]; then
        SKIPPED=$((SKIPPED + 1))
      else
        if cp "$f" "$dst_file" 2>/dev/null; then
          COPIED=$((COPIED + 1))
        else
          echo "WARN: failed to copy $name" >&2
          FAILED=$((FAILED + 1))
        fi
      fi
    done

    echo "COPIED=$COPIED SKIPPED=$SKIPPED FAILED=$FAILED"
  ')

COPIED=$(echo "$RESULT"  | grep -oP 'COPIED=\K[0-9]+')
SKIPPED=$(echo "$RESULT" | grep -oP 'SKIPPED=\K[0-9]+')
FAILED=$(echo "$RESULT"  | grep -oP 'FAILED=\K[0-9]+')

echo ""
echo "  Copied  : $COPIED"
echo "  Skipped : $SKIPPED (already existed)"
echo "  Failed  : $FAILED"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo "WARNING: $FAILED file(s) failed to copy. Re-run to retry."
  exit 1
fi

# ── Step 5: Verify ────────────────────────────────────────────────────────────
echo "[step 5] Verifying destination..."

DEST_COUNT=$(docker run --rm \
  -v "${ERP_VOLUME}:/dst:ro" \
  alpine sh -c '
    if [ -d /dst/receipts ]; then
      ls /dst/receipts | wc -l | tr -d " "
    else
      echo 0
    fi
  ')

echo "  Files in erp_uploads/receipts : $DEST_COUNT"
echo ""

# ── Step 6: SQL verification query ───────────────────────────────────────────
echo "[step 6] Run this SQL to verify affected deposit records:"
echo ""
echo "  SELECT"
echo "    dr.id AS deposit_id,"
echo "    dr.receipt_media_id,"
echo "    ml.storage_key,"
echo "    ml.is_active,"
echo "    ml.deleted_at"
echo "  FROM deposit_requests dr"
echo "  JOIN media_library ml ON ml.id = dr.receipt_media_id"
echo "  WHERE dr.receipt_media_id IS NOT NULL"
echo "  ORDER BY dr.id;"
echo ""

echo "============================================"
echo " Migration COMPLETE"
echo " Old files remain in website_uploads (safe)"
echo " ERP can now read all migrated receipts"
echo "============================================"
