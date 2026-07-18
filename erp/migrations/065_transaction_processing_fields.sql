-- Migration 065: Multi-CS Transaction Workflow
-- Adds processing_by/at, approved_by/at, rejected_by/at columns
-- Extends status to include PROCESSING

-- ── deposit_requests ──────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'deposit_requests'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%PENDING%'
  LOOP
    EXECUTE format('ALTER TABLE deposit_requests DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  ALTER TABLE deposit_requests
    ADD CONSTRAINT deposit_requests_status_check
    CHECK (status IN ('PENDING','PROCESSING','APPROVED','REJECTED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE deposit_requests
  ADD COLUMN IF NOT EXISTS processing_by INT,
  ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by   INT,
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by   INT,
  ADD COLUMN IF NOT EXISTS rejected_at   TIMESTAMPTZ;

-- ── withdrawal_requests ───────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'withdrawal_requests'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%PENDING%'
  LOOP
    EXECUTE format('ALTER TABLE withdrawal_requests DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  ALTER TABLE withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_status_check
    CHECK (status IN ('PENDING','PROCESSING','PAID','REJECTED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS processing_by INT,
  ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by   INT,
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by   INT,
  ADD COLUMN IF NOT EXISTS rejected_at   TIMESTAMPTZ;
