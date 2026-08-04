/**
 * Ticker editor for the admin panel.
 *
 * Injects a panel into the homepage tab for editing the scrolling strip
 * on the front page. Writes into data.homepage.ticker, so the existing
 * "Save to site" button saves it with everything else.
 */

(function () {
    'use strict';

    const DEFAULTS = {
        enabled: true,
        speed: 32,
        items: [
            '🦊 DEVLOGS EVERY WEEK',
            '❄️ MADE IN ŌTAUTAHI',
            '🎮 WISHLIST SOON',
            '☕ POWERED BY LONG BLACKS',
            '🐾 THREE PAWS HIDDEN ON THIS SITE',
        ],
    };

    function panel() {
        const el = document.createElement('div');
        el.id = 'ticker-editor';
        el.style.cssText =
            'border:3px solid #5DCCCA; border-radius:6px; padding:1.25rem; margin-bottom:1.5rem;'
            + 'background:rgba(93,204,202,0.06);';
        el.innerHTML = `
            <h3 style="font-family:var(--font-display); margin:0 0 0.35rem;">
                📢 Homepage ticker
            </h3>
            <p style="font-family:var(--font-mono); font-size:0.78rem; opacity:0.75; margin:0 0 1rem;">
                The scrolling strip under the navigation. One line per message.
                Emoji are fine.
            </p>

            <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.9rem;
                          font-family:var(--font-mono); font-size:0.85rem; cursor:pointer;">
                <input type="checkbox" id="ticker-enabled" style="width:auto; margin:0;">
                Show the ticker
            </label>

            <label style="display:block; font-family:var(--font-mono); font-size:0.8rem;
                          margin-bottom:0.3rem;">Messages</label>
            <textarea id="ticker-items" rows="6"
                style="width:100%; font-family:var(--font-mono); font-size:0.85rem;
                       padding:0.6rem; border-radius:4px;"
                placeholder="🦊 DEVLOGS EVERY WEEK"></textarea>

            <label style="display:block; font-family:var(--font-mono); font-size:0.8rem;
                          margin:0.9rem 0 0.3rem;">
                Scroll speed: <span id="ticker-speed-label">32</span>s per loop
                <span style="opacity:0.6;">(lower is faster)</span>
            </label>
            <input type="range" id="ticker-speed" min="10" max="90" step="2"
                   style="width:100%; padding:0;">

            <div style="margin-top:1rem; padding-top:0.9rem; border-top:2px dashed rgba(185,204,204,0.3);">
                <div style="font-family:var(--font-mono); font-size:0.75rem; opacity:0.7;
                            margin-bottom:0.4rem;">Preview</div>
                <div id="ticker-preview" style="overflow:hidden; white-space:nowrap;
                     background:#5DCCCA; color:#1D0D12; padding:0.4rem 0; border-radius:3px;
                     font-family:var(--font-mono); font-weight:800; font-size:0.8rem;
                     text-transform:uppercase; letter-spacing:0.08em;"></div>
            </div>`;
        return el;
    }

    function read() {
        if (!window.data) return { ...DEFAULTS };
        if (!data.homepage) data.homepage = {};
        if (!data.homepage.ticker) data.homepage.ticker = { ...DEFAULTS };
        return data.homepage.ticker;
    }

    function sync() {
        const t = read();
        const items = document.getElementById('ticker-items').value
            .split('\n').map((s) => s.trim()).filter(Boolean);

        t.enabled = document.getElementById('ticker-enabled').checked;
        t.speed = Number(document.getElementById('ticker-speed').value);
        t.items = items;

        document.getElementById('ticker-speed-label').textContent = t.speed;
        document.getElementById('ticker-preview').textContent =
            items.length ? items.map((i) => '   ' + i + '   ').join('•') : '(nothing to show)';
    }

    function fill() {
        const t = read();
        document.getElementById('ticker-enabled').checked = t.enabled !== false;
        document.getElementById('ticker-items').value = (t.items || []).join('\n');
        document.getElementById('ticker-speed').value = t.speed || 32;
        sync();
    }

    function mount() {
        if (document.getElementById('ticker-editor')) return;
        const tab = document.getElementById('homepage-tab');
        if (!tab) return;

        tab.insertBefore(panel(), tab.firstChild);
        ['ticker-enabled', 'ticker-items', 'ticker-speed'].forEach((id) => {
            const el = document.getElementById(id);
            el.addEventListener('input', sync);
            el.addEventListener('change', sync);
        });
        fill();
    }

    // The admin builds its tabs on the fly, so wait for the homepage tab.
    const observer = new MutationObserver(mount);
    window.addEventListener('DOMContentLoaded', () => {
        mount();
        observer.observe(document.body, { childList: true, subtree: true });
    });
    if (document.readyState !== 'loading') {
        mount();
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Refill once content arrives from the server.
    const origLoad = window.loadFromServer;
    if (origLoad) {
        window.loadFromServer = async function () {
            await origLoad.apply(this, arguments);
            mount();
            fill();
        };
    }
})();
