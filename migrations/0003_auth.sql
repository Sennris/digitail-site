-- ============================================================
-- Admin accounts and login attempt tracking
-- ============================================================

DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS admin_users;

CREATE TABLE admin_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,   -- PBKDF2-SHA256, 210k iterations, hex
    salt          TEXT NOT NULL,   -- 16 random bytes, hex
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE login_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ip           TEXT NOT NULL,
    email        TEXT NOT NULL DEFAULT '',
    success      INTEGER NOT NULL DEFAULT 0,
    attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attempts_ip ON login_attempts(ip, attempted_at);
