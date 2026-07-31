#!/usr/bin/env bash
# ============================================================
# Tesla88 LiveChat Stress Test — 100 navigation cycles
# Tests: SSE connection count stability + pool exhaustion
#
# Usage:
#   chmod +x stress_test_100cycles.sh
#   ./stress_test_100cycles.sh https://apidemo.club
#
# Requires: curl, python3
# ============================================================

set -euo pipefail

BASE_URL="${1:-https://apidemo.club}"
HEALTH_URL="${BASE_URL}/api/livechat/health"
CYCLES="${2:-100}"
DELAY="0.3"

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${NC}$*${NC}"; }
ok()   { echo -e "${GRN}[OK]${NC}  $*"; }
warn() { echo -e "${YLW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }

fetch_health() {
  curl -sf --max-time 5 "$HEALTH_URL" 2>/dev/null
}

parse_sse() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['sse']['active'])" 2>/dev/null || echo "?"
}

parse_pool_wait() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pool']['waiting'])" 2>/dev/null || echo "?"
}

parse_pool_total() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pool']['total'])" 2>/dev/null || echo "?"
}

echo "============================================================"
echo "Tesla88 LiveChat Stress Test"
echo "Target : $BASE_URL"
echo "Cycles : $CYCLES"
echo "Delay  : ${DELAY}s between requests"
echo "============================================================"
echo ""

# ── Check health endpoint availability ───────────────────────
if ! fetch_health > /dev/null; then
  fail "Health endpoint unavailable: $HEALTH_URL"
  fail "Deploy website with health endpoint before running this test."
  exit 1
fi

# ── Baseline metrics ─────────────────────────────────────────
baseline=$(fetch_health)
initial_sse=$(echo "$baseline"  | parse_sse)
initial_wait=$(echo "$baseline" | parse_pool_wait)
initial_pool=$(echo "$baseline" | parse_pool_total)

log "Baseline  — SSE active: $initial_sse | Pool total: $initial_pool | Waiting: $initial_wait"
echo ""

fail_count=0
max_sse=0
max_wait=0

for i in $(seq 1 "$CYCLES"); do
  # Simulate: home page (triggers layout.tsx DB queries)
  home_status=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/" 2>/dev/null || echo "000")
  if [[ "$home_status" != "200" ]]; then
    fail "Cycle $i — GET / returned $home_status"
    ((fail_count++))
  fi

  # Simulate: chat page navigation (triggers ChatWindow useEffect)
  chat_status=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/chat" 2>/dev/null || echo "000")
  if [[ "$chat_status" != "200" && "$chat_status" != "302" && "$chat_status" != "307" ]]; then
    fail "Cycle $i — GET /chat returned $chat_status"
    ((fail_count++))
  fi

  sleep "$DELAY"

  # Check metrics every 10 cycles
  if (( i % 10 == 0 )); then
    h=$(fetch_health)
    sse=$(echo  "$h" | parse_sse)
    wait=$(echo "$h" | parse_pool_wait)
    pool=$(echo "$h" | parse_pool_total)

    [[ "$sse"  =~ ^[0-9]+$ ]] && (( sse  > max_sse  )) && max_sse=$sse
    [[ "$wait" =~ ^[0-9]+$ ]] && (( wait > max_wait )) && max_wait=$wait

    if [[ "$wait" != "?" && "$wait" -gt 0 ]]; then
      warn "Cycle $i/$CYCLES — SSE: $sse | Pool total: $pool | Waiting: $wait ← POOL PRESSURE"
    else
      ok   "Cycle $i/$CYCLES — SSE: $sse | Pool total: $pool | Waiting: $wait"
    fi
  fi
done

echo ""
echo "============================================================"
echo "Results"
echo "============================================================"

final=$(fetch_health)
final_sse=$(echo  "$final" | parse_sse)
final_wait=$(echo "$final" | parse_pool_wait)
final_pool=$(echo "$final" | parse_pool_total)

log "Final     — SSE active: $final_sse | Pool total: $final_pool | Waiting: $final_wait"
log "Peak SSE connections seen during test: $max_sse"
log "Peak pool waiting count seen: $max_wait"
log "Request failures: $fail_count / $((CYCLES * 2))"

echo ""

# SSE zombie check
if [[ "$initial_sse" =~ ^[0-9]+$ && "$final_sse" =~ ^[0-9]+$ ]]; then
  delta=$((final_sse - initial_sse))
  if (( delta > 2 )); then
    fail "SSE connections grew by $delta (zombie leak detected — initial=$initial_sse final=$final_sse)"
  elif (( delta > 0 )); then
    warn "SSE connections grew by $delta (within tolerance — may be active real sessions)"
  else
    ok   "SSE connections stable (delta=$delta)"
  fi
fi

# Pool exhaustion check
if [[ "$max_wait" =~ ^[0-9]+$ ]]; then
  if (( max_wait > 5 )); then
    fail "Pool starvation detected: peak waitingCount=$max_wait (threshold=5)"
  elif (( max_wait > 0 )); then
    warn "Pool pressure observed: peak waitingCount=$max_wait"
  else
    ok   "Pool never exhausted (waitingCount peaked at 0)"
  fi
fi

# Overall verdict
if (( fail_count == 0 )); then
  echo ""
  ok  "PASS — $CYCLES cycles completed, no request failures"
else
  echo ""
  fail "FAIL — $fail_count request failures in $CYCLES cycles"
  exit 1
fi
