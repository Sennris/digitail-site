/**
 * Press kit (migration 0011), driven through the real Worker.
 *
 *   node --experimental-sqlite tools/test_press.mjs
 *
 * Mutation-tested. See the log in the handover for which mutations.
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

function freshDb(skip = []) {
    const db = new DatabaseSync(':memory:');
    for (const f of readdirSync(join(ROOT, 'migrations')).sort()) {
        if (skip.some((p) => f.startsWith(p))) continue;
        db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
    }
    return db;
}

const env = (db) => ({
    DB: d1(db), SESSION_SECRET: SECRET,
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

const db = freshDb();
db.exec("INSERT OR IGNORE INTO admin_users (email, password_hash, salt) " +
        "VALUES ('a@example.test', 'x', 'y')");
const userId = db.prepare("SELECT id FROM admin_users WHERE email = 'a@example.test'").get().id;
const cookie = await createSession(userId, 'a@example.test', SECRET);


/* ---- 1. the studio factsheet ---------------------------------------- */

console.log('The studio factsheet:');

const KIT = {
    headingEn: 'Press Kit', headingMi: '',
    introEn: 'Take what you need.', introMi: '',
    foundedEn: 'Early 2025',
    basedInEn: 'Otautahi Christchurch, Aotearoa New Zealand',
    websiteUrl: 'https://www.digitailstudios.com',
    contactEmail: 'press@example.test',
    descriptionEn: 'First paragraph.\n\nSecond paragraph.', descriptionMi: '',
    permissionEn: 'Record, stream and monetise freely.', permissionMi: '',
};

let res = await worker.fetch(put('/api/content/pressKit', KIT, cookie), env(db));
check('the factsheet saved', res.status === 200, `got ${res.status}`);

res = await worker.fetch(get('/api/content/pressKit'), env(db));
const kitBack = await res.json();
check('it comes back whole', kitBack.foundedEn === 'Early 2025' &&
    kitBack.contactEmail === 'press@example.test');
check('the creator permission survived',
    kitBack.permissionEn === 'Record, stream and monetise freely.');


/* ---- 2. items and assets, studio and per-game ------------------------ */

console.log('\nAwards, quotes, articles and files:');

const ITEMS = [
    { gameId: 0, kind: 'award', titleEn: 'Refactor Day Selection', titleMi: '',
      bodyEn: 'Shortlisted.', bodyMi: '', source: 'Zephyr Festival',
      url: 'https://example.test/a', dateLabel: 'March 2026' },
    { gameId: 0, kind: 'quote', titleEn: 'A quiet marvel', titleMi: '',
      bodyEn: 'Genuinely unsettling.', bodyMi: '', source: 'Some Reviewer',
      url: '', dateLabel: '' },
    { gameId: 1, kind: 'article', titleEn: 'Hands on with the villa', titleMi: '',
      bodyEn: '', bodyMi: '', source: 'A Publication', url: 'https://example.test/b',
      dateLabel: 'April 2026' },
];

const ASSETS = [
    { gameId: 0, kind: 'pack', labelEn: 'Full studio pack', labelMi: '',
      url: '/media/2026/08/abc-studio-pack.zip', noteEn: 'ZIP, 24MB', noteMi: '' },
    { gameId: 0, kind: 'logo', labelEn: 'Studio wordmark', labelMi: '',
      url: '/media/2026/08/def-wordmark.webp', noteEn: 'PNG on transparent', noteMi: '' },
    { gameId: 1, kind: 'image', labelEn: 'Villa hallway', labelMi: '',
      url: '/media/2026/08/ghi-hallway.webp', noteEn: '', noteMi: '' },
];

res = await worker.fetch(put('/api/content/pressItems', ITEMS, cookie), env(db));
check('items saved', res.status === 200, `got ${res.status}`);
res = await worker.fetch(put('/api/content/pressAssets', ASSETS, cookie), env(db));
check('assets saved', res.status === 200, `got ${res.status}`);

const itemsBack = await (await worker.fetch(get('/api/content/pressItems'), env(db))).json();
const assetsBack = await (await worker.fetch(get('/api/content/pressAssets'), env(db))).json();

check('all three items came back', itemsBack.length === 3, `got ${itemsBack.length}`);
check('a studio item stays studio level',
    itemsBack.find((i) => i.titleEn === 'Refactor Day Selection').gameId === 0);
check('a game item keeps its game',
    itemsBack.find((i) => i.titleEn === 'Hands on with the villa').gameId === 1);
check('the source and date survived', (() => {
    const a = itemsBack.find((i) => i.kind === 'award');
    return a.source === 'Zephyr Festival' && a.dateLabel === 'March 2026';
})());
check('a press pack keeps its url',
    assetsBack.find((a) => a.kind === 'pack').url === '/media/2026/08/abc-studio-pack.zip');
check('packs and images are told apart',
    assetsBack.filter((a) => a.kind === 'pack').length === 1 &&
    assetsBack.filter((a) => a.kind === 'image').length === 1);


/* ---- 3. the per-game factsheet rides on the game --------------------- */

console.log('\nThe per-game factsheet:');

