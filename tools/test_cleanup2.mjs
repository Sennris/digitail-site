/**
 * The second 14 August 2026 cleanup batch.
 *
 *   node tools/test_cleanup2.mjs
 *
 * No database, so no --experimental-sqlite needed.
 *
 * Covers: the fox photo that never rendered, the team photos being
 * cropped, the hover sweep that covered the whole card, and the 404
 * page's nav.
 *
 * The nav check compares 404.html against the OTHER pages rather than
 * against a list written here, so adding a ninth link to the site does
 * not need this file edited to stay honest - it just starts failing
 * until 404.html gets it too, which is the point.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const stripHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

let pass = 0;
let fail = 0;

function check(name, fn) {
    try {
        const r = fn();
        if (r === true) { pass += 1; console.log(`  PASS  ${name}`); }
        else { fail += 1; console.log(`  FAIL  ${name}${r ? ` - ${r}` : ''}`); }
    } catch (e) {
        fail += 1;
        console.log(`  FAIL  ${name} - threw: ${e.message}`);
    }
}

function extract(src, signature) {
    const start = src.indexOf(signature);
    if (start === -1) throw new Error(`cannot find ${signature}`);
    let depth = 0;
    let seen = false;
    for (let i = src.indexOf('{', start); i < src.length; i += 1) {
        if (src[i] === '{') { depth += 1; seen = true; }
        else if (src[i] === '}') {
            depth -= 1;
            if (seen && depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error(`unbalanced braces after ${signature}`);
}

// The first .rule { } at brace depth zero. Anything inside a media query
// is a different rule for a different screen and must never answer for
// the main one - that mistake has now been made four times on this
// project, once while fixing it.
function topRule(css, selector) {
    let at = css.indexOf(`${selector} {`);
    const depthAt = (i) => {
        let d = 0;
        for (let j = 0; j < i; j += 1) {
            if (css[j] === '{') d += 1;
            else if (css[j] === '}') d -= 1;
        }
        return d;
    };
    while (at !== -1 && depthAt(at) !== 0) at = css.indexOf(`${selector} {`, at + 1);
    if (at === -1) return '';
    return css.slice(at, css.indexOf('}', at) + 1);
}


/* ======================================================================
   1. The fox photo
   ====================================================================== */

console.log('\nThe fox photo');

const foxesJs = read('public/assets/js/pages/foxes.js');
const foxRender = foxesJs.slice(foxesJs.indexOf('const imageHTML'), foxesJs.indexOf('card.innerHTML'));

function foxImage(fox) {
    const src = `${extract(foxesJs, 'function escapeAttr')}\n`
        + `var fox = ${JSON.stringify(fox)};\n`
        + `var out = ${foxRender.replace(/^\s*const imageHTML\s*=/, '').replace(/;[\s\S]*$/, '')};`;
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox.out;
}

check('a stored photo URL becomes an actual image tag', () => {
    const html = foxImage({ image: '/media/2026/08/fox.webp', nameEn: 'Kiri' });
    return /<img\s/.test(html) && html.includes('src="/media/2026/08/fox.webp"')
        || `came out as ${html}`;
});

check('the URL is not just dropped in as text', () => {
    // This is the bug exactly: the address was handed to the page where
    // a picture was expected, so nothing appeared.
    const html = foxImage({ image: '/media/2026/08/fox.webp', nameEn: 'Kiri' });
    return html.trim() !== '/media/2026/08/fox.webp' || 'the raw URL is still being printed';
});

check('an uppercase extension is treated the same as any other', () => {
    // The one in the report ended .WEBP.
    const html = foxImage({ image: '/media/2026/08/GoKD-CLIPART.WEBP', nameEn: 'Kiri' });
    return html.includes('src="/media/2026/08/GoKD-CLIPART.WEBP"')
        || `came out as ${html}`;
});

