/* Session guard for the admin panel.
 *
 * Two jobs:
 *
 * 1. While this tab is open, ping /api/auth/keepalive every few minutes.
 *    Each ping slides the 15-minute session window along, so the panel
 *    stays signed in for as long as it is actually open. Close the tab
 *    or walk away and the session expires on its own.
 *
 * 2. If any request comes back 401 - the session lapsed mid-edit - send
 *    the browser to the login page instead of leaving half the panel
 *    showing baffling "Not logged in" errors.
 */

(function () {
    'use strict';

    window.__adminRawFetch = window.fetch.bind(window);

    const PING_EVERY_MS = 4 * 60 * 1000;
    const LOGIN_PAGE = '/admin/login.html';

    function goToLogin() {
        // Replace, not assign: the dead admin page should not sit in
        // history for Back to land on.
        window.location.replace(LOGIN_PAGE);
    }

    // ---- 1. keepalive -------------------------------------------------
    function ping() {
        // Raw fetch, not the wrapped one below: the keepalive must not
        // feed its own 401 back into the logout check.
        window.__adminRawFetch('/api/auth/keepalive', { method: 'POST' })
            .then(function (response) {
                if (response.status === 401) confirmThenMaybeLogout();
            })
            .catch(function () { /* offline blip; the next ping retries */ });
    }

    setInterval(ping, PING_EVERY_MS);

    // Coming back to a background tab: check straight away rather than
    // waiting for the next interval, so a lapsed session bounces to
    // login before any half-working clicking happens.
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') ping();
    });

    // ---- 2. catch 401s from the panel's own requests ------------------
    //
    // A single 401 is NOT proof that you are logged out - it might be one
    // odd request, a race on startup, or a stale cached response. The
    // first version of this file redirected on any 401 at all, and one
    // spurious 401 during page load was enough to bounce a freshly
    // logged-in user straight back to the login screen. So: confirm with
    // the server before throwing anyone out.
    let confirming = false;

    function confirmThenMaybeLogout() {
        if (confirming) return;
        confirming = true;
        window.__adminRawFetch('/api/auth/me', { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.loggedIn === false) goToLogin();
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

            // These legitimately answer 401 while you type a wrong
            // password, and /me is how we check - never loop on them.
            if (path.indexOf('/api/auth/login') === 0
                || path.indexOf('/api/auth/setup') === 0
                || path.indexOf('/api/auth/me') === 0) {
                return response;
            }

            confirmThenMaybeLogout();
            return response;
        });
    };

    // Give the page a moment to settle before the first keepalive, so a
    // startup hiccup can never be mistaken for a lapsed session.
    setTimeout(ping, 30 * 1000);
}());
