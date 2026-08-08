/**
 * Traffic history.
 *
 * A nightly cron asks Cloudflare's GraphQL Analytics API for daily
 * page views and visits, and stores them in D1. Cloudflare keeps 30
 * days; this table keeps them forever. The admin panel reads the
 * table, never Cloudflare.
 *
 * FOUR RULES, each from a real constraint. Every one of them is
 * covered by a test in tools/test_traffic.mjs.
 *
 *   1. A FAILED FETCH WRITES NOTHING. Not zeros, not a partial row.
 *      Writing zeros over a real day is the same class of bug as
 *      publishing blanks over live copy, which has happened twice on
 *      this site.
 *
 *   2. AN EXISTING ROW IS NEVER OVERWRITTEN WITH ZEROS. Cloudflare
 *      only holds 30 days, so a day at the edge of the window can
 *      drop out of the response. Blanking a real day because the
 *      source aged it out would destroy the history this whole
 *      feature exists to preserve.
 *
 *   3. AN ABSENT DAY IN A SUCCESSFUL RESPONSE IS A ZERO DAY. Verified
 *      against the live API: Cloudflare omits days with no traffic
 *      rather than returning a zero. If those were treated as "not
 *      fetched yet", the backfill would chase them every night
 *      forever. A successful answer covering a date is an answer,
 *      including "nobody came".
 *
 *   4. ONLY COMPLETED UTC DAYS ARE STORED. Today's row is a few hours
 *      of traffic. Storing it would freeze a partial number in as the
 *      final one.
 */

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

// Cloudflare Web Analytics retains 30 days. Asking for more is not an
// error, it just returns nothing, so there is no point paying for it.
const RETENTION_DAYS = 30;


/* ================= dates ================= */

// Everything here is UTC and every date is a plain YYYY-MM-DD string.
// Deliberately no Date arithmetic on local time anywhere in this file.

export function utcDate(d = new Date()) {
    return d.toISOString().slice(0, 10);
}

export function addDays(date, n) {
    const t = Date.parse(`${date}T00:00:00Z`);
    if (Number.isNaN(t)) throw new Error(`Bad date: ${date}`);
    return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

// Inclusive at both ends. Returns [] if end is before start rather
// than looping forever, because a clock skew should not hang the cron.
export function datesBetween(start, end) {
    const out = [];
    if (Date.parse(`${end}T00:00:00Z`) < Date.parse(`${start}T00:00:00Z`)) return out;
    for (let d = start; ; d = addDays(d, 1)) {
        out.push(d);
        if (d === end) break;
        if (out.length > 400) throw new Error('Refusing to build a range that long');
    }
    return out;
}

// Rule 4. "Yesterday" in UTC is the newest day that is actually over.
export function lastCompleteDay(now = new Date()) {
    return addDays(utcDate(now), -1);
}


/* ================= Cloudflare ================= */

export function buildQuery(accountTag, siteTag, start, end) {
    return {
        query: `query TrafficByDay($accountTag: String!, $siteTag: String!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumPageloadEventsAdaptiveGroups(
        limit: 1000
        filter: { siteTag: $siteTag, date_geq: $start, date_leq: $end }
        orderBy: [date_ASC]
      ) {
        count
        sum { visits }
        dimensions { date }
      }
    }
  }
}`,
        variables: { accountTag, siteTag, start, end },
    };
}

/**
 * Ask Cloudflare for one date range.
 *
 * Returns { ok: true, byDate: Map<date, {pageViews, visits}> } or
 * { ok: false, error } - and the caller must write NOTHING on !ok.
 *
 * A GraphQL error arrives with HTTP 200 and an `errors` array, so
 * checking response.ok alone is not enough. That is exactly the shape
 * of the guard bug this project has been bitten by before: a check
 * that looks like protection and passes in every case.
 */
export async function fetchRange(env, start, end) {
    const token = env.CF_ANALYTICS_TOKEN;
    const account = env.CF_ACCOUNT_ID;
    const site = env.CF_SITE_TAG;

    if (!token || !account || !site) {
        return { ok: false, error: 'CF_ANALYTICS_TOKEN, CF_ACCOUNT_ID or CF_SITE_TAG is not set on this Worker' };
    }

    let res;
    try {
        res = await fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildQuery(account, site, start, end)),
        });
    } catch (e) {
        return { ok: false, error: `Network error talking to Cloudflare: ${e.message}` };
    }

    if (!res.ok) {
        return { ok: false, error: `Cloudflare returned HTTP ${res.status}` };
    }

    let body;
    try { body = await res.json(); } catch (e) {
        return { ok: false, error: `Cloudflare returned something that is not JSON: ${e.message}` };
    }

    if (body && Array.isArray(body.errors) && body.errors.length) {
        const first = body.errors[0];
        return { ok: false, error: `Cloudflare API error: ${first && first.message ? first.message : 'unknown'}` };
    }

    const accounts = body?.data?.viewer?.accounts;
    if (!Array.isArray(accounts) || !accounts.length) {
        return { ok: false, error: 'Cloudflare answered but the account was not in the response' };
    }

    const groups = accounts[0].rumPageloadEventsAdaptiveGroups;
    if (!Array.isArray(groups)) {
        return { ok: false, error: 'Cloudflare answered but there was no pageload data in the response' };
    }

    const byDate = new Map();
    for (const g of groups) {
        const date = g?.dimensions?.date;
        if (!date) continue;
        byDate.set(date, {
            pageViews: Number(g.count) || 0,
            visits: Number(g?.sum?.visits) || 0,
        });
    }

    return { ok: true, byDate };
}


