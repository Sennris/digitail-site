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

import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
    // lastIndexOf, not indexOf. about.css carries the same selector twice on
    // purpose (a base rule and a restyle further down) and the LATER one is
    // what the browser applies, so the earlier one is the wrong thing to
    // assert against. Reading the first rule is how a check passes while the
    // rule it is meant to be about does the opposite.
    const at = css.lastIndexOf(selector + ' {');
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

console.log('\n=== A2. The heading outline starts at h1 ===\n');

group('heading outline', () => {
    // Two halves of one rule, because the first heading on the rendered page
    // is not always the first heading in the file.
    PAGES.forEach((p) => {
        const first = (stripHtml(read(p)).match(/<h[1-6][\s>]/) || [''])[0];
        check(`${p}: the first heading in the file is the h1`,
            first.startsWith('<h1'),
            first ? `starts with ${first.trim()}` : 'no headings at all');
    });

    // a11y.js builds the Display Options panel INTO THE NAV, which sits
    // above every page's <h1>. A heading in there makes the whole document
    // start its outline at level 2, on all thirteen pages at once, and no
    // scan of the static files can see it. The panel is named by
    // role="group" + aria-label, so it needs no heading.
    const a11y = stripJs(readFileSync(join(PUB, 'assets/js/a11y.js'), 'utf8'));
    check('a11y.js: builds no heading element',
        !/<h[1-6][ >]/.test(a11y),
        'anything it injects lands before the page h1');

    // A dialog before <main> puts its (empty) title ahead of the h1.
    ['about.html', 'devlogs.html', 'foxes.html'].forEach((p) => {
        const html = read(p);
        check(`${p}: the dialog sits after the main content`,
            html.indexOf('modal-overlay') > html.indexOf('<main'));
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

    // 404 scatters six paw prints as background texture at 14% opacity.
    // Same reasoning, different class: a checker measures a text node.
    const lost = read('404.html');
    check('404.html: the scattered paw prints are generated content',
        /\.lost__paw::before\s*\{[^}]*content:/.test(lost));
    const withText = [...lost.matchAll(/<span class="lost__paw"[^>]*>([\s\S]*?)<\/span>/g)]
        .filter((m) => m[1].trim() !== '');
    check('404.html: no paw print holds text of its own',
        withText.length === 0, `${withText.length} still do`);
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

console.log('\n=== I. Things only a rendered page shows ===\n');

group('rendered state', () => {
    // The Display Options panel is injected into the nav, which is above the
    // <h1>. A heading there makes the first heading on the document an h2,
    // and every page inherits it because a11y.js runs everywhere.
    const a11y = stripJs(readFileSync(join(PUB, 'assets/js/a11y.js'), 'utf8'));
    check('a11y.js: builds no heading element',
        !/<h[1-6][\s>]/.test(a11y),
        'a11y.js runs on all 13 pages and mounts into the nav, above the h1');
    check('a11y.js: the display panel is still named',
        /aria-label', 'Display options'/.test(a11y));

    // The announcement overlay lays text over an uploaded photo. The veil
    // has to be dark before the text starts or contrast is whatever the
    // photo happens to be.
    const index = stripCss(readFileSync(join(PUB, 'assets/css/pages/index.css'), 'utf8'));
    const overlays = [...index.matchAll(/\.announce-overlay\s*\{([^}]*)\}/g)].map((m) => m[1]);
    check('index.css: the announcement overlay is styled in both viewports',
        overlays.length === 2, `found ${overlays.length} rules`);
    overlays.forEach((body, i) => {
        const where = i === 0 ? 'desktop' : 'mobile';
        const padTop = (body.match(/padding:\s*([\d.]+)rem/) || [])[1];
        const stops = [...body.matchAll(/rgba\(29,\s*13,\s*18,\s*([\d.]+)\)\s*([\d.]+)rem/g)];
        const opaque = stops.filter((s) => Number(s[1]) >= 0.9);
        check(`index.css (${where}): the veil reaches 0.9 opacity at a fixed length`,
            opaque.length > 0,
            'a percentage stop slides as the box grows with a longer announcement');
        const stopAt = opaque.length ? Number(opaque[0][2]) : Infinity;
        check(`index.css (${where}): the fade finishes before the text starts`,
            padTop !== undefined && Number(padTop) >= stopAt,
            `padding-top ${padTop}rem vs veil opaque at ${stopAt}rem`);
    });
});

console.log('\n=== I. The fox tail pointer ===\n');

group('pointer', () => {
    const core = stripCss(readFileSync(join(PUB, 'assets/css/core.css'), 'utf8'));

    ['cursor-tail.png', 'cursor-tail-active.png',
     'cursor-tail-2x.png', 'cursor-tail-active-2x.png'].forEach((f) => {
        check(`assets/img/${f} exists`, existsSync(join(PUB, 'assets/img', f)));
    });

    // Every custom cursor declaration needs a real keyword after the last
    // comma. Without one, a 404 on the image drops the WHOLE declaration
    // and the element ends up with no pointer style at all.
    const decls = [...core.matchAll(/cursor:\s*url\([^)]*\)[^;]*;/g)].map((m) => m[0]);
    check('every custom cursor names an image the site ships',
        decls.length > 0 && decls.every((d) => /cursor-tail(-active)?\.png/.test(d)),
        decls.join(' | '));
    check('every custom cursor falls back to a keyword',
        decls.length > 0 && decls.every((d) => /,\s*(auto|pointer|default)\s*;/.test(d)),
        'a 404 on the image drops the whole declaration');

    check('the pointer beats the page stylesheets on specificity',
        /body :is\([\s\S]*?\)\s*\{[^}]*cursor:\s*url/.test(core),
        'nine page stylesheets declare cursor: pointer and all load later');

    check('typing fields keep the I-beam',
        /body :is\([\s\S]*?textarea[\s\S]*?\)\s*\{\s*cursor:\s*text/.test(core));

    // A custom pointer overrides the size someone set in their OS.
    check('there is an opt-out under Reduce visual noise',
        /\.pref-reduce-noise body\s*\{\s*cursor:\s*auto/.test(core),
        'anyone who enlarged their system pointer needs a way back');
    check('the opt-out also restores the hand on clickable things',
        /\.pref-reduce-noise body :is\([\s\S]*?\)\s*\{\s*cursor:\s*pointer/.test(core));
});

console.log('\n=== J. Team cards ===\n');

group('team cards', () => {
    const css = stripCss(readFileSync(join(PUB, 'assets/css/pages/about.css'), 'utf8'));
    const js = stripJs(readFileSync(join(PUB, 'assets/js/pages/about.js'), 'utf8'));

    // She reported a thin band of the backing showing all round every photo.
    const img = ruleBody(css, '.player-avatar img');
    check('about.css: the photo runs flush inside its frame',
        !!img && !/padding:/.test(img),
        'padding here draws the backing around every picture');

    // Built in the order it is read, so nothing has to be shuffled back.
    // Read positions INSIDE the template only. card-flavour is also named in
    // a variable above it, and searching the whole file finds that first.
    const tplStart = js.indexOf('card.innerHTML');
    const tpl = tplStart > -1 ? js.slice(tplStart, js.indexOf('`;', tplStart)) : '';
    const order = ['<h3>', 'class="player-avatar"', '<p>', 'flavourBox', 'flip-hint']
        .map((t) => tpl.indexOf(t));
    check('about.js: the card is built in the order it appears',
        tpl.length > 0 && order.every((v, i) => v > -1 && (i === 0 || v > order[i - 1])),
        order.join(', '));
    check('about.css: nothing reorders the card children visually',
        !/\.card-front\s*>\s*\S+\s*\{\s*order:/.test(css),
        'visual order that disagrees with the markup is what order: does');

    // The set symbol is drawn, not typed. A glyph is a text node: a
    // contrast checker measures it and a screen reader reads it out.
    const type = ruleBody(css, '.card-front p');
    check('about.css: the type line set symbol is an image, not a glyph',
        !!type && /background-image:\s*url\(/.test(type) && !/content:/.test(type));

    check('about.js: firstLine is declared at the top level',
        /^function firstLine\(/m.test(js),
        'a function nested in a block only hoists inside that block');
    check('about.js: firstLine avoids lookbehind',
        !/\(\?<[=!]/.test(js),
        'Safari below 16.4 throws on lookbehind at PARSE time, killing the file');
});

console.log('\n' + '='.repeat(58));
console.log(`  PASSED: ${passed}    FAILED: ${failures.length}`);
console.log('='.repeat(58) + '\n');
if (failures.length) {
    failures.forEach((f) => console.log('  * ' + f));
    process.exit(1);
}
