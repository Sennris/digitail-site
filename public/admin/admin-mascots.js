/**
 * The Mascot subtab.
 *
 * Replaces the four hardcoded slots (default / halloween / christmas /
 * newyear) that used to be typed into admin-script.js. Mascots are a real
 * list now: add as many as you like, each with its own date range and size.
 *
 * Self-contained on purpose, like admin-games.js. admin-script.js is the
 * fragile part of this panel, so this mounts alongside it rather than being
 * threaded through it. The three house rules it follows:
 *
 *   - Never touch `window.data`. admin-script.js declares its store with
 *     `let data`, and a top-level `let` in a classic script does NOT become
 *     a property of window. Go through store() below.
 *
 *   - Every render is behind a signature check. media-upload.js runs a
 *     MutationObserver over the whole document, and an unconditional DOM
 *     write inside a render it can retrigger loops forever.
 *
 *   - The loadFromServer wrapper is installed at PARSE TIME, not inside
 *     boot(). api-adapter.js loads first and registers its DOMContentLoaded
 *     handler first, so a wrapper installed in boot() misses the initial
 *     load and the list sits empty until something forces a redraw.
 *
 * THE OVERLAP RULE, agreed before this was built: when two scheduled
 * mascots both cover today, the SHORTER range wins, and list order breaks a
 * tie. A mascot with no dates counts as an infinite range, so it is the
 * fallback without being flagged as one.
 *
 * pages/index.js holds the authoritative copy of that rule - it is what the
 * public site actually runs. The copy here exists only to show her which
 * mascot is showing today while she edits. tools/test_mascots.mjs runs both
 * copies over the same scenarios and fails if they ever disagree.
 */

