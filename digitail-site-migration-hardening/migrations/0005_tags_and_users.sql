-- ============================================================
-- Two-axis devlog tags
-- ============================================================
-- NOTE: this is the one migration that is not safe to re-run.
-- SQLite has no ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so a
-- second run stops on statement 1 with "duplicate column name:
-- primary_tag". That is loud but harmless — it fails before
-- changing anything. Check the ledger before running it:
--   npx wrangler d1 execute digitail --remote \
--     --command="SELECT filename FROM schema_migrations"
-- ============================================================

-- ============================================================
-- Two-axis devlog tags
-- ============================================================
-- PRIMARY tag   = what it's about (which game, or studio news)
-- SECONDARY tag = what kind of update (bug fix, art, milestone...)
--
-- Your existing tags are promoted rather than replaced: the ones you
-- already had under the 'devlog' category become secondary tags, since
-- that is what they already were. Nothing is deleted.
-- ============================================================

ALTER TABLE devlogs ADD COLUMN primary_tag   TEXT NOT NULL DEFAULT '';
ALTER TABLE devlogs ADD COLUMN secondary_tag TEXT NOT NULL DEFAULT '';

-- 'primary' | 'secondary' | 'legacy'
ALTER TABLE tags ADD COLUMN kind TEXT NOT NULL DEFAULT 'legacy';

-- Content-type tags you already had are secondary tags
UPDATE tags SET kind = 'secondary' WHERE category = 'devlog';

-- 'News' was never a content type, it's a subject. Promote it.
UPDATE tags SET kind = 'primary', name = 'Studio News'
WHERE name = 'News';

-- A few extra content types. OR IGNORE so this is safe to re-run and
-- won't collide with anything you've already made.
INSERT OR IGNORE INTO tags (name, color, category, kind) VALUES
    ('Milestone', '#E5DABF', 'devlog', 'secondary'),
    ('Design',    '#5DCCCA', 'devlog', 'secondary'),
    ('Website',   '#B9CCCC', 'devlog', 'secondary');

-- Anything still unassigned defaults to secondary so it stays usable
UPDATE tags SET kind = 'secondary' WHERE kind = 'legacy';
