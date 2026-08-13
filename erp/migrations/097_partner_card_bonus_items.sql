-- erp/migrations/097_partner_card_bonus_items.sql
-- Adds admin-customizable bonus label/value/icon list to partner_cards.
-- Additive only: nullable column, no rewrite of existing rows, no changes
-- to welcome_bonus/free_credit/commission/promo_text — those stay as the
-- legacy fallback in website/src/lib/partner-render/card-renderer.tsx's
-- resolveBonusItems().
ALTER TABLE partner_cards
  ADD COLUMN IF NOT EXISTS bonus_items JSONB;
