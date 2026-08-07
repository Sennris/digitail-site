/**
 * Mascot calendar scheduling.
 *
 *   node tools/test_mascots.mjs
 *
 * The dangerous failures here are not "the wrong fox appears". They are:
 *
 *   - the overlap rule quietly doing something other than what was agreed,
 *     which is invisible until the day it bites;
 *   - the two copies of that rule (pages/index.js runs it for real,
 *     admin-mascots.js runs it to show her which one is showing today)
 *     drifting apart, so the admin says one thing and the site does another;
 *   - a hand-typed name with a quote in it breaking the hero markup, which
 *     is what the old innerHTML concatenation did;
 *   - the four removed hp-mascot-* inputs still being read somewhere, which
 *     would throw and take the whole homepage save down with it.
 *
 * Every check below is mutation-tested: break the code it covers, confirm
 * this file fails, restore.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let passes = 0;

// Each check is wrapped so a throw fails its own check rather than
// abandoning every check after it.
function check(label, fn, detail = '') {
    let ok = false;
    let extra = detail;
    try {
        ok = typeof fn === 'function' ? fn() : fn;
    } catch (e) {
        ok = false;
        extra = `THREW: ${e.message}`;
    }
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
    if (ok) passes++; else failures.push(label);
}

const indexJs    = readFileSync(join(ROOT, 'public/assets/js/pages/index.js'), 'utf8');
const adminJs    = readFileSync(join(ROOT, 'public/admin/admin-mascots.js'), 'utf8');
const adminScript= readFileSync(join(ROOT, 'public/admin/admin-script.js'), 'utf8');
const adminHtml  = readFileSync(join(ROOT, 'public/admin/index.html'), 'utf8');
const adapterJs  = readFileSync(join(ROOT, 'public/admin/api-adapter.js'), 'utf8');
const writersJs  = readFileSync(join(ROOT, 'src/writers.js'), 'utf8');
const workerJs   = readFileSync(join(ROOT, 'src/index.js'), 'utf8');
const indexCss   = readFileSync(join(ROOT, 'public/assets/css/pages/index.css'), 'utf8');
const migration  = readFileSync(join(ROOT, 'migrations/0012_mascots.sql'), 'utf8');

// Comments are stripped before any assertion on source text. A "never uses
// innerHTML" check once matched the comment explaining that innerHTML was
// not used.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');


/* ================= pulling the real rule out of both files ============= */

// Brace matching, not slicing to an exact closing string: a mutation that
// changed that string once broke the extraction and crashed the suite
// instead of failing one check.
function extractFn(src, signature) {
    const start = src.indexOf(signature);
    if (start < 0) return '';
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    return '';
}

function extractLine(src, prefix) {
    const line = src.split('\n').find((l) => l.trim().startsWith(prefix));
    return line ? line.trim() : '';
}

const FN_SIGNATURES = [
    'function mascotDates(m, now)',
    'function mascotCoversToday(m, now)',
    'function mascotSpan(m, now)',
    'function pickMascot(list, now)',
];

// Builds a runnable copy of one file's rule. Returns null if anything is
// missing, so a check can say so rather than throwing somewhere confusing.
function buildRule(src, label) {
    const pad = extractLine(src, 'const pad2');
    const parts = FN_SIGNATURES.map((sig) => extractFn(src, sig));
    if (!pad || parts.some((p) => !p)) return null;
    const ctx = vm.createContext({ Date, Number, String, Infinity, Array, Boolean });
    vm.runInContext(
        [pad, ...parts].join('\n') +
        '\nglobalThis.pickMascot = pickMascot;' +
        '\nglobalThis.mascotSpan = mascotSpan;' +
        '\nglobalThis.mascotCoversToday = mascotCoversToday;',
        ctx
    );
    ctx.__label = label;
    return ctx;
}

console.log('Both copies of the rule were found:');

const site = buildRule(indexJs, 'pages/index.js');
const panel = buildRule(adminJs, 'admin-mascots.js');

