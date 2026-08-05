/**
 * Proves /admin/setup.html cannot re-arm itself.
 *
 * The old gate was `SELECT COUNT(*) FROM admin_users`, so anything that
 * emptied that table — including re-running 0003_auth.sql — reopened
 * account creation to the public. This drives the real Worker handler
 * against a real SQLite database built from the real migrations.
 *
 *   node --experimental-sqlite tools/test_setup_gate.mjs
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(label, ok, detail = '') {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
    if (!ok) failures.push(label);
}

// ---- the smallest D1-shaped wrapper that these code paths need ----------
function d1(db) {
    return {
        prepare(sql) {
            const bound = [];
            const api = {
                bind(...args) { bound.push(...args); return api; },
                async first(col) {
                    const row = db.prepare(sql).get(...bound);
                    if (!row) return null;
                    return col === undefined ? row : row[col];
                },
                async all() { return { results: db.prepare(sql).all(...bound) }; },
                async run() { return db.prepare(sql).run(...bound); },
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

const env = (db) => ({
    DB: d1(db),
    SESSION_SECRET: 'test-secret-not-a-real-one',
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
});

const setupReq = (method, body) => new Request(
    'https://www.digitailstudios.com/api/auth/setup',
    method === 'POST'
        ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : { method });

// ---- 1. a genuinely new database should allow setup --------------------
console.log('Fresh database, no admin account:');
let db = freshDb();
let res = await worker.fetch(setupReq('GET'), env(db));
let out = await res.json();
check('GET reports needsSetup: true', out.needsSetup === true, JSON.stringify(out));

res = await worker.fetch(setupReq('POST', {
    email: 'cat@example.test', password: 'a-long-enough-password',
}), env(db));
out = await res.json();
check('first account can be created', res.status === 200 && out.ok === true, JSON.stringify(out));
check('bootstrap flag was written',
    db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='admin_bootstrapped'").get().n === 1);

// ---- 2. setup is shut once an account exists ---------------------------
console.log('\nAfter setup has been used:');
res = await worker.fetch(setupReq('GET'), env(db));
out = await res.json();
check('GET reports needsSetup: false', out.needsSetup === false, JSON.stringify(out));

res = await worker.fetch(setupReq('POST', {
    email: 'attacker@example.test', password: 'another-long-password',
}), env(db));
check('second account refused (403)', res.status === 403, `got ${res.status}`);

// ---- 3. THE BUG: admin_users emptied, flag still standing --------------
console.log('\nAfter admin_users is wiped (re-running 0003_auth.sql):');
db.exec(readFileSync(join(ROOT, 'tools', 'DANGER_reset_database.sql'), 'utf8')
    .split('\n').filter(l => l.includes('admin_users')).join('\n'));
db.exec('CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT,'
    + ' email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL,'
    + " created_at TEXT NOT NULL DEFAULT (datetime('now')))");

check('admin_users really is empty',
    db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n === 0);

res = await worker.fetch(setupReq('GET'), env(db));
out = await res.json();
check('GET still reports needsSetup: false', out.needsSetup === false, JSON.stringify(out));

res = await worker.fetch(setupReq('POST', {
    email: 'attacker@example.test', password: 'another-long-password',
}), env(db));
check('takeover attempt refused (403)', res.status === 403, `got ${res.status}`);
check('no account was created',
    db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n === 0);

// ---- 4. the deliberate recovery path still works -----------------------
console.log('\nDeliberate password reset (clearing both):');
db.exec("DELETE FROM settings WHERE key='admin_bootstrapped'");
res = await worker.fetch(setupReq('GET'), env(db));
out = await res.json();
check('GET reports needsSetup: true again', out.needsSetup === true, JSON.stringify(out));

res = await worker.fetch(setupReq('POST', {
    email: 'cat@example.test', password: 'a-brand-new-password',
}), env(db));
check('account can be recreated', res.status === 200, `got ${res.status}`);

console.log();
if (failures.length) {
    console.log(`${failures.length} check(s) failed:`);
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
}
console.log('All checks passed. Setup cannot re-arm itself.');
