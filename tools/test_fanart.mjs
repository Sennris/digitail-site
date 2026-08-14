/**
 * Fan art: submissions, permission, and keeping strangers' text safe.
 *
 *   node --experimental-sqlite tools/test_fanart.mjs
 *
 * THE DANGEROUS FAILURES HERE ARE NOT "the gallery looks wrong". They are:
 *
 *   - a submission reaching the public reader, because submissions carry
 *     an email address and a consent record and the gallery does not;
 *   - a `javascript:` link landing in an href on a public page;
 *   - a stranger's name being interpolated into markup, which is exactly
 *     what foxes.js and devlogs.js still do with trusted content and what
 *     this page must never do with untrusted content;
 *   - the consent record storing the BROWSER's wording instead of the
 *     server's, which makes it a record of nothing;
 *   - the two copies of the consent sentence (fanart.html shows it,
 *     src/fanart.js stores it) drifting apart, so somebody agrees to one
 *     thing and a different thing is filed against their name;
 *   - a credit being editable after publication, so the name on somebody
 *     else's artwork can quietly change.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const F = await import(pathToFileURL(join(ROOT, 'src', 'fanart.js')).href);

const pageHtml = readFileSync(join(ROOT, 'public', 'fanart.html'), 'utf8');
const pageJs = readFileSync(join(ROOT, 'public', 'assets', 'js', 'pages', 'fanart.js'), 'utf8');
const indexJs = readFileSync(join(ROOT, 'src', 'index.js'), 'utf8');
const writersJs = readFileSync(join(ROOT, 'src', 'writers.js'), 'utf8');
const adminJs = readFileSync(join(ROOT, 'public', 'admin', 'admin-fanart.js'), 'utf8');
const privacyHtml = readFileSync(join(ROOT, 'public', 'privacy.html'), 'utf8');

const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const stripHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

const pageJsCode = stripJs(pageJs);
const indexCode = stripJs(indexJs);
const writersCode = stripJs(writersJs);
const adminCode = stripJs(adminJs);
const pageHtmlCode = stripHtml(pageHtml);

let pass = 0;
let fail = 0;

async function check(name, fn) {
    try {
        const r = await fn();
        if (r === true) { pass += 1; console.log(`  PASS  ${name}`); }
        else { fail += 1; console.log(`  FAIL  ${name}${r ? ` - ${r}` : ''}`); }
    } catch (e) {
        fail += 1;
        console.log(`  FAIL  ${name} - threw: ${e.message}`);
    }
}

function makeDb() {
    const sqlite = new DatabaseSync(':memory:');
    for (const f of readdirSync(join(ROOT, 'migrations')).sort()) {
        if (f.endsWith('.sql')) sqlite.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
    }
    const wrap = (sql) => ({
        bind: (...args) => ({
            first: async () => sqlite.prepare(sql).get(...args) ?? null,
            all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
            run: async () => {
                const r = sqlite.prepare(sql).run(...args);
                return { meta: { last_row_id: Number(r.lastInsertRowid) } };
            },
        }),
        first: async () => sqlite.prepare(sql).get() ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all() }),
        run: async () => sqlite.prepare(sql).run(),
    });
    return { prepare: wrap, _raw: sqlite };
}

const okTurnstile = async () => ({ ok: true });
const badTurnstile = async () => ({ ok: false, reason: 'invalid-input-response' });

const post = (body) => new Request('https://x/api/fanart/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

const GOOD = {
    artistName: 'Kea',
    artUrl: 'https://example.com/art.png',
    consent: true,
    'cf-turnstile-response': 'tok',
};

async function submit(env, body, turnstile = okTurnstile) {
    const res = await F.handleFanArtSubmit(post(body), env, turnstile);
    return { status: res.status, body: await res.json() };
}

console.log('\n  Links - these end up in an href on a public page\n');

await check('an ordinary https link is kept', async () => {
    return F.cleanUrl('https://example.com/a') === 'https://example.com/a';
});

await check('http is allowed too', async () => {
    return typeof F.cleanUrl('http://example.com/a') === 'string';
});

await check('a javascript: link is REFUSED, not blanked', async () => {
    // null means "that was not a link". Returning '' would silently drop
    // it and let the submission through as if they had left it empty.
    return F.cleanUrl('javascript:alert(1)') === null;
});

await check('an uppercase scheme is accepted, not refused', async () => {
    // The harness caught every other URL test proving only that bad links
    // are refused - which a crude string comparison also does. THIS is
    // where a real parser and a string test disagree: the parser
    // normalises the scheme before reading it, so a submitter with caps
    // lock on still gets through.
    const out = F.cleanUrl('HTTPS://EXAMPLE.COM/a');
    return typeof out === 'string' && out.startsWith('https://')
        || `an uppercase https link was refused (${out})`;
});

await check('case and whitespace tricks do not get a scheme past it', async () => {
    // A regex on the string is what these defeat. The URL parser
    // normalises before the protocol is read, so they cannot.
    return F.cleanUrl('JaVaScRiPt:alert(1)') === null
        && F.cleanUrl('  javascript:alert(1)') === null
        && F.cleanUrl('java\tscript:alert(1)') === null;
});

await check('data: and file: are refused', async () => {
    return F.cleanUrl('data:text/html,<script>x</script>') === null
        && F.cleanUrl('file:///etc/passwd') === null;
});

await check('empty is empty, not an error', async () => {
    return F.cleanUrl('') === '' && F.cleanUrl(undefined) === '';
});

console.log('\n  Text from strangers\n');

await check('newlines in a name are flattened, not stored', async () => {
    return F.cleanText('a\nb\tc', 80) === 'a b c';
});

await check('an over-long name is cut rather than refused', async () => {
    return F.cleanText('x'.repeat(500), 80).length === 80;
});

await check('a non-string is empty, never "undefined"', async () => {
    return F.cleanText(undefined, 80) === '' && F.cleanText({}, 80) === '';
});

console.log('\n  Submitting\n');

await check('a good submission is stored', async () => {
    const db = makeDb();
    const r = await submit({ DB: db }, GOOD);
    const row = await db.prepare('SELECT * FROM fan_art_submissions WHERE id = 1').first();
    return r.body.ok === true && row.artist_name === 'Kea' && row.status === 'new';
});

await check('a failed Turnstile check stops it', async () => {
    const db = makeDb();
    const r = await submit({ DB: db }, GOOD, badTurnstile);
    const row = await db.prepare('SELECT COUNT(*) AS n FROM fan_art_submissions').first();
    return r.status === 403 && row.n === 0;
});

await check('THE PERMISSION TICK IS CHECKED ON THE SERVER', async () => {
    // A form that only validates in the browser has no consent record,
    // it has a habit.
    const db = makeDb();
    const r = await submit({ DB: db }, { ...GOOD, consent: false });
    const row = await db.prepare('SELECT COUNT(*) AS n FROM fan_art_submissions').first();
    return r.status === 400 && row.n === 0;
});

await check('a truthy-but-not-true consent value does not count', async () => {
    const db = makeDb();
    const a = await submit({ DB: db }, { ...GOOD, consent: 'yes' });
    const b = await submit({ DB: db }, { ...GOOD, consent: 1 });
    const row = await db.prepare('SELECT COUNT(*) AS n FROM fan_art_submissions').first();
    return a.status === 400 && b.status === 400 && row.n === 0;
});

await check('THE STORED CONSENT WORDING IS THE SERVER\'S, NOT THE BROWSER\'S', async () => {
    const db = makeDb();
    await submit({ DB: db }, { ...GOOD, consentText: 'I agree to absolutely anything' });
    const row = await db.prepare('SELECT consent_text FROM fan_art_submissions WHERE id = 1').first();
    return row.consent_text === F.CONSENT_TEXT
        || 'the browser supplied the consent record';
});

await check('the consent wording on the page matches the one on the server', async () => {
    // Two copies of one sentence. If they drift, somebody agrees to one
    // thing and a different thing is filed against their name.
    const squash = (s) => s.replace(/\s+/g, ' ').trim();
    return squash(pageHtmlCode).includes(squash(F.CONSENT_TEXT))
        || 'fanart.html and src/fanart.js disagree about the permission wording';
});

await check('a submission with no name is refused', async () => {
    const db = makeDb();
    const r = await submit({ DB: db }, { ...GOOD, artistName: '   ' });
    return r.status === 400;
});

await check('a submission with no art link is refused', async () => {
    const db = makeDb();
    const r = await submit({ DB: db }, { ...GOOD, artUrl: '' });
    return r.status === 400;
});

await check('a javascript: art link is refused at the door', async () => {
    const db = makeDb();
    const r = await submit({ DB: db }, { ...GOOD, artUrl: 'javascript:alert(1)' });
    const row = await db.prepare('SELECT COUNT(*) AS n FROM fan_art_submissions').first();
    // The MESSAGE matters, not just the refusal: a malformed link and a
    // missing link are different problems and a person fixing one needs
    // to be told which they have. Both paths refuse, so asserting only
    // the status left the null check untested.
    return r.status === 400 && row.n === 0
        && /web address/.test(r.body.error)
        || `wrong reason given: ${r.body.error}`;
});

await check('a bad email is refused rather than quietly dropped', async () => {
    const db = makeDb();
    const r = await submit({ DB: db }, { ...GOOD, contactEmail: 'not-an-email' });
    return r.status === 400;
});

await check('no email at all is fine - it is optional', async () => {
    const db = makeDb();
    const r = await submit({ DB: db }, { ...GOOD, contactEmail: '' });
    return r.body.ok === true;
});

await check('NO IP ADDRESS IS STORED ANYWHERE', async () => {
    const db = makeDb();
    await submit({ DB: db }, GOOD);
    const cols = db._raw.prepare('PRAGMA table_info(fan_art_submissions)').all().map((c) => c.name);
    return !cols.some((c) => /ip|address/i.test(c))
        || `columns look like they hold an IP: ${cols.join(', ')}`;
});

console.log('\n  Publishing\n');

async function seeded() {
    const db = makeDb();
    await submit({ DB: db }, { ...GOOD, creditLink: 'https://example.com/kea', title: 'Fox at dusk' });
    return db;
}

await check('publishing carries the credit across untouched', async () => {
    const db = await seeded();
    const res = await F.handleFanArtPublish(new Request('https://x', {
        method: 'POST',
        // artistName and creditLink are sent DELIBERATELY and must be
        // ignored. Without them in the payload, a handler that happily
        // accepts a caller-supplied credit looks identical to one that
        // does not - which is what the harness found.
        body: JSON.stringify({
            submissionId: 1, image: '/media/a.webp', altText: 'A fox',
            artistName: 'Somebody Else', creditLink: 'https://evil.example/',
        }),
    }), { DB: db });
    const row = await db.prepare('SELECT * FROM fan_art WHERE id = 1').first();
    return (await res.json()).ok === true
        && row.artist_name === 'Kea'
        && row.credit_link === 'https://example.com/kea';
});

await check('publishing marks the submission published', async () => {
    const db = await seeded();
    await F.handleFanArtPublish(new Request('https://x', {
        method: 'POST', body: JSON.stringify({ submissionId: 1, image: '/media/a.webp' }),
    }), { DB: db });
    const row = await db.prepare('SELECT status FROM fan_art_submissions WHERE id = 1').first();
    return row.status === 'published';
});

await check('publishing without an image is refused', async () => {
    const db = await seeded();
    const res = await F.handleFanArtPublish(new Request('https://x', {
        method: 'POST', body: JSON.stringify({ submissionId: 1, image: '' }),
    }), { DB: db });
    return res.status === 400;
});

await check('alt text is never left blank', async () => {
    // A gallery with no alt text is a gallery half the point of which is
    // missing. If the team forgets, the artist's name is better than ''.
    const db = await seeded();
    await F.handleFanArtPublish(new Request('https://x', {
        method: 'POST', body: JSON.stringify({ submissionId: 1, image: '/media/a.webp' }),
    }), { DB: db });
    const row = await db.prepare('SELECT alt_text FROM fan_art WHERE id = 1').first();
    return row.alt_text.length > 0;
});

await check('the permission trail is recorded on the published piece', async () => {
    const db = await seeded();
    await F.handleFanArtPublish(new Request('https://x', {
        method: 'POST', body: JSON.stringify({ submissionId: 1, image: '/media/a.webp' }),
    }), { DB: db });
    const row = await db.prepare('SELECT permission_note, submission_id FROM fan_art WHERE id = 1').first();
    return row.submission_id === 1 && /permission ticked/.test(row.permission_note);
});

console.log('\n  What the public can and cannot reach\n');

await check('THE PUBLIC READER CANNOT SEE THE SUBMISSIONS TABLE', async () => {
    // The whole reason these are two tables. Scoped to getFanArt so an
    // unrelated mention of the table elsewhere cannot answer for it.
    const fn = indexCode.slice(indexCode.indexOf('async function getFanArt'));
    const body = fn.slice(0, fn.indexOf('const READERS'));
    return !body.includes('fan_art_submissions')
        || 'getFanArt touches the submissions table';
});

await check('the public reader does not hand out the permission note', async () => {
    const fn = indexCode.slice(indexCode.indexOf('async function getFanArt'));
    const body = fn.slice(0, fn.indexOf('const READERS'));
    return !body.includes('permission_note');
});

await check('the public reader only returns enabled pieces', async () => {
    const fn = indexCode.slice(indexCode.indexOf('async function getFanArt'));
    const body = fn.slice(0, fn.indexOf('const READERS'));
    return body.includes('WHERE enabled = 1')
        || 'a taken-down piece would still be served';
});

await check('fanArt is registered as a reader and a writer', async () => {
    return /fanArt: getFanArt/.test(indexCode) && /fanArt:\s*\(db, body\)/.test(writersCode);
});

await check('the admin routes sit behind the login gate', async () => {
    const seg = indexCode.slice(indexCode.indexOf("parts[1] === 'fanart'"));
    const body = seg.slice(0, seg.indexOf("parts[1] === 'subscribers'"));
    const gate = body.indexOf('requireAuth');
    return gate !== -1
        && gate < body.indexOf('handleSubmissionList')
        && gate < body.indexOf('handleFanArtPublish')
        && gate > body.indexOf('handleFanArtSubmit')
        || 'the gate is not above every admin path';
});

console.log('\n  The page itself\n');

await check('THE GALLERY NEVER BUILDS MARKUP FROM A STRANGER\'S TEXT', async () => {
    // The single most important check in this file. foxes.js and
    // devlogs.js interpolate into template strings; those hold content
    // the studio typed. This page holds content the public typed.
    const fn = pageJsCode.slice(pageJsCode.indexOf('function buildPiece'));
    const body = fn.slice(0, pageJsCode.indexOf('fetch(') - pageJsCode.indexOf('function buildPiece'));
    return !body.includes('innerHTML') && !/\$\{/.test(body)
        || 'the gallery interpolates untrusted text into markup';
});

await check('no innerHTML anywhere in the page script', async () => {
    return !pageJsCode.includes('innerHTML');
});

await check('outbound credit links carry noopener', async () => {
    const fn = pageJsCode.slice(pageJsCode.indexOf('function buildPiece'));
    return /rel\s*=\s*'noopener/.test(fn.slice(0, 2000));
});

await check('the form has a Turnstile widget on it', async () => {
    return pageHtmlCode.includes('cf-turnstile')
        && pageHtmlCode.includes('challenges.cloudflare.com/turnstile');
});

await check('the Turnstile widget is reset after a failure', async () => {
    // It is single-use. Without a reset the second attempt after any
    // error fails every time and reads as a broken form.
    // SCOPED to the rejected-response branch: counting occurrences across
    // the file let any one of the three resets be deleted while the count
    // stayed above the threshold.
    const at = pageJsCode.indexOf('if (!result.ok)');
    if (at === -1) return 'the error branch has gone';
    const branch = pageJsCode.slice(at, pageJsCode.indexOf('return;', at));
    return branch.includes('turnstile.reset()')
        || 'a rejected submission leaves the widget spent';
});

await check('the consent box is required in the markup too', async () => {
    const seg = pageHtmlCode.slice(pageHtmlCode.indexOf('id="fa-consent"'));
    return seg.slice(0, 120).includes('required');
});

await check('the page says how to get art taken down', async () => {
    // SCOPED to the smallprint. The consent sentence also contains the
    // words "taken down", and it stood in for this promise when the
    // promise was deleted - the same unscoped-assertion trap that has
    // now appeared on three separate deliveries.
    const at = pageHtmlCode.indexOf('form-smallprint');
    if (at === -1) return 'the smallprint block has gone';
    const block = pageHtmlCode.slice(at, pageHtmlCode.indexOf('</p>', at));
    return /taken down/i.test(block) && /email us/i.test(block)
        || 'the smallprint no longer promises a takedown';
});

await check('the privacy page declares the form', async () => {
    // That page enumerates exactly who sees what. A new form collecting
    // contact details stops it being true unless it is declared.
    // Asserted on the HEADING: a loose search for "fan art" was answered
    // by the paragraph underneath when the heading was renamed away, and
    // a section nobody can find in the contents is not a declaration.
    return /<h2>[^<]*fan art[^<]*<\/h2>/i.test(privacyHtml)
        && /email/i.test(privacyHtml)
        || 'the privacy page has no fan art heading';
});

console.log('\n  The credit cannot be rewritten later\n');

await check('the gallery writer will not accept a changed artist name', async () => {
    const fn = writersCode.slice(writersCode.indexOf('export async function putFanArt'));
    const body = fn.slice(0, fn.indexOf('export const WRITERS'));
    return !body.includes('artist_name') && !body.includes('credit_link')
        || 'putFanArt can overwrite the credit';
});

await check('the admin panel does not offer the credit as an editable field', async () => {
    const fn = adminCode.slice(adminCode.indexOf('function renderGallery'));
    const body = fn.slice(0, fn.indexOf('function renderAll'));
    return body.includes('credit is fixed from the submission')
        && !/artistName\s*=/.test(body);
});

await check('the admin panel builds rows with textContent, not markup', async () => {
    return !adminCode.includes('innerHTML');
});

console.log(`\n  PASSED: ${pass}    FAILED: ${fail}\n`);
if (fail > 0) process.exit(1);
