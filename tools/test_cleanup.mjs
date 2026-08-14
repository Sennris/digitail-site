/**
 * The 14 August 2026 cleanup pass - the team's bug review.
 *
 *   node tools/test_cleanup.mjs
 *
 * No database, so no --experimental-sqlite needed.
 *
 * Where it can, this runs the REAL function out of the real file rather
 * than searching the file for a promising-looking string. Functions are
 * lifted out by BRACE MATCHING, not by slicing to an exact closing
 * string: a mutation that changes that string would otherwise crash the
 * suite instead of failing one check, and a crashed suite reports zero
 * failures and reads like a pass.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

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

/* ---------- lifting real code out of the real files ---------- */

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

/* ---------- a document stub that behaves like the real one ---------- */

// Deliberately not a convenient fake: textContent replaces the children,
// append takes several nodes, and a text node is a different kind of
// thing from an element. A stub that is easier than the browser proves
// something about the stub.
function makeDocument() {
    function node(kind, tag) {
        const el = {
            kind, tag, className: '', children: [], attrs: {}, listeners: 0,
            appendChild(child) { el.children.push(child); return child; },
            append(...kids) { kids.forEach((k) => el.children.push(k)); },
            addEventListener() { el.listeners += 1; },
            setAttribute(k, v) { el.attrs[k] = v; },
            getAttribute(k) { return el.attrs[k]; },
            querySelector(sel) {
                const want = sel.replace('.', '');
                let found = null;
                const walk = (n) => {
                    if (found) return;
                    if (n.className === want) { found = n; return; }
                    (n.children || []).forEach(walk);
                };
                el.children.forEach(walk);
                return found;
            },
            get text() {
                if (el.kind === 'text') return el.value;
                if (el.tag === 'br') return '\n';
                return el.children.map((c) => c.text).join('');
            },
        };
        Object.defineProperty(el, 'textContent', {
            get() { return el.text; },
            set(v) { el.children = [{ kind: 'text', value: String(v), children: [], get text() { return this.value; } }]; },
        });
        Object.defineProperty(el, 'href', {
            get() { return el.attrs.href; },
            set(v) { el.attrs.href = String(v); },
        });
        Object.defineProperty(el, 'rel', {
            get() { return el.attrs.rel; },
            set(v) { el.attrs.rel = String(v); },
        });
        return el;
    }
    return {
        createElement: (tag) => node('element', tag),
        createTextNode: (value) => ({ kind: 'text', value: String(value), children: [], get text() { return this.value; } }),
        createDocumentFragment: () => node('fragment', null),
        _node: node,
    };
}

function run(source, extras = {}) {
    const sandbox = { document: makeDocument(), URL, console, ...extras };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    return sandbox;
}

const anchors = (el) => {
    const out = [];
    const walk = (n) => {
        if (n.tag === 'a') out.push(n);
        (n.children || []).forEach(walk);
    };
    walk(el);
    return out;
};


/* ======================================================================
   1. The nav link that vanished on hover
   ====================================================================== */

console.log('\nNav link on the page you are already on');

const core = read('public/assets/css/core.css').replace(/\/\*[\s\S]*?\*\//g, '');

check('hovering the current page link does not leave juniper on juniper', () => {
    const rule = core.match(/\.site-nav a\.nav-link\[aria-current="page"\]:hover\s*\{[^}]*\}/);
    if (!rule) return 'no rule covers the current link while it is hovered';
    return /--long-black/.test(rule[0])
        || 'the rule is there but does not change the text colour';
});

check('the fix out-specifies the plain hover rule rather than relying on order', () => {
    // Both of the old rules are (0,3,1). Adding the attribute AND the
    // pseudo-class puts the new one at (0,4,1), so moving either of the
    // originals cannot bring the bug back.
    const fixAt = core.indexOf('.site-nav a.nav-link[aria-current="page"]:hover');
    const hoverAt = core.indexOf('.site-nav a.nav-link:hover');
    if (fixAt === -1 || hoverAt === -1) return 'one of the two rules is missing';
    return /\[aria-current="page"\]:hover/.test(core.slice(fixAt, fixAt + 60))
        || 'the selector does not carry both the attribute and the hover';
});

