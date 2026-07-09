#!/usr/bin/env bash
# gen-env.sh — Generate sub-project .env files from the root .env.
#
# Called automatically by update-system.sh before building containers.
# Never needs to be run manually, but is safe to run standalone.
#
# Usage:  ./scripts/gen-env.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

load_env

log_info "Generating sub-project .env files from root .env…"

# ── ERP .env ──────────────────────────────────────────────────────────────────
# ERP uses DATABASE_URL (connection string) + its own JWT_SECRET.
# DB_HOST is host.docker.internal so the ERP container can reach the
# host-exposed PostgreSQL port (db container publishes 5432 → host).
cat > "${ERP_DIR}/.env" <<EOF
# Auto-generated from root .env by scripts/gen-env.sh — do not edit manually.
# Re-run:  ./scripts/update-system.sh   (or  ./scripts/gen-env.sh)
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@host.docker.internal:5432/${POSTGRES_DB}
JWT_SECRET=${JWT_SECRET}
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
NODE_ENV=production
BOT_RELAY_URL=http://host.docker.internal:8090
BOT_RELAY_AUTH_TOKEN=${BOT_RELAY_AUTH_TOKEN}
EOF

log_success "  erp/.env"

# ── Website .env ───────────────────────────────────────────────────────────────
# Website uses individual DB vars (not DATABASE_URL).
# DB_HOST is host.docker.internal for the same reason as ERP above.
cat > "${WEBSITE_DIR}/.env" <<EOF
# Auto-generated from root .env by scripts/gen-env.sh — do not edit manually.
# Re-run:  ./scripts/update-system.sh   (or  ./scripts/gen-env.sh)
DB_HOST=host.docker.internal
DB_PORT=${POSTGRES_PORT}
DB_NAME=${POSTGRES_DB}
DB_USER=${POSTGRES_USER}
DB_PASSWORD=${POSTGRES_PASSWORD}
MEMBER_JWT_SECRET=${MEMBER_JWT_SECRET}
EOF

log_success "  website/.env"
