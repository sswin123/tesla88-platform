ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

UPDATE admins SET display_name = erp_username WHERE display_name IS NULL;
