-- ============================================================
-- Uploaded media (images stored in R2)
-- ============================================================


CREATE TABLE IF NOT EXISTS media (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    r2_key      TEXT NOT NULL UNIQUE,   -- path inside the bucket
    url         TEXT NOT NULL,          -- what goes in the content
    filename    TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT '',
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    width       INTEGER NOT NULL DEFAULT 0,
    height      INTEGER NOT NULL DEFAULT 0,
    alt_text    TEXT NOT NULL DEFAULT '',
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_uploaded ON media(uploaded_at DESC);
