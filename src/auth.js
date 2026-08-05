/**
 * Authentication for the admin panel.
 *
 * Passwords: PBKDF2-SHA256, 210,000 iterations, 16 byte random salt.
 * Sessions:  HMAC-SHA256 signed token in an HttpOnly cookie.
 *
 * No password is ever stored or logged in plain text, and the session
 * secret lives in a Cloudflare secret, never in the repo.
 */

// Cloudflare Workers rejects PBKDF2 above 100,000 iterations, and the
// free plan allows only 10ms of CPU per request, which in practice caps
// this at around 10,000. That is low on its own, so every password is
// also peppered with a secret that lives in Cloudflare rather than in
// the database. A stolen database is useless without it.
const ITERATIONS = 8000;
// Sessions are short and sliding rather than long and fixed. The admin
// panel pings /api/auth/keepalive while its tab is open, and every admin
// page load re-issues the cookie, so working in the panel keeps you in
// indefinitely. Walk away, close the tab, or close the browser, and the
// session dies within this window. The cookie itself has no Max-Age, so
// it also does not survive the browser closing.
const IDLE_MINUTES = 15;
const COOKIE_NAME = 'dt_session';

const enc = new TextEncoder();


/* ---------- helpers ---------- */

function toHex(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

/** Constant-time compare, so an attacker can't time their way in. */
function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}


/* ---------- passwords ---------- */

/** Mix the pepper into the password before it ever reaches PBKDF2. */
// SESSION_SECRET is deliberately never trimmed or normalised. It peppers
// every stored password hash, so changing its bytes in any way - even
// stripping whitespace it might contain - would invalidate the admin
// password. Whatever was set is what must be used, exactly.
async function pepper(password, secret) {
    if (!secret) return password;
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(password));
    return toHex(mac);
}

export async function hashPassword(password, saltHex, secret) {
    const peppered = await pepper(password, secret);
    const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', enc.encode(peppered), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
        key,
        256
    );
    return { hash: toHex(bits), salt: toHex(salt) };
}

export async function verifyPassword(password, storedHash, storedSalt, secret) {
    const { hash } = await hashPassword(password, storedSalt, secret);
    return safeEqual(hash, storedHash);
}


/* ---------- sessions ---------- */

async function sign(payload, secret) {
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    return toHex(sig);
}

/* Base64 of UTF-8. btoa alone mangles anything non-ASCII. */
function b64encode(str) {
    return btoa(String.fromCharCode(...enc.encode(str)));
}

function b64decode(b64) {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export async function createSession(userId, email, secret) {
    // JSON rather than a delimited string: emails contain dots, which
    // used to collide with the separator and silently break expiry.
    const payload = JSON.stringify({
        uid: userId,
        email,
        exp: Date.now() + IDLE_MINUTES * 60 * 1000,
    });
    const sig = await sign(payload, secret);
    return `${b64encode(payload)}.${sig}`;
}

export async function readSession(token, secret) {
    if (!token || !token.includes('.')) return null;

    const idx = token.lastIndexOf('.');
    const payloadB64 = token.slice(0, idx);
    const sig = token.slice(idx + 1);

    let payload;
    try {
        payload = b64decode(payloadB64);
    } catch {
        return null;
    }

    const expected = await sign(payload, secret);
    if (!safeEqual(sig, expected)) return null;

    let claims;
    try {
        claims = JSON.parse(payload);
    } catch {
        return null;
    }

    if (!claims || typeof claims.exp !== 'number') return null;
    if (Date.now() > claims.exp) return null;

    return { userId: claims.uid, email: claims.email };
}


/* ---------- cookies ---------- */

export function sessionCookie(token) {
    // Deliberately no Max-Age: a cookie without one is dropped when the
    // browser closes, which is half of the sign-out-on-leave behaviour.
    return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`;
}

export function clearCookie() {
    return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function getCookie(request) {
    const header = request.headers.get('Cookie') || '';
    for (const part of header.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === COOKIE_NAME) return v.join('=');
    }
    return null;
}


/* ---------- request guard ---------- */

export async function requireAuth(request, env) {
    if (!env.SESSION_SECRET) return null;
    return readSession(getCookie(request), env.SESSION_SECRET);
}


/* ---------- rate limiting ---------- */

/** Returns true if this IP has burned through its attempts. */
export async function isRateLimited(db, ip) {
    const row = await db
        .prepare(`SELECT COUNT(*) AS n FROM login_attempts
                  WHERE ip = ? AND success = 0
                    AND attempted_at > datetime('now', '-15 minutes')`)
        .bind(ip)
        .first();
    return (row?.n || 0) >= 5;
}

export async function logAttempt(db, ip, email, success) {
    await db
        .prepare('INSERT INTO login_attempts (ip, email, success) VALUES (?, ?, ?)')
        .bind(ip, email || '', success ? 1 : 0)
        .run();
    // opportunistic cleanup so the table doesn't grow forever
    await db
        .prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')")
        .run();
}
