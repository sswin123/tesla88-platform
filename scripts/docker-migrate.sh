#!/usr/bin/env sh
# docker-migrate.sh  v5
#
# Root cause (postgres:14-alpine + Docker Compose non-detached):
#   psql compiled with GNU readline calls read(fd=0) during readline
#   initialisation even when SQL comes from -f or -c. Docker Compose keeps
#   the container's stdin connected to an open pipe (write-end held by
#   Docker runtime, never closed). Any read(fd=0) therefore blocks forever.
#   This occurs regardless of -f/-c flags — both leave fd=0 as Docker's pipe.
#
# Fix:
#   1. exec < /dev/null — closes Docker's blocking pipe for sh itself and
#      any child process that does not create its own pipe.
#   2. ALL psql invocations receive SQL via an explicit shell pipe:
#         cat file | psql        (migration files)
#         printf "SQL" | psql   (one-off statements)
#      A shell pipe replaces fd=0 with a self-terminating pipe: when the
#      writer (cat/printf) exits, EOF is delivered to psql immediately.
#      readline gets EOF on fd=0, does not block, and psql exits cleanly.
#   3. No -f flag. No -c flag. Both leave fd=0 as Docker's blocking pipe.
#
# Transaction model:
#   cat migration.sql | psql -1   (-1 wraps stdin in BEGIN…COMMIT; on
#                                   error psql sends ROLLBACK and exits 1)
#   printf "INSERT…" | psql       (separate call, simple INSERT, no CTE)
#
# Idempotency: ON CONFLICT DO NOTHING + IF NOT EXISTS in migration SQL.

set -eu

# Close Docker's blocking stdin pipe for this shell and all non-piped
# children. Belt-and-suspenders on top of the explicit pipe fix.
exec < /dev/null

MIGRATIONS_DIR="/migrations"
SEEDS_DIR="${MIGRATIONS_DIR}/seeds"
APPLIED_TMP="/tmp/applied-mig-$$.txt"
APPLIED_SEED_TMP="/tmp/applied-seed-$$.txt"

trap 'rm -f "${APPLIED_TMP}" "${APPLIED_SEED_TMP}"' EXIT

log() { printf '[migrate] %s\n' "$*"; }
die() { log "FATAL: $*"; exit 1; }

# Run a SQL statement — SQL piped via stdin, never via -c.
run_sql() {
    printf '%s\n' "$1" | psql "${DATABASE_URL}" -v ON_ERROR_STOP=on
}

# Run a SQL query and capture plain rows (-t = tuples only, -A = unaligned).
query_sql() {
    printf '%s\n' "$1" | psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -t -A
}

log "=== Tesla88 Migration Engine v5 ==="
log "DB: ${DATABASE_URL%%@*}@***"
echo ""

# ─── PHASE 1: 建立追踪表（幂等） ─────────────────────────────────────────────
log "[1/4] 初始化追踪表..."

run_sql "CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"
run_sql "CREATE TABLE IF NOT EXISTS schema_seeds (filename VARCHAR(255) PRIMARY KEY, executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"

# ─── PHASE 2: 查询已应用列表 ──────────────────────────────────────────────────
log "[2/4] 查询已应用列表..."

query_sql "SELECT filename FROM schema_migrations ORDER BY filename;" \
    > "${APPLIED_TMP}" 2>/dev/null || : > "${APPLIED_TMP}"

query_sql "SELECT filename FROM schema_seeds ORDER BY filename;" \
    > "${APPLIED_SEED_TMP}" 2>/dev/null || : > "${APPLIED_SEED_TMP}"

# CRLF 安全处理（musl libc psql 输出可能含 \r\n）
tr -d '\r' < "${APPLIED_TMP}"      > "${APPLIED_TMP}.c"      && mv "${APPLIED_TMP}.c"      "${APPLIED_TMP}"      || true
tr -d '\r' < "${APPLIED_SEED_TMP}" > "${APPLIED_SEED_TMP}.c" && mv "${APPLIED_SEED_TMP}.c" "${APPLIED_SEED_TMP}" || true

APPLIED_COUNT=$(grep -c . "${APPLIED_TMP}" 2>/dev/null || echo 0)
TOTAL=$(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | wc -l | tr -d ' ')
LAST="(none)"
[ "${APPLIED_COUNT}" -gt 0 ] && LAST=$(tail -1 "${APPLIED_TMP}")
log "    已应用: ${APPLIED_COUNT} / ${TOTAL}  (最新: ${LAST})"

