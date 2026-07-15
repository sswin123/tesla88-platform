-- Rename account_holder → account_name, sort_order → display_order, add qr_image
-- 使用 IF EXISTS 检查确保幂等（可重复执行）

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_banks' AND column_name = 'account_holder'
  ) THEN
    ALTER TABLE payment_banks RENAME COLUMN account_holder TO account_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_banks' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE payment_banks RENAME COLUMN sort_order TO display_order;
  END IF;
END $$;

ALTER TABLE payment_banks ADD COLUMN IF NOT EXISTS qr_image TEXT;
