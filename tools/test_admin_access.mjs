/**
 * Cloudflare Access as the admin login.
 *
 *   node --experimental-sqlite tools/test_admin_access.mjs
 *
 * The website's admin now accepts two ways in: a signed Cloudflare
 * Access token mapped to the studio hub's `people` table, and the old
 * password session. The password half is being retired, so everything
 * here is about the new half being genuinely safe BEFORE the old one
 * is deleted.
 *
 * Real RSA keys, real signatures, real forgeries. A security check
 * tested against a mock of itself proves nothing.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = await import(pathToFileURL(join(ROOT, 'src', 'auth.js')).href);
const ACCESS = await import(pathToFileURL(join(ROOT, 'src', 'access.js')).href);

let pass = 0;
let fail = 0;

async function check(name, fn) {
    try {
        const r = await fn();
        if (r === true) { pass += 1; console.log(`  PASS  ${name}`); }
        else { fail += 1; console.log(`  FAIL  ${name}${r ? ` - ${r}` : ''}`); }
    } catch (e) {
        fail += 1;
        console.log(`  FAIL  ${name} - threw: ${e.message}`);
    }
}


/* ---------- a real key pair ---------- */

const TEAM = 'autumn-recipe-b82c.cloudflareaccess.com';
const AUD = 'the-studio-application';
const KID = 'k1';

