-- Migration 082: Transaction V2 Foundation
-- Adds internal notes table, audit log enhancement, and role permissions

-- Section 1: Create transaction_internal_notes table
CREATE TABLE IF NOT EXISTS transaction_internal_notes (
  id               SERIAL       PRIMARY KEY,
  transaction_type VARCHAR(20)  NOT NULL CHECK (transaction_type IN ('deposit','withdrawal')),
  transaction_id   INTEGER      NOT NULL,
  admin_id         INTEGER      NOT NULL REFERENCES admins(id),
  content          TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ  NULL
);

-- Section 2: Partial index on notes (active rows only)
CREATE INDEX IF NOT EXISTS idx_txn_notes_lookup
  ON transaction_internal_notes (transaction_type, transaction_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Section 3: Add description column to audit_logs
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Section 4: Index on audit_logs for timeline queries
-- NOTE: In staging this is fine as-is. In production if audit_logs is very large,
-- this index should be created CONCURRENTLY (outside a transaction).
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON audit_logs (target_type, target_id, created_at DESC);

-- Section 5: Seed permissions into role_permissions
INSERT INTO role_permissions (role, permission, granted, updated_by)
VALUES
  ('CS',          'transaction.notes.view',     FALSE, 'migration-082'),
  ('CS',          'transaction.notes.create',   FALSE, 'migration-082'),
  ('CS',          'transaction.notes.edit',     FALSE, 'migration-082'),
  ('CS',          'transaction.notes.delete',   FALSE, 'migration-082'),
  ('CS',          'transaction.timeline.view',  FALSE, 'migration-082'),
  ('SUPPORT',     'transaction.notes.view',     TRUE,  'migration-082'),
  ('SUPPORT',     'transaction.notes.create',   TRUE,  'migration-082'),
  ('SUPPORT',     'transaction.notes.edit',     TRUE,  'migration-082'),
  ('SUPPORT',     'transaction.notes.delete',   FALSE, 'migration-082'),
  ('SUPPORT',     'transaction.timeline.view',  TRUE,  'migration-082'),
  ('FINANCE',     'transaction.notes.view',     TRUE,  'migration-082'),
  ('FINANCE',     'transaction.notes.create',   TRUE,  'migration-082'),
  ('FINANCE',     'transaction.notes.edit',     TRUE,  'migration-082'),
  ('FINANCE',     'transaction.notes.delete',   FALSE, 'migration-082'),
  ('FINANCE',     'transaction.timeline.view',  TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.notes.view',     TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.notes.create',   TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.notes.edit',     TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.notes.delete',   TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.timeline.view',  TRUE,  'migration-082'),
  ('ADMIN',       'transaction.notes.view',     TRUE,  'migration-082'),
  ('ADMIN',       'transaction.notes.create',   TRUE,  'migration-082'),
  ('ADMIN',       'transaction.notes.edit',     TRUE,  'migration-082'),
  ('ADMIN',       'transaction.notes.delete',   TRUE,  'migration-082'),
  ('ADMIN',       'transaction.timeline.view',  TRUE,  'migration-082')
ON CONFLICT (role, permission) DO NOTHING;
