/**
 * Digi Tail Studios - newsletter
 *
 *   POST /api/subscribe      public, gated on Turnstile
 *   POST /api/unsubscribe    public, gated on Turnstile
 *   GET  /api/subscribers            admin, list + counts
 *   GET  /api/subscribers/export     admin, CSV download
 *   POST /api/subscribers/sync       admin, pull states from the provider
 *
 * The list lives in D1. The provider only sends. Everything that knows
 * the provider exists is inside the PROVIDER block near the bottom of
 * this file; swapping to another service means rewriting that block and
 * nothing else.
 */

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const NO_CACHE = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
};

const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: NO_CACHE });

const fail = (message, status = 400) =>
    new Response(JSON.stringify({ error: message }), { status, headers: NO_CACHE });


/* ================= helpers ================= */

const clientIp = (request) => request.headers.get('CF-Connecting-IP') || '';

function randomToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Deliberately permissive. The confirmation email is the real check on
// whether an address exists; a clever regex only rejects valid addresses.
function looksLikeEmail(value) {
    return typeof value === 'string'
        && value.length <= 254
        && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value.trim());
}

function cleanName(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\r\n\t]/g, ' ').trim().slice(0, 120);
}


/* ================= Turnstile ================= */

/**
 * Verifies the token the widget put in the form.
 *
 * Fails closed: a network blip, a non-2xx, an unparseable body or a
 * missing secret all count as "not verified". The alternative is a
 * signup form that silently stops being protected the moment
 * challenges.cloudflare.com has a bad afternoon.
 */
export async function verifyTurnstile(request, env, token) {
    if (!env.TURNSTILE_SECRET) {
        return { ok: false, reason: 'turnstile-not-configured' };
    }
    if (!token || typeof token !== 'string') {
        return { ok: false, reason: 'missing-input-response' };
    }

    let result;
    try {
        const response = await fetch(TURNSTILE_VERIFY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                // trim(): a stray newline from a copy-paste is invisible
                // in `wrangler secret list` but breaks verification.
                secret: String(env.TURNSTILE_SECRET).trim(),
                response: token,
                remoteip: clientIp(request),
            }),
        });
        if (!response.ok) throw new Error(`siteverify ${response.status}`);
        result = await response.json();
    } catch (e) {
        return { ok: false, reason: `siteverify-unreachable: ${e.message}` };
    }

    if (result?.success !== true) {
        const codes = Array.isArray(result?.['error-codes']) ? result['error-codes'] : [];
        return { ok: false, reason: codes.join(',') || 'verification-failed' };
    }
    return { ok: true };
}


/* ================= public routes ================= */

export async function handleSubscribe(request, env) {
    if (request.method !== 'POST') return fail('POST required', 405);

    let body;
    try { body = await request.json(); } catch { return fail('Invalid request'); }

    const check = await verifyTurnstile(request, env, body['cf-turnstile-response']);
    if (!check.ok) {
        return json({
            error: 'We could not confirm you are a person. Please try again.',
            reason: check.reason,
        }, 403);
    }

    const email = String(body.email || '').trim().toLowerCase();
    if (!looksLikeEmail(email)) return fail('That email address does not look right.');
    const name = cleanName(body.name);

    // Store first, tell the provider second. If the provider is down we
    // still have the person, and the admin panel can retry.
    const token = randomToken();
    try {
        await env.DB.prepare(
            `INSERT INTO subscribers (email, name, status, unsub_token, source, updated_at)
             VALUES (?, ?, 'pending', ?, 'website', datetime('now'))
             ON CONFLICT(email) DO UPDATE SET
                 name       = CASE WHEN excluded.name != '' THEN excluded.name ELSE subscribers.name END,
                 status     = CASE WHEN subscribers.status = 'unsubscribed' THEN 'pending' ELSE subscribers.status END,
                 updated_at = datetime('now')`,
        ).bind(email, name, token).run();
    } catch (e) {
        return fail(`Could not save your details: ${e.message}`, 500);
    }

    const sent = await PROVIDER.addSubscriber(env, { email, name });
    await env.DB.prepare(
        `UPDATE subscribers SET provider_state = ?, provider_note = ?, updated_at = datetime('now')
         WHERE email = ?`,
    ).bind(sent.ok ? 'sent' : 'error', sent.note || '', email).run();

    if (!sent.ok && !sent.alreadyThere) {
        // They are safely in our database, so this is recoverable, but
        // no confirmation email went out. Say so rather than pretending.
        return json({
            ok: false,
            saved: true,
            error: 'You are on our list, but the confirmation email could not be sent. '
                 + 'We will sort it out - no need to sign up again.',
        }, 502);
    }

    return json({ ok: true });
}