check('the rule was extracted from pages/index.js', () => site !== null);
check('the rule was extracted from admin-mascots.js', () => panel !== null);

// Everything below runs against the site copy. If either extraction failed,
// stop here rather than reporting a wall of confusing failures.
if (!site || !panel) {
    console.log('\nCould not extract the rule; the checks below were not run.');
    console.log(`\n${failures.length} FAILED: ${failures.join(', ')}`);
    process.exit(1);
}

const pick = (list, iso) => site.pickMascot(list, new Date(iso + 'T12:00:00'));
const name = (m) => (m ? m.name : null);

// Shorthand for building a mascot. Defaults match the table defaults.
function fox(over) {
    return Object.assign({
        id: Math.floor(Math.random() * 1e6), name: 'fox', image: '/x.png',
        size: 'medium', dateStart: '', dateEnd: '',
        repeatsYearly: true, forced: false, enabled: true,
    }, over);
}


/* ================= 1. the agreed overlap rule ========================== */

console.log('\nShortest range wins, list order breaks a tie:');

const everyday = fox({ id: 1, name: 'everyday' });
const october  = fox({ id: 2, name: 'october',  dateStart: '10-01', dateEnd: '10-31' });
const birthday = fox({ id: 3, name: 'birthday', dateStart: '10-14', dateEnd: '10-14' });

check('a one-day mascot beats a month-long one',
    () => name(pick([everyday, october, birthday], '2026-10-14')) === 'birthday',
    `got ${name(pick([everyday, october, birthday], '2026-10-14'))}`);

check('order in the list does not change that',
    () => name(pick([birthday, october, everyday], '2026-10-14')) === 'birthday');

check('the month-long one still wins on a day the short one misses',
    () => name(pick([everyday, october, birthday], '2026-10-20')) === 'october');

check('an undated mascot loses to anything scheduled',
    () => name(pick([everyday, october], '2026-10-20')) === 'october');

check('an undated mascot wins when nothing else covers the day',
    () => name(pick([everyday, october, birthday], '2026-06-01')) === 'everyday');

check('nothing at all shows when no mascot covers the day',
    () => pick([october, birthday], '2026-06-01') === null);

console.log('\nTies fall to list order:');

const tieA = fox({ id: 10, name: 'first',  dateStart: '03-01', dateEnd: '03-07' });
const tieB = fox({ id: 11, name: 'second', dateStart: '03-03', dateEnd: '03-09' });

check('two equal-length ranges give the higher one in the list',
    () => name(pick([tieA, tieB], '2026-03-05')) === 'first',
    `got ${name(pick([tieA, tieB], '2026-03-05'))}`);

check('reordering the list changes which one wins',
    () => name(pick([tieB, tieA], '2026-03-05')) === 'second',
    'if this passes only because both are called the same thing, it proves nothing');

check('two undated mascots also fall to list order',
    () => name(pick([fox({ name: 'top' }), fox({ name: 'bottom' })], '2026-05-05')) === 'top');


/* ================= 2. the calendar itself ============================== */

console.log('\nDates:');

const newYear = fox({ id: 20, name: 'newyear', dateStart: '12-31', dateEnd: '01-07' });

check('a range may run over the year end - late December',
    () => name(pick([everyday, newYear], '2026-12-31')) === 'newyear');
check('a range may run over the year end - early January',
    () => name(pick([everyday, newYear], '2027-01-05')) === 'newyear');
check('and does not cover the middle of the year',
    () => name(pick([everyday, newYear], '2026-07-01')) === 'everyday');

check('a wrapping range is measured as the short way round',
    () => site.mascotSpan(newYear, new Date('2026-06-01T12:00:00')) === 8,
    `got ${site.mascotSpan(newYear, new Date('2026-06-01T12:00:00'))} days, expected 8`);

check('a wrapping range therefore beats a month-long one',
    () => name(pick([fox({ name: 'january', dateStart: '01-01', dateEnd: '01-31' }), newYear],
        '2027-01-05')) === 'newyear',
    'eight days is shorter than thirty-one, even though the dates run backwards');

