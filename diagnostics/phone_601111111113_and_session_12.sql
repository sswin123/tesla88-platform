-- ============================================================
-- Tesla88 Production Diagnostic: phone 601111111113 + session 12
-- READ-ONLY queries — NO DML
-- Run against: erp_db (member_bot schema)
-- ============================================================

-- ── 1. Direct lookup by phone ─────────────────────────────────
SELECT id, public_id, phone, first_name, telegram_username, status, created_at
FROM users
WHERE phone = '601111111113';

-- ── 2. Fuzzy lookup (in case of whitespace / formatting) ──────
SELECT id, public_id, phone, first_name, status, created_at
FROM users
WHERE phone ILIKE '%601111111113%';

-- ── 3. Unique index definition (verify constraint scope) ──────
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users' AND indexname = 'users_phone_key';

-- ── 4. Dead-tuple count (corruption / WAL loss indicator) ─────
SELECT n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'users';

-- ── 5. Session 12 raw row ─────────────────────────────────────
SELECT id, user_id, guest_id, status, created_at, closed_at
FROM support_sessions
WHERE id = 12;

-- ── 6. Session 12 with user join (reveals NULL mismatch) ──────
SELECT
  ss.id            AS session_id,
  ss.user_id,
  ss.status        AS session_status,
  u.id             AS user_row_id,
  u.phone,
  u.first_name,
  u.status         AS user_status
FROM support_sessions ss
LEFT JOIN users u ON u.id = ss.user_id
WHERE ss.id = 12;

-- ── 7. All sessions belonging to session-12's user_id ─────────
-- (replace X with the user_id returned above)
-- SELECT id, status, created_at FROM support_sessions
-- WHERE user_id = X ORDER BY created_at;

-- ── 8. Check if phone exists in any other related table ───────
SELECT 'users' AS tbl, id::text, phone FROM users WHERE phone = '601111111113'
UNION ALL
SELECT 'bank_accounts', id::text, phone FROM bank_accounts WHERE phone = '601111111113'
  -- Remove the bank_accounts line if the table doesn't exist in this schema
;

-- ── 9. Index entries vs heap rows consistency check ───────────
-- If this returns 0 rows but "Phone already exists" is thrown,
-- the unique index is inconsistent with the heap.
SELECT ctid, id, phone FROM users WHERE phone = '601111111113';

-- ── 10. Check for any users with NULL first_name (data anomaly) ─
SELECT COUNT(*) AS users_with_null_first_name FROM users WHERE first_name IS NULL;

-- ── 11. Check for any sessions referencing non-existent users ─
SELECT ss.id AS session_id, ss.user_id
FROM support_sessions ss
LEFT JOIN users u ON u.id = ss.user_id
WHERE ss.user_id IS NOT NULL AND u.id IS NULL
ORDER BY ss.id;
