CREATE TABLE IF NOT EXISTS session_notes (
    id         SERIAL       PRIMARY KEY,
    session_id INTEGER      NOT NULL REFERENCES support_sessions(id) ON DELETE CASCADE,
    author     VARCHAR(100) NOT NULL,
    body       TEXT         NOT NULL,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_notes_session ON session_notes(session_id);
