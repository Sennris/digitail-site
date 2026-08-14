/**
 * Newsletter endpoints, driven through the real Worker.
 *
 * Real SQLite built from the real migrations; Turnstile and Buttondown
 * are stubbed so the test runs offline and can force failures that are
 * hard to produce on purpose (siteverify down, Buttondown down).
 *
 *   node --experimental-sqlite tools/test_newsletter.mjs
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../src/index.js';
import { accessKit } from './_access_test_kit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-session-secret';
const failures = [];

function check(label, ok, detail = '') {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
    if (!ok) failures.push(label);
}

/* ---- fakes ---------------------------------------------------------- */

const calls = { siteverify: 0, buttondown: [] };
let turnstileVerdict = { success: true };
let turnstileThrows = false;
let buttondownStatus = 201;
let buttondownList = [];

globalThis.fetch = async (url, options = {}) => {
    const target = String(url);

    if (target.startsWith('https://challenges.cloudflare.com')) {
        calls.siteverify += 1;
        if (turnstileThrows) throw new Error('connection reset');
        return new Response(JSON.stringify(turnstileVerdict), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    if (target.startsWith('https://api.buttondown.com')) {
        calls.buttondown.push({ url: target, method: options.method || 'GET',
                                auth: options.headers?.Authorization });
        if (options.method === 'GET' || !options.method) {
            return new Response(JSON.stringify({ results: buttondownList, next: null }),
                { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ id: 'sub_test' }),
            { status: buttondownStatus, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`unexpected outbound request to ${target}`);
};

function d1(db) {
    return {
        prepare(sql) {
            const bound = [];
            const api = {
                bind(...args) { bound.push(...args); return api; },
                async first() { return db.prepare(sql).get(...bound) ?? null; },
                async all() { return { results: db.prepare(sql).all(...bound) }; },
                async run() {
                    const r = db.prepare(sql).run(...bound);
                    return { meta: { changes: Number(r.changes || 0) } };
                },
            };
            return api;
        },
    };
}

function freshDb() {
    const db = new DatabaseSync(':memory:');
    for (const f of readdirSync(join(ROOT, 'migrations')).sort()) {
        db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
    }
    return db;
}

// Built AFTER the Buttondown/Turnstile stub above, on purpose: the kit
// wraps whatever fetch is already installed rather than replacing it, so
// the certs URL is answered here and everything else still reaches the
// stub this suite depends on.
const kit = await accessKit();

const env = (db, overrides = {}) => ({
    DB: d1(db),
    ...kit.vars,
    TURNSTILE_SECRET: 'fake-turnstile-secret',
    BUTTONDOWN_API_KEY: 'fake-buttondown-key',
    ASSETS: { fetch: async () => new Response('asset') },
    ...overrides,
});

const post = (path, body, headers = {}) => new Request(
    `https://www.digitailstudios.com${path}`,
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers },
        body: JSON.stringify(body),
    });

const signup = (extra = {}) => post('/api/subscribe', {
    name: 'Test Person', email: 'someone@example.test',
    'cf-turnstile-response': 'a-token-from-the-widget', ...extra,
});

/* ---- 1. Turnstile gate ---------------------------------------------- */

console.log('Turnstile gate:');
let db = freshDb();

turnstileVerdict = { success: false, 'error-codes': ['invalid-input-response'] };
let res = await worker.fetch(signup(), env(db));
check('a failed check is refused (403)', res.status === 403, `got ${res.status}`);
check('nothing was stored', db.prepare('SELECT COUNT(*) AS n FROM subscribers').get().n === 0);

turnstileVerdict = { success: true };
res = await worker.fetch(post('/api/subscribe', { email: 'x@example.test' }), env(db));
check('a missing token is refused (403)', res.status === 403, `got ${res.status}`);

turnstileThrows = true;
res = await worker.fetch(signup(), env(db));
check('siteverify being unreachable fails CLOSED', res.status === 403, `got ${res.status}`);
turnstileThrows = false;

res = await worker.fetch(signup(), env(db, { TURNSTILE_SECRET: undefined }));
check('a missing secret fails CLOSED', res.status === 403, `got ${res.status}`);
check('still nothing stored', db.prepare('SELECT COUNT(*) AS n FROM subscribers').get().n === 0);

/* ---- 2. a real signup ----------------------------------------------- */

console.log('\nA valid signup:');
db = freshDb();
calls.buttondown = [];
res = await worker.fetch(signup(), env(db));
check('accepted (200)', res.status === 200, `got ${res.status}`);

let row = db.prepare('SELECT * FROM subscribers WHERE email = ?').get('someone@example.test');
check('stored in our own database', !!row);
check('held as pending until they confirm', row?.status === 'pending', row?.status);
check('marked as sent to the provider', row?.provider_state === 'sent', row?.provider_state);
check('given an unsubscribe token', !!row?.unsub_token);
check('Buttondown was called once', calls.buttondown.length === 1, `${calls.buttondown.length}`);
check('with a Token auth header',
    calls.buttondown[0]?.auth === 'Token fake-buttondown-key', calls.buttondown[0]?.auth);

res = await worker.fetch(signup(), env(db));
check('signing up twice does not duplicate',
    db.prepare('SELECT COUNT(*) AS n FROM subscribers').get().n === 1);

/* ---- 3. Buttondown down --------------------------------------------- */

console.log('\nWhen Buttondown is down:');
db = freshDb();
buttondownStatus = 500;
res = await worker.fetch(signup(), env(db));
row = db.prepare('SELECT * FROM subscribers WHERE email = ?').get('someone@example.test');
check('the person is still saved (list is ours)', !!row);
check('flagged so it can be retried', row?.provider_state === 'error', row?.provider_state);
check('the visitor is told, not fobbed off', res.status === 502, `got ${res.status}`);
buttondownStatus = 201;

/* ---- 4. unsubscribe -------------------------------------------------- */

console.log('\nUnsubscribe:');
db = freshDb();
await worker.fetch(signup(), env(db));

res = await worker.fetch(post('/api/unsubscribe',
    { email: 'someone@example.test', 'cf-turnstile-response': 'tok' }), env(db));
check('accepted (200)', res.status === 200, `got ${res.status}`);
row = db.prepare('SELECT status FROM subscribers WHERE email = ?').get('someone@example.test');
check('marked unsubscribed', row?.status === 'unsubscribed', row?.status);

const unknown = await worker.fetch(post('/api/unsubscribe',
    { email: 'nobody@example.test', 'cf-turnstile-response': 'tok' }), env(db));
check('an address we do not hold gets the SAME answer (no membership leak)',
    unknown.status === 200 && JSON.stringify(await unknown.json()) === '{"ok":true}');

res = await worker.fetch(post('/api/unsubscribe', { email: 'someone@example.test' }), env(db));
check('unsubscribe also needs Turnstile', res.status === 403, `got ${res.status}`);

/* ---- 5. admin endpoints --------------------------------------------- */

console.log('\nAdmin endpoints:');
db = freshDb();
kit.addPeopleTable(db);
await worker.fetch(signup(), env(db));

for (const path of ['/api/subscribers', '/api/subscribers/export']) {
    const anon = await worker.fetch(new Request(`https://www.digitailstudios.com${path}`), env(db));
    check(`${path} refuses a stranger (401)`, anon.status === 401, `got ${anon.status}`);
}
const anonSync = await worker.fetch(post('/api/subscribers/sync', {}), env(db));
check('/api/subscribers/sync refuses a stranger (401)', anonSync.status === 401, `got ${anonSync.status}`);

const asAdmin = await kit.headers('cat@test.nz');

res = await worker.fetch(new Request('https://www.digitailstudios.com/api/subscribers',
    { headers: asAdmin }), env(db));
let listed = await res.json();
check('logged in, the list comes back', res.status === 200 && listed.subscribers.length === 1);
check('counts are reported', listed.counts.pending === 1, JSON.stringify(listed.counts));

// Formula injection: a name starting with = would execute in Excel.
db.prepare("UPDATE subscribers SET name = '=1+1+cmd|calc' WHERE email = ?")
    .run('someone@example.test');
res = await worker.fetch(new Request('https://www.digitailstudios.com/api/subscribers/export',
    { headers: asAdmin }), env(db));
const csv = await res.text();
check('CSV downloads as a file',
    (res.headers.get('Content-Disposition') || '').includes('attachment'));
check('CSV defuses spreadsheet formula injection', csv.includes('"\t=1+1+cmd|calc"'),
    csv.split('\r\n')[1]);

/* ---- 6. sync pulls confirmations back ------------------------------- */

console.log('\nSync:');
buttondownList = [{ email_address: 'someone@example.test', type: 'regular' }];
res = await worker.fetch(post('/api/subscribers/sync', {}, asAdmin), env(db));
const synced = await res.json();
check('sync succeeds', res.status === 200 && synced.ok === true, JSON.stringify(synced));
row = db.prepare('SELECT status, confirmed_at FROM subscribers WHERE email = ?')
    .get('someone@example.test');
check('a confirmed subscriber is updated here', row?.status === 'confirmed', row?.status);
check('and stamped with a confirmation time', !!row?.confirmed_at);

/* ---- 7. health ------------------------------------------------------ */

console.log('\nHealth check:');
res = await worker.fetch(new Request('https://www.digitailstudios.com/api/health'), env(db));
const health = await res.json();
check('reports the Turnstile secret', /^set/.test(health.turnstileSecret), health.turnstileSecret);
check('reports the provider', health.newsletterProvider === 'buttondown');
res = await worker.fetch(new Request('https://www.digitailstudios.com/api/health'),
    env(db, { TURNSTILE_SECRET: undefined, BUTTONDOWN_API_KEY: undefined }));
const bare = await res.json();
check('says plainly when they are missing',
    /MISSING/.test(bare.turnstileSecret) && /MISSING/.test(bare.providerKey),
    `${bare.turnstileSecret} / ${bare.providerKey}`);

console.log();
if (failures.length) {
    console.log(`${failures.length} check(s) failed:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
}
console.log('All checks passed.');
