#!/usr/bin/env bash
# vps-validate.sh — Tesla88 Production Runtime Validation
# 在 VPS 上执行：bash vps-validate.sh
set -uo pipefail

DC="docker compose -f docker-compose.production.yml"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; WARN=0; FAIL=0

ok()   { echo -e "${GREEN}  ✓  ${NC}$*"; PASS=$((PASS+1)); }
warn() { echo -e "${YELLOW}  ⚠  ${NC}$*"; WARN=$((WARN+1)); }
fail() { echo -e "${RED}  ✗  ${NC}$*"; FAIL=$((FAIL+1)); }
step() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║  Tesla88 Production Runtime Validation       ║${NC}"
echo -e "${BOLD}${CYAN}║  $(date '+%Y-%m-%d %H:%M:%S')                    ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ════════════════════════════════════════════════════════════════════════════
step "1. 容器状态 & 健康检查"
# ════════════════════════════════════════════════════════════════════════════
SERVICES=(postgres redis erp website telegram-bot nginx)
LABELS=(PostgreSQL Redis ERP Website "Telegram Bot" Nginx)

for i in "${!SERVICES[@]}"; do
    svc="${SERVICES[$i]}"
    lbl="${LABELS[$i]}"
    cid=$($DC ps -q "$svc" 2>/dev/null | head -1)
    if [ -z "$cid" ]; then
        fail "$lbl — 容器未找到"
        continue
    fi
    health=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "none")
    status=$(docker inspect --format '{{.State.Status}}'        "$cid" 2>/dev/null || echo "unknown")
    restart=$(docker inspect --format '{{.RestartCount}}'       "$cid" 2>/dev/null || echo "?")

    if [ "$health" = "healthy" ]; then
        ok "$lbl  Health=healthy  Status=$status  RestartCount=$restart"
    elif [ "$health" = "none" ] && [ "$status" = "running" ]; then
        warn "$lbl  no healthcheck  Status=$status  RestartCount=$restart"
    else
        fail "$lbl  Health=$health  Status=$status  RestartCount=$restart"
    fi

    if [ "$restart" != "0" ] && [ "$restart" != "?" ]; then
        warn "$lbl  警告：RestartCount=$restart（应为 0）"
    fi
done

# ════════════════════════════════════════════════════════════════════════════
step "2. Migration ExitCode"
# ════════════════════════════════════════════════════════════════════════════
MIG_CID=$(docker ps -a \
          --filter "label=com.docker.compose.service=migrate" \
          --format "{{.ID}}" 2>/dev/null | head -1)
if [ -n "$MIG_CID" ]; then
    MIG_STATE=$(docker inspect --format '{{.State.Status}}|{{.State.ExitCode}}' "$MIG_CID" 2>/dev/null || echo "?|?")
    MIG_CODE="${MIG_STATE#*|}"
    if [ "$MIG_CODE" = "0" ]; then
        ok "Migration ExitCode=0 ✓"
    else
        fail "Migration ExitCode=$MIG_CODE — 执行失败"
        echo ""
        echo "=== Migration 最后 50 行日志 ==="
        docker logs "$MIG_CID" 2>&1 | tail -50
    fi
else
    warn "Migration 容器未找到（可能首次部署已清理）"
fi

# ════════════════════════════════════════════════════════════════════════════
step "3. Website 日志扫描（危险关键字）"
# ════════════════════════════════════════════════════════════════════════════
WEB_CID=$($DC ps -q website 2>/dev/null | head -1)
if [ -n "$WEB_CID" ]; then
    DANGER_KEYWORDS="ReferenceError|TypeError|window is not defined|document is not defined|DOMParser is not defined|localStorage is not defined|sessionStorage is not defined|matchMedia is not defined|ResizeObserver is not defined|Unhandled Exception|Unhandled Rejection|FATAL ERROR|out of memory"
    HITS=$(docker logs "$WEB_CID" 2>&1 | tail -200 | grep -iE "$DANGER_KEYWORDS" || true)
    if [ -z "$HITS" ]; then
        ok "Website 日志无危险关键字 ✓"
    else
        fail "Website 日志发现危险关键字："
        echo "$HITS"
    fi
else
    warn "Website 容器未找到，跳过日志扫描"
fi

# ════════════════════════════════════════════════════════════════════════════
step "4. ERP 日志扫描"
# ════════════════════════════════════════════════════════════════════════════
ERP_CID=$($DC ps -q erp 2>/dev/null | head -1)
if [ -n "$ERP_CID" ]; then
    ERP_DANGER="Unhandled Exception|Unhandled Rejection|SIGTERM|SIGSEGV|SIGKILL|Fatal Error|out of memory|OOM|FATAL"
    HITS=$(docker logs "$ERP_CID" 2>&1 | tail -200 | grep -iE "$ERP_DANGER" || true)
    if [ -z "$HITS" ]; then
        ok "ERP 日志无危险关键字 ✓"
    else
        fail "ERP 日志发现危险关键字："
        echo "$HITS"
    fi
