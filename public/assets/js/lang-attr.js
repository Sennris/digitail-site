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
        syncOptions(mi);
    }

    /**
     * <option> is the one place the .en / .mi span trick cannot work.
     * display:none on an option is ignored by Safari and by some Android
     * browsers, so both languages showed up in the list. These options
     * carry their two labels as data attributes instead and swap text.
     */
    function syncOptions(mi) {
        document.querySelectorAll('option[data-en][data-mi]').forEach((opt) => {
            const text = mi ? opt.dataset.mi : opt.dataset.en;
            if (text && opt.textContent !== text) opt.textContent = text;
        });
    }

    new MutationObserver(sync).observe(document.body, {
        attributes: true,
        attributeFilter: ['class'],
    });

    sync();
})();
