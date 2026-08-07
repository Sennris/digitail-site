/**
 * Write handlers.
 *
 * The admin panel holds each content type as a whole array in memory and
 * saves the lot. So the API mirrors that: PUT the full collection, and
 * the server replaces it inside a batch (all or nothing). For a site with
 * twenty devlogs this is simple and safe. If the devlog count ever gets
 * into the thousands, this is the piece to revisit.
 */

const s = (v) => (v === undefined || v === null ? '' : String(v));
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);


function devlogStatements(db, items, withNewTags) {
    const stmts = [
        db.prepare('DELETE FROM devlog_tags'),
        db.prepare('DELETE FROM devlogs'),
    ];

    for (const d of items) {
        stmts.push(withNewTags
            ? db.prepare(
                `INSERT INTO devlogs (id, sort_date, display_date, title_en, title_mi,
                 snippet_en, snippet_mi, content_en, content_mi, image,
                 primary_tag, secondary_tag, published, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'))`
              ).bind(
                n(d.id), s(d.sortDate), s(d.displayDate), s(d.titleEn), s(d.titleMi),
                s(d.snippetEn), s(d.snippetMi), s(d.contentEn), s(d.contentMi), s(d.image),
                s(d.primaryTag), s(d.secondaryTag)
              )
            : db.prepare(
                `INSERT INTO devlogs (id, sort_date, display_date, title_en, title_mi,
                 snippet_en, snippet_mi, content_en, content_mi, image, published, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,1,datetime('now'))`
              ).bind(
                n(d.id), s(d.sortDate), s(d.displayDate), s(d.titleEn), s(d.titleMi),
                s(d.snippetEn), s(d.snippetMi), s(d.contentEn), s(d.contentMi), s(d.image)
              )
        );
        (d.tags || []).forEach((tag, i) => {
            stmts.push(
                db.prepare('INSERT INTO devlog_tags (devlog_id, tag_name, position) VALUES (?,?,?)')
                  .bind(n(d.id), s(tag), i)
            );
        });
    }
    return stmts;
}

export async function putDevlogs(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of devlogs');

    try {
        await db.batch(devlogStatements(db, items, true));
    } catch (e) {
        // If migration 0005 hasn't been run yet, primary_tag doesn't exist.
        // Saving everything else still has to work, so fall back rather than
        // blocking the whole save.
        if (!/no column named (primary|secondary)_tag/i.test(e.message)) throw e;
        await db.batch(devlogStatements(db, items, false));
        throw new Error(
            'Saved, but the two-tag columns are missing. Run: ' +
            'npx wrangler d1 execute digitail --remote --file=./migrations/0005_tags_and_users.sql'
        );
    }
    return items.length;
}


