/**
 * Te reo tag badges, and game-derived primary tags.
 *
 *   node tools/test_tags_and_games.mjs
 *
 * Two changes, both about tags:
 *
 *   1. Devlog badges showed English in BOTH language modes. The te reo tag
 *      field only ever reached the filter buttons. The badges and buttons now
 *      come from one shared fetch.
 *
 *   2. The Games tab can seed a primary tag per game, now that games are a
 *      real list.
 *
 * The dangerous failures here are quiet ones: a badge falling back to blank
 * instead of English in te reo mode (a tag that vanishes), a tag name with a
 * quote in it breaking a card, and the game seeder creating duplicates that
 * are indistinguishable once rendered.
 *
 * Every check below is mutation-tested by tools/mutate_tags_and_games.sh.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let passes = 0;

function check(label, fn, detail = '') {
    let ok = false;
    let extra = detail;
    try {
        ok = typeof fn === 'function' ? fn() : fn;
    } catch (e) {
        ok = false;
        extra = `THREW: ${e.message}`;
    }
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
    if (ok) passes++; else failures.push(label);
}

const devlogsJs = readFileSync(join(ROOT, 'public/assets/js/pages/devlogs.js'), 'utf8');
const extrasJs = readFileSync(join(ROOT, 'public/admin/admin-extras.js'), 'utf8');

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Brace matching, not slicing to a closing string.
function extractFn(src, signature) {
    const start = src.indexOf(signature);
    if (start < 0) return '';
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    return '';
}


/* ================= 1. the badges are bilingual ======================== */

console.log('Devlog badges carry both languages:');

const badgeSrc = extractFn(devlogsJs, 'function badge(name, extraClass)');
check('the badge builder was found', () => badgeSrc.length > 0);

// A tiny DOM. Elements are real objects, so a name reaching markup as a
// string rather than as textContent would show up as a missing property.
function makeEl(tag) {
    return {
        tag, className: '', _text: '', _children: [],
        set textContent(v) { this._text = String(v); },
        get textContent() { return this._text; },
        append(...kids) { this._children.push(...kids); },
        appendChild(k) { this._children.push(k); return k; },
    };
}
const badgeCtx = vm.createContext({
    document: { createElement: makeEl },
    Map,
});
vm.runInContext(
    'let tagLabels = new Map();\n' +
    badgeSrc +
    '\nglobalThis.badge = badge;' +
    '\nglobalThis.setLabels = (pairs) => { tagLabels = new Map(pairs); };',
    badgeCtx
);

const build = (name, extra) => {
    try { return badgeCtx.badge(name, extra); } catch (e) { return { threw: e.message }; }
};
const langs = (el) => ({
    en: (el._children.find((c) => c.className === 'en') || {})._text,
    mi: (el._children.find((c) => c.className === 'mi') || {})._text,
});

badgeCtx.setLabels([['paper crown', 'Karauna Pepa'], ['bug fix', '']]);

check('a badge has an English span and a te reo span',
    () => { const l = langs(build('Paper Crown')); return l.en !== undefined && l.mi !== undefined; });

check('the English span shows the tag name',
    () => langs(build('Paper Crown')).en === 'Paper Crown');

check('the te reo span shows the te reo label',
    () => langs(build('Paper Crown')).mi === 'Karauna Pepa',
    `got ${JSON.stringify(langs(build('Paper Crown')).mi)}`);

check('a tag with a BLANK te reo label falls back to English',
    () => langs(build('Bug Fix')).mi === 'Bug Fix',
    'a blank te reo span would make the badge vanish in te reo mode');

check('a tag missing from the tag list entirely falls back to English',
    () => langs(build('Ancient Legacy Tag')).mi === 'Ancient Legacy Tag');

check('the lookup ignores case',
    () => langs(build('PAPER CROWN')).mi === 'Karauna Pepa',
    'the tag manager stores one casing; a devlog may have been typed with another');

check('the name is set as text, never as markup',
    () => {
        const el = build('Hine\'s "big" <update>');
        return langs(el).en === 'Hine\'s "big" <update>';
    },
    'one stray quote in a hand-typed tag name broke a row on this site before');

check('the primary badge keeps its own class',
    () => build('Paper Crown', 'tag-badge--primary').className === 'tag-badge tag-badge--primary');
check('a badge with no extra class is still a tag-badge',
    () => build('Paper Crown').className === 'tag-badge');

check('the badge builder never assigns innerHTML',
    () => !/innerHTML/.test(strip(badgeSrc)));


/* ================= 2. one fetch feeds both ============================ */

console.log('\nBadges and filter buttons come from one list:');

const devlogCode = strip(devlogsJs);

