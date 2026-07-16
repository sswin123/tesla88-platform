#!/usr/bin/env bash
# deploy.sh — Tesla88 / SSWIN88 Production 一键部署
#
# 用法：
#   ./scripts/deploy.sh            # 普通更新
#   ./scripts/deploy.sh --fresh    # 首次部署（生成 SSL 证书）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
DC="docker compose -f $COMPOSE_FILE"

FRESH_INSTALL=false
[[ "${1:-}" == "--fresh" ]] && FRESH_INSTALL=true

# ── 颜色 ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()    { echo -e "${GREEN}  ✓  ${NC}$*"; }
fail()  { echo -e "${RED}  ✗  ${NC}$*" >&2; }
info()  { echo -e "${BLUE}  →  ${NC}$*"; }
warn()  { echo -e "${YELLOW}  ⚠  ${NC}$*"; }
step()  { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }
die()   { fail "$*"; exit 1; }
debug() { echo -e "${CYAN}[DEBUG]${NC} $*"; }

# 各项检查结果（用于最终 Banner）
R_MIGRATION="✗ FAIL"; R_SEED="✗ FAIL"
R_POSTGRES="✗ FAIL";  R_REDIS="⚠ SKIP"
R_ERP="✗ FAIL";       R_WEBSITE="✗ FAIL"
R_BOT="⚠ SKIP";      R_NGINX="✗ FAIL"
R_ERP_REACH="✗ FAIL"; R_WEB_REACH="✗ FAIL"
R_HTTP="✗ FAIL"

DEPLOY_START=$(date +%s)

echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     Tesla88 / SSWIN88 Production       ║${NC}"
echo -e "${BOLD}${CYAN}║     Deploy — $(date '+%Y-%m-%d %H:%M:%S')       ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# ════════════════════════════════════════════════════════════════════════
# resolve_project_name
#
# 三重保障获取 Compose 项目名，不硬编码目录名：
#   Method 1: docker compose config（读取 compose 文件的 name 字段）
#   Method 2: 从已运行容器的 label 读取
#   Method 3: 目录名小写（最终兜底）
# ════════════════════════════════════════════════════════════════════════
resolve_project_name() {
    local name=""

    # Method 1: docker compose config → name: xxx
    name=$($DC config 2>/dev/null \
           | grep '^name:' | head -1 \
           | sed 's/^name:[[:space:]]*//' | tr -d '"' | tr -d "'")
    if [ -n "$name" ]; then
        debug "项目名来源: compose config → ${name}"
        echo "$name"; return
    fi

    # Method 2: 从已运行容器 label 读取
    local cid
    cid=$(docker ps --filter "label=com.docker.compose.project" \
          --format "{{.ID}}" 2>/dev/null | head -1)
    if [ -n "$cid" ]; then
        name=$(docker inspect --format \
               '{{index .Config.Labels "com.docker.compose.project"}}' \
               "$cid" 2>/dev/null || echo "")
        if [ -n "$name" ]; then
            debug "项目名来源: 运行容器 label → ${name}"
            echo "$name"; return
        fi
    fi

    # Method 3: 目录名兜底
    name=$(basename "$PROJECT_ROOT" | tr '[:upper:]' '[:lower:]' \
           | tr -cs 'a-z0-9_-' '-' | sed 's/-*$//')
    debug "项目名来源: 目录名（兜底）→ ${name}"
    echo "$name"
}