else
    warn "ERP 容器未找到，跳过日志扫描"
fi

# ════════════════════════════════════════════════════════════════════════════
step "5. HTTP 端点检查"
# ════════════════════════════════════════════════════════════════════════════
check_http() {
    local url="$1" label="${2:-$1}" code
    code=$(curl -sk -o /dev/null -w "%{http_code}" \
           --connect-timeout 10 --max-time 15 "$url" 2>/dev/null || echo "000")
    if echo "$code" | grep -qE "^(2|3)"; then
        ok "$label  HTTP $code"
    else
        fail "$label  HTTP $code"
    fi
}

check_http "https://apidemo.club"                 "Website         https://apidemo.club"
check_http "https://apidemo.club/api/ping"        "Website API     /api/ping"
check_http "https://erp.apidemo.club/login"       "ERP             https://erp.apidemo.club/login"
check_http "https://erp.apidemo.club/api/ping"    "ERP API         /api/ping"

# ════════════════════════════════════════════════════════════════════════════
step "6. 内部连通性（Nginx → 服务）"
# ════════════════════════════════════════════════════════════════════════════
NGINX_CID=$($DC ps -q nginx 2>/dev/null | head -1)
if [ -n "$NGINX_CID" ]; then
    docker exec "$NGINX_CID" \
        wget -qO /dev/null --timeout=5 http://erp:3000/api/ping 2>/dev/null \
        && ok "Nginx → ERP /api/ping ✓" \
        || fail "Nginx → ERP /api/ping 失败"

    docker exec "$NGINX_CID" \
        wget -qO /dev/null --timeout=5 http://website:3000/api/ping 2>/dev/null \
        && ok "Nginx → Website /api/ping ✓" \
        || fail "Nginx → Website /api/ping 失败"
else
    warn "Nginx 容器未找到，跳过内部连通测试"
fi

# ════════════════════════════════════════════════════════════════════════════
step "7. Docker 资源使用"
# ════════════════════════════════════════════════════════════════════════════
echo ""
docker stats --no-stream \
    $(docker ps --filter "label=com.docker.compose.project" -q 2>/dev/null) \
    2>/dev/null || true

# ════════════════════════════════════════════════════════════════════════════
step "8. 连续 HTTP 稳定性测试（30 次）"
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo "  测试 Website 30 次..."
W_OK=0; W_FAIL=0
for i in $(seq 1 30); do
    code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 \
               https://apidemo.club 2>/dev/null || echo "000")
    if echo "$code" | grep -qE "^(2|3)"; then
        W_OK=$((W_OK+1)); printf "."
    else
        W_FAIL=$((W_FAIL+1)); printf "F($code)"
    fi
    sleep 1
done
echo ""
if [ "$W_FAIL" = "0" ]; then
    ok "Website 30/30 ✓"
else
    fail "Website $W_OK/30 通过，$W_FAIL 次失败"
fi

echo ""
echo "  测试 ERP 30 次..."
E_OK=0; E_FAIL=0
for i in $(seq 1 30); do
    code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 \
               https://erp.apidemo.club/login 2>/dev/null || echo "000")
    if echo "$code" | grep -qE "^(2|3)"; then
        E_OK=$((E_OK+1)); printf "."
    else
        E_FAIL=$((E_FAIL+1)); printf "F($code)"
    fi
    sleep 1
done
echo ""
if [ "$E_FAIL" = "0" ]; then
    ok "ERP 30/30 ✓"
else
    fail "ERP $E_OK/30 通过，$E_FAIL 次失败"
fi

# ════════════════════════════════════════════════════════════════════════════
# 最终结果
# ════════════════════════════════════════════════════════════════════════════
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  验证结果汇总  commit=${GIT_COMMIT}${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${GREEN}✓ PASS${NC}  $PASS 项"
echo -e "  ${YELLOW}⚠ WARN${NC}  $WARN 项"
echo -e "  ${RED}✗ FAIL${NC}  $FAIL 项"
echo ""

if [ "$FAIL" = "0" ]; then
    echo -e "${BOLD}${GREEN}  ✓  Production Stabilization PASSED${NC}"
    echo -e "${BOLD}${GREEN}  可以进入下一开发阶段。${NC}"
else
    echo -e "${BOLD}${RED}  ✗  存在 $FAIL 个失败项，请修复后重新验证。${NC}"
fi
echo ""
