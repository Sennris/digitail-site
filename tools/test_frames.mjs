/**
 * The 20 August 2026 batch - Cat's own review of the live site.
 *
 *   node tools/test_frames.mjs
 *
 * No database, so no --experimental-sqlite needed.
 *
 * The image checks are written as ONE RULE APPLIED TO EVERY PAGE rather
 * than a list of the five stylesheets that were wrong today: any frame
 * that holds a photo must let the photo keep its shape. A sixth page
 * added next month is covered by a test written now.
 *
 * Devlogs is the reference. She named it herself - the gif cards there
 * already sized their frame to the picture, and every other page is now
 * copying them, so the test compares against that rather than against a
 * measurement typed in here.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
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

// EVERY rule for a selector at brace depth zero, not just the first.
// about.css carries two .player-avatar rules - an older base and the
// trading-card restyle below it - and checking only the first one asked
// the wrong rule about the height. A copy inside a media query is still
// excluded: that is a different rule for a different screen and must
// never answer for the main one.
function topRules(css, selector) {
    const depthAt = (i) => {
        let d = 0;
        for (let j = 0; j < i; j += 1) {
            if (css[j] === '{') d += 1;
            else if (css[j] === '}') d -= 1;
        }
        return d;
    };
    const out = [];
    let at = css.indexOf(`${selector} {`);
    while (at !== -1) {
        if (depthAt(at) === 0) out.push(css.slice(at, css.indexOf('}', at) + 1));
        at = css.indexOf(`${selector} {`, at + 1);
    }
    return out;
}

// The value that actually applies: last top-level rule to set it wins.
function topRule(css, selector) {
    return topRules(css, selector).join('\n');
}

const prop = (rule, name) => {
    const m = rule.match(new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`));
    return m ? m[1].trim() : '';
};


/* ======================================================================
   1. Every picture frame follows its picture
   ====================================================================== */

console.log('\nFrames follow the picture');

// selector for the frame, selector for the image inside it, and the file
const FRAMES = [
    ['homepage',   'index.css',  '.image-placeholder',  '.image-placeholder img'],
    ['foxes',      'foxes.css',  '.image-placeholder',  '.image-placeholder img'],
    ['devlogs',    'devlogs.css', '.image-placeholder', '.image-placeholder img'],
    ['social',     'social.css', '.social-thumbnail',   '.social-thumbnail img'],
    ['team card',  'about.css',  '.player-avatar',      '.player-avatar img'],
    ['team bio',   'about.css',  '.modal-avatar',       '.modal-avatar img'],
];

for (const [where, file, frameSel, imgSel] of FRAMES) {
    const css = stripCss(read('public/assets/css/pages/' + file));
    const frame = topRule(css, frameSel);
    const img = topRule(css, imgSel);

    check(`${where}: the frame has no fixed height`, () => {
        if (!frame) return `${frameSel} is missing from ${file}`;
        // Asked of EVERY rule for the selector: one of them setting a
        // pixel height is enough to bring the bug back if the rule that
        // currently overrides it is ever moved or trimmed.
        const heights = topRules(css, frameSel)
            .map((r) => prop(r, 'height'))
            .filter((h) => h && h !== 'auto');
        return heights.length === 0 || `height is ${heights.join(' and ')}`;
    });

    check(`${where}: the picture keeps its own proportions`, () => {
        if (!img) return `${imgSel} is missing from ${file}`;
        const h = prop(img, 'height').replace(/\s*!important/, '');
        return h === 'auto' || `height is ${JSON.stringify(h)}, so the picture is stretched or squashed`;
    });

    check(`${where}: nothing is trimmed to fit`, () => {
        if (!img) return `${imgSel} is missing from ${file}`;
        const fit = prop(img, 'object-fit').replace(/\s*!important/, '');
        return fit !== 'cover' || 'object-fit: cover cuts off whatever does not fit';
    });

    check(`${where}: there is still a floor so an empty frame is visible`, () => {
        if (!frame) return `${frameSel} is missing from ${file}`;
        return /min-height/.test(frame) || 'with no min-height an empty placeholder collapses to nothing';
    });
}

check('the games page art is not trimmed either', () => {
    const css = stripCss(read('public/assets/css/pages/games.css'));
    const img = topRule(css, '.game-plank__art img');
    return prop(img, 'object-fit') !== 'cover' && prop(img, 'height') === 'auto'
        || `height ${prop(img, 'height')}, object-fit ${prop(img, 'object-fit')}`;
});

