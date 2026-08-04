/**
 * Digi Tail Studios - Worker
 *
 *   /api/content/*   GET is public, PUT requires a login
 *   /api/auth/*      login, logout, session check
 *   /admin/*         redirected to the login page without a session
 *   everything else  served from /public
 */

import {
    verifyPassword, createSession, requireAuth,
    sessionCookie, clearCookie, isRateLimited, logAttempt,
} from './auth.js';
import { WRITERS } from './writers.js';
import { handleUpload, handleList, handleDelete, serveMedia } from './media.js';

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
    const { results } = await db.prepare('SELECT * FROM tags ORDER BY id').all();
    return results.map((r) => ({
        id: r.id, name: r.name, color: r.color, category: r.category,
    }));
}

async function getSetting(db, key) {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return null; }
}

const READERS = {
    devlogs: getDevlogs, foxes: getFoxes, team: getTeam,
    social: getSocial, tags: getTags,
    homepage: (db) => getSetting(db, 'homepage'),
    game: (db) => getSetting(db, 'game'),
};


/* ================= auth routes ================= */

async function handleAuth(request, env, parts) {
    const action = parts[2];
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (action === 'me') {
        const session = await requireAuth(request, env);
        return session
            ? json({ loggedIn: true, email: session.email }, 200, NO_CACHE)
            : json({ loggedIn: false }, 200, NO_CACHE);
    }

    if (action === 'logout') {
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...NO_CACHE, 'Set-Cookie': clearCookie() },
        });
    }

    if (action === 'login') {
        if (request.method !== 'POST') return fail('POST required', 405);
        if (!env.SESSION_SECRET) {
            return fail('SESSION_SECRET is not configured on this Worker', 500);
        }
        if (await isRateLimited(env.DB, ip)) {
            return fail('Too many failed attempts. Try again in 15 minutes.', 429);
        }

        let body;
        try { body = await request.json(); } catch { return fail('Invalid request body'); }
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!email || !password) {
            await logAttempt(env.DB, ip, email, false);
            return fail('Email and password are both required', 401);
        }

        const user = await env.DB
            .prepare('SELECT id, email, password_hash, salt FROM admin_users WHERE email = ?')
            .bind(email).first();

        let ok = false;
        if (user) {
            ok = await verifyPassword(password, user.password_hash, user.salt);
        } else {
            // Burn the same time hashing even when there's no such user, so
            // response timing doesn't reveal which emails are registered.
            await verifyPassword(password, '0'.repeat(64), '0'.repeat(32));
        }

        await logAttempt(env.DB, ip, email, ok);
        if (!ok) return fail('Incorrect email or password', 401);

        const token = await createSession(user.id, user.email, env.SESSION_SECRET);
        return new Response(JSON.stringify({ ok: true, email: user.email }), {
            status: 200,
            headers: { ...NO_CACHE, 'Set-Cookie': sessionCookie(token) },
        });
    }

    return fail('Unknown auth action', 404);
}


/* ================= api router ================= */

async function handleApi(request, env, url) {
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[1] === 'health') {
        return json({ ok: true, time: new Date().toISOString() }, 200, NO_CACHE);
    }

    if (parts[1] === 'auth') return handleAuth(request, env, parts);

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

    if (parts[1] === 'content' && parts[2]) {
        const type = parts[2];

        if (request.method === 'GET') {
            const reader = READERS[type];
            if (!reader) return fail(`Unknown content type: ${type}`, 404);
            try {
                const data = await reader(env.DB);
                if (data === null) return fail(`No data stored for ${type}`, 404);
                return json(data);
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

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname.startsWith('/api/')) {
            return handleApi(request, env, url);
        }

        if (url.pathname.startsWith('/media/')) {
            return serveMedia(request, env, url);
        }

        // Gate the admin panel. The login page itself stays public.
        if (url.pathname.startsWith('/admin')
            && !url.pathname.startsWith('/admin/login')) {
            const session = await requireAuth(request, env);
            if (!session) {
                return Response.redirect(new URL('/admin/login.html', url).toString(), 302);
            }
        }

        return env.ASSETS.fetch(request);
    },
};
