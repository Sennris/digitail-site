/**
 * The third and last 14 August 2026 cleanup batch.
 *
 *   node tools/test_cleanup3.mjs
 *
 * No database, so no --experimental-sqlite needed.
 *
 * Covers the homepage mascot, the ticker preview, the social card and
 * its filters, the two contrast complaints, the sticky admin bar, and
 * the one-press save.
 *
 * Where a function can be lifted out and RUN it is, rather than searched
 * for. Five separate string searches on this project have been answered
 * by code somewhere else in the same file.
 */

import { readFileSync } from 'node:fs';
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

// The first matching rule at brace depth zero. A copy inside a media
// query is a different rule for a different screen and must never answer
// for the main one.
function topRule(css, selector) {
    const needle = `${selector} {`;
    let at = css.indexOf(needle);
    const depthAt = (i) => {
        let d = 0;
        for (let j = 0; j < i; j += 1) {
            if (css[j] === '{') d += 1;
            else if (css[j] === '}') d -= 1;
        }
        return d;
    };
    while (at !== -1 && depthAt(at) !== 0) at = css.indexOf(needle, at + 1);
    return at === -1 ? '' : css.slice(at, css.indexOf('}', at) + 1);
}


/* ======================================================================
   1. The mascot beside the wordmark
   ====================================================================== */

console.log('\nThe homepage mascot');

const indexCss = stripCss(read('public/assets/css/pages/index.css'));
const indexJs = read('public/assets/js/pages/index.js');

check('the hero text no longer takes all the leftover space', () => {
    // flex: 1 is what pushed the title off centre: it made the text block
    // fill everything the mascot did not, so the title centred itself
    // inside that box rather than inside the page.
    const rule = topRule(indexCss, '.hero-text');
    if (!rule) return 'there is no .hero-text rule';
    return !/flex:\s*1\s*;/.test(rule) || 'still flex: 1, so the title is still pushed';
});

check('the title and the mascot are centred as a pair', () => {
    const rule = topRule(indexCss, '.hero-inner');
    return /justify-content:\s*center/.test(rule) || 'the pair is not centred together';
});

check('the mascot stands on the same line as the text', () => {
    const rule = topRule(indexCss, '.hero-inner');
    return /align-items:\s*flex-end/.test(rule)
        || 'the mascot floats beside the text instead of sitting next to it';
});

const renderMascot = extract(indexJs, 'function renderMascot');

function mascotChildren(m) {
    const made = [];
    const el = {
        classList: { add() {}, remove() {} },
        style: {},
        replaceChildren(...kids) { made.push(...kids); },
    };
    const sandbox = {
        document: {
            getElementById: (id) => (id === 'hero-mascot' ? el : null),
            createElement: (tag) => ({ tag, className: '', textContent: '', src: '', alt: '' }),
        },
        MASCOT_SIZES: ['small', 'medium', 'large'],
    };
    vm.createContext(sandbox);
    vm.runInContext(`${renderMascot}\nrenderMascot(${JSON.stringify(m)});`, sandbox);
    return made;
}

check('a named mascot says who it is', () => {
    const kids = mascotChildren({ image: '/media/fox.webp', name: 'Kōwhai', size: 'medium' });
    const tag = kids.find((k) => k.className === 'hero-mascot__name');
    return (tag && tag.textContent === 'Kōwhai') || `children were ${kids.map((k) => k.tag).join(', ')}`;
});

check('the picture is still there alongside the name', () => {
    const kids = mascotChildren({ image: '/media/fox.webp', name: 'Kōwhai', size: 'medium' });
    const img = kids.find((k) => k.tag === 'img');
    return (img && img.src === '/media/fox.webp') || 'the image went missing';
});

check('an unnamed mascot shows exactly as it did before', () => {
    const kids = mascotChildren({ image: '/media/fox.webp', size: 'medium' });
    return kids.length === 1 && kids[0].tag === 'img'
        || 'an empty name tag was drawn anyway';
});

