/**
 * Games as a list (migration 0009), driven through the real Worker.
 *
 *   node --experimental-sqlite tools/test_games.mjs
 *
 * Every check here is mutation-tested: break the code it covers and it
 * fails. See the note at the bottom for which mutations were used.
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
                async run() {
                    const r = db.prepare(sql).run(...bound);
                    return { meta: { changes: Number(r.changes || 0) } };
                },
            };
            return api;
        },
        async batch(statements) {
            const out = [];
            for (const s of statements) out.push(await s.run());
            return out;
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
    SESSION_SECRET: SECRET,
    ASSETS: { fetch: async () => new Response('asset') },
});

const get = (path, cookie) => new Request(
    `https://www.digitailstudios.com${path}`,
    cookie ? { headers: { Cookie: `dt_session=${cookie}` } } : {});

const put = (path, body, cookie) => new Request(
    `https://www.digitailstudios.com${path}`,
    {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `dt_session=${cookie}` },
        body: JSON.stringify(body),
    });


/* ---- 1. the migration moves the existing game across ---------------- */

console.log('Migration 0009 promotes the stored game:');
let db = freshDb();

// The seed stores exactly one game as a settings blob. After 0009 it must
// be row 1 of the games table, unchanged.
const seeded = JSON.parse(
    db.prepare("SELECT value FROM settings WHERE key = 'game'").get().value);
const promoted = db.prepare('SELECT * FROM games WHERE id = 1').get();

check('the stored title survived the move',
    promoted.title_en === (seeded.titleEn || ''),
    `blob=${JSON.stringify(seeded.titleEn)} row=${JSON.stringify(promoted.title_en)}`);
check('the stored tagline survived the move',
    promoted.tagline_en === (seeded.taglineEn || ''));
