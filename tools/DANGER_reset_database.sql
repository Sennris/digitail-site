-- ============================================================
-- DESTRUCTIVE. Drops every table and all content.
-- ============================================================
-- This is the DROP block that used to sit at the top of
-- 0001_initial.sql, 0003_auth.sql and 0004_media.sql. It lived
-- there so those files could be re-run during early development,
-- which also meant that running any of them against the live
-- database wiped it.
--
-- It is out of migrations/ so nothing can apply it by walking the
-- folder, and named so nobody runs it by accident.
--
-- Only use this to rebuild from empty. Afterwards, run every
-- migration in order.
--
--   npx wrangler d1 execute digitail --remote --file=./tools/DANGER_reset_database.sql
--   npx wrangler d1 execute digitail --remote --file=./migrations/0001_initial.sql
--   ... 0002 through 0006
--
-- Take a backup first:
--   npx wrangler d1 export digitail --remote --output=backup.sql
-- ============================================================

DROP TABLE IF EXISTS schema_migrations;
DROP TABLE IF EXISTS media;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS admin_users;
DROP TABLE IF EXISTS devlog_tags;
DROP TABLE IF EXISTS social_tags;
DROP TABLE IF EXISTS devlogs;
DROP TABLE IF EXISTS foxes;
DROP TABLE IF EXISTS team;
DROP TABLE IF EXISTS social_posts;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS subscribers;
