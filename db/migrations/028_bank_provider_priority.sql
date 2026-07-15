-- Migration 028: Bank Provider Binding + Priority
--
-- provider_binding: restricts bank to a specific game provider (NULL = all providers).
-- priority: higher number shown first; supports future auto-rotation by highest-priority
--           available bank per provider.

ALTER TABLE payment_banks
  ADD COLUMN IF NOT EXISTS provider_binding VARCHAR(20) NULL
    CHECK (provider_binding IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22')),
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Index for fast per-provider bank lookup (used by website, bot, future app)
CREATE INDEX IF NOT EXISTS idx_payment_banks_provider_active
  ON payment_banks (provider_binding, is_active, maintenance_mode)
  WHERE is_active = TRUE AND maintenance_mode = FALSE;
