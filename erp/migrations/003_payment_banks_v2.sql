-- Rename account_holder → account_name, sort_order → display_order, add qr_image
ALTER TABLE payment_banks RENAME COLUMN account_holder TO account_name;
ALTER TABLE payment_banks RENAME COLUMN sort_order TO display_order;
ALTER TABLE payment_banks ADD COLUMN IF NOT EXISTS qr_image TEXT;
