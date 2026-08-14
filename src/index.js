/**
 * Digi Tail Studios - Worker
 *
 *   /api/content/*   GET is public, PUT requires a Cloudflare Access login
 *   /api/auth/me     who the Access token says you are
 *   /admin/*         refused, with a reason, without an Access login
 *   everything else  served from /public
 */

import { adminIdentity, requireAuth } from './auth.js';
import { WRITERS } from './writers.js';
import { handleUpload, handleList, handleDelete, serveMedia } from './media.js';
import {
    handleSubscribe, handleUnsubscribe, handleSubscriberList,
    handleSubscriberExport, handleSubscriberSync, newsletterHealth,
    verifyTurnstile,
} from './newsletter.js';
import {
    handleFanArtSubmit, handleSubmissionList, handleSubmissionUpdate, handleFanArtPublish,
} from './fanart.js';
import { readAnalytics, refreshAnalytics, toCsv } from './analytics.js';

// Not for /api/content/* - see the GET handler. Caching content reads meant
// a save could take up to a minute to show up, on the site and in the admin.
const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
};
const NO_CACHE = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
};

const json = (data, status = 200, headers = JSON_HEADERS) =>
    new Response(JSON.stringify(data), { status, headers });

const fail = (message, status = 400) =>
    new Response(JSON.stringify({ error: message }), { status, headers: NO_CACHE });


/* ================= readers ================= */

async function getDevlogs(db) {
    const { results: rows } = await db.prepare(
        'SELECT * FROM devlogs WHERE published = 1 ORDER BY sort_date DESC, id DESC').all();
    const { results: tagRows } = await db.prepare(
        'SELECT devlog_id, tag_name FROM devlog_tags ORDER BY devlog_id, position').all();

    const tagsById = new Map();
    for (const t of tagRows) {
        if (!tagsById.has(t.devlog_id)) tagsById.set(t.devlog_id, []);
        tagsById.get(t.devlog_id).push(t.tag_name);
    }
    return rows.map((r) => ({
        id: r.id, sortDate: r.sort_date, displayDate: r.display_date,
        tags: tagsById.get(r.id) || [],
        primaryTag: r.primary_tag || '',
        secondaryTag: r.secondary_tag || '',
        titleEn: r.title_en, titleMi: r.title_mi,
        snippetEn: r.snippet_en, snippetMi: r.snippet_mi,
        contentEn: r.content_en, contentMi: r.content_mi, image: r.image,
    }));
}

async function getFoxes(db) {
    const { results } = await db.prepare('SELECT * FROM foxes ORDER BY id DESC').all();
    return results.map((r) => ({
        id: r.id, nameEn: r.name_en, nameMi: r.name_mi, year: r.year,
        packageEn: r.package_en, packageMi: r.package_mi,
        descEn: r.desc_en, descMi: r.desc_mi,
        bioEn: r.bio_en, bioMi: r.bio_mi, image: r.image,
    }));
}

async function getTeam(db) {
    const { results } = await db.prepare('SELECT * FROM team ORDER BY sort_order, id').all();
    return results.map((r) => ({
        id: r.id, nameEn: r.name_en, nameMi: r.name_mi,
        roleEn: r.role_en, roleMi: r.role_mi,
        bioEn: r.bio_en, bioMi: r.bio_mi, avatar: r.avatar,
    }));
}

async function getSocial(db) {
    const { results: rows } = await db.prepare(
        'SELECT * FROM social_posts ORDER BY date DESC, id DESC').all();
    const { results: tagRows } = await db.prepare(
        'SELECT post_id, tag_name FROM social_tags ORDER BY post_id, position').all();

    const tagsById = new Map();
    for (const t of tagRows) {
        if (!tagsById.has(t.post_id)) tagsById.set(t.post_id, []);
        tagsById.get(t.post_id).push(t.tag_name);
    }
    return rows.map((r) => ({
        id: r.id, platform: r.platform, title: r.title, date: r.date,
        url: r.url, thumbnail: r.thumbnail, description: r.description,
        tags: tagsById.get(r.id) || [],
    }));
}

