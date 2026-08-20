/**
 * Mutation harness for tools/test_a11y.mjs.
 *
 *   node tools/mutate_a11y.mjs
 *
 * Breaks one accessibility fix at a time and confirms the suite notices.
 * A test that passes whether or not the code works is worse than no test,
 * and eight tests in this repo have done exactly that.
 *
 * Two habits that came out of earlier rounds and are enforced here:
 *   - backups are named by FLATTENED PATH, never basename, because
 *     public/index.html and public/admin/index.html share a basename and
 *     one restore once overwrote the homepage with the admin panel
 *   - the harness compares PASS COUNTS, not exit codes. A mutation that
 *     crashes the suite mid-run reports zero failures and looks caught.
 *   - every anchor is asserted UNIQUE before it is used. An anchor that
 *     also matches an earlier identical line breaks the wrong code, and
 *     the mutation then proves nothing.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BAK = join(ROOT, '.mutate_a11y_backup');

/** file, what to break, what to break it into, and why it should be caught */
const MUTATIONS = [
    ['public/assets/css/core.css', 'select:focus-visible,', '', 'select loses the focus ring'],
    ['public/assets/css/core.css', ".secret-paw::before { content: '\\1F43E'; }", '', 'paw glyph goes back to being text'],
    ['public/assets/css/core.css', 'clip-path: inset(50%);', 'display: none;', 'visually-hidden stops being readable'],
    ['public/assets/css/core.css', 'body.lang-en .mi { display: none; }', '', 'both languages show at once'],

    ['public/assets/css/pages/devlogs.css', '    visibility: hidden;\n', '', 'closed modal back in the a11y tree'],
    ['public/assets/css/pages/devlogs.css', '    visibility: visible;\n', '', 'open modal stays hidden'],
    ['public/assets/css/pages/devlogs.css', 'select.rugged-select:focus-visible {\n    outline: 3px solid var(--frozen-juniper);', 'select.rugged-select:focus-visible {\n    outline: none;', 'sort dropdown focus ring removed'],
    ['public/assets/css/pages/devlogs.css', 'minmax(min(320px, 100%), 1fr)', 'minmax(320px, 1fr)', 'devlog grid pans sideways at 320px'],
    ['public/assets/css/pages/foxes.css', '    visibility: hidden;\n    transition: opacity 0.3s ease, visibility 0s linear 0.3s;', '    transition: opacity 0.3s ease;', 'foxes modal back in the a11y tree'],
    ['public/assets/css/pages/about.css', '    visibility: hidden;\n    transition: opacity 0.3s ease, visibility 0s linear 0.3s;', '    transition: opacity 0.3s ease;', 'team modal back in the a11y tree'],
    ['public/assets/css/pages/about.css', 'minmax(min(300px, 100%), 1fr)', 'minmax(300px, 1fr)', 'team grid pans sideways at 320px'],
    ['public/assets/css/pages/index.css', '    transition: all 0.2s ease;\n}', '    outline: none;\n    transition: all 0.2s ease;\n}', 'newsletter inputs lose the focus outline'],

    ['public/devlogs.html', 'for="sort-select"', 'data-for="sort-select"', 'sort dropdown loses its label'],
    ['public/devlogs.html', 'value="oldest"', 'value="newest"', 'duplicate option values return'],
    ['public/devlogs.html', ' data-mi="Pito H\u014du Tuatahi"', '', 'option loses its te reo label'],
    ['public/devlogs.html', '<button type="button" class="modal-close-btn" aria-label="Close">', '<button class="modal-close-btn">', 'close button loses its name'],
    ['public/foxes.html', '<button type="button" class="modal-close-btn" aria-label="Close">', '<button class="modal-close-btn">', 'foxes close button loses its name'],

    ['public/index.html', ' autocomplete="email" placeholder="Email Address', ' placeholder="Email Address', 'email field loses autocomplete'],
    ['public/index.html', '<label class="visually-hidden" for="email">', '<span class="visually-hidden">', 'email field loses its label'],
    ['public/index.html', '<button type="button" class="secret-paw" id="paw-1" aria-label="Hidden paw. Find all three."></button>', '<button type="button" class="secret-paw" id="paw-1" aria-label="Hidden paw. Find all three."><span aria-hidden="true">\u{1F43E}</span></button>', 'paw glyph returns as measurable text'],

    ['public/thankyou.html', '<main class="thank-you-card">', '<div class="thank-you-card">', 'thank you page loses its main landmark'],
    ['public/games.html', '    <footer>', '    <div id="devlog-modal" class="modal-overlay" role="dialog" aria-modal="true"></div>\n    <footer>', 'dead modal comes back'],

    ['public/assets/js/a11y.js', "modal.classList.contains('active')", 'false', 'modal close is never detected'],
    ['public/assets/js/a11y.js', "modal.setAttribute('aria-label', 'Details');", '', 'dialogs lose their fallback name'],
    ['public/assets/js/lang-attr.js', 'option[data-en][data-mi]', 'option[data-nothing]', 'option text stops swapping'],
    ['public/assets/css/pages/devlogs.css', 'transition: opacity 0.3s ease, visibility 0s linear 0.3s;', 'transition: opacity 0.3s ease;', 'fade-out is taken away before it finishes'],
];

