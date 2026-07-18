#!/usr/bin/env sh
# docker-migrate.sh  v2 — 智能预过滤，仅生成待执行文件的 SQL 块
#
# 优化策略（相比 v1）：
#   - v1：N 个文件 → 生成 N 个 BEGIN/INSERT/ROLLBACK/SKIP 块，O(n) psql mini-transaction
#   - v2：预查询 schema_migrations → shell 层过滤 → 只生成 M 个待执行块（M << N）
#         当所有 migration 已应用时：完全跳过 psql 执行（early exit）
#
# 保留特性：
#   - pg_advisory_lock：防止并发执行（Session 级，连接断开自动释放）
#   - INSERT ON CONFLICT DO NOTHING RETURNING + \gset + \if：并发安全（双重保护）
#   - BEGIN/COMMIT 包裹每个 Migration：失败自动回滚，其他不受影响
#   - Bootstrap：支持旧版 DB 首次引入迁移系统
#   - 支持部分应用（有空洞）：按文件名逐一比对，不依赖 MAX(filename)
set -eu

MIGRATIONS_DIR="/migrations"
SEEDS_DIR="${MIGRATIONS_DIR}/seeds"
TMP="/tmp/migrate-$$.sql"
APPLIED_MIG_TMP="/tmp/applied-mig-$$.txt"
APPLIED_SEED_TMP="/tmp/applied-seed-$$.txt"

trap 'rm -f "${TMP}" "${APPLIED_MIG_TMP}" "${APPLIED_SEED_TMP}"' EXIT

echo "=== OPULUX Migration Engine v2 ==="
echo "数据库: ${DATABASE_URL%%@*}@***"

# ════════════════════════════════════════════════════════════════════════════
# Phase 1 — 预查询已应用列表（schema_migrations 不存在时返回空，不报错）
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo ">>> [1/3] 查询已应用 Migration..."

psql "${DATABASE_URL}" -t -A \
    -c "SELECT filename FROM schema_migrations ORDER BY filename" \
    > "${APPLIED_MIG_TMP}" 2>/dev/null \
    || : > "${APPLIED_MIG_TMP}"   # 表不存在（首次部署）→ 空文件

psql "${DATABASE_URL}" -t -A \
    -c "SELECT filename FROM schema_seeds ORDER BY filename" \
    > "${APPLIED_SEED_TMP}" 2>/dev/null \
    || : > "${APPLIED_SEED_TMP}"

APPLIED_MIG_COUNT=$(grep -c . "${APPLIED_MIG_TMP}" 2>/dev/null || echo "0")
APPLIED_SEED_COUNT=$(grep -c . "${APPLIED_SEED_TMP}" 2>/dev/null || echo "0")

TOTAL_MIG_FILES=$(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | wc -l | tr -d ' ')

LAST_APPLIED="(none)"
[ "${APPLIED_MIG_COUNT}" -gt 0 ] && LAST_APPLIED=$(tail -1 "${APPLIED_MIG_TMP}")

printf "    已应用 Migration : %s / %s  (最新: %s)\n" \
    "${APPLIED_MIG_COUNT}" "${TOTAL_MIG_FILES}" "${LAST_APPLIED}"
printf "    已应用 Seed       : %s\n" "${APPLIED_SEED_COUNT}"

# ════════════════════════════════════════════════════════════════════════════
# Phase 2 — Shell 层过滤：确定待执行文件列表（支持空洞 / 部分应用）
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo ">>> [2/3] 分析待执行文件..."

PENDING_MIG_COUNT=0
for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    n=$(basename "${f}")
    if ! grep -qx "${n}" "${APPLIED_MIG_TMP}" 2>/dev/null; then
        PENDING_MIG_COUNT=$((PENDING_MIG_COUNT + 1))
        printf "    → 待执行: %s\n" "${n}"
    fi
done

