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

check('no rune sits anywhere a script can hide', (() => {
    /* ⚠️ THIS IS THE ONE THAT ACTUALLY BIT.
       rune-4 was planted in the game page's CTA heading. game.js line
       188 hides that whole section when a game has no CTA heading, body
       or URL - so updating the game in the admin made the rune vanish,
       and the puzzle became unfinishable with nothing on screen to say
       why. Reported 22 Aug 2026.

       A rune has to live in markup that NO script can hide or rebuild.
       This walks the real tag structure of each page, collects the ids
       of every element a rune sits inside, and fails if any of them is
       an element a page script switches off. */
    const VOID = ['br', 'img', 'input', 'meta', 'link', 'hr', 'source',
                  'path', 'circle', 'rect', 'area', 'col', 'use'];

    // Which ids do the page scripts hide?
    const risky = new Set();
    readdirSync(join(JS, 'pages')).forEach((f) => {
        const src = code(readFileSync(join(JS, 'pages', f), 'utf8'));
        const named = {};
        for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*document\.getElementById\(\s*'([^']+)'/g)) {
            named[m[1]] = m[2];
        }
        for (const m of src.matchAll(/(\w+)\.hidden\s*=\s*true/g)) {
            if (named[m[1]]) risky.add(named[m[1]]);
        }
        for (const m of src.matchAll(/document\.getElementById\(\s*'([^']+)'\s*\)\.hidden\s*=\s*true/g)) {
            risky.add(m[1]);
        }
    });

    const bad = [];
    pages.forEach((file) => {
        const html = readFileSync(join(PUB, file), 'utf8');
        const stack = [];
        const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
        let m;
        while ((m = tag.exec(html)) !== null) {
            const closing = m[1] === '/';
            const name = m[2].toLowerCase();
            const attrs = m[3];

            if (closing) {
                for (let i = stack.length - 1; i >= 0; i -= 1) {
                    if (stack[i].name === name) { stack.length = i; break; }
                }
                continue;
            }
            if (VOID.indexOf(name) !== -1 || /\/\s*$/.test(attrs)) continue;

            const id = (/\sid="([^"]+)"/.exec(attrs) || [])[1] || null;

            if (/class="skulk-rune"/.test(attrs)) {
                stack.forEach((a) => {
                    if (a.id && risky.has(a.id)) {
                        bad.push(`${file}: rune inside #${a.id}, which a script hides`);
                    }
                });
                continue;
            }
            stack.push({ name: name, id: id });
        }
    });

    return !bad.length || bad.join('; ');
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

check('the art is a separate file from the engine', (() => {
    /* Art is data, the player is code. The studio can redraw the fox
       without going near eggs.js, and eggs.js can change without anyone
       risking the art. */
    const art = source('foxart.js');
    return /window\.FOX_FRAMES/.test(art) && !/addEventListener|setInterval/.test(art)
        || 'foxart.js has logic in it, or the frames are not there';
})());

check('the art loads before the engine that reads it', (() => {
    // eggs.js reads window.FOX_FRAMES at the moment a fox appears, but
    // a page that loads them the other way round is still a page where
    // one file quietly depends on another's order.
    const bad = pages.filter((f) => {
        const html = readFileSync(join(PUB, f), 'utf8');
        return html.indexOf('foxart.js') > html.indexOf('eggs.js');
    });
    return !bad.length || `wrong script order on: ${bad.join(', ')}`;
})());

/* ⚠️ THE ART IS LOADED AND INSPECTED, NOT PATTERN-MATCHED AS TEXT.
   The first version of these checks split foxart.js on its `/* N *``/`
   comments and measured the escapes in between. The harness caught the
   flaw: a frame injected BEFORE the first comment marker was invisible
   to the split, so a mis-sized frame sailed straight through. Loading
   the file gives the same array the browser gets, and there is nothing
   left to disagree about. */
function loadFoxArt() {
    global.window = global.window || {};
    delete require.cache[require.resolve(join(JS, 'foxart.js'))];
    require(join(JS, 'foxart.js'));
    return global.window.FOX_FRAMES;
}

const foxFrames = loadFoxArt();

check('the art file defines frames', Array.isArray(foxFrames) && foxFrames.length >= 4
    || `FOX_FRAMES is ${foxFrames ? foxFrames.length + ' frames' : 'not an array'}`);