# ════════════════════════════════════════════════════════════════════════
# wait_for_migrate
#
# One-shot Container 生命周期：Created → Running → Exited(0)
# 不使用 docker compose ps / docker compose ps -q migrate。
#
# 查找容器两路并行（都不硬编码名称）：
#   路径 A：docker inspect ${PROJECT_NAME}-migrate-1  （名称推导，最快）
#   路径 B：docker ps -a --filter label=...            （标签查找，兜底）
#
# 每次循环打印 DEBUG 状态，出现问题立即可见。
# ════════════════════════════════════════════════════════════════════════
wait_for_migrate() {
    local project="$1"
    local max_wait=300 elapsed=0
    local migrate_name="${project}-migrate-1"
    local migrate_cid="" state exit_code

    debug "PROJECT_NAME     = ${project}"
    debug "容器名推导        = ${migrate_name}"
    debug "Label 过滤条件    = com.docker.compose.service=migrate"
    info  "等待 Migration 容器出现..."

    # ── Step 1：等待容器出现 ─────────────────────────────────────────
    # 优先用 service label（不依赖 project name 是否正确）
    while [ $elapsed -lt $max_wait ]; do

        # ── Debug Block ──────────────────────────────────────────────
        echo "--------------------------------"
        echo "[Migration Debug] elapsed=${elapsed}s"
        echo "  Project Name    = ${project}"
        echo "  容器名推导       = ${migrate_name}"

        # Path A：按名称 inspect
        local path_a_ok="NOT_FOUND"
        local path_a_id=""
        if docker inspect "$migrate_name" >/dev/null 2>&1; then
            path_a_ok="FOUND"
            path_a_id=$(docker inspect --format '{{.Id}}' "$migrate_name" 2>/dev/null || echo "")
        fi
        echo "  Path A (docker inspect ${migrate_name}) = ${path_a_ok}  id=${path_a_id:0:12}"

        # Path B：service+project label
        local path_b_id
        path_b_id=$(docker ps -a \
            --filter "label=com.docker.compose.service=migrate" \
            --filter "label=com.docker.compose.project=${project}" \
            --format "{{.ID}}" 2>/dev/null | head -1)
        echo "  Path B (label service=migrate + project=${project}) = ${path_b_id:-EMPTY}"

        # Path C：只按 service label（无视 project name）
        local path_c_id
        path_c_id=$(docker ps -a \
            --filter "label=com.docker.compose.service=migrate" \
            --format "{{.ID}}" 2>/dev/null | head -1)
        local path_c_name=""
        local path_c_proj=""
        if [ -n "$path_c_id" ]; then
            path_c_name=$(docker inspect --format '{{.Name}}' "$path_c_id" 2>/dev/null | tr -d '/' || echo "?")
            path_c_proj=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$path_c_id" 2>/dev/null || echo "?")
        fi
        echo "  Path C (label service=migrate only)               = ${path_c_id:-EMPTY}  name=${path_c_name}  project_label=${path_c_proj}"

        # docker ps -a 前 10 行（供全局排查）
        echo "  docker ps -a (前10行):"
        docker ps -a --format "    {{.Names}}\t{{.Status}}" 2>/dev/null | head -10
        echo "--------------------------------"
        # ── End Debug Block ──────────────────────────────────────────

        # 路径 A：按推导名称找到
        if [ "$path_a_ok" = "FOUND" ] && [ -n "$path_a_id" ]; then
            migrate_cid="$path_a_id"
            debug "路径A 找到容器（按名称）: ${migrate_cid:0:12}"
            break
        fi

        # 路径 B：service+project label
        if [ -n "$path_b_id" ]; then
            migrate_cid="$path_b_id"
            debug "路径B 找到容器（service+project label）: ${migrate_cid:0:12}"
            break
        fi

        # 路径 C：仅 service label（project name 推导错误时的终极兜底）
        if [ -n "$path_c_id" ]; then
            migrate_cid="$path_c_id"
            debug "路径C 找到容器（service label only）: ${migrate_cid:0:12} name=${path_c_name} project=${path_c_proj}"
            break
        fi

        debug "${elapsed}s — 容器未出现，继续等待..."
        sleep 2; elapsed=$((elapsed + 2))
    done

    # 超时仍未找到
    if [ -z "$migrate_cid" ]; then
        fail "Migration 容器未出现（超时 ${max_wait}s）"
        echo ""
        echo "  === 超时诊断：全部容器 ==="
        docker ps -a --format "  {{.Names}}\t{{.Status}}" 2>/dev/null
        return 1
    fi

    local container_name
    container_name=$(docker inspect --format '{{.Name}}' "$migrate_cid" 2>/dev/null | tr -d '/' || echo "?")
    info "Migration 容器已发现: ${container_name} (${migrate_cid:0:12})，等待执行完毕..."

    # ── Step 2：轮询 State.Status + State.ExitCode ───────────────────
    while [ $elapsed -lt $max_wait ]; do

        # ── Debug Block ──────────────────────────────────────────────
        echo "--------------------------------"
        echo "[Migration Debug] elapsed=${elapsed}s"
        echo "  Container ID    = ${migrate_cid:0:12}  (${container_name})"
        local inspect_out
        inspect_out=$(docker inspect --format '{{.State.Status}}|{{.State.ExitCode}}' "$migrate_cid" 2>/dev/null || echo "inspect_failed|?")
        echo "  docker inspect  = ${inspect_out}"
        echo "--------------------------------"
        # ── End Debug Block ──────────────────────────────────────────

        state="${inspect_out%|*}"
        exit_code="${inspect_out#*|}"

        case "$state" in
            exited)
                debug "ExitCode=${exit_code}"
                if [ "$exit_code" = "0" ]; then
                    ok "Migration 完成（ExitCode=0）"
                    return 0
                else
                    fail "Migration 失败（ExitCode=${exit_code}）"
                    echo ""
                    echo -e "${YELLOW}━━━ Migration 日志（最后 200 行）━━━${NC}"
                    docker logs "$migrate_cid" 2>&1 | tail -200
                    return 1
                fi
                ;;
            running)
                info "  Migration 执行中... (${elapsed}s)"
                sleep 3; elapsed=$((elapsed + 3))
                ;;
            inspect_failed)
                fail "  docker inspect 失败（容器 ${migrate_cid:0:12} 不存在？）"
                sleep 2; elapsed=$((elapsed + 2))
                ;;
            *)
                # created / restarting / removing / dead / unknown
                debug "  未知状态 '${state}'，继续等待..."
                sleep 2; elapsed=$((elapsed + 2))
                ;;
        esac
    done

    fail "Migration 超时（${max_wait}s）"
    echo -e "${YELLOW}━━━ Migration 日志（最后 50 行）━━━${NC}"
    docker logs "$migrate_cid" 2>&1 | tail -50
    return 1
}