const launch = fox({ id: 30, name: 'launch', repeatsYearly: false,
    dateStart: '2026-09-01', dateEnd: '2026-09-07' });

check('a one-off applies in its own year',
    () => name(pick([everyday, launch], '2026-09-03')) === 'launch');
check('a one-off does NOT come back the year after',
    () => name(pick([everyday, launch], '2027-09-03')) === 'everyday',
    'this is the whole point of the repeats-yearly toggle');

check('a repeating mascot ignores any year typed into the date',
    () => name(pick([everyday, fox({ name: 'yearly', repeatsYearly: true,
        dateStart: '2020-04-02', dateEnd: '2020-04-04' })], '2026-04-03')) === 'yearly',
    'the date picker always supplies a year; a repeating mascot keeps only MM-DD');

check('one date on its own means a single day',
    () => name(pick([everyday, fox({ name: 'oneday', dateStart: '08-09', dateEnd: '' })],
        '2026-08-09')) === 'oneday');
check('and only that day',
    () => name(pick([everyday, fox({ name: 'oneday', dateStart: '08-09', dateEnd: '' })],
        '2026-08-10')) === 'everyday');

// The typo goes FIRST in the list and the date is chosen to sit past the
// start. Both matter: an unwrapped range and a wrapped one give the same
// answer in the middle of the range, and a tie on span falls to list order,
// so with the typo second the everyday fox would win either way and the
// check would prove nothing.
const backwards = fox({ name: 'typo', repeatsYearly: false,
    dateStart: '2026-09-30', dateEnd: '2026-09-01' });
check('a one-off with its dates the wrong way round matches nothing',
    () => name(pick([backwards, everyday], '2026-10-15')) === 'everyday',
    `a backwards one-off is a typo, not a wrap - got ${name(pick([backwards, everyday], '2026-10-15'))}`);

check('the first and last days are both inside the range',
    () => name(pick([everyday, october], '2026-10-01')) === 'october' &&
          name(pick([everyday, october], '2026-10-31')) === 'october');
check('the day before the range is outside it',
    () => name(pick([everyday, october], '2026-09-30')) === 'everyday');


/* ================= 3. the switches =================================== */

console.log('\nThe override and the on/off switch:');

check('a forced mascot wins whatever the calendar says',
    () => name(pick([everyday, october, fox({ name: 'forced', forced: true })],
        '2026-10-20')) === 'forced');
check('a forced mascot wins even against a one-day range',
    () => name(pick([birthday, fox({ name: 'forced', forced: true })],
        '2026-10-14')) === 'forced');
check('a switched-off mascot never shows',
    () => name(pick([everyday, fox({ name: 'off', enabled: false, dateStart: '10-14',
        dateEnd: '10-14' })], '2026-10-14')) === 'everyday');
check('a switched-off mascot cannot force itself on either',
    () => name(pick([everyday, fox({ name: 'off', enabled: false, forced: true })],
        '2026-10-14')) === 'everyday');
check('an empty list shows nothing rather than throwing',
    () => pick([], '2026-10-14') === null);
check('a missing list shows nothing rather than throwing',
    () => site.pickMascot(undefined, new Date()) === null);


/* ================= 4. the two copies agree ============================ */

console.log('\nThe admin preview matches what the site will do:');

// Every scenario above, replayed through the admin panel's copy of the
// rule. This is the check that catches the two drifting apart.
const SCENARIOS = [
    [[everyday, october, birthday], '2026-10-14'],
    [[everyday, october, birthday], '2026-10-20'],
    [[everyday, october, birthday], '2026-06-01'],
    [[tieA, tieB], '2026-03-05'],
    [[tieB, tieA], '2026-03-05'],
    [[everyday, newYear], '2026-12-31'],
    [[everyday, newYear], '2027-01-05'],
    [[everyday, newYear], '2026-07-01'],
    [[everyday, launch], '2026-09-03'],
    [[everyday, launch], '2027-09-03'],
    [[everyday, october, fox({ name: 'forced', forced: true })], '2026-10-20'],
    [[october, birthday], '2026-06-01'],
    [[], '2026-10-14'],
];

