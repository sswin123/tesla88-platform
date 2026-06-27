-- 019_livechat_unique_active_session.sql
--
-- Enforce at the database level: each customer can have at most ONE session
-- that is OPEN or ACTIVE at any given moment.
--
-- Step 1: Close duplicate OPEN/ACTIVE sessions that may exist from before this
--         constraint was added.  Only the most recently active session per user
--         is kept; all older OPEN/ACTIVE sessions are closed.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id
               ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
           ) AS rn
    FROM support_sessions
    WHERE status IN ('OPEN', 'ACTIVE')
)
UPDATE support_sessions
SET    status       = 'CLOSED',
       closed_at   = NOW(),
       close_reason = 'SYSTEM_DEDUP'
WHERE  id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Create the partial unique index that enforces the invariant going
--         forward.  IF NOT EXISTS is safe for idempotent re-runs.
CREATE UNIQUE INDEX IF NOT EXISTS support_sessions_one_active_per_user
    ON support_sessions (user_id)
    WHERE status IN ('OPEN', 'ACTIVE');
