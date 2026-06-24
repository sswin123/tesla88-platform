-- Payment bank accounts that customers send money to.
-- Phase 2 ERP will create/edit/toggle; the Telegram Bot will read active banks.
CREATE TABLE IF NOT EXISTS payment_banks (
    id              SERIAL PRIMARY KEY,
    bank_name       VARCHAR(100) NOT NULL,
    account_number  VARCHAR(50)  NOT NULL,
    account_holder  VARCHAR(100) NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_payment_banks_updated_at ON payment_banks;
CREATE TRIGGER trg_payment_banks_updated_at
    BEFORE UPDATE ON payment_banks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