check('but the EMPTY games placeholder keeps a shape to hold', () => {
    // With no art there is nothing to give the box a height, so the
    // aspect ratio has to stay on the empty state.
    const css = stripCss(read('public/assets/css/pages/games.css'));
    const empty = topRule(css, '.game-plank__art.is-empty');
    const frame = topRule(css, '.game-plank__art');
    return /aspect-ratio/.test(empty) && !/aspect-ratio/.test(frame)
        || 'the ratio is on the frame itself, which trims real art to fit';
});

check('game page screenshots are not trimmed', () => {
    const css = stripCss(read('public/assets/css/pages/game.css'));
    const rule = topRule(css, '.screenshot-image');
    return prop(rule, 'object-fit') !== 'cover' && prop(rule, 'height') === 'auto'
        || `height ${prop(rule, 'height')}, object-fit ${prop(rule, 'object-fit')}`;
});

check('no inline height pins a frame from the markup', () => {
    // An inline style beats every stylesheet, so one of these makes the
    // rules above unreachable - which is exactly what #home-social-image
    // was doing.
    const guilty = readdirSync(join(ROOT, 'public'))
        .filter((f) => f.endsWith('.html'))
        .filter((f) => {
            const html = stripHtml(read('public/' + f));
            return /class="[^"]*(image-placeholder|social-thumbnail|player-avatar)[^"]*"[^>]*style="[^"]*height/
                .test(html);
        });
    return guilty.length === 0 || `${guilty.join(', ')} pins a frame height inline`;
});

check('the role badge follows the photo instead of a fixed offset', () => {
    // It used to be absolutely positioned 218px from the top of the
    // card, measured against a photo that was always 210px tall. Once
    // the frame follows the picture, that offset points at nothing.
    const css = stripCss(read('public/assets/css/pages/about.css'));
    const rule = topRule(css, '.card-front p');
    if (!rule) return 'the badge rule is gone';
    return !/position:\s*absolute/.test(rule)
        || 'the badge is still pinned to a measurement the photo no longer has';
});

check('team cards do not stretch to the tallest in the row', () => {
    const css = stripCss(read('public/assets/css/pages/about.css'));
    const grid = topRule(css, '.team-grid');
    return /align-items:\s*start/.test(grid)
        || 'a short card gets a band of empty colour under its button';
});


/* ======================================================================
   2. Studio login
   ====================================================================== */

console.log('\nThe footer link');

const pages = readdirSync(join(ROOT, 'public')).filter((f) => f.endsWith('.html'));

check('Studio login goes to the hub', () => {
    const wrong = pages.filter((f) => {
        const html = stripHtml(read('public/' + f));
        if (!/Studio login|Takiuru/.test(html)) return false;
        return !/hub\.digitailstudios\.com/.test(html);
    });
    return wrong.length === 0 || `${wrong.join(', ')} still sends people somewhere else`;
});

