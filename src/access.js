/**
 * ⚠️ THIS FILE IS A COPY. The identical file lives in the digitail-hub
 * repo at src/access.js. Two Workers on two hostnames both need to
 * verify the same Cloudflare Access tokens, and there is no shared
 * package between the repos to put it in.
 *
 * IF YOU CHANGE ONE, CHANGE BOTH. A drift between them means the hub
 * and the website disagree about who is signed in, and the one that is
 * wrong will be the one nobody is looking at.
 */

/**
 * Cloudflare Access token verification.
 *
 * THIS IS THE SECURITY BOUNDARY OF THE ENTIRE HUB. Everything else
 * trusts whatever this returns, so it is written to be paranoid and
 * read twice rather than clever.
 *
 * Access sits in front of this Worker and, once someone has logged in,
 * forwards a signed token on every request. That token says who they
 * are. Verifying it means four separate things, and skipping any one
 * of them makes the other three pointless:
 *
 *   1. The SIGNATURE is real, checked against Cloudflare's published
 *      public keys for this team. Without this, anyone can type a
 *      token that claims to be anyone.
 *
 *   2. The AUDIENCE matches THIS application's AUD tag. Without this,
 *      a valid token for any other Access application in the account
 *      would open the hub.
 *
 *   3. The ISSUER is our team domain. Without this, a token signed by
 *      somebody else's Cloudflare team would be accepted.
 *
 *   4. It has not EXPIRED and is not post-dated.
 *
 * FAILING CLOSED IS NOT OPTIONAL. Every path that cannot positively
 * prove all four returns null. There is deliberately no branch
 * anywhere in this file that returns an identity when something went
 * wrong - not for a network error fetching the keys, not for a
 * malformed token, not for a missing configuration value. The site
 * has already been bitten twice by a guard whose failure case looked
 * like its success case.
 */

const CERT_PATH = '/cdn-cgi/access/certs';

// Access sends the token as a header, and also as a cookie when the
// browser navigates. Check both: a fetch() from the page carries the
// cookie but not necessarily the header.
const HEADER = 'Cf-Access-Jwt-Assertion';
const COOKIE = 'CF_Authorization';

// The signing keys change rarely. Re-fetching them on every request
// would add a round trip to every page load, so they are held in
// module scope for a few minutes. This cache is best-effort by
// design - a Worker isolate can vanish at any moment, and a cold
// start simply fetches them again.
const KEY_CACHE_MS = 10 * 60 * 1000;
let keyCache = { at: 0, domain: '', keys: null };


/* ================= small helpers ================= */

function base64UrlToBytes(part) {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
        + '='.repeat((4 - (part.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function base64UrlToJson(part) {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

export function readToken(request) {
    const header = request.headers.get(HEADER);
    if (header) return header.trim();

    const raw = request.headers.get('Cookie') || '';
    for (const piece of raw.split(';')) {
        const eq = piece.indexOf('=');
        if (eq === -1) continue;
        if (piece.slice(0, eq).trim() !== COOKIE) continue;
        const value = piece.slice(eq + 1).trim();
        return value || null;
    }
    return null;
}


/* ================= keys ================= */

/**
 * Fetch the team's public signing keys.
 *
 * On failure this returns null and the caller rejects the request.
 * It does NOT return a stale cache or an empty key set - an empty key
 * set would make every signature check fail to find a key, and a
 * later refactor could easily turn "no key found" into "skip the
 * check". Better that the failure is loud and total.
 */
export async function fetchKeys(teamDomain, now = Date.now()) {
    if (keyCache.keys && keyCache.domain === teamDomain && (now - keyCache.at) < KEY_CACHE_MS) {
        return keyCache.keys;
    }

    let res;
    try {
        res = await fetch(`https://${teamDomain}${CERT_PATH}`);
    } catch {
        return null;
    }
    if (!res.ok) return null;

    let body;
    try { body = await res.json(); } catch { return null; }

    const keys = body && Array.isArray(body.keys) ? body.keys : null;
    if (!keys || !keys.length) return null;

    keyCache = { at: now, domain: teamDomain, keys };
    return keys;
}

// Exported so tests can start from a known state. Also used when a
// token names a key we have never seen, which is what a key rotation
// looks like from here.
export function clearKeyCache() {
    keyCache = { at: 0, domain: '', keys: null };
}


/* ================= verification ================= */

/**
 * Verify a token and return { email, sub, identityNonce } or null.
 *
 * `now` is injectable so the expiry checks can be tested without
 * waiting or freezing the clock.
 */
export async function verifyAccessToken(token, env, now = Date.now()) {
    const teamDomain = env.ACCESS_TEAM_DOMAIN;
    const aud = env.ACCESS_AUD;

    // Missing configuration is a refusal, never a bypass. If this ever
    // returned an identity when unconfigured, a typo in wrangler.toml
    // would silently open the hub to the internet.
    //
    // DELIBERATELY REDUNDANT, and the mutation harness cannot prove it.
    // With no team domain the issuer check fails anyway; with no aud the
    // audience check fails anyway. Removing this line changes no test
    // result. It stays because it fails FAST and, more importantly,
    // because it survives someone reordering the checks below - at which
    // point it stops being redundant and starts being the only thing
    // standing there. Faking a test for it would be worse than saying so.
    if (!teamDomain || !aud) return null;
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    let header;
    let payload;
    try {
        header = base64UrlToJson(parts[0]);
        payload = base64UrlToJson(parts[1]);
    } catch {
        return null;
    }

    // Only RS256. Refusing to read `alg` from the token and act on it
    // is the point: accepting "none", or an HMAC algorithm keyed on
    // the public key, are both classic ways to forge a token.
    if (!header || header.alg !== 'RS256' || !header.kid) return null;

    // Claim checks BEFORE the expensive signature check, so a junk
    // token costs almost nothing.
    const seconds = Math.floor(now / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= seconds) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > seconds) return null;

    if (payload.iss !== `https://${teamDomain}`) return null;

    // `aud` is an array in Access tokens, but the spec allows a bare
    // string, so handle both rather than assuming.
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audience.includes(aud)) return null;

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email) return null;

    let keys = await fetchKeys(teamDomain, now);
    if (!keys) return null;

    let jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
        // Unknown key id. Usually a rotation, so try once with a fresh
        // fetch before giving up.
        clearKeyCache();
        keys = await fetchKeys(teamDomain, now);
        if (!keys) return null;
        jwk = keys.find((k) => k.kid === header.kid);
        if (!jwk) return null;
    }

    let ok = false;
    try {
        const key = await crypto.subtle.importKey(
            'jwk',
            { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify'],
        );
        ok = await crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5',
            key,
            base64UrlToBytes(parts[2]),
            new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
        );
    } catch {
        return null;
    }

    if (!ok) return null;

    return {
        email,
        sub: typeof payload.sub === 'string' ? payload.sub : '',
        identityNonce: typeof payload.identity_nonce === 'string' ? payload.identity_nonce : '',
    };
}

/**
 * The one function the rest of the hub should call.
 * Returns the verified identity, or null - and null means send a 403.
 */
export async function identify(request, env, now = Date.now()) {
    return verifyAccessToken(readToken(request), env, now);
}
