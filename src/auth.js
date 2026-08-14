/**
 * Who is allowed into the admin panel.
 *
 * ONE WAY IN: a signed Cloudflare Access token, the same login as the
 * studio hub. The site's own email-and-password login was deleted on
 * 14 August 2026 - passwords, salts, session cookies, the sliding
 * keepalive window, the rate limiter and the setup page all went with
 * it. If you are looking for them in the history, they were removed in
 * one commit, not left to rot.
 *
 * WHY THERE IS NO PASSWORD ANY MORE
 * Two ways in meant two lists of who counts, and they disagreed: a
 * volunteer signed in through Access saw somebody else's address
 * labelled "(you)", because the panel was showing the Access identity
 * while he was thinking of his password account. It also meant there was
 * no answer to "I forgot my password" that did not involve building a
 * whole reset flow for a second login nobody needed. Access already
 * sends one-time codes, and the hub already records who may publish.
 *
 * WHERE PERMISSION ACTUALLY LIVES - two separate things, both required:
 *   1. Cloudflare Access decides who can reach /admin at all.
 *   2. `people.can_edit_site` in the shared database decides who the
 *      Worker will then serve. That flag is set on the hub's People
 *      screen. The website never writes it.
 *
 * Somebody on the Access list without the flag is refused with a
 * sentence saying exactly that, rather than a blank page - it is the
 * "logged in but not on the team" confusion, and it is not a bug.
 */

import { identify } from './access.js';


/* ---------- who is asking ---------- */

/**
 * Returns { ok: true, session } or { ok: false, reason, email }.
 *
 * The reason exists so the page can say what is actually wrong. Every
 * failure is still a refusal - nothing here can be talked into ok.
 */
export async function adminIdentity(request, env) {
    // Unconfigured means this route does not exist. It must NEVER mean
    // "let them in" - a Worker deployed without its Access variables
    // would otherwise be an open admin panel.
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
        return { ok: false, reason: 'not-configured' };
    }

    const identity = await identify(request, env);
    if (!identity) return { ok: false, reason: 'no-token' };

    let person;
    try {
        person = await env.DB
            .prepare('SELECT id, email, can_edit_site FROM people WHERE email = ? AND active = 1')
            .bind(identity.email).first();
    } catch {
        // The people table lives in the hub's migrations. If the shared
        // database is unreachable, say so rather than implying the
        // person is not allowed - those need different actions from
        // whoever is reading the message.
        return { ok: false, reason: 'database', email: identity.email };
    }

    if (!person) return { ok: false, reason: 'not-on-team', email: identity.email };
    if (!person.can_edit_site) return { ok: false, reason: 'not-an-editor', email: person.email };

    return {
        ok: true,
        session: { email: person.email, personId: person.id, viaAccess: true },
    };
}

/**
 * The shape every route already expects: a session, or null.
 *
 * Kept deliberately. Thirteen call sites read it, and rewriting all of
 * them in the same commit that removes the password login would have
 * made the change impossible to check.
 */
export async function requireAuth(request, env) {
    const result = await adminIdentity(request, env);
    return result.ok ? result.session : null;
}