check('no footer still points at the admin panel', () => {
    // The page it used to open was deleted with the password login, so
    // this was a link to nothing.
    const guilty = pages.filter((f) => /footer[\s\S]{0,400}href="\/admin/.test(stripHtml(read('public/' + f))));
    return guilty.length === 0 || `${guilty.join(', ')} links to /admin from the footer`;
});

check('both languages point at the same place', () => {
    const guilty = pages.filter((f) => {
        const html = stripHtml(read('public/' + f));
        if (!/Takiuru/.test(html)) return false;
        const at = html.indexOf('Takiuru');
        return !/hub\.digitailstudios\.com/.test(html.slice(Math.max(0, at - 200), at));
    });
    return guilty.length === 0 || `${guilty.join(', ')} sends te reo readers elsewhere`;
});


/* ======================================================================
   3. Get in touch
   ====================================================================== */

console.log('\nGet in touch');

const pressJs = read('public/assets/js/pages/press.js');
const contact = pressJs.slice(pressJs.indexOf("if (kit.contactEmail)"), pressJs.indexOf("if (kit.contactEmail)") + 1600);

check('the contact opens an email rather than a form', () => (
    /mailto:/.test(contact) || 'nothing opens the reader\u2019s email app'
));

check('the subject is filled in', () => (
    /subject=/.test(contact) && /encodeURIComponent/.test(contact)
        || 'press mail arrives with no subject, so it cannot be sorted in the Group'
));

check('the subject is escaped rather than pasted raw', () => (
    !/subject=Press/.test(contact) || 'spaces and punctuation in the subject are not encoded'
));

check('the page says what pressing it will do', () => (
    /press-contact__hint/.test(contact) || 'the link gives no warning that it opens an email app'
));

check('no message box was built', () => {
    // Deliberate: collecting a message is easy, SENDING it is not. This
    // Worker has no way to send email, and Email Routing would take over
    // the domain's MX records and break every studio address.
    const stripped = pressJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return !/<form|createElement\('form'\)/.test(stripped)
        || 'there is a form on the press page with nothing behind it to send the message';
});

// Two places name the Group: the field LABEL and the note under it.
// Searching a window around contactEmail found either one, so deleting
// the note stayed green because the label answered for it - the same
// duplicate-answers-for-a-deletion trap that has now bitten six times on
// this project. Each one is checked on its own line.
check('the contact field label names the Google Group', () => {
    const adminPress = read('public/admin/admin-press.js');
    const label = adminPress.split('\n').find((l) => l.includes("'contactEmail'"));
    if (!label) return 'the contactEmail field is gone';
    return /Google Group/i.test(label)
        || `the label does not mention it: ${label.trim()}`;
});

check('the note under it explains why', () => {
    const adminPress = read('public/admin/admin-press.js');
    const at = adminPress.indexOf("'contactEmail'");
    // Everything AFTER the field definition, so the label cannot answer.
    const note = adminPress.slice(at + 120, at + 1400);
    return /Google Group/i.test(note) && /not a personal/i.test(note)
        || 'nothing says to use the Group rather than somebody\u2019s own address';
});


/* ======================================================================
   4. The hub board - long words
   ====================================================================== */

console.log('\nHub cards (checked in this repo only if the hub is beside it)');

check('this suite does not pretend to check the other repo', () => {
    // The hub is a separate repository. Its fix has its own test in its
    // own suite; asserting it from here would be a check that passes
    // because it cannot see the thing it claims to cover.
    return true;
});


/* ---------- the role badge on the team cards ---------- */

console.log('\nThe role badge');

const aboutCss = stripCss(read('public/assets/css/pages/about.css'));
const aboutJs = read('public/assets/js/pages/about.js');

/* ⚠️ ALL THREE REWRITTEN 21 Aug 2026.
   What was reported was "the role badge lands on top of the name". These
   checks pinned the FIX rather than the complaint: CSS `order:` values on
   four children, and an exact `margin: -Xrem auto Yrem` shorthand. The
   cards were rebuilt as trading cards, the markup is now emitted in the
   order it appears so nothing needs reordering, and no element is pulled
   over its neighbour at all - which is a stronger guarantee than the one
   these tests were written to protect, and every one of them failed on it.
   They now assert the complaint: nothing overlaps, and the button is last. */

const roleLine = (aboutCss.match(/\.card-front p\s*\{[\s\S]*?\}/g) || []).pop() || '';
const namePlate = (aboutCss.match(/\.card-front h3\s*\{[\s\S]*?\}/g) || []).pop() || '';

check('the role line is not pulled on top of its neighbour', () => {
    if (!roleLine) return 'no rule for the role line at all';
    return !/margin:[^;]*(^|[\s:])-[0-9]/.test(roleLine)
        || 'a negative margin drags the role line over whatever is next to it';
});

check('the name is not pulled on top of its neighbour either', () => {
    if (!namePlate) return 'no rule for the name at all';
    return !/margin:[^;]*(^|[\s:])-[0-9]/.test(namePlate)
        || 'a negative margin drags the name over whatever is next to it';
});

check('the button is still last', () => {
    // Read the template, not CSS order values - the markup IS the order now.
    const at = aboutJs.indexOf('card.innerHTML');
    const tpl = at > -1 ? aboutJs.slice(at, aboutJs.indexOf('`;', at)) : '';
    if (!tpl) return 'could not find the card template';
    const btn = tpl.indexOf('flip-hint');
    return (btn > tpl.indexOf('<h3>') && btn > tpl.indexOf('<p>') && btn > tpl.indexOf('player-avatar'))
        || 'Read bio is no longer the last thing on the card';
});

check('the name is not reordered in the markup as well', () => {
    // Doing it twice - in CSS and in about.js - would put it back.
    const at = aboutJs.indexOf('card-front');
    const block = aboutJs.slice(at, at + 700);
    return block.indexOf('<h3>') < block.indexOf('<p>')
        || 'the markup order changed too, which cancels the CSS reorder out';
});


console.log(`\n${'='.repeat(46)}`);
console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
console.log('='.repeat(46));
process.exit(fail === 0 ? 0 : 1);
