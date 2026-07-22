#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# verify-staging.sh — Phase G4 Staging Health Verification
#
# Checks the staging environment is ready to receive 918KISS callbacks.
#
# Usage (run on VPS or via docker exec):
#   ./scripts/verify-staging.sh
#   ERP_URL=https://erp.apidemo.club ./scripts/verify-staging.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more critical checks failed
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
ERP_URL="${ERP_URL:-http://erp:3000}"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-member_bot}"
DB_USER="${POSTGRES_USER:-postgres}"
PGPASSWORD="${POSTGRES_PASSWORD:-}"
export PGPASSWORD

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
NC='\033[0m'

PASS=0; FAIL=0; WARN=0

pass() { echo -e "${GRN}✔${NC}  $1"; ((PASS++)); }
fail() { echo -e "${RED}✘${NC}  $1"; ((FAIL++)); }
warn() { echo -e "${YLW}⚠${NC}  $1"; ((WARN++)); }

echo "════════════════════════════════════════════"
echo " Phase G4 — Staging Verification"
echo " $(date -Iseconds)"
echo "════════════════════════════════════════════"
echo ""

# ── Section 1: PostgreSQL Connectivity ────────────────────────────────────────
echo "── [1] Database ─────────────────────────────"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" -q >/dev/null 2>&1; then
    pass "PostgreSQL reachable at $DB_HOST:$DB_PORT/$DB_NAME"
else
    fail "Cannot connect to PostgreSQL at $DB_HOST:$DB_PORT/$DB_NAME"
fi

# ── Section 2: gp_* Table Existence ──────────────────────────────────────────
echo ""
echo "── [2] Gaming Platform Tables ───────────────"
REQUIRED_TABLES=(
    gp_providers gp_credentials gp_config
    gp_players gp_games gp_timepoints
    gp_health_checks gp_retry_queue
    provider_callback_idempotency
)
for tbl in "${REQUIRED_TABLES[@]}"; do
    count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$tbl'" 2>/dev/null)
    if [ "${count:-0}" = "1" ]; then
        pass "Table exists: $tbl"
    else
        fail "Table MISSING: $tbl"
    fi
done

# ── Section 3: 918KISS Provider Record ───────────────────────────────────────
echo ""
echo "── [3] 918KISS Provider Record ──────────────"
row=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT status||'|'||environment||'|'||health_status FROM gp_providers WHERE code='918KISS' LIMIT 1" 2>/dev/null)
if [ -z "$row" ]; then
    fail "918KISS row not found in gp_providers — run seeds/seed_918kiss_staging.sql"
else
    IFS='|' read -r p_status p_env p_health <<< "$row"
    [ "$p_status" = "ACTIVE" ] && pass "Provider status: ACTIVE" || warn "Provider status: $p_status (not ACTIVE)"
    pass "Environment: $p_env"
    pass "Health status: $p_health"
fi

# ── Section 4: Credentials Populated ─────────────────────────────────────────
echo ""
echo "── [4] Credentials ──────────────────────────"
REQUIRED_CREDS=(api_token operator_token md5_key secret_key encrypt_key delimiter)
for cred_key in "${REQUIRED_CREDS[@]}"; do
    val=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
        "SELECT value FROM gp_credentials g
         JOIN gp_providers p ON p.id = g.provider_id
         WHERE p.code='918KISS' AND g.key='$cred_key' LIMIT 1" 2>/dev/null)
    if [ -z "$val" ]; then
        fail "Credential missing: $cred_key"
    elif echo "$val" | grep -qi "REPLACE_WITH"; then
        warn "Credential is placeholder: $cred_key (replace before testing)"
    else
        pass "Credential set: $cred_key"
    fi
done

# ── Section 5: AES_ENCRYPTION_KEY ────────────────────────────────────────────
echo ""
echo "── [5] Environment Variables ────────────────"
if [ -n "${AES_ENCRYPTION_KEY:-}" ] && [ ${#AES_ENCRYPTION_KEY} -eq 64 ]; then
    pass "AES_ENCRYPTION_KEY present (64-char hex)"
elif [ -n "${AES_ENCRYPTION_KEY:-}" ]; then
    fail "AES_ENCRYPTION_KEY wrong length: ${#AES_ENCRYPTION_KEY} (must be 64)"
else
    fail "AES_ENCRYPTION_KEY not set"
fi

if [ -n "${GAME_SYSTEM_ADMIN_ID:-}" ]; then
    pass "GAME_SYSTEM_ADMIN_ID = $GAME_SYSTEM_ADMIN_ID"
else
    warn "GAME_SYSTEM_ADMIN_ID not set (will default to 1)"
fi

# ── Section 6: ERP Health API ────────────────────────────────────────────────
echo ""
echo "── [6] ERP Service Health ────────────────────"
health_resp=$(curl -sf --max-time 10 "$ERP_URL/api/ping" 2>/dev/null || echo "ERROR")
if [ "$health_resp" != "ERROR" ]; then
    pass "ERP /api/ping reachable at $ERP_URL"
else
    fail "ERP not reachable at $ERP_URL"
fi

# ── Section 7: Callback Endpoint Smoke Test ───────────────────────────────────
echo ""
echo "── [7] Callback Endpoint ────────────────────"
cb_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST "$ERP_URL/api/games/kiss918/callback/authenticate" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null || echo "000")
# 503 = adapter not loaded (expected if provider is DISABLED)
# 401 = adapter loaded, token rejected (expected with empty body)
# 200 = unexpected without valid token
if [ "$cb_code" = "401" ] || [ "$cb_code" = "200" ]; then
    pass "Callback endpoint responds (HTTP $cb_code — adapter loaded)"
elif [ "$cb_code" = "503" ]; then
    warn "Callback endpoint returns 503 (adapter not loaded — provider may be DISABLED or credentials missing)"
elif [ "$cb_code" = "404" ]; then
    fail "Callback route not found (HTTP 404 — route /api/games/kiss918/callback/ not registered)"
else
    warn "Callback endpoint returned HTTP $cb_code"
fi

# ── Section 8: Retry Queue Baseline ──────────────────────────────────────────
echo ""
echo "── [8] Retry Queue ──────────────────────────"
pending=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM gp_retry_queue WHERE status='PENDING'" 2>/dev/null || echo "?")
pass "Retry queue pending: $pending"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo -e " Results: ${GRN}${PASS} passed${NC}  ${YLW}${WARN} warnings${NC}  ${RED}${FAIL} failed${NC}"
echo "════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}🔴 NOT READY — Fix $FAIL failing check(s) above${NC}"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YLW}🟡 READY AFTER CONFIGURATION — $WARN warning(s) require attention${NC}"
    exit 0
else
    echo -e "${GRN}🟢 STAGING READY${NC}"
    exit 0
fi