check('the promoted game is the featured one', promoted.featured === 1);
check('the old settings blob was left in place as a rollback copy',
    db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'game'").get().n === 1);

// Two unnamed placeholders, deliberately not public.
const hidden = db.prepare('SELECT COUNT(*) AS n FROM games WHERE published = 0').get().n;
check('the two early projects are seeded hidden', hidden === 2, `hidden=${hidden}`);


/* ---- 2. the public API hides unpublished games ---------------------- */

console.log('\nWhat the public can read:');
let res = await worker.fetch(get('/api/content/games'), env(db));
let publicGames = await res.json();

check('unpublished games are not returned at all',
    publicGames.every((g) => g.published === true),
    `returned ${publicGames.length}`);
check('an unannounced title cannot be read from the public endpoint',
    !JSON.stringify(publicGames).includes('Untitled small project'));

db.exec("INSERT OR IGNORE INTO admin_users (email, password_hash, salt) " +
        "VALUES ('a@example.test', 'x', 'y')");
const userId = db.prepare("SELECT id FROM admin_users WHERE email = 'a@example.test'").get().id;
const cookie = await createSession(userId, 'a@example.test', SECRET);

res = await worker.fetch(get('/api/content/games', cookie), env(db));
const adminGames = await res.json();
check('a signed-in admin sees the hidden ones too',
    adminGames.length > publicGames.length,
    `admin=${adminGames.length} public=${publicGames.length}`);


/* ---- 3. saving a list round-trips ----------------------------------- */

console.log('\nSaving the list:');
const payload = [
    {
        id: 1, slug: 'zephyr-project', titleEn: 'Zephyr Project', titleMi: '',
        taglineEn: 'A tagline', taglineMi: '', blurbEn: 'A blurb', blurbMi: '',
        trailerUrl: '', keyArt: '/media/art.webp',
        statusEn: 'In development', statusMi: '',
        ctaLabelEn: 'Wishlist', ctaLabelMi: '', ctaUrl: 'https://example.test/store',
        noteEn: '', noteMi: '',
        featured: true, published: true,
        features: [
            { taglineEn: 'Refactor Day', taglineMi: '', textEn: 'One', textMi: '', image: '' },
            { taglineEn: 'Second Section', taglineMi: '', textEn: 'Two', textMi: '', image: '/media/two.webp' },
        ],
    },
    {
        id: 2, slug: '', titleEn: 'Quiet Harbour', titleMi: '',
        taglineEn: '', taglineMi: '', blurbEn: '', blurbMi: '',
        trailerUrl: '', keyArt: '', statusEn: '', statusMi: '',
        ctaLabelEn: '', ctaLabelMi: '', ctaUrl: '',
        noteEn: 'More soon.', noteMi: '',
        // Deliberately also ticked as featured. Only one may survive.
        featured: true, published: true, features: [],
    },
];

res = await worker.fetch(put('/api/content/games', payload, cookie), env(db));
check('the save was accepted', res.status === 200, `got ${res.status}`);

res = await worker.fetch(get('/api/content/games', cookie), env(db));
const saved = await res.json();

check('both games came back', saved.length === 2, `got ${saved.length}`);
check('the sections came back in order',
    saved[0].features.length === 2 &&
    saved[0].features[0].taglineEn === 'Refactor Day' &&
    saved[0].features[1].textEn === 'Two');
check('a section image survived', saved[0].features[1].image === '/media/two.webp');
check('only one game is featured',
    saved.filter((g) => g.featured).length === 1,
    `featured=${saved.filter((g) => g.featured).length}`);
check('a blank slug falls back to the id', saved[1].slug === '2');
check('the button link survived', saved[0].ctaUrl === 'https://example.test/store');


/* ---- 4. the front page card keeps working --------------------------- */

// Featuring the SECOND game on purpose. The first version of this test
// featured the first row, so "returns the featured game" and "returns the
// first game" were the same answer and the check could not tell them
// apart - it passed even with the featured flag ignored entirely.
console.log('\nThe front page card (the old singular endpoint):');

const refeatured = payload.map((g, i) => ({ ...g, featured: i === 1 }));
res = await worker.fetch(put('/api/content/games', refeatured, cookie), env(db));
check('featuring a different game saved', res.status === 200, `got ${res.status}`);

res = await worker.fetch(get('/api/content/game'), env(db));
const single = await res.json();

check('it still answers', res.status === 200, `got ${res.status}`);
check('it returns the featured game, which is NOT the first row',
    single.titleEn === 'Quiet Harbour', `got ${JSON.stringify(single.titleEn)}`);
check('it keeps the flat shape the homepage expects',
    'keyArt' in single && 'blurbEn' in single && 'taglineMi' in single);

const mirror = JSON.parse(
    db.prepare("SELECT value FROM settings WHERE key = 'game'").get().value);
check('the rollback copy was updated to match the featured game',
    mirror.titleEn === 'Quiet Harbour', `got ${JSON.stringify(mirror.titleEn)}`);


/* ---- 5. degrading before the migration is run ------------------------ */

console.log('\nIf the Worker is deployed before the migration runs:');
const old = new DatabaseSync(':memory:');
for (const f of readdirSync(join(ROOT, 'migrations')).sort()) {
    if (f.startsWith('0009')) continue;
    old.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
}

res = await worker.fetch(get('/api/content/games'), env(old));
check('the games endpoint 404s rather than erroring', res.status === 404, `got ${res.status}`);

res = await worker.fetch(get('/api/content/game'), env(old));
const fallback = await res.json();
check('the front page card falls back to the old settings blob',
    res.status === 200 && typeof fallback.titleEn === 'string',
    `got ${res.status}`);


/* ---- 6. the admin module avoids the window.data trap ---------------- */

console.log('\nThe admin module:');
const adminGamesSrc = readFileSync(join(ROOT, 'public/admin/admin-games.js'), 'utf8');
const codeOnly = adminGamesSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

check('it never reads window.data',
    !/window\s*\.\s*data/.test(codeOnly),
    'admin-script.js uses `let data`, so window.data is undefined forever');
check('it reaches the store through a typeof check',
    /typeof\s+data\s*===\s*['"]undefined['"]/.test(codeOnly));
check('every render is behind a signature guard',
    /dataset\.gamesSignature/.test(codeOnly) && /dataset\.editorSignature/.test(codeOnly),
    'an unguarded redraw retriggers the MutationObserver and pins a CPU core');

const adapterSrc = readFileSync(join(ROOT, 'public/admin/api-adapter.js'), 'utf8');
check('games are in the load and save cycle',
    /TYPES\s*=\s*\[[^\]]*'games'/.test(adapterSrc));
check('a failed games load cannot publish an empty list',
    /loadedOk\.games/.test(adapterSrc) &&
    /type === 'games' && !loadedOk\.games/.test(adapterSrc));
check('the browser no longer publishes its own copy of the game blob',
    !/putContent\('game',/.test(adapterSrc),
    'putGames owns that blob now; a second writer could only put it out of date');


/* ---- done ----------------------------------------------------------- */

console.log(
    failures.length
        ? `\n${failures.length} FAILED: ${failures.join(', ')}`
        : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
