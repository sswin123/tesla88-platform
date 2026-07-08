-- erp/migrations/032_permissions.sql
-- Phase 5.9 — Staff Permission System
-- Depends on: set_updated_at() trigger from migration 027

CREATE TABLE IF NOT EXISTS role_permissions (
  id          SERIAL       PRIMARY KEY,
  role        VARCHAR(20)  NOT NULL,
  permission  VARCHAR(60)  NOT NULL,
  granted     BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_by  VARCHAR(100),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (role, permission)
);

CREATE INDEX IF NOT EXISTS idx_rp_role ON role_permissions(role);

CREATE TRIGGER set_role_permissions_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: default permissions matching current hardcoded PAGE_ACCESS behavior.
-- SUPER_ADMIN never needs rows here — engine bypasses the table unconditionally.
-- Only insert rows where granted = TRUE; absence of a row means "denied".
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO role_permissions (role, permission, granted) VALUES

  -- dashboard.view  (/  → CS / SUPPORT / FINANCE / SUPERVISOR / ADMIN)
  ('CS',         'dashboard.view', TRUE),
  ('SUPPORT',    'dashboard.view', TRUE),
  ('FINANCE',    'dashboard.view', TRUE),
  ('SUPERVISOR', 'dashboard.view', TRUE),
  ('ADMIN',      'dashboard.view', TRUE),

  -- members.view  (/members  → FINANCE / SUPPORT / SUPERVISOR / ADMIN)
  ('FINANCE',    'members.view', TRUE),
  ('SUPPORT',    'members.view', TRUE),
  ('SUPERVISOR', 'members.view', TRUE),
  ('ADMIN',      'members.view', TRUE),

  -- members.edit  (actions on /members  → SUPERVISOR / ADMIN)
  ('SUPERVISOR', 'members.edit', TRUE),
  ('ADMIN',      'members.edit', TRUE),

  -- deposit.view  (/deposits  → FINANCE / SUPERVISOR / ADMIN)
  ('FINANCE',    'deposit.view', TRUE),
  ('SUPERVISOR', 'deposit.view', TRUE),
  ('ADMIN',      'deposit.view', TRUE),

  -- deposit.manage  (approve / reject deposits  → FINANCE / SUPERVISOR / ADMIN)
  ('FINANCE',    'deposit.manage', TRUE),
  ('SUPERVISOR', 'deposit.manage', TRUE),
  ('ADMIN',      'deposit.manage', TRUE),

  -- withdraw.view  (/withdrawals  → FINANCE / SUPERVISOR / ADMIN)
  ('FINANCE',    'withdraw.view', TRUE),
  ('SUPERVISOR', 'withdraw.view', TRUE),
  ('ADMIN',      'withdraw.view', TRUE),

  -- withdraw.manage  (approve / reject withdrawals  → FINANCE / SUPERVISOR / ADMIN)
  ('FINANCE',    'withdraw.manage', TRUE),
  ('SUPERVISOR', 'withdraw.manage', TRUE),
  ('ADMIN',      'withdraw.manage', TRUE),

  -- livechat.view  (/livechat  → CS / SUPPORT / SUPERVISOR / ADMIN)
  ('CS',         'livechat.view', TRUE),
  ('SUPPORT',    'livechat.view', TRUE),
  ('SUPERVISOR', 'livechat.view', TRUE),
  ('ADMIN',      'livechat.view', TRUE),

  -- livechat.manage  (close / assign sessions  → SUPPORT / SUPERVISOR / ADMIN)
  ('SUPPORT',    'livechat.manage', TRUE),
  ('SUPERVISOR', 'livechat.manage', TRUE),
  ('ADMIN',      'livechat.manage', TRUE),

  -- finance.view  (/finance  → FINANCE / SUPERVISOR / ADMIN)
  ('FINANCE',    'finance.view', TRUE),
  ('SUPERVISOR', 'finance.view', TRUE),
  ('ADMIN',      'finance.view', TRUE),

  -- analytics.view  (/analytics  → FINANCE / SUPERVISOR / ADMIN)
  ('FINANCE',    'analytics.view', TRUE),
  ('SUPERVISOR', 'analytics.view', TRUE),
  ('ADMIN',      'analytics.view', TRUE),

  -- risk.view  (/risk  → SUPERVISOR / ADMIN)
  ('SUPERVISOR', 'risk.view', TRUE),
  ('ADMIN',      'risk.view', TRUE),

  -- announcements.manage  (/announcements  → SUPERVISOR / ADMIN)
  ('SUPERVISOR', 'announcements.manage', TRUE),
  ('ADMIN',      'announcements.manage', TRUE),

  -- promotions.manage  (/promotions  → ADMIN)
  ('ADMIN',      'promotions.manage', TRUE),

  -- broadcast.manage  (broadcast center  → SUPERVISOR / ADMIN)
  ('SUPERVISOR', 'broadcast.manage', TRUE),
  ('ADMIN',      'broadcast.manage', TRUE),

  -- banks.manage  (/banks  → ADMIN)
  ('ADMIN',      'banks.manage', TRUE),

  -- game.manage  (/providers + /accounts  → ADMIN)
  ('ADMIN',      'game.manage', TRUE),

  -- audit.view  (/audit  → ADMIN)
  ('ADMIN',      'audit.view', TRUE),

  -- media.view  (/media-library  → ADMIN)
  ('ADMIN',      'media.view', TRUE),

  -- bot.messages  (/settings/bot/messages CMS editor  → ADMIN)
  ('ADMIN',      'bot.messages', TRUE)

  -- bot.settings / website.settings / staff.manage / maintenance.view
  -- are SUPER_ADMIN-only → no rows seeded; engine returns TRUE for SUPER_ADMIN,
  -- and returns FALSE for everyone else when no granted row exists.

ON CONFLICT (role, permission) DO NOTHING;
