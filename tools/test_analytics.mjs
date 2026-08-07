/**
 * Cloudflare Web Analytics beacon.
 *
 *   node tools/test_analytics.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(label, ok, detail = '') {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
    if (!ok) failures.push(label);
}

const TOKEN = 'f4106eee0d174f5496955c154fff782d';
const publicPages = readdirSync(join(ROOT, 'public')).filter((f) => f.endsWith('.html'));
const adminPages = readdirSync(join(ROOT, 'public/admin')).filter((f) => f.endsWith('.html'));

console.log('Every public page reports:');
const missing = publicPages.filter((f) =>
    !readFileSync(join(ROOT, 'public', f), 'utf8').includes(TOKEN));
check('no public page was left out', missing.length === 0,
    missing.join(', ') || `${publicPages.length} pages`);

// Two beacons on one page double-count every visit, and that is easy to do by
// accident if Cloudflare's automatic setup is switched on as well.
const doubled = publicPages.filter((f) => {
    const html = readFileSync(join(ROOT, 'public', f), 'utf8');
    return (html.match(/cloudflareinsights/g) || []).length > 1;
});
check('no page carries it twice', doubled.length === 0, doubled.join(', '));

console.log('\nThe admin is deliberately excluded:');
const leaked = adminPages.filter((f) =>
    readFileSync(join(ROOT, 'public/admin', f), 'utf8').includes('cloudflareinsights'));
check('no admin page reports', leaked.length === 0,
    leaked.join(', ') || 'her own use would only add noise');

console.log('\nThe snippet:');
const sample = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
check("it is Cloudflare's own wording, not a rewrite of it",
    sample.includes(`<script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "${TOKEN}"}'></script>`),
    'they emit type=module; swapping it for defer would be a guess');
check('it sits at the end of the body, after the page scripts',
    sample.indexOf('cloudflareinsights') > sample.indexOf('/assets/js/pages/index.js'));

console.log('\nThe privacy policy keeps up:');
const privacy = readFileSync(join(ROOT, 'public/privacy.html'), 'utf8');
check('it now mentions the measurement', /Cloudflare Web Analytics/.test(privacy));
check('the "who else sees it" list stays accurate',
    /counts page views for us/.test(privacy),
    'the page promises only two companies and says what each one sees');
check('the cookie claim is still true',
    /sets no tracking or advertising cookies/.test(privacy) && /sets\s*\n?\s*no cookie/.test(privacy),
    'Cloudflare Web Analytics is cookieless, so the existing promise still holds');

console.log(
    failures.length
        ? `\n${failures.length} FAILED: ${failures.join(', ')}`
        : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
