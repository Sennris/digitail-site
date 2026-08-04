/**
 * Keeps <html lang> in step with the language toggle.
 *
 * The toggle swaps a class on <body>, which controls what's visible, but
 * screen readers read the lang attribute on <html>. Without this, a
 * screen reader announces te reo Māori content using English
 * pronunciation rules.
 *
 * Deliberately standalone so it works regardless of which toggle
 * implementation a page is using.
 */
(function () {
    'use strict';

    function sync() {
        const mi = document.body.classList.contains('lang-mi');
        document.documentElement.setAttribute('lang', mi ? 'mi' : 'en');
    }

    new MutationObserver(sync).observe(document.body, {
        attributes: true,
        attributeFilter: ['class'],
    });

    sync();
})();
