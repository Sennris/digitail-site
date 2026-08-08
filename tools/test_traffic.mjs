/**
 * Traffic history tests.
 *
 *   node --experimental-sqlite tools/test_traffic.mjs
 *
 * Every one of the four rules in src/analytics.js gets a check that
 * fails if the rule is removed. Verified with tools/mutate_traffic.sh -
 * this project has had eight tests pass for the wrong reason, so a new
 * suite is not trusted until the mutation harness agrees with it.
 *
 * The database is a real SQLite file built from every migration in
 * order, not a mock, because regex-reading SQL has hidden a bug here
 * before.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;

function check(name, fn) {
    // Each check is wrapped so a throw fails that check instead of
    // abandoning every check after it.
    try {
        const result = fn();
        if (result === true) { pass += 1; console.log(`  PASS  ${name}`); }
        else { fail += 1; console.log(`  FAIL  ${name}${result ? ` - ${result}` : ''}`); }
    } catch (e) {
        fail += 1;
        console.log(`  FAIL  ${name} - threw: ${e.message}`);
    }
}

async function checkAsync(name, fn) {
    try {
        const result = await fn();
        if (result === true) { pass += 1; console.log(`  PASS  ${name}`); }
        else { fail += 1; console.log(`  FAIL  ${name}${result ? ` - ${result}` : ''}`); }
    } catch (e) {
        fail += 1;
        console.log(`  FAIL  ${name} - threw: ${e.message}`);
    }
}


/* ---------- a D1-shaped wrapper over real SQLite ---------- */

function makeDb() {
    const sqlite = new DatabaseSync(':memory:');

    for (const file of readdirSync(join(ROOT, 'migrations')).sort()) {
        if (!file.endsWith('.sql')) continue;
        const sql = readFileSync(join(ROOT, 'migrations', file), 'utf8');
        try { sqlite.exec(sql); } catch (e) {
            throw new Error(`migration ${file} failed: ${e.message}`);
        }
    }

    const wrap = (sql) => {
        let bound = [];
        const stmt = {
            bind(...args) { bound = args; return stmt; },
            async all() {
                const s = sqlite.prepare(sql);
                return { results: s.all(...bound) };
            },
            async first() {
                const s = sqlite.prepare(sql);
                return s.get(...bound) ?? null;
            },
            async run() {
                const s = sqlite.prepare(sql);
                return s.run(...bound);
            },
            _exec() { sqlite.prepare(sql).run(...bound); },
        };
        return stmt;
    };

    return {
        prepare: wrap,
        async batch(statements) { statements.forEach((s) => s._exec()); },
        _raw: sqlite,
    };
}

function rowsIn(db) {
    return db._raw.prepare('SELECT * FROM analytics_daily ORDER BY date').all();
}


/* ---------- a fake Cloudflare ---------- */

function fakeEnv(db, responder) {
    return {
        DB: db,
        CF_ANALYTICS_TOKEN: 'test-token',
        CF_ACCOUNT_ID: 'test-account',
        CF_SITE_TAG: 'test-site',
        _fetchCalls: [],
        _responder: responder,
    };
}

function installFetch(env) {
    globalThis.fetch = async (url, init) => {
        env._fetchCalls.push({ url, body: JSON.parse(init.body) });
        return env._responder(env._fetchCalls.length);
    };
}

const okResponse = (groups) => new Response(JSON.stringify({
    data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: groups }] } },
    errors: null,
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

const group = (date, count, visits) => ({ count, sum: { visits }, dimensions: { date } });


/* ---------- run ---------- */

// pathToFileURL, not a bare path. On Windows an absolute path starts
// C:\ and Node's ESM loader rejects it as an unknown URL scheme.
// This suite is run from Git Bash on Windows, so a POSIX-only path
// here means the tests cannot run on the machine that needs them.
const A = await import(pathToFileURL(join(ROOT, 'src', 'analytics.js')).href);

console.log('\nDates');

check('lastCompleteDay is yesterday in UTC, not today', () => {
    const got = A.lastCompleteDay(new Date('2026-08-08T02:00:00Z'));
    return got === '2026-08-07' || `got ${got}`;
});

check('lastCompleteDay does not drift at a UTC day boundary', () => {
    const got = A.lastCompleteDay(new Date('2026-08-08T00:00:01Z'));
    return got === '2026-08-07' || `got ${got}`;
});

check('datesBetween is inclusive at both ends', () => {
    const got = A.datesBetween('2026-08-01', '2026-08-03');
    return (got.length === 3 && got[0] === '2026-08-01' && got[2] === '2026-08-03')
        || `got ${JSON.stringify(got)}`;
});

