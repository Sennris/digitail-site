/**
 * The skulk: eggs, toys and the rune chain.
 *
 *   node tools/test_eggs.mjs
 *
 * Node built-ins only, like every other suite here.
 *
 * ⚠️ MOST OF THESE ARE STATIC CHECKS and cannot prove a fox slides in or
 * that snow falls. What they CAN do is stop a later tidy-up quietly
 * undoing something - which is the real risk with this lot, because a
 * guard against firing while somebody is typing looks like clutter to
 * anyone who does not know why it is there.
 *
 * THE EXCEPTION, AND IT IS THE IMPORTANT ONE: the seasonal date windows
 * are EXECUTED. eggs.js is loaded into a fake DOM and its date logic run
 * against real dates, including the window that wraps New Year. Month
 * off-by-one is the classic bug in date-gated code and a static check
 * would never see it.
 *
 * Mutation-tested with tools/mutate_eggs.mjs.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const JS = join(PUB, 'assets', 'js');

let passed = 0;
const failures = [];

function check(label, ok) {
    if (ok === true) {
        passed += 1;
        console.log('  PASS  ' + label);
    } else {
        failures.push(label + (typeof ok === 'string' ? ' -- ' + ok : ''));
        console.log('  FAIL  ' + label + (typeof ok === 'string' ? ' -- ' + ok : ''));
    }
}

function source(name) {
    const p = join(JS, name);
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

/* Comments stripped before anything looks for code. A test a comment can
   satisfy passes on a file where the feature has been deleted - that
   exact thing happened writing test_konami. */
