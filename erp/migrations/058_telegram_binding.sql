-- Migration 058: Multi-channel registration — Telegram binding is optional
--
-- Three registration paths now supported:
--   ERP:      telegram_id = NULL,               register_source = 'ERP'
--   Website:  telegram_id = NULL,               register_source = 'WEBSITE'
--   Telegram: telegram_id = Telegram User ID,   register_source = 'TELEGRAM'
--
-- History: db/migrations/029_website_registration.sql contained the same
-- column changes but lived outside erp/migrations/ (which migrate.sh targets).
-- This migration ports those changes into the ERP migration system.
--
-- PostgreSQL UNIQUE on a nullable column: multiple NULLs are treated as
-- distinct values, so the uniqueness guarantee on telegram_id is preserved.

-- ── 1. telegram_id: nullable — not all members have Telegram ─────────────────
DO $$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name = 'telegram_id') = 'NO'
  THEN
    ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;
    RAISE NOTICE '[058] users.telegram_id: NOT NULL removed — Telegram binding is now optional';
  ELSE
    RAISE NOTICE '[058] users.telegram_id: already nullable — skipped';
  END IF;
END $$;

-- ── 2. bank fields: nullable — bank info filled via profile after signup ──────
DO $$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name = 'bank_name') = 'NO'
  THEN
    ALTER TABLE users ALTER COLUMN bank_name DROP NOT NULL;
    RAISE NOTICE '[058] users.bank_name: NOT NULL removed';
  ELSE
    RAISE NOTICE '[058] users.bank_name: already nullable — skipped';
  END IF;
END $$;

DO $$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name = 'bank_account') = 'NO'
  THEN
    ALTER TABLE users ALTER COLUMN bank_account DROP NOT NULL;
    RAISE NOTICE '[058] users.bank_account: NOT NULL removed';
  ELSE
    RAISE NOTICE '[058] users.bank_account: already nullable — skipped';
  END IF;
END $$;

DO $$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name = 'bank_holder_name') = 'NO'
  THEN
    ALTER TABLE users ALTER COLUMN bank_holder_name DROP NOT NULL;
    RAISE NOTICE '[058] users.bank_holder_name: NOT NULL removed';
  ELSE
    RAISE NOTICE '[058] users.bank_holder_name: already nullable — skipped';
  END IF;
END $$;

-- ── 3. register_source: add TELEGRAM to CHECK constraint ─────────────────────
-- Migration 052 added CHECK (register_source IN ('ERP', 'WEBSITE', 'BOT', 'API')).
-- We need to add 'TELEGRAM' for Bot-registered members.
DO $$
DECLARE
  v_cname       TEXT;
  v_check_clause TEXT;
BEGIN
  SELECT tc.constraint_name, cc.check_clause
    INTO v_cname, v_check_clause
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc
    ON cc.constraint_name = tc.constraint_name
   AND cc.constraint_schema = tc.constraint_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name   = 'users'
    AND cc.check_clause LIKE '%register_source%'
  LIMIT 1;

  -- Already includes TELEGRAM — nothing to do
  IF v_check_clause LIKE '%TELEGRAM%' THEN
    RAISE NOTICE '[058] register_source constraint already includes TELEGRAM — skipped';
    RETURN;
  END IF;

  -- Drop old constraint if one exists
  IF v_cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(v_cname);
    RAISE NOTICE '[058] Dropped register_source constraint: %', v_cname;
  END IF;

  ALTER TABLE users
    ADD CONSTRAINT users_register_source_check
    CHECK (register_source IN ('ERP', 'WEBSITE', 'BOT', 'API', 'TELEGRAM'));
  RAISE NOTICE '[058] register_source constraint updated to include TELEGRAM';
END $$;

-- ── 4. Backfill: fix Bot-registered members whose register_source = WEBSITE ───
-- When migration 052 ran on an existing DB it set DEFAULT = WEBSITE for all rows.
-- Any user with telegram_id set but register_source = WEBSITE was actually
-- registered via the Telegram Bot — correct them to TELEGRAM.
-- Website/ERP registrations do not set telegram_id, so the condition is safe.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE users
     SET register_source = 'TELEGRAM'
   WHERE telegram_id IS NOT NULL
     AND register_source = 'WEBSITE';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE '[058] Backfilled % member(s): register_source WEBSITE → TELEGRAM', v_count;
  ELSE
    RAISE NOTICE '[058] Backfill: no rows needed updating';
  END IF;
END $$;