const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
);
const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
const JWKS = [{ kid: KID, kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256' }];

const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
);

const b64url = (b) => Buffer.from(b).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const part = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function token(email, opts = {}) {
    const header = { alg: 'RS256', kid: KID, typ: 'JWT', ...(opts.header || {}) };
    const seconds = Math.floor(Date.now() / 1000);
    const payload = {
        aud: [opts.aud || AUD],
        iss: `https://${opts.iss || TEAM}`,
        email,
        sub: 'sub-1',
        exp: seconds + 3600,
        iat: seconds,
        ...(opts.payload || {}),
    };
    const input = `${part(header)}.${part(payload)}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',
        opts.signWith || pair.privateKey, new TextEncoder().encode(input));
    return `${input}.${b64url(new Uint8Array(sig))}`;
}

globalThis.fetch = async () => new Response(JSON.stringify({ keys: JWKS }), { status: 200 });


/* ---------- a database with the hub's people table ---------- */

function makeDb() {
    const sqlite = new DatabaseSync(':memory:');
    // The hub owns this table; the website only reads it. Mirrored here
    // rather than imported, because the two repos do not share migrations.
    sqlite.exec(`
        CREATE TABLE people (
            id INTEGER PRIMARY KEY, name TEXT, display_name TEXT, email TEXT,
            role TEXT, is_director INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
            can_edit_site INTEGER DEFAULT 0
        );
        INSERT INTO people (id, name, display_name, email, is_director, active, can_edit_site) VALUES
            (1, 'Caitlin', 'Cat', 'cat@test.nz', 1, 1, 1),
            (2, 'Writer',  'Wri', 'writer@test.nz', 0, 1, 1),
            (3, 'Vol',     'Vol', 'vol@test.nz', 0, 1, 0),
            (4, 'Gone',    'Gone', 'gone@test.nz', 1, 0, 1);
    `);
    const wrap = (sql) => {
        let bound = [];
        const stmt = {
            bind(...a) { bound = a; return stmt; },
            async first() { return sqlite.prepare(sql).get(...bound) ?? null; },
            async all() { return { results: sqlite.prepare(sql).all(...bound) }; },
            async run() { return { meta: {} }; },
        };
        return stmt;
    };
    return { prepare: wrap, _raw: sqlite };
}

const env = (db, over = {}) => ({
    DB: db,
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    SESSION_SECRET: 'a-secret-for-the-old-login',
    ...over,
});

const req = (tok) => new Request('https://www.digitailstudios.com/admin/', {
    headers: tok ? { 'Cf-Access-Jwt-Assertion': tok } : {},
});


/* ---------- who gets in ---------- */

console.log('\nWho gets in');

await check('a director with website rights gets in', async () => {
    ACCESS.clearKeyCache();
    const s = await AUTH.requireAuth(req(await token('cat@test.nz')), env(makeDb()));
    return (s && s.email === 'cat@test.nz' && s.viaAccess === true) || JSON.stringify(s);
});

await check('a NON-director with website rights also gets in', async () => {
    ACCESS.clearKeyCache();
    const s = await AUTH.requireAuth(req(await token('writer@test.nz')), env(makeDb()));
    return (s && s.viaAccess === true) || 'website editing is fused to being a director';
});

await check('a team member WITHOUT website rights does not', async () => {
    ACCESS.clearKeyCache();
    const s = await AUTH.requireAuth(req(await token('vol@test.nz')), env(makeDb()));
    return s === null || JSON.stringify(s);
});

await check('somebody who has LEFT does not, even with rights still set', async () => {
    ACCESS.clearKeyCache();
    const s = await AUTH.requireAuth(req(await token('gone@test.nz')), env(makeDb()));
    return s === null || JSON.stringify(s);
});

await check('a valid token for somebody not on the team at all does not', async () => {
    ACCESS.clearKeyCache();
    const s = await AUTH.requireAuth(req(await token('stranger@test.nz')), env(makeDb()));
    return s === null || JSON.stringify(s);
});


/* ---------- forgeries ---------- */

console.log('\nForgeries');

await check('a token signed with another key is refused', async () => {
    ACCESS.clearKeyCache();
    const t = await token('cat@test.nz', { signWith: other.privateKey });
    return (await AUTH.requireAuth(req(t), env(makeDb()))) === null || 'accepted a forged signature';
});

await check('a token for a different Access application is refused', async () => {
    ACCESS.clearKeyCache();
    const t = await token('cat@test.nz', { aud: 'someone-elses-app' });
    return (await AUTH.requireAuth(req(t), env(makeDb()))) === null || 'accepted a foreign audience';
});

await check('a token from a different Cloudflare team is refused', async () => {
    ACCESS.clearKeyCache();
    const t = await token('cat@test.nz', { iss: 'someone-else.cloudflareaccess.com' });
    return (await AUTH.requireAuth(req(t), env(makeDb()))) === null || 'accepted a foreign issuer';
});

await check('an expired token is refused', async () => {
    ACCESS.clearKeyCache();
    const t = await token('cat@test.nz', { payload: { exp: Math.floor(Date.now() / 1000) - 1 } });
    return (await AUTH.requireAuth(req(t), env(makeDb()))) === null || 'accepted an expired token';
});

await check('a validly signed token claiming a different algorithm is refused', async () => {
    ACCESS.clearKeyCache();
    const t = await token('cat@test.nz', { header: { alg: 'HS256' } });
    return (await AUTH.requireAuth(req(t), env(makeDb()))) === null || 'trusted the header alg';
});


/* ---------- failing closed, and the fallback ---------- */

console.log('\nFailing closed');

await check('no token at all falls through rather than granting', async () => {
    ACCESS.clearKeyCache();
    return (await AUTH.requireAuth(req(null), env(makeDb()))) === null || 'a bare request got in';
});

await check('an unconfigured Worker does not let Access tokens through', async () => {
    ACCESS.clearKeyCache();
    const t = await token('cat@test.nz');
    const s = await AUTH.requireAuth(req(t), env(makeDb(), { ACCESS_AUD: '' }));
    return s === null || 'a missing config value became an open door';
});

await check('a missing people table falls back instead of locking her out', async () => {
    ACCESS.clearKeyCache();
    const db = makeDb();
    db._raw.exec('DROP TABLE people');
    const t = await token('cat@test.nz');
    // No password cookie either, so null is correct - the point is that
    // it returns rather than throwing a 500 across the whole admin.
    const s = await AUTH.requireAuth(req(t), env(db));
    return s === null || JSON.stringify(s);
});

await check('the password login still works while it is being retired', async () => {
    ACCESS.clearKeyCache();
    const secret = 'a-secret-for-the-old-login';
    const cookie = await AUTH.createSession(7, 'legacy@test.nz', secret);
    const request = new Request('https://www.digitailstudios.com/admin/', {
        headers: { Cookie: `${readFileSync(join(ROOT, 'src/auth.js'), 'utf8').match(/COOKIE_NAME\s*=\s*'([^']+)'/)[1]}=${cookie}` },
    });
    const s = await AUTH.requireAuth(request, env(makeDb()));
    return (s && s.email === 'legacy@test.nz' && !s.viaAccess) || JSON.stringify(s);
});

