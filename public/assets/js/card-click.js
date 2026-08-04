/**
 * Whole-card clicking.
 *
 * Every card on the site has a button or link that opens it. Most people
 * won't hunt for that, they'll click the card. So the card becomes the
 * click target and the button keeps doing exactly what it did.
 *
 * Rules that keep this from breaking things:
 *   - a click that lands on a real link or button is left alone, so
 *     nested links still go where they say
 *   - a click that follows a text selection is ignored, so people can
 *     select and copy from a card
 *   - keyboard users still tab to the real button; the card itself is
 *     never given a fake button role
 */

(function () {
    'use strict';

    // card selector -> the thing inside it that already opens it
    const CARDS = [
        ['.log-entry',    '.read-more, .read-log-btn, a[href], button'],
        ['.fox-card',     '.read-more, .read-bio-btn, a[href], button'],
        ['.player-card',  '.flip-hint'],
        ['.card',         '.read-more, a[href], button'],
        ['.banner',       'a[href]'],
        ['.feature-card', '.read-more, a[href], button'],
    ];

    const INTERACTIVE = 'a[href], button, input, select, textarea, label, [role="button"]';

    function hasSelection() {
        const sel = window.getSelection();
        return sel && sel.toString().length > 3;
    }

    function wire(card, triggerSelector) {
        if (card.dataset.cardClick) return;
        const trigger = card.querySelector(triggerSelector);
        if (!trigger) return;

        card.dataset.cardClick = '1';
        card.style.cursor = 'pointer';

        card.addEventListener('click', (e) => {
            // let real controls do their own thing
            if (e.target.closest(INTERACTIVE)) return;
            if (hasSelection()) return;
            if (e.defaultPrevented) return;

            e.preventDefault();
            trigger.click();
        });
    }

    function scan() {
        CARDS.forEach(([cardSel, triggerSel]) => {
            document.querySelectorAll(cardSel).forEach((card) => wire(card, triggerSel));
        });
    }

    function start() {
        scan();
        // Cards are rendered after the API responds, so keep watching,
        // but coalesce to one pass per frame.
        let queued = false;
        new MutationObserver(() => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; scan(); });
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