check('datesBetween returns nothing when end precedes start', () => {
    const got = A.datesBetween('2026-08-03', '2026-08-01');
    return got.length === 0 || `got ${JSON.stringify(got)}`;
});

check('addDays crosses a month boundary', () => {
    const got = A.addDays('2026-07-31', 1);
    return got === '2026-08-01' || `got ${got}`;
});

console.log('\nQuery');

check('the query filters on siteTag, not the public site token', () => {
    const q = A.buildQuery('acct', 'sitetag', '2026-08-01', '2026-08-07');
    return (q.variables.siteTag === 'sitetag' && q.query.includes('siteTag: $siteTag'))
        || 'siteTag is not wired into the filter';
});

check('the query asks for both count and visits', () => {
    const q = A.buildQuery('a', 's', '2026-08-01', '2026-08-07');
    return (q.query.includes('count') && q.query.includes('visits'))
        || 'a metric is missing from the query';
});

console.log('\nWindow planning');

check('first run asks for the whole 30-day retention window', () => {
    const plan = A.planWindow(new Set(), new Date('2026-08-08T02:00:00Z'));
    return (plan.end === '2026-08-07' && plan.start === '2026-07-09')
        || `got ${JSON.stringify(plan)}`;
});

check('a gap is filled even when last night did not run', () => {
    const have = new Set(A.datesBetween('2026-07-09', '2026-08-01'));
    const plan = A.planWindow(have, new Date('2026-08-08T02:00:00Z'));
    return (plan.start === '2026-08-02' && plan.end === '2026-08-07')
        || `got ${JSON.stringify(plan)}`;
});

check('nothing to do when every day is already stored', () => {
    const have = new Set(A.datesBetween('2026-07-09', '2026-08-07'));
    return A.planWindow(have, new Date('2026-08-08T02:00:00Z')) === null
        || 'planned a fetch it did not need';
});

check('today is never planned for, because it is a partial day', () => {
    const plan = A.planWindow(new Set(), new Date('2026-08-08T23:59:00Z'));
    return plan.end === '2026-08-07' || `end was ${plan.end}`;
});

console.log('\nRule 1 - a failed fetch writes nothing');

await checkAsync('a GraphQL error writes no rows at all', async () => {
    const db = makeDb();
    const env = fakeEnv(db, () => new Response(JSON.stringify({
        data: null, errors: [{ message: 'Authentication error' }],
    }), { status: 200 }));
    installFetch(env);

    const result = await A.refreshAnalytics(env, new Date('2026-08-08T02:00:00Z'));
    return (result.ok === false && rowsIn(db).length === 0)
        || `ok=${result.ok}, rows=${rowsIn(db).length}`;
});

await checkAsync('an HTTP 500 writes no rows at all', async () => {
    const db = makeDb();
    const env = fakeEnv(db, () => new Response('nope', { status: 500 }));
    installFetch(env);

    const result = await A.refreshAnalytics(env, new Date('2026-08-08T02:00:00Z'));
    return (result.ok === false && rowsIn(db).length === 0)
        || `ok=${result.ok}, rows=${rowsIn(db).length}`;
});

await checkAsync('a failed fetch leaves an EXISTING row untouched', async () => {
    const db = makeDb();
    db._raw.prepare(
        "INSERT INTO analytics_daily (date, page_views, visits, detail_json, fetched_at) VALUES ('2026-08-05', 194, 44, '{}', 'x')",
    ).run();

    const env = fakeEnv(db, () => new Response(JSON.stringify({
        data: null, errors: [{ message: 'boom' }],
    }), { status: 200 }));
    installFetch(env);

    await A.refreshAnalytics(env, new Date('2026-08-08T02:00:00Z'));
    const row = db._raw.prepare("SELECT * FROM analytics_daily WHERE date = '2026-08-05'").get();
    return (row && row.page_views === 194 && row.visits === 44)
        || `row is now ${JSON.stringify(row)}`;
});

console.log('\nRule 2 - an existing row is never blanked');

await checkAsync('a day missing from a SUCCESSFUL response does not blank an existing row', async () => {
    const db = makeDb();
    db._raw.prepare(
        "INSERT INTO analytics_daily (date, page_views, visits, detail_json, fetched_at) VALUES ('2026-08-05', 194, 44, '{}', 'x')",
    ).run();

    // Cloudflare answers, but has aged 08-05 out of its retention.
    const env = fakeEnv(db, () => okResponse([group('2026-08-06', 38, 5)]));
    installFetch(env);

    await A.refreshAnalytics(env, new Date('2026-08-08T02:00:00Z'));
    const row = db._raw.prepare("SELECT * FROM analytics_daily WHERE date = '2026-08-05'").get();
    return (row && row.page_views === 194 && row.visits === 44)
        || `row is now ${JSON.stringify(row)}`;
});

