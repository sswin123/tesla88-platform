import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

// ── GET: migration status + database health check ───────────────────────────
export async function GET() {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Applied migrations — graceful if schema_migrations table doesn't exist
  let appliedList: { filename: string; applied_at: string }[] = [];
  try {
    const tableExists = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name='schema_migrations'
      ) AS exists`
    );
    if (tableExists.rows[0].exists) {
      const migrationsRes = await pool.query<{ filename: string; applied_at: string }>(
        `SELECT filename, applied_at::text FROM schema_migrations ORDER BY filename ASC`
      );
      appliedList = migrationsRes.rows;
    }
  } catch { /* table missing — return empty */ }

  // Database health: check columns/triggers/tables
  const [
    pendingWdRes, availBalRes, triggerRes,
    malTableRes, wtTableRes, wtRefColRes,
  ] = await Promise.all([
    pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='pending_withdrawal'
      ) AS exists`),
    pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='available_balance'
      ) AS exists`),
    pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name='trg_withdrawal_pending'
      ) AS exists`),
    pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name='member_activity_logs'
      ) AS exists`),
    pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name='wallet_transactions'
      ) AS exists`),
    pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='wallet_transactions' AND column_name='reference_type'
      ) AS exists`),
  ]);

  const health = {
    users_pending_withdrawal:   pendingWdRes.rows[0].exists,
    users_available_balance:    availBalRes.rows[0].exists,
    trg_withdrawal_pending:     triggerRes.rows[0].exists,
    table_member_activity_logs: malTableRes.rows[0].exists,
    table_wallet_transactions:  wtTableRes.rows[0].exists,
    wt_reference_columns:       wtRefColRes.rows[0].exists,
  };

  return NextResponse.json({
    applied: appliedList,
    applied_count: appliedList.length,
    health,
  });
}

// ── POST: apply all pending schema migrations ────────────────────────────────
// Each block is idempotent (IF NOT EXISTS / OR REPLACE) — safe to re-run.
export async function POST() {
  const payload = await requirePermission('brand.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results: { migration: string; status: 'ok' | 'error'; detail?: string }[] = [];

  function ok(migration: string) { results.push({ migration, status: 'ok' }); }
  function err(migration: string, e: unknown) {
    results.push({ migration, status: 'error', detail: String(e) });
  }

  // ── Migration 024: theme color columns ──────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_bg   TEXT NOT NULL DEFAULT '#0a0b14'`);
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_card TEXT NOT NULL DEFAULT '#111222'`);
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_text TEXT NOT NULL DEFAULT '#e8e8f5'`);
    ok('024_theme_colors');
  } catch (e) { err('024_theme_colors', e); }

  // ── Migration 025: logo size and alignment ──────────────────────────────────
  try {
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS logo_size  VARCHAR(10) NOT NULL DEFAULT 'medium'`);
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS logo_align VARCHAR(10) NOT NULL DEFAULT 'left'`);
    ok('025_logo_settings');
  } catch (e) { err('025_logo_settings', e); }

  // ── Migration 062: Member Activity Log ─────────────────────────────────────
  try {
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS member_activity_seq START 1`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS member_activity_logs (
        id               BIGSERIAL    PRIMARY KEY,
        activity_id      VARCHAR(20)  NOT NULL DEFAULT '',
        member_id        INTEGER      NOT NULL REFERENCES users(id),
        category         VARCHAR(30)  NOT NULL,
        action           VARCHAR(80)  NOT NULL,
        title            VARCHAR(200) NOT NULL,
        description      TEXT,
        amount           NUMERIC(15,2),
        balance_before   NUMERIC(15,2),
        balance_after    NUMERIC(15,2),
        reference_type   VARCHAR(30),
        reference_id     BIGINT,
        operator_type    VARCHAR(10)  NOT NULL DEFAULT 'SYSTEM'
                           CHECK (operator_type IN ('MEMBER','STAFF','SYSTEM')),
        operator_id      INTEGER,
        operator_name    VARCHAR(100),
        source           VARCHAR(20)  NOT NULL DEFAULT 'SYSTEM'
                           CHECK (source IN ('WEBSITE','ERP','TELEGRAM','API','PAYMENT_GATEWAY','SYSTEM')),
        level            VARCHAR(10)  NOT NULL DEFAULT 'INFO'
                           CHECK (level IN ('INFO','WARNING','CRITICAL')),
        ip_address       TEXT,
        device           TEXT,
        remark           TEXT,
        metadata         JSONB,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE OR REPLACE FUNCTION set_member_activity_id()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        NEW.activity_id := 'ACT' || LPAD(nextval('member_activity_seq')::text, 8, '0');
        RETURN NEW;
      END;
      $$`);
    await pool.query(`DROP TRIGGER IF EXISTS trg_member_activity_id ON member_activity_logs`);
    await pool.query(`
      CREATE TRIGGER trg_member_activity_id
        BEFORE INSERT ON member_activity_logs
        FOR EACH ROW EXECUTE FUNCTION set_member_activity_id()`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mal_member   ON member_activity_logs(member_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mal_category ON member_activity_logs(category)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mal_created  ON member_activity_logs(created_at DESC)`);
    ok('062_member_activity_log');
  } catch (e) { err('062_member_activity_log', e); }

  // ── Migration 063: Enterprise Withdrawal Balance Architecture ───────────────
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_withdrawal NUMERIC(15,2) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_pending_withdrawal_non_negative`);
    await pool.query(`ALTER TABLE users ADD CONSTRAINT chk_pending_withdrawal_non_negative CHECK (pending_withdrawal >= 0)`);
    ok('063a_pending_withdrawal_col');
  } catch (e) { err('063a_pending_withdrawal_col', e); }

  try {
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS available_balance NUMERIC(15,2)
          GENERATED ALWAYS AS (total_deposit - total_withdraw - pending_withdrawal) STORED`);
    ok('063b_available_balance_col');
  } catch (e) { err('063b_available_balance_col', e); }

  try {
    await pool.query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reference_type VARCHAR(30)`);
    await pool.query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reference_id   BIGINT`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wt_reference
        ON wallet_transactions(reference_type, reference_id)
        WHERE reference_type IS NOT NULL`);
    ok('063c_wallet_tx_reference_cols');
  } catch (e) { err('063c_wallet_tx_reference_cols', e); }

  try {
    await pool.query(`
      CREATE OR REPLACE FUNCTION trg_fn_withdrawal_pending()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' AND NEW.status = 'PENDING' THEN
          UPDATE users SET pending_withdrawal = pending_withdrawal + NEW.withdraw_amount WHERE id = NEW.user_id;
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'PENDING' AND NEW.status IN ('PAID', 'REJECTED') THEN
          UPDATE users SET pending_withdrawal = GREATEST(0, pending_withdrawal - OLD.withdraw_amount) WHERE id = NEW.user_id;
          RETURN NEW;
        END IF;
        RETURN NEW;
      END;
      $$`);
    await pool.query(`DROP TRIGGER IF EXISTS trg_withdrawal_pending ON withdrawal_requests`);
    await pool.query(`
      CREATE TRIGGER trg_withdrawal_pending
        AFTER INSERT OR UPDATE OF status ON withdrawal_requests
        FOR EACH ROW EXECUTE FUNCTION trg_fn_withdrawal_pending()`);
    ok('063d_withdrawal_trigger');
  } catch (e) { err('063d_withdrawal_trigger', e); }

  try {
    await pool.query(`
      UPDATE users u
      SET pending_withdrawal = COALESCE((
        SELECT SUM(withdraw_amount) FROM withdrawal_requests wr
        WHERE wr.user_id = u.id AND wr.status = 'PENDING'
      ), 0)`);
    ok('063e_backfill_pending');
  } catch (e) { err('063e_backfill_pending', e); }

  // ── Migration 064: Withdrawal receipt + reject_reason ─────────────────────
  try {
    await pool.query(`
      ALTER TABLE withdrawal_requests
        ADD COLUMN IF NOT EXISTS receipt_media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL`);
    ok('064_withdrawal_receipt');
  } catch (e) { err('064_withdrawal_receipt', e); }

  // ── Migration 065: Multi-CS Transaction Workflow ────────────────────────────
  try {
    // Drop old status CHECK constraints and add PROCESSING
    await pool.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT conname FROM pg_constraint
          WHERE conrelid = 'deposit_requests'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%PENDING%'
        LOOP EXECUTE format('ALTER TABLE deposit_requests DROP CONSTRAINT %I', r.conname); END LOOP;
      END $$`);
    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE deposit_requests ADD CONSTRAINT deposit_requests_status_check
          CHECK (status IN ('PENDING','PROCESSING','APPROVED','REJECTED'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`);
    await pool.query(`
      ALTER TABLE deposit_requests
        ADD COLUMN IF NOT EXISTS processing_by INT,
        ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS approved_by   INT,
        ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS rejected_by   INT,
        ADD COLUMN IF NOT EXISTS rejected_at   TIMESTAMPTZ`);
    ok('065a_deposit_processing_cols');
  } catch (e) { err('065a_deposit_processing_cols', e); }

  try {
    await pool.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT conname FROM pg_constraint
          WHERE conrelid = 'withdrawal_requests'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%PENDING%'
        LOOP EXECUTE format('ALTER TABLE withdrawal_requests DROP CONSTRAINT %I', r.conname); END LOOP;
      END $$`);
    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_requests_status_check
          CHECK (status IN ('PENDING','PROCESSING','PAID','REJECTED'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`);
    await pool.query(`
      ALTER TABLE withdrawal_requests
        ADD COLUMN IF NOT EXISTS processing_by INT,
        ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS approved_by   INT,
        ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS rejected_by   INT,
        ADD COLUMN IF NOT EXISTS rejected_at   TIMESTAMPTZ`);
    ok('065b_withdrawal_processing_cols');
  } catch (e) { err('065b_withdrawal_processing_cols', e); }

  // ── Migration 066: Fix pending_withdrawal trigger for PROCESSING status ─────
  try {
    await pool.query(`
      CREATE OR REPLACE FUNCTION trg_fn_withdrawal_pending()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' AND NEW.status = 'PENDING' THEN
          UPDATE users SET pending_withdrawal = pending_withdrawal + NEW.withdraw_amount WHERE id = NEW.user_id;
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE'
           AND OLD.status IN ('PENDING', 'PROCESSING')
           AND NEW.status IN ('PAID', 'REJECTED') THEN
          UPDATE users SET pending_withdrawal = GREATEST(0, pending_withdrawal - OLD.withdraw_amount) WHERE id = NEW.user_id;
          RETURN NEW;
        END IF;
        RETURN NEW;
      END;
      $$`);
    ok('066_fix_withdrawal_trigger');
  } catch (e) { err('066_fix_withdrawal_trigger', e); }

  return NextResponse.json({ ok: true, results });
}
