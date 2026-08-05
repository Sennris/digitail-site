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

    const PING_EVERY_MS = 4 * 60 * 1000;
    const LOGIN_PAGE = '/admin/login.html';

    function goToLogin() {
        // Replace, not assign: the dead admin page should not sit in
        // history for Back to land on.
        window.location.replace(LOGIN_PAGE);
    }

    // ---- 1. keepalive -------------------------------------------------
    function ping() {
        fetch('/api/auth/keepalive', { method: 'POST' })
            .then(function (response) {
                if (response.status === 401) goToLogin();
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
    const originalFetch = window.fetch;
    window.fetch = function () {
        return originalFetch.apply(this, arguments).then(function (response) {
            if (response.status === 401) {
                let path = '';
                try { path = new URL(response.url, window.location.href).pathname; } catch { /* ignore */ }
                // Login and setup legitimately answer 401 while you type
                // a wrong password; do not loop on those.
                if (path.indexOf('/api/auth/login') !== 0
                    && path.indexOf('/api/auth/setup') !== 0) {
                    goToLogin();
                }
            }
            return response;
        });
    };
}());
