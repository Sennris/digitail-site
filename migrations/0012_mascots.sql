-- ============================================================
-- Mascots become a list with a calendar, instead of four fixed slots.
-- ============================================================
--
-- Until now the mascot lived in the `homepage` settings blob as four
-- hardcoded keys - default, halloween, christmas, newyear - baked into
-- collectHomepageInfo() in admin-script.js. There was no way to add a
-- fifth, and when two date ranges overlapped the winner was whichever
-- key Object.entries() happened to hand back first.
--
-- This creates a real `mascots` table and moves those four across, so
-- nothing that is live changes. The old settings blob is deliberately
-- LEFT IN PLACE as a rollback copy - src/writers.js keeps it pointing
-- at the always-on mascot, and pages/index.js falls back to it if this
-- table is missing. Nothing reads it as the source of truth.
--
-- Same shape as `games` (migration 0009), on purpose: the admin module
-- that edits this is modelled on the one that edits games.
--
-- THE OVERLAP RULE, agreed before this was built: when two scheduled
-- mascots both cover today, the one with the SHORTER date range wins,
-- and list order breaks a tie. A mascot with no dates at all counts as
-- an infinitely long range, so it is the fallback without needing to be
-- flagged as one - any dated mascot covering today beats it.
--
-- Safe to re-run. Nothing is dropped.
-- ============================================================


CREATE TABLE IF NOT EXISTS mascots (
    id             INTEGER PRIMARY KEY,

    -- Shown as the image's alt text, and as the row label in the admin.
    name           TEXT    NOT NULL DEFAULT '',
    image          TEXT    NOT NULL DEFAULT '',

    -- small | medium | large. A named set rather than a pixel number so
    -- it stays right across breakpoints - the sizes are defined once in
    -- pages/index.css and have a mobile value each.
    size           TEXT    NOT NULL DEFAULT 'medium',

    -- Either MM-DD (repeats every year) or YYYY-MM-DD (one specific
    -- year), decided by repeats_yearly below. Both blank means the
    -- mascot is always eligible - the fallback.
    date_start     TEXT    NOT NULL DEFAULT '',
    date_end       TEXT    NOT NULL DEFAULT '',
    repeats_yearly INTEGER NOT NULL DEFAULT 1,

    -- The manual override: show this one right now whatever the
    -- calendar says. At most one row has it - src/writers.js keeps it
    -- to one the same way it keeps `featured` to one game.
    forced         INTEGER NOT NULL DEFAULT 0,

    -- An enabled mascot with no image renders nothing, so switching one
    -- off is a way to park it without deleting the dates.
    enabled        INTEGER NOT NULL DEFAULT 1,

    position       INTEGER NOT NULL DEFAULT 0,
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mascots_order ON mascots(position, id);


-- ---------- Move the four existing slots across --------------
-- Only fires when the table is empty, so re-running this file cannot
-- overwrite anything edited since. A slot that was never filled in is
-- skipped rather than becoming an empty row.
--
-- The old activeDates was a ['MM-DD','MM-DD'] pair, which is exactly
-- the repeating case, so all four come across with repeats_yearly = 1.
-- `default` had no dates and stays that way: an infinite range, which
-- under the rule above means it shows whenever nothing else claims the
-- day. That is what it did before.

INSERT INTO mascots (id, name, image, size, date_start, date_end,
                     repeats_yearly, forced, enabled, position)
SELECT 1,
       COALESCE(json_extract(value, '$.mascot.versions.default.name'), 'Default'),
       COALESCE(json_extract(value, '$.mascot.versions.default.image'), ''),
       'medium', '', '', 1, 0, 1, 0
FROM settings
WHERE key = 'homepage'
  AND json_extract(value, '$.mascot.versions.default') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mascots);

INSERT INTO mascots (id, name, image, size, date_start, date_end,
                     repeats_yearly, forced, enabled, position)
SELECT 2,
       COALESCE(json_extract(value, '$.mascot.versions.halloween.name'), 'Halloween'),
       COALESCE(json_extract(value, '$.mascot.versions.halloween.image'), ''),
       'medium',
       COALESCE(json_extract(value, '$.mascot.versions.halloween.activeDates[0]'), '10-25'),
       COALESCE(json_extract(value, '$.mascot.versions.halloween.activeDates[1]'), '11-02'),
       1, 0, 1, 1
FROM settings
WHERE key = 'homepage'
  AND json_extract(value, '$.mascot.versions.halloween') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mascots WHERE id = 2);

INSERT INTO mascots (id, name, image, size, date_start, date_end,
                     repeats_yearly, forced, enabled, position)
SELECT 3,
       COALESCE(json_extract(value, '$.mascot.versions.christmas.name'), 'Christmas'),
       COALESCE(json_extract(value, '$.mascot.versions.christmas.image'), ''),
       'medium',
       COALESCE(json_extract(value, '$.mascot.versions.christmas.activeDates[0]'), '12-01'),
       COALESCE(json_extract(value, '$.mascot.versions.christmas.activeDates[1]'), '12-26'),
       1, 0, 1, 2
FROM settings
WHERE key = 'homepage'
  AND json_extract(value, '$.mascot.versions.christmas') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mascots WHERE id = 3);

INSERT INTO mascots (id, name, image, size, date_start, date_end,
                     repeats_yearly, forced, enabled, position)
SELECT 4,
       COALESCE(json_extract(value, '$.mascot.versions.newyear.name'), 'New Year'),
       COALESCE(json_extract(value, '$.mascot.versions.newyear.image'), ''),
       'medium',
       COALESCE(json_extract(value, '$.mascot.versions.newyear.activeDates[0]'), '12-31'),
       COALESCE(json_extract(value, '$.mascot.versions.newyear.activeDates[1]'), '01-07'),
       1, 0, 1, 3
FROM settings
WHERE key = 'homepage'
  AND json_extract(value, '$.mascot.versions.newyear') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mascots WHERE id = 4);


-- If there was no stored mascot at all, start with one empty always-on
-- row rather than an empty table, so the admin tab has something to
-- open onto instead of a bare panel.
INSERT INTO mascots (id, name, image, size, date_start, date_end,
                     repeats_yearly, forced, enabled, position)
SELECT 1, 'Default', '', 'medium', '', '', 1, 0, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM mascots);


INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0012_mascots.sql', 'applied directly');
