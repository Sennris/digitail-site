/**
 * Accessibility pass, August 2026.
 *
 *   node tools/test_a11y.mjs
 *
 * Node built-ins only, on purpose. The repo has no package.json and no
 * node_modules, and every other suite here runs on a bare Node install,
 * so this one does too.
 *
 * These are STATIC checks over the shipped files. They cannot prove a page
 * passes WCAG. What they can do is stop a later tidy-up quietly undoing a
 * fix, which is the actual risk with most of these: they are one-line
 * changes and several of them look like clutter to anyone who does not
 * know why they are there.
 *
 * Mutation-tested with tools/mutate_a11y.sh.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');

const failures = [];
let passed = 0;

function check(label, ok, detail = '') {
    if (ok) {
        passed++;
        console.log('  PASS  ' + label);
    } else {
        failures.push(label + (detail ? ' -- ' + detail : ''));
        console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : ''));
    }
}

/** A throw inside one behaviour fails that behaviour, not the rest. */
function group(label, fn) {
    try {
        fn();
    } catch (err) {
        check(label + ' (threw)', false, err.message);
    }
}

function read(rel) {
    return readFileSync(join(PUB, rel), 'utf8');
}

/**
 * Comments are stripped before every assertion. Several of these fixes have
 * a comment above them explaining what they replaced, and those comments
 * quote the old code. Without this, a check for "no bare outline:none"
 * matches the comment that says outline:none was removed, and passes
 * whatever the CSS actually does. That has bitten this repo before.
 */
function stripCss(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
}
function stripJs(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
function stripHtml(src) {
    return src.replace(/<!--[\s\S]*?-->/g, '');
}

/** The block of a CSS rule, found by brace matching rather than by slicing
 *  to an expected closing string. A mutation that changes the closing text
 *  should fail one check, not crash the suite. */
function ruleBody(css, selector) {
    const at = css.indexOf(selector + ' {');
    if (at === -1) return null;
    let depth = 0;
    for (let i = css.indexOf('{', at); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') {
            depth--;
            if (depth === 0) return css.slice(css.indexOf('{', at) + 1, i);
        }
    }
    return null;
}

const PAGES = readdirSync(PUB).filter((f) => f.endsWith('.html'));
const MODAL_CSS = ['devlogs', 'foxes', 'about'];
const NAV_PAGES = PAGES.filter((p) => read(p).includes('class="site-nav"'));

console.log('\n=== A. Page skeleton ===\n');

group('skeleton', () => {
    PAGES.forEach((p) => {
        const html = stripHtml(read(p));
        check(`${p}: has a lang on <html>`, /<html[^>]+lang="(en|mi)"/.test(html));
        const h1s = (html.match(/<h1[\s>]/g) || []).length;
        check(`${p}: exactly one <h1>`, h1s === 1, `found ${h1s}`);
        check(`${p}: has a main landmark`, /<main[\s>]/.test(html));
    });
    NAV_PAGES.forEach((p) => {
        const html = stripHtml(read(p));
        check(`${p}: has a skip link to #main`, /class="skip-link" href="#main"/.test(html));
        check(`${p}: nav is labelled`, /<nav[^>]+aria-label=/.test(html));
    });
});

console.log('\n=== B. Modals are hidden from screen readers when closed ===\n');