const disagreements = SCENARIOS.filter(([list, iso]) => {
    const now = new Date(iso + 'T12:00:00');
    const a = site.pickMascot(list, now);
    const b = panel.pickMascot(list, now);
    return (a ? a.name : null) !== (b ? b.name : null);
});

check('both copies of the rule give the same answer every time',
    () => disagreements.length === 0,
    disagreements.map(([, iso]) => iso).join(', ') || `${SCENARIOS.length} scenarios`);

check('the scenario list is actually being compared',
    () => SCENARIOS.length >= 12,
    'a shrunken list would make the check above pass for nothing');


/* ================= 5. the render, and the quote bug =================== */

console.log('\nThe hero image is built, not concatenated:');

const renderSrc = extractFn(indexJs, 'function renderMascot(m)');
check('the renderer was found', () => renderSrc.length > 0);

const sizesLine = extractLine(indexJs, 'const MASCOT_SIZES');
const el = {
    _children: [], _classes: [], style: {},
    replaceChildren(...nodes) { this._children = nodes; },
    classList: {
        add(c) { if (!el._classes.includes(c)) el._classes.push(c); },
        remove(c) { el._classes = el._classes.filter((x) => x !== c); },
    },
};
const renderCtx = vm.createContext({
    document: {
        getElementById: () => el,
        // A real element, so setting .src and .alt is a property write and
        // not string building. If the renderer ever goes back to innerHTML,
        // nothing here will record it and the checks below fail.
        createElement: (tag) => ({ tag, src: '', alt: '' }),
    },
});
vm.runInContext(sizesLine + '\n' + renderSrc + '\nglobalThis.renderMascot = renderMascot;', renderCtx);

function rendered(m) {
    el._children = []; el._classes = []; el.style = {};
    try { renderCtx.renderMascot(m); } catch (e) { return { threw: e.message }; }
    return { child: el._children[0], classes: el._classes.slice(), style: el.style };
}

const QUOTED = 'Hine\'s "party" fox';
check('a name with quotes in it survives intact',
    () => rendered(fox({ name: QUOTED })).child.alt === QUOTED,
    'this is the bug the old innerHTML concatenation had');

check('the image url is set as a property, not pasted into markup',
    () => rendered(fox({ image: '/media/a.png' })).child.src === '/media/a.png');

check('a mascot with no image renders nothing',
    () => rendered(fox({ image: '' })).child === undefined);
check('a null mascot renders nothing rather than throwing',
    () => rendered(null).child === undefined && !rendered(null).threw);

check('a nameless mascot still gets alt text',
    () => rendered(fox({ name: '' })).child.alt.length > 0,
    'an empty alt would read as a decorative image to a screen reader');

check('the renderer never assigns innerHTML',
    () => !/innerHTML/.test(strip(renderSrc)));

console.log('\nSizes:');

check('the chosen size becomes a class',
    () => rendered(fox({ size: 'large' })).classes.includes('mascot-large'));
check('an unknown size falls back to medium',
    () => rendered(fox({ size: 'enormous' })).classes.includes('mascot-medium'),
    'not to nothing - the mascot has always been medium');
check('a missing size falls back to medium',
    () => rendered(fox({ size: undefined })).classes.includes('mascot-medium'));
check('the previous size class is cleared first',
    () => {
        // Deliberately NOT through rendered(), which resets the element -
        // that reset was hiding a leftover class rather than testing for it.
        el._children = []; el._classes = []; el.style = {};
        renderCtx.renderMascot(fox({ size: 'large' }));
        renderCtx.renderMascot(fox({ size: 'small' }));
        return el._classes.includes('mascot-small') && !el._classes.includes('mascot-large');
    },
    'two size classes at once would be decided by CSS source order, not by her');
check('the mascot is made visible',
    () => rendered(fox({})).style.display === 'block');

