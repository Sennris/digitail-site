/**
 * Session model, driven through the real Worker.
 *
 * Sessions are a 15-minute sliding window: admin page loads and
 * keepalive pings re-issue the cookie; silence lets it expire. The
 * cookie carries no Max-Age, so it also dies with the browser.
 *
 *   node --experimental-sqlite tools/test_session.mjs
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../src/index.js';
import { createSession } from '../src/auth.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-session-secret';
const failures = [];

function check(label, ok, detail = '') {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
    if (!ok) failures.push(label);
}

function d1(db) {
    return {
        prepare(sql) {
            const bound = [];
            const api = {
                bind(...args) { bound.push(...args); return api; },
                async first() { return db.prepare(sql).get(...bound) ?? null; },
                async all() { return { results: db.prepare(sql).all(...bound) }; },
                async run() { return db.prepare(sql).run(...bound); },
            };
            return api;
        },
    };
}

const db = new DatabaseSync(':memory:');
for (const f of readdirSync(join(ROOT, 'migrations')).sort()) {
    db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
}

const env = {
    DB: d1(db),
    SESSION_SECRET: SECRET,
    ASSETS: { fetch: async () => new Response('<html>admin</html>', { status: 200 }) },
};

const get = (path, cookie) => new Request(`https://www.digitailstudios.com${path}`,
    cookie ? { headers: { Cookie: `dt_session=${cookie}` } } : undefined);
const post = (path, cookie) => new Request(`https://www.digitailstudios.com${path}`,
    { method: 'POST', headers: cookie ? { Cookie: `dt_session=${cookie}` } : {} });

const cookieFrom = (res) => {
    const raw = res.headers.get('Set-Cookie') || '';
    const m = raw.match(/dt_session=([^;]+)/);
    return { raw, token: m ? m[1] : null };
};

/* ---- the cookie itself ---------------------------------------------- */

console.log('Cookie shape:');
let token = await createSession(1, 'cat@example.test', SECRET);
let res = await worker.fetch(post('/api/auth/keepalive', token), env);
let cookie = cookieFrom(res);
check('keepalive answers 200 with a fresh cookie', res.status === 200 && !!cookie.token);
check('cookie has NO Max-Age (dies with the browser)', !/max-age/i.test(cookie.raw), cookie.raw);
check('cookie is HttpOnly + Secure + SameSite=Strict',
    /HttpOnly/.test(cookie.raw) && /Secure/.test(cookie.raw) && /SameSite=Strict/.test(cookie.raw));
check('the fresh token is different from the old one', cookie.token !== token);

/* ---- the sliding window --------------------------------------------- */

console.log('\nSliding window:');
const realNow = Date.now;

res = await worker.fetch(get('/admin/index.html', token), env);
check('admin page load answers 200 while fresh', res.status === 200, `got ${res.status}`);
check('and re-issues the cookie (the slide)', !!cookieFrom(res).token);

// Ten minutes pass; use the re-issued cookie. Still inside the window.
let slid = cookieFrom(res).token;
Date.now = () => realNow() + 10 * 60 * 1000;
res = await worker.fetch(get('/admin/index.html', slid), env);
check('10 minutes later, the slid cookie still works', res.status === 200, `got ${res.status}`);
slid = cookieFrom(res).token;

// Another 10 minutes: 20 total, but the last re-issue was at minute 10,
// so this is inside its window. The slide is doing its job.
Date.now = () => realNow() + 20 * 60 * 1000;
res = await worker.fetch(get('/admin/index.html', slid), env);
check('the window keeps sliding while activity continues', res.status === 200, `got ${res.status}`);

/* ---- expiry --------------------------------------------------------- */

console.log('\nExpiry after walking away:');
const lastToken = cookieFrom(res).token;
// 16 minutes of silence: past the 15-minute window.
Date.now = () => realNow() + 36 * 60 * 1000;

res = await worker.fetch(get('/admin/index.html', lastToken), env);
check('an admin page bounces to the login page (302)',
    res.status === 302 && (res.headers.get('Location') || '').includes('/admin/login'),
    `got ${res.status} -> ${res.headers.get('Location')}`);

res = await worker.fetch(post('/api/auth/keepalive', lastToken), env);
check('keepalive answers 401 (guard sends the browser to login)', res.status === 401, `got ${res.status}`);

res = await worker.fetch(get('/api/subscribers', lastToken), env);
check('admin API routes answer 401 too', res.status === 401, `got ${res.status}`);

Date.now = realNow;

/* ---- no session at all ---------------------------------------------- */

console.log('\nNo cookie:');
res = await worker.fetch(post('/api/auth/keepalive', null), env);
check('keepalive without a cookie is 401', res.status === 401, `got ${res.status}`);
res = await worker.fetch(get('/admin/index.html', null), env);
check('admin pages without a cookie bounce to login', res.status === 302, `got ${res.status}`);

console.log();
if (failures.length) {
    console.log(`${failures.length} check(s) failed:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
}
console.log('All checks passed.');