function flat(rel) {
    return rel.replace(/[\\/]/g, '_');
}

function suiteCounts() {
    let out;
    try {
        out = execFileSync('node', [join(ROOT, 'tools', 'test_a11y.mjs')], { encoding: 'utf8' });
    } catch (err) {
        out = (err.stdout || '') + (err.stderr || '');
    }
    const m = out.match(/PASSED:\s*(\d+)\s+FAILED:\s*(\d+)/);
    if (!m) return { passed: -1, failed: -1, crashed: true };
    return { passed: Number(m[1]), failed: Number(m[2]), crashed: false };
}

if (existsSync(BAK)) rmSync(BAK, { recursive: true });
mkdirSync(BAK, { recursive: true });

const base = suiteCounts();
if (base.crashed || base.failed !== 0) {
    console.log('The suite is not green to start with. Fix that first.');
    console.log(base);
    process.exit(1);
}
console.log(`baseline: ${base.passed} passing, 0 failing\n`);

let caught = 0;
const missed = [];

for (const [rel, from, to, why] of MUTATIONS) {
    const abs = join(ROOT, rel);
    const original = readFileSync(abs, 'utf8');
    const hits = original.split(from).length - 1;

    if (hits !== 1) {
        missed.push(`${why} -- ANCHOR NOT UNIQUE in ${rel} (${hits} matches), mutation not run`);
        console.log(`  ????  ${why}  [anchor matched ${hits} times, skipped]`);
        continue;
    }

    writeFileSync(join(BAK, flat(rel)), original, 'utf8');
    writeFileSync(abs, original.replace(from, to), 'utf8');

    const after = suiteCounts();
    writeFileSync(abs, original, 'utf8');

    // Caught means fewer checks passed than the baseline. Comparing the
    // failure count alone would call a mid-suite crash a catch.
    const isCaught = !after.crashed && after.passed < base.passed;
    if (isCaught) {
        caught++;
        console.log(`  ok    ${why}  (${base.passed} -> ${after.passed} passing)`);
    } else if (after.crashed) {
        missed.push(`${why} -- the suite CRASHED instead of failing a check`);
        console.log(`  CRASH ${why}`);
    } else {
        missed.push(`${why} -- nothing failed`);
        console.log(`  MISS  ${why}  (still ${after.passed} passing)`);
    }
}

rmSync(BAK, { recursive: true });

console.log('\n' + '='.repeat(58));
console.log(`  CAUGHT: ${caught} / ${MUTATIONS.length}    MISSED: ${missed.length}`);
console.log('='.repeat(58) + '\n');
missed.forEach((m) => console.log('  * ' + m));
if (missed.length) process.exit(1);