// Split at the first media query. Searching the whole file let the mobile
// rules answer for the desktop ones - deleting a desktop size entirely still
// passed, because its phone counterpart matched.
const cssBreak = indexCss.indexOf('@media (max-width: 768px)');
const cssDesktop = indexCss.slice(0, cssBreak);
const cssMobile = indexCss.slice(cssBreak);
const sizeRule = (s) => new RegExp(`\\.hero-mascot\\.mascot-${s}\\s*\\{[^}]*width`);

check('the media query was found, so the two halves are real',
    () => cssBreak > 0 && cssDesktop.includes('.hero-mascot') && cssMobile.includes('.hero-mascot'));
check('all three sizes are defined for desktop',
    () => ['small', 'medium', 'large'].every((s) => sizeRule(s).test(cssDesktop)),
    ['small', 'medium', 'large'].filter((s) => !sizeRule(s).test(cssDesktop)).join(', ') || '');
check('all three have a phone size too',
    () => ['small', 'medium', 'large'].every((s) => sizeRule(s).test(cssMobile)),
    ['small', 'medium', 'large'].filter((s) => !sizeRule(s).test(cssMobile)).join(', ') || '');

check('the size rules out-specify the plain .hero-mascot width',
    () => !/\.hero-mascot\.mascot-\w+\s*\{[^}]*!important/.test(indexCss),
    'two classes beat one, so !important is not needed here');


/* ================= 6. the old four slots are properly gone ============ */

console.log('\nThe four hardcoded slots are gone, everywhere:');

const DEAD_IDS = ['hp-mascot-current', 'hp-mascot-auto', 'hp-mascot-default-img',
                  'hp-mascot-halloween-img', 'hp-mascot-christmas-img',
                  'hp-mascot-newyear-img', 'hp-mascot-default-preview'];

const stillThere = DEAD_IDS.filter((id) =>
    adminScript.includes(id) || adminHtml.includes(id) ||
    readFileSync(join(ROOT, 'public/admin/media-upload.js'), 'utf8').includes(id));

check('no removed input id is referenced anywhere in the admin',
    () => stillThere.length === 0,
    stillThere.join(', ') || 'all seven gone');

check('collectHomepageInfo no longer reads a mascot input',
    () => {
        const fn = extractFn(adminScript, 'function collectHomepageInfo');
        return fn.length > 0 && !/hp-mascot/.test(fn);
    },
    'reading a missing element would throw and take the whole homepage save with it');

check('populateHomepageForm no longer writes a mascot input',
    () => {
        const fn = extractFn(adminScript, 'function populateHomepageForm');
        return fn.length > 0 && !/hp-mascot/.test(fn);
    });