await checkAsync('real numbers DO update an existing row', async () => {
    const db = makeDb();
    db._raw.prepare(
        "INSERT INTO analytics_daily (date, page_views, visits, detail_json, fetched_at) VALUES ('2026-08-05', 1, 1, '{}', 'x')",
    ).run();

    const env = fakeEnv(db, () => okResponse([group('2026-08-05', 194, 44)]));
    installFetch(env);

    await A.refreshAnalytics(env, new Date('2026-08-08T02:00:00Z'));
    const row = db._raw.prepare("SELECT * FROM analytics_daily WHERE date = '2026-08-05'").get();
    return (row && row.page_views === 194 && row.visits === 44)
        || `row is now ${JSON.stringify(row)}`;
});

console.log('\nRule 3 - an absent day in a good response is a zero day');

await checkAsync('days Cloudflare omits are written as zero, so they are not re-asked forever', async () => {
    const db = makeDb();
    const env = fakeEnv(db, () => okResponse([
        group('2026-08-04', 142, 57),
        group('2026-08-05', 194, 44),
    ]));
    installFetch(env);

    await A.refreshAnalytics(env, new Date('2026-08-08T02:00:00Z'));

    const zero = db._raw.prepare("SELECT * FROM analytics_daily WHERE date = '2026-08-03'").get();
    const real = db._raw.prepare("SELECT * FROM analytics_daily WHERE date = '2026-08-04'").get();
    return (zero && zero.page_views === 0 && zero.fetched_at && real.page_views === 142)
        || `zero=${JSON.stringify(zero)} real=${JSON.stringify(real)}`;
});

await checkAsync('a second run finds nothing left to do', async () => {
    const db = makeDb();
    const env = fakeEnv(db, () => okResponse([group('2026-08-04', 142, 57)]));
    installFetch(env);

    const when = new Date('2026-08-08T02:00:00Z');
    await A.refreshAnalytics(env, when);
    const callsAfterFirst = env._fetchCalls.length;
    const second = await A.refreshAnalytics(env, when);

    return (second.ok === true && second.written === 0
        && env._fetchCalls.length === callsAfterFirst)
        || `second run: ${JSON.stringify(second)}, calls ${env._fetchCalls.length} vs ${callsAfterFirst}`;
});

console.log('\nRule 4 - only completed days are stored');

await checkAsync('today never gets a row, even if Cloudflare returns one', async () => {
    const db = makeDb();
    const env = fakeEnv(db, () => okResponse([
        group('2026-08-07', 38, 8),
        group('2026-08-08', 1, 1),
    ]));
    installFetch(env);

    await A.refreshAnalytics(env, new Date('2026-08-08T02:00:00Z'));
    const today = db._raw.prepare("SELECT * FROM analytics_daily WHERE date = '2026-08-08'").get();
    return (today === undefined || today === null) || `today was stored: ${JSON.stringify(today)}`;
});

console.log('\nRe-runs and reading');

await checkAsync('re-running for the same day overwrites rather than duplicating', async () => {
    const db = makeDb();
    const env = fakeEnv(db, () => okResponse([group('2026-08-04', 142, 57)]));
    installFetch(env);

    const when = new Date('2026-08-08T02:00:00Z');
    await A.refreshAnalytics(env, when);
    // Force a re-fetch of the same window by clearing one day.
    db._raw.prepare("DELETE FROM analytics_daily WHERE date = '2026-08-04'").run();
    await A.refreshAnalytics(env, when);

    const n = db._raw.prepare("SELECT COUNT(*) AS n FROM analytics_daily WHERE date = '2026-08-04'").get();
    return n.n === 1 || `found ${n.n} rows for that date`;
});

await checkAsync('a missing table gives a message naming the migration, not a crash', async () => {
    const db = makeDb();
    db._raw.exec('DROP TABLE analytics_daily');
    const env = fakeEnv(db, () => okResponse([]));
    installFetch(env);

    const result = await A.refreshAnalytics(env, new Date('2026-08-08T02:00:00Z'));
    return (result.ok === false && /0013/.test(result.error))
        || `error was: ${result.error}`;
});

