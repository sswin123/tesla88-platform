import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

// One-time migration runner for additive schema changes.
// Each block is idempotent (IF NOT EXISTS / OR REPLACE) — safe to re-run.
// Only super-admins can trigger this.
export async function POST() {
  const payload = await requirePermission('brand.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results: string[] = [];

  // ── Migration 024: theme color columns ──────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_bg   TEXT NOT NULL DEFAULT '#0a0b14'`);
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_card TEXT NOT NULL DEFAULT '#111222'`);
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_text TEXT NOT NULL DEFAULT '#e8e8f5'`);
    results.push('024_theme_colors: OK');
  } catch (e) { results.push(`024_theme_colors: ERROR — ${String(e)}`); }

  // ── Migration 025: logo size and alignment ──────────────────────────────────
  try {
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS logo_size  VARCHAR(10) NOT NULL DEFAULT 'medium'`);
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS logo_align VARCHAR(10) NOT NULL DEFAULT 'left'`);
    results.push('025_logo_settings: OK');
  } catch (e) { results.push(`025_logo_settings: ERROR — ${String(e)}`); }

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
      )
    `);
    await pool.query(`
      CREATE OR REPLACE FUNCTION set_member_activity_id()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        NEW.activity_id := 'ACT' || LPAD(nextval('member_activity_seq')::text, 8, '0');
        RETURN NEW;
      END;
      $$
    `);
    await pool.query(`DROP TRIGGER IF EXISTS trg_member_activity_id ON member_activity_logs`);
    await pool.query(`
      CREATE TRIGGER trg_member_activity_id
        BEFORE INSERT ON member_activity_logs
        FOR EACH ROW EXECUTE FUNCTION set_member_activity_id()
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mal_member ON member_activity_logs(member_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mal_category ON member_activity_logs(category)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mal_created ON member_activity_logs(created_at DESC)`);
    results.push('062_member_activity_log: OK');
  } catch (e) { results.push(`062_member_activity_log: ERROR — ${String(e)}`); }

  // ── Migration 063: Enterprise Withdrawal Balance Architecture ───────────────
  try {
    // Step 1: pending_withdrawal column
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_withdrawal NUMERIC(15,2) NOT NULL DEFAULT 0`);
    await pool.query(`
      ALTER TABLE users
        DROP CONSTRAINT IF EXISTS chk_pending_withdrawal_non_negative
    `);
    await pool.query(`
      ALTER TABLE users
        ADD CONSTRAINT chk_pending_withdrawal_non_negative
          CHECK (pending_withdrawal >= 0)
    `);
    results.push('063_pending_withdrawal_col: OK');
  } catch (e) { results.push(`063_pending_withdrawal_col: ERROR — ${String(e)}`); }

  try {
    // Step 2: available_balance GENERATED column
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS available_balance NUMERIC(15,2)
          GENERATED ALWAYS AS (total_deposit - total_withdraw - pending_withdrawal) STORED
    `);
    results.push('063_available_balance_col: OK');
  } catch (e) { results.push(`063_available_balance_col: ERROR — ${String(e)}`); }

  try {
    // Step 3: wallet_transactions reference columns
    await pool.query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reference_type VARCHAR(30)`);
    await pool.query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reference_id   BIGINT`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wt_reference
        ON wallet_transactions(reference_type, reference_id)
        WHERE reference_type IS NOT NULL
    `);
    results.push('063_wallet_tx_reference_cols: OK');
  } catch (e) { results.push(`063_wallet_tx_reference_cols: ERROR — ${String(e)}`); }

  try {
    // Step 4: DB trigger for automatic pending_withdrawal management
    await pool.query(`
      CREATE OR REPLACE FUNCTION trg_fn_withdrawal_pending()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' AND NEW.status = 'PENDING' THEN
          UPDATE users
            SET pending_withdrawal = pending_withdrawal + NEW.withdraw_amount
            WHERE id = NEW.user_id;
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE'
           AND OLD.status = 'PENDING'
           AND NEW.status IN ('PAID', 'REJECTED') THEN
          UPDATE users
            SET pending_withdrawal = GREATEST(0, pending_withdrawal - OLD.withdraw_amount)
            WHERE id = NEW.user_id;
          RETURN NEW;
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await pool.query(`DROP TRIGGER IF EXISTS trg_withdrawal_pending ON withdrawal_requests`);
    await pool.query(`
      CREATE TRIGGER trg_withdrawal_pending
        AFTER INSERT OR UPDATE OF status ON withdrawal_requests
        FOR EACH ROW EXECUTE FUNCTION trg_fn_withdrawal_pending()
    `);
    results.push('063_withdrawal_trigger: OK');
  } catch (e) { results.push(`063_withdrawal_trigger: ERROR — ${String(e)}`); }

  try {
    // Step 5: Backfill pending_withdrawal from existing PENDING requests
    await pool.query(`
      UPDATE users u
      SET pending_withdrawal = COALESCE((
        SELECT SUM(withdraw_amount)
        FROM withdrawal_requests wr
        WHERE wr.user_id = u.id AND wr.status = 'PENDING'
      ), 0)
    `);
    results.push('063_backfill_pending: OK');
  } catch (e) { results.push(`063_backfill_pending: ERROR — ${String(e)}`); }

  return NextResponse.json({ ok: true, results });
}
