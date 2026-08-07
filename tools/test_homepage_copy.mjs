/**
 * Homepage section copy.
 *
 *   node tools/test_homepage_copy.mjs
 *
 * The dangerous failure here is not "the text does not change". It is a blank
 * admin field publishing an empty string over live copy - which has already
 * happened once on this site, to the hero taglines and the announcement. Most
 * of these checks are about that.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(label, ok, detail = '') {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
    if (!ok) failures.push(label);
}

const indexHtml = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
const indexJs   = readFileSync(join(ROOT, 'public/assets/js/pages/index.js'), 'utf8');
const adminJs   = readFileSync(join(ROOT, 'public/admin/admin-homepage-sections.js'), 'utf8');
const adminHtml = readFileSync(join(ROOT, 'public/admin/index.html'), 'utf8');
const cmCss     = readFileSync(join(ROOT, 'public/assets/css/pages/content-manager.css'), 'utf8');


/* ---- 1. every admin field has somewhere on the page to land ---------- */

console.log('Admin fields line up with the page:');

// FIELDS rows are [group, name, label, type, placeholder]; two-item rows are
// sub-headings. Pull them straight out of the source.
const fieldRows = [...adminJs.matchAll(
    /^\s*\['(\w+)', '(\w+)', '[^']*',\s*'(text|textarea)'/gm)]
    .map((m) => ({ group: m[1], field: m[2] }));

check('the field list was parsed', fieldRows.length > 25, `${fieldRows.length} fields`);

const orphans = fieldRows.filter(({ group, field }) => {
    const lang = /Mi$/.test(field) ? 'mi' : 'en';
    const base = field.replace(/(En|Mi)$/, '');
    return !indexHtml.includes(`id="hs-${group}-${base}-${lang}"`);
});
check('every admin field has a matching id on the homepage',
    orphans.length === 0,
    orphans.map((o) => `${o.group}.${o.field}`).join(', ') || '');

// And the reverse: an id with no field behind it is dead markup.
const pageIds = [...indexHtml.matchAll(/id="hs-([\w-]+)"/g)].map((m) => m[1]);
const unreachable = pageIds.filter((id) => {
    const parts = id.split('-');
    const lang = parts.pop();
    const group = parts.shift();
    const base = parts.join('');
    const suffix = lang === 'mi' ? 'Mi' : 'En';
    return !fieldRows.some((f) =>
        f.group === group && f.field.toLowerCase() === (base + suffix).toLowerCase());
});
check('every id on the homepage is reachable from the admin',
    unreachable.length === 0, unreachable.join(', ') || '');

check('the paragraph she asked about is one of them',
    indexHtml.includes('id="hs-game-body-en"') &&
    indexHtml.includes('We are currently hard at work'));


/* ---- 2. a blank field must never wipe live copy ---------------------- */

console.log('\nBlank fields leave the page alone:');

// Run the real write() out of index.js against a tiny DOM.
// Brace-matched, not sliced to an exact closing string: a mutation that
// changed that string broke the extraction and crashed the whole suite
// rather than failing one check.
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
const writeSrc = extractFn(indexJs, 'function write(el, text)');
check('the renderer was found in index.js', writeSrc.length > 0);

function makeEl(existing) {
    return {
        _text: existing,
        replaceChildren(frag) { this._text = frag._text; },
        get text() { return this._text; },
    };
}
const ctx = vm.createContext({
    document: {
        createDocumentFragment: () => ({
            _text: '',
            appendChild(n) { this._text += n._text; },
        }),
        // Void elements like <br> never get textContent set, so they need a
        // default here - with _text starting empty, a real line break and a
        // missing one looked identical and the check could not tell them apart.
        createElement: (tag) => ({
            _text: `<${tag}>`,
            set textContent(v) { this._text = `<${tag}>${v}</${tag}>`; },
        }),
        createTextNode: (v) => ({ _text: v }),
    },
});
vm.runInContext(writeSrc + '\nglobalThis.write = write;', ctx);
const write = ctx.write;

// Each of these runs the real renderer, which a mutation can make throw.
// A throw must fail its own check, not abandon every check after it.
function wrote(existing, text) {
    const el = makeEl(existing);
    try { write(el, text); } catch (e) { return `THREW: ${e.message}`; }
    return el.text;
}

check('an empty string leaves the existing text untouched',
    wrote('LIVE COPY', '') === 'LIVE COPY', `got ${JSON.stringify(wrote('LIVE COPY', ''))}`);
check('an undefined field leaves the existing text untouched',
    wrote('LIVE COPY', undefined) === 'LIVE COPY');
check('a null field leaves the existing text untouched',
    wrote('LIVE COPY', null) === 'LIVE COPY');
check('a missing element does not throw', (() => {
    try { write(null, 'anything'); return true; } catch { return false; }
})());
check('a filled field does replace the text',
    wrote('', 'Replaced') === 'Replaced');


/* ---- 3. formatting and safety ---------------------------------------- */

console.log('\nFormatting:');

check('a newline becomes a line break',
    wrote('', 'One\nTwo') === 'One<br>Two', `got ${JSON.stringify(wrote('', 'One\nTwo'))}`);

check('asterisks become emphasis',
    wrote('', 'gives a *fox*.') === 'gives a <em>fox</em>.', `got ${JSON.stringify(wrote('', 'gives a *fox*.'))}`);

check('angle brackets and quotes are text, not markup',
    wrote('', 'a < b & c "d"') === 'a < b & c "d"');
check('the renderer never assigns innerHTML',
    !/innerHTML/.test(writeSrc),
    'this text is hand-typed, so pasting it into markup would break the page');


/* ---- 4. the admin module follows the house rules ---------------------- */

console.log('\nThe admin module:');

const code = adminJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('it never reads window.data', !/window\s*\.\s*data/.test(code));
check('it reaches the store through a typeof check',
    /typeof\s+data\s*===\s*['"]undefined['"]/.test(code));
check('the form is built once, not on every keystroke',
    /dataset\.built === '1'/.test(code),
    'rebuilding while she types would move the caret');
check('its wrapper is installed at parse time',
    /installWrapper\(\);\n\n    function boot/.test(adminJs),
    'installing inside boot() loses the race with api-adapter');
check('it writes into data.homepage.sections',
    /d\.homepage\.sections/.test(code),
    'homepage is a settings blob, so this needs no migration');

check('the Page copy subtab exists',
    /switchHomepageSub\('copy'/.test(adminHtml) && /id="hp-sections-panel"/.test(adminHtml));
check('the subtab is hidden until selected',
    /#homepage-tab #hp-sections-panel \{ display: none; \}/.test(cmCss) &&
    /\[data-sub="copy"\]\s+#hp-sections-panel \{ display: block; \}/.test(cmCss));
check('the module is loaded by the admin page',
    /admin-homepage-sections\.js/.test(adminHtml));

// collectHomepageInfo mutates keys rather than replacing data.homepage; if
// that ever changed to a wholesale assignment, sections would be dropped on
// every save.
const adminScript = readFileSync(join(ROOT, 'public/admin/admin-script.js'), 'utf8');
const collect = adminScript.slice(
    adminScript.indexOf('function collectHomepageInfo'),
    adminScript.indexOf('function collectHomepageInfo') + 2000);
check('collectHomepageInfo does not replace data.homepage wholesale',
    !/data\.homepage\s*=\s*\{[^}]/.test(collect),
    'a wholesale assignment would drop the sections key on every save');


console.log(
    failures.length
        ? `\n${failures.length} FAILED: ${failures.join(', ')}`
        : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