check('the two fetches are made together',
    () => /Promise\.all\(\[/.test(devlogCode) &&
          /fetch\('\/api\/content\/devlogs'\)/.test(devlogCode) &&
          /fetch\('\/api\/content\/tags'\)/.test(devlogCode));

check('there is only ONE tags fetch left',
    () => (devlogCode.match(/fetch\('\/api\/content\/tags'\)/g) || []).length === 1,
    'two independent fetches could hand the badges and the buttons different lists');

check('the filter buttons are built from the shared result',
    () => /buildFilterButtons\(tags\)/.test(devlogCode) &&
          /function buildFilterButtons\(tags\)/.test(devlogCode));

check('a failed tags fetch cannot stop the devlogs rendering',
    () => {
        const src = devlogsJs.slice(devlogsJs.indexOf('const tagsPromise'),
                                    devlogsJs.indexOf('Promise.all(['));
        return /\.catch\(\(\) => null\)/.test(src);
    },
    'the badges degrade to English; the page still works');

check('a non-array tags result is handled rather than thrown on',
    () => /Array\.isArray\(tags\) \? tags : \[\]/.test(devlogCode));

check('the filter row is left alone when the tags did not arrive',
    () => {
        const fn = extractFn(devlogsJs, 'function buildFilterButtons(tags)');
        return /if \(!filterGroup \|\| !Array\.isArray\(tags\)\) return;/.test(fn);
    },
    'an empty filter row would be worse than a slightly stale one');


/* ================= 3. game-derived primary tags ======================= */

console.log('\nA primary tag per game:');

check('the button exists in the tag manager',
    () => /id="tags-from-games"/.test(extrasJs));
check('it sits in the Primary column',
    () => extrasJs.indexOf('id="tags-from-games"') > extrasJs.indexOf('id="new-primary-tag"') &&
          extrasJs.indexOf('id="tags-from-games"') < extrasJs.indexOf('id="secondary-tag-list"'));
check('it is a type="button"',
    () => /<button type="button"[^>]*id="tags-from-games"/.test(extrasJs),
    'a bare button inside the admin would submit a form');

// Run the real handler against a fake panel.
const handlerSrc = extrasJs.slice(
    extrasJs.indexOf('const fromGames = document.getElementById'),
    extrasJs.indexOf("panel.querySelectorAll('[data-tag-delete]')"));
check('the handler was found', () => handlerSrc.length > 0);

function runSeeder(games, tags) {
    let clicked = null;
    const alerts = [];
    const ctx = vm.createContext({
        data: { games, tags },
        document: {
            getElementById: (id) =>
                (id === 'tags-from-games'
                    ? { addEventListener: (_, fn) => { clicked = fn; } }
                    : null),
        },
        showAlert: (msg, kind) => alerts.push({ msg, kind }),
        renderTagManager: () => {},
        refreshPickers: () => {},
        Array, Math, String,
    });
    vm.runInContext(handlerSrc, ctx);
    let threw = null;
    try { clicked(); } catch (e) { threw = e.message; }
    return { tags: ctx.data.tags, alerts, threw };
}

const G = (titleEn) => ({ id: Math.random(), titleEn });

check('it adds one primary tag per game', () => {
    const r = runSeeder([G('Paper Crown'), G('Second Game')], []);
    return r.tags.length === 2 && r.tags.every((t) => t.kind === 'primary');
});

check('the tag takes the game title',
    () => runSeeder([G('Paper Crown')], []).tags[0].name === 'Paper Crown');

check('it skips a game that already has a tag', () => {
    const r = runSeeder([G('Paper Crown'), G('Second Game')],
        [{ id: 1, name: 'Paper Crown', kind: 'primary' }]);
    return r.tags.length === 2;
});

check('the match ignores case', () => {
    const r = runSeeder([G('Paper Crown')], [{ id: 1, name: 'paper crown', kind: 'primary' }]);
    return r.tags.length === 1;
}, 'two tags differing only in case are indistinguishable on a badge');

check('it also skips a name taken by a SECONDARY tag', () => {
    const r = runSeeder([G('Bug Fix')], [{ id: 1, name: 'Bug Fix', kind: 'secondary' }]);
    return r.tags.length === 1;
}, 'a devlog stores its tag by name, so a duplicate across kinds is ambiguous');

check('two games sharing a title only produce one tag', () => {
    const r = runSeeder([G('Untitled small project'), G('Untitled small project')], []);
    return r.tags.length === 1;
}, 'the two placeholder games currently share a title');

check('a game with no title is skipped', () => {
    const r = runSeeder([G('Paper Crown'), G(''), G('   ')], []);
    return r.tags.length === 1;
});

check('the title is trimmed',
    () => runSeeder([G('  Paper Crown  ')], []).tags[0].name === 'Paper Crown');

check('no games at all says so rather than doing nothing quietly', () => {
    const r = runSeeder([], []);
    return r.tags.length === 0 && r.alerts.some((a) => a.kind === 'error');
});

check('everything already tagged says so too', () => {
    const r = runSeeder([G('Paper Crown')], [{ id: 1, name: 'Paper Crown', kind: 'primary' }]);
    return r.alerts.some((a) => /already/i.test(a.msg));
});

check('a successful run tells her to publish', () => {
    // Asserts that it POINTS AT the publish button, not that it repeats
    // one exact label. The button was renamed on 14 Aug when the item
    // forms started publishing on their own press, and pinning the old
    // wording made a correct rename read as a regression.
    const r = runSeeder([G('Paper Crown')], []);
    return r.alerts.some((a) => /publish/i.test(a.msg));
});

check('ids do not collide with existing tags', () => {
    const r = runSeeder([G('New Game')], [{ id: 7, name: 'Old', kind: 'secondary' }]);
    return r.tags.every((t) => t.id) &&
           new Set(r.tags.map((t) => t.id)).size === r.tags.length;
});

check('ids do not collide with each other either', () => {
    const r = runSeeder([G('A'), G('B'), G('C')], []);
    return new Set(r.tags.map((t) => t.id)).size === 3;
}, 'the id is computed from the list, so it has to see each addition');

check('a missing games list does not throw', () => {
    const r = runSeeder(undefined, []);
    return r.threw === null;
});

check('the new tags are primary, teal, and general',
    () => {
        const t = runSeeder([G('Paper Crown')], []).tags[0];
        return t.kind === 'primary' && t.color === '#5DCCCA' && t.category === 'general';
    },
    'the same shape the manual Add button produces');


console.log(
    failures.length
        ? `\n${passes} passed, ${failures.length} FAILED: ${failures.join(', ')}`
        : `\nAll ${passes} checks passed.`);
process.exit(failures.length ? 1 : 0);