async function getTags(db) {
    // ORDER BY position needs migration 0008. Fall back so the site keeps
    // working if the code is deployed before the migration is applied.
    let results;
    try {
        ({ results } = await db.prepare(
            'SELECT * FROM tags ORDER BY position, id').all());
    } catch {
        ({ results } = await db.prepare('SELECT * FROM tags ORDER BY id').all());
    }

    return results.map((r) => ({
        id: r.id, name: r.name, color: r.color,
        category: r.category, kind: r.kind || 'secondary',
        nameMi: r.name_mi || '',
        // Missing column, or a NULL in it, both mean "yes, show it" - that
        // is what keeps existing tags visible as filters after 0008 runs.
        filter: r.show_in_filter === undefined || r.show_in_filter === null
            ? true : Boolean(r.show_in_filter),
    }));
}

async function getSetting(db, key) {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return null; }
}

// Games are a list as of migration 0009. Before that there was one game,
// stored as a settings blob under the key 'game'.
//
// Two things keep the site working either side of that migration:
//   - a missing `games` table returns null here, which the pages treat as
//     "use what is already in the HTML"
//   - the singular `game` endpoint still answers, from the featured row if
//     the table is there and from the old settings blob if it is not. The
//     front page card reads that endpoint and needed no change.
//
// opts.includeUnpublished is only ever true for a logged-in admin. An
// unpublished game is invisible to the public API, titles included, so an
// unannounced project cannot be read out of it.
async function getGames(db, opts = {}) {
    let rows;
    try {
        ({ results: rows } = await db.prepare(
            'SELECT * FROM games ORDER BY position, id').all());
    } catch {
        return null;   // migration 0009 has not been run yet
    }

    let featureRows = [];
    try {
        ({ results: featureRows } = await db.prepare(
            'SELECT * FROM game_features ORDER BY game_id, position, id').all());
    } catch {
        featureRows = [];
    }

    const featuresByGame = new Map();
    for (const f of featureRows) {
        if (!featuresByGame.has(f.game_id)) featuresByGame.set(f.game_id, []);
        featuresByGame.get(f.game_id).push({
            taglineEn: f.tagline_en, taglineMi: f.tagline_mi,
            textEn: f.text_en, textMi: f.text_mi, image: f.image,
        });
    }

    return rows
        .filter((r) => opts.includeUnpublished || Boolean(r.published))
        .map((r) => ({
            id: r.id,
            slug: r.slug || String(r.id),
            titleEn: r.title_en, titleMi: r.title_mi,
            taglineEn: r.tagline_en, taglineMi: r.tagline_mi,
            blurbEn: r.blurb_en, blurbMi: r.blurb_mi,
            trailerUrl: r.trailer_url, keyArt: r.key_art,
            statusEn: r.status_en || '', statusMi: r.status_mi || '',
            ctaLabelEn: r.cta_label_en || '', ctaLabelMi: r.cta_label_mi || '',
            ctaUrl: r.cta_url || '',
            ctaHeadingEn: r.cta_heading_en || '', ctaHeadingMi: r.cta_heading_mi || '',
            ctaBodyEn: r.cta_body_en || '', ctaBodyMi: r.cta_body_mi || '',
            noteEn: r.note_en || '', noteMi: r.note_mi || '',
            featured: Boolean(r.featured),
            published: Boolean(r.published),
            features: featuresByGame.get(r.id) || [],
            // Stored as one JSON column rather than ten. Bad JSON must never
            // take the games endpoint down with it, so it degrades to empty.
            press: (() => {
                try { return r.press_json ? JSON.parse(r.press_json) : {}; }
                catch { return {}; }
            })(),
            // Derived, not stored. A game only links through from the games
            // list once there is something on the other side. It flips on by
            // itself the moment she writes a holding message or adds a
            // section, so it can never disagree with what is actually there.
            hasPage: Boolean(
                (featuresByGame.get(r.id) || []).length ||
                r.note_en || r.note_mi || r.trailer_url || r.cta_url
            ),
        }));
}

// Awards, quotes, articles and extra links. game_id 0 is studio level.
async function getPressItems(db) {
    try {
        const { results } = await db.prepare(
            'SELECT * FROM press_items ORDER BY game_id, kind, position, id').all();
        return results.map((r) => ({
            id: r.id, gameId: r.game_id, kind: r.kind,
            titleEn: r.title_en, titleMi: r.title_mi,
            bodyEn: r.body_en, bodyMi: r.body_mi,
            source: r.source, url: r.url, dateLabel: r.date_label,
        }));
    } catch {
        return null;   // migration 0011 has not been run yet
    }
}