check('the fox gets a name in the alt text', () => {
    const html = foxImage({ image: '/media/x.webp', nameEn: 'Kiri' });
    return html.includes('alt="Kiri"') || `alt was wrong: ${html}`;
});

check('a quote in the filename cannot break out of the tag', () => {
    const html = foxImage({ image: '/media/a" onerror="alert(1)', nameEn: 'Kiri' });
    return !/onerror="alert/.test(html) || `escaped badly: ${html}`;
});

check('no photo still shows the placeholder, in both languages', () => {
    const html = foxImage({ image: '', nameEn: 'Kiri' });
    return html.includes('Photo Placeholder') && html.includes('Pikitia Placeholder')
        || `came out as ${html}`;
});

check('markup typed in before the picker existed is left alone', () => {
    const html = foxImage({ image: '<img src="/old.webp" class="legacy">', nameEn: 'Kiri' });
    return html.includes('class="legacy"') || 'an older hand-written entry was mangled';
});

check('the stylesheet is already expecting an img in there', () => {
    const css = stripCss(read('public/assets/css/pages/foxes.css'));
    return /\.image-placeholder img\s*\{[^}]*object-fit/.test(css)
        || 'nothing sizes the photo once it is in the card';
});


/* ======================================================================
   2. The team photos, and the hover that ate the card
   ====================================================================== */

console.log('\nThe team cards');

const aboutCss = stripCss(read('public/assets/css/pages/about.css'));
const aboutJs = read('public/assets/js/pages/about.js');

check('the card photo is not cropped', () => {
    const rule = topRule(aboutCss, '.player-avatar img');
    if (!rule) return 'nothing sizes the card photo at all';
    return /object-fit:\s*contain/.test(rule)
        || `still ${(rule.match(/object-fit:[^;]*/) || ['nothing'])[0]}`;
});

check('the bio photo is not cropped either', () => {
    const rule = topRule(aboutCss, '.modal-avatar img');
    if (!rule) return 'nothing sizes the bio photo';
    return /object-fit:\s*contain/.test(rule)
        || `still ${(rule.match(/object-fit:[^;]*/) || ['nothing'])[0]}`;
});

check('the sizing is reachable from the stylesheet', () => {
    // An inline style beats any rule in about.css, so while the sizing
    // lived in about.js the crop could not be fixed from the file
    // anybody would open to fix it.
    const at = aboutJs.indexOf('avatarHTML');
    const slice = aboutJs.slice(at, at + 400);
    return !/style="[^"]*object-fit/.test(slice)
        || 'the photo still carries an inline style that overrides about.css';
});

check('hovering a card leaves it readable', () => {
    // The sweep used to be a transition that ended at opacity 1 and
    // stayed there while the pointer sat on the card.
    const hover = aboutCss.match(/\.player-card:hover::after\s*\{[^}]*\}/);
    if (!hover) return 'there is no hover rule for the sweep';
    return !/opacity:\s*1\s*;/.test(hover[0])
        || 'the sweep still parks at full strength over the card';
});

check('the sweep ends transparent', () => {
    const frames = aboutCss.match(/@keyframes foil-sweep\s*\{[\s\S]*?\n\}/);
    if (!frames) return 'the sweep is not an animation, so it cannot end';
    const last = frames[0].slice(frames[0].indexOf('100%'));
    return /opacity:\s*0/.test(last) || 'the last frame does not fade out';
});

check('the sweep runs once rather than looping', () => {
    const hover = (aboutCss.match(/\.player-card:hover::after\s*\{[^}]*\}/) || [''])[0];
    return /animation:[^;]*foil-sweep/.test(hover) && !/infinite/.test(hover)
        || 'the light show repeats for as long as the pointer sits there';
});

check('the brightest band is dimmer than it was', () => {
    const rule = topRule(aboutCss, '.player-card::after');
    const alphas = [...rule.matchAll(/rgba\([^)]*?,\s*([0-9.]+)\s*\)/g)].map((m) => Number(m[1]));
    const peak = Math.max(...alphas, 0);
    return peak <= 0.4 || `the peak is still ${peak}, which washes the card out`;
});

