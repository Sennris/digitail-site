/**
 * The Press Kit tab.
 *
 * Self-contained, like admin-games.js and for the same reason: this panel's
 * shared plumbing is where nearly every bug in this project has come from,
 * so new work mounts beside it rather than through it.
 *
 * Follows the same three house rules:
 *   - never read window.data (a top-level `let` is not a window property)
 *   - every DOM write sits behind a signature guard
 *   - hand-typed values are set with textContent or .value, never pasted
 *     into an HTML string except through esc()
 */

(function () {
    'use strict';

    function store() {
        if (typeof data === 'undefined') return null;
        return data;
    }

    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function kit() {
        const d = store();
        if (!d) return {};
        if (!d.pressKit || typeof d.pressKit !== 'object') d.pressKit = {};
        return d.pressKit;
    }

    function items() {
        const d = store();
        if (!d) return [];
        if (!Array.isArray(d.pressItems)) d.pressItems = [];
        return d.pressItems;
    }

    function assets() {
        const d = store();
        if (!d) return [];
        if (!Array.isArray(d.pressAssets)) d.pressAssets = [];
        return d.pressAssets;
    }

    function games() {
        const d = store();
        return (d && Array.isArray(d.games)) ? d.games : [];
    }

    // Which game the repeating lists are being edited for. 0 is the studio.
    let scope = 0;

    function scopeName() {
        if (!scope) return 'the studio';
        const g = games().find((x) => x.id === scope);
        return g ? (g.titleEn || 'Untitled game') : 'the studio';
    }


    /* ---------- the studio factsheet ---------- */

    const KIT_FIELDS = [
        ['headingEn',     'Page heading (English)',            'text',     'Press Kit'],
        ['headingMi',     'Page heading (Te Reo Māori)',       'text',     ''],
        ['introEn',       'Intro (English)',                   'textarea', 'Everything you need to write about us.'],
        ['introMi',       'Intro (Te Reo Māori)',              'textarea', ''],
        ['foundedEn',     'Founded',                           'text',     'Early 2025'],
        ['basedInEn',     'Based in',                          'text',     'Ōtautahi Christchurch, Aotearoa New Zealand'],
        ['teamSizeEn',    'Team size',                         'text',     ''],
        ['websiteUrl',    'Website',                           'text',     'https://www.digitailstudios.com'],
        ['contactEmail',  'Press contact email (use the Google Group)', 'text', 'press@digitailstudios.com'],
        ['contactNoteEn', 'Note beside the contact (English)', 'textarea', 'We answer everything, usually within a couple of days.'],
        ['contactNoteMi', 'Note beside the contact (Te Reo Māori)', 'textarea', ''],
        ['descriptionEn', 'About the studio (English)',        'textarea', ''],
        ['descriptionMi', 'About the studio (Te Reo Māori)',   'textarea', ''],
        ['historyEn',     'History (English)',                 'textarea', ''],
        ['historyMi',     'History (Te Reo Māori)',            'textarea', ''],
        ['permissionEn',  'Creator permission (English)',      'textarea', 'You have our blessing to record, stream and monetise videos of our games. No permission needed, no strings.'],
        ['permissionMi',  'Creator permission (Te Reo Māori)', 'textarea', ''],
        ['creditsEn',     'Credits (English)',                 'textarea', ''],
        ['creditsMi',     'Credits (Te Reo Māori)',            'textarea', ''],
    ];

    // Notes that only make sense beside one particular field.
    const FIELD_NOTES = {
        contactEmail:
            'Put the studio Google Group address here, not a personal one. The press '
            + 'page turns it into a link that opens the reader\u2019s email app with '
            + 'the subject already filled in, so the message lands in the Group where '
            + 'the whole team can see it and anyone can reply.',
    };

    function kitFieldHTML([name, label, type, placeholder]) {
        const v = esc(kit()[name] || '');
        const ph = esc(placeholder);
        const note = FIELD_NOTES[name]
            ? `<div class="helper-text">${esc(FIELD_NOTES[name])}</div>`
            : '';
        return `
            <div class="form-group">
                <label>${esc(label)}</label>
                ${type === 'textarea'
                    ? `<textarea rows="3" data-pk-field="${name}" placeholder="${ph}">${v}</textarea>`
                    : `<input type="text" data-pk-field="${name}" value="${v}" placeholder="${ph}">`}
                ${note}
            </div>`;
    }

    function renderKit() {
        const mount = document.getElementById('press-kit-fields');
        if (!mount) return;
        // Built once. Rebuilding on every keystroke would move the caret.
        if (mount.dataset.built === '1') return;
        mount.dataset.built = '1';
        mount.innerHTML = KIT_FIELDS.map(kitFieldHTML).join('');
    }


    /* ---------- the repeating lists ---------- */

    const ITEM_KINDS = {
        award:   { label: 'Awards and recognition', note: 'Festivals, nominations, showcases.' },
        quote:   { label: 'Quotes',                 note: 'What someone said about you, and who said it.' },
        article: { label: 'Selected articles',      note: 'Coverage worth pointing press at.' },
        link:    { label: 'Additional links',       note: 'Soundtrack, Discord, itch page, anything else.' },
    };

    const ASSET_KINDS = {
        pack:  { label: 'Press packs',      note: 'A zip a journalist can grab in one click.' },
        image: { label: 'Images',           note: 'Screenshots and key art, downloadable one at a time.' },
        logo:  { label: 'Logos and icons',  note: 'Marks and icons on their own.' },
    };

    function itemRowHTML(item, index) {
        return `
        <div class="press-row">
            <div class="press-row-head">
                <strong>${esc(item.titleEn || 'Untitled')}</strong>
                <span class="game-row-tools">
                    <button type="button" data-pi-move="${index}" data-dir="-1" title="Move up">▲</button>
                    <button type="button" data-pi-move="${index}" data-dir="1" title="Move down">▼</button>
                    <button type="button" data-pi-delete="${index}" title="Remove">✕</button>
                </span>
            </div>
            <div class="form-group">
                <label>Title (English)</label>
                <input type="text" data-pi-field="titleEn" data-index="${index}" value="${esc(item.titleEn)}">
            </div>
            <div class="form-group">
                <label>Title (Te Reo Māori)</label>
                <input type="text" data-pi-field="titleMi" data-index="${index}" value="${esc(item.titleMi)}">
            </div>
            <div class="form-group">
                <label>${item.kind === 'quote' ? 'The quote' : 'Details'} (English)</label>
                <textarea rows="3" data-pi-field="bodyEn" data-index="${index}">${esc(item.bodyEn)}</textarea>
            </div>
            <div class="form-group">
                <label>${item.kind === 'quote' ? 'The quote' : 'Details'} (Te Reo Māori)</label>
                <textarea rows="3" data-pi-field="bodyMi" data-index="${index}">${esc(item.bodyMi)}</textarea>
            </div>
            <div class="form-group">
                <label>${item.kind === 'quote' ? 'Who said it' : 'Source'}</label>
                <input type="text" data-pi-field="source" data-index="${index}" value="${esc(item.source)}">
            </div>
            <div class="form-group">
                <label>Link</label>
                <input type="text" data-pi-field="url" data-index="${index}" value="${esc(item.url)}">
            </div>
            <div class="form-group">
                <label>Date</label>
                <input type="text" data-pi-field="dateLabel" data-index="${index}"
                       value="${esc(item.dateLabel)}" placeholder="March 2026">
                <div class="helper-text">Free text, so "2025" or "Coming 2027" are both fine.</div>
            </div>
        </div>`;
    }

    function assetRowHTML(asset, index) {
        return `
        <div class="press-row">
            <div class="press-row-head">
                <strong>${esc(asset.labelEn || 'Untitled')}</strong>
                <span class="game-row-tools">
                    <button type="button" data-pa-move="${index}" data-dir="-1" title="Move up">▲</button>
                    <button type="button" data-pa-move="${index}" data-dir="1" title="Move down">▼</button>
                    <button type="button" data-pa-delete="${index}" title="Remove">✕</button>
                </span>
            </div>
            <div class="form-group">
                <label>Label (English)</label>
                <input type="text" data-pa-field="labelEn" data-index="${index}" value="${esc(asset.labelEn)}">
            </div>
            <div class="form-group">
                <label>Label (Te Reo Māori)</label>
                <input type="text" data-pa-field="labelMi" data-index="${index}" value="${esc(asset.labelMi)}">
            </div>
            <div class="form-group">
                <label>File</label>
                <input type="text" id="press-asset-${asset.kind === 'pack' ? 'file' : 'image'}-${index}"
                       data-pa-field="url" data-index="${index}" value="${esc(asset.url)}"
                       placeholder="${asset.kind === 'pack'
                           ? 'Upload a ZIP, or paste a link'
                           : 'Upload or paste an image URL'}">
                ${asset.kind === 'pack'
                    ? '<div class="helper-text">ZIP or PDF, up to 60MB. Uploaded exactly as it is, with no resizing.</div>'
                    : ''}
            </div>
            <div class="form-group">
                <label>Note beside it (English)</label>
                <input type="text" data-pa-field="noteEn" data-index="${index}"
                       value="${esc(asset.noteEn)}" placeholder="ZIP, 24MB, 12 screenshots">
            </div>
            <div class="form-group">
                <label>Note beside it (Te Reo Māori)</label>
                <input type="text" data-pa-field="noteMi" data-index="${index}" value="${esc(asset.noteMi)}">
            </div>
        </div>`;
    }

    // Indexes here are into the FULL array, not the filtered view, so the
    // handlers below edit the right row no matter which scope is showing.
    function indexed(list, kind) {
        return list
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => row.kind === kind && (Number(row.gameId) || 0) === scope);
    }

    function groupHTML(kind, meta, rows, render, addAttr) {
        return `
        <section class="press-group">
            <h3 class="game-subhead">${esc(meta.label)}</h3>
            <p class="helper-text">${esc(meta.note)}</p>
            ${rows.length
                ? rows.map(({ row, index }) => render(row, index)).join('')
                : '<p class="helper-text">None yet.</p>'}
            <div class="button-group">
                <button type="button" class="btn-rugged" ${addAttr}="${kind}">+ Add</button>
            </div>
        </section>`;
    }

    function renderLists(force) {
        const mount = document.getElementById('press-lists');
        if (!mount) return;

        const sig = [
            scope,
            items().map((i) => [i.kind, i.gameId, i.titleEn].join('~')).join('|'),
            assets().map((a) => [a.kind, a.gameId, a.labelEn].join('~')).join('|'),
        ].join('#');
        if (!force && mount.dataset.pressSignature === sig) return;
        mount.dataset.pressSignature = sig;

        const parts = [`<p class="press-scope-note">Editing the press kit for
            <strong>${esc(scopeName())}</strong>.</p>`];

        Object.entries(ITEM_KINDS).forEach(([kind, meta]) => {
            parts.push(groupHTML(kind, meta, indexed(items(), kind), itemRowHTML, 'data-pi-add'));
        });
        Object.entries(ASSET_KINDS).forEach(([kind, meta]) => {
            parts.push(groupHTML(kind, meta, indexed(assets(), kind), assetRowHTML, 'data-pa-add'));
        });

        // No rescan call needed: media-upload.js watches the document with a
        // MutationObserver and enhances new fields on the next frame. A
        // typeof-guarded call to a function that may not exist is exactly the
        // pattern that hid two bugs in this panel for months.
        mount.innerHTML = parts.join('');
    }

    function renderScopePicker() {
        const sel = document.getElementById('press-scope');
        if (!sel) return;

        const sig = games().map((g) => g.id + ':' + g.titleEn).join('|');
        if (sel.dataset.scopeSignature === sig) return;
        sel.dataset.scopeSignature = sig;

        // Built with new Option(), not an HTML string - game titles are typed
        // by hand and a stray quote in one would break the markup.
        sel.replaceChildren();
        sel.appendChild(new Option('The studio', '0'));
        games().forEach((g) => {
            sel.appendChild(new Option(g.titleEn || 'Untitled game', String(g.id)));
        });
        sel.value = String(scope);
    }

    function renderAll(force) {
        renderKit();
        renderScopePicker();
        renderLists(force);
    }


    /* ---------- edits ---------- */

    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el.getAttribute) return;

        const kitField = el.getAttribute('data-pk-field');
        if (kitField) { kit()[kitField] = el.value; return; }

        const itemField = el.getAttribute('data-pi-field');
        if (itemField) {
            const row = items()[Number(el.getAttribute('data-index'))];
            if (row) row[itemField] = el.value;
            return;
        }

        const assetField = el.getAttribute('data-pa-field');
        if (assetField) {
            const row = assets()[Number(el.getAttribute('data-index'))];
            if (row) row[assetField] = el.value;
        }
    });

    // The upload button writes straight to input.value, which does not fire
    // an 'input' event on its own. media-upload.js dispatches one, and this
    // catches the change path too so a pasted URL is never lost.
    document.addEventListener('change', (e) => {
        const el = e.target;
        if (el.id === 'press-scope') {
            scope = Number(el.value) || 0;
            renderLists(true);
            return;
        }
        if (!el.getAttribute) return;
        const assetField = el.getAttribute('data-pa-field');
        if (assetField) {
            const row = assets()[Number(el.getAttribute('data-index'))];
            if (row) row[assetField] = el.value;
        }
    });

    function move(list, index, dir, kind) {
        // Reorder within the visible group only. All kinds and scopes share
        // one array, so stepping one index would jump between groups.
        const siblings = indexed(list, kind).map((x) => x.index);
        const at = siblings.indexOf(index);
        const swapWith = siblings[at + dir];
        if (at < 0 || swapWith === undefined) return false;
        [list[index], list[swapWith]] = [list[swapWith], list[index]];
        return true;
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('button');
        if (!btn) return;

        const addItem = btn.getAttribute('data-pi-add');
        if (addItem) {
            items().push({
                gameId: scope, kind: addItem, titleEn: '', titleMi: '',
                bodyEn: '', bodyMi: '', source: '', url: '', dateLabel: '',
            });
            renderLists(true);
            return;
        }

        const addAsset = btn.getAttribute('data-pa-add');
        if (addAsset) {
            assets().push({
                gameId: scope, kind: addAsset, labelEn: '', labelMi: '',
                url: '', noteEn: '', noteMi: '',
            });
            renderLists(true);
            return;
        }

        const piMove = btn.getAttribute('data-pi-move');
        if (piMove !== null && piMove !== undefined) {
            const i = Number(piMove);
            if (move(items(), i, Number(btn.getAttribute('data-dir')), items()[i].kind)) {
                renderLists(true);
            }
            return;
        }

        const paMove = btn.getAttribute('data-pa-move');
        if (paMove !== null && paMove !== undefined) {
            const i = Number(paMove);
            if (move(assets(), i, Number(btn.getAttribute('data-dir')), assets()[i].kind)) {
                renderLists(true);
            }
            return;
        }

        const piDelete = btn.getAttribute('data-pi-delete');
        if (piDelete !== null && piDelete !== undefined) {
            const i = Number(piDelete);
            const name = items()[i].titleEn || 'this entry';
            if (!confirm(`Remove ${name}? It goes for good once you press Publish everything.`)) return;
            items().splice(i, 1);
            renderLists(true);
            return;
        }

        const paDelete = btn.getAttribute('data-pa-delete');
        if (paDelete !== null && paDelete !== undefined) {
            const i = Number(paDelete);
            const name = assets()[i].labelEn || 'this file';
            if (!confirm(`Remove ${name}? It goes for good once you press Publish everything.`)) return;
            assets().splice(i, 1);
            renderLists(true);
        }
    });


    /* ---------- wiring ---------- */

    // At parse time, not inside boot(). api-adapter.js loads before this file
    // and registers its own DOMContentLoaded handler first, so a wrapper
    // installed later misses the initial load entirely. That is what left the
    // Games tab looking empty until a button was pressed.
    function installWrapper() {
        const inner = window.loadFromServer;
        if (typeof inner !== 'function' || inner.__pressWrapped) return;
        const wrapped = async function (...args) {
            const out = await inner.apply(this, args);
            const mount = document.getElementById('press-kit-fields');
            if (mount) mount.dataset.built = '';
            renderAll(true);
            return out;
        };
        wrapped.__pressWrapped = true;
        window.loadFromServer = wrapped;
    }
    installWrapper();

    function boot() {
        installWrapper();
        renderAll(true);

        const started = Date.now();
        const timer = setInterval(() => {
            const d = store();
            const arrived = d && (d.pressKit || Array.isArray(d.pressItems));
            renderAll(false);
            if (arrived || Date.now() - started > 15000) clearInterval(timer);
        }, 150);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 0);
    }

    window.__press = { renderAll, setScope: (id) => { scope = id; renderLists(true); } };
})();
