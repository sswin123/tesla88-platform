-- Migration 079: Remove API-synced entries from website_games
-- Sync route no longer mirrors into website_games (only gp_games is updated).
-- Manual entries (source != 'api') are preserved.
DELETE FROM website_games WHERE source = 'api';
