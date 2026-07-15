-- 049: Website Builder Homepage Sections
-- 提供 ERP Website Builder 的 homepage_sections 表

CREATE TABLE IF NOT EXISTS homepage_sections (
    id             SERIAL PRIMARY KEY,
    section_type   VARCHAR(50)  NOT NULL,
    name           VARCHAR(100) NOT NULL DEFAULT '',
    config         JSONB        NOT NULL DEFAULT '{}',
    display_order  INTEGER      NOT NULL DEFAULT 0,
    is_enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    start_at       TIMESTAMPTZ,
    end_at         TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homepage_sections_order
    ON homepage_sections (display_order ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_homepage_sections_enabled
    ON homepage_sections (is_enabled, start_at, end_at);

CREATE OR REPLACE FUNCTION trg_homepage_sections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_homepage_sections_updated_at ON homepage_sections;
CREATE TRIGGER trg_homepage_sections_updated_at
    BEFORE UPDATE ON homepage_sections
    FOR EACH ROW EXECUTE FUNCTION trg_homepage_sections_updated_at();