check('the name is set as text, never as markup', () => {
    // It is hand-typed in the admin, and a mascot name with an
    // apostrophe in it has broken this file once already.
    const fn = stripJs(renderMascot);
    return !/innerHTML/.test(fn) || 'the name is being written as HTML';
});

check('the name tag is styled', () => (
    topRule(indexCss, '.hero-mascot__name').includes('font-family')
        || 'the tag has no styling, so it will read as loose text'
));


/* ======================================================================
   2. The ticker preview
   ====================================================================== */

console.log('\nThe ticker preview');

const ticker = read('public/admin/ticker-editor.js');
const coreCss = stripCss(read('public/assets/css/core.css'));

check('the preview has something that can move', () => (
    /id="ticker-preview-track"/.test(ticker)
        || 'the preview is still a single block of static text'
));

check('it is animated, not just written out', () => {
    const sync = extract(ticker, 'function sync');
    return /animation\s*=/.test(sync) || 'nothing sets an animation on the preview';
});

check('the speed slider actually drives it', () => {
    const sync = extract(ticker, 'function sync');
    return /animation\s*=[^;]*t\.speed/.test(sync)
        || 'the preview runs at a fixed speed whatever the slider says';
});

check('the text is written twice so the loop is seamless', () => {
    // The keyframes slide the track left by exactly half its width, so
    // the second half has to repeat the first or the band empties out.
    const sync = extract(ticker, 'function sync');
    return /line \+ [^;]* \+ line/.test(sync)
        || 'one copy of the text will scroll away and leave a gap';
});

check('it borrows the live keyframes rather than declaring its own', () => {
    // A second copy would drift away from the real one and the preview
    // would stop being a preview.
    // Comments stripped first. The sentence explaining that it reuses
    // the live keyframes contains the words "@keyframes ticker-scroll",
    // and answered this check on its own - the strip-comments rule
    // earning its keep for the fourth time on this project.
    const code = stripJs(ticker);
    return /ticker-scroll/.test(code) && /@keyframes ticker-scroll/.test(coreCss)
        && !/@keyframes/.test(code)
        || 'the preview has its own animation definition';
});

check('the admin page can actually see those keyframes', () => (
    /assets\/css\/core\.css/.test(read('public/admin/index.html'))
        || 'core.css is not loaded in the admin, so the animation will not run'
));

check('an empty list says so instead of scrolling nothing', () => {
    const sync = extract(ticker, 'function sync');
    return /nothing to show/.test(sync) && /animation\s*=\s*'none'/.test(sync)
        || 'an empty ticker would animate a blank strip';
});


/* ======================================================================
   3. The social card and its filters
   ====================================================================== */

console.log('\nThe social page');

const socialCss = stripCss(read('public/assets/css/pages/social.css'));
const socialJs = read('public/assets/js/pages/social.js');

check('the thumbnail box no longer clips its own badge', () => {
    // The badge is pinned to top:-10px right:-10px on purpose, so it
    // hangs off the corner. The box clipping overflow cut it in half.
    const rule = topRule(socialCss, '.social-thumbnail');
    return !/overflow:\s*hidden/.test(rule)
        || 'the badge is still being cut off by its own frame';
});

check('the badge still hangs off the corner', () => {
    const rule = topRule(socialCss, '.platform-badge');
    return /top:\s*-/.test(rule) && /right:\s*-/.test(rule)
        || 'the badge was moved inside instead of the clipping being lifted';
});

check('the picture is not cropped', () => {
    const rule = topRule(socialCss, '.social-thumbnail img');
    return /object-fit:\s*contain/.test(rule)
        || `still ${(rule.match(/object-fit:[^;]*/) || ['nothing'])[0]}`;
});

const filterParts = [
    extract(socialJs, 'function applyFilters'),
].join('\n');