// Downloadable packs and individual files.
async function getPressAssets(db) {
    try {
        const { results } = await db.prepare(
            'SELECT * FROM press_assets ORDER BY game_id, kind, position, id').all();
        return results.map((r) => ({
            id: r.id, gameId: r.game_id, kind: r.kind,
            labelEn: r.label_en, labelMi: r.label_mi,
            url: r.url, noteEn: r.note_en, noteMi: r.note_mi,
        }));
    } catch {
        return null;
    }
}

// The mascot list, as of migration 0012. Returned in her order - the
// homepage uses that order as the tiebreak when two mascots cover the
// same day, so position is content, not decoration.
//
// Unpublished has no equivalent here: an `enabled` mascot with no image
// renders nothing, and a mascot is a picture of a fox rather than an
// unannounced title, so there is nothing to leak.
async function getMascots(db) {
    try {
        const { results } = await db.prepare(
            'SELECT * FROM mascots ORDER BY position, id').all();
        return results.map((r) => ({
            id: r.id,
            name: r.name || '',
            image: r.image || '',
            size: r.size || 'medium',
            dateStart: r.date_start || '',
            dateEnd: r.date_end || '',
            repeatsYearly: Boolean(r.repeats_yearly),
            forced: Boolean(r.forced),
            enabled: Boolean(r.enabled),
        }));
    } catch {
        return null;   // migration 0012 has not been run yet
    }
}

// The flat shape the front page card has always fetched.
async function getFeaturedGame(db) {
    const games = await getGames(db);
    if (games && games.length) {
        const pick = games.find((g) => g.featured) || games[0];
        return {
            titleEn: pick.titleEn, titleMi: pick.titleMi,
            taglineEn: pick.taglineEn, taglineMi: pick.taglineMi,
            trailerUrl: pick.trailerUrl, keyArt: pick.keyArt,
            blurbEn: pick.blurbEn, blurbMi: pick.blurbMi,
        };
    }
    return getSetting(db, 'game');
}

/**
 * The PUBLISHED gallery only.
 *
 * This function can see the `fan_art` table and nothing else. The
 * submissions table - which carries contact details and the consent
 * record - is not reachable from here at all, which is why they were
 * built as two tables rather than one with a status column. There is no
 * WHERE clause to forget.
 *
 * permission_note is deliberately NOT returned. It is the studio's own
 * record of where permission came from, not something the public needs.
 */
async function getFanArt(db) {
    try {
        const { results } = await db.prepare(
            'SELECT * FROM fan_art WHERE enabled = 1 ORDER BY position, id').all();
        return (results || []).map((r) => ({
            id: r.id,
            artistName: r.artist_name || '',
            creditLink: r.credit_link || '',
            title: r.title || '',
            image: r.image || '',
            altText: r.alt_text || '',
        }));
    } catch {
        return null;   // migration 0014 has not been run yet
    }
}

const READERS = {
    devlogs: getDevlogs, foxes: getFoxes, team: getTeam,
    social: getSocial, tags: getTags, games: getGames,
    gamesPage: (db) => getSetting(db, 'gamesPage'),
    pressKit: (db) => getSetting(db, 'pressKit'),
    pressItems: getPressItems,
    pressAssets: getPressAssets,
    mascots: getMascots,
    fanArt: getFanArt,
    homepage: (db) => getSetting(db, 'homepage'),
    game: (db) => getFeaturedGame(db),
};


/* ================= auth routes ================= */

async function handleAuth(request, env) {
    const action = new URL(request.url).pathname.split('/').filter(Boolean)[2];

    // The only auth route left. The admin panel asks it who it is
    // talking to, and session-guard.js asks it whether an unexpected 401
    // really means the Access session has ended.
    //
    // login, logout, setup, users and keepalive were all deleted on
    // 14 August 2026 with the password system:
    //   login / setup  - Access issues the one-time codes now
    //   users          - who may publish is the hub's can_edit_site flag
    //   keepalive      - there is no cookie of ours left to slide
    //   logout         - /cdn-cgi/access/logout, handled by Cloudflare
    if (action === 'me') {
        const result = await adminIdentity(request, env);
        return result.ok
            ? json({ loggedIn: true, email: result.session.email, viaAccess: true }, 200, NO_CACHE)
            : json({ loggedIn: false, reason: result.reason }, 200, NO_CACHE);
    }

    return fail('Unknown auth action', 404);
}