# ════════════════════════════════════════════════════════════════════════
# wait_for_healthy — 长驻服务（postgres/redis/erp/website/nginx/bot）
# ════════════════════════════════════════════════════════════════════════
wait_for_healthy() {
    local service="$1" max_wait="${2:-240}" elapsed=0 cid health
    info "等待 ${service} healthy..."
    while [ $elapsed -lt $max_wait ]; do
        cid=$($DC ps -q "$service" 2>/dev/null | head -1)
        if [ -n "$cid" ]; then
            health=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "")
            case "$health" in
                healthy)   ok "${service} ✓"; return 0 ;;
                unhealthy) fail "${service} unhealthy"; return 1 ;;
            esac
        fi
        sleep 5; elapsed=$((elapsed + 5))
    done
    fail "${service} 超时（${max_wait}s）"; return 1
}

# ════════════════════════════════════════════════════════════════════════
# check_internal — 从 Nginx 容器内部测试后端连通性
# ════════════════════════════════════════════════════════════════════════
check_internal() {
    local target="$1" label="$2"
    local nginx_cid
    nginx_cid=$($DC ps -q nginx 2>/dev/null | head -1)
    if [ -z "$nginx_cid" ]; then
        fail "Nginx 容器未运行，无法执行内部连通测试"
        return 1
    fi
    if docker exec "$nginx_cid" wget -qO- --timeout=10 "$target" >/dev/null 2>&1; then
        ok "${label} ✓"
        return 0
    else
        fail "${label} 连接失败"
        return 1
    fi
}

# ════════════════════════════════════════════════════════════════════════
# check_http — 公网 URL HTTP 状态码检查
# ════════════════════════════════════════════════════════════════════════
check_http() {
    local url="$1" label="${2:-$url}" code
    if command -v curl >/dev/null 2>&1; then
        code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 15 "$url" 2>/dev/null || echo "000")
    else
        code=$(wget -q --spider --server-response --timeout=15 "$url" 2>&1 \
               | awk '/HTTP\// {print $2}' | tail -1 || echo "000")
    fi
    echo "$code" | grep -qE "^(2|3)" && { ok "${label} → HTTP ${code}"; return 0; }
    fail "${label} → HTTP ${code}"; return 1
}

# ── 辅助：Banner 结果行 ───────────────────────────────────────────────────────
result_line() {
    local label="$1" result="$2"
    case "$result" in
        "✓ PASS") echo -e "  ${GREEN}✓  PASS${NC}  ${label}" ;;
        "⚠ WARN"|"⚠ SKIP") echo -e "  ${YELLOW}⚠  WARN${NC}  ${label}" ;;
        *) echo -e "  ${RED}✗  FAIL${NC}  ${label}" ;;
    esac
}

# ────────────────────────────────────────────────────────────────────────

cd "$PROJECT_ROOT"

# ── 1/8  环境检查 ─────────────────────────────────────────────────────────────
step "1 / 8  环境检查"
command -v docker >/dev/null 2>&1       || die "Docker 未安装"
docker info >/dev/null 2>&1             || die "Docker daemon 未运行"
docker compose version >/dev/null 2>&1  || die "Docker Compose V2 未安装"
[ -f "$PROJECT_ROOT/.env" ]             || die ".env 文件不存在，请先创建"

PROJECT_NAME=$(resolve_project_name)
[ -z "$PROJECT_NAME" ] && die "无法确定 Compose 项目名，请检查 docker-compose.production.yml"
ok "Docker & Compose ✓  |  .env ✓  |  项目: ${PROJECT_NAME}"

# ── 2/8  Git Pull ─────────────────────────────────────────────────────────────
step "2 / 8  Git Pull"
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
git pull origin main
AFTER=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
if [ "$BEFORE" = "$AFTER" ]; then
    ok "已是最新版本（${AFTER:0:7}）"
else
    ok "${BEFORE:0:7} → ${AFTER:0:7}"
    git diff --name-only "$BEFORE" HEAD 2>/dev/null | head -15 | while read -r f; do info "  $f"; done
fi