check('every frame is exactly the same size', (() => {
    /* ⚠️ FRAMES OF DIFFERENT SIZES MAKE THE FOX JUMP as it plays, and it
       is the easiest thing to get wrong when redrawing one. */
    const widths = new Set();
    const heights = new Set();
    foxFrames.forEach((f) => {
        const rows = f.split('\n');
        heights.add(rows.length);
        rows.forEach((r) => widths.add(r.length));
    });
    return (widths.size === 1 && heights.size === 1)
        || `widths ${[...widths]}, heights ${[...heights]}`;
})());

check('every character is a real Braille block', (() => {
    // A stray space or tab collapses differently from U+2800 and tears a
    // hole in the picture.
    const bad = [];
    foxFrames.forEach((f, i) => {
        [...f.replace(/\n/g, '')].forEach((c) => {
            const n = c.codePointAt(0);
            if (n < 0x2800 || n > 0x28ff) bad.push(`frame ${i}: U+${n.toString(16)}`);
        });
    });
    return !bad.length || bad.slice(0, 3).join(', ');
})());

check('the shipped art really is a picture, not filler', (() => {
    /* ⚠️ THIS DECODES THE BRAILLE AND COUNTS THE DOTS. Every other check
       would pass on a frame of 968 identical characters.

       Distinctness is measured WITHIN a frame. An earlier version
       compared rows across the whole file and failed on correct art:
       most of the fox - ears, head, cheeks - is identical in all eight
       frames because only the mouth moves. Rows repeating BETWEEN frames
       is what an animation looks like; rows repeating INSIDE one frame
       is what stripes look like. */
    let lit = 0;
    let total = 0;
    foxFrames.forEach((f) => {
        [...f.replace(/\n/g, '')].forEach((c) => {
            const n = c.codePointAt(0) - 0x2800;
            for (let b = 0; b < 8; b += 1) if (n >> b & 1) lit += 1;
            total += 8;
        });
    });
    /* ⚠️ THE BAND IS WIDE ON PURPOSE, and the first version was not.
       It was set at 20-80% while the art was a filled silhouette, and it
       then failed the studio's own frames at 18% - because LINE ART is
       sparse and a silhouette is dense, and both are perfectly good
       drawings. What this check is actually for is catching a blank
       canvas or a solid block of filler, so the band only has to exclude
       those. Calibrating a test to one drawing makes it fail the next. */
    const ink = lit / total;
    if (ink < 0.05 || ink > 0.9) return `canvas is ${Math.round(ink * 100)}% ink`;

    const worst = Math.min(...foxFrames.map((f) => {
        const rows = f.split('\n');
        return new Set(rows).size / rows.length;
    }));
    return worst > 0.7
        || `a frame is only ${Math.round(worst * 100)}% distinct rows - a pattern, not a drawing`;
})());

check('the frames actually differ from one another', (() => {
    const shapes = new Set(foxFrames);
    return shapes.size >= 4 || `${shapes.size} distinct frames - the fox would barely move`;
})());

check('a missing art file falls back to the emoji', (() => {
    /* The GUARD line specifically. foxFrames() has two `return null;`
       statements, so a bare search for one was answered by the other -
       breaking the first changed nothing the test could see. */
    const at = eggs.indexOf('function foxFrames');
    const body = eggs.slice(at, at + 500);
    return /if \(!frames \|\| !frames\.length\) return null;/.test(body)
        && /\\ud83e\\udd8a/.test(eggs)
        || 'no art means an empty box slides in from the side';
})());

check('the frame timer is cleared when the fox leaves', (() => {
    const at = eggs.indexOf('function foxVisit');
    const body = eggs.slice(at, at + 2200);
    return /clearInterval\(playing\)/.test(body)
        || 'every visit leaves an interval running against a removed node';
})());

check('reduced motion still draws the fox, just still', (() => {
    const at = eggs.indexOf('function foxVisit');
    const body = eggs.slice(at, at + 2200);
    return /fox\.textContent = frames\[0\];/.test(body) && /if \(!stillnessWanted\(\)\)/.test(body)
        || 'reduced motion either animates anyway or shows nothing';
})());

check('the braille styling keeps the picture together', (() => {
    /* line-height 1, letter-spacing 0 and a monospace font. Lose any one
       and the art shears into stripes. */
    const css = readFileSync(join(PUB, 'assets', 'css', 'core.css'), 'utf8');
    const rule = /\.idle-fox-art\s*\{([^}]*)\}/.exec(css);
    if (!rule) return 'no .idle-fox-art rule';
    const need = [/line-height:\s*1\b/, /letter-spacing:\s*0/, /monospace/, /white-space:\s*pre/];
    const missing = need.filter((re) => !re.test(rule[1]));
    return !missing.length || `${missing.length} of the four braille rules are missing`;
})());

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
