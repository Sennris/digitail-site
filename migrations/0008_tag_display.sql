-- Tag display controls.
--
-- The filter buttons on the devlogs page were typed into devlogs.html, so
-- they could not be changed from the admin panel. They are now built from
-- this table, which needs three things it did not have:
--
--   name_mi         the te reo label for the button (optional; falls back
--                   to the English name)
--   show_in_filter  whether the tag appears as a filter button at all.
--                   Defaults to 1 so nothing vanishes when this is applied.
--   position        the order the buttons appear in. Defaults to 0, and the
--                   reader falls back to id, so existing tags keep their
--                   current order until they are moved.
--
-- Re-running this file reports "duplicate column name" and stops. That is
-- expected and harmless - the columns are already there. See the migration
-- ledger in 0006 and tools/test_migrations.py.

ALTER TABLE tags ADD COLUMN name_mi TEXT;
ALTER TABLE tags ADD COLUMN show_in_filter INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tags ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0008_tag_display.sql', 'applied directly');