PENDING_SEED_COUNT=0
if [ -d "${SEEDS_DIR}" ]; then
    for f in $(ls "${SEEDS_DIR}"/seed_*.sql 2>/dev/null | sort); do
        n=$(basename "${f}")
        if ! grep -qx "${n}" "${APPLIED_SEED_TMP}" 2>/dev/null; then
            PENDING_SEED_COUNT=$((PENDING_SEED_COUNT + 1))
        fi
    done
fi

printf "    待执行 Migration  : %s\n" "${PENDING_MIG_COUNT}"
printf "    待执行 Seed       : %s\n" "${PENDING_SEED_COUNT}"

# ════════════════════════════════════════════════════════════════════════════
# Phase 3 — 早退出：全部已应用且表确实存在（最快路径，零 psql 执行）
# ════════════════════════════════════════════════════════════════════════════
if [ "${PENDING_MIG_COUNT}" -eq 0 ] && \
   [ "${PENDING_SEED_COUNT}" -eq 0 ] && \
   [ "${APPLIED_MIG_COUNT}" -gt 0 ]; then
    echo ""
    echo "=== 所有 Migration 均已应用（${APPLIED_MIG_COUNT} 个），跳过执行 ==="
    echo "=== 迁移完成，退出 0 ==="
    exit 0
fi

# ════════════════════════════════════════════════════════════════════════════
# Phase 4 — 生成 SQL 脚本（仅包含待执行文件的块）
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo ">>> [3/3] 生成并执行 SQL（${PENDING_MIG_COUNT} Migration + ${PENDING_SEED_COUNT} Seed）..."

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

# ── Bootstrap：处理旧版 DB 首次引入迁移系统（VALUES 仍包含所有文件）──────────────
# 触发条件：schema_migrations 为空 AND brand_settings.erp_domain 已存在
# 目的：标记所有文件为"已应用"，避免在已有 Schema 的 DB 上重复运行
bootstrap_vals=""
for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    n=$(basename "${f}")
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

# ── Migration 块：仅生成待执行文件的 SQL（跳过已应用文件，不生成任何 SQL）─────────
for f in $(ls "${MIGRATIONS_DIR}"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
    n=$(basename "${f}")

    # 已应用的文件：完全跳过，不生成 BEGIN/ROLLBACK/SKIP（这是核心优化）
    if grep -qx "${n}" "${APPLIED_MIG_TMP}" 2>/dev/null; then
        continue
    fi

    # 待执行文件：生成 BEGIN/INSERT/\if/COMMIT 块
    # 保留 ON CONFLICT 双重保护（应对极罕见的并发部署竞争）
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
    printf "\\\\echo '-> SKIP (并发保护): %s'\n" "${n}"                             >> "${TMP}"
    printf '\\endif\n'                                                               >> "${TMP}"
done

printf '\n' >> "${TMP}"
printf "\\\\echo '=== Migration 完成 ==='\n" >> "${TMP}"

# ── Seed 块：仅生成待执行 Seed 的 SQL ────────────────────────────────────────
if [ -d "${SEEDS_DIR}" ]; then
    printf '\n' >> "${TMP}"
    printf "\\\\echo '=== 开始 Seed 初始化 ==='\n" >> "${TMP}"

    for f in $(ls "${SEEDS_DIR}"/seed_*.sql 2>/dev/null | sort); do
        n=$(basename "${f}")

        if grep -qx "${n}" "${APPLIED_SEED_TMP}" 2>/dev/null; then
            continue
        fi

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
        printf "\\\\echo '-> SKIP (并发保护): %s'\n" "${n}"                             >> "${TMP}"
        printf '\\endif\n'                                                               >> "${TMP}"
    done

    printf '\n' >> "${TMP}"
    printf "\\\\echo '=== Seed 完成 ==='\n" >> "${TMP}"
fi

# ── Footer：释放 advisory lock ────────────────────────────────────────────────
cat >> "${TMP}" << 'FOOTER'

SELECT pg_advisory_unlock(20250715);
FOOTER

# ── 单次 psql 会话执行（advisory lock 全程持有）─────────────────────────────────
psql "${DATABASE_URL}" -v ON_ERROR_STOP=on -f "${TMP}"
echo "=== 迁移完成，退出 0 ==="