function filtered({ platform, tag, posts }) {
    const shown = [];
    const sandbox = {
        currentFilter: platform,
        currentTag: tag,
        allPosts: posts,
        renderPosts: (list) => shown.push(...list.map((p) => p.title)),
    };
    vm.createContext(sandbox);
    vm.runInContext(`${filterParts}\napplyFilters();`, sandbox);
    return shown;
}

const POSTS = [
    { title: 'a', platform: 'Instagram', tags: ['physics'] },
    { title: 'b', platform: 'Instagram', tags: ['art'] },
    { title: 'c', platform: 'Bluesky', tags: ['physics', 'art'] },
    { title: 'd', platform: 'Bluesky' },
];

check('everything shows when neither filter is set', () => {
    const r = filtered({ platform: 'all', tag: 'all', posts: POSTS });
    return r.length === 4 || `got ${r.join(', ')}`;
});

check('a tag on its own narrows the list', () => {
    const r = filtered({ platform: 'all', tag: 'physics', posts: POSTS });
    return r.join(',') === 'a,c' || `got ${r.join(', ')}`;
});

check('a platform on its own still works', () => {
    const r = filtered({ platform: 'Bluesky', tag: 'all', posts: POSTS });
    return r.join(',') === 'c,d' || `got ${r.join(', ')}`;
});

check('the two narrow TOGETHER rather than replacing each other', () => {
    // This is the whole design decision: Instagram AND physics.
    const r = filtered({ platform: 'Instagram', tag: 'physics', posts: POSTS });
    return r.join(',') === 'a' || `got ${r.join(', ')}`;
});

check('a post with no tags survives a platform filter', () => {
    const r = filtered({ platform: 'Bluesky', tag: 'all', posts: POSTS });
    return r.includes('d') || 'an untagged post vanished from a platform filter';
});

check('a combination with no matches comes back empty, not full', () => {
    const r = filtered({ platform: 'Bluesky', tag: 'nothing', posts: POSTS });
    return r.length === 0 || `got ${r.join(', ')}`;
});

check('the active button is worked out from the value, not from a click', () => {
    // The old version read the global `event`, which is undefined
    // whenever the function is called from anywhere but a handler.
    const fn = extract(socialJs, 'function markActive');
    return !/event\./.test(fn) || 'it still depends on there being a click in flight';
});

check('the tag row is only built when there are tags to offer', () => {
    const fn = extract(socialJs, 'function buildFilters');
    return /if \(!tagContainer \|\| !tags\.length\) return;/.test(fn)
        || 'an empty tag row would appear on a site with no tags';
});

check('the All button in the markup can be re-marked', () => {
    // It is written in social.html rather than built here, so it needs
    // the same value stamp or it can never be highlighted again.
    const fn = extract(socialJs, 'function buildFilters');
    return /dataset\.value = 'all'/.test(fn)
        || 'the All button would stay dark once another filter is used';
});


/* ======================================================================
   4. The admin: contrast, sticky bar, one press
   ====================================================================== */

console.log('\nThe admin');

const cmCss = stripCss(read('public/assets/css/pages/content-manager.css'));
const adminScript = read('public/admin/admin-script.js');
const adminHtml = stripHtml(read('public/admin/index.html'));