export async function handleUnsubscribe(request, env) {
    if (request.method !== 'POST') return fail('POST required', 405);

    let body;
    try { body = await request.json(); } catch { return fail('Invalid request'); }

    const check = await verifyTurnstile(request, env, body['cf-turnstile-response']);
    if (!check.ok) {
        return json({
            error: 'We could not confirm you are a person. Please try again.',
            reason: check.reason,
        }, 403);
    }

    const email = String(body.email || '').trim().toLowerCase();
    if (!looksLikeEmail(email)) return fail('That email address does not look right.');

    const existing = await env.DB
        .prepare('SELECT id FROM subscribers WHERE email = ?').bind(email).first();

    if (existing) {
        await env.DB.prepare(
            `UPDATE subscribers SET status = 'unsubscribed', updated_at = datetime('now')
             WHERE email = ?`,
        ).bind(email).run();
        await PROVIDER.unsubscribe(env, email);
    }

    // Same answer either way. Telling a stranger whether an address is on
    // the list would turn this into a membership checker.
    return json({ ok: true });
}


/* ================= admin routes ================= */

export async function handleSubscriberList(env) {
    const rows = await env.DB.prepare(
        `SELECT id, email, name, status, source, provider_state, provider_note,
                confirmed_at, created_at
         FROM subscribers ORDER BY created_at DESC LIMIT 1000`,
    ).all();

    const counts = await env.DB.prepare(
        'SELECT status, COUNT(*) AS n FROM subscribers GROUP BY status',
    ).all();

    const summary = { pending: 0, confirmed: 0, unsubscribed: 0 };
    for (const row of counts.results || []) summary[row.status] = row.n;

    return json({ subscribers: rows.results || [], counts: summary });
}