# ─── PHASE 3: Bootstrap ──────────────────────────────────────────────────────
# 触发条件：schema_migrations 为空 且 brand_settings.erp_domain 已存在
# （旧库首次引入迁移系统时批量标记，不重复执行 SQL）
if [ "${APPLIED_COUNT}" -eq 0 ]; then
    HAS_BRAND=$(query_sql "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='brand_settings' AND column_name='erp_domain';" 2>/dev/null || echo 0)
    HAS_BRAND=$(printf '%s' "${HAS_BRAND}" | tr -d '[:space:]\r')

    if [ "${HAS_BRAND}" = "1" ]; then
        log "[Bootstrap] 检测到已有 Schema，逐一标记所有 Migration 为已应用..."
        for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
            n=$(basename "${f}")
            printf "INSERT INTO schema_migrations (filename) VALUES ('%s') ON CONFLICT DO NOTHING;\n" "${n}" \
                | psql "${DATABASE_URL}" > /dev/null 2>&1 || true
            log "    标记: ${n}"
        done
        log "=== Bootstrap 完成，退出 0 ==="
        exit 0
    fi
fi

# ─── 计算待执行数量 ──────────────────────────────────────────────────────────
PENDING=0
for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    grep -qxF "$(basename "${f}")" "${APPLIED_TMP}" 2>/dev/null || PENDING=$((PENDING + 1))
done

if [ "${PENDING}" -eq 0 ] && [ "${APPLIED_COUNT}" -gt 0 ]; then
    log "所有 ${APPLIED_COUNT} 个 Migration 均已应用，无需执行。"
    log "=== 迁移完成，退出 0 ==="
    exit 0
fi

# ─── PHASE 4: 执行待执行 Migration ───────────────────────────────────────────
#
# 每个 Migration 两步，均通过 pipe 传输 SQL：
#
#   Step A: cat migration.sql | psql -1
#     cat 写完后关闭 pipe 写端 → psql 收到 EOF → 自动 COMMIT → psql 退出
#     -1 保证原子性：BEGIN + 所有 SQL + COMMIT；失败时自动 ROLLBACK
#     fd 0 = cat 的管道，不是 Docker 的阻塞管道 → readline 不阻塞
#
#   Step B: printf "INSERT..." | psql
#     记录已完成；简单 INSERT；无 CTE；无 RETURNING；无 \gset
#     fd 0 = printf 的管道，printf 结束即 EOF → psql 立即退出
#
#   若 Step A 失败 → exit 1，未记录，可安全修复后重试
#   若 Step A 成功但容器在 Step B 前被 kill → 下次启动重新执行（幂等）
echo ""
log "[3/4] 执行 ${PENDING} 个待执行 Migration..."
EXECUTED=0

for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    n=$(basename "${f}")

    # Shell 层过滤：已记录的跳过
    if grep -qxF "${n}" "${APPLIED_TMP}" 2>/dev/null; then
        continue
    fi

    log "-> 执行: ${n}"

    # Step A: cat file | psql -1
    # psql 的 fd 0 = cat 管道（自终止），readline 不阻塞
    if ! cat "${f}" | psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -1; then
        die "Migration 执行失败: ${n}（-1 已自动 ROLLBACK，修复后可直接重试）"
    fi

    # Step B: printf | psql（简单 INSERT，via pipe）
    printf "INSERT INTO schema_migrations (filename) VALUES ('%s') ON CONFLICT DO NOTHING;\n" "${n}" \
        | psql "${DATABASE_URL}" -v ON_ERROR_STOP=on \
        || die "记录 Migration 失败: ${n}"

    log "   v 完成: ${n}"
    EXECUTED=$((EXECUTED + 1))
done

# ─── Seeds（与 Migration 完全相同的逻辑） ────────────────────────────────────
if [ -d "${SEEDS_DIR}" ]; then
    SEED_PENDING=0
    for f in $(ls "${SEEDS_DIR}"/seed_*.sql 2>/dev/null | sort); do
        grep -qxF "$(basename "${f}")" "${APPLIED_SEED_TMP}" 2>/dev/null || SEED_PENDING=$((SEED_PENDING + 1))
    done

    if [ "${SEED_PENDING}" -gt 0 ]; then
        echo ""
        log "[4/4] 执行 ${SEED_PENDING} 个待执行 Seed..."
        for f in $(ls "${SEEDS_DIR}"/seed_*.sql 2>/dev/null | sort); do
            n=$(basename "${f}")
            grep -qxF "${n}" "${APPLIED_SEED_TMP}" 2>/dev/null && continue
            log "-> Seed: ${n}"
            if ! cat "${f}" | psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -1; then
                die "Seed 执行失败: ${n}"
            fi
            printf "INSERT INTO schema_seeds (filename) VALUES ('%s') ON CONFLICT DO NOTHING;\n" "${n}" \
                | psql "${DATABASE_URL}" -v ON_ERROR_STOP=on \
                || die "记录 Seed 失败: ${n}"
            log "   v 完成: ${n}"
        done
    fi
fi

echo ""
log "共执行 Migration：${EXECUTED} 个"
log "=== 迁移完成，退出 0 ==="
