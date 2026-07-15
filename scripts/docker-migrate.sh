#!/usr/bin/env sh
# docker-migrate.sh — 在 migrate 容器内按顺序执行所有编号 SQL 迁移。
#
# 设计原则：
#   - Migration / Seed 是否执行由 PostgreSQL 决定（\gset + \if），Shell 不做字符串比较
#   - schema_migrations / schema_seeds 追踪 + NOT EXISTS 确保完全幂等
#   - 任何 SQL 错误 → ON_ERROR_STOP=on → set -eu → 立即 exit 1
#   - Bootstrap：追踪表为空但库已存在 → 标记全部文件已执行，跳到 Seed
#
# 前提：DATABASE_URL 已设置；psql 10+（支持 \gset / \if）
set -eu

MIGRATIONS_DIR="/migrations"

echo "=== 开始数据库迁移 ==="
echo "数据库: ${DATABASE_URL%%@*}@***"

# ── 确保 Migration 追踪表存在 ─────────────────────────────────────────────
psql "${DATABASE_URL}" -v ON_ERROR_STOP=on <<'EOSQL'
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
EXCEPTION WHEN unique_violation OR duplicate_table THEN
    NULL;
END $$;
EOSQL

# ── Bootstrap 检测（旧版数据库首次接入追踪系统）─────────────────────────────
# 追踪表为空 + brand_settings.erp_domain 已存在 → 数据库由旧脚本迁移过
# 仅标记全部文件已执行，然后跳到 Seed；不执行任何 Migration SQL
tracking_count=$(psql "${DATABASE_URL}" -t -A -c \
    "SELECT COUNT(*) FROM schema_migrations;" | tr -d '[:space:]')

bootstrap_done=0

if [ "${tracking_count}" = "0" ]; then
    erp_domain_exists=$(psql "${DATABASE_URL}" -t -A -c \
        "SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'brand_settings' AND column_name = 'erp_domain';" \
        | tr -d '[:space:]')

    if [ "${erp_domain_exists}" = "1" ]; then
        echo "=== 引导模式：检测到已迁移数据库，标记所有 Migration 为已执行 ==="
        for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
            name=$(basename "$f")
            psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -c \
                "INSERT INTO schema_migrations (filename) VALUES ('${name}') ON CONFLICT DO NOTHING;"
            echo "  → 已标记: ${name}"
        done
        bootstrap_done=1
        echo "=== 引导完成（跳过 Migration 流程，直接执行 Seed） ==="
    fi
fi

# ── 正常 Migration 流程 ────────────────────────────────────────────────────
# Shell 只负责 for 循环。
# PostgreSQL 用 NOT EXISTS → \gset → \if 决定 SKIP 或执行。
# Shell 不读取、不比较任何 psql 输出。
if [ "${bootstrap_done}" = "0" ]; then
    echo "=== 开始 Migration ==="
    for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
        name=$(basename "$f")
        psql "${DATABASE_URL}" -v ON_ERROR_STOP=on \
             -v migration_name="${name}" <<EOSQL
SELECT (NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE filename = :'migration_name'
))::text AS should_run \gset
\if :should_run
\echo '→ 执行: ${name}'
\i ${f}
INSERT INTO schema_migrations (filename) VALUES (:'migration_name');
\echo '  ✓ 完成'
\else
\echo '→ SKIP [已执行]: ${name}'
\endif
EOSQL
    done
    echo "=== Migration 完成 ==="
fi

# ── 确保 Seed 追踪表存在 ──────────────────────────────────────────────────
psql "${DATABASE_URL}" -v ON_ERROR_STOP=on <<'EOSQL'
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS schema_seeds (
        filename    VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
EXCEPTION WHEN unique_violation OR duplicate_table THEN
    NULL;
END $$;
EOSQL

# ── Seed：PostgreSQL 决定 SKIP 或执行，Shell 不做字符串比较 ──────────────
SEEDS_DIR="${MIGRATIONS_DIR}/seeds"
if [ -d "${SEEDS_DIR}" ]; then
    echo "=== 开始 Seed 初始化 ==="
    for f in $(ls "${SEEDS_DIR}"/seed_*.sql 2>/dev/null | sort); do
        name=$(basename "$f")
        psql "${DATABASE_URL}" -v ON_ERROR_STOP=on \
             -v seed_name="${name}" <<EOSQL
SELECT (NOT EXISTS (
    SELECT 1 FROM schema_seeds WHERE filename = :'seed_name'
))::text AS should_run \gset
\if :should_run
\echo '→ Seed: ${name}'
\i ${f}
INSERT INTO schema_seeds (filename) VALUES (:'seed_name');
\echo '  ✓ 完成'
\else
\echo '→ SKIP [已执行]: ${name}'
\endif
EOSQL
    done
    echo "=== Seed 完成 ==="
fi