check('the Mascot subtab still exists',
    () => /switchHomepageSub\('mascot'/.test(adminHtml));
check('the subtab has somewhere to mount',
    () => /id="mascots-list-panel"/.test(adminScript) && /id="mascots-editor"/.test(adminScript));
check('the module is loaded by the admin page',
    () => /admin-mascots\.js/.test(adminHtml));
check('it loads after api-adapter.js',
    () => adminHtml.indexOf('api-adapter.js') < adminHtml.indexOf('admin-mascots.js'),
    'the parse-time wrapper only works in that order');


/* ================= 7. the admin module's house rules ================== */

console.log('\nThe admin module follows the house rules:');

const adminCode = strip(adminJs);

check('it never reads window.data', () => !/window\s*\.\s*data/.test(adminCode));
check('it reaches the store through a typeof check',
    () => /typeof\s+data\s*===\s*['"]undefined['"]/.test(adminCode));
check('the list render is behind a signature check',
    () => /dataset\.mascotsSignature/.test(adminCode),
    'an unguarded write here loops against the MutationObserver and pins a core');
check('the editor render is behind a signature check',
    () => /dataset\.editorSignature/.test(adminCode));
check('its wrapper is installed at parse time',
    () => /installWrapper\(\);\s*\n\s*\/\/[\s\S]{0,600}?function settle/.test(adminJs) ||
          /installWrapper\(\);\s*\n\s*function settle/.test(adminJs),
    'installing inside boot() loses the race with api-adapter');
check('there is a settle poll as a backstop',
    () => /setInterval/.test(adminCode) && /clearInterval/.test(adminCode));
check('every button it renders is type="button"',
    () => {
        const buttons = adminJs.match(/<button[^>]*>/g) || [];
        return buttons.length > 0 && buttons.every((b) => /type="button"/.test(b));
    },
    'the mascot panel sits inside the homepage form, so a bare button submits it');
// Both halves matter. The first alone passed while the list row was
// unescaped, because the editor's separate `${esc(m.name)}` answered for it.
check('the list row escapes the name',
    () => /\$\{esc\(name\)\}/.test(adminJs));
check('no hand-typed value reaches markup unescaped',
    () => {
        // Only the two functions that build markup. A confirm() message or
        // a value that is escaped further down is not a bug, and a check
        // that cries wolf gets ignored.
        const markup = extractFn(adminJs, 'function listHTML()') +
                       extractFn(adminJs, 'function editorHTML(m)');
        if (!markup) return false;
        const bare = markup.match(
            /\$\{(?!esc\()[^}]*\b(m\.name|m\.image|m\.dateStart|m\.dateEnd|name)\b[^}]*\}/g) || [];
        return bare.length === 0;
    },
    'one stray quote in a hand-typed name broke a row on this site before');
// The upload button, the Library button and drag-and-drop are all attached
// by media-upload.js matching on the input's id. Nothing else connects them,
// so if either side of that pattern is renamed the field silently becomes a
// plain text box and she is back to pasting URLs by hand.
const mediaJs = readFileSync(join(ROOT, 'public/admin/media-upload.js'), 'utf8');
check('the mascot image field can be uploaded to',
    () => {
        const rendered = /id="mascot-image-\$\{m\.id\}"/.test(adminJs);
        const targeted = /\[id\^="mascot-image-"\]/.test(mediaJs);
        return rendered && targeted;
    },
    'the id the editor renders has to match the selector media-upload.js scans for');

check('it keeps the rollback copy in step',
    () => /d\.homepage\.mascot\s*=/.test(adminCode),
    'api-adapter publishes the homepage AFTER the mascots, so the browser copy has to agree');


/* ================= 8. the server side ================================= */

console.log('\nServer:');

const writersCode = strip(writersJs);

check('mascots are registered as a reader',
    () => /mascots:\s*getMascots/.test(strip(workerJs)));
check('mascots are registered as a writer',
    () => /mascots:\s*\(db, body\)\s*=>\s*putMascots/.test(writersCode));
check('a missing table returns null rather than throwing',
    () => {
        const fn = extractFn(workerJs, 'async function getMascots(db)');
        return /catch/.test(fn) && /return null/.test(fn);
    },
    'so the page falls back instead of the endpoint 500ing before the migration is run');
check('the writer names the migration when the table is missing',
    () => /0012_mascots\.sql/.test(writersCode));
check('the writer refuses anything that is not an array',
    () => /Expected an array of mascots/.test(writersJs));
check('only one mascot can be forced on',
    () => {
        const fn = extractFn(writersJs, 'export async function putMascots');
        return /forced && m === forced \? 1 : 0/.test(fn);
    });
check('an unrecognised size is stored as medium',
    () => {
        const fn = extractFn(writersJs, 'export async function putMascots');
        return /\['small', 'medium', 'large'\]\.includes/.test(fn) && /'medium'/.test(fn);
    });
check('position is written from the list order',
    () => /position/.test(extractFn(writersJs, 'export async function putMascots')),
    'order is the tiebreak, so it is content and has to survive a save');

// The mirror is what pages/index.js falls back to if the table vanishes.
const mirrorSrc = extractFn(writersJs, 'export function mascotMirror(items)');
check('the rollback mirror was found', () => mirrorSrc.length > 0);

const mirrorCtx = vm.createContext({});
vm.runInContext(
    'const s = (v) => (v === undefined || v === null ? \'\' : String(v));\n' +
    mirrorSrc.replace('export function', 'function') +
    '\nglobalThis.mascotMirror = mascotMirror;',
    mirrorCtx
);
const mirror = (list) => mirrorCtx.mascotMirror(list);

check('the mirror points at the always-on mascot',
    () => mirror([october, everyday]).versions.default.name === 'everyday',
    'not simply the first row - the fallback has no calendar to run');
check('it falls back to the first mascot when every one is dated',
    () => mirror([october, birthday]).versions.default.name === 'october');
check('it skips switched-off mascots',
    () => mirror([fox({ name: 'off', enabled: false }), everyday])
        .versions.default.name === 'everyday');
check('it is empty when there is nothing to mirror',
    () => mirror([]) === null);
check('the mirror does not claim to auto-switch',
    () => mirror([everyday]).autoSwitch === false,
    'it holds one mascot and no dates, so switching would have nothing to switch on');


/* ================= 9. the publish guard actually guards =============== */

console.log('\nThe save guard can now fail:');

const fetchSrc = extractFn(adapterJs, 'function fetchCollection(type)');
check('the collection fetch was found', () => fetchSrc.length > 0);

function runFetch(response) {
    const ctx = vm.createContext({
        fetch: () => (response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve(response)),
        FRESH: { cache: 'no-store' },
        Promise, JSON, Array,
    });
    vm.runInContext(fetchSrc + '\nglobalThis.fetchCollection = fetchCollection;', ctx);
    return ctx.fetchCollection('mascots');
}

const okResponse   = { ok: true, status: 200, json: () => Promise.resolve([{ id: 1 }]) };
const notFound     = { ok: false, status: 404, json: () => Promise.resolve(null) };
const serverError  = { ok: false, status: 500, json: () => Promise.resolve(null) };

const results = await Promise.all([
    runFetch(okResponse), runFetch(notFound), runFetch(serverError),
    runFetch(new Error('offline')),
]);

check('a good response counts as answered', () => results[0].answered === true);
check('a 404 counts as answered',
    () => results[1].answered === true,
    'the table is not there yet; publishing surfaces the migration message and can lose nothing');
check('a 500 does NOT count as answered',
    () => results[2].answered === false,
    'this is the case that could have deleted every row');
check('a dropped connection does NOT count as answered',
    () => results[3].answered === false);
check('a failed fetch still hands back an array to render',
    () => results[3].rows.length === 0 && Array.isArray(results[3].rows));

check('mascots are in the guarded list',
    () => /loadedOk\s*=\s*\{[^}]*mascots/.test(strip(adapterJs)));
check('the save skips anything that did not load',
    () => /if \(type in loadedOk && !loadedOk\[type\]\)/.test(adapterJs));


/* ================= 10. the migration ================================== */

console.log('\nMigration 0012, run for real:');

// Reading the SQL with a regex was not enough: dropping a whole slot from
// the move, or giving the everyday mascot dates, both left the file still
// matching. So this builds a database from every migration in order, with a
// mascot blob of her shape in it, and looks at what actually lands.

const ALL = readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort();

// Values chosen so they cannot be confused with the COALESCE fallbacks in
// the migration - if a slot silently falls back to its hardcoded default,
// these checks see it.
const BLOB = {
    hero: { titleEn: 'Digi Tail Studios' },
    mascot: {
        current: 'default', autoSwitch: true,
        versions: {
            default:   { image: '/media/every.png', name: 'Everyday Fox' },
            halloween: { image: '/media/spook.png', name: 'Spooky Fox',
                         activeDates: ['10-20', '11-04'] },
            christmas: { image: '/media/xmas.png', name: 'Tinsel Fox',
                         activeDates: ['12-05', '12-27'] },
            newyear:   { image: '/media/nye.png', name: 'Party Fox',
                         activeDates: ['12-30', '01-09'] },
        },
    },
};

function buildDb(withBlob) {
    const db = new DatabaseSync(':memory:');
    for (const f of ALL) {
        if (f === '0012_mascots.sql') continue;
        try { db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8')); }
        catch { /* a later ALTER re-running is expected; keep going */ }
    }
    // 0002_seed.sql already ships a homepage blob with four mascots in it,
    // so the empty case has to clear that row rather than simply not add one.
    db.exec("DELETE FROM settings WHERE key = 'homepage'");
    if (withBlob) {
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
          .run('homepage', JSON.stringify(BLOB));
    }
    return db;
}

const run0012 = (db) => db.exec(migration);
const rows = (db) => db.prepare('SELECT * FROM mascots ORDER BY position, id').all();

let moved = [];
check('the migration applies to a real database, moving all four slots', () => {
    const db = buildDb(true);
    run0012(db);
    moved = rows(db);
    return moved.length === 4;
});

const byName = (n) => moved.find((r) => r.name === n);

check('every one of the four slots came across',
    () => ['Everyday Fox', 'Spooky Fox', 'Tinsel Fox', 'Party Fox'].every((n) => byName(n)),
    ['Everyday Fox', 'Spooky Fox', 'Tinsel Fox', 'Party Fox']
        .filter((n) => !byName(n)).join(', ') || 'all four');

check('the names came from her blob, not from the fallbacks',
    () => moved.every((r) => !['Default', 'Halloween', 'Christmas', 'New Year'].includes(r.name)),
    moved.map((r) => r.name).join(', '));

check('the images came across too',
    () => byName('Spooky Fox') && byName('Spooky Fox').image === '/media/spook.png');

// Every slot, not just one. Checking a single range let a mutation that
// hardcoded halloween's dates go by unnoticed.
const EXPECTED_RANGES = {
    'Everyday Fox': ['', ''],
    'Spooky Fox': ['10-20', '11-04'],
    'Tinsel Fox': ['12-05', '12-27'],
    'Party Fox': ['12-30', '01-09'],
};
const wrongRange = Object.entries(EXPECTED_RANGES).filter(([n, [a, b]]) => {
    const row = byName(n);
    return !row || row.date_start !== a || row.date_end !== b;
});
check('every old activeDates pair became the right range',
    () => wrongRange.length === 0,
    wrongRange.map(([n]) => {
        const r = byName(n);
        return r ? `${n}: ${r.date_start}-${r.date_end}` : `${n}: missing`;
    }).join(', ') || 'all four ranges');

check('the everyday mascot arrives with NO dates',
    () => byName('Everyday Fox') && byName('Everyday Fox').date_start === '' &&
          byName('Everyday Fox').date_end === '',
    'blank dates are what make it the fallback under the agreed rule');

check('everything arrives repeating, on, and not forced',
    () => moved.every((r) => r.repeats_yearly === 1 && r.enabled === 1 && r.forced === 0));

check('they keep the order they were in',
    () => moved.map((r) => r.name)[0] === 'Everyday Fox' &&
          moved.map((r) => r.position).join(',') === '0,1,2,3');

check('re-running it cannot overwrite an edited row', () => {
    const db = buildDb(true);
    run0012(db);
    db.exec("UPDATE mascots SET name = 'RENAMED BY HER', date_start = '01-02' WHERE id = 2");
    run0012(db);
    const after = rows(db);
    const edited = after.find((r) => r.id === 2);
    return after.length === 4 && edited.name === 'RENAMED BY HER' && edited.date_start === '01-02';
}, 'this is the one that makes the migration safe to hand her');

check('an empty database still ends up with one usable row', () => {
    const db = buildDb(false);
    run0012(db);
    const after = rows(db);
    return after.length === 1 && after[0].date_start === '' && after[0].enabled === 1;
});

check('it is recorded in the ledger', () => {
    const db = buildDb(true);
    run0012(db);
    return db.prepare('SELECT filename FROM schema_migrations WHERE filename = ?')
             .get('0012_mascots.sql') !== undefined;
});

check('it never drops anything', () => !/\bDROP\b/i.test(migration));


console.log(
    failures.length
        ? `\n${passes} passed, ${failures.length} FAILED: ${failures.join(', ')}`
        : `\nAll ${passes} checks passed.`);
process.exit(failures.length ? 1 : 0);
