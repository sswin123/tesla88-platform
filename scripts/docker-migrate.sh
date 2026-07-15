#!/usr/bin/env sh
# docker-migrate.sh — 在 migrate 容器内按顺序执行所有编号 SQL 迁移。
#
# 行为：
#   - 使用 schema_migrations 追踪表，已执行的文件直接跳过（完全幂等）
#   - 自动引导：若数据库已迁移但无追踪记录（旧版首次部署），自动标记所有文件为已执行
#   - 任何 SQL 语句报错 → 立即退出，返回非零退出码
#   - 不使用 || true，不忽略任何错误
#   - 仅执行匹配 [0-9][0-9][0-9]_*.sql 的文件
#
# 前提：DATABASE_URL 环境变量已设置
set -eu

MIGRATIONS_DIR="/migrations"

echo "=== 开始数据库迁移 ==="
echo "数据库: ${DATABASE_URL%%@*}@***"

# ── 确保追踪表存在（DO 块捕获并发竞态，彻底幂等） ────────────────────────────
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

# ── 引导检测：若追踪表为空但 brand_settings.erp_domain 已存在 ───────────────
# 说明数据库由旧版脚本（无追踪）迁移完毕，将所有迁移文件标记为已执行
tracking_count=$(psql "${DATABASE_URL}" -t -c \
    "SELECT COUNT(*) FROM schema_migrations;" | tr -d ' \n')

if [ "${tracking_count}" = "0" ]; then
    erp_domain_exists=$(psql "${DATABASE_URL}" -t -c "
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'brand_settings' AND column_name = 'erp_domain';
    " | tr -d ' \n')

    if [ "${erp_domain_exists}" = "1" ]; then
        echo "=== 引导模式：检测到已迁移数据库，标记所有迁移为已执行 ==="
        for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
            name=$(basename "$f")
            psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -c \
                "INSERT INTO schema_migrations (filename) VALUES ('${name}') ON CONFLICT DO NOTHING;"
            echo "  → 已标记: ${name}"
        done
        echo "=== 引导完成，继续执行 Seed ==="
        # 不在此 exit 0 — 继续执行下方的 Seed 段，确保默认数据始终写入
    fi
fi

# ── 正常迁移流程 ───────────────────────────────────────────────────────────
applied=0
skipped=0

for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    name=$(basename "$f")

    # 检查是否已执行
    count=$(psql "${DATABASE_URL}" -t -c \
        "SELECT COUNT(*) FROM schema_migrations WHERE filename = '${name}';" \
        | tr -d ' \n')

    if [ "${count}" = "1" ]; then
        echo "→ SKIP [已执行] ${name}"
        skipped=$((skipped + 1))
        continue
    fi

    echo "→ 执行 [${applied}] ${name}"
    # ON_ERROR_STOP=on：任何 SQL 错误立即退出 psql（非零退出码）
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -f "$f"

    # 记录已执行
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -c \
        "INSERT INTO schema_migrations (filename) VALUES ('${name}');"

    echo "  ✓ 完成"
    applied=$((applied + 1))
done

echo "=== 迁移完成：执行 ${applied} 个，跳过 ${skipped} 个 ==="

# ── Seed：初始化默认数据（在迁移完成后执行） ────────────────────────────────
SEEDS_DIR="${MIGRATIONS_DIR}/seeds"
if [ -d "${SEEDS_DIR}" ]; then
    echo "=== 开始 Seed 初始化 ==="
    seed_count=0
    for f in $(ls "${SEEDS_DIR}"/seed_*.sql 2>/dev/null | sort); do
        name=$(basename "$f")
        echo "→ Seed: ${name}"
        psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -f "$f"
        echo "  ✓ 完成"
        seed_count=$((seed_count + 1))
    done
    echo "=== Seed 完成：执行 ${seed_count} 个文件 ==="
fi
