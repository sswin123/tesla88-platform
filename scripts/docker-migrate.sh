#!/usr/bin/env sh
# docker-migrate.sh — 在 migrate 容器内按顺序执行所有编号 SQL 迁移。
#
# 行为：
#   - 任何 SQL 语句报错 → 立即退出，返回非零退出码
#   - 不使用 || true，不忽略任何错误
#   - 仅执行匹配 [0-9][0-9][0-9]_*.sql 的文件（跳过 phase4_catchup.sql 等特殊文件）
#
# 前提：DATABASE_URL 环境变量已设置
set -eu

MIGRATIONS_DIR="/migrations"

echo "=== 开始数据库迁移 ==="
echo "数据库: ${DATABASE_URL%%@*}@***"

count=0
for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    count=$((count + 1))
    name=$(basename "$f")
    echo "→ [${count}] ${name}"
    # ON_ERROR_STOP=on：任何 SQL 错误立即退出 psql（非零退出码）
    # set -e 确保 psql 非零退出时 shell 脚本立即终止
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -f "$f"
    echo "  ✓ 完成"
done

echo "=== 迁移完成：共执行 ${count} 个文件 ==="
