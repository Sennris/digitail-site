-- ============================================================
-- Games become a list instead of a single fixed record.
-- ============================================================
--
-- Until now there was exactly one game on the whole site: a row in
-- `settings` with the key 'game', holding a flat blob of eight fields.
-- There was no way to add a second one.
--
-- This creates a real `games` table and moves that blob into row 1, so
-- nothing that is live changes. The old settings row is deliberately
-- LEFT IN PLACE as a rollback copy - src/writers.js keeps it updated to
-- match whichever game is featured, and src/index.js falls back to it if
-- this table is missing. Nothing reads it as the source of truth.
--
-- Safe to re-run. Nothing is dropped.
-- ============================================================


-- ---------- The games ---------------------------------------
CREATE TABLE IF NOT EXISTS games (
    id           INTEGER PRIMARY KEY,

    -- Used in a link like /game.html?g=paper-crown. Blank is fine; the
    -- reader falls back to the id.
    slug         TEXT    NOT NULL DEFAULT '',

    title_en     TEXT    NOT NULL DEFAULT '',
    title_mi     TEXT    NOT NULL DEFAULT '',
    tagline_en   TEXT    NOT NULL DEFAULT '',
    tagline_mi   TEXT    NOT NULL DEFAULT '',

    -- The short version on the front page card.
    blurb_en     TEXT    NOT NULL DEFAULT '',
    blurb_mi     TEXT    NOT NULL DEFAULT '',

    trailer_url  TEXT    NOT NULL DEFAULT '',
    key_art      TEXT    NOT NULL DEFAULT '',

    -- Free text, shown as a small label. e.g. In development, Prototype,
    -- Released. Not a fixed set on purpose.
    status_en    TEXT    NOT NULL DEFAULT '',
    status_mi    TEXT    NOT NULL DEFAULT '',

    -- The big button at the bottom of the page.
    cta_label_en TEXT    NOT NULL DEFAULT '',
    cta_label_mi TEXT    NOT NULL DEFAULT '',
    cta_url      TEXT    NOT NULL DEFAULT '',

    -- Shown in place of the feature sections while there are none yet,
    -- so a new game does not leave a bare page.
    note_en      TEXT    NOT NULL DEFAULT '',
    note_mi      TEXT    NOT NULL DEFAULT '',

    -- featured  = the one the front page card and /game.html show by default
    -- published = whether it is visible to the public at all. An unpublished
    --             game is not returned by the public API, so an unannounced
    --             title cannot leak through it.
    featured     INTEGER NOT NULL DEFAULT 0,
    published    INTEGER NOT NULL DEFAULT 1,

    position     INTEGER NOT NULL DEFAULT 0,
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);


-- ---------- The sections down a game page -------------------
-- The three alternating rows on game.html used to be typed into the HTML.
-- They are rows here now, so any number of them can be added or removed.
CREATE TABLE IF NOT EXISTS game_features (
    id         INTEGER PRIMARY KEY,
    game_id    INTEGER NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    tagline_en TEXT    NOT NULL DEFAULT '',
    tagline_mi TEXT    NOT NULL DEFAULT '',
    text_en    TEXT    NOT NULL DEFAULT '',
    text_mi    TEXT    NOT NULL DEFAULT '',
    image      TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_game_features_game
    ON game_features(game_id, position);


-- ---------- Move the existing game across -------------------
-- Only fires when the table is empty, so re-running this file cannot
-- overwrite anything edited since.
INSERT INTO games (id, title_en, title_mi, tagline_en, tagline_mi,
                   blurb_en, blurb_mi, trailer_url, key_art,
                   featured, published, position)
SELECT 1,
       COALESCE(json_extract(value, '$.titleEn'),   ''),
       COALESCE(json_extract(value, '$.titleMi'),   ''),
       COALESCE(json_extract(value, '$.taglineEn'), ''),
       COALESCE(json_extract(value, '$.taglineMi'), ''),
       COALESCE(json_extract(value, '$.blurbEn'),   ''),
       COALESCE(json_extract(value, '$.blurbMi'),   ''),
       COALESCE(json_extract(value, '$.trailerUrl'),''),
       COALESCE(json_extract(value, '$.keyArt'),    ''),
       1, 1, 0
FROM settings
WHERE key = 'game'
  AND NOT EXISTS (SELECT 1 FROM games);

-- If there was no stored game at all, start with an empty featured row
-- rather than an empty table, so the page has something to render.
INSERT INTO games (id, title_en, tagline_en, featured, published, position)
SELECT 1, '', '', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM games);


-- ---------- Placeholders for the two small projects ---------
-- Unpublished on purpose: they are early and unnamed, so they show in the
-- admin panel ready to be filled in, and nowhere on the public site.
INSERT OR IGNORE INTO games (id, title_en, tagline_en, featured, published, position)
VALUES (2, 'Untitled small project', '', 0, 0, 1);
INSERT OR IGNORE INTO games (id, title_en, tagline_en, featured, published, position)
VALUES (3, 'Untitled small project', '', 0, 0, 2);


INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0009_games.sql', 'applied directly');
