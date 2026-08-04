/**
 * Digi Tail Studios - Worker
 *
 * Two jobs:
 *   1. Serve the content API at /api/*
 *   2. Hand everything else to the static assets in /public
 *
 * Phase 1 is read-only. The API returns JSON in exactly the same shape
 * the site already expected from the .json files, so switching a page
 * over is a one-line change to its fetch URL.
 */

const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function error(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}


/* ------------------------------------------------------------------
   Readers. One per content type. Each returns the same shape as the
   original JSON file it replaces.
   ------------------------------------------------------------------ */

async function getDevlogs(db) {
    const { results: rows } = await db
        .prepare(`SELECT * FROM devlogs WHERE published = 1
                  ORDER BY sort_date DESC, id DESC`)
        .all();

    const { results: tagRows } = await db
        .prepare(`SELECT devlog_id, tag_name FROM devlog_tags
                  ORDER BY devlog_id, position`)
        .all();

    const tagsById = new Map();
    for (const t of tagRows) {
        if (!tagsById.has(t.devlog_id)) tagsById.set(t.devlog_id, []);
        tagsById.get(t.devlog_id).push(t.tag_name);
    }

    return rows.map((r) => ({
        id: r.id,
        sortDate: r.sort_date,
        displayDate: r.display_date,
        tags: tagsById.get(r.id) || [],
        titleEn: r.title_en,
        titleMi: r.title_mi,
        snippetEn: r.snippet_en,
        snippetMi: r.snippet_mi,
        contentEn: r.content_en,
        contentMi: r.content_mi,
        image: r.image,
    }));
}

async function getFoxes(db) {
    const { results } = await db
        .prepare('SELECT * FROM foxes ORDER BY id DESC')
        .all();

    return results.map((r) => ({
        id: r.id,
        nameEn: r.name_en,
        nameMi: r.name_mi,
        year: r.year,
        packageEn: r.package_en,
        packageMi: r.package_mi,
        descEn: r.desc_en,
        descMi: r.desc_mi,
        bioEn: r.bio_en,
        bioMi: r.bio_mi,
        image: r.image,
    }));
}

async function getTeam(db) {
    const { results } = await db
        .prepare('SELECT * FROM team ORDER BY sort_order, id')
        .all();

    return results.map((r) => ({
        id: r.id,
        nameEn: r.name_en,
        nameMi: r.name_mi,
        roleEn: r.role_en,
        roleMi: r.role_mi,
        bioEn: r.bio_en,
        bioMi: r.bio_mi,
        avatar: r.avatar,
    }));
}

async function getSocial(db) {
    const { results: rows } = await db
        .prepare('SELECT * FROM social_posts ORDER BY date DESC, id DESC')
        .all();

    const { results: tagRows } = await db
        .prepare('SELECT post_id, tag_name FROM social_tags ORDER BY post_id, position')
        .all();

    const tagsById = new Map();
    for (const t of tagRows) {
        if (!tagsById.has(t.post_id)) tagsById.set(t.post_id, []);
        tagsById.get(t.post_id).push(t.tag_name);
    }

    return rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        title: r.title,
        date: r.date,
        url: r.url,
        thumbnail: r.thumbnail,
        description: r.description,
        tags: tagsById.get(r.id) || [],
    }));
}

async function getTags(db) {
    const { results } = await db.prepare('SELECT * FROM tags ORDER BY id').all();
    return results.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        category: r.category,
    }));
}

async function getSetting(db, key) {
    const row = await db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .bind(key)
        .first();
    if (!row) return null;
    try {
        return JSON.parse(row.value);
    } catch {
        return null;
    }
}


const READERS = {
    devlogs:  (db) => getDevlogs(db),
    foxes:    (db) => getFoxes(db),
    team:     (db) => getTeam(db),
    social:   (db) => getSocial(db),
    tags:     (db) => getTags(db),
    homepage: (db) => getSetting(db, 'homepage'),
    game:     (db) => getSetting(db, 'game'),
};


/* ------------------------------------------------------------------
   Router
   ------------------------------------------------------------------ */

async function handleApi(request, env, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api','content','devlogs']

    if (parts[1] === 'health') {
        return json({ ok: true, time: new Date().toISOString() });
    }

    if (parts[1] === 'content' && parts[2]) {
        if (request.method !== 'GET') {
            return error('Read only for now. Writing arrives in Phase 2.', 405);
        }
        const reader = READERS[parts[2]];
        if (!reader) return error(`Unknown content type: ${parts[2]}`, 404);

        try {
            const data = await reader(env.DB);
            if (data === null) return error(`No data stored for ${parts[2]}`, 404);
            return json(data);
        } catch (e) {
            return error(`Database error: ${e.message}`, 500);
        }
    }

    return error('Not found', 404);
}


export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname.startsWith('/api/')) {
            return handleApi(request, env, url);
        }

        return env.ASSETS.fetch(request);
    },
};
