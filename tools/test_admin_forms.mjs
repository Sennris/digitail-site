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
    'game-trailer', 'game-keyart', 'game-keyart-preview',
    'game-blurb-en', 'game-blurb-mi',
    // the two "+ Add Tag" dropdowns, filled from the tag manager
    'devlog-tag-select', 'social-tag-select',
    'devlog-primary-tag', 'devlog-secondary-tag',
];

const makeEl = () => ({
    value: '', checked: false, innerHTML: '', textContent: '',
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, setAttribute() {}, querySelectorAll: () => [],
});

const els = new Map(FIELDS.map((id) => [id, makeEl()]));

const sandbox = {
    console,
    // Deliberately NO `data` property here.
    //
    // admin-script.js declares `let data`, and a top-level `let` in a
    // classic script does not become a property of window. An earlier
    // version of this file put `data: {}` on the sandbox, which made
    // `window.data` truthy here and nowhere else - so a real bug in
    // admin-extras.js sailed through this test twice.
    document: {
        getElementById: (id) => els.get(id) || null,
        createElement: () => {
            const el = makeEl();
            el.children = [];
            el.appendChild = function (c) { this.children.push(c); };
            el.insertBefore = function (c) { this.children.unshift(c); };
            // Register under its id the moment one is set, so
            // document.getElementById can find it afterwards - that is what
            // the real DOM does once the element is inserted.
            Object.defineProperty(el, 'id', {
                get() { return this._id || ''; },
                set(v) { this._id = v; if (v) els.set(v, this); },
            });
            return el;
        },
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

console.log('\nThe sandbox matches the browser:');
check('window.data is undefined, as it is in a real browser',
    vm.runInContext('typeof window.data', sandbox) === 'undefined');
check('the script\'s own data binding is reachable',
    vm.runInContext('typeof data', sandbox) === 'object');

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
               taglineMi: 'He tohu.', trailerUrl: 'https://example.test/embed/x',
               keyArt: '/media/keyart.webp', blurbEn: 'Front page blurb.',
               blurbMi: 'He kupu whakataki.' };
setData({ homepage: getData().homepage, game: { ...game } });
check('populateGameForm reports it filled the form', sandbox.populateGameForm(getData().game) === true);
check('title reached the form', els.get('game-title-en').value === 'Paper Crown');
sandbox.collectGameInfo();
check('title is not blanked by saving', getData().game.titleEn === 'Paper Crown');
check('trailer is not blanked by saving', getData().game.trailerUrl === 'https://example.test/embed/x');
check('homepage blurb reached the form', els.get('game-blurb-en').value === 'Front page blurb.');
check('homepage blurb is not blanked by saving', getData().game.blurbEn === 'Front page blurb.');
check('key art reached the form', els.get('game-keyart').value === '/media/keyart.webp');
check('key art is not blanked by saving', getData().game.keyArt === '/media/keyart.webp');

/* ---- the "+ Add Tag" dropdowns must follow the tag manager ---- */

console.log('\nA tag you create shows up in the devlog dropdown:');
{
    // fillSelect lives inside an IIFE in admin-extras.js, so exercise it the
    // way the page does: set the tag list, then run the module.
    const selects = new Map([
        ['devlog-tag-select', makeEl()],
        ['social-tag-select', makeEl()],
        ['devlog-primary-tag', makeEl()],
        ['devlog-secondary-tag', makeEl()],
        ['devlog-tags', makeEl()],
    ]);
    for (const [id, el] of selects) {
        el.children = [];
        el.appendChild = function (o) { this.children.push(o); };
        el.parentElement = { insertBefore() {} };
        els.set(id, el);
    }

    setData({
        tags: [
            { id: 1, name: 'Paper Crown', kind: 'primary' },
            { id: 2, name: 'Shader Wrangling', kind: 'secondary' },
        ],
        devlogs: [],
    });

    sandbox.Option = function (label, value) { return { label, value }; };
    sandbox.MutationObserver = class { observe() {} disconnect() {} };
    sandbox.requestAnimationFrame = (fn) => fn();
    sandbox.document.documentElement = {};

    vm.runInContext(readFileSync('public/admin/admin-extras.js', 'utf8'), sandbox,
        { filename: 'admin-extras.js' });

    const devlogSel = els.get('devlog-tag-select');
    const names = (devlogSel.children || []).map((o) => o.value);
    check('the new secondary tag is an option', names.includes('Shader Wrangling'),
        `got [${names.join(', ')}]`);
    check('the new primary tag is an option too', names.includes('Paper Crown'));
    check('the placeholder is still first',
        devlogSel.children[0] && devlogSel.children[0].value === '');

    const primary = els.get('devlog-primary-tag');
    const pNames = (primary.children || []).map((o) => o.value);
    check('primary picker only offers primary tags',
        pNames.includes('Paper Crown') && !pNames.includes('Shader Wrangling'),
        `got [${pNames.join(', ')}]`);
}

/* ---- the ticker editor must read and write the stored settings ---- */

console.log('\nTicker edits reach the stored settings:');
{
    // These stubs remember their listeners so the test can fire the same
    // 'input' event the editor listens for, rather than reaching inside
    // ticker-editor.js for a function it does not expose.
    const fire = [];
    ['ticker-enabled', 'ticker-items', 'ticker-speed',
     'ticker-speed-label', 'ticker-preview'].forEach((id) => {
        const el = makeEl();
        el.addEventListener = function (type, fn) {
            if (type === 'input') fire.push(fn);
        };
        els.set(id, el);
    });
    // mount() needs the homepage tab and its ticker slot to exist, and must
    // NOT find an existing #ticker-editor, or it bails before wiring up.
    els.set('homepage-tab', makeEl());
    els.set('hp-ticker-slot', (() => {
        const el = makeEl();
        el.appendChild = function () {};
        return el;
    })());

    setData({
        homepage: { ticker: { enabled: true, speed: 44, items: ['STORED ONE', 'STORED TWO'] } },
        tags: [], devlogs: [],
    });

    vm.runInContext(readFileSync('public/admin/ticker-editor.js', 'utf8'), sandbox,
        { filename: 'ticker-editor.js' });

    // The editor fills its fields from read(); if read() hands back a
    // throwaway defaults object, the stored items never appear.
    const itemsField = els.get('ticker-items');
    check('the stored ticker items load into the editor',
        itemsField.value.includes('STORED ONE'), `got "${itemsField.value}"`);
    check('the stored speed loads into the editor',
        String(els.get('ticker-speed').value) === '44');

    // And an edit has to land on the real settings object, not a copy.
    els.get('ticker-items').value = 'EDITED ITEM';
    els.get('ticker-enabled').checked = false;
    els.get('ticker-speed').value = 20;
    fire.forEach((fn) => fn());
    const stored2 = getData().homepage.ticker;
    check('an edit reaches the stored settings',
        Array.isArray(stored2.items) && stored2.items[0] === 'EDITED ITEM',
        `got ${JSON.stringify(stored2.items)}`);
    check('switching the ticker off reaches the stored settings',
        stored2.enabled === false);
}

/* ---- the tag manager must catch up with tags that arrive later ---- */

console.log('\nThe tag manager shows tags that load after it is built:');
{
    // Fresh sandbox: the panel gets built while the tag list is still empty,
    // exactly as it is on a real page load, and the content arrives after.
    const els2 = new Map();
    const mk = () => ({
        value: '', checked: false, innerHTML: '', textContent: '',
        style: {}, dataset: {}, children: [],
        classList: { add() {}, remove() {}, contains: () => false },
        addEventListener() {}, setAttribute() {},
        querySelectorAll: () => [],
        appendChild(c) { this.children.push(c); },
        insertBefore(c) { this.children.unshift(c); },
    });
    els2.set('devlogs-tab', mk());

    const sb = {
        console: { log() {}, warn() {}, error() {} },
        document: {
            getElementById: (id) => els2.get(id) || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener() {},
            documentElement: {},
            createElement: () => {
                const el = mk();
                Object.defineProperty(el, 'id', {
                    get() { return this._id || ''; },
                    set(v) { this._id = v; if (v) els2.set(v, this); },
                });
                return el;
            },
        },
        MutationObserver: class { observe() {} disconnect() {} },
        requestAnimationFrame: (fn) => fn(),
        Option: function (label, value) { return { label, value }; },
        showAlert() {}, alert() {}, confirm: () => true,
    };
    sb.window = sb;
    vm.createContext(sb);

    // The store exists but has no tags yet - the fetch has not landed.
    vm.runInContext('let data = { tags: [], devlogs: [] };', sb);
    vm.runInContext(readFileSync('public/admin/admin-extras.js', 'utf8'), sb,
        { filename: 'admin-extras.js' });

    const panel = els2.get('tag-kinds-panel');
    check('the panel gets built even with no tags loaded yet', Boolean(panel));
    check('and it says so', panel && panel.innerHTML.includes('None yet.'));

    // Now the content arrives, and something triggers a remount - which is
    // what happens when the admin finishes loading.
    // Deliberately NOT 'Paper Crown' / 'Bug Fix': those two strings appear
    // in the panel's own input placeholders ("e.g. Paper Crown"), so an
    // earlier version of this check matched the placeholder and passed
    // while the list was still empty.
    vm.runInContext(`data.tags = [
        { id: 1, name: 'Zephyr Project', kind: 'primary' },
        { id: 2, name: 'Refactor Day', kind: 'secondary' }
    ];`, sb);
    vm.runInContext('window.loadFromServer = async function () {};', sb);
    sb.document.addEventListener = () => {};
    vm.runInContext(readFileSync('public/admin/admin-extras.js', 'utf8'), sb,
        { filename: 'admin-extras.js (remount)' });

    const after = els2.get('tag-kinds-panel');
    const html = (after && after.innerHTML) || '';
    check('the tag list catches up without anyone pressing Add',
        html.includes('Zephyr Project') && html.includes('Refactor Day'),
        html.includes('None yet.') ? 'still says None yet.' : '');
    check('and the empty-state message is gone', !html.includes('None yet.'));
}

console.log(failures === 0
    ? '\nAll checks passed. The admin shows what is stored, and saving keeps it.\n'
    : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