# ── 3/8  SSL 证书 ─────────────────────────────────────────────────────────────
step "3 / 8  SSL 证书"
SSL_VOLUME_EXISTS=$(docker volume ls -q | grep -c "nginx_ssl" || true)
if [ "$FRESH_INSTALL" = "true" ] || [ "$SSL_VOLUME_EXISTS" = "0" ]; then
    info "首次部署，生成自签名 SSL 证书..."
    $DC run --rm certgen
    ok "SSL 证书已生成"
else
    ok "SSL Volume 已存在，跳过"
fi

# ── 4/8  Build & 启动 ─────────────────────────────────────────────────────────
step "4 / 8  Build & 启动"
info "Build 镜像（仅重建有变更的）..."
$DC build --parallel
info "启动全部服务..."
$DC up -d
ok "Docker Compose Up 完成"

# ── 5/8  Migration ────────────────────────────────────────────────────────────
step "5 / 8  Database Migration"
if wait_for_migrate "$PROJECT_NAME"; then
    R_MIGRATION="✓ PASS"
    R_SEED="✓ PASS"
else
    die "Migration 失败，停止部署"
fi

# ── 6/8  服务健康检查 ─────────────────────────────────────────────────────────
step "6 / 8  服务健康检查"

wait_for_healthy postgres 60 && R_POSTGRES="✓ PASS" || die "PostgreSQL unhealthy，停止部署"
wait_for_healthy redis    60 && R_REDIS="✓ PASS"    || { warn "Redis unhealthy（继续部署）"; R_REDIS="⚠ WARN"; }
wait_for_healthy erp     240 && R_ERP="✓ PASS"      || { $DC logs erp 2>/dev/null | tail -20; die "ERP unhealthy，停止部署"; }
wait_for_healthy website 240 && R_WEBSITE="✓ PASS"  || { $DC logs website 2>/dev/null | tail -20; die "Website unhealthy，停止部署"; }
wait_for_healthy telegram-bot 120 \
    && R_BOT="✓ PASS" \
    || { warn "Telegram Bot unhealthy（请检查 BOT_TOKEN）"; R_BOT="⚠ WARN"; }
wait_for_healthy nginx    60 && R_NGINX="✓ PASS"    || { warn "Nginx unhealthy"; R_NGINX="⚠ WARN"; }

# ── 7/8  Nginx → 后端内部连通测试 ────────────────────────────────────────────
step "7 / 8  Nginx → 后端连通测试"

check_internal "http://erp:3000/login" "Nginx → ERP (http://erp:3000/login)" \
    && R_ERP_REACH="✓ PASS" \
    || die "ERP 无法从 Nginx 访问，停止部署"

check_internal "http://website:3000" "Nginx → Website (http://website:3000)" \
    && R_WEB_REACH="✓ PASS" \
    || die "Website 无法从 Nginx 访问，停止部署"

# ── 8/8  公网 HTTP 检查 ───────────────────────────────────────────────────────
step "8 / 8  公网 HTTP 检查"
HTTP_OK=true
check_http "https://apidemo.club"           "https://apidemo.club"           || HTTP_OK=false
check_http "https://erp.apidemo.club/login" "https://erp.apidemo.club/login" || HTTP_OK=false

if [ "$HTTP_OK" = "true" ]; then
    R_HTTP="✓ PASS"
else
    R_HTTP="✗ FAIL"
    die "公网 HTTP 检查失败（请确认 DNS 和 Cloudflare 配置）"
fi

# ── 最终汇总 Banner ───────────────────────────────────────────────────────────
DEPLOY_END=$(date +%s)
ELAPSED=$((DEPLOY_END - DEPLOY_START))

echo ""
echo -e "${BOLD}${GREEN}=======================================${NC}"
echo -e "${BOLD}${GREEN}         Production Ready              ${NC}"
echo -e "${BOLD}${GREEN}=======================================${NC}"
echo ""
result_line "Migration"                    "$R_MIGRATION"
result_line "Seed"                         "$R_SEED"
echo ""
result_line "PostgreSQL"                   "$R_POSTGRES"
result_line "Redis"                        "$R_REDIS"
result_line "ERP"                          "$R_ERP"
result_line "Website"                      "$R_WEBSITE"
result_line "Telegram Bot"                 "$R_BOT"
result_line "Nginx"                        "$R_NGINX"
echo ""
result_line "ERP Reachable from Nginx"     "$R_ERP_REACH"
result_line "Website Reachable from Nginx" "$R_WEB_REACH"
echo ""
result_line "HTTP Check"                   "$R_HTTP"
echo ""
echo -e "${BOLD}${GREEN}=======================================${NC}"
echo -e "  Website  →  https://apidemo.club"
echo -e "  ERP      →  https://erp.apidemo.club"
echo -e "  部署耗时:   ${ELAPSED}s"
echo ""
echo -e "${BOLD}${GREEN}  Deployment Finished Successfully${NC}"
echo -e "${BOLD}${GREEN}=======================================${NC}"
echo ""
