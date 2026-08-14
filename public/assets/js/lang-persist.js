/**
 * Remembers which language the site is being read in.
 *
 * Every page carries its own copy of the language toggle, and each one
 * only flips a class on <body>. Nothing wrote that choice down, so
 * clicking through to a second page put a te reo reader back into
 * English. Reported by the team, 14 Aug 2026.
 *
 * Deliberately standalone, the same shape as lang-attr.js: it does not
 * touch, replace or depend on any page's toggle, it just watches the
 * class those toggles set. That keeps it clear of the site.js
 * consolidation, which is on hold.
 *
 * Loaded from <head>. A script at the end of <body> would paint the page
 * in the wrong language first and swap it a moment later, which reads as
 * a flicker rather than a preference.
 */
(function () {
    'use strict';

    var KEY = 'digitail-lang';

    // A browser with storage switched off, or a private window that
    // refuses it, must not take the page down with it.
    function stored() {
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }

    function remember(lang) {
        try { localStorage.setItem(KEY, lang); } catch (e) { /* nothing to do */ }
    }

    function current(body) {
        return body.classList.contains('lang-mi') ? 'mi' : 'en';
    }

    function watch(body) {
        var last = current(body);
        // A MutationObserver that acts unconditionally retriggers itself.
        // This one writes to storage rather than the DOM, but the guard
        // stays: no change, no work.
        new MutationObserver(function () {
            var now = current(body);
            if (now === last) return;
            last = now;
            remember(now);
        }).observe(body, { attributes: true, attributeFilter: ['class'] });
    }

    function apply(body) {
        var want = stored();
        if (want === 'mi' || want === 'en') {
            body.classList.remove('lang-en', 'lang-mi');
            body.classList.add('lang-' + want);
            document.documentElement.setAttribute('lang', want);
        }
        watch(body);
    }

    if (document.body) {
        apply(document.body);
    } else {
        // Running from <head>, so <body> does not exist yet. Waiting for
        // DOMContentLoaded would be too late to avoid the flicker.
        var early = new MutationObserver(function (records, obs) {
            if (!document.body) return;
            obs.disconnect();
            apply(document.body);
        });
        early.observe(document.documentElement, { childList: true });
    }
})();