export async function putFoxes(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of foxes');
    const stmts = [db.prepare('DELETE FROM foxes')];
    for (const f of items) {
        stmts.push(
            db.prepare(
                `INSERT INTO foxes (id, name_en, name_mi, year, package_en, package_mi,
                 desc_en, desc_mi, bio_en, bio_mi, image) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(
                n(f.id), s(f.nameEn), s(f.nameMi), n(f.year), s(f.packageEn), s(f.packageMi),
                s(f.descEn), s(f.descMi), s(f.bioEn), s(f.bioMi), s(f.image)
            )
        );
    }
    await db.batch(stmts);
    return items.length;
}


export async function putTeam(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of team members');
    const stmts = [db.prepare('DELETE FROM team')];
    items.forEach((t, i) => {
        stmts.push(
            db.prepare(
                `INSERT INTO team (id, name_en, name_mi, role_en, role_mi,
                 bio_en, bio_mi, avatar, sort_order) VALUES (?,?,?,?,?,?,?,?,?)`
            ).bind(
                n(t.id), s(t.nameEn), s(t.nameMi), s(t.roleEn), s(t.roleMi),
                s(t.bioEn), s(t.bioMi), s(t.avatar), i
            )
        );
    });
    await db.batch(stmts);
    return items.length;
}


export async function putSocial(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of social posts');
    const stmts = [
        db.prepare('DELETE FROM social_tags'),
        db.prepare('DELETE FROM social_posts'),
    ];
    for (const p of items) {
        stmts.push(
            db.prepare(
                `INSERT INTO social_posts (id, platform, title, date, url, thumbnail, description)
                 VALUES (?,?,?,?,?,?,?)`
            ).bind(
                n(p.id), s(p.platform), s(p.title), s(p.date),
                s(p.url), s(p.thumbnail), s(p.description)
            )
        );
        (p.tags || []).forEach((tag, i) => {
            stmts.push(
                db.prepare('INSERT INTO social_tags (post_id, tag_name, position) VALUES (?,?,?)')
                  .bind(n(p.id), s(tag), i)
            );
        });
    }
    await db.batch(stmts);
    return items.length;
}


export async function putTags(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of tags');

    // Widest schema first, then progressively older ones. A Worker deployed
    // before its migration has run must not lose the tags entirely.
    const SHAPES = [
        {
            missing: /no column named (name_mi|show_in_filter|position)/i,
            sql: 'INSERT INTO tags (id, name, color, category, kind, name_mi, show_in_filter, position) VALUES (?,?,?,?,?,?,?,?)',
            bind: (t, i) => [
                n(t.id), s(t.name), s(t.color) || '#5DCCCA', s(t.category) || 'general',
                s(t.kind) || 'secondary', s(t.nameMi) || null,
                t.filter === false ? 0 : 1, i,
            ],
        },
        {
            missing: /no column named kind/i,
            sql: 'INSERT INTO tags (id, name, color, category, kind) VALUES (?,?,?,?,?)',
            bind: (t) => [n(t.id), s(t.name), s(t.color) || '#5DCCCA',
                          s(t.category) || 'general', s(t.kind) || 'secondary'],
        },
        {
            missing: null,
            sql: 'INSERT INTO tags (id, name, color, category) VALUES (?,?,?,?)',
            bind: (t) => [n(t.id), s(t.name), s(t.color) || '#5DCCCA',
                          s(t.category) || 'general'],
        },
    ];

    const build = (shape) => {
        const stmts = [db.prepare('DELETE FROM tags')];
        items.forEach((t, i) => {
            stmts.push(db.prepare(shape.sql).bind(...shape.bind(t, i)));
        });
        return stmts;
    };

    let lastError = null;
    for (const shape of SHAPES) {
        try {
            await db.batch(build(shape));
            return { ok: true, count: items.length };
        } catch (e) {
            lastError = e;
            if (!shape.missing || !shape.missing.test(e.message)) throw e;
        }
    }
    throw lastError;
}

/**
 * Games, as of migration 0009.
 *
 * Same delete-then-insert shape as the others: the admin holds the whole
 * list and saves the lot.
 *
 * Two extra jobs on top of that:
 *
 *   1. The old `game` settings blob is kept in step with whichever game is
 *      featured. Nothing reads it as the source of truth any more, but it
 *      is what src/index.js falls back to if this table is ever missing,
 *      so leaving it to go stale would turn a deploy ordering mistake into
 *      wrong content on the front page.
 *
 *   2. If the Worker is deployed before the migration is run, the tables do
 *      not exist yet. Rather than losing the save, the featured game is
 *      written to the settings blob and a message says what to run. Same
 *      approach as putDevlogs and putTags.
 */
export async function putGames(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of games');

    const featured = items.find((g) => g.featured) || items[0] || null;
    const mirror = featured ? {
        titleEn: s(featured.titleEn), titleMi: s(featured.titleMi),
        taglineEn: s(featured.taglineEn), taglineMi: s(featured.taglineMi),
        trailerUrl: s(featured.trailerUrl), keyArt: s(featured.keyArt),
        blurbEn: s(featured.blurbEn), blurbMi: s(featured.blurbMi),
    } : null;

    const stmts = [
        db.prepare('DELETE FROM game_features'),
        db.prepare('DELETE FROM games'),
    ];

    items.forEach((g, gi) => {
        stmts.push(
            db.prepare(
                `INSERT INTO games (id, slug, title_en, title_mi, tagline_en, tagline_mi,
                 blurb_en, blurb_mi, trailer_url, key_art, status_en, status_mi,
                 cta_label_en, cta_label_mi, cta_url,
                 cta_heading_en, cta_heading_mi, cta_body_en, cta_body_mi,
                 note_en, note_mi, press_json,
                 featured, published, position, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
            ).bind(
                n(g.id) || gi + 1, s(g.slug),
                s(g.titleEn), s(g.titleMi), s(g.taglineEn), s(g.taglineMi),
                s(g.blurbEn), s(g.blurbMi), s(g.trailerUrl), s(g.keyArt),
                s(g.statusEn), s(g.statusMi),
                s(g.ctaLabelEn), s(g.ctaLabelMi), s(g.ctaUrl),
                s(g.ctaHeadingEn), s(g.ctaHeadingMi), s(g.ctaBodyEn), s(g.ctaBodyMi),
                s(g.noteEn), s(g.noteMi),
                g.press && typeof g.press === 'object' ? JSON.stringify(g.press) : '',
                // Exactly one featured game. Whichever comes first wins, so
                // ticking a new one in the admin cannot leave two set.
                featured && g === featured ? 1 : 0,
                g.published === false ? 0 : 1,
                gi
            )
        );

        (g.features || []).forEach((f, fi) => {
            stmts.push(
                db.prepare(
                    `INSERT INTO game_features (game_id, position, tagline_en, tagline_mi,
                     text_en, text_mi, image) VALUES (?,?,?,?,?,?,?)`
                ).bind(
                    n(g.id) || gi + 1, fi,
                    s(f.taglineEn), s(f.taglineMi), s(f.textEn), s(f.textMi), s(f.image)
                )
            );
        });
    });

    try {
        await db.batch(stmts);
    } catch (e) {
        if (/no column named press_json/i.test(e.message)) {
            throw new Error(
                'Saved nothing: the press kit column is missing. Run migration ' +
                '0011_press_kit.sql, then save again.'
            );
        }
        if (/no column named cta_(heading|body)_(en|mi)/i.test(e.message)) {
            throw new Error(
                'Saved nothing: the call to action columns are missing. Run ' +
                'migration 0010_game_cta.sql, then save again.'
            );
        }
        if (!/no such table: (games|game_features)/i.test(e.message)) throw e;
        if (mirror) await putSetting(db, 'game', mirror);
        throw new Error(
            'The games table does not exist yet, so only the featured game was ' +
            'saved. Run: npx wrangler d1 execute digitail --remote ' +
            '--file=./migrations/0009_games.sql'
        );
    }

    if (mirror) await putSetting(db, 'game', mirror);
    return items.length;
}