(function () {
    'use strict';

    /* ---------- reaching the shared store safely ---------- */

    function store() {
        // typeof, not window.data. See the note above.
        if (typeof data === 'undefined') return null;
        return data;
    }

    function mascots() {
        const d = store();
        if (!d) return [];
        if (!Array.isArray(d.mascots)) d.mascots = [];
        return d.mascots;
    }

    let selectedId = null;

    const SIZES = ['small', 'medium', 'large'];

    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function alertUser(msg, kind) {
        if (typeof showAlert === 'function') showAlert(msg, kind || 'success');
    }

    function nextId() {
        return mascots().reduce((max, m) => Math.max(max, Number(m.id) || 0), 0) + 1;
    }

    function blankMascot() {
        return {
            id: nextId(), name: '', image: '', size: 'medium',
            dateStart: '', dateEnd: '', repeatsYearly: true,
            forced: false, enabled: true,
        };
    }

    function selected() {
        return mascots().find((m) => m.id === selectedId) || null;
    }


    /* ---------- the rule (display copy - see the header note) ---------- */

    const pad2 = (v) => String(v).padStart(2, '0');

    function mascotDates(m, now) {
        let start = String(m.dateStart || '').trim();
        let end = String(m.dateEnd || '').trim();
        if (!start && !end) return null;
        if (!start) start = end;
        if (!end) end = start;
        if (m.repeatsYearly) {
            return { start: start.slice(-5), end: end.slice(-5) };
        }
        const year = String(now.getFullYear());
        if (start.length === 5) start = year + '-' + start;
        if (end.length === 5) end = year + '-' + end;
        return { start, end };
    }

    function mascotCoversToday(m, now) {
        const d = mascotDates(m, now);
        if (!d) return true;
        const today = m.repeatsYearly
            ? pad2(now.getMonth() + 1) + '-' + pad2(now.getDate())
            : now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
        if (d.start <= d.end) return today >= d.start && today <= d.end;
        return m.repeatsYearly ? (today >= d.start || today <= d.end) : false;
    }

    function mascotSpan(m, now) {
        const d = mascotDates(m, now);
        if (!d) return Infinity;
        if (m.repeatsYearly) {
            const toDay = (mmdd) => {
                const parts = mmdd.split('-');
                return Date.UTC(2001, (Number(parts[0]) || 1) - 1, Number(parts[1]) || 1) / 86400000;
            };
            const a = toDay(d.start);
            const b = toDay(d.end);
            return (b >= a ? b - a : b - a + 365) + 1;
        }
        const a = Date.parse(d.start + 'T00:00:00Z');
        const b = Date.parse(d.end + 'T00:00:00Z');
        if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return Infinity;
        return (b - a) / 86400000 + 1;
    }

    function pickMascot(list, now) {
        const live = (Array.isArray(list) ? list : [])
            .filter((m) => m && m.enabled !== false);
        if (!live.length) return null;

        const forced = live.find((m) => m.forced);
        if (forced) return forced;

        const covering = live.filter((m) => mascotCoversToday(m, now));
        if (!covering.length) return null;

        let best = covering[0];
        let bestSpan = mascotSpan(best, now);
        for (let i = 1; i < covering.length; i++) {
            const span = mascotSpan(covering[i], now);
            if (span < bestSpan) { best = covering[i]; bestSpan = span; }
        }
        return best;
    }


    /* ---------- the rollback copy in the homepage blob ---------- */

    // Kept in step here as well as in src/writers.js, and deliberately so:
    // api-adapter publishes the homepage settings AFTER the mascots, so a
    // browser copy left untouched would land on top of the mirror the
    // server just wrote. Same rule on both sides - the first enabled
    // mascot with no dates, or failing that the first enabled one.
    function updateMirror() {
        const d = store();
        if (!d) return;
        const live = mascots().filter((m) => m && m.enabled !== false);
        const pick = live.find((m) => !m.dateStart && !m.dateEnd) || live[0] || null;
        if (!pick) return;
        if (!d.homepage || typeof d.homepage !== 'object') d.homepage = {};
        d.homepage.mascot = {
            current: 'default',
            autoSwitch: false,
            versions: {
                default: {
                    name: pick.name || '',
                    image: pick.image || '',
                    size: pick.size || 'medium',
                },
            },
        };
    }


    /* ---------- the list down the side ---------- */

    function rangeLabel(m) {
        if (!m.dateStart && !m.dateEnd) return 'Always';
        const tidy = (v) => String(v || '').trim();
        const range = tidy(m.dateStart) === tidy(m.dateEnd) || !tidy(m.dateEnd)
            ? tidy(m.dateStart) || tidy(m.dateEnd)
            : `${tidy(m.dateStart)} → ${tidy(m.dateEnd)}`;
        return m.repeatsYearly ? `${range} yearly` : range;
    }

    function listHTML() {
        const list = mascots();
        if (!list.length) {
            return '<p class="helper-text">No mascots yet. Add one to get started.</p>';
        }
        const today = pickMascot(list, new Date());
        return list.map((m, i) => {
            const name = m.name || 'Untitled';
            const flags = [rangeLabel(m)];
            if (m.forced) flags.push('📌 Forced on');
            if (m.enabled === false) flags.push('Off');
            if (today && today.id === m.id) flags.push('● Showing today');
            return `
                <div class="game-row${m.id === selectedId ? ' is-selected' : ''}">
                    <button type="button" class="game-row-name"
                            data-mascot-select="${m.id}">
                        ${esc(name)}
                        <span class="game-row-flags">${esc(flags.join(' · '))}</span>
                    </button>
                    <span class="game-row-tools">
                        <button type="button" data-mascot-move="${m.id}" data-dir="-1"
                                title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
                        <button type="button" data-mascot-move="${m.id}" data-dir="1"
                                title="Move down" ${i === list.length - 1 ? 'disabled' : ''}>▼</button>
                        <button type="button" data-mascot-delete="${m.id}"
                                title="Delete">✕</button>
                    </span>
                </div>`;
        }).join('');
    }

    function renderList() {
        const panel = document.getElementById('mascots-list-panel');
        if (!panel) return;

        // Signature guard. Without it this can be retriggered by its own
        // write, via the MutationObserver in media-upload.js, and spin.
        const sig = mascots().map((m) =>
            [m.id, m.name, m.dateStart, m.dateEnd, m.repeatsYearly, m.forced, m.enabled]
                .join('~')
        ).join('|') + '#' + selectedId;
        if (panel.dataset.mascotsSignature === sig) return;
        panel.dataset.mascotsSignature = sig;

        panel.innerHTML = listHTML();
    }


    /* ---------- the editor ---------- */

    // A date input always wants YYYY-MM-DD. A repeating mascot only stores
    // MM-DD, so the current year is pinned on for display and thrown away
    // again on the way back in.
    function forInput(value, repeats) {
        const v = String(value || '').trim();
        if (!v) return '';
        if (!repeats) return v.length === 5 ? new Date().getFullYear() + '-' + v : v;
        return new Date().getFullYear() + '-' + v.slice(-5);
    }

    function editorHTML(m) {
        if (!m) {
            return '<p class="helper-text">Pick a mascot from the list, or add one.</p>';
        }
        const sizeOptions = SIZES.map((s) =>
            `<option value="${s}"${(m.size || 'medium') === s ? ' selected' : ''}>` +
            `${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
        ).join('');

        return `
            <h2>Mascot</h2>

            <div class="form-group">
                <label>Name</label>
                <input type="text" data-mascot-field="name" value="${esc(m.name)}"
                       placeholder="e.g. Spooky Fox">
                <div class="helper-text">Used as the image's alt text, so screen readers
                    describe the right fox. Not shown on the page.</div>
            </div>

            <div class="form-group">
                <label>Image</label>
                <input type="text" id="mascot-image-${m.id}" data-mascot-field="image"
                       value="${esc(m.image)}" placeholder="Image URL">
            </div>

            <div class="form-group">
                <label>Size</label>
                <select data-mascot-field="size">${sizeOptions}</select>
                <div class="helper-text">Three set sizes rather than a number, so each one
                    has a matching size on a phone. Medium is the size the mascot has
                    always been.</div>
            </div>

            <hr class="game-divider">
            <h3 class="game-subhead">When it shows</h3>

            <div class="form-group">
                <label>
                    <input type="checkbox" data-mascot-field="repeatsYearly"
                           style="width:auto; margin-right:0.5rem;"
                           ${m.repeatsYearly !== false ? 'checked' : ''}>
                    Repeats every year
                </label>
                <div class="helper-text">On for things like Halloween or Matariki. Off for
                    a one-off, like a launch week. ${m.repeatsYearly !== false
                        ? 'The year in the boxes below is ignored.' : ''}</div>
            </div>

            <div class="form-group">
                <label>First day</label>
                <input type="date" data-mascot-date="dateStart"
                       value="${esc(forInput(m.dateStart, m.repeatsYearly !== false))}">
            </div>

            <div class="form-group">
                <label>Last day</label>
                <input type="date" data-mascot-date="dateEnd"
                       value="${esc(forInput(m.dateEnd, m.repeatsYearly !== false))}">
            </div>

            <div class="helper-text" style="margin-bottom:1rem;">
                Leave both dates empty and this mascot is the everyday one — it shows
                whenever nothing else has claimed the day. When two mascots do cover the
                same day, the one with the <strong>shorter</strong> range wins, so a
                one-day birthday fox beats a month-long October one. If two ranges are
                the same length, whichever sits higher in the list wins.
                A range may run over the year end (31 December → 7 January).
            </div>

            <hr class="game-divider">

            <div class="switch-plate">
                <label>
                    <input type="checkbox" data-mascot-field="enabled"
                           style="width:auto; margin-right:0.5rem;"
                           ${m.enabled === false ? '' : 'checked'}>
                    Switched on
                </label>
                <div class="helper-text">Off parks it without losing the dates.</div>
            </div>

            <div class="switch-plate">
                <label>
                    <input type="checkbox" data-mascot-field="forced"
                           style="width:auto; margin-right:0.5rem;"
                           ${m.forced ? 'checked' : ''}>
                    Show this one now, whatever the calendar says
                </label>
                <div class="helper-text">The manual override. Only one mascot can have it,
                    and it stays on until you take it off.</div>
            </div>

            <div class="button-group">
                <span class="save-hint">Press 💾 Publish everything in the bar at the top - it follows you down the page.</span>
            </div>
        `;
    }

    function renderEditor(force) {
        const mount = document.getElementById('mascots-editor');
        if (!mount) return;

        const m = selected();
        // Redrawing while she is typing would move the caret, so the editor
        // is only rebuilt when the mascot changes or a toggle flips - never
        // on a keystroke.
        const sig = m
            ? [m.id, m.repeatsYearly !== false, m.enabled !== false, Boolean(m.forced)].join('~')
            : 'none';
        if (!force && mount.dataset.editorSignature === sig) return;
        mount.dataset.editorSignature = sig;

        mount.innerHTML = editorHTML(m);
    }

    function renderAll(force) {
        renderList();
        renderEditor(force);
        updateMirror();
    }


    /* ---------- edits ---------- */

    function setField(name, value) {
        const m = selected();
        if (!m) return;
        m[name] = value;

        if (name === 'forced' && value === true) {
            // Only one mascot can be forced on.
            mascots().forEach((other) => { if (other !== m) other.forced = false; });
        }

        if (name === 'repeatsYearly') {
            // The stored dates change shape with this toggle, so convert
            // what is already there rather than leaving a YYYY-MM-DD in a
            // field that is now read as MM-DD.
            const year = new Date().getFullYear();
            ['dateStart', 'dateEnd'].forEach((f) => {
                const v = String(m[f] || '').trim();
                if (!v) return;
                m[f] = value ? v.slice(-5) : (v.length === 5 ? year + '-' + v : v);
            });
        }

        if (name !== 'image' && name !== 'size') renderList();
    }

    document.addEventListener('input', (e) => {
        const field = e.target.getAttribute && e.target.getAttribute('data-mascot-field');
        if (field && e.target.type !== 'checkbox') { setField(field, e.target.value); return; }

        const dateField = e.target.getAttribute && e.target.getAttribute('data-mascot-date');
        if (dateField) {
            const m = selected();
            if (!m) return;
            const v = String(e.target.value || '');
            // A repeating mascot keeps only the month and day. The year the
            // picker insisted on is not stored, so it cannot go stale.
            m[dateField] = (m.repeatsYearly !== false && v) ? v.slice(-5) : v;
            renderList();
        }
    });

    document.addEventListener('change', (e) => {
        const field = e.target.getAttribute && e.target.getAttribute('data-mascot-field');
        if (!field) return;
        if (e.target.type === 'checkbox') {
            setField(field, e.target.checked);
            renderAll(true);
        } else if (e.target.tagName === 'SELECT') {
            setField(field, e.target.value);
        }
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('button');
        if (!btn) return;

        const selectId = btn.getAttribute('data-mascot-select');
        if (selectId) {
            selectedId = Number(selectId);
            renderAll(true);
            return;
        }

        const moveId = btn.getAttribute('data-mascot-move');
        if (moveId) {
            const list = mascots();
            const i = list.findIndex((m) => m.id === Number(moveId));
            const j = i + Number(btn.getAttribute('data-dir'));
            if (i >= 0 && j >= 0 && j < list.length) {
                [list[i], list[j]] = [list[j], list[i]];
                renderList();
                updateMirror();
            }
            return;
        }

        const deleteId = btn.getAttribute('data-mascot-delete');
        if (deleteId) {
            const list = mascots();
            const i = list.findIndex((m) => m.id === Number(deleteId));
            if (i < 0) return;
            const name = list[i].name || 'this mascot';
            if (!confirm(`Delete ${name}? This cannot be undone once you press Publish everything.`)) return;
            list.splice(i, 1);
            if (selectedId === Number(deleteId)) selectedId = list.length ? list[0].id : null;
            renderAll(true);
            alertUser('Mascot removed. Press 💾 Publish everything at the top.', 'success');
            return;
        }

        if (btn.id === 'mascot-add') {
            const m = blankMascot();
            mascots().push(m);
            selectedId = m.id;
            renderAll(true);
        }
    });


    /* ---------- wiring ---------- */

    // Installed at parse time, NOT inside boot(). api-adapter.js is loaded
    // before this file and has already registered its DOMContentLoaded
    // handler, so a wrapper installed in boot() would be registered second,
    // run second, and miss the initial load entirely - the mascots would be
    // in memory with nothing listening for them. That is exactly why the
    // games list used to sit empty until "Add game" was pressed.
    function installWrapper() {
        const inner = window.loadFromServer;
        if (typeof inner !== 'function') return false;
        if (inner.__mascotsWrapped) return true;

        const wrapped = async function (...args) {
            const out = await inner.apply(this, args);
            const d = store();
            if (d) {
                if (!Array.isArray(d.mascots)) d.mascots = [];
                if (selectedId === null && d.mascots.length) selectedId = d.mascots[0].id;
                if (selectedId !== null && !d.mascots.some((m) => m.id === selectedId)) {
                    selectedId = d.mascots.length ? d.mascots[0].id : null;
                }
            }
            renderAll(true);
            return out;
        };
        wrapped.__mascotsWrapped = true;
        window.loadFromServer = wrapped;
        return true;
    }

    installWrapper();

    // Belt and braces, same as the Games tab. Script order in
    // admin/index.html is a load-bearing detail a future edit could quietly
    // reorder, and the wrapper only works while this file loads after
    // api-adapter.js. Cheap to run: both renders are signature-guarded, so a
    // tick that changes nothing costs one string compare.
    function settle() {
        const started = Date.now();
        const timer = setInterval(() => {
            const d = store();
            const arrived = d && Array.isArray(d.mascots) && d.mascots.length;
            if (arrived && selectedId === null) selectedId = d.mascots[0].id;
            renderAll(false);
            if (arrived || Date.now() - started > 15000) clearInterval(timer);
        }, 120);
    }

    function boot() {
        installWrapper();
        renderAll(true);
        settle();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 0);
    }

    // Exposed for tools/test_mascots.mjs.
    window.__mascots = {
        renderAll,
        pickMascot,
        mascotSpan,
        mascotCoversToday,
        selectMascot: (id) => { selectedId = id; renderAll(true); },
        selectedId: () => selectedId,
    };
})();
