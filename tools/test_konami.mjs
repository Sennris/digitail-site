/**
 * The Konami blizzard, on every page.
 *
 *   node tools/test_konami.mjs
 *
 * Node built-ins only, like every other suite here. No package.json, no
 * node_modules.
 *
 * THE ASK (22 Aug 2026): "make it so that the Konami code secret works
 * on all the pages not just the home page."
 *
 * It lived inside pages/index.js, and the homepage is the only page that
 * loads that file. These are STATIC checks over the shipped files - they
 * cannot prove the snow falls, only that the script is where it needs to
 * be and has not quietly been left behind on one page. The animation
 * itself needs a browser and a person pressing ten keys.
 *
 * Mutation-tested with tools/mutate_konami.mjs.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const SCRIPT = join(PUB, 'assets', 'js', 'konami.js');

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
    if (ok === true) {
        passed += 1;
        console.log('  PASS  ' + label);
    } else {
        const why = typeof ok === 'string' ? ok : detail;
        failures.push(label + (why ? ' -- ' + why : ''));
        console.log('  FAIL  ' + label + (why ? ' -- ' + why : ''));
    }
}

const pages = readdirSync(PUB).filter((f) => f.endsWith('.html'));
/* ⚠️ COMMENTS STRIPPED BEFORE ANY CHECK LOOKS FOR CODE.
   The harness caught this: deleting the Escape handler outright left the
   comment above it reading "Escape puts the room back", and a search for
   /Escape/ was answered by the prose. A test a comment can satisfy is a
   test that passes on a file where the feature has been deleted. */
const konamiRaw = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : '';
const konami = konamiRaw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const indexJs = readFileSync(join(PUB, 'assets', 'js', 'pages', 'index.js'), 'utf8');

console.log('\nThe Konami blizzard');

check('there is a shared konami.js', konamiRaw.length > 0
    || 'assets/js/konami.js does not exist');

check('it is on every public page', (() => {
    const missing = pages.filter((f) => !readFileSync(join(PUB, f), 'utf8').includes('konami.js'));
    return !missing.length || `not loaded on: ${missing.join(', ')}`;
})());

check('there are the thirteen pages we expect', pages.length >= 13
    || `only found ${pages.length} pages - the check above proves less than it looks`);

check('it was MOVED, not copied', (() => {
    /* Two copies of an easter egg is two things to keep in step, and
       nobody would ever notice them drifting apart. */
    return !/konamiSequence|ArrowUp['"]\s*,\s*['"]ArrowUp/.test(indexJs)
        || 'the homepage still carries its own copy';
})());

check('the homepage says where it went', /konami\.js/.test(indexJs)
    || 'nothing in index.js points at the new home, so it reads as deleted');

check('it is the actual Konami code', (() => {
    const wanted = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    const found = [...konami.matchAll(/'(Arrow\w+|[ba])'/g)].map((m) => m[1]);
    return wanted.every((k, i) => found[i] === k)
        || `sequence reads ${found.slice(0, 10).join(' ')}`;
})());

check('typing in a form does not set it off', (() => {
    /* The site has a newsletter box and a fan art form. "b" and "a" are
       ordinary letters and an arrow key in a text field moves the
       cursor - a snowstorm mid-signup reads as the page breaking. */
    return /tag === 'input'/.test(konami) && /textarea/.test(konami)
        || 'filling in a form could trigger the blizzard';
})());

check('the canvas is hidden from screen readers', /aria-hidden/.test(konami)
    || 'a canvas of snowflakes has nothing useful to say to a screen reader');

check('it respects prefers-reduced-motion', /prefers-reduced-motion/.test(konami)
    || 'somebody who asked for less movement gets 150 particles anyway');

check('reduced motion still gets the joke', (() => {
    // Not a silent no-op: the message and the darkened room still happen,
    // only the animation is dropped.
    const at = konami.indexOf('stillnessWanted()');
    const after = konami.slice(konami.indexOf('if (stillnessWanted())'));
    return at !== -1 && /draw\(\);/.test(after.slice(0, 300))
        || 'reduced motion turns the easter egg off entirely';
})());

check('there is a way out', /e\.key === 'Escape' && running/.test(konami)
    || 'the only exit from the blizzard is a page reload');

check('stopping removes the canvas', /removeChild\(running\.canvas\)/.test(konami)
    || 'the canvas is left on the page after stopping');

check('stopping clears the animation', /clearInterval\(running\.timer\)/.test(konami)
    || 'the animation keeps running for as long as the tab is open');

check('stopping removes the resize listener', /removeEventListener\('resize'/.test(konami)
    || 'every blizzard leaves another resize listener behind');

check('the background is put back', /backgroundColor = running\.background/.test(konami)
    || 'the page stays dark after the blizzard is dismissed');

check('it cannot start twice over itself', /if \(running\) return;/.test(konami)
    || 'a second trigger stacks another canvas and another interval');

check('the admin panel does not load it', (() => {
    const admin = join(PUB, 'admin', 'index.html');
    if (!existsSync(admin)) return true;
    return !readFileSync(admin, 'utf8').includes('konami.js')
        || 'a snowstorm over the content manager is nobody\u2019s idea of a good time';
})());

check('the copy is bilingual, like the rest of the site', (() => {
    return /lang-en/.test(konami) && /P\\u016aNAHA|PŪNAHA/.test(konami)
        || 'the message only exists in one language';
})());

console.log(`\n  PASSED: ${passed}    FAILED: ${failures.length}`);
console.log('='.repeat(46));
if (failures.length) process.exit(1);
