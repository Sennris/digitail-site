/**
 * Does test_eggs actually catch anything?
 *
 *   node tools/mutate_eggs.mjs
 *
 * Mutations applied to a COPY of the tree in a temp directory, so a
 * crash mid-run cannot leave the repo broken.
 *
 * ⚠️ A MISSING ANCHOR IS A FAILURE, NOT A SKIP. A harness whose anchors
 * have gone stale reports SKIP, and a skip looks exactly like a clean run.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MUTATIONS = [
    // --- the consolidation ---
    { name: 'a page script grows its own copy of the hunt again',
      file: 'public/assets/js/pages/devlogs.js',
      from: '        /* The console secret and the fox hunt used to be copy-pasted',
      to: "        var paws = document.querySelectorAll('.secret-paw');\n        /* The console secret and the fox hunt used to be copy-pasted" },
    { name: 'eggs.js is dropped from one page',
      file: 'public/press.html',
      from: '<script src="/assets/js/eggs.js"></script>', to: '' },
    { name: 'progress from the old key is abandoned',
      file: 'public/assets/js/eggs.js',
      from: "            old = JSON.parse(window.localStorage.getItem('skulkPaws')) || [];",
      to: '            old = [];' },

    // --- the rune chain ---
    // Re-anchored 22 Aug 2026: the runes moved out of the script block at
    // the bottom of the body and into the headings they belong in, so
    // they are now on one line at the heading's indentation.
    { name: 'a rune goes missing',
      file: 'public/press.html',
      from: '<button type="button" class="skulk-rune" id="rune-4" data-letter="L" hidden aria-label="A hidden rune. Find all five."></button>\n', to: '' },
    { name: 'a rune loses its label',
      file: 'public/about.html',
      from: '<button type="button" class="skulk-rune" id="rune-2" data-letter="K" hidden aria-label="A hidden rune. Find all five."></button>',
      to: '<button type="button" class="skulk-rune" id="rune-2" data-letter="K" hidden></button>' },
    { name: 'a rune is visible before the paws are found',
      file: 'public/index.html',
      from: '<button type="button" class="skulk-rune" id="rune-1" data-letter="S" hidden',
      to: '<button type="button" class="skulk-rune" id="rune-1" data-letter="S"' },
    { name: 'the letters stop spelling the answer',
      file: 'public/devlogs.html', from: 'data-letter="U"', to: 'data-letter="Z"' },
    { name: 'a rune is planted somewhere a script can hide (the reported bug)',
      file: 'public/game.html',
      from: '                <span class="mi" id="game-cta-heading-mi">\u0100whinatia m\u0101tou ki te w\u0101wahi i te p\u016bnaha.</span>\n',
      to: '                <span class="mi" id="game-cta-heading-mi">\u0100whinatia m\u0101tou ki te w\u0101wahi i te p\u016bnaha.</span>\n                <button type="button" class="skulk-rune" id="rune-6" data-letter="X" hidden aria-label="A hidden rune. Find all five."></button>\n' },

    { name: 'stage two opens to somebody who found nothing',
      file: 'public/assets/js/eggs.js',
      from: '        var open = huntDone();', to: '        var open = true;' },
    { name: 'the word can be typed without the runes',
      file: 'public/assets/js/eggs.js',
      from: '            if ((state.runes || []).length < 5) {', to: '            if (false) {' },
    { name: 'typing the word in a form counts',
      file: 'public/assets/js/eggs.js',
      from: "            if (typing(e.target)) { typed = ''; return; }", to: '' },

    // --- seasonal ---
    { name: 'months go back to 0-based (Matariki fires in May)',
      file: 'public/assets/js/eggs.js',
      from: '        var month = when.getMonth() + 1;', to: '        var month = when.getMonth();' },
    { name: 'the New Year window stops wrapping the year end',
      file: 'public/assets/js/eggs.js',
      from: '        if (start > end) return now >= start || now <= end;', to: '' },
    { name: 'a season loses its te reo half',
      file: 'public/assets/js/eggs.js',
      from: "            mi: '\\ud83e\\udd8a He tau hou m\\u014d te r\\u014dp\\u016b p\\u014dkiha. Ng\\u0101 mihi mo t\\u014d haere mai.',",
      to: "            mi: ''," },
    { name: 'the banner shows on every page load',
      file: 'public/assets/js/eggs.js',
      from: '        if (state.seasons[found.id]) return;', to: '' },
    { name: 'a season window slips a month',
      file: 'public/assets/js/eggs.js',
      from: '            from: [6, 15], to: [7, 15],', to: '            from: [5, 15], to: [7, 15],' },

    // --- idle fox ---
    { name: 'the fox moves at somebody who asked for stillness',
      file: 'public/assets/js/eggs.js',
      from: '        if (stillnessWanted()) return;', to: '' },
    { name: 'the fox is announced to screen readers',
      file: 'public/assets/js/eggs.js',
      from: "        fox.setAttribute('aria-hidden', 'true');", to: '' },
    { name: 'foxes stack up on an idle page',
      file: 'public/assets/js/eggs.js',
      from: "        if (document.querySelector('.idle-fox')) return;", to: '' },
    { name: 'the fox can sit over a link',
      file: 'public/assets/css/core.css',
      from: '    transform: translateX(120%); transition: transform 1.1s ease;\n    pointer-events: none;',
      to: '    transform: translateX(120%); transition: transform 1.1s ease;' },

    // --- the braille fox ---
    { name: 'a frame is a different size from the others',
      file: 'public/assets/js/foxart.js',
      // A whole row of full blocks is not unique - identical rows repeat
      // across frames. Adding a one-character frame is.
      from: 'window.FOX_FRAMES = [',
      to: "window.FOX_FRAMES = ['\\u28ff'," },
    { name: 'the art file grows logic in it',
      file: 'public/assets/js/foxart.js',
      from: 'window.FOX_FRAMES = [',
      to: "window.addEventListener('load', function () {});\nwindow.FOX_FRAMES = [" },
    { name: 'the art loads after the engine that reads it',
      file: 'public/about.html',
      from: '<script src="/assets/js/foxart.js"></script>\n    <script src="/assets/js/eggs.js"></script>',
      to: '<script src="/assets/js/eggs.js"></script>\n    <script src="/assets/js/foxart.js"></script>' },
    { name: 'a missing art file leaves an empty box sliding in',
      file: 'public/assets/js/eggs.js',
      from: '        if (!frames || !frames.length) return null;',
      to: '        if (!frames || !frames.length) return [];' },
    { name: 'the frame timer is left running after the fox leaves',
      file: 'public/assets/js/eggs.js',
      from: '                if (playing) window.clearInterval(playing);', to: '' },
    { name: 'reduced motion animates the fox anyway',
      file: 'public/assets/js/eggs.js',
      from: '            if (!stillnessWanted()) {', to: '            if (true) {' },
    { name: 'the braille loses its line-height and shears into stripes',
      file: 'public/assets/css/core.css',
      from: '    line-height: 1; letter-spacing: 0;\n    color: var(--frozen-juniper);',
      to: '    color: var(--frozen-juniper);' },
    { name: 'the braille stops being monospace',
      file: 'public/assets/css/core.css',
      from: '    font-family: "Cascadia Mono", "DejaVu Sans Mono", "Menlo", "Consolas", monospace;',
      to: '    font-family: inherit;' },

    // --- snow globe ---
    { name: 'the globe animates on page load',
      file: 'public/assets/js/snowglobe.js', from: '        function shaken() {', to: '        function notShaken() {' },
    { name: 'the globe never settles',
      file: 'public/assets/js/snowglobe.js', from: '            if (energy < 0.02) {', to: '            if (false) {' },
    { name: 'the globe keeps running off screen',
      file: 'public/assets/js/snowglobe.js', from: '        if (window.IntersectionObserver) {', to: '        if (false) {' },
    { name: 'the globe keeps running in a background tab',
      file: 'public/assets/js/snowglobe.js',
      from: "        document.addEventListener('visibilitychange', function () {", to: '        (function () {' },
    { name: 'reduced motion turns the globe off entirely',
      file: 'public/assets/js/snowglobe.js',
      from: '                seed();\n                draw();\n                return;', to: '                return;' },

    // --- the quiz ---
    { name: 'the quiz hard-codes its foxes',
      file: 'public/assets/js/foxquiz.js',
      from: "        window.fetch('/api/content/foxes')", to: "        window.fetch('/nope')" },
    { name: 'a broken quiz still appears',
      file: 'public/assets/js/foxquiz.js',
      from: '            .catch(function () {', to: '            .catch(function () { host.removeAttribute("hidden");' },
    { name: 'a one-fox quiz is allowed',
      file: 'public/assets/js/foxquiz.js',
      from: '                if (!Array.isArray(foxes) || foxes.length < 2) return;',
      to: '                if (!Array.isArray(foxes)) return;' },
    { name: 'a top score indexes past the end of the fox list',
      file: 'public/assets/js/foxquiz.js',
      from: '            var index = Math.min(\n                foxes.length - 1,',
      to: '            var index = Math.max(\n                foxes.length - 1,' },
    { name: 'focus stops following the question',
      file: 'public/assets/js/foxquiz.js', from: '                    if (first) first.focus();', to: '' },

    // --- the console toy ---
    { name: 'the hint says the same thing whatever you have done',
      file: 'public/assets/js/eggs.js', from: '            if (!huntDone()) {', to: '            if (false) {' },
    { name: 'there is no way to start the hunt over',
      file: 'public/assets/js/eggs.js', from: '        forget: function () {', to: '        notForget: function () {' },
];

const tmp = mkdtempSync(join(tmpdir(), 'site-eggs-'));
let caught = 0; let missed = 0; let stale = 0;

for (const m of MUTATIONS) {
    const work = join(tmp, 'run');
    rmSync(work, { recursive: true, force: true });
    cpSync(ROOT, work, { recursive: true,
        filter: (src) => !src.includes('node_modules') && !src.includes('/.git') });

    const target = join(work, m.file);
    let text = readFileSync(target, 'utf8');

    if (!text.includes(m.from)) {
        console.log(`  STALE   ${m.name}`);
        console.log(`          anchor not found in ${m.file}`);
        stale += 1; continue;
    }
    if (text.split(m.from).length - 1 > 1) {
        console.log(`  STALE   ${m.name}`);
        console.log(`          anchor appears more than once in ${m.file}`);
        stale += 1; continue;
    }

    writeFileSync(target, text.replace(m.from, m.to));

    let failed = false;
    try {
        execFileSync(process.execPath, [join(work, 'tools', 'test_eggs.mjs')], { stdio: 'pipe' });
    } catch { failed = true; }

    if (failed) { caught += 1; console.log(`  caught  ${m.name}`); }
    else { missed += 1; console.log(`  MISSED  ${m.name}`); }
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n  CAUGHT: ${caught}    MISSED: ${missed}    STALE: ${stale}`);
console.log('='.repeat(46));
if (missed || stale) process.exit(1);
