-- ============================================================
-- Migration ledger + admin bootstrap lock
-- ============================================================
-- Two jobs.
--
-- 1. Record which migrations have been applied, so you can ask the
--    database what it has rather than trying to remember.
--
-- 2. Close a hole in /admin/setup.html. It used to unlock itself
--    whenever admin_users was empty, which meant anything that emptied
--    that table handed the admin panel to whoever loaded the page next.
--    Setup now also checks a settings flag that survives the table
--    being dropped.
--
-- Safe to run more than once. Everything here is IF NOT EXISTS or
-- OR IGNORE, and the backfills read the real schema rather than
-- assuming what state the database is in.
-- ============================================================


CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    note       TEXT NOT NULL DEFAULT ''
);


-- ---------- Backfill ----------------------------------------
-- Each row is only written if the schema shows that migration ran.

INSERT OR IGNORE INTO schema_migrations (filename, note)
SELECT '0001_initial.sql', 'backfilled: devlogs table present'
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='devlogs');

INSERT OR IGNORE INTO schema_migrations (filename, note)
SELECT '0002_seed.sql', 'backfilled: seeded content present'
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='tags')
  AND (SELECT COUNT(*) FROM tags) > 0;

INSERT OR IGNORE INTO schema_migrations (filename, note)
SELECT '0003_auth.sql', 'backfilled: admin_users table present'
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_users');

INSERT OR IGNORE INTO schema_migrations (filename, note)
SELECT '0004_media.sql', 'backfilled: media table present'
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='media');

INSERT OR IGNORE INTO schema_migrations (filename, note)
SELECT '0005_tags_and_users.sql', 'backfilled: primary_tag column present'
WHERE EXISTS (SELECT 1 FROM pragma_table_info('devlogs') WHERE name='primary_tag');

INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0006_migration_ledger.sql', 'applied directly');


-- ---------- Admin bootstrap lock ----------------------------
-- If an admin account already exists, the site has been set up, so
-- lock setup now. settings survives 0003 being re-run; admin_users
-- does not.

INSERT OR IGNORE INTO settings (key, value)
SELECT 'admin_bootstrapped', datetime('now')
WHERE EXISTS (SELECT 1 FROM admin_users);