/* ================= api router ================= */

async function handleApi(request, env, url) {
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[1] === 'health') {
        // Reports whether each binding is present. Never the values
        // themselves, only whether they exist and are non-empty.
        //
        // It counts EDITORS now, not password accounts. If this ever
        // reads 0, nobody can get into the admin panel and the fix is
        // on the hub's People screen, not here.
        let dbOk = false;
        let editorCount = null;
        try {
            const row = await env.DB
                .prepare('SELECT COUNT(*) AS n FROM people WHERE active = 1 AND can_edit_site = 1')
                .first();
            editorCount = row?.n ?? null;
            dbOk = true;
        } catch { /* leave dbOk false */ }

        return json({
            ok: true,
            time: new Date().toISOString(),
            database: dbOk ? 'connected' : 'NOT WORKING',
            siteEditors: editorCount,
            login: 'Cloudflare Access only',
            accessConfigured: Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD),
            mediaBucket: env.MEDIA ? 'bound' : 'not bound',
            ...newsletterHealth(env),
        }, 200, NO_CACHE);
    }

    // Public newsletter endpoints. Both refuse anything that has not
    // passed Turnstile; see src/newsletter.js.
    if (parts[1] === 'subscribe') {
        try {
            return await handleSubscribe(request, env);
        } catch (e) {
            return fail(`Signup failed: ${e.message}`, 500);
        }
    }

    if (parts[1] === 'unsubscribe') {
        try {
            return await handleUnsubscribe(request, env);
        } catch (e) {
            return fail(`Unsubscribe failed: ${e.message}`, 500);
        }
    }

    if (parts[1] === 'fanart') {
        // PUBLIC. The only unauthenticated write on this site besides the
        // newsletter, and it reuses the same Turnstile check rather than
        // inventing a second way to tell a person from a script.
        if (parts[2] === 'submit') {
            try {
                return await handleFanArtSubmit(request, env, verifyTurnstile);
            } catch (e) {
                return fail(`Could not take your submission: ${e.message}`, 500);
            }
        }

        // EVERYTHING BELOW IS ADMIN. The gate sits here, above all of
        // them, so a route added later cannot be added outside it.
        const session = await requireAuth(request, env);
        if (!session) return fail('Not logged in', 401);

        try {
            if (parts[2] === 'submissions' && !parts[3] && request.method === 'GET') {
                return await handleSubmissionList(env);
            }
            if (parts[2] === 'submissions' && parts[3] && request.method === 'PATCH') {
                return await handleSubmissionUpdate(request, env, parts[3]);
            }
            if (parts[2] === 'publish' && request.method === 'POST') {
                return await handleFanArtPublish(request, env);
            }
        } catch (e) {
            return fail(`Fan art request failed: ${e.message}`, 500);
        }
        return fail('Unknown fan art action', 404);
    }

    if (parts[1] === 'subscribers') {
        const session = await requireAuth(request, env);
        if (!session) return fail('Not logged in', 401);

        try {
            if (parts[2] === 'export' && request.method === 'GET') {
                return await handleSubscriberExport(env);
            }
            if (parts[2] === 'sync' && request.method === 'POST') {
                return await handleSubscriberSync(env);
            }
            if (!parts[2] && request.method === 'GET') {
                return await handleSubscriberList(env);
            }
        } catch (e) {
            return fail(`Subscriber error: ${e.message}`, 500);
        }

        return fail('Unknown subscriber action', 404);
    }

    if (parts[1] === 'auth') {
        try {
            return await handleAuth(request, env);
        } catch (e) {
            // Surface the reason instead of an opaque 500.
            return fail(`Auth error: ${e.message}`, 500);
        }
    }

    if (parts[1] === 'media') {
        const session = await requireAuth(request, env);
        if (!session) return fail('Not logged in', 401);

        if (parts[2] === 'upload' && request.method === 'POST') {
            try {
                return await handleUpload(request, env);
            } catch (e) {
                return fail(`Upload failed: ${e.message}`, 500);
            }
        }
        if (!parts[2] && request.method === 'GET') return handleList(env);
        if (parts[2] && request.method === 'DELETE') return handleDelete(env, Number(parts[2]));

        return fail('Unknown media action', 404);
    }

    // Traffic history. Admin only - visitor numbers are not published,
    // and the table is read straight from D1, never from Cloudflare, so
    // this stays fast and keeps answering if the API token ever breaks.
    if (parts[1] === 'analytics') {
        const session = await requireAuth(request, env);
        if (!session) return fail('Not logged in', 401);

        if (parts[2] === 'refresh' && request.method === 'POST') {
            // The same job the cron runs, on a button. Useful on the
            // day it is installed, and after a night it did not run.
            const result = await refreshAnalytics(env);
            if (!result.ok) return fail(result.error, 502);
            return json(result, 200, NO_CACHE);
        }

        if (parts[2] === 'export' && request.method === 'GET') {
            try {
                const data = await readAnalytics(env.DB, 3650);
                // Oldest first for a spreadsheet, newest first on screen.
                const rows = data.rows.slice().reverse();
                return new Response(toCsv(rows), {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/csv; charset=utf-8',
                        'Cache-Control': 'no-store',
                        'Content-Disposition': `attachment; filename="digitail-traffic-${new Date().toISOString().slice(0, 10)}.csv"`,
                    },
                });
            } catch (e) {
                return fail(`Could not export traffic history: ${e.message}`, 500);
            }
        }

        if (!parts[2] && request.method === 'GET') {
            try {
                const days = Number(url.searchParams.get('days')) || 90;
                return json(await readAnalytics(env.DB, days), 200, NO_CACHE);
            } catch (e) {
                return fail(`Could not read traffic history - has migration 0013 been run? (${e.message})`, 500);
            }
        }

        return fail('Unknown analytics action', 404);
    }

    if (parts[1] === 'content' && parts[2]) {
        const type = parts[2];

        if (request.method === 'GET') {
            const reader = READERS[type];
            if (!reader) return fail(`Unknown content type: ${type}`, 404);
            try {
                // The admin panel has to see unpublished games or it cannot
                // edit them. Everyone else gets the published ones only.
                const opts = type === 'games'
                    ? { includeUnpublished: !!(await requireAuth(request, env)) }
                    : {};
                const data = await reader(env.DB, opts);
                if (data === null) return fail(`No data stored for ${type}`, 404);
                // NO_CACHE on purpose. A cached copy of this is a published
                // change that has not appeared yet, on the site or in the
                // admin panel. See the note on JSON_HEADERS above.
                return json(data, 200, NO_CACHE);
            } catch (e) {
                return fail(`Database error: ${e.message}`, 500);
            }
        }

        if (request.method === 'PUT' || request.method === 'POST') {
            const session = await requireAuth(request, env);
            if (!session) return fail('Not logged in', 401);

            const writer = WRITERS[type];
            if (!writer) return fail(`Unknown content type: ${type}`, 404);

            let body;
            try { body = await request.json(); } catch { return fail('Invalid JSON body'); }

            try {
                const count = await writer(env.DB, body);
                return json({ ok: true, type, saved: count }, 200, NO_CACHE);
            } catch (e) {
                return fail(`Could not save ${type}: ${e.message}`, 500);
            }
        }

        return fail('Method not allowed', 405);
    }

    return fail('Not found', 404);
}


