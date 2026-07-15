#!/usr/bin/env sh
# docker-migrate.sh
# 设计原则：生成单一 SQL 脚本，单次 psql 会话执行
#   - pg_advisory_lock：防止并发运行（Session 级别，自动释放）
#   - INSERT ON CONFLICT DO NOTHING RETURNING + \gset + \if：SQL 原子决定执行/跳过
#   - BEGIN/COMMIT 包裹每个 Migration/Seed：失败自动回滚
#   - Shell 不做任何字符串比较，不读取 psql 输出
set -eu

MIGRATIONS_DIR="/migrations"
SEEDS_DIR="${MIGRATIONS_DIR}/seeds"
TMP="/tmp/migrate-$$.sql"

echo "=== 开始数据库迁移 ==="
echo "数据库: ${DATABASE_URL%%@*}@***"

trap 'rm -f "${TMP}"' EXIT

# ── Preamble：advisory lock + 建立追踪表 ─────────────────────────────────────
cat > "${TMP}" << 'PREAMBLE'
SELECT pg_advisory_lock(20250715);

DO $tbl$
BEGIN
    CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
EXCEPTION WHEN unique_violation OR duplicate_table THEN NULL;
END $tbl$;

DO $tbl$
BEGIN
    CREATE TABLE IF NOT EXISTS schema_seeds (
        filename    VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
EXCEPTION WHEN unique_violation OR duplicate_table THEN NULL;
END $tbl$;
PREAMBLE

# ── Bootstrap：构建 VALUES 列表 ───────────────────────────────────────────────
bootstrap_vals=""
for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    n=$(basename "$f")
    if [ -n "${bootstrap_vals}" ]; then
        bootstrap_vals="${bootstrap_vals},"
    fi
    bootstrap_vals="${bootstrap_vals}
            ('${n}')"
done

cat >> "${TMP}" << BOOTSTRAP

DO \$boot\$
BEGIN
    IF (SELECT COUNT(*) FROM schema_migrations) = 0
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'brand_settings' AND column_name = 'erp_domain'
       ) THEN
        INSERT INTO schema_migrations (filename) VALUES
            ${bootstrap_vals}
        ON CONFLICT DO NOTHING;
        RAISE NOTICE '引导模式：已标记所有 Migration 为已执行';
    END IF;
END \$boot\$;
BOOTSTRAP

printf '\n' >> "${TMP}"
printf "\\\\echo '=== 开始 Migration ==='\n" >> "${TMP}"

# ── Migration 块：每个文件 = BEGIN + CTE INSERT + \gset + \if + \i + COMMIT/ROLLBACK
for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    n=$(basename "$f")
    printf '\nBEGIN;\n'                                                              >> "${TMP}"
    printf 'WITH c AS (\n'                                                           >> "${TMP}"
    printf "    INSERT INTO schema_migrations (filename) VALUES ('%s')\n" "${n}"     >> "${TMP}"
    printf '    ON CONFLICT DO NOTHING RETURNING filename\n'                         >> "${TMP}"
    printf ')\n'                                                                     >> "${TMP}"
    printf 'SELECT (COUNT(*) > 0)::text AS run FROM c \\gset\n'                     >> "${TMP}"
    printf '\\if :run\n'                                                             >> "${TMP}"
    printf "\\\\echo '-> 执行: %s'\n" "${n}"                                        >> "${TMP}"
    printf "\\\\i %s\n" "${f}"                                                       >> "${TMP}"
    printf 'COMMIT;\n'                                                               >> "${TMP}"
    printf "\\\\echo '  v 完成'\n"                                                   >> "${TMP}"
    printf '\\else\n'                                                                >> "${TMP}"
    printf 'ROLLBACK;\n'                                                             >> "${TMP}"
    printf "\\\\echo '-> SKIP: %s'\n" "${n}"                                        >> "${TMP}"
    printf '\\endif\n'                                                               >> "${TMP}"
done

printf '\n' >> "${TMP}"
printf "\\\\echo '=== Migration 完成 ==='\n" >> "${TMP}"

# ── Seed 块 ──────────────────────────────────────────────────────────────────
if [ -d "${SEEDS_DIR}" ]; then
    printf '\n' >> "${TMP}"
    printf "\\\\echo '=== 开始 Seed 初始化 ==='\n" >> "${TMP}"

    for f in $(ls "${SEEDS_DIR}"/seed_*.sql 2>/dev/null | sort); do
        n=$(basename "$f")
        printf '\nBEGIN;\n'                                                              >> "${TMP}"
        printf 'WITH c AS (\n'                                                           >> "${TMP}"
        printf "    INSERT INTO schema_seeds (filename) VALUES ('%s')\n" "${n}"          >> "${TMP}"
        printf '    ON CONFLICT DO NOTHING RETURNING filename\n'                         >> "${TMP}"
        printf ')\n'                                                                     >> "${TMP}"
        printf 'SELECT (COUNT(*) > 0)::text AS run FROM c \\gset\n'                     >> "${TMP}"
        printf '\\if :run\n'                                                             >> "${TMP}"
        printf "\\\\echo '-> Seed: %s'\n" "${n}"                                        >> "${TMP}"
        printf "\\\\i %s\n" "${f}"                                                       >> "${TMP}"
        printf 'COMMIT;\n'                                                               >> "${TMP}"
        printf "\\\\echo '  v 完成'\n"                                                   >> "${TMP}"
        printf '\\else\n'                                                                >> "${TMP}"
        printf 'ROLLBACK;\n'                                                             >> "${TMP}"
        printf "\\\\echo '-> SKIP: %s'\n" "${n}"                                        >> "${TMP}"
        printf '\\endif\n'                                                               >> "${TMP}"
    done

    printf '\n' >> "${TMP}"
    printf "\\\\echo '=== Seed 完成 ==='\n" >> "${TMP}"
fi

# ── Footer ───────────────────────────────────────────────────────────────────
cat >> "${TMP}" << 'FOOTER'

SELECT pg_advisory_unlock(20250715);
FOOTER

# ── 单次 psql 会话执行（advisory lock 全程持有）─────────────────────────────
echo "=== 执行 SQL 脚本 ==="
psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -f "${TMP}"
echo "=== 迁移完成，退出 0 ==="