await checkAsync('a missing secret fails before any network call', async () => {
    const db = makeDb();
    const env = fakeEnv(db, () => okResponse([]));
    delete env.CF_SITE_TAG;
    installFetch(env);

    const result = await A.refreshAnalytics(env, new Date('2026-08-08T02:00:00Z'));
    return (result.ok === false && env._fetchCalls.length === 0 && /CF_SITE_TAG/.test(result.error))
        || `error=${result.error}, calls=${env._fetchCalls.length}`;
});

await checkAsync('readAnalytics totals the rows and flags them as estimates', async () => {
    const db = makeDb();
    db._raw.exec(`
        INSERT INTO analytics_daily (date, page_views, visits, detail_json, fetched_at)
        VALUES ('2026-08-04', 142, 57, '{}', 'x'), ('2026-08-05', 194, 44, '{}', 'x');
    `);
    const data = await A.readAnalytics(db, 90);
    return (data.totals.pageViews === 336 && data.totals.visits === 101
        && data.days === 2 && data.estimates === true && data.rows[0].date === '2026-08-05')
        || `got ${JSON.stringify(data.totals)} days=${data.days} first=${data.rows[0]?.date}`;
});

await checkAsync('bad JSON in detail_json degrades to {} instead of taking the read down', async () => {
    const db = makeDb();
    db._raw.exec(`
        INSERT INTO analytics_daily (date, page_views, visits, detail_json, fetched_at)
        VALUES ('2026-08-04', 1, 1, 'not json', 'x');
    `);
    const data = await A.readAnalytics(db, 90);
    return (data.rows.length === 1 && JSON.stringify(data.rows[0].detail) === '{}')
        || `got ${JSON.stringify(data.rows[0])}`;
});

console.log('\nCSV');

check('CSV has a UTC-labelled header and one line per day', () => {
    const csv = A.toCsv([
        { date: '2026-08-04', pageViews: 142, visits: 57 },
        { date: '2026-08-05', pageViews: 194, visits: 44 },
    ]);
    const lines = csv.trim().split('\n');
    return (lines.length === 3 && /date_utc/.test(lines[0]) && lines[1] === '2026-08-04,142,57')
        || `got ${JSON.stringify(lines)}`;
});

console.log('\nWiring');

check('the Worker exports a scheduled handler', () => {
    const src = readFileSync(join(ROOT, 'src/index.js'), 'utf8');
    return /async scheduled\s*\(/.test(src) || 'no scheduled handler in src/index.js';
});

check('wrangler.toml has exactly one cron trigger', () => {
    const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
    const m = toml.match(/crons\s*=\s*\[([^\]]*)\]/);
    if (!m) return 'no crons entry';
    const count = m[1].split(',').filter((s) => s.trim()).length;
    return count === 1 || `found ${count} cron entries`;
});

check('the analytics endpoints require a login', () => {
    const src = readFileSync(join(ROOT, 'src/index.js'), 'utf8');
    const block = src.slice(src.indexOf("parts[1] === 'analytics'"));
    const head = block.slice(0, block.indexOf("parts[1] === 'content'"));
    return /requireAuth/.test(head) || 'no auth check on the analytics route';
});

check('the admin traffic table is built from elements, not an innerHTML string', () => {
    const src = readFileSync(join(ROOT, 'public/admin/admin-traffic.js'), 'utf8');
    const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return !/innerHTML/.test(withoutComments) || 'admin-traffic.js uses innerHTML';
});

check('the Traffic tab is registered in the admin page', () => {
    const html = readFileSync(join(ROOT, 'public/admin/index.html'), 'utf8');
    return (html.includes("switchTab('traffic'") && html.includes('id="traffic-tab"')
        && html.includes('admin-traffic.js'))
        || 'the tab button, panel or script tag is missing';
});

check('the admin says the numbers are estimates', () => {
    const html = readFileSync(join(ROOT, 'public/admin/index.html'), 'utf8');
    const panel = html.slice(html.indexOf('id="traffic-tab"'));
    return /estimates/i.test(panel.slice(0, 4000)) || 'no estimate warning on the Traffic tab';
});

check('the admin says the dates are UTC', () => {
    const html = readFileSync(join(ROOT, 'public/admin/index.html'), 'utf8');
    const panel = html.slice(html.indexOf('id="traffic-tab"'));
    return /UTC/.test(panel.slice(0, 4000)) || 'no UTC label on the Traffic tab';
});


console.log(`\n${'='.repeat(46)}`);
console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
console.log('='.repeat(46));
process.exit(fail === 0 ? 0 : 1);
