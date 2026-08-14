/**
 * Adds run_worker_first to the [assets] block of wrangler.toml.
 *
 *   node tools/set_run_worker_first.mjs
 *
 * WHY THIS IS A SCRIPT AND NOT A FILE IN THE ZIP
 * wrangler.toml holds the D1 database id. Shipping a copy of it once
 * overwrote that and broke the deploy, so it is never in a delivery.
 * This edits the one already on the machine instead, and leaves every
 * other line of it alone.
 *
 * WHAT THE SETTING DOES
 * By default Cloudflare serves static files WITHOUT running the Worker,
 * and a plain link click (a "navigation request") is answered by the
 * asset layer even when no file exists at that path - it gets the 404
 * page. That is why every download link failed with "File wasn't
 * available on site", and why the Worker's own /admin gate has never
 * actually run.
 *
 * /admin is listed separately from /admin/* on purpose: a pattern ending
 * in /* does not match its own parent. /media/* costs nothing extra -
 * no static file lives there, so those requests already reach the Worker
 * and already bill as Worker requests.
 *
 * Safe to run twice: it does nothing if the line is already there.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'wrangler.toml');
const LINE = 'run_worker_first = [ "/admin", "/admin/*", "/api/*", "/media/*" ]';

if (!existsSync(FILE)) {
    console.log('Could not find wrangler.toml. Run this from inside the digitail-site folder.');
    process.exit(1);
}

const text = readFileSync(FILE, 'utf8');

if (/^\s*run_worker_first/m.test(text)) {
    console.log('Already set. Nothing to change.');
    console.log(text.split('\n').filter((l) => /run_worker_first/.test(l)).join('\n'));
    process.exit(0);
}

const anchor = 'not_found_handling = "404-page"';
if (!text.includes(anchor)) {
    console.log('The [assets] block does not look the way this script expects.');
    console.log('Nothing has been changed. Say so in the chat and I will do it by hand.');
    process.exit(1);
}

copyFileSync(FILE, FILE + '.backup.log');

const added = text.replace(
    anchor,
    anchor + '\n'
        + '# Run the Worker first on these paths. Without this, a link click to a\n'
        + '# download or an API path is answered by the asset layer with the 404\n'
        + '# page, and the admin gate in src/index.js never runs at all.\n'
        + '# /admin is listed on its own because /admin/* does not match it.\n'
        + LINE,
);

writeFileSync(FILE, added, 'utf8');
console.log('Added to wrangler.toml:');
console.log('  ' + LINE);
console.log('');
console.log('The old file is saved beside it as wrangler.toml.backup.log, which');
console.log('git already ignores, so it will not end up in a commit.');
