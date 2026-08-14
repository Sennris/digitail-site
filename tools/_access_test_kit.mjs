/**
 * Signing in, for tests.
 *
 * Since 14 August 2026 there is one way into the admin: a signed
 * Cloudflare Access token. That means every suite that exercises an
 * authenticated write has to mint one, so the minting lives here
 * instead of being copied into five files.
 *
 * REAL keys and REAL signatures. A security check tested against a mock
 * of itself proves nothing - these tokens are verified by exactly the
 * same code that verifies Cloudflare's.
 *
 * Usage:
 *
 *   const kit = await accessKit();
 *   kit.addPeopleTable(db);                 // the hub's table, mirrored
 *   const headers = await kit.headers('cat@test.nz');
 *   const env = { ...kit.vars, DB: d1(db) };
 */

const TEAM = 'autumn-recipe-b82c.cloudflareaccess.com';
const AUD = 'test-audience-tag';
const KID = 'test-key-1';

const b64url = (bytes) => Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const part = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

export async function accessKit() {
    const pair = await crypto.subtle.generateKey(
        {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true,
        ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const jwks = { keys: [{ kid: KID, kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256' }] };

    // The verifier fetches Cloudflare's public keys. Wrap whatever fetch
    // is already installed rather than replacing it - test_newsletter
    // stubs fetch for Buttondown, and clobbering that would make this
    // helper break suites it is meant to serve.
    const previous = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const url = String(input && input.url ? input.url : input);
        if (url.includes('/cdn-cgi/access/certs')) {
            return new Response(JSON.stringify(jwks), { status: 200 });
        }
        if (typeof previous === 'function') return previous(input, init);
        throw new Error(`unexpected fetch in a test: ${url}`);
    };

    async function token(email, opts = {}) {
        const header = { alg: 'RS256', kid: KID, typ: 'JWT' };
        const seconds = Math.floor(Date.now() / 1000);
        const payload = {
            aud: [opts.aud || AUD],
            iss: `https://${opts.iss || TEAM}`,
            email,
            sub: 'sub-1',
            // Minted from Date.now() on purpose. The Worker entry point
            // deliberately has no injectable clock, so a fixed timestamp
            // would make the suite pass or fail by time of day.
            exp: seconds + 3600,
            iat: seconds,
        };
        const input = `${part(header)}.${part(payload)}`;
        const signature = await crypto.subtle.sign(
            'RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
        return `${input}.${b64url(new Uint8Array(signature))}`;
    }

    return {
        vars: { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD },
        token,
        async headers(email, extra = {}) {
            return { ...extra, 'Cf-Access-Jwt-Assertion': await token(email) };
        },
        /**
         * The hub owns `people`; the website only reads it. Mirrored here
         * rather than imported, because the two repos do not share
         * migrations - and the site's own migrations do not create it.
         */
        addPeopleTable(db, rows) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS people (
                    id INTEGER PRIMARY KEY, name TEXT, display_name TEXT, email TEXT,
                    role TEXT, is_director INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
                    can_edit_site INTEGER DEFAULT 0
                );
            `);
            const seed = rows || [
                [1, 'Caitlin', 'cat@test.nz', 1, 1, 1],
                [2, 'Writer', 'writer@test.nz', 0, 1, 1],
                [3, 'Volunteer', 'vol@test.nz', 0, 1, 0],
                [4, 'Departed', 'gone@test.nz', 1, 0, 1],
            ];
            for (const [id, name, email, isDirector, active, canEdit] of seed) {
                db.prepare(`INSERT OR REPLACE INTO people
                    (id, name, display_name, email, is_director, active, can_edit_site)
                    VALUES (?,?,?,?,?,?,?)`).run(id, name, name, email, isDirector, active, canEdit);
            }
        },
    };
}