check('the dropdown menu itself is coloured, not just the closed control', () => {
    // Styling a <select> does not style its <option> children - the open
    // menu is drawn by the operating system.
    // The selector has to END there. Written as ".../option[^{]*{" it was
    // answered by "optionX" followed by the optgroup line - renaming the
    // selector out of existence left this green. Same substring trap that
    // c-descriptionX walked into earlier in this cleanup.
    const rule = cmCss.match(/\.form-group select option\s*[,{][^{]*\{[^}]*\}/);
    return (rule && /background-color/.test(rule[0]) && /color:/.test(rule[0]))
        || 'the open menu will still be pale text on the OS white sheet';
});

check('helper text is off the muted tone', () => {
    const rule = topRule(cmCss, '.helper-text');
    return !/color:\s*var\(--arctic-willow\)/.test(rule)
        || 'helper text still reads as greyed out rather than explanatory';
});

check('the pin inside cards moved with it', () => {
    // This rule out-specifies the one above; leaving it behind would put
    // the muted colour straight back on most helper lines.
    const at = cmCss.indexOf('body .admin-main .card .helper-text');
    const rule = cmCss.slice(at, cmCss.indexOf('}', at));
    return !/var\(--arctic-willow\)/.test(rule)
        || 'the card colour pin still forces the old muted tone';
});

check('the top bar follows you down the page', () => {
    const rule = topRule(cmCss, '.top-bar');
    return /position:\s*sticky/.test(rule) || 'the bar is still stuck at the top of the document';
});

check('and it is opaque, now that content passes under it', () => {
    const rule = topRule(cmCss, '.top-bar');
    const bg = (rule.match(/background-color:\s*([^;]+)/) || [, ''])[1];
    return (bg && !/rgba\([^)]*0\.[0-3]\s*\)/.test(bg))
        || `background is ${bg.trim()}, which text will show through`;
});

check('saving an item publishes it', () => {
    const fn = extract(adminScript, 'function saveItem');
    return /publishNow\(/.test(fn) || 'saving still only writes to the working copy';
});

check('deleting publishes too', () => {
    const fn = extract(adminScript, 'function deleteItem');
    return /publishNow\(/.test(fn)
        || 'a delete would sit unpublished, which is worse than an unpublished edit';
});

check('a failed publish says so rather than claiming success', () => {
    const fn = extract(adminScript, 'function publishNow');
    return /catch\(/.test(fn) && /failed/.test(fn)
        || 'a failed publish would look exactly like a successful one';
});

check('no screen still tells you to press a second button', () => {
    // Eight hint strings said "press Save to site". Leaving any of them
    // would be the screen lying about what the button next to it did.
    const files = ['admin-script.js', 'admin-games.js', 'admin-mascots.js',
                   'admin-extras.js', 'admin-press.js', 'admin-homepage-sections.js',
                   'ticker-editor.js'];
    const guilty = files.filter((f) => {
        const body = stripJs(read('public/admin/' + f));
        return /Save to site/.test(body);
    });
    return guilty.length === 0 || `${guilty.join(', ')} still says Save to site`;
});

check('the publish button is still there for the settings panels', () => (
    /id="save-all-btn"/.test(adminHtml)
        || 'the homepage, press kit, ticker and mascots now have no way to publish at all'
));

check('the games page settings fold away', () => {
    const at = adminHtml.indexOf('Games page');
    const before = adminHtml.slice(Math.max(0, at - 300), at);
    return /<details class="card card--foldable">/.test(before)
        || 'the settings card still sits between the list and the editor';
});

check('and they start folded', () => {
    const tag = (adminHtml.match(/<details class="card card--foldable"[^>]*>/) || [''])[0];
    return !/\bopen\b/.test(tag) || 'it starts open, which is where it was in the way';
});

check('the four fields are still inside it', () => {
    const at = adminHtml.indexOf('card--foldable');
    const body = adminHtml.slice(at, adminHtml.indexOf('</details>', at));
    const missing = ['gp-title-en', 'gp-title-mi', 'gp-intro-en', 'gp-intro-mi']
        .filter((id) => !body.includes(`id="${id}"`));
    return missing.length === 0 || `${missing.join(', ')} fell outside the fold`;
});

check('the social date explains that it fills itself in', () => {
    const at = adminScript.indexOf('id="social-date"');
    return /today/i.test(adminScript.slice(at, at + 400))
        || 'nothing says the date is already filled in for you';
});


console.log(`\n${'='.repeat(46)}`);
console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
console.log('='.repeat(46));
process.exit(fail === 0 ? 0 : 1);