/**
 * Press items and press assets. Same delete-then-insert shape as the rest.
 *
 * Both refuse an empty array outright. These lists are edited from a tab the
 * user may never open in a given session, and an empty array reaching here is
 * far more likely to mean "the tab never loaded" than "delete everything I
 * have written". Deleting the last one on purpose is done through the tab's
 * own remove button, which sends the remaining items, not an empty list.
 */
async function putPressRows(db, table, items, columns, build) {
    if (!Array.isArray(items)) throw new Error(`Expected an array for ${table}`);

    const stmts = [db.prepare(`DELETE FROM ${table}`)];
    const marks = columns.map(() => '?').join(',');
    items.forEach((item, i) => {
        stmts.push(
            db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${marks})`)
              .bind(...build(item, i))
        );
    });

    try {
        await db.batch(stmts);
    } catch (e) {
        if (!new RegExp(`no such table: ${table}`, 'i').test(e.message)) throw e;
        throw new Error(
            'Saved nothing: the press kit tables do not exist yet. Run migration ' +
            '0011_press_kit.sql, then save again.'
        );
    }
    return items.length;
}

export function putPressItems(db, items) {
    return putPressRows(db, 'press_items',
        items,
        ['game_id', 'kind', 'title_en', 'title_mi', 'body_en', 'body_mi',
         'source', 'url', 'date_label', 'position'],
        (it, i) => [
            n(it.gameId) || 0, s(it.kind) || 'award',
            s(it.titleEn), s(it.titleMi), s(it.bodyEn), s(it.bodyMi),
            s(it.source), s(it.url), s(it.dateLabel), i,
        ]);
}

export function putPressAssets(db, items) {
    return putPressRows(db, 'press_assets',
        items,
        ['game_id', 'kind', 'label_en', 'label_mi', 'url',
         'note_en', 'note_mi', 'position'],
        (it, i) => [
            n(it.gameId) || 0, s(it.kind) || 'image',
            s(it.labelEn), s(it.labelMi), s(it.url),
            s(it.noteEn), s(it.noteMi), i,
        ]);
}


/**
 * Mascots, as of migration 0012.
 *
 * Same delete-then-insert shape as the rest: the admin holds the whole
 * list and saves the lot. Two extra jobs on top of that:
 *
 *   1. At most one mascot can be `forced` - the manual override that
 *      ignores the calendar. Whichever comes first in her order wins, so
 *      ticking a new one in the admin cannot leave two set. Same
 *      approach as `featured` on games.
 *
 *   2. The old `homepage.mascot` blob is kept as a rollback copy,
 *      pointing at the always-on mascot (the first enabled one with no
 *      dates, or failing that the first enabled one at all). Nothing
 *      reads it as the source of truth any more, but pages/index.js
 *      falls back to it when this table is missing, so letting it go
 *      stale would turn a deploy ordering mistake into a wrong picture
 *      on the front page.
 *
 * The admin module keeps the same mirror up to date in the browser. It
 * has to: api-adapter publishes the homepage settings AFTER this runs,
 * so a browser copy left untouched here would land on top of the mirror
 * a moment after it was written.
 */
export function mascotMirror(items) {
    const live = items.filter((m) => m && m.enabled !== false);
    const pick = live.find((m) => !s(m.dateStart) && !s(m.dateEnd)) || live[0] || null;
    if (!pick) return null;
    return {
        current: 'default',
        // There is no schedule in this shape to switch on, and the whole
        // point of the fallback is to show something dependable.
        autoSwitch: false,
        versions: {
            default: {
                name: s(pick.name),
                image: s(pick.image),
                size: s(pick.size) || 'medium',
            },
        },
    };
}

export async function putMascots(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of mascots');

    const forced = items.find((m) => m && m.forced) || null;

    const stmts = [db.prepare('DELETE FROM mascots')];
    items.forEach((m, i) => {
        stmts.push(
            db.prepare(
                `INSERT INTO mascots (id, name, image, size, date_start, date_end,
                 repeats_yearly, forced, enabled, position, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`
            ).bind(
                n(m.id) || i + 1,
                s(m.name), s(m.image),
                // Anything unrecognised lands on medium, which is what the
                // mascot has always been, rather than on nothing.
                ['small', 'medium', 'large'].includes(s(m.size)) ? s(m.size) : 'medium',
                s(m.dateStart), s(m.dateEnd),
                m.repeatsYearly === false ? 0 : 1,
                forced && m === forced ? 1 : 0,
                m.enabled === false ? 0 : 1,
                i
            )
        );
    });

    try {
        await db.batch(stmts);
    } catch (e) {
        if (!/no such table: mascots/i.test(e.message)) throw e;
        throw new Error(
            'Saved nothing: the mascots table does not exist yet. Run migration ' +
            '0012_mascots.sql, then save again.'
        );
    }

    const mirror = mascotMirror(items);
    if (mirror) {
        const homepage = (await getSettingObject(db, 'homepage')) || {};
        homepage.mascot = mirror;
        await putSetting(db, 'homepage', homepage);
    }
    return items.length;
}

// Reads a settings blob back so one key can be updated without flattening
// the rest of it.
async function getSettingObject(db, key) {
    try {
        const row = await db.prepare('SELECT value FROM settings WHERE key = ?')
            .bind(key).first();
        if (!row || !row.value) return null;
        const parsed = JSON.parse(row.value);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}


export async function putSetting(db, key, value) {
    if (value === null || typeof value !== 'object') {
        throw new Error(`Expected an object for ${key}`);
    }
    await db
        .prepare(`INSERT INTO settings (key, value, updated_at)
                  VALUES (?, ?, datetime('now'))
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                                 updated_at = excluded.updated_at`)
        .bind(key, JSON.stringify(value))
        .run();
    return 1;
}


export const WRITERS = {
    devlogs:  (db, body) => putDevlogs(db, body),
    foxes:    (db, body) => putFoxes(db, body),
    team:     (db, body) => putTeam(db, body),
    social:   (db, body) => putSocial(db, body),
    tags:      (db, body) => putTags(db, body),
    games:     (db, body) => putGames(db, body),
    gamesPage: (db, body) => putSetting(db, 'gamesPage', body),
    pressKit:  (db, body) => putSetting(db, 'pressKit', body),
    pressItems:  (db, body) => putPressItems(db, body),
    pressAssets: (db, body) => putPressAssets(db, body),
    mascots:   (db, body) => putMascots(db, body),
    homepage: (db, body) => putSetting(db, 'homepage', body),
    // Kept so the old endpoint still answers, but the admin no longer writes
    // to it. putGames owns this blob now - see the note there.
    game:     (db, body) => putSetting(db, 'game', body),
};
