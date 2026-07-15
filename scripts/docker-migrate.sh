#!/usr/bin/env sh
# docker-migrate.sh — 在 migrate 容器内执行，按顺序运行所有编号 SQL 迁移。
# 所有迁移均使用 IF NOT EXISTS / ON CONFLICT DO NOTHING，可安全重复执行。
set -eu

MIGRATIONS_DIR="/migrations"

echo "=== 数据库迁移开始 ==="

count=0
warnings=0

for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    count=$((count + 1))
    name=$(basename "$f")
    echo "→ 执行: ${name}"
    psql "${DATABASE_URL}" \
        --set ON_ERROR_STOP=0 \
        --quiet \
        -f "$f" 2>&1 \
        || warnings=$((warnings + 1))
    echo "  完成: ${name}"
done

echo "=== 迁移完成：共 ${count} 个文件，${warnings} 个有警告 ==="
