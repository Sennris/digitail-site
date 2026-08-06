-- ============================================================
-- The call to action block becomes editable.
-- ============================================================
--
-- The heading and the line above the button at the bottom of the game
-- page ("Help us break the simulation" and the wishlist line) were still
-- typed into game.html, so they could not be changed from the admin panel.
-- These four columns move them into the Games tab with the rest.
--
-- Re-running this file reports "duplicate column name" and stops. That is
-- expected and harmless - the columns are already there. See the migration
-- ledger in 0006 and tools/test_migrations.py.

ALTER TABLE games ADD COLUMN cta_heading_en TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN cta_heading_mi TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN cta_body_en    TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN cta_body_mi    TEXT NOT NULL DEFAULT '';

INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0010_game_cta.sql', 'applied directly');