group('modals', () => {
    MODAL_CSS.forEach((name) => {
        const css = stripCss(readFileSync(join(PUB, 'assets/css/pages', name + '.css'), 'utf8'));
        const closed = ruleBody(css, '.modal-overlay');
        const open = ruleBody(css, '.modal-overlay.active');
        check(`${name}.css: closed .modal-overlay sets visibility hidden`,
            !!closed && /visibility:\s*hidden/.test(closed),
            'opacity 0 alone leaves it in the a11y tree and in the tab order');
        check(`${name}.css: .modal-overlay.active sets visibility visible`,
            !!open && /visibility:\s*visible/.test(open));
        check(`${name}.css: the fade still finishes before it is taken away`,
            !!closed && /transition:[^;]*visibility\s+0s\s+linear\s+0\.3s/.test(closed));
    });

    // The dialog name. a11y.js sets aria-labelledby at the real title, and
    // an aria-label underneath it for the window where the title is empty.
    const a11y = stripJs(readFileSync(join(PUB, 'assets/js/a11y.js'), 'utf8'));
    check('a11y.js: sets aria-labelledby from .modal-title', /aria-labelledby/.test(a11y));
    check('a11y.js: sets a fallback aria-label on dialogs',
        /modal\.setAttribute\('aria-label'/.test(a11y),
        'a bare aria-label search also matches the Display Options panel');
    check('a11y.js: open state is read from the active class, not from display',
        /classList\.contains\('active'\)/.test(a11y),
        'display is always flex on these overlays, so a display test can never see a close');

    // Dead copies of the devlogs modal. Neither page has a script that opens
    // one and neither stylesheet styles one, so it rendered in the page.
    ['games.html', 'press.html'].forEach((p) => {
        check(`${p}: no unstyled devlog modal left in the markup`,
            !read(p).includes('id="devlog-modal"'));
    });

    ['devlogs.html', 'foxes.html', 'about.html'].forEach((p) => {
        const html = stripHtml(read(p));
        const btn = html.match(/<button[^>]*class="modal-close-btn"[^>]*>/);
        check(`${p}: close button has an accessible name`,
            !!btn && /aria-label=/.test(btn[0]),
            'the only text in it is a times sign');
    });
});

console.log('\n=== C. Form controls are named ===\n');

group('forms', () => {
    // Every id referenced by a label, and every labelled control, on the
    // pages that have forms.
    [['index.html', ['name', 'email', 'confirm-email']],
     ['unsubscribe.html', ['unsub-email']],
     ['devlogs.html', ['sort-select']]].forEach(([page, ids]) => {
        const html = stripHtml(read(page));
        ids.forEach((id) => {
            check(`${page}: #${id} has a <label for>`,
                // \sfor= not [^>]+for=, or data-for="x" satisfies the check
                new RegExp('<label[^>]*\\sfor="' + id + '"').test(html));
        });
    });

    const idx = stripHtml(read('index.html'));
    ['name', 'email', 'confirm-email'].forEach((id) => {
        const input = idx.match(new RegExp('<input[^>]+id="' + id + '"[^>]*>'));
        check(`index.html: #${id} declares autocomplete`,
            !!input && /autocomplete="/.test(input[0]));
    });

    const core = stripCss(readFileSync(join(PUB, 'assets/css/core.css'), 'utf8'));
    const vh = ruleBody(core, '.visually-hidden');
    check('core.css: .visually-hidden exists', !!vh);
    check('core.css: .visually-hidden does not use display none',
        !!vh && !/display:\s*none/.test(vh),
        'display none hides it from screen readers too, which defeats the point');
    check('core.css: .visually-hidden takes it out of the flow',
        !!vh && /clip-path:\s*inset\(50%\)/.test(vh));
});

console.log('\n=== D. Language swap on <option> ===\n');

group('options', () => {
    const html = stripHtml(read('devlogs.html'));
    const select = html.slice(html.indexOf('<select id="sort-select"'));
    const block = select.slice(0, select.indexOf('</select>'));
    const values = [...block.matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
    check('devlogs.html: no duplicate option values',
        new Set(values).size === values.length, values.join(', '));
    check('devlogs.html: options carry both labels as data attributes',
        (block.match(/data-en="/g) || []).length === values.length
        && (block.match(/data-mi="/g) || []).length === values.length);
    check('devlogs.html: options no longer rely on a language class',
        !/<option[^>]+class="(en|mi)"/.test(block),
        'display none on an option is ignored by Safari, so both languages showed');

    const lang = stripJs(readFileSync(join(PUB, 'assets/js/lang-attr.js'), 'utf8'));
    check('lang-attr.js: swaps option text with the language',
        /data-en\]\[data-mi\]/.test(lang) && /textContent/.test(lang));
});

console.log('\n=== E. Focus is always visible ===\n');

group('focus', () => {
    const core = stripCss(readFileSync(join(PUB, 'assets/css/core.css'), 'utf8'));
    check('core.css: the global focus ring covers <select>',
        /select:focus-visible/.test(core));
    check('core.css: the global focus ring draws an outline',
        /outline:\s*3px solid var\(--frozen-juniper\)/.test(core));

    const dev = stripCss(readFileSync(join(PUB, 'assets/css/pages/devlogs.css'), 'utf8'));
    const sel = ruleBody(dev, 'select.rugged-select');
    check('devlogs.css: the sort dropdown does not kill its own outline',
        !!sel && !/outline:\s*none/.test(sel));
    const selFocus = ruleBody(dev, 'select.rugged-select:focus-visible');
    check('devlogs.css: the sort dropdown has a focus-visible rule', !!selFocus);
    check('devlogs.css: that rule actually draws an outline',
        !!selFocus && /outline:\s*\d+px\s+solid/.test(selFocus),
        'a focus-visible rule that sets outline none is the same as having none');

    const index = stripCss(readFileSync(join(PUB, 'assets/css/pages/index.css'), 'utf8'));
    const inp = ruleBody(index, '.newsletter-form input');
    check('index.css: newsletter inputs do not kill the focus outline',
        !!inp && !/outline:\s*none/.test(inp),
        'that rule ties with input:focus-visible on specificity and loads later, so it wins');
});

console.log('\n=== F. Reflow at 320px ===\n');

group('reflow', () => {
    const files = readdirSync(join(PUB, 'assets/css/pages'))
        .filter((f) => f.endsWith('.css') && f !== 'content-manager.css');
    files.forEach((f) => {
        const css = stripCss(readFileSync(join(PUB, 'assets/css/pages', f), 'utf8'));
        // Only auto-fill / auto-fit tracks. Those repeat until the row is
        // full, so a hard minimum wider than the viewport forces the whole
        // page sideways. A fixed two-column grid like minmax(9rem, auto) 1fr
        // has one column and cannot do that.
        const bad = [...css.matchAll(/repeat\(\s*auto-(?:fill|fit)\s*,\s*minmax\(\s*(\d+(?:px|rem))\s*,/g)].map((m) => m[1]);
        check(`${f}: no grid column with a hard minimum`,
            bad.length === 0,
            bad.length ? bad.join(', ') + ' -- wrap in min(x, 100%) or the page pans sideways at 320px' : '');
    });
});

console.log('\n=== G. The easter egg paws ===\n');

group('paws', () => {
    const core = stripCss(readFileSync(join(PUB, 'assets/css/core.css'), 'utf8'));
    check('core.css: the paw glyph is generated content',
        /\.secret-paw::before\s*\{[^}]*content:/.test(core),
        'as a text node a contrast checker measures it, and it is meant to be faint');

    let paws = 0;
    PAGES.forEach((p) => {
        const html = stripHtml(read(p));
        [...html.matchAll(/<button[^>]*class="secret-paw"[^>]*>([\s\S]*?)<\/button>/g)].forEach((m) => {
            paws++;
            check(`${p}: paw button is named`, /aria-label=/.test(m[0]));
            check(`${p}: paw button holds no text of its own`, m[1].trim() === '', m[1].trim());
        });
    });
    check('all three paws are still on the site', paws === 3, `found ${paws}`);
});

console.log('\n=== H. No regressions in the language spans ===\n');

group('lang spans', () => {
    // The whole bilingual scheme depends on this one pair of rules. If a
    // later edit drops them, every page shows both languages at once.
    const core = stripCss(readFileSync(join(PUB, 'assets/css/core.css'), 'utf8'));
    check('core.css: body.lang-en hides .mi', /body\.lang-en\s+\.mi\s*\{\s*display:\s*none/.test(core));
    check('core.css: body.lang-mi hides .en', /body\.lang-mi\s+\.en\s*\{\s*display:\s*none/.test(core));

    const lang = stripJs(readFileSync(join(PUB, 'assets/js/lang-attr.js'), 'utf8'));
    check('lang-attr.js: still syncs the html lang attribute',
        /documentElement\.setAttribute\('lang'/.test(lang));
});

console.log('\n' + '='.repeat(58));
console.log(`  PASSED: ${passed}    FAILED: ${failures.length}`);
console.log('='.repeat(58) + '\n');
if (failures.length) {
    failures.forEach((f) => console.log('  * ' + f));
    process.exit(1);
}