/* ================= entry ================= */

/* ---------- being turned away, with a reason ---------- */

// A blank page or a bare 403 sends people to ask Cat what is wrong. Each
// of these needs a DIFFERENT action from whoever is reading it, so each
// one says which.
const REFUSALS = {
    'no-token': {
        status: 403,
        title: 'Not signed in',
        body: 'Open the studio hub and sign in there first, then come back to this page.',
    },
    'not-on-team': {
        status: 403,
        title: 'Signed in, but not on the team list',
        body: 'Cloudflare let you through, but this address is not on the hub\u2019s People '
            + 'screen, or it is marked as no longer active. The two lists have to match '
            + 'exactly - a different spelling of the same address counts as a different person.',
    },
    'not-an-editor': {
        status: 403,
        title: 'You are on the team, but not set up to edit the website',
        body: 'A director can switch this on for you: hub \u2192 People \u2192 your name \u2192 '
            + '"can edit site". It is deliberately separate from being a director.',
    },
    database: {
        status: 503,
        title: 'The database is not answering',
        body: 'This is not about your account. Try again in a minute; if it keeps happening, '
            + 'the shared database or the hub\u2019s people table is the place to look.',
    },
    'not-configured': {
        status: 500,
        title: 'This Worker is missing its Access settings',
        body: 'ACCESS_TEAM_DOMAIN and ACCESS_AUD are not set, so there is no way to check '
            + 'who you are. They live in wrangler.toml and must match the hub exactly.',
    },
};

