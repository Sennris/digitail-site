-- ============================================================
-- Traffic history: keep a permanent daily record of visitor numbers.
-- ============================================================
--
-- WHY THIS EXISTS, and it is not "a copy of the Cloudflare dashboard":
-- Cloudflare Web Analytics keeps only the last 30 days. A nightly
-- snapshot into D1 gives us history that Cloudflare itself throws away.
-- The admin panel then reads THIS table and never calls Cloudflare, so
-- the Traffic tab is fast and keeps working even if the API token
-- breaks or expires.
--
-- DATES ARE UTC. Cron triggers are UTC-only and Cloudflare's own
-- buckets are UTC. Converting to New Zealand time would put half a
-- day either side of every boundary, producing gaps or double counts.
-- The admin labels the column "UTC" so the numbers are not misread.
--
-- THE NUMBERS ARE ESTIMATES. Cloudflare samples traffic and
-- extrapolates, and counts ten visits by one person as ten visits.
-- Storing them does not make them exact. The admin says so on screen,
-- because these may end up quoted in a funding application.
--
-- Safe to re-run. Nothing is dropped.
-- ============================================================


CREATE TABLE IF NOT EXISTS analytics_daily (
    -- YYYY-MM-DD, UTC. Primary key, so a re-run for the same day
    -- overwrites rather than duplicating.
    date        TEXT    PRIMARY KEY,

    page_views  INTEGER NOT NULL DEFAULT 0,
    visits      INTEGER NOT NULL DEFAULT 0,

    -- Top pages / referrers / countries, stored as one JSON column
    -- rather than three tables. Empty object until those dimensions
    -- are added - the column exists now so that needs no migration.
    -- Bad JSON must never take the endpoint down; the reader degrades
    -- it to an empty object, the same way games.press_json does.
    detail_json TEXT    NOT NULL DEFAULT '{}',

    -- When we last successfully asked Cloudflare about this day. A row
    -- with a fetched_at is a day we have an ANSWER for, including
    -- "nobody visited". That is what stops the backfill re-asking about
    -- genuinely empty days forever.
    fetched_at  TEXT    NOT NULL DEFAULT ''
);


-- Reading is always "the last N days, newest first".
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date
    ON analytics_daily (date DESC);


INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0013_analytics.sql', 'Daily traffic history snapshotted from Cloudflare Web Analytics');
