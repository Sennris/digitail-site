-- ============================================================
-- Newsletter: extra columns on the existing subscribers table
-- ============================================================
-- The subscribers table has been in the schema since 0001; this adds
-- what Phase 4 needs on top of it.
--
-- NOTE: like 0005, this one is not safe to re-run. SQLite has no
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so a second run stops on
-- the first statement with "duplicate column name: unsub_token". Loud
-- but harmless - it fails before changing anything. Check the ledger
-- before running it:
--   npx wrangler d1 execute digitail --remote \
--     --command="SELECT filename FROM schema_migrations"
-- ============================================================

-- Personal unsubscribe link, so a one-click unsubscribe can be put in
-- any email this site ever sends on its own.
ALTER TABLE subscribers ADD COLUMN unsub_token TEXT;

-- Whether this person made it as far as the newsletter provider.
-- not_sent | sent | error. Anyone stuck on 'error' is retried by the
-- Sync button in the admin panel.
ALTER TABLE subscribers ADD COLUMN provider_state TEXT NOT NULL DEFAULT 'not_sent';
ALTER TABLE subscribers ADD COLUMN provider_note  TEXT NOT NULL DEFAULT '';

ALTER TABLE subscribers ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_subscribers_provider ON subscribers(provider_state);

INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0007_newsletter.sql', 'applied directly');
