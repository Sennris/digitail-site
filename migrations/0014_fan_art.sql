-- ============================================================
-- Fan art: a public submission queue, and a published gallery.
-- ============================================================
--
-- TWO TABLES ON PURPOSE, and this is the important decision in the
-- whole feature.
--
--   fan_art_submissions   what the PUBLIC writes. Holds contact
--                         details and the permission record.
--   fan_art               what the PUBLIC reads. Holds the image and
--                         the credit, and nothing personal beyond the
--                         name the artist asked to be credited by.
--
-- One table with a `status` column would have been less code and one
-- forgotten WHERE clause away from serving a stranger's email address
-- through /api/content/. This site already has a history of guards
-- that read as protection and did nothing - the `loadedOk` check, the
-- `typeof fn === 'function'` calls, `window.data`. Structural
-- separation cannot be forgotten. The reader for `fanArt` physically
-- cannot see the submissions table.
--
-- THE PERMISSION RECORD STORES THE WORDING, NOT JUST THE TICK.
-- `consent_text` is a snapshot of the exact sentence the artist agreed
-- to, copied in at submission time. A boolean tells you somebody
-- ticked something; it does not tell you WHAT, and the moment that
-- sentence is reworded every historic tick becomes unanswerable.
-- If this is ever questioned, the answer has to be specific.
--
-- NO IP ADDRESS IS STORED. The studio already declined forwarding
-- visitor IPs to a third party for spam scoring; collecting them here
-- for the same purpose would be the same decision made differently.
-- Turnstile does the abuse check and it does not need us to keep one.
--
-- Safe to re-run. Nothing is dropped.
-- ============================================================


CREATE TABLE IF NOT EXISTS fan_art_submissions (
    id             INTEGER PRIMARY KEY,

    -- How they want to be credited. NOT necessarily their real name and
    -- not necessarily their handle - whichever they typed is the one
    -- that goes on the page.
    artist_name    TEXT    NOT NULL DEFAULT '',

    -- Where to point the credit. Usually the thanks people actually
    -- want. Optional.
    credit_link    TEXT    NOT NULL DEFAULT '',

    -- A link to the art itself. The form takes a LINK, never a file:
    -- a public upload endpoint would put unvetted binaries into R2,
    -- and the team downloads and uploads the image by hand anyway.
    art_url        TEXT    NOT NULL DEFAULT '',

    title          TEXT    NOT NULL DEFAULT '',

    -- Anything they want to say. Shown to the team, never published.
    note           TEXT    NOT NULL DEFAULT '',

    -- Optional, and the only genuinely personal field here. Kept so
    -- somebody can be told their art went up, or asked a question.
    -- Declared on the privacy page.
    contact_email  TEXT    NOT NULL DEFAULT '',

    -- The permission record. See the header.
    consent_text   TEXT    NOT NULL DEFAULT '',
    consent_at     TEXT    NOT NULL DEFAULT '',

    -- new | published | declined. A declined row is KEPT rather than
    -- deleted, so the same piece arriving twice is recognisable and
    -- somebody is not asked about it again.
    status         TEXT    NOT NULL DEFAULT 'new',

    submitted_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fan_art_submissions_status
    ON fan_art_submissions (status, submitted_at DESC);


CREATE TABLE IF NOT EXISTS fan_art (
    id             INTEGER PRIMARY KEY,

    artist_name    TEXT    NOT NULL DEFAULT '',
    credit_link    TEXT    NOT NULL DEFAULT '',
    title          TEXT    NOT NULL DEFAULT '',

    -- The R2 path, uploaded through the existing admin media route.
    image          TEXT    NOT NULL DEFAULT '',

    -- Written by the team, not the artist. A gallery with no alt text
    -- is a gallery half the point of which is missing.
    alt_text       TEXT    NOT NULL DEFAULT '',

    -- Where the permission came from, in the team's own words - a
    -- submission, a DM, an email. ADMIN ONLY, never sent to the public
    -- reader. Filled in automatically when published from a submission.
    permission_note TEXT   NOT NULL DEFAULT '',

    -- Which submission this came from, or 0 for a piece the team added
    -- directly because permission arrived some other way.
    submission_id  INTEGER NOT NULL DEFAULT 0,

    -- Switching a piece off is how a takedown request is honoured
    -- immediately without losing the record of who asked and when.
    enabled        INTEGER NOT NULL DEFAULT 1,

    position       INTEGER NOT NULL DEFAULT 0,
    published_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fan_art_order ON fan_art (enabled, position, id);


INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0014_fan_art.sql', 'Fan art: public submission queue plus published gallery, kept as separate tables');