function code(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const eggsRaw = source('eggs.js');
const eggs = code(eggsRaw);
const globe = code(source('snowglobe.js'));
const quiz = code(source('foxquiz.js'));
const pages = readdirSync(PUB).filter((f) => f.endsWith('.html'));
const pageScripts = ['index.js', 'about.js', 'devlogs.js', 'foxes.js']
    .map((f) => readFileSync(join(JS, 'pages', f), 'utf8'));

/* ====================================================================== */
console.log('\n1. One copy of each egg, not four');

check('there is a shared eggs.js', eggsRaw.length > 0 || 'assets/js/eggs.js is missing');

check('it is on every public page', (() => {
    const missing = pages.filter((f) => !readFileSync(join(PUB, f), 'utf8').includes('eggs.js'));
    return !missing.length || `not loaded on: ${missing.join(', ')}`;
})());

check('the page scripts no longer carry their own copies', (() => {
    /* ⚠️ THE ORIGINAL BUG. The hunt was pasted into four page scripts and
       the console secret into four. They had already drifted: devlogs.js
       ran the hunt on a page with no paw in it. */
    const guilty = pageScripts.filter((s) => /skulkPaws|secret-paw/.test(code(s)));
    return !guilty.length || `${guilty.length} page script(s) still have their own hunt`;
})());

check('the old storage key is carried over, not abandoned', /skulkPaws/.test(eggs)
    || 'somebody mid-hunt would be sent back to zero');

check('storage failures do not break the page', (() => {
    // localStorage throws outright when storage is disabled. An easter
    // egg must never be why a page fails to load.
    const at = eggs.indexOf('function read');
    return /try\s*\{/.test(eggs.slice(at, at + 400)) || 'localStorage is read unguarded';
})());

/* ====================================================================== */
console.log('\n2. The rune chain');

check('five runes are planted', (() => {
    const found = pages
        .map((f) => readFileSync(join(PUB, f), 'utf8'))
        .join('')
        .match(/class="skulk-rune"/g) || [];
    return found.length === 5 || `found ${found.length} runes, expected 5`;
})());

check('the runes spell the word the puzzle asks for', (() => {
    const letters = pages
        .map((f) => readFileSync(join(PUB, f), 'utf8'))
        .join('')
        .match(/data-letter="([A-Z])"/g) || [];
    const word = letters.map((m) => m.slice(-2, -1)).sort().join('');
    const wanted = 'SKULK'.split('').sort().join('');
    return word === wanted || `runes spell ${word}, the answer is ${wanted}`;
})());

check('every rune has a real label', (() => {
    const html = pages.map((f) => readFileSync(join(PUB, f), 'utf8')).join('');
    const runes = html.match(/<button[^>]*class="skulk-rune"[^>]*>/g) || [];
    const unlabelled = runes.filter((r) => !/aria-label=/.test(r));
    return !unlabelled.length || `${unlabelled.length} rune(s) with no label`;
})());

check('runes start hidden in the markup', (() => {
    /* ⚠️ ATTRIBUTE VALUES ARE STRIPPED FIRST. The rune's own label reads
       "A hidden rune. Find all five." - so a bare search for the word
       `hidden` is answered by the label, and deleting the actual
       attribute changes nothing the test can see. Caught by the harness. */
    const html = pages.map((f) => readFileSync(join(PUB, f), 'utf8')).join('');
    const runes = html.match(/<button[^>]*class="skulk-rune"[^>]*>/g) || [];
    const visible = runes.filter((r) => !/\bhidden\b/.test(r.replace(/"[^"]*"/g, '""')));
    return !visible.length || `${visible.length} rune(s) visible before the paws are found`;
})());

check('stage two does not open until stage one is done', /var open = huntDone\(\);/.test(eggs)
    || 'the runes appear to somebody who has found nothing');

check('the final word cannot be typed early', /runes \|\| \[\]\)\.length < 5/.test(eggs)
    || 'guessing the word skips the whole puzzle');

check('typing the word in a form does not count', (() => {
    const at = eggs.indexOf('function watchForWord');
    return /typing\(e\.target\)/.test(eggs.slice(at, at + 400))
        || 'writing "skulk" in the newsletter box would finish the puzzle';
})());

/* ====================================================================== */
console.log('\n3. The seasonal eggs, actually executed');

const require = createRequire(import.meta.url);

function loadEggs() {
    /* A fake DOM, just deep enough for eggs.js to run its top level. The
       date logic is exposed on window.skulkInternals for exactly this. */
    const noop = () => {};
    const el = () => ({
        classList: { add: noop, remove: noop, contains: () => false },
        setAttribute: noop, removeAttribute: noop, appendChild: noop,
        addEventListener: noop, style: {}, dataset: {},
    });
    global.window = {
        matchMedia: null,
        localStorage: { getItem: () => null, setItem: noop },
        addEventListener: noop, setTimeout: noop, clearTimeout: noop,
    };
    global.document = {
        body: { classList: { contains: () => true, add: noop } },
        addEventListener: noop, readyState: 'complete',
        querySelectorAll: () => [], querySelector: () => null,
        createElement: el, getElementById: () => null,
    };
    const realLog = console.log;
    console.log = noop;
    delete require.cache[require.resolve(join(JS, 'eggs.js'))];
    require(join(JS, 'eggs.js'));
    console.log = realLog;
    return global.window.skulkInternals;
}

const internals = loadEggs();

check('eggs.js runs without a browser', !!(internals && internals.season)
    || 'the season logic could not be reached');

const DATES = [
    ['2026-06-20', 'matariki'],
    ['2026-07-20', 'midwinter'],
    ['2026-12-20', 'yule'],
    ['2027-01-01', 'newyear'],
    ['2026-12-31', 'newyear'],
    ['2026-04-01', 'fools'],
    ['2026-03-15', null],
    ['2026-09-09', null],
    ['2026-05-31', null],
];

for (const [when, wanted] of DATES) {
    check(`${when} is ${wanted || 'no season'}`, (() => {
        const got = internals.season(new Date(when + 'T12:00:00'));
        const id = got ? got.id : null;
        return id === wanted || `got ${id}`;
    })());
}

check('the New Year window wraps the year end', (() => {
    /* ⚠️ 31 Dec to 2 Jan is the one window where start > end. A naive
       "between" check silently never fires for it, and nobody notices
       until the New Year passes with nothing on screen. */
    const dec = internals.season(new Date('2026-12-31T12:00:00'));
    const jan = internals.season(new Date('2027-01-02T12:00:00'));
    return (dec && dec.id === 'newyear' && jan && jan.id === 'newyear')
        || `31 Dec: ${dec && dec.id}, 2 Jan: ${jan && jan.id}`;
})());

check('months are 1-based, not 0-based', (() => {
    // getMonth() returns 0 for January. If the +1 were missing, the
    // Matariki window would fire in May and this would catch it.
    const may = internals.season(new Date('2026-05-20T12:00:00'));
    return may === null || `May matched ${may.id} - the month is off by one`;
})());

check('every season has both languages', (() => {
    const thin = internals.SEASONS.filter((s) => !s.en || !s.mi);
    return !thin.length || `${thin.length} season(s) missing a translation`;
})());

check('a season shows once per browser, not on every page load',
    // The GUARD, not the assignment underneath it - which stays put when
    // the guard is deleted and answered an unscoped search.
    /if \(state\.seasons\[found\.id\]\) return;/.test(eggs)
        || 'a banner on every page load for a fortnight becomes furniture');

/* ====================================================================== */
console.log('\n4. The idle fox');

check('it waits before appearing', /IDLE_MS = \d+/.test(eggs) || 'no idle delay');

check('it does not move for somebody who asked for stillness', (() => {
    const at = eggs.indexOf('function resetIdle');
    return /stillnessWanted\(\)/.test(eggs.slice(at, at + 300))
        || 'a fox slides at somebody who turned motion off';
})());

check('activity resets the wait', /'mousemove', 'keydown'/.test(eggs)
    || 'the fox appears while somebody is using the page');

check('it is hidden from screen readers', (() => {
    const at = eggs.indexOf('function foxVisit');
    return /aria-hidden/.test(eggs.slice(at, at + 500))
        || 'a decorative fox is announced as content';
})());

check('it never takes a click', (() => {
    // Scoped to .idle-fox: the stylesheet uses pointer-events elsewhere,
    // and an unscoped search was answered by one of those.
    const css = readFileSync(join(PUB, 'assets', 'css', 'core.css'), 'utf8');
    const rule = /\.idle-fox\s*\{([^}]*)\}/.exec(css);
    if (!rule) return 'no .idle-fox rule at all';
    return /pointer-events:\s*none/.test(rule[1]) || 'the fox could sit over a link';
})());

check('only one fox at a time', (() => {
    const at = eggs.indexOf('function foxVisit');
    return /querySelector\('\.idle-fox'\)/.test(eggs.slice(at, at + 200))
        || 'foxes stack up on a page left alone';
})());

/* ====================================================================== */
console.log('\n5. The snow globe');

check('there is a snowglobe.js', globe.length > 0 || 'missing');

check('the foxes page loads it',
    readFileSync(join(PUB, 'foxes.html'), 'utf8').includes('snowglobe.js')
        || 'the globe is never loaded');

check('there is somewhere for it to go',
    readFileSync(join(PUB, 'foxes.html'), 'utf8').includes('id="snow-globe"')
        || 'no host element on the page');

check('it does nothing until it is touched', /function shaken/.test(globe)
    || 'the animation starts on page load');

check('it stops when it settles', /if \(energy < 0\.02\)/.test(globe)
    || 'the loop runs for ever on a toy nobody is touching');

check('it stops when scrolled out of sight',
    // The guard specifically. `new window.IntersectionObserver(...)` sits
    // inside the block and answered a bare search for the name.
    /if \(window\.IntersectionObserver\) \{/.test(globe)
        || 'a toy three screens up keeps the fan running');

check('it stops when the tab is hidden', /visibilitychange/.test(globe)
    || 'a background tab keeps animating');

check('reduced motion still lets you shake it', (() => {
    const at = globe.indexOf('function shaken');
    const body = globe.slice(at, at + 400);
    return /stillnessWanted\(\)/.test(body) && /draw\(\);/.test(body)
        || 'reduced motion turns the toy off instead of stilling it';
})());

check('the button is a real button and labelled', /shake.type = 'button'/.test(globe)
    && /shake.textContent/.test(globe)
        || 'the only control is an unlabelled canvas');

/* ====================================================================== */
console.log('\n6. Which fox are you');

check('there is a foxquiz.js', quiz.length > 0 || 'missing');

check('the foxes page loads it',
    readFileSync(join(PUB, 'foxes.html'), 'utf8').includes('foxquiz.js')
        || 'the quiz is never loaded');

check('the answers are the real foxes, from the API', /\/api\/content\/foxes/.test(quiz)
    || 'the quiz has its own private list, which goes stale the first time a fox is added');

check('there is no hard-coded fox list', !/nameEn:\s*['"]/.test(quiz)
    || 'a fox is hard-coded, so the quiz can name one that no longer exists');

check('a failed fetch leaves the section hidden', (() => {
    const at = quiz.indexOf('.catch(');
    return at !== -1 && !/removeAttribute/.test(quiz.slice(at))
        || 'a broken quiz still appears on the page';
})());

check('it needs at least two foxes to bother', /foxes.length < 2/.test(quiz)
    || 'a one-fox quiz always gives the same answer');

check('every question has both languages', (() => {
    const questions = (quiz.match(/\ben:\s*'/g) || []).length;
    const answers = (quiz.match(/\bmi:\s*'/g) || []).length;
    return questions === answers || `${questions} English strings, ${answers} te reo`;
})());

check('the score always lands on a real fox', /Math\.min\(\s*foxes\.length - 1/.test(quiz)
    || 'a top score could index past the end of the list');

check('focus follows the question', /first\.focus\(\)/.test(quiz)
    || 'a keyboard user is thrown to the top of the page after every answer');

/* ====================================================================== */
console.log('\n7. The console toy');

check('window.skulk exists', /window\.skulk = \{/.test(eggs) || 'no console object');

check('it has a help command', /help: function/.test(eggs) || 'undiscoverable');

check('it can give a hint', /hint: function/.test(eggs) || 'no nudge for somebody stuck');

check('the hint follows the stage you are at', (() => {
    const at = eggs.indexOf('hint: function');
    const body = eggs.slice(at, at + 900);
    return /huntDone\(\)/.test(body) && /runesFound\(\)/.test(body)
        || 'the hint says the same thing whatever you have done';
})());

check('there is a way to start over', /forget: function/.test(eggs)
    || 'a solved puzzle can never be replayed');

/* ====================================================================== */
console.log(`\n  PASSED: ${passed}    FAILED: ${failures.length}`);
console.log('='.repeat(46));
if (failures.length) process.exit(1);
