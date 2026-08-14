/* Session guard for the admin panel.
 *
 * One job now: if a request comes back 401 because the Cloudflare Access
 * session ended mid-edit, send the browser back to /admin/ so Access can
 * ask for a fresh code - instead of leaving half the panel showing
 * baffling "Not logged in" errors.
 *
 * The keepalive ping went with the password login on 14 August 2026.
 * It existed to slide a 15-minute cookie window along; Cloudflare owns
 * the session now, and there is no cookie of ours left to refresh.
 */

(function () {
    'use strict';

    // Other admin modules reach for this, so it stays even though this
    // file no longer uses it for pings.
    window.__adminRawFetch = window.fetch.bind(window);

    // Access shows its own sign-in page in front of this path, so asking
    // for the panel again is what triggers a fresh login.
    const SIGN_IN_AGAIN = '/admin/';

    function goBackToAccess() {
        // Replace, not assign: the dead admin page should not sit in
        // history for Back to land on.
        window.location.replace(SIGN_IN_AGAIN);
    }

    // A single 401 is NOT proof that you are signed out - it might be one
    // odd request, a race on startup, or a stale cached response. The
    // first version of this file redirected on any 401 at all, and one
    // spurious 401 during page load was enough to bounce a freshly
    // signed-in user straight back out. So: confirm with the server
    // before throwing anyone out.
    let confirming = false;

    function confirmThenMaybeBounce() {
        if (confirming) return;
        confirming = true;
        window.__adminRawFetch('/api/auth/me', { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.loggedIn === false) goBackToAccess();
            })
            .catch(function () { /* can't reach the server: stay put */ })
            .then(function () { confirming = false; });
    }

    const originalFetch = window.__adminRawFetch;

    window.fetch = function () {
        return originalFetch.apply(this, arguments).then(function (response) {
            if (response.status !== 401) return response;

            let path = '';
            try { path = new URL(response.url, window.location.href).pathname; } catch { /* ignore */ }

            // /me is how we check - never loop on it.
            if (path.indexOf('/api/auth/me') === 0) return response;

            confirmThenMaybeBounce();
            return response;
        });
    };
}());