check('reduced-motion visitors get no sweep at all', () => (
    /prefers-reduced-motion[\s\S]{0,200}foil-sweep|prefers-reduced-motion[\s\S]{0,200}animation:\s*none/.test(aboutCss)
        || 'the animation ignores the reduced-motion setting'
));

check('the reduce-noise preference switches it off too', () => (
    /\.pref-reduce-noise \.player-card:hover::after/.test(aboutCss)
        || 'the site\u2019s own reduce-noise toggle does not reach the sweep'
));


/* ======================================================================
   3. The 404 page's nav
   ====================================================================== */

console.log('\nThe 404 page');

const notFound = stripHtml(read('public/404.html'));

function navTargets(html) {
    return [...stripHtml(html).matchAll(/nav-link"\s+href="([^"]+)"/g)]
        .map((m) => m[1].replace(/^\.?\//, '').replace(/\.html$/, '').replace(/^index$/, ''))
        .sort();
}

check('the 404 nav offers the same pages as the rest of the site', () => {
    // Compared against about.html rather than a list typed in here, so
    // a ninth link added to the site fails this until 404 has it too.
    const want = navTargets(read('public/about.html'));
    const got = navTargets(read('public/404.html'));
    const missing = want.filter((p) => !got.includes(p));
    const extra = got.filter((p) => !want.includes(p));
    return (missing.length === 0 && extra.length === 0)
        || `missing ${missing.join(', ') || 'nothing'}; extra ${extra.join(', ') || 'nothing'}`;
});

check('it no longer points at a page that has never existed', () => (
    !/href="\/?game(\.html)?"/.test(notFound) || '/game singular is still there'
));

check('the press kit is reachable from it', () => (
    /nav-link"\s+href="[^"]*press/.test(notFound) || 'no press link'
));

check('its links are root-absolute, unlike every other page', () => {
    // This page answers for /any/path/at/all, so a relative link would
    // resolve against a folder the visitor invented.
    const relative = [...notFound.matchAll(/nav-link"\s+href="([^"]+)"/g)]
        .map((m) => m[1]).filter((h) => !h.startsWith('/'));
    return relative.length === 0 || `${relative.join(', ')} would resolve against the wrong folder`;
});

check('and they name a file that exists', () => {
    const missing = [...notFound.matchAll(/nav-link"\s+href="\/([^"]+)"/g)]
        .map((m) => m[1])
        .filter((f) => f && !existsSync(join(ROOT, 'public', f)));
    return missing.length === 0 || `${missing.join(', ')} is not a file in public/`;
});


/* ======================================================================
   4. The dead copy of the language code
   ====================================================================== */

console.log('\nHousekeeping');

check('site.js is gone', () => {
    // It held a second, unreachable implementation of the language
    // memory. Leaving it there means the next person to fix the
    // language edits the file that does nothing.
    return !existsSync(join(ROOT, 'public/assets/js/site.js'))
        || 'public/assets/js/site.js is still there, and no page loads it';
});

check('nothing was relying on it', () => {
    const pages = readdirSync(join(ROOT, 'public')).filter((f) => f.endsWith('.html'));
    const guilty = pages.filter((f) => /src="[^"]*\/site\.js"/.test(read('public/' + f)));
    return guilty.length === 0 || `${guilty.join(', ')} loads it after all`;
});

check('the language memory still has exactly one home', () => {
    const files = readdirSync(join(ROOT, 'public/assets/js'))
        .filter((f) => f.endsWith('.js'))
        .filter((f) => /digitail-lang/.test(stripJs(read('public/assets/js/' + f))));
    return (files.length === 1 && files[0] === 'lang-persist.js')
        || `the language key appears in ${files.join(', ') || 'nothing'}`;
});


console.log(`\n${'='.repeat(46)}`);
console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
console.log('='.repeat(46));
process.exit(fail === 0 ? 0 : 1);
