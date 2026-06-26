-- Extend admins table with new optional columns
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS added_by_username VARCHAR(100);

-- Add new role values to the constraint (drop & recreate safely)
DO $$
BEGIN
  ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'CS', 'FINANCE', 'SUPERVISOR', 'SUPPORT'));