function refusal(result) {
    const chosen = REFUSALS[result.reason] || REFUSALS['no-token'];
    // The address is echoed back because "which of my addresses did I
    // sign in with" is the actual question in two of these cases. It is
    // escaped rather than trusted: it arrives in a token from
    // Cloudflare, but it is still not ours.
    const who = result.email
        ? `<p class="who">Signed in as ${escapeHtml(result.email)}</p>`
        : '';
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${chosen.title} | Digi Tail Studios</title>
<link rel="stylesheet" href="/assets/css/core.css">
<style>
  body { display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 2rem; }
  .box { max-width: 34rem; border: 3px solid var(--frozen-juniper); border-radius: 6px;
         padding: 2rem; background: rgba(93,204,202,0.06); }
  h1 { margin-top: 0; }
  .who { font-family: var(--font-mono); font-size: 0.85rem; opacity: 0.75; }
  a { color: var(--frozen-juniper); }
</style>
</head><body class="lang-en"><div class="box">
<h1>${chosen.title}</h1>
<p>${chosen.body}</p>
${who}
<p><a href="https://hub.digitailstudios.com/">Go to the studio hub</a> &middot;
   <a href="/">Back to the site</a></p>
</div></body></html>`;
    return new Response(html, {
        status: chosen.status,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


export default {
    // Nightly traffic snapshot. Cloudflare keeps 30 days; this keeps
    // them forever. It never throws: a cron has nobody to report to,
    // and a failed run must leave the table exactly as it was rather
    // than write zeros over real days. See src/analytics.js.
    async scheduled(event, env, ctx) {
        ctx.waitUntil((async () => {
            const result = await refreshAnalytics(env);
            if (result.ok) {
                console.log(`Traffic snapshot: wrote ${result.written} day(s)`);
            } else {
                console.error(`Traffic snapshot failed, nothing written: ${result.error}`);
            }
        })());
    },

    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname.startsWith('/api/')) {
            return handleApi(request, env, url);
        }

        if (url.pathname.startsWith('/media/')) {
            return serveMedia(request, env, url);
        }

        // Gate the admin panel.
        //
        // There is no login page to let past any more - Cloudflare Access
        // shows its own, in front of this Worker. What reaches here is
        // either a valid Access token or somebody who should be told why
        // not, in a sentence, on a page that looks like the site.
        //
        // ⚠️ This gate only runs because wrangler.toml lists /admin and
        // /admin/* under run_worker_first. Without that, static files
        // win and the whole block below is dead code. There is a test
        // asserting the setting is present; do not remove it.
        if (url.pathname.startsWith('/admin')) {
            const result = await adminIdentity(request, env);
            if (!result.ok) return refusal(result);

            const page = await env.ASSETS.fetch(request);

            // Cloudflare owns the session, so there is nothing to slide
            // along here any more. What remains is the cache rule: the
            // page served depends on who asked for it, so it must never
            // be stored.
            //
            // Only the document, though. This used to run for every
            // request under /admin, which pinned no-store to cacheable
            // .js and .css as well. Ask the asset server what it
            // actually served rather than guessing from the URL -
            // /admin, /admin/ and /admin/index.html are all the same
            // document, and guessing from the path got this wrong once.
            const servedHtml = (page.headers.get('Content-Type') || '').includes('text/html');
            const isDocument = request.method === 'GET' && servedHtml;

            // 204/304 and redirects cannot carry a body; rebuilding one
            // with a body throws.
            const bodyless = page.status === 204 || page.status === 304
                || (page.status >= 300 && page.status < 400);

            if (!isDocument || bodyless) return page;

            const fresh = new Response(page.body, page);
            fresh.headers.set('Cache-Control', 'no-store');
            return fresh;
        }

        return env.ASSETS.fetch(request);
    },
};
