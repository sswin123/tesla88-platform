#!/usr/bin/env bash
# production-check.sh — Production 自动化验收检查
#
# 在 deploy.sh 成功后执行，验证所有可自动化的功能点。
# 不能替代人工测试，只做基础设施层面的验证。
#
# 用法：
#   ./scripts/production-check.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
DC="docker compose -f $COMPOSE_FILE"

ERP_URL="https://erp.apidemo.club"
WEB_URL="https://apidemo.club"
LOG_LINES=200      # 扫描最近多少行日志
LOG_MINUTES=10     # 扫描最近几分钟的日志

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()    { echo -e "${GREEN}  ✓  ${NC}$*";  PASS=$((PASS+1)); }
fail()  { echo -e "${RED}  ✗  ${NC}$*" >&2; FAIL=$((FAIL+1)); }
warn()  { echo -e "${YELLOW}  ⚠  ${NC}$*"; WARN=$((WARN+1)); }
info()  { echo -e "${BLUE}  →  ${NC}$*"; }
step()  { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }

PASS=0; FAIL=0; WARN=0
CHECK_START=$(date +%s)

cd "$PROJECT_ROOT"

echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   Production Auto Check                ║${NC}"
echo -e "${BOLD}${CYAN}║   $(date '+%Y-%m-%d %H:%M:%S')                ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════╝${NC}"

# ════════════════════════════════════════════════════════════════════════
# 工具函数
# ════════════════════════════════════════════════════════════════════════

http_check() {
    local url="$1" label="$2" expect="${3:-2}"
    local code
    if command -v curl >/dev/null 2>&1; then
        code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 8 --max-time 12 "$url" 2>/dev/null || echo "000")
    else
        code=$(wget -q --spider --server-response --timeout=12 "$url" 2>&1 \
               | awk '/HTTP\// {print $2}' | tail -1 || echo "000")
    fi
    local first="${code:0:1}"
    if [ "$first" = "$expect" ] || { [ "$expect" = "2" ] && [ "$first" = "3" ]; }; then
        ok "${label} → HTTP ${code}"
    else
        fail "${label} → HTTP ${code}"
    fi
}

json_field_check() {
    local url="$1" label="$2" field="$3" expected="$4"
    local body
    body=$(curl -sk --connect-timeout 8 --max-time 12 "$url" 2>/dev/null || echo "")
    if echo "$body" | grep -q "\"${field}\""; then
        if [ -n "$expected" ]; then
            if echo "$body" | grep -q "\"${field}\":${expected}"; then
                ok "${label}"
            else
                fail "${label} — ${field} 值不符预期"
            fi
        else
            ok "${label}"
        fi
    else
        fail "${label} — 响应中缺少 ${field} 字段 (body: ${body:0:80})"
    fi
}

log_scan() {
    local service="$1" label="$2"
    local log_output
    log_output=$($DC logs "$service" --tail "$LOG_LINES" 2>/dev/null || echo "")
    local found
    found=$(echo "$log_output" | grep -iE \
        "uncaughtException|unhandledRejection|\[fatal\]|ECONNREFUSED|Cannot connect|connection refused" \
        | grep -v "grep" || true)
    if [ -z "$found" ]; then
        ok "${label} — 无异常日志"
    else
        warn "${label} — 发现可疑日志:"
        echo "$found" | head -5 | while read -r line; do echo "      $line"; done
    fi
}

# ════════════════════════════════════════════════════════════════════════
# 一、Docker 容器状态
# ════════════════════════════════════════════════════════════════════════
step "一  Docker 容器状态"

SERVICES="postgres redis erp website telegram-bot nginx"
for svc in $SERVICES; do
    cid=$($DC ps -q "$svc" 2>/dev/null | head -1)
    if [ -z "$cid" ]; then
        fail "${svc} — 容器不存在"
        continue
    fi

    # Health status
    health=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "none")
    status=$(docker inspect --format '{{.State.Status}}'        "$cid" 2>/dev/null || echo "unknown")
    restart=$(docker inspect --format '{{.RestartCount}}'       "$cid" 2>/dev/null || echo "?")

    if [ "$status" != "running" ]; then
        fail "${svc} — Status=${status} (期望 running)"
    elif [ "$health" = "unhealthy" ]; then
        fail "${svc} — Health=unhealthy"
    elif [ "$restart" != "0" ] && [ "$restart" != "?" ]; then
        warn "${svc} — RestartCount=${restart}（有过重启）"
    elif [ "$health" = "healthy" ]; then
        ok "${svc} — running / healthy / restarts=${restart}"
    else
        ok "${svc} — running / restarts=${restart}"
    fi
done

# ════════════════════════════════════════════════════════════════════════
# 二、Migration 结果确认
# ════════════════════════════════════════════════════════════════════════
step "二  Migration 结果"

migrate_cid=$(docker ps -a \
    --filter "label=com.docker.compose.service=migrate" \
    --format "{{.ID}}" 2>/dev/null | head -1)

