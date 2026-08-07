-- ============================================================
-- Press kit.
-- ============================================================
--
-- Three pieces of storage, deliberately shaped differently:
--
--   press_items   the repeating written things - awards, quotes,
--                 articles, extra links. One table with a `kind`
--                 rather than four near-identical tables.
--
--   press_assets  the downloadables - curated packs and individual
--                 files. Both are just a label and a URL, so they
--                 share a table too.
--
--   games.press_json   the per-game factsheet (platforms, release
--                 date, price, press description, content notes).
--                 A single column rather than ten, because the admin
--                 saves a game whole anyway and ten ALTERs is ten
--                 chances for a migration to half-apply.
--
-- Studio-level rows use game_id = 0. There is no game with id 0, so
-- it cannot collide.
--
-- The studio's own factsheet text lives in the `settings` table under
-- the key 'pressKit', the same way homepage and gamesPage do. No
-- schema change needed for that.
--
-- Safe to re-run apart from the ALTER, which reports "duplicate column
-- name" and stops. That is expected.
-- ============================================================


CREATE TABLE IF NOT EXISTS press_items (
    id         INTEGER PRIMARY KEY,

    -- 0 = studio level. Otherwise the game this belongs to.
    game_id    INTEGER NOT NULL DEFAULT 0,

    -- award | quote | article | link
    kind       TEXT    NOT NULL DEFAULT 'award',

    title_en   TEXT    NOT NULL DEFAULT '',
    title_mi   TEXT    NOT NULL DEFAULT '',
    body_en    TEXT    NOT NULL DEFAULT '',
    body_mi    TEXT    NOT NULL DEFAULT '',

    -- Who said it or who published it.
    source     TEXT    NOT NULL DEFAULT '',
    url        TEXT    NOT NULL DEFAULT '',

    -- Free text on purpose: "March 2026", "2025", "Coming 2027".
    date_label TEXT    NOT NULL DEFAULT '',

    position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_press_items_scope
    ON press_items(game_id, kind, position);


CREATE TABLE IF NOT EXISTS press_assets (
    id        INTEGER PRIMARY KEY,
    game_id   INTEGER NOT NULL DEFAULT 0,

    -- pack | image | logo
    kind      TEXT    NOT NULL DEFAULT 'image',

    label_en  TEXT    NOT NULL DEFAULT '',
    label_mi  TEXT    NOT NULL DEFAULT '',
    url       TEXT    NOT NULL DEFAULT '',

    -- Shown next to the download, e.g. "ZIP, 24MB, 12 screenshots".
    note_en   TEXT    NOT NULL DEFAULT '',
    note_mi   TEXT    NOT NULL DEFAULT '',

    position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_press_assets_scope
    ON press_assets(game_id, kind, position);


ALTER TABLE games ADD COLUMN press_json TEXT NOT NULL DEFAULT '';


INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0011_press_kit.sql', 'applied directly');