const games = await (await worker.fetch(get('/api/content/games', cookie), env(db))).json();
const withPress = games.map((g) => (g.id === 1
    ? { ...g, published: true, press: {
        platformsEn: 'PC (Steam)', releaseDateEn: 'TBA 2027', priceEn: 'TBA',
        descriptionEn: 'A long press description.', descriptionMi: '',
        contentNotesEn: 'Sensory overload, a looming threat.', contentNotesMi: '',
    } }
    : g));

res = await worker.fetch(put('/api/content/games', withPress, cookie), env(db));
check('a game with press fields saved', res.status === 200, `got ${res.status}`);

const back = await (await worker.fetch(get('/api/content/games'), env(db))).json();
const one = back.find((g) => g.id === 1);
check('the platforms survived', one.press.platformsEn === 'PC (Steam)',
    `got ${JSON.stringify(one.press.platformsEn)}`);
check('the content considerations survived',
    one.press.contentNotesEn === 'Sensory overload, a looming threat.');
check('press is stored as one column, not ten', (() => {
    const cols = db.prepare('PRAGMA table_info(games)').all().map((c) => c.name);
    return cols.includes('press_json') && !cols.includes('platforms_en');
})());

// Bad JSON must not take the whole endpoint down.
db.exec("UPDATE games SET press_json = '{not json' WHERE id = 1");
res = await worker.fetch(get('/api/content/games'), env(db));
check('corrupt press JSON degrades to empty instead of 500ing',
    res.status === 200 && (await res.json()).find((g) => g.id === 1).press !== undefined,
    `got ${res.status}`);


/* ---- 4. before the migration runs ------------------------------------ */

console.log('\nIf the Worker is deployed before migration 0011:');
const old = freshDb(['0011']);

for (const path of ['/api/content/pressItems', '/api/content/pressAssets']) {
    const r = await worker.fetch(get(path), env(old));
    check(`${path} 404s rather than erroring`, r.status === 404, `got ${r.status}`);
}

const r = await worker.fetch(put('/api/content/pressItems', ITEMS, cookie), env(old));
const body = await r.json();
check('saving says which migration to run',
    r.status >= 400 && /0011_press_kit\.sql/.test(JSON.stringify(body)),
    `got ${r.status}`);

const rg = await worker.fetch(get('/api/content/games'), env(old));
check('games still work without the press column', rg.status === 200, `got ${rg.status}`);


/* ---- 5. the front end ------------------------------------------------ */

console.log('\nThe page and the admin tab:');

const pressJs = readFileSync(join(ROOT, 'public/assets/js/pages/press.js'), 'utf8');
check('press values are set as text, never pasted into markup',
    !/innerHTML\s*=/.test(pressJs),
    'every field here is hand-typed, so one stray quote would break the page');
check('a game press kit is reachable by slug',
    /press\.html\?g=/.test(pressJs) && /searchParams/i.test(pressJs.replace(/\n/g, '')));
check('press packs download instead of opening',
    /setAttribute\('download'/.test(pressJs));
check('an empty press kit says so rather than showing bare headings',
    /still being put together/.test(pressJs));

const adminPress = readFileSync(join(ROOT, 'public/admin/admin-press.js'), 'utf8');
const codeOnly = adminPress
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('the admin tab never reads window.data', !/window\s*\.\s*data/.test(codeOnly));
check('its renders are signature-guarded', /dataset\.pressSignature/.test(codeOnly));
check('the game picker is built with new Option()',
    /new Option\(/.test(codeOnly),
    'game titles are hand-typed, so building options as HTML would break on a quote');
check('its wrapper is installed at parse time',
    /installWrapper\(\);\n\n    function boot/.test(adminPress),
    'installing inside boot() loses the race with api-adapter');

const adapter = readFileSync(join(ROOT, 'public/admin/api-adapter.js'), 'utf8');
check('press lists are in the load and save cycle',
    /'pressItems'/.test(adapter) && /'pressAssets'/.test(adapter) && /'pressKit'/.test(adapter));
check('a failed press load cannot publish an empty list',
    /type in loadedOk && !loadedOk\[type\]/.test(adapter));

const mediaSrc = readFileSync(join(ROOT, 'src/media.js'), 'utf8');
check('the server accepts a zip press pack', /'application\/zip'/.test(mediaSrc));
check('press packs get a bigger cap than images',
    /MAX_FILE_BYTES/.test(mediaSrc) && /const cap = isImage/.test(mediaSrc));

const uploadSrc = readFileSync(join(ROOT, 'public/admin/media-upload.js'), 'utf8');
check('a zip skips the WebP compression',
    /isRaw\(file\)\n\s*\? \{ blob: file/.test(uploadSrc),
    'compressing a zip produces a corrupt file that still has a .zip name');
check('press pack fields get the file picker, not the image one',
    /press-asset-file-"\]'\)\s*\n\s*\.forEach\(\(el\) => enhance\(el, \{ rawFile: true \}\)\)/.test(uploadSrc));

const navPages = ['index', 'game', 'games', 'devlogs', 'foxes', 'social', 'about', 'press'];
check('every page links to the press kit',
    navPages.every((n) => /href="press\.html"/.test(
        readFileSync(join(ROOT, `public/${n}.html`), 'utf8'))),
    navPages.join(', '));


console.log(
    failures.length
        ? `\n${failures.length} FAILED: ${failures.join(', ')}`
        : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
