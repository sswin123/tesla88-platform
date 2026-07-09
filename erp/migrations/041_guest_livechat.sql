-- 041_guest_livechat.sql
-- Allow unauthenticated (guest) visitors to start a live chat session.
-- user_id becomes nullable; guest_id identifies anonymous visitors.

-- Make user_id nullable (drop NOT NULL but keep foreign key)
ALTER TABLE support_sessions ALTER COLUMN user_id DROP NOT NULL;

-- Add guest_id to identify anonymous visitors
ALTER TABLE support_sessions ADD COLUMN IF NOT EXISTS guest_id VARCHAR(50);

-- Index for guest lookups
CREATE INDEX IF NOT EXISTS idx_sessions_guest
    ON support_sessions (guest_id)
    WHERE guest_id IS NOT NULL;

-- Enforce one active session per guest (mirrors the member unique index)
CREATE UNIQUE INDEX IF NOT EXISTS support_sessions_one_active_per_guest
    ON support_sessions (guest_id)
    WHERE status IN ('OPEN', 'ACTIVE') AND guest_id IS NOT NULL;