check('a keyboard focus is left alone', () => {
    // Focus does not paint the juniper background, so forcing black text
    // there would make the word invisible against the dark bar instead.
    const rule = core.match(/\.site-nav a\.nav-link\[aria-current="page"\]:hover\s*,?[^{]*\{/);
    return (rule && !/focus/.test(rule[0]))
        || 'the fix reaches focus as well as hover';
});


/* ======================================================================
   2. The language is remembered from page to page
   ====================================================================== */

console.log('\nRemembering the language');

const persist = read('public/assets/js/lang-persist.js');

// A fake body, a fake store and a fake observer, so the real script can
// be run and then poked the way a visitor would poke it.
function runPersist({ saved = null, startClass = 'lang-en', storageThrows = false } = {}) {
    const store = { value: saved, reads: 0, writes: 0 };
    const classes = new Set(startClass.split(' ').filter(Boolean));
    let observerCb = null;

    const body = {
        classList: {
            add: (c) => classes.add(c),
            remove: (...cs) => cs.forEach((c) => classes.delete(c)),
            contains: (c) => classes.has(c),
        },
    };
    const html = { attr: null, setAttribute: (k, v) => { if (k === 'lang') html.attr = v; } };

    const sandbox = {
        document: { body, documentElement: html },
        localStorage: {
            getItem(k) {
                store.reads += 1;
                if (storageThrows) throw new Error('refused');
                return k === 'digitail-lang' ? store.value : null;
            },
            setItem(k, v) {
                store.writes += 1;
                if (storageThrows) throw new Error('refused');
                if (k === 'digitail-lang') store.value = v;
            },
        },
        MutationObserver: class {
            constructor(cb) { observerCb = cb; }
            observe() { /* nothing to schedule in a stub */ }
            disconnect() { /* nothing to disconnect */ }
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(persist, sandbox);

    return {
        store,
        html,
        classes,
        lang: () => (classes.has('lang-mi') ? 'mi' : 'en'),
        set(lang) {
            classes.delete('lang-en');
            classes.delete('lang-mi');
            classes.add('lang-' + lang);
            if (observerCb) observerCb([], { disconnect() {} });
        },
    };
}

check('a page opens in the language you last chose', () => {
    const r = runPersist({ saved: 'mi' });
    return r.lang() === 'mi' || `page opened in ${r.lang()}`;
});

check('nothing is forced on a first-time visitor', () => {
    const r = runPersist({ saved: null });
    return r.lang() === 'en' || 'a visitor with no stored choice was moved off the page default';
});

check('junk in storage is ignored rather than applied', () => {
    // Asking "is the page in English" would be answered by the page
    // default whatever happened, so this asks what classes are on the
    // body: a stored value of "pirate" must not become lang-pirate.
    const r = runPersist({ saved: 'pirate' });
    const classes = [...r.classes].sort().join(' ');
    return classes === 'lang-en' || `body ended up as ${classes}`;
});

check('switching language writes the choice down', () => {
    const r = runPersist({ saved: null });
    r.set('mi');
    return r.store.value === 'mi' || `stored ${JSON.stringify(r.store.value)}`;
});

check('switching back writes that down too', () => {
    const r = runPersist({ saved: 'mi' });
    r.set('en');
    return r.store.value === 'en' || `stored ${JSON.stringify(r.store.value)}`;
});

check('the html lang attribute follows the stored choice', () => {
    // Screen readers read this, not the body class.
    const r = runPersist({ saved: 'mi' });
    return r.html.attr === 'mi' || `html lang was ${JSON.stringify(r.html.attr)}`;
});

check('a browser that refuses storage does not take the page down', () => {
    const r = runPersist({ saved: null, storageThrows: true });
    r.set('mi');
    return r.lang() === 'mi' || 'the page broke when storage was unavailable';
});

check('every public page loads it, and from the head', () => {
    const pages = readdirSync(join(ROOT, 'public')).filter((f) => f.endsWith('.html'));
    const bad = pages.filter((f) => {
        const html = read('public/' + f);
        const at = html.indexOf('lang-persist.js');
        const head = html.indexOf('</head>');
        return at === -1 || head === -1 || at > head;
    });
    return bad.length === 0
        || `${bad.join(', ')} would show the wrong language first and swap it`;
});

check('it does not depend on any page\'s own toggle', () => (
    !/lang-toggle-btn/.test(persist)
        || 'it reaches for a button, so a page without one loses the setting'
));


/* ======================================================================
   3. A te reo heading saved on its own
   ====================================================================== */

console.log('\nOne language filled in, not the other');

const gamesSrc = read('public/assets/js/pages/games.js');
const renderHeader = extract(gamesSrc, 'function renderHeader');

function headerWith(page) {
    const spans = { en: { textContent: '' }, mi: { textContent: '' } };
    const title = { querySelector: (s) => (s === '.en' ? spans.en : spans.mi) };
    const introEn = { textContent: '' };
    const introMi = { textContent: '' };
    const doc = {
        getElementById: (id) => ({
            'games-title': title,
            'games-intro-en': introEn,
            'games-intro-mi': introMi,
        }[id] || null),
        title: '',
    };
    const sandbox = { document: doc };
    vm.createContext(sandbox);
    vm.runInContext(`${renderHeader}\nrenderHeader(${JSON.stringify(page)});`, sandbox);
    return { en: spans.en.textContent, mi: spans.mi.textContent, introEn: introEn.textContent, introMi: introMi.textContent };
}

check('a te reo heading with no English one still reaches the page', () => {
    const r = headerWith({ titleMi: 'A Matou Kemu Hou' });
    return r.mi === 'A Matou Kemu Hou'
        || `the te reo heading came out as ${JSON.stringify(r.mi)}`;
});

check('and it stands in for the empty English one', () => {
    const r = headerWith({ titleMi: 'A Matou Kemu Hou' });
    return r.en === 'A Matou Kemu Hou'
        || 'the English span kept whatever was baked into games.html';
});

check('an English heading with no te reo one still works', () => {
    const r = headerWith({ titleEn: 'Our games' });
    return (r.en === 'Our games' && r.mi === 'Our games')
        || `en ${JSON.stringify(r.en)} / mi ${JSON.stringify(r.mi)}`;
});

check('both filled in stay as typed', () => {
    const r = headerWith({ titleEn: 'Our games', titleMi: 'A Matou Kemu' });
    return (r.en === 'Our games' && r.mi === 'A Matou Kemu')
        || 'one language overwrote the other';
});

check('a te reo intro with no English one reaches the page', () => {
    const r = headerWith({ introMi: 'He korero poto' });
    return (r.introEn === 'He korero poto' && r.introMi === 'He korero poto')
        || `en ${JSON.stringify(r.introEn)} / mi ${JSON.stringify(r.introMi)}`;
});

check('nothing saved leaves the page exactly as it was', () => {
    const r = headerWith({});
    return (r.en === '' && r.mi === '' && r.introEn === '' && r.introMi === '')
        || 'an empty saved heading wrote over the page';
});

// Searching the file for "(en || mi)" was answered by the return line at
// the bottom of the same function, so the check stayed green with the
// rule gutted. Run it instead.
check('the game page fills the English span from te reo when English is blank', () => {
    const setPair = extract(read('public/assets/js/pages/game.js'), 'function setPair');
    const enEl = { textContent: '' };
    const miEl = { textContent: '' };
    const sandbox = { document: { getElementById: (id) => (id === 'a' ? enEl : miEl) } };
    vm.createContext(sandbox);
    vm.runInContext(`${setPair}\nsetPair('a', 'b', '', 'Kua tae mai');`, sandbox);
    return (enEl.textContent === 'Kua tae mai' && miEl.textContent === 'Kua tae mai')
        || `en ${JSON.stringify(enEl.textContent)} / mi ${JSON.stringify(miEl.textContent)}`;
});

check('the press kit heading does the same', () => {
    const renderPress = extract(read('public/assets/js/pages/press.js'), 'function renderHeader');
    const spans = { en: { textContent: '' }, mi: { textContent: '' } };
    const heading = { querySelector: (s) => (s === '.en' ? spans.en : spans.mi) };
    const sandbox = {
        document: { getElementById: (id) => (id === 'press-heading' ? heading : null) },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${renderPress}\nrenderHeader({ headingMi: 'He pouaka panui' });`, sandbox);
    return (spans.en.textContent === 'He pouaka panui' && spans.mi.textContent === 'He pouaka panui')
        || `en ${JSON.stringify(spans.en.textContent)} / mi ${JSON.stringify(spans.mi.textContent)}`;
});


/* ======================================================================
   4. Links on the press kit, and line breaks in the credits
   ====================================================================== */

console.log('\nPress kit');

const pressSrc = read('public/assets/js/pages/press.js');
const linkParts = [
    extract(pressSrc, 'function safeUrl'),
    extract(pressSrc, 'function looksLikeEmail'),
    extract(pressSrc, 'function linkedValue'),
].join('\n');

function linked(value) {
    const sandbox = run(`${linkParts}\nvar out = linkedValue(${JSON.stringify(value)});`);
    return sandbox.out;
}

check('a website address becomes a link', () => {
    const n = linked('https://www.digitailstudios.com');
    return (n.tag === 'a' && n.attrs.href === 'https://www.digitailstudios.com/')
        || `came out as ${n.tag || n.kind}`;
});

check('the link still reads as what was typed', () => {
    const n = linked('https://www.digitailstudios.com');
    return n.text === 'https://www.digitailstudios.com'
        || `the visible text changed to ${JSON.stringify(n.text)}`;
});

check('a press contact email becomes a mailto link', () => {
    const n = linked('press@digitailstudios.com');
    return (n.tag === 'a' && n.attrs.href === 'mailto:press@digitailstudios.com')
        || `came out as ${n.tag || n.kind} / ${n.attrs && n.attrs.href}`;
});

check('a plain sentence is left as plain text', () => {
    const n = linked('press contact email');
    return (n.kind === 'text' && n.value === 'press contact email')
        || 'ordinary text was turned into a link';
});

check('a javascript: address is refused', () => {
    // The URL parser decides, not a regular expression.
    const n = linked('javascript:alert(1)');
    return n.kind === 'text' || 'a javascript: address was made clickable';
});

check('a bare domain with no scheme stays text', () => {
    const n = linked('digitailstudios.com');
    return n.kind === 'text' || 'something that is not a URL was linked anyway';
});

check('the factsheet uses it, so the website row is clickable', () => {
    const at = pressSrc.indexOf('function factRow');
    return /linkedValue\(value\)/.test(pressSrc.slice(at, at + 400))
        || 'factRow still writes the value as plain text';
});

check('a link typed into the Source box is clickable too', () => {
    const at = pressSrc.indexOf('press-list__meta');
    const slice = pressSrc.slice(at - 400, at + 500);
    return /linkedValue\(bit\)/.test(slice)
        || 'the source line is still joined into one plain string';
});

check('a new link on the factsheet is styled, not browser blue', () => {
    // core.css has no global anchor rule, so an unstyled link falls
    // through to blue and purple.
    const css = read('public/assets/css/pages/press.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/\.press-factsheet a[^{]*\{[^}]*\}/);
    return (rule && /--frozen-juniper/.test(rule[0]))
        || 'nothing gives the factsheet link the studio colour';
});

const proseParts = [
    extract(pressSrc, 'function linesInto'),
    extract(pressSrc, 'function paraPair'),
].join('\n');

function paragraph(en, mi) {
    const sandbox = run(`${proseParts}\nvar out = paraPair(${JSON.stringify(en)}, ${JSON.stringify(mi || '')});`);
    return sandbox.out;
}

check('one Enter in the credits is a line break', () => {
    const p = paragraph('Robson - programming\nCaitlin - everything else');
    const en = p.children[0];
    return en.children.some((c) => c.tag === 'br')
        || 'the two names ran together on one line';
});

check('the names survive either side of the break', () => {
    const p = paragraph('Robson - programming\nCaitlin - everything else');
    return p.children[0].text === 'Robson - programming\nCaitlin - everything else'
        || `came out as ${JSON.stringify(p.children[0].text)}`;
});

check('three lines get two breaks, not one and not three', () => {
    const p = paragraph('one\ntwo\nthree');
    const brs = p.children[0].children.filter((c) => c.tag === 'br').length;
    return brs === 2 || `${brs} breaks`;
});

check('a line with no breaks in it gains none', () => {
    const p = paragraph('Just the one line');
    return p.children[0].children.every((c) => c.tag !== 'br')
        || 'a break was added where there was no newline';
});

check('the te reo half gets its own line breaks', () => {
    const p = paragraph('one\ntwo', 'tahi\nrua');
    const mi = p.children[1];
    return (mi.className === 'mi' && mi.text === 'tahi\nrua')
        || `te reo came out as ${JSON.stringify(mi.text)}`;
});

check('a blank te reo half falls back to the English one, breaks and all', () => {
    const p = paragraph('one\ntwo', '');
    return p.children[1].text === 'one\ntwo'
        || `te reo fallback came out as ${JSON.stringify(p.children[1].text)}`;
});

check('blank lines still make separate paragraphs', () => {
    const at = pressSrc.indexOf('function prose');
    const body = pressSrc.slice(at, at + 700);
    return /split\(\/\\n\\s\*\\n\/\)/.test(body) && /paraPair\(/.test(body)
        || 'prose no longer splits on blank lines, or no longer keeps line breaks';
});


/* ======================================================================
   5. Two admin screens that were telling the truth badly
   ====================================================================== */

console.log('\nAdmin wording');

const adminGames = read('public/admin/admin-games.js');
const holding = extract(adminGames, 'function holdingState');

function holdingFor(count) {
    const features = Array.from({ length: count }, () => ({}));
    const sandbox = { };
    vm.createContext(sandbox);
    vm.runInContext(`${holding}\nvar out = holdingState({ features: ${JSON.stringify(features)} });`, sandbox);
    return sandbox.out;
}

check('with no sections, the holding message says it is showing', () => (
    /showing on the game page now/i.test(holdingFor(0))
        || `said: ${holdingFor(0)}`
));

check('with sections, it says plainly that it is not showing', () => (
    /not showing right now/i.test(holdingFor(2))
        || `said: ${holdingFor(2)}`
));

check('it counts the sections rather than guessing', () => (
    /\b3\b/.test(holdingFor(3)) || `said: ${holdingFor(3)}`
));

check('one section reads as one section', () => (
    /1 section\b/.test(holdingFor(1)) && !/1 sections/.test(holdingFor(1))
        || `said: ${holdingFor(1)}`
));

check('the game editor actually uses it', () => (
    /\$\{holdingState\(g\)\}/.test(adminGames)
        || 'the field still carries the old fixed sentence'
));

const adminScript = read('public/admin/admin-script.js');

check('Display Date says it is the one visitors read', () => {
    const at = adminScript.indexOf('id="devlog-display-date"');
    const slice = adminScript.slice(at, at + 400);
    return /visitors read/i.test(slice) || 'nothing explains what the display date is for';
});

check('Sort Date says it is the one that orders the page', () => {
    const at = adminScript.indexOf('id="devlog-sort-date"');
    const slice = adminScript.slice(at, at + 400);
    return /order/i.test(slice) || 'nothing explains what the sort date is for';
});

check('the two notes are different sentences', () => {
    const one = adminScript.slice(adminScript.indexOf('id="devlog-display-date"'), adminScript.indexOf('id="devlog-sort-date"'));
    const two = adminScript.slice(adminScript.indexOf('id="devlog-sort-date"'), adminScript.indexOf('id="devlog-sort-date"') + 400);
    const grab = (s) => (s.match(/helper-text">([\s\S]*?)<\/div>/) || [])[1] || '';
    return (grab(one) && grab(two) && grab(one) !== grab(two))
        || 'both fields carry the same explanation, which explains nothing';
});


console.log(`\n${'='.repeat(46)}`);
console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
console.log('='.repeat(46));
process.exit(fail === 0 ? 0 : 1);
