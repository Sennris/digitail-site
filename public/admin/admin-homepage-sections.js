/**
 * Homepage section copy.
 *
 * Every heading and paragraph down the homepage was typed into index.html.
 * The only parts that ever came from the admin panel were the hero tagline,
 * the announcement, the mascot, the ticker, the community links, and the four
 * cards that pull the latest game / devlog / fox / social post. Everything
 * around them was fixed.
 *
 * These write to `data.homepage.sections`. No migration: `homepage` is a
 * settings blob, collectHomepageInfo() mutates individual keys rather than
 * replacing the object, and api-adapter spreads the whole thing when it
 * saves, so a new key rides along on its own.
 *
 * House rules followed here, all learned the hard way in this panel:
 *   - never read window.data (a top-level `let` is not a window property)
 *   - build the form once, not on every keystroke, or the caret jumps
 *   - a blank field means "leave the page alone", never "publish nothing"
 */

(function () {
    'use strict';

    function store() {
        if (typeof data === 'undefined') return null;
        return data;
    }

    function sections() {
        const d = store();
        if (!d) return {};
        if (!d.homepage || typeof d.homepage !== 'object') d.homepage = {};
        if (!d.homepage.sections || typeof d.homepage.sections !== 'object') {
            d.homepage.sections = {};
        }
        return d.homepage.sections;
    }

    function group(name) {
        const s = sections();
        if (!s[name] || typeof s[name] !== 'object') s[name] = {};
        return s[name];
    }

    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // [group, field, label, type, placeholder]
    // Te reo fields exist but are left blank for now - she is doing the whole
    // translation pass in one go once the site is finalised. A blank te reo
    // field leaves the wording already in index.html untouched rather than
    // replacing good te reo with English.
    const FIELDS = [
        ['about', 'About panel (the one linking to the team page)'],
        ['about', 'headingEn', 'Heading', 'textarea', 'A sanctuary for the tired, the creative, and the caffeinated.'],
        ['about', 'headingMi', 'Heading (Te Reo Māori)', 'textarea', ''],
        ['about', 'bodyEn', 'Body', 'textarea', ''],
        ['about', 'bodyMi', 'Body (Te Reo Māori)', 'textarea', ''],
        ['about', 'linkEn', 'Link text', 'text', 'Meet the Pack →'],
        ['about', 'linkMi', 'Link text (Te Reo Māori)', 'text', ''],

        ['game', 'Game section'],
        ['game', 'eyebrowEn', 'Small line above the game name', 'text', 'Currently Brewing:'],
        ['game', 'eyebrowMi', 'Small line (Te Reo Māori)', 'text', ''],
        ['game', 'bodyEn', 'Paragraph', 'textarea', 'We are currently hard at work on our debut title…'],
        ['game', 'bodyMi', 'Paragraph (Te Reo Māori)', 'textarea', ''],
        ['game', 'linkEn', 'Link text', 'text', 'Explore Game →'],
        ['game', 'linkMi', 'Link text (Te Reo Māori)', 'text', ''],

        ['community', 'Community statement'],
        ['community', 'bodyEn', 'The big statement', 'textarea', "See what's happening\nin the *den*."],
        ['community', 'bodyMi', 'The big statement (Te Reo Māori)', 'textarea', ''],

        ['devlogs', 'Dev logs section'],
        ['devlogs', 'line1En', 'Heading line 1', 'text', 'Turning'],
        ['devlogs', 'accent1En', 'Highlighted line 1', 'text', '"oops, it broke"'],
        ['devlogs', 'line2En', 'Heading line 2', 'text', 'into'],
        ['devlogs', 'accent2En', 'Highlighted line 2', 'text', '"wow, it\u2019s a feature."'],
        ['devlogs', 'bodyEn', 'Paragraph', 'textarea', ''],
        ['devlogs', 'bodyMi', 'Paragraph (Te Reo Māori)', 'textarea', ''],
        ['devlogs', 'preEn', 'Label on the card', 'text', 'Latest Dev Log'],
        ['devlogs', 'linkEn', 'Link text', 'text', 'Read Log →'],

        ['foxes', 'Adopted fox section'],
        ['foxes', 'headingEn', 'Heading', 'textarea', 'Studio Mascot, Made Real.'],
        ['foxes', 'headingMi', 'Heading (Te Reo Māori)', 'textarea', ''],
        ['foxes', 'bodyEn', 'Paragraph', 'textarea', ''],
        ['foxes', 'bodyMi', 'Paragraph (Te Reo Māori)', 'textarea', ''],
        ['foxes', 'linkEn', 'Link text', 'text', 'Meet the Foxes →'],

        ['social', 'Socials section'],
        ['social', 'headingEn', 'Heading', 'textarea', "What we've been\nup to lately."],
        ['social', 'headingMi', 'Heading (Te Reo Māori)', 'textarea', ''],
        ['social', 'bodyEn', 'Paragraph', 'textarea', ''],
        ['social', 'bodyMi', 'Paragraph (Te Reo Māori)', 'textarea', ''],
        ['social', 'preEn', 'Label on the card', 'text', 'Latest Social Post'],
        ['social', 'linkEn', 'Link text', 'text', 'View All Posts →'],

        ['news', 'Newsletter panel'],
        ['news', 'headingEn', 'Heading', 'textarea', 'Stay in the Loop.'],
        ['news', 'headingMi', 'Heading (Te Reo Māori)', 'textarea', ''],
        ['news', 'bodyEn', 'Paragraph', 'textarea', ''],
        ['news', 'bodyMi', 'Paragraph (Te Reo Māori)', 'textarea', ''],
        ['news', 'buttonEn', 'Button text', 'text', 'Join the Pack'],
        ['news', 'buttonMi', 'Button text (Te Reo Māori)', 'text', ''],
    ];

    function fieldHTML(row) {
        // A two-item row is a sub-heading, not a field.
        if (row.length === 2) {
            return `<h3 class="game-subhead">${esc(row[1])}</h3>`;
        }
        const [g, name, label, type, placeholder] = row;
        const value = esc(group(g)[name] || '');
        const ph = esc(placeholder);
        const attr = `data-hs-group="${g}" data-hs-field="${name}"`;
        return `
            <div class="form-group">
                <label>${esc(label)}</label>
                ${type === 'textarea'
                    ? `<textarea rows="3" ${attr} placeholder="${ph}">${value}</textarea>`
                    : `<input type="text" ${attr} value="${value}" placeholder="${ph}">`}
            </div>`;
    }

    function render() {
        const mount = document.getElementById('hp-sections-panel');
        if (!mount) return;
        // Built once. Rebuilding while she is typing would move the caret.
        if (mount.dataset.built === '1') return;
        mount.dataset.built = '1';

        mount.innerHTML = `
            <div class="card">
                <h2>Page copy</h2>
                <p class="helper-text">The headings and paragraphs down the homepage. Leave any field blank to keep the wording that is on the page now, so you can change one line without touching the rest.</p>
                <p class="helper-text">Press Enter for a line break. Wrap a word in *asterisks* to emphasise it.</p>
                ${FIELDS.map(fieldHTML).join('')}
                <span class="save-hint">Changes are kept as a draft. Press 💾 Save to site at the top of the page to publish them.</span>
            </div>`;
    }

    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el.getAttribute) return;
        const g = el.getAttribute('data-hs-group');
        const field = el.getAttribute('data-hs-field');
        if (g && field) group(g)[field] = el.value;
    });

    // Installed at parse time. api-adapter.js loads before this file and
    // registers its DOMContentLoaded handler first, so a wrapper installed
    // inside boot() misses the initial load - that is what left the Games
    // tab looking empty until a button was pressed.
    function installWrapper() {
        const inner = window.loadFromServer;
        if (typeof inner !== 'function' || inner.__hpSectionsWrapped) return;
        const wrapped = async function (...args) {
            const out = await inner.apply(this, args);
            const mount = document.getElementById('hp-sections-panel');
            if (mount) mount.dataset.built = '';
            render();
            return out;
        };
        wrapped.__hpSectionsWrapped = true;
        window.loadFromServer = wrapped;
    }
    installWrapper();

    function boot() {
        installWrapper();
        render();

        // Backstop in case the script order in admin/index.html is ever
        // changed. render() is a no-op once built, so a tick costs nothing.
        const started = Date.now();
        const timer = setInterval(() => {
            const d = store();
            if (d && d.homepage) {
                const mount = document.getElementById('hp-sections-panel');
                if (mount && mount.dataset.built !== '1') render();
                clearInterval(timer);
            }
            if (Date.now() - started > 15000) clearInterval(timer);
        }, 150);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 0);
    }

    window.__hpSections = { render };
})();
