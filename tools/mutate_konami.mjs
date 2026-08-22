/**
 * Does test_konami actually catch anything?
 *
 *   node tools/mutate_konami.mjs
 *
 * Node, not bash, and every mutation is applied to a COPY of the tree in
 * a temp directory - a crash mid-run cannot leave the repo broken.
 *
 * ⚠️ A MISSING ANCHOR IS A FAILURE, NOT A SKIP. A harness whose anchors
 * have gone stale reports SKIP, and a skip looks exactly like a clean
 * run. That has bitten both of these repos.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MUTATIONS = [
    {
        name: 'the script goes back to the homepage only (the reported bug)',
        file: 'public/about.html',
        from: '<script src="/assets/js/konami.js"></script>',
        to: '',
    },
    {
        name: 'one page quietly misses out',
        file: 'public/press.html',
        from: '<script src="/assets/js/konami.js"></script>',
        to: '',
    },
    {
        name: 'the sequence is wrong',
        file: 'public/assets/js/konami.js',
        from: "var SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',",
        to: "var SEQUENCE = ['ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown',",
    },
    {
        name: 'typing in a form sets off the blizzard',
        file: 'public/assets/js/konami.js',
        from: "        return tag === 'input' || tag === 'textarea' || tag === 'select'\n            || target.isContentEditable;",
        to: '        return false;',
    },
    {
        name: 'the canvas is announced to screen readers',
        file: 'public/assets/js/konami.js',
        from: "        canvas.setAttribute('aria-hidden', 'true');",
        to: '',
    },
    {
        name: 'reduced motion is ignored',
        file: 'public/assets/js/konami.js',
        from: "        return window.matchMedia\n            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;",
        to: '        return false;',
    },
    {
        name: 'there is no way out of the blizzard',
        file: 'public/assets/js/konami.js',
        from: "        if (e.key === 'Escape' && running) { stop(); return; }",
        to: '',
    },
    {
        name: 'stopping leaves the canvas on the page',
        file: 'public/assets/js/konami.js',
        from: '            running.canvas.parentNode.removeChild(running.canvas);',
        to: '',
    },
    {
        name: 'the animation runs for as long as the tab is open',
        file: 'public/assets/js/konami.js',
        from: '        if (running.timer) window.clearInterval(running.timer);',
        to: '',
    },
    {
        name: 'every blizzard leaves a resize listener behind',
        file: 'public/assets/js/konami.js',
        from: "        if (running.resized) window.removeEventListener('resize', running.resized);",
        to: '',
    },
    {
        name: 'the page stays dark after dismissing it',
        file: 'public/assets/js/konami.js',
        from: '        document.body.style.backgroundColor = running.background;',
        to: '',
    },
    {
        name: 'a second trigger stacks another canvas',
        file: 'public/assets/js/konami.js',
        from: '        if (running) return;',
        to: '',
    },
    {
        name: 'the homepage grows its own copy again',
        file: 'public/assets/js/pages/index.js',
        from: '        /* The Konami blizzard used to live here,',
        to: "        var konamiSequence = ['ArrowUp', 'ArrowUp'];\n        /* The Konami blizzard used to live here,",
    },
    {
        name: 'the message loses its te reo half',
        file: 'public/assets/js/konami.js',
        from: "            : 'P\\u016aNAHA WHAKAHAERE: Kua timata ng\\u0101 kawa \\u0100kitiki. Kia mahana te k\\u0101kahu. \\u2744\\ufe0f');",
        to: "            : 'SYSTEM OVERRIDE');",
    },
    {
        name: 'the admin panel gets a snowstorm',
        file: 'public/admin/index.html',
        from: '</body>',
        to: '<script src="/assets/js/konami.js"></script>\n</body>',
    },
];

const tmp = mkdtempSync(join(tmpdir(), 'site-konami-'));
let caught = 0;
let missed = 0;
let stale = 0;

for (const m of MUTATIONS) {
    const work = join(tmp, 'run');
    rmSync(work, { recursive: true, force: true });
    cpSync(ROOT, work, {
        recursive: true,
        filter: (src) => !src.includes('node_modules') && !src.includes('/.git'),
    });

    const target = join(work, m.file);
    let text = readFileSync(target, 'utf8');

    if (!text.includes(m.from)) {
        console.log(`  STALE   ${m.name}`);
        console.log(`          anchor not found in ${m.file}`);
        stale += 1;
        continue;
    }
    if (text.split(m.from).length - 1 > 1) {
        console.log(`  STALE   ${m.name}`);
        console.log(`          anchor appears more than once in ${m.file}`);
        stale += 1;
        continue;
    }

    text = text.replace(m.from, m.to);
    writeFileSync(target, text);

    let failed = false;
    try {
        execFileSync(process.execPath, [join(work, 'tools', 'test_konami.mjs')], { stdio: 'pipe' });
    } catch {
        failed = true;
    }

    if (failed) { caught += 1; console.log(`  caught  ${m.name}`); }
    else { missed += 1; console.log(`  MISSED  ${m.name}`); }
}

rmSync(tmp, { recursive: true, force: true });

console.log(`\n  CAUGHT: ${caught}    MISSED: ${missed}    STALE: ${stale}`);
console.log('='.repeat(46));
if (missed || stale) process.exit(1);
