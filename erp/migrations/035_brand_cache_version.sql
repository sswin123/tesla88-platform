-- Migration 035: Add brand_settings component to cache_versions
-- Allows bot to detect brand changes via version polling (same mechanism as bot_messages)

INSERT INTO cache_versions (component, version)
VALUES ('brand_settings', 1)
ON CONFLICT (component) DO NOTHING;
