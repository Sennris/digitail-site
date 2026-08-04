/**
 * Accessibility support.
 *
 * Two separate jobs:
 *
 *  1. A display options panel. NOT an "accessibility mode" — the site
 *     itself has to work for everyone. This only exists because the
 *     design makes choices no operating system knows about: film grain,
 *     rotated cards, an infinitely scrolling ticker. People should be
 *     able to turn those down.
 *
 *     Defaults come from the visitor's OS settings, so someone who
 *     already has reduce-motion on system-wide gets it without touching
 *     anything here.
 *
 *  2. Keyboard support for things that were mouse-only: the team card
 *     flip, the hidden paws, and the devlog modal.
 */

(function () {
    'use strict';

    const KEY = 'digitail-display-prefs';

    const PREFS = [
        {
            id: 'reduce-motion',
            labelEn: 'Reduce motion',
            labelMi: 'Whakaiti nekehanga',
            hintEn: 'Stops the ticker and the card animations',
            system: '(prefers-reduced-motion: reduce)',
        },
        {
            id: 'reduce-noise',
            labelEn: 'Reduce visual noise',
            labelMi: 'Whakaiti tioro ā-kite',
            hintEn: 'Removes the grain and straightens tilted cards',
            system: '(prefers-contrast: more)',
        },
        {
            id: 'large-text',
            labelEn: 'Larger text',
            labelMi: 'Kupu nui ake',
            hintEn: 'Increases text size across the site',
            system: null,
        },
    ];

    /* ---------- state ---------- */

    function systemDefault(pref) {
        return pref.system ? window.matchMedia(pref.system).matches : false;
    }

    function load() {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(KEY)) || {};
        } catch { /* start fresh */ }

        const state = {};
        PREFS.forEach((p) => {
            state[p.id] = p.id in saved ? saved[p.id] : systemDefault(p);
        });
        return state;
    }

    function apply(state) {
        PREFS.forEach((p) => {
            document.documentElement.classList.toggle('pref-' + p.id, !!state[p.id]);
        });
    }

    function save(state) {
        try {
            localStorage.setItem(KEY, JSON.stringify(state));
        } catch { /* private browsing, no harm */ }
    }

    let state = load();
    apply(state);

    /* ---------- the panel ---------- */

    function buildPanel() {
        const wrap = document.createElement('div');
        wrap.className = 'display-prefs';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-rugged nav-lang display-prefs__toggle';
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'display-prefs-panel');
        btn.innerHTML = '<span class="en">Display</span><span class="mi">Whakaaturanga</span>';

        const panel = document.createElement('div');
        panel.id = 'display-prefs-panel';
        panel.className = 'display-prefs__panel';
        panel.hidden = true;
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'Display options');

        panel.innerHTML = '<h2 class="display-prefs__title">'
            + '<span class="en">Display options</span>'
            + '<span class="mi">Kōwhiringa whakaaturanga</span></h2>'
            + PREFS.map((p) => `
                <label class="display-prefs__row">
                    <input type="checkbox" data-pref="${p.id}">
                    <span>
                        <span class="display-prefs__label">
                            <span class="en">${p.labelEn}</span>
                            <span class="mi">${p.labelMi}</span>
                        </span>
                        <span class="display-prefs__hint">${p.hintEn}</span>
                    </span>
                </label>`).join('');

        wrap.append(btn, panel);

        panel.querySelectorAll('input[data-pref]').forEach((input) => {
            input.checked = !!state[input.dataset.pref];
            input.addEventListener('change', () => {
                state[input.dataset.pref] = input.checked;
                apply(state);
                save(state);
            });
        });

        function close() {
            panel.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        }

        btn.addEventListener('click', () => {
            const open = panel.hidden;
            panel.hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
            if (open) panel.querySelector('input').focus();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !panel.hidden) {
                close();
                btn.focus();
            }
        });

        document.addEventListener('click', (e) => {
            if (!panel.hidden && !wrap.contains(e.target)) close();
        });

        return wrap;
    }

    /* ---------- keyboard support for mouse-only widgets ---------- */

    function enhanceModals() {
        document.querySelectorAll('.modal-overlay, #devlog-modal, #fox-modal').forEach((modal) => {
            if (!modal || modal.dataset.a11yReady) return;
            modal.dataset.a11yReady = '1';

            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            const title = modal.querySelector('.modal-title');
            if (title) {
                if (!title.id) title.id = 'modal-title-' + Math.random().toString(36).slice(2, 7);
                modal.setAttribute('aria-labelledby', title.id);
            }

            let lastFocused = null;

            // Watch for the modal being shown so focus can move into it
            new MutationObserver(() => {
                const visible = getComputedStyle(modal).display !== 'none'
                    && !modal.hasAttribute('hidden');
                if (visible && !modal.dataset.open) {
                    modal.dataset.open = '1';
                    lastFocused = document.activeElement;
                    const target = modal.querySelector('.modal-close-btn, button, [href]');
                    if (target) target.focus();
                } else if (!visible && modal.dataset.open) {
                    delete modal.dataset.open;
                    if (lastFocused && lastFocused.focus) lastFocused.focus();
                }
            }).observe(modal, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });

            // Escape closes, and Tab stays inside while it's open
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const close = modal.querySelector('.modal-close-btn');
                    if (close) close.click();
                    return;
                }
                if (e.key !== 'Tab') return;

                const focusable = [...modal.querySelectorAll(
                    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
                )].filter((el) => el.offsetParent !== null);
                if (!focusable.length) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            });
        });
    }

    /* ---------- boot ---------- */

    function mount() {
        const nav = document.querySelector('.site-nav');
        if (nav && !nav.querySelector('.display-prefs')) {
            nav.appendChild(buildPanel());
        }
        enhanceModals();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }

    // Modals and cards are built after content loads, so keep looking.
    new MutationObserver(enhanceModals).observe(document.documentElement,
        { childList: true, subtree: true });
})();