export async function handleSubscriberExport(env) {
    const rows = await env.DB.prepare(
        `SELECT email, name, status, source, confirmed_at, created_at
         FROM subscribers ORDER BY created_at`,
    ).all();

    // A leading tab defuses spreadsheet formula injection: a name of
    // "=cmd|..." would otherwise run when the CSV is opened in Excel.
    const cell = (value) => {
        const text = String(value ?? '');
        const safe = /^[=+\-@\t\r]/.test(text) ? `\t${text}` : text;
        return `"${safe.replace(/"/g, '""')}"`;
    };

    const lines = ['email,name,status,source,confirmed_at,created_at'];
    for (const r of rows.results || []) {
        lines.push([r.email, r.name, r.status, r.source, r.confirmed_at, r.created_at]
            .map(cell).join(','));
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(lines.join('\r\n'), {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="digitail-subscribers-${stamp}.csv"`,
            'Cache-Control': 'no-store',
        },
    });
}


/**
 * Pulls current states from the provider and writes them back to D1.
 *
 * People confirm by clicking a link in the provider's email, which never
 * touches this site, so this is how the database finds out. Also retries
 * anyone who failed to reach the provider on signup.
 */
export async function handleSubscriberSync(env) {
    const remote = await PROVIDER.listSubscribers(env);
    if (!remote.ok) return fail(`Could not reach the newsletter provider: ${remote.note}`, 502);

    let updated = 0;
    for (const person of remote.subscribers) {
        const result = await env.DB.prepare(
            `UPDATE subscribers
             SET status = ?,
                 confirmed_at = CASE WHEN ? = 'confirmed' AND confirmed_at IS NULL
                                     THEN datetime('now') ELSE confirmed_at END,
                 provider_state = 'sent',
                 updated_at = datetime('now')
             WHERE email = ? AND status != ?`,
        ).bind(person.status, person.status, person.email, person.status).run();
        if (result?.meta?.changes) updated += result.meta.changes;
    }

    // Anyone we hold who never reached the provider: try again.
    const stuck = await env.DB.prepare(
        `SELECT email, name FROM subscribers
         WHERE provider_state = 'error' AND status != 'unsubscribed' LIMIT 50`,
    ).all();

    let retried = 0;
    for (const person of stuck.results || []) {
        const sent = await PROVIDER.addSubscriber(env, person);
        await env.DB.prepare(
            `UPDATE subscribers SET provider_state = ?, provider_note = ?,
                                    updated_at = datetime('now')
             WHERE email = ?`,
        ).bind(sent.ok ? 'sent' : 'error', sent.note || '', person.email).run();
        if (sent.ok) retried += 1;
    }

    return json({ ok: true, seen: remote.subscribers.length, updated, retried });
}


export function newsletterHealth(env) {
    return {
        turnstileSecret: env.TURNSTILE_SECRET
            ? `set (${String(env.TURNSTILE_SECRET).length} chars)`
            : 'MISSING - signups will be refused',
        newsletterProvider: PROVIDER.name,
        providerKey: env.BUTTONDOWN_API_KEY
            ? `set (${String(env.BUTTONDOWN_API_KEY).length} chars)`
            : 'MISSING - no confirmation emails will send',
    };
}


/* ================= PROVIDER ================= *
 *
 * Everything below knows about Buttondown. Nothing above does.
 *
 * Buttondown runs the double opt-in itself: creating a subscriber makes
 * it send the confirm-your-email message and hold them as "unactivated"
 * until they click. That is why this site has no confirmation page of
 * its own.
 *
 * To move to another service, rewrite the three methods here to match
 * its API and change the two secret names. Nothing else in the codebase
 * refers to Buttondown.
 */

const BUTTONDOWN_API = 'https://api.buttondown.com/v1';

// Buttondown's states, mapped onto the three this site uses.
const STATE_MAP = {
    regular: 'confirmed',
    premium: 'confirmed',
    gifted: 'confirmed',
    unactivated: 'pending',
    unsubscribed: 'unsubscribed',
    removed: 'unsubscribed',
    complained: 'unsubscribed',
    undeliverable: 'unsubscribed',
    blocked: 'unsubscribed',
};

async function buttondown(env, path, options = {}) {
    if (!env.BUTTONDOWN_API_KEY) {
        return { ok: false, status: 0, note: 'BUTTONDOWN_API_KEY is not set' };
    }
    try {
        const response = await fetch(`${BUTTONDOWN_API}${path}`, {
            ...options,
            headers: {
                // trim() guards against an invisible pasted newline.
                Authorization: `Token ${String(env.BUTTONDOWN_API_KEY).trim()}`,
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        });
        let payload = null;
        try { payload = await response.json(); } catch { /* empty body is fine */ }
        return { ok: response.ok, status: response.status, payload };
    } catch (e) {
        return { ok: false, status: 0, note: `network: ${e.message}` };
    }
}

const PROVIDER = {
    name: 'buttondown',

    // Deliberately does not pass the visitor's IP address. Buttondown
    // accepts one for its own fraud checks, but Turnstile has already
    // done that job and not sending it keeps the privacy notice short.
    async addSubscriber(env, { email, name }) {
        const result = await buttondown(env, '/subscribers', {
            method: 'POST',
            body: JSON.stringify({
                email_address: email,
                ...(name ? { metadata: { name } } : {}),
                referrer_url: 'https://www.digitailstudios.com/',
            }),
        });

        if (result.ok) return { ok: true };

        // Already on the list is a success from the visitor's point of view.
        const code = result.payload?.code || '';
        const detail = JSON.stringify(result.payload || result.note || '').slice(0, 200);
        if (result.status === 400 && /exists|already|duplicate/i.test(detail)) {
            return { ok: true, alreadyThere: true };
        }
        return { ok: false, note: `${result.status} ${code} ${detail}`.trim() };
    },

    async unsubscribe(env, email) {
        const result = await buttondown(env, `/subscribers/${encodeURIComponent(email)}`, {
            method: 'PATCH',
            body: JSON.stringify({ type: 'unsubscribed' }),
        });
        return { ok: result.ok, note: result.note || `status ${result.status}` };
    },

    async listSubscribers(env) {
        const people = [];
        let page = 1;
        // Bounded so a paging bug cannot spin forever on a Worker.
        while (page <= 20) {
            const result = await buttondown(env, `/subscribers?page=${page}`);
            if (!result.ok) {
                return { ok: false, note: result.note || `status ${result.status}` };
            }
            const batch = result.payload?.results || [];
            for (const person of batch) {
                const email = String(person.email_address || '').toLowerCase();
                const status = STATE_MAP[person.type] || 'pending';
                if (email) people.push({ email, status });
            }
            if (!result.payload?.next || batch.length === 0) break;
            page += 1;
        }
        return { ok: true, subscribers: people };
    },
};
