/**
 * Does the admin panel actually show what is stored, and save it back?
 *
 * Written after a bug that hid for months: api-adapter.js called
 * loadHomepageForm() and loadGameForm(), neither of which exists. Both
 * calls sat behind `typeof x === 'function'` guards, so nothing ever threw
 * and the forms simply stayed empty. Then "Save to site" started reading
 * those empty forms and publishing the blanks over real content.
 *
 * Two things are checked here:
 *   1. Every function api-adapter.js expects to find really exists.
 *   2. Stored settings survive a populate -> collect round trip, and an
 *      actual change (unticking the announcement) is picked up.
 *
 * Run: node tools/test_admin_forms.mjs
 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let failures = 0;
const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
    if (!ok) failures++;
};

const adminSrc = readFileSync('public/admin/admin-script.js', 'utf8');
const adapterSrc = readFileSync('public/admin/api-adapter.js', 'utf8');

/* ---------- 1. every function the adapter reaches for must exist -------- */

const expected = [...adapterSrc.matchAll(/typeof\s+([A-Za-z_$][\w$]*)\s*===\s*'function'/g)]
    .map((m) => m[1]);

const declared = new Set(
    [...adminSrc.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
);

console.log('\nFunctions api-adapter.js expects from admin-script.js:');
for (const name of [...new Set(expected)]) {
    check(`${name} exists`, declared.has(name));
}

/* ---------- 2. a fake form, so populate/collect can be exercised -------- */

const FIELDS = [
    'hp-hero-title', 'hp-hero-tagline-en', 'hp-hero-tagline-mi',
    'hp-announce-enabled', 'hp-announce-image', 'hp-announce-text',
    'hp-announce-link', 'hp-announce-style', 'hp-announce-image-preview',
    'hp-mascot-current', 'hp-mascot-auto', 'hp-mascot-default-preview',
    'hp-mascot-default-img', 'hp-mascot-halloween-img',
    'hp-mascot-christmas-img', 'hp-mascot-newyear-img',
    'game-title-en', 'game-title-mi', 'game-tagline-en', 'game-tagline-mi',
    'game-trailer',
];

const makeEl = () => ({
    value: '', checked: false, innerHTML: '', textContent: '',
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, setAttribute() {}, querySelectorAll: () => [],
});

const els = new Map(FIELDS.map((id) => [id, makeEl()]));

const sandbox = {
    console,
    data: {},
    document: {
        getElementById: (id) => els.get(id) || null,
        addEventListener() {},
        querySelectorAll: () => [],
        querySelector: () => null,
        body: { classList: { contains: () => false } },
    },
    window: {},
    localStorage: { getItem: () => null, setItem() {} },
    showAlert() {},
    alert() {},
    confirm: () => true,
    FileReader: class {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(adminSrc, sandbox, { filename: 'admin-script.js' });

// admin-script.js declares `let data` at the top of the file. A top-level
// `let` lives in the context's lexical scope, NOT on the sandbox object, so
// sandbox.data is a DIFFERENT object and reading it would quietly test
// nothing. Go through the context for both directions.
const setData = (obj) => {
    sandbox.__incoming = obj;
    vm.runInContext('data = __incoming;', sandbox);
};
const getData = () => vm.runInContext('data', sandbox);

/* ---------- the round trip ---------- */

const stored = {
    hero: { titleEn: 'Digi Tail Studios', taglineEn: '// Real games.', taglineMi: '// He kēmu tūturu.' },
    announcement: {
        enabled: true, text: 'Demo out now!', image: '/media/banner.webp',
        link: 'https://example.test/demo', style: 'warning',
    },
    mascot: {
        current: 'halloween', autoSwitch: false,
        versions: { default: { image: '/media/fox.webp' }, halloween: { image: '/media/spooky.webp' } },
    },
    ticker: { enabled: true, speed: 40, items: ['A', 'B'] },
};

console.log('\nHomepage settings survive a round trip:');

setData({ homepage: JSON.parse(JSON.stringify(stored)), game: null });
const filled = sandbox.populateHomepageForm(getData().homepage);
check('populateHomepageForm reports it filled the form', filled === true);
check('announcement text reached the form', els.get('hp-announce-text').value === 'Demo out now!');
check('enabled tickbox reached the form', els.get('hp-announce-enabled').checked === true);
check('mascot choice reached the form', els.get('hp-mascot-current').value === 'halloween');
check('a mascot image URL reached the form',
    els.get('hp-mascot-halloween-img').value === '/media/spooky.webp');

sandbox.collectHomepageInfo();
const a = getData().homepage.announcement;
check('announcement text is not blanked by saving', a.text === 'Demo out now!', `got "${a.text}"`);
check('banner image is not blanked by saving', a.image === '/media/banner.webp');
check('link is not blanked by saving', a.link === 'https://example.test/demo');
check('style is not blanked by saving', a.style === 'warning');
check('hero tagline is not blanked by saving',
    getData().homepage.hero.taglineEn === '// Real games.');
check('mascot images are not blanked by saving',
    getData().homepage.mascot.versions.halloween.image === '/media/spooky.webp');
check('ticker settings are left alone entirely',
    Boolean(getData().homepage.ticker) && getData().homepage.ticker.speed === 40);

console.log('\nUnticking the announcement is actually picked up:');
els.get('hp-announce-enabled').checked = false;
sandbox.collectHomepageInfo();
check('enabled is now false', getData().homepage.announcement.enabled === false);
check('the text is still there, so it can be switched back on',
    getData().homepage.announcement.text === 'Demo out now!');

console.log('\nAn unfilled form cannot overwrite stored settings:');
{
    // Simulate a page where populate never ran.
    vm.runInContext('formsPopulated.homepage = false; formsPopulated.game = false;', sandbox);
    setData({ homepage: JSON.parse(JSON.stringify(stored)), game: null });
    FIELDS.forEach((id) => { els.get(id).value = ''; els.get(id).checked = false; });
    const result = sandbox.collectHomepageInfo();
    check('collectHomepageInfo refuses to run', result === false);
    check('stored announcement text is untouched',
        getData().homepage.announcement.text === 'Demo out now!');
    check('stored hero tagline is untouched',
        getData().homepage.hero.taglineEn === '// Real games.');
}

console.log('\nGame info survives a round trip:');
const game = { titleEn: 'Paper Crown', titleMi: 'Karauna Pepa', taglineEn: 'A tagline.',
               taglineMi: 'He tohu.', trailerUrl: 'https://example.test/embed/x' };
setData({ homepage: getData().homepage, game: { ...game } });
check('populateGameForm reports it filled the form', sandbox.populateGameForm(getData().game) === true);
check('title reached the form', els.get('game-title-en').value === 'Paper Crown');
sandbox.collectGameInfo();
check('title is not blanked by saving', getData().game.titleEn === 'Paper Crown');
check('trailer is not blanked by saving', getData().game.trailerUrl === 'https://example.test/embed/x');

console.log(failures === 0
    ? '\nAll checks passed. The admin shows what is stored, and saving keeps it.\n'
    : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