await check('Access is checked BEFORE the password cookie, not after', () => {
    // Comments STRIPPED first. The comment above the Access call names
    // readSession while explaining what gets deleted later, and an
    // unstripped check reads that prose and reports the wrong order.
    // Third time this exact shape has bitten on this project.
    const src = readFileSync(join(ROOT, 'src/auth.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const body = src.slice(src.indexOf('export async function requireAuth'));
    return body.indexOf('accessSession') < body.indexOf('readSession')
        || 'the password path would win over a real Access identity';
});


/* ---------- wiring ---------- */

console.log('\nWiring');

const index = readFileSync(join(ROOT, 'src/index.js'), 'utf8');
const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8')
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

await check('an Access login is never handed one of our session cookies', () => {
    // Two places mint a cookie: keepalive, and serving an admin page.
    // Both must skip it - a cookie with a null user id would outlive the
    // Access session it was standing in for.
    const keepalive = index.slice(index.indexOf("action === 'keepalive'"), index.indexOf("action === 'keepalive'") + 900);
    const gate = index.slice(index.indexOf('Gate the admin panel'));
    return (/session\.viaAccess/.test(keepalive) && /session\.viaAccess/.test(gate))
        || 'a cookie could still be pinned onto an Access session';
});

await check('the session endpoint reports which way somebody signed in', () => (
    /viaAccess: !!session\.viaAccess/.test(index) || 'the admin cannot tell the two apart'
));

await check('the Access config is present and matches the hub', () => (
    (/ACCESS_TEAM_DOMAIN\s*=\s*"autumn-recipe-b82c\.cloudflareaccess\.com"/.test(toml)
        && /ACCESS_AUD\s*=\s*"89b16d95/.test(toml))
        || 'the website and the hub would disagree about who is signed in'
));

await check('the login page skips itself for an Access login', () => {
    const login = readFileSync(join(ROOT, 'public/admin/login.html'), 'utf8');
    return (/d\.viaAccess/.test(login) && /location\.replace\('\/admin\/'\)/.test(login))
        || 'somebody signed in via Access would still be shown a password form';
});

// This setting is invisible, silently load-bearing, and the thing the
// whole "delete the password login" step rests on. Without it the gate
// below never runs, because a static file wins over the Worker. A later
// tidy-up of wrangler.toml could quietly re-open the admin, so it gets a
// test of its own. Comments are stripped above, so a commented-out copy
// cannot answer for the real line.
await check('the Worker runs first on /admin, the API and /media', () => {
    const line = toml.split('\n').find((l) => /run_worker_first/.test(l));
    if (!line) return 'run_worker_first is missing - downloads 404 and the admin gate never runs';
    return (['"/admin"', '"/admin/*"', '"/api/*"', '"/media/*"'].every((p) => line.includes(p)))
        || `run_worker_first is there but incomplete: ${line.trim()}`;
});

await check('/admin is listed separately from /admin/*', () => {
    const line = toml.split('\n').find((l) => /run_worker_first/.test(l)) || '';
    // A pattern ending in /* does not match its own parent. Listing only
    // /admin/* leaves /admin itself served straight from storage.
    return /"\/admin"/.test(line)
        || 'only /admin/* is listed, so /admin itself still skips the Worker';
});

await check('the copied verifier says loudly that it is a copy', () => {
    const copy = readFileSync(join(ROOT, 'src/access.js'), 'utf8');
    return /IF YOU CHANGE ONE, CHANGE BOTH/.test(copy)
        || 'nothing warns that this file is duplicated in the hub repo';
});


console.log(`\n${'='.repeat(46)}`);
console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
console.log('='.repeat(46));
process.exit(fail === 0 ? 0 : 1);