/* ================= storage ================= */

export async function storedDates(db) {
    const { results } = await db.prepare('SELECT date FROM analytics_daily').all();
    return new Set((results || []).map((r) => r.date));
}

/**
 * Work out which window to ask about.
 *
 * First run  -> the whole retention window, so she starts with
 *               everything Cloudflare still holds instead of from zero.
 * Later runs -> from the oldest missing day up to yesterday. Cloudflare
 *               does not retry a failed cron invocation, so this must
 *               never assume last night ran.
 *
 * Returns null when there is nothing to do.
 */
export function planWindow(existing, now = new Date()) {
    const end = lastCompleteDay(now);
    const earliest = addDays(end, -(RETENTION_DAYS - 1));
    const wanted = datesBetween(earliest, end);
    const missing = wanted.filter((d) => !existing.has(d));
    if (!missing.length) return null;
    return { start: missing[0], end };
}

/**
 * Write one successful fetch to the table.
 *
 * `covered` is the list of dates the fetch actually asked about. Any
 * date in it that Cloudflare did not mention is a zero day (rule 3) -
 * but only if we have no row for it yet (rule 2).
 */
export async function storeRange(db, covered, byDate, fetchedAt) {
    const existing = await storedDates(db);
    const statements = [];

    for (const date of covered) {
        const hit = byDate.get(date);

        if (!hit) {
            // Rule 2: never blank a day we already have.
            if (existing.has(date)) continue;
            // Rule 3: a successful answer that omits a day means zero.
            statements.push(db.prepare(
                'INSERT OR REPLACE INTO analytics_daily (date, page_views, visits, detail_json, fetched_at) VALUES (?, 0, 0, \'{}\', ?)',
            ).bind(date, fetchedAt));
            continue;
        }

        statements.push(db.prepare(
            'INSERT OR REPLACE INTO analytics_daily (date, page_views, visits, detail_json, fetched_at) VALUES (?, ?, ?, \'{}\', ?)',
        ).bind(date, hit.pageViews, hit.visits, fetchedAt));
    }

    if (!statements.length) return 0;
    await db.batch(statements);
    return statements.length;
}

/**
 * The whole nightly job. Also callable by hand from the admin.
 * Never throws - the cron has nobody to report to but the log.
 */
export async function refreshAnalytics(env, now = new Date()) {
    let existing;
    try {
        existing = await storedDates(env.DB);
    } catch (e) {
        return { ok: false, error: `Could not read analytics_daily - has migration 0013 been run? (${e.message})` };
    }

    const plan = planWindow(existing, now);
    if (!plan) return { ok: true, written: 0, note: 'Already up to date' };

    const result = await fetchRange(env, plan.start, plan.end);
    if (!result.ok) {
        // Rule 1. Nothing is written. The table keeps whatever it had.
        return { ok: false, error: result.error };
    }

    const covered = datesBetween(plan.start, plan.end);
    try {
        const written = await storeRange(env.DB, covered, result.byDate, new Date().toISOString());
        return { ok: true, written, from: plan.start, to: plan.end };
    } catch (e) {
        return { ok: false, error: `Could not save traffic history: ${e.message}` };
    }
}


/* ================= reading ================= */

// Excel reads a leading = + - @ as a formula, so a value starting with
// one is prefixed with a quote. Dates and integers cannot start with
// those, but the escaper is shared and this costs nothing.
function csvCell(value) {
    const s = String(value ?? '');
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows) {
    const lines = ['date_utc,page_views,visits'];
    for (const r of rows) {
        lines.push([r.date, r.pageViews, r.visits].map(csvCell).join(','));
    }
    return `${lines.join('\n')}\n`;
}

export async function readAnalytics(db, days = 90) {
    const n = Math.min(Math.max(Number(days) || 90, 1), 3650);
    const { results } = await db
        .prepare('SELECT * FROM analytics_daily ORDER BY date DESC LIMIT ?')
        .bind(n).all();

    const rows = (results || []).map((r) => ({
        date: r.date,
        pageViews: r.page_views,
        visits: r.visits,
        fetchedAt: r.fetched_at || '',
        detail: (() => {
            try { return r.detail_json ? JSON.parse(r.detail_json) : {}; }
            catch { return {}; }
        })(),
    }));

    const totals = rows.reduce((acc, r) => {
        acc.pageViews += r.pageViews;
        acc.visits += r.visits;
        return acc;
    }, { pageViews: 0, visits: 0 });

    return {
        rows,
        totals,
        days: rows.length,
        // Said on screen too, but carried with the data so it cannot be
        // separated from it: these are sampled estimates, not counts.
        estimates: true,
    };
}
