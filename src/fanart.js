/**
 * Digi Tail Studios - fan art
 *
 *   POST /api/fanart/submit             public, gated on Turnstile
 *   GET  /api/fanart/submissions        admin, the review queue
 *   PATCH /api/fanart/submissions/:id   admin, decline or reopen
 *   POST /api/fanart/publish            admin, submission -> gallery
 *
 * The public reads the gallery through /api/content/fanArt, which is a
 * different table entirely - see migrations/0014. Nothing in this file
 * lets a submission reach the public reader.
 *
 * THE CONSENT WORDING IS THE SERVER'S, NOT THE BROWSER'S. The form
 * displays CONSENT_TEXT and the handler stores CONSENT_TEXT; it never
 * stores what the browser sent. A client-supplied consent string is a
 * consent record that says whatever the submitter's console typed.
 */

const NO_CACHE = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
};

const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: NO_CACHE });

const fail = (message, status = 400) =>
    new Response(JSON.stringify({ error: message }), { status, headers: NO_CACHE });


/**
 * The exact sentence somebody agrees to. Changing it is fine - every
 * row already stored keeps the wording that was on screen when it was
 * ticked, which is the entire reason consent_text is a snapshot rather
 * than a boolean.
 */
export const CONSENT_TEXT =
    'This is my own artwork, and I give Digi Tail Studios permission to '
    + 'show it on their website with the credit above. I understand I can '
    + 'ask for it to be taken down at any time.';

const MAX_NAME = 80;
const MAX_TITLE = 120;
const MAX_NOTE = 1000;
const MAX_URL = 500;


export function cleanText(value, limit) {
    if (typeof value !== 'string') return '';
    // Newlines and tabs collapse to spaces: these land in a single-line
    // credit on a public page, and a name containing a line break makes
    // the layout look broken rather than making anybody safer.
    return value.replace(/[\r\n\t]/g, ' ').trim().slice(0, limit);
}

/**
 * A link is only ever http or https.
 *
 * `javascript:` in a href is a working script tag with extra steps, and
 * these values go straight into an anchor on a public page. Checking
 * the protocol with the URL parser rather than a regex means no clever
 * encoding gets past it - `java\tscript:` and `JaVaScRiPt:` both fail
 * here and both defeat a naive string test.
 */
export function cleanUrl(value) {
    const text = cleanText(value, MAX_URL);
    if (!text) return '';
    let parsed;
    try { parsed = new URL(text); } catch { return null; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
}

function looksLikeEmail(value) {
    return typeof value === 'string'
        && value.length <= 254
        && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value.trim());
}


/* ================= public: submit ================= */

export async function handleFanArtSubmit(request, env, verifyTurnstile) {
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

    const artistName = cleanText(body.artistName, MAX_NAME);
    if (!artistName) return fail('Please tell us how you would like to be credited.');

    const artUrl = cleanUrl(body.artUrl);
    if (artUrl === null) return fail('That art link does not look like a web address.');
    if (!artUrl) return fail('Please give us a link to your art.');

    const creditLink = cleanUrl(body.creditLink);
    if (creditLink === null) return fail('That link to you does not look like a web address.');

    // Optional, and the only genuinely personal field. An address that
    // is present must at least look like one - a typo here means we
    // cannot tell somebody their art went up.
    const contactEmail = cleanText(body.contactEmail, 254).toLowerCase();
    if (contactEmail && !looksLikeEmail(contactEmail)) {
        return fail('That email address does not look right. You can also leave it blank.');
    }

    // The tick is required and is checked here, not just in the browser.
    // A form that only validates client-side has no consent record at
    // all, it has a habit.
    if (body.consent !== true) {
        return fail('We can only show your art if you tick the permission box.');
    }

    try {
        await env.DB.prepare(
            `INSERT INTO fan_art_submissions
                (artist_name, credit_link, art_url, title, note, contact_email,
                 consent_text, consent_at, status, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'new', datetime('now'))`,
        ).bind(
            artistName,
            creditLink,
            artUrl,
            cleanText(body.title, MAX_TITLE),
            cleanText(body.note, MAX_NOTE),
            contactEmail,
            // OUR wording, never theirs.
            CONSENT_TEXT,
        ).run();
    } catch (e) {
        return fail(`Could not save your submission: ${e.message}`, 500);
    }

    return json({ ok: true });
}


/* ================= admin: the queue ================= */

export async function handleSubmissionList(env) {
    const { results } = await env.DB.prepare(
        `SELECT * FROM fan_art_submissions
         ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, submitted_at DESC
         LIMIT 500`,
    ).all();

    return json({
        submissions: (results || []).map((r) => ({
            id: r.id,
            artistName: r.artist_name,
            creditLink: r.credit_link,
            artUrl: r.art_url,
            title: r.title,
            note: r.note,
            contactEmail: r.contact_email,
            consentText: r.consent_text,
            consentAt: r.consent_at,
            status: r.status,
            submittedAt: r.submitted_at,
        })),
    });
}

export async function handleSubmissionUpdate(request, env, id) {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid request'); }

    const status = String(body.status || '');
    if (!['new', 'declined', 'published'].includes(status)) {
        return fail('That is not a submission status.');
    }
    // A declined row is KEPT. The same piece arriving twice should be
    // recognisable, so nobody gets asked about it a second time.
    await env.DB.prepare('UPDATE fan_art_submissions SET status = ? WHERE id = ?')
        .bind(status, Number(id)).run();
    return json({ ok: true });
}


/**
 * Publish a submission into the gallery.
 *
 * ONE BUTTON, NOT RETYPING. The artist name and credit link are carried
 * across verbatim from what they submitted. A credit retyped by hand is
 * a credit that eventually goes wrong, and a wrong credit on fan art is
 * the one mistake here that actually hurts somebody.
 *
 * The team supplies only the two things the artist cannot: the uploaded
 * image, and alt text.
 */
export async function handleFanArtPublish(request, env) {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid request'); }

    const submissionId = Number(body.submissionId || 0);
    const row = await env.DB.prepare('SELECT * FROM fan_art_submissions WHERE id = ?')
        .bind(submissionId).first();
    if (!row) return fail('That submission no longer exists.', 404);

    const image = cleanText(body.image, MAX_URL);
    if (!image) return fail('Upload the image before publishing.');

    const last = await env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM fan_art').first();

    await env.DB.prepare(
        `INSERT INTO fan_art
            (artist_name, credit_link, title, image, alt_text, permission_note,
             submission_id, enabled, position, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
    ).bind(
        row.artist_name,
        row.credit_link,
        row.title,
        image,
        cleanText(body.altText, MAX_TITLE) || `Fan art by ${row.artist_name}`,
        `Submitted through the website form on ${row.submitted_at}, permission ticked ${row.consent_at}.`,
        row.id,
        (last?.p || 0) + 1,
    ).run();

    await env.DB.prepare("UPDATE fan_art_submissions SET status = 'published' WHERE id = ?")
        .bind(row.id).run();

    return json({ ok: true });
}