if [ -n "$migrate_cid" ]; then
    m_status=$(docker inspect --format '{{.State.Status}}'   "$migrate_cid" 2>/dev/null || echo "?")
    m_code=$(  docker inspect --format '{{.State.ExitCode}}' "$migrate_cid" 2>/dev/null || echo "?")
    if [ "$m_status" = "exited" ] && [ "$m_code" = "0" ]; then
        ok "Migration — Status=exited / ExitCode=0"
        # 检查 migrate 日志是否包含成功标志
        if $DC logs migrate 2>/dev/null | grep -q "迁移完成\|Migration.*完成\|Seed.*完成"; then
            ok "Migration 日志 — 包含完成标志"
        else
            warn "Migration 日志 — 未找到明确的完成标志（请手动确认）"
        fi
    else
        fail "Migration — Status=${m_status} ExitCode=${m_code}"
    fi
else
    warn "Migration 容器未找到（已被清理？）"
fi

# ════════════════════════════════════════════════════════════════════════
# 三、API 端点检查（无需登录）
# ════════════════════════════════════════════════════════════════════════
step "三  API 端点检查"

# ERP: ping（最基础的存活检查）
json_field_check "${ERP_URL}/api/ping"          "ERP /api/ping"          "ok" "true"

# ERP: health/system（验证数据库连接）
json_field_check "${ERP_URL}/api/health/system" "ERP /api/health/system（含 DB 检查）" "database" ""

# ERP: public/brand（验证数据库有数据 + API 正常）
json_field_check "${ERP_URL}/api/public/brand"  "ERP /api/public/brand"  "brand_name" ""

# ERP: login 页面
http_check "${ERP_URL}/login" "ERP /login 页面"

# Website: 首页
http_check "${WEB_URL}/" "Website 首页"

# Website: public/brand（Website 读取 ERP 数据）
json_field_check "${WEB_URL}/api/public/brand" "Website /api/public/brand" "brand_name" ""

# ════════════════════════════════════════════════════════════════════════
# 四、Nginx 内部连通（从 Nginx 容器 exec）
# ════════════════════════════════════════════════════════════════════════
step "四  Nginx 内部连通"

nginx_cid=$($DC ps -q nginx 2>/dev/null | head -1)
if [ -z "$nginx_cid" ]; then
    fail "Nginx 容器未运行"
else
    if docker exec "$nginx_cid" wget -qO- --timeout=8 "http://erp:3000/api/ping" >/dev/null 2>&1; then
        ok "Nginx → ERP (http://erp:3000/api/ping)"
    else
        fail "Nginx → ERP 连接失败（Connection refused？）"
    fi

    if docker exec "$nginx_cid" wget -qO- --timeout=8 "http://website:3000" >/dev/null 2>&1; then
        ok "Nginx → Website (http://website:3000)"
    else
        fail "Nginx → Website 连接失败"
    fi
fi

# ════════════════════════════════════════════════════════════════════════
# 五、日志扫描（异常检测）
# ════════════════════════════════════════════════════════════════════════
step "五  日志扫描（最近 ${LOG_LINES} 行）"

log_scan erp         "ERP 日志"
log_scan website     "Website 日志"
log_scan nginx       "Nginx 日志"
log_scan telegram-bot "Telegram Bot 日志"

# ════════════════════════════════════════════════════════════════════════
# 六、公网 HTTP（最终确认）
# ════════════════════════════════════════════════════════════════════════
step "六  公网 HTTP"

http_check "${WEB_URL}"           "https://apidemo.club"
http_check "${ERP_URL}/login"     "https://erp.apidemo.club/login"

# ════════════════════════════════════════════════════════════════════════
# 最终报告
# ════════════════════════════════════════════════════════════════════════
CHECK_END=$(date +%s)
ELAPSED=$((CHECK_END - CHECK_START))
TOTAL=$((PASS + FAIL + WARN))

echo ""
echo -e "${BOLD}=======================================${NC}"
echo -e "${BOLD}   Production Auto Check Report        ${NC}"
echo -e "${BOLD}=======================================${NC}"
echo ""
echo -e "  总检查项:  ${TOTAL}"
echo -e "  ${GREEN}✓ 通过:${NC}   ${PASS}"
echo -e "  ${YELLOW}⚠ 警告:${NC}   ${WARN}"
echo -e "  ${RED}✗ 失败:${NC}   ${FAIL}"
echo -e "  检查耗时:  ${ELAPSED}s"
echo ""

if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
    echo -e "${BOLD}${GREEN}  ✓ Production Stable${NC}"
    echo -e "${BOLD}${GREEN}  所有自动检查通过，请继续执行人工测试清单。${NC}"
elif [ "$FAIL" -eq 0 ]; then
    echo -e "${BOLD}${YELLOW}  ⚠ 基础检查通过，但有警告，请关注。${NC}"
    echo -e "  请执行人工测试清单确认功能正常。"
else
    echo -e "${BOLD}${RED}  ✗ 有 ${FAIL} 项检查失败，Production 不稳定！${NC}"
    echo -e "  请根据以上错误信息排查问题后重新部署。"
fi

echo ""
echo -e "${BOLD}=======================================${NC}"
echo -e "  下一步：执行人工测试清单"
echo -e "  文件：docs/PRODUCTION_CHECKLIST.md"
echo -e "${BOLD}=======================================${NC}"
echo ""

# 有失败项时以非 0 退出码退出
[ "$FAIL" -eq 0 ]
