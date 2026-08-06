/**
 * Digi Tail Studios - Worker
 *
 *   /api/content/*   GET is public, PUT requires a login
 *   /api/auth/*      login, logout, session check
 *   /admin/*         redirected to the login page without a session
 *   everything else  served from /public
 */

import {
    hashPassword, verifyPassword, createSession, requireAuth,
    sessionCookie, clearCookie, isRateLimited, logAttempt,
} from './auth.js';
import { WRITERS } from './writers.js';
import { handleUpload, handleList, handleDelete, serveMedia } from './media.js';
import {
    handleSubscribe, handleUnsubscribe, handleSubscriberList,
    handleSubscriberExport, handleSubscriberSync, newsletterHealth,
} from './newsletter.js';

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

    // The admin panel pings this while its tab is open. Each ping trades
    // the current cookie for a fresh one, sliding the 15-minute window
    // along. Stop pinging (tab closed, walked away) and the session
    // expires on its own.
    if (action === 'keepalive') {
        if (request.method !== 'POST') return fail('POST required', 405);
        const session = await requireAuth(request, env);
        if (!session) return fail('Not logged in', 401);

        const fresh = await createSession(session.userId, session.email, env.SESSION_SECRET);
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...NO_CACHE, 'Set-Cookie': sessionCookie(fresh) },
        });
    }

    // One-time account creation. Refuses once an admin exists, so it
    // cannot be used to add a second account later.
    //
    // It also refuses once the site has EVER been set up, tracked by a
    // flag in settings. Checking admin_users alone was not enough:
    // re-running 0003_auth.sql, or any other route to an empty table,
    // silently reopened this endpoint to the public. settings is not
    // touched by that migration, so the flag outlives the accident.
    // To deliberately reset a lost password, clear both:
    //   DELETE FROM admin_users;
    //   DELETE FROM settings WHERE key = 'admin_bootstrapped';
    if (action === 'setup') {
        const existing = await env.DB
            .prepare('SELECT COUNT(*) AS n FROM admin_users').first();
        const bootstrapped = await env.DB
            .prepare("SELECT 1 AS n FROM settings WHERE key = 'admin_bootstrapped'")
            .first();

        const alreadySetUp = (existing?.n || 0) > 0 || !!bootstrapped;

        if (request.method === 'GET') {
            return json({ needsSetup: !alreadySetUp }, 200, NO_CACHE);
        }
        if (request.method !== 'POST') return fail('POST required', 405);

        if (alreadySetUp) {
            return fail('An admin account already exists.', 403);
        }
        if (!env.SESSION_SECRET) {
            return fail('SESSION_SECRET is not configured on this Worker', 500);
        }

        let body;
        try { body = await request.json(); } catch { return fail('Invalid request body'); }
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!email.includes('@')) return fail('That does not look like an email address');
        if (password.length < 10) return fail('Use at least 10 characters');

        const { hash, salt } = await hashPassword(password, undefined, env.SESSION_SECRET);
        await env.DB
            .prepare('INSERT INTO admin_users (email, password_hash, salt) VALUES (?,?,?)')
            .bind(email, hash, salt).run();

        // Latch setup shut. Survives admin_users being dropped.
        await env.DB
            .prepare(`INSERT INTO settings (key, value)
                      VALUES ('admin_bootstrapped', datetime('now'))
                      ON CONFLICT(key) DO NOTHING`)
            .run();

        return json({ ok: true, email }, 200, NO_CACHE);
    }

    // Managing admin accounts. Requires an existing login, unlike setup.
    if (action === 'users') {
        const session = await requireAuth(request, env);
        if (!session) return fail('Not logged in', 401);

        if (request.method === 'GET') {
            const { results } = await env.DB
                .prepare('SELECT id, email, created_at FROM admin_users ORDER BY id').all();
            return json(results.map((r) => ({
                id: r.id, email: r.email, createdAt: r.created_at,
                isYou: r.email === session.email,
            })), 200, NO_CACHE);
        }

        if (request.method === 'POST') {
            let body;
            try { body = await request.json(); } catch { return fail('Invalid request body'); }
            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '');

            if (!email.includes('@')) return fail('That does not look like an email address');
            if (password.length < 10) return fail('Use at least 10 characters');

            const exists = await env.DB
                .prepare('SELECT id FROM admin_users WHERE email = ?').bind(email).first();
            if (exists) return fail('That email already has an account', 409);

            const { hash, salt } = await hashPassword(password, undefined, env.SESSION_SECRET);
            await env.DB
                .prepare('INSERT INTO admin_users (email, password_hash, salt) VALUES (?,?,?)')
                .bind(email, hash, salt).run();
            return json({ ok: true, email }, 200, NO_CACHE);
        }

        if (request.method === 'DELETE') {
            const id = Number(parts[3]);
            const target = await env.DB
                .prepare('SELECT email FROM admin_users WHERE id = ?').bind(id).first();
            if (!target) return fail('No such account', 404);
            if (target.email === session.email) {
                return fail('You cannot remove your own account while signed in.', 400);
            }
            const { n } = await env.DB
                .prepare('SELECT COUNT(*) AS n FROM admin_users').first();
            if (n <= 1) return fail('There has to be at least one admin account.', 400);

            await env.DB.prepare('DELETE FROM admin_users WHERE id = ?').bind(id).run();
            return json({ ok: true, removed: target.email }, 200, NO_CACHE);
        }

        return fail('Method not allowed', 405);
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
            ok = await verifyPassword(password, user.password_hash, user.salt, env.SESSION_SECRET);
        } else {
            // Burn the same time hashing even when there's no such user, so
            // response timing doesn't reveal which emails are registered.
            await verifyPassword(password, '0'.repeat(64), '0'.repeat(32), env.SESSION_SECRET);
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
        // Reports whether each binding and secret is present. Never the
        // values themselves, only whether they exist and are non-empty.
        let dbOk = false;
        let adminCount = null;
        try {
            const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users').first();
            adminCount = row?.n ?? null;
            dbOk = true;
        } catch { /* leave dbOk false */ }

        return json({
            ok: true,
            time: new Date().toISOString(),
            database: dbOk ? 'connected' : 'NOT WORKING',
            adminAccounts: adminCount,
            sessionSecret: env.SESSION_SECRET
                ? `set (${String(env.SESSION_SECRET).length} chars)`
                : 'MISSING OR EMPTY',
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
            return await handleAuth(request, env, parts);
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

    if (parts[1] === 'content' && parts[2]) {
        const type = parts[2];

        if (request.method === 'GET') {
            const reader = READERS[type];
            if (!reader) return fail(`Unknown content type: ${type}`, 404);
            try {
                const data = await reader(env.DB);
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
            && !url.pathname.startsWith('/admin/login')
            && !url.pathname.startsWith('/admin/setup')) {
            const session = await requireAuth(request, env);
            if (!session) {
                return Response.redirect(new URL('/admin/login.html', url).toString(), 302);
            }
            const page = await env.ASSETS.fetch(request);

            // Serving an admin PAGE slides the session window along, so
            // "Back to Site" then returning does not demand a login.
            //
            // Only the page, though. This used to run for every request
            // under /admin, which meant a fresh login cookie was pinned
            // to cacheable .js and .css responses. A cached copy then
            // handed the browser a stale, already-expired cookie and
            // logged the user straight back out. Two rules now:
            // credentials only ride on the document request, and any
            // response carrying one is marked no-store.
            // "Is this the page itself, or something the page pulled in?"
            // Ask the asset server what it actually served rather than
            // guessing from the URL - /admin, /admin/ and /admin/index.html
            // are all the same document, and guessing from the path got
            // this wrong once already.
            const servedHtml = (page.headers.get('Content-Type') || '').includes('text/html');
            const isDocument = request.method === 'GET' && servedHtml;

            // 204/304 and redirects cannot carry a body; rebuilding one
            // with a body throws.
            const bodyless = page.status === 204 || page.status === 304
                || (page.status >= 300 && page.status < 400);

            if (!isDocument || bodyless) return page;

            const fresh = await createSession(session.userId, session.email, env.SESSION_SECRET);
            const withCookie = new Response(page.body, page);
            withCookie.headers.set('Cache-Control', 'no-store');
            withCookie.headers.append('Set-Cookie', sessionCookie(fresh));
            return withCookie;
        }

        return env.ASSETS.fetch(request);
    },
};
