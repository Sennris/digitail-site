-- ============================================================
-- Digi Tail Studios - initial schema
-- ============================================================
-- Design note: the API is built to return JSON in exactly the
-- same shape the site already fetches from the .json files, so
-- switching a page over is a one-line change to its fetch URL.
-- ============================================================


-- ---------- Dev logs ----------------------------------------
CREATE TABLE IF NOT EXISTS devlogs (
    id            INTEGER PRIMARY KEY,
    sort_date     TEXT    NOT NULL,          -- YYYYMMDD, used for ordering
    display_date  TEXT    NOT NULL,          -- human readable, shown on the card
    title_en      TEXT    NOT NULL DEFAULT '',
    title_mi      TEXT    NOT NULL DEFAULT '',
    snippet_en    TEXT    NOT NULL DEFAULT '',
    snippet_mi    TEXT    NOT NULL DEFAULT '',
    content_en    TEXT    NOT NULL DEFAULT '',
    content_mi    TEXT    NOT NULL DEFAULT '',
    image         TEXT    NOT NULL DEFAULT '',
    published     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_devlogs_sort ON devlogs(sort_date DESC);


-- ---------- Tags --------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    color    TEXT NOT NULL DEFAULT '#5DCCCA',
    category TEXT NOT NULL DEFAULT 'general'
);

-- Tags are stored on posts by name, matching the current JSON files.
CREATE TABLE IF NOT EXISTS devlog_tags (
    devlog_id INTEGER NOT NULL REFERENCES devlogs(id) ON DELETE CASCADE,
    tag_name  TEXT    NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (devlog_id, tag_name)
);

CREATE TABLE IF NOT EXISTS social_tags (
    post_id  INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    tag_name TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (post_id, tag_name)
);


-- ---------- Adopted foxes -----------------------------------
CREATE TABLE IF NOT EXISTS foxes (
    id          INTEGER PRIMARY KEY,
    name_en     TEXT    NOT NULL DEFAULT '',
    name_mi     TEXT    NOT NULL DEFAULT '',
    year        INTEGER NOT NULL,
    package_en  TEXT    NOT NULL DEFAULT '',
    package_mi  TEXT    NOT NULL DEFAULT '',
    desc_en     TEXT    NOT NULL DEFAULT '',
    desc_mi     TEXT    NOT NULL DEFAULT '',
    bio_en      TEXT    NOT NULL DEFAULT '',
    bio_mi      TEXT    NOT NULL DEFAULT '',
    image       TEXT    NOT NULL DEFAULT ''
);


-- ---------- The pack ----------------------------------------
CREATE TABLE IF NOT EXISTS team (
    id         INTEGER PRIMARY KEY,
    name_en    TEXT    NOT NULL DEFAULT '',
    name_mi    TEXT    NOT NULL DEFAULT '',
    role_en    TEXT    NOT NULL DEFAULT '',
    role_mi    TEXT    NOT NULL DEFAULT '',
    bio_en     TEXT    NOT NULL DEFAULT '',
    bio_mi     TEXT    NOT NULL DEFAULT '',
    avatar     TEXT    NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
);


-- ---------- Social posts ------------------------------------
CREATE TABLE IF NOT EXISTS social_posts (
    id          INTEGER PRIMARY KEY,
    platform    TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL DEFAULT '',
    date        TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    thumbnail   TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_social_date ON social_posts(date DESC);


-- ---------- Settings ----------------------------------------
-- homepage.json and game.json are nested config objects that the
-- admin panel always saves whole, so they live here as JSON blobs
-- rather than being shredded into columns.
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ---------- Newsletter (Phase 4, table created now) ---------
CREATE TABLE IF NOT EXISTS subscribers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | unsubscribed
    confirm_token TEXT,
    confirmed_at TEXT,
    source       TEXT NOT NULL DEFAULT 'website',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
