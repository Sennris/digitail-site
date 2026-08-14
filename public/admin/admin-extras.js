/**
 * Admin panel additions.
 *
 *   1. Primary and secondary tag pickers on the devlog form
 *   2. A place to manage the two tag lists
 *   3. Admin account management
 *
 * Injected rather than edited into admin-script.js, so your original
 * admin code stays untouched and this can be pulled out cleanly.
 */

(function () {
    'use strict';

    const PANEL_BORDER = '3px solid #5DCCCA';

    // admin-script.js declares its store as `let data`. A top-level `let`
    // in a classic script does NOT land on window - only `var` and function
    // declarations do. Anything guarding on `window.data` therefore reads
    // nothing, forever. Reach the real binding instead.
    function store() {
        return (typeof data === 'undefined' || !data) ? null : data;
    }

    function allTags() {
        const d = store();
        return d && Array.isArray(d.tags) ? d.tags : [];
    }

    function tagsOfKind(kind) {
        return allTags().filter((t) => (t.kind || 'secondary') === kind);
    }

    /* ================= 1. devlog form pickers ================= */

    function mountDevlogPickers() {
        const container = document.getElementById('devlog-tags');
        if (!container || document.getElementById('devlog-primary-tag')) return;

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;';
        wrap.innerHTML = `
            <div>
                <label for="devlog-primary-tag"
                       style="display:block; font-family:var(--font-mono); font-size:0.8rem; margin-bottom:0.3rem;">
                    Primary tag <span style="opacity:0.6;">(which game, or studio news)</span>
                </label>
                <select id="devlog-primary-tag" style="width:100%;"></select>
            </div>
            <div>
                <label for="devlog-secondary-tag"
                       style="display:block; font-family:var(--font-mono); font-size:0.8rem; margin-bottom:0.3rem;">
                    Secondary tag <span style="opacity:0.6;">(what kind of update)</span>
                </label>
                <select id="devlog-secondary-tag" style="width:100%;"></select>
            </div>`;
        container.parentElement.insertBefore(wrap, container);
        refreshPickers();
    }

    // Rebuild a dropdown from a list of tags.
    //
    // Two things this has to get right:
    //  - Only touch the DOM when the contents would actually change.
    //    Rewriting unconditionally from inside a MutationObserver callback
    //    retriggers the observer and loops forever. A signature string on
    //    the element is how we tell.
    //  - Build options with new Option(), not by pasting names into an
    //    HTML string. Tag names are typed by hand and a stray < or " in
    //    one would otherwise break the dropdown.
    function fillSelect(sel, placeholder, tags) {
        const signature = placeholder + '|' + tags.map((t) => t.name).join('\u0000');
        if (sel.dataset.tagSignature === signature) return;

        const current = sel.value;
        sel.textContent = '';
        sel.appendChild(new Option(placeholder, ''));
        tags.forEach((t) => sel.appendChild(new Option(t.name, t.name)));
        sel.dataset.tagSignature = signature;

        // Keep the current choice if it still exists.
        if (current && tags.some((t) => t.name === current)) sel.value = current;
    }

    function refreshPickers() {
        [['devlog-primary-tag', 'primary'], ['devlog-secondary-tag', 'secondary']].forEach(([id, kind]) => {
            const sel = document.getElementById(id);
            if (sel) fillSelect(sel, '(none)', tagsOfKind(kind));
        });

        // The "+ Add Tag" dropdowns on the devlog and social forms. These
        // used to have their options typed into the HTML, so tags created
        // in the tag manager never appeared in them.
        ['devlog-tag-select', 'social-tag-select'].forEach((id) => {
            const sel = document.getElementById(id);
            if (sel) fillSelect(sel, '+ Add Tag', allTags());
        });
    }

    /* ================= 2. tag management ================= */

    // Tag names are typed by hand, so anything going into an attribute has
    // to be escaped or a stray quote breaks the whole row.
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function tagListHTML(kind) {
        const tags = tagsOfKind(kind);
        if (!tags.length) return '<p style="opacity:0.6; font-family:monospace;">None yet.</p>';

        const rowStyle = 'border:1px solid rgba(185,204,204,0.25); border-radius:4px;'
            + 'padding:0.6rem; margin-bottom:0.6rem;';
        const line = 'display:flex; gap:0.5rem; align-items:center;';
        const arrow = 'font-size:0.75rem; padding:0.2rem 0.5rem; line-height:1;';

        return tags.map((t, i) => `
            <div style="${rowStyle}">
                <div style="${line}">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <button type="button" class="btn-rugged" data-tag-up="${t.id}"
                                title="Move up" ${i === 0 ? 'disabled' : ''}
                                style="${arrow}">&#9650;</button>
                        <button type="button" class="btn-rugged" data-tag-down="${t.id}"
                                title="Move down" ${i === tags.length - 1 ? 'disabled' : ''}
                                style="${arrow}">&#9660;</button>
                    </div>
                    <input type="color" value="${esc(t.color || '#5DCCCA')}"
                           data-tag-color="${t.id}" style="width:44px; height:34px; padding:2px;">
                    <input type="text" value="${esc(t.name)}" data-tag-name="${t.id}"
                           style="flex:1; font-family:monospace;" aria-label="Tag name">
                    <button type="button" class="btn-rugged" data-tag-delete="${t.id}"
                            style="font-size:0.75rem; padding:0.3rem 0.6rem; background:#E74C3C;">
                        Remove
                    </button>
                </div>
                <div style="${line} margin-top:0.5rem;">
                    <input type="text" value="${esc(t.nameMi || '')}" data-tag-name-mi="${t.id}"
                           placeholder="Te reo label (optional)"
                           style="flex:1; font-family:monospace; font-size:0.85rem;"
                           aria-label="Te reo label">
                    <label style="font-family:var(--font-mono); font-size:0.75rem;
                                  display:flex; align-items:center; gap:0.35rem; white-space:nowrap;">
                        <input type="checkbox" data-tag-filter="${t.id}"
                               style="width:auto;" ${t.filter === false ? '' : 'checked'}>
                        Filter button
                    </label>
                </div>
            </div>`).join('');
    }

    function mountTagManager() {
        // These are devlog tags, so they live on the devlogs tab. There is
        // no tags-tab or settings-tab in this admin; looking for those was
        // why this panel never appeared.
        const tab = document.getElementById('devlogs-tab')
                 || document.querySelector('[id$="-tab"]');
        if (!tab || document.getElementById('tag-kinds-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'tag-kinds-panel';
        panel.style.cssText =
            `border:${PANEL_BORDER}; border-radius:6px; padding:1.25rem; margin-bottom:1.5rem;`
            + 'background:rgba(93,204,202,0.06);';
        tab.insertBefore(panel, tab.firstChild);
        renderTagManager();
    }

    function renderTagManager() {
        const panel = document.getElementById('tag-kinds-panel');
        if (!panel) return;

        // Redraw only when the tags have actually changed. This is called
        // from mountAll(), which the MutationObserver drives - rewriting
        // innerHTML unconditionally from there retriggers the observer and
        // loops forever.
        // Order matters here: the array order IS the filter button order, so
        // a reorder has to change the signature or the redraw gets skipped.
        const signature = allTags()
            .map((t) => [t.id, t.kind, t.name, t.nameMi, t.color, t.filter !== false]
                .join('\u001f')).join('\u0000');
        if (panel.dataset.tagSignature === signature) return;
        panel.dataset.tagSignature = signature;

        panel.innerHTML = `
            <h3 style="font-family:var(--font-display); margin:0 0 0.35rem;">Devlog tags</h3>
            <p style="font-family:var(--font-mono); font-size:0.78rem; opacity:0.75; margin:0 0 1.25rem;">
                Every devlog gets one <strong>primary</strong> tag (which game it's about,
                or studio news) and one <strong>secondary</strong> tag (what kind of update it is).
                <br>Tick <strong>Filter button</strong> to give a tag its own button on the
                devlogs page, and use the arrows to set the order those buttons appear in.
            </p>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
                <div>
                    <h4 style="font-family:var(--font-mono); font-size:0.85rem; margin:0 0 0.6rem;">
                        Primary
                    </h4>
                    <div id="primary-tag-list">${tagListHTML('primary')}</div>
                    <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
                        <input type="text" id="new-primary-tag" placeholder="e.g. Paper Crown"
                               style="flex:1; font-family:monospace;">
                        <button type="button" class="btn-rugged" data-add-tag="primary"
                                style="font-size:0.75rem; padding:0.3rem 0.7rem;">Add</button>
                    </div>
                    <div style="margin-top:0.6rem;">
                        <button type="button" class="btn-rugged" id="tags-from-games"
                                style="font-size:0.75rem; padding:0.3rem 0.7rem;">
                            + Add a tag for each game
                        </button>
                        <div style="font-family:var(--font-mono); font-size:0.7rem;
                                    opacity:0.6; margin-top:0.35rem;">
                            Makes one primary tag per game in the Games tab. Skips any that
                            already exist, so it is safe to press again after adding a game.
                        </div>
                    </div>
                </div>

                <div>
                    <h4 style="font-family:var(--font-mono); font-size:0.85rem; margin:0 0 0.6rem;">
                        Secondary
                    </h4>
                    <div id="secondary-tag-list">${tagListHTML('secondary')}</div>
                    <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
                        <input type="text" id="new-secondary-tag" placeholder="e.g. Bug Fix"
                               style="flex:1; font-family:monospace;">
                        <button type="button" class="btn-rugged" data-add-tag="secondary"
                                style="font-size:0.75rem; padding:0.3rem 0.7rem;">Add</button>
                    </div>
                </div>
            </div>

            <p style="font-family:var(--font-mono); font-size:0.75rem; opacity:0.6; margin:1.25rem 0 0;">
                Changes here are saved with everything else when you hit "Save to site".
            </p>`;

        panel.querySelectorAll('[data-add-tag]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const kind = btn.dataset.addTag;
                const input = document.getElementById('new-' + kind + '-tag');
                const name = input.value.trim();
                if (!name) return;
                if (data.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
                    showAlert('A tag with that name already exists.', 'error');
                    return;
                }
                const nextId = data.tags.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1;
                data.tags.push({
                    id: nextId, name,
                    color: kind === 'primary' ? '#5DCCCA' : '#B9CCCC',
                    category: kind === 'primary' ? 'general' : 'devlog',
                    kind,
                });
                input.value = '';
                renderTagManager();
                refreshPickers();
            });
        });

        // Games became a real list in migration 0009, which is what unblocked
        // this. The primary axis is "which game is this devlog about", so the
        // names come straight from the Games tab rather than being retyped.
        //
        // It creates real tag rows rather than deriving the options live: a
        // devlog stores its primary tag by NAME, so a derived list would make
        // every devlog silently lose its tag the moment a game was renamed.
        // As rows they are hers to rename, reorder, give a te reo label, and
        // switch off as filter buttons, exactly like every other tag.
        const fromGames = document.getElementById('tags-from-games');
        if (fromGames) fromGames.addEventListener('click', () => {
            const games = Array.isArray(data.games) ? data.games : [];
            const titled = games
                .map((g) => (g && typeof g.titleEn === 'string' ? g.titleEn.trim() : ''))
                .filter(Boolean);

            if (!titled.length) {
                showAlert('No games with a title yet. Name one in the Games tab first.', 'error');
                return;
            }

            // Deduplicated against EVERY tag, not just the primary ones - two
            // tags with the same name would be indistinguishable on a badge.
            // Also deduplicated within this batch, in case two games share a
            // title (the two placeholders currently do).
            let added = 0;
            titled.forEach((name) => {
                const taken = data.tags.some(
                    (t) => t.name && t.name.toLowerCase() === name.toLowerCase());
                if (taken) return;
                const nextId = data.tags.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1;
                data.tags.push({
                    id: nextId, name,
                    color: '#5DCCCA', category: 'general', kind: 'primary',
                });
                added++;
            });

            if (!added) {
                showAlert('Every game already has a tag.', 'success');
                return;
            }
            renderTagManager();
            refreshPickers();
            showAlert(
                `Added ${added} game tag${added === 1 ? '' : 's'}. ` +
                'Press 💾 Save to site to publish.', 'success');
        });

        panel.querySelectorAll('[data-tag-delete]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = Number(btn.dataset.tagDelete);
                const tag = data.tags.find((t) => t.id === id);
                if (!tag) return;
                const inUse = (data.devlogs || []).filter(
                    (d) => d.primaryTag === tag.name || d.secondaryTag === tag.name).length;
                const msg = inUse
                    ? `"${tag.name}" is used on ${inUse} devlog(s). Remove it anyway?`
                    : `Remove the tag "${tag.name}"?`;
                if (!confirm(msg)) return;
                data.tags = data.tags.filter((t) => t.id !== id);
                renderTagManager();
                refreshPickers();
            });
        });

        panel.querySelectorAll('[data-tag-name]').forEach((input) => {
            input.addEventListener('input', () => {
                const tag = data.tags.find((t) => t.id === Number(input.dataset.tagName));
                if (tag) tag.name = input.value;
                refreshPickers();
            });
        });

        panel.querySelectorAll('[data-tag-color]').forEach((input) => {
            input.addEventListener('input', () => {
                const tag = data.tags.find((t) => t.id === Number(input.dataset.tagColor));
                if (tag) tag.color = input.value;
            });
        });

        panel.querySelectorAll('[data-tag-name-mi]').forEach((input) => {
            input.addEventListener('input', () => {
                const tag = data.tags.find((t) => t.id === Number(input.dataset.tagNameMi));
                if (tag) tag.nameMi = input.value;
            });
        });

        panel.querySelectorAll('[data-tag-filter]').forEach((box) => {
            box.addEventListener('change', () => {
                const tag = data.tags.find((t) => t.id === Number(box.dataset.tagFilter));
                if (tag) tag.filter = box.checked;
            });
        });

        // Reordering. The order of data.tags is the order the filter buttons
        // appear in, so moving a tag means swapping it with its neighbour of
        // the SAME kind - the two lists are shown separately but live in one
        // array, so stepping one index would jump across into the other list.
        function move(id, direction) {
            const tag = data.tags.find((t) => t.id === id);
            if (!tag) return;
            const kind = tag.kind || 'secondary';
            const sameKind = data.tags.filter((t) => (t.kind || 'secondary') === kind);
            const at = sameKind.indexOf(tag);
            const swapWith = sameKind[at + direction];
            if (!swapWith) return;

            const a = data.tags.indexOf(tag);
            const b = data.tags.indexOf(swapWith);
            data.tags[a] = swapWith;
            data.tags[b] = tag;

            renderTagManager();
            refreshPickers();
        }

        panel.querySelectorAll('[data-tag-up]').forEach((btn) => {
            btn.addEventListener('click', () => move(Number(btn.dataset.tagUp), -1));
        });
        panel.querySelectorAll('[data-tag-down]').forEach((btn) => {
            btn.addEventListener('click', () => move(Number(btn.dataset.tagDown), 1));
        });
    }

    /* ================= 3. who can edit this site ================= */

    // This used to be a live list of password accounts with Add and
    // Remove buttons, which meant ANYBODY who could sign in could delete
    // anybody else - including Cat's own account. It is gone with the
    // password login. Who may publish is now one flag on one screen in
    // the hub, and the website only ever reads it.
    //
    // Left as a plain explanation on purpose. A read-only copy of the
    // list would be a second place to look that can disagree with the
    // first, which is the exact problem this replaced.
    function mountUsers() {
        const tab = document.getElementById('homepage-tab')
                 || document.querySelector('[id$="-tab"]');
        if (!tab || document.getElementById('admin-users-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'admin-users-panel';
        panel.style.cssText =
            `border:${PANEL_BORDER}; border-radius:6px; padding:1.25rem; margin-bottom:1.5rem;`
            + 'background:rgba(93,204,202,0.06);';
        panel.innerHTML = `
            <h3 style="font-family:var(--font-display); margin:0 0 0.35rem;">Who can edit this site</h3>
            <p style="font-family:var(--font-mono); font-size:0.78rem; opacity:0.8; margin:0 0 0.75rem;">
                Signing in is handled by the studio hub, so there are no passwords
                here any more and nothing to reset.
            </p>
            <p style="font-family:var(--font-mono); font-size:0.78rem; opacity:0.8; margin:0 0 0.75rem;">
                Two things have to be true for somebody to get in, and they are set
                in two different places:
            </p>
            <ol style="font-family:var(--font-mono); font-size:0.78rem; opacity:0.8;
                       margin:0 0 0.75rem; padding-left:1.2rem; line-height:1.7;">
                <li>They are on the Cloudflare Access list, which lets them reach this page.</li>
                <li>Their hub profile has <strong>can edit site</strong> switched on,
                    which is what this panel checks.</li>
            </ol>
            <p style="font-family:var(--font-mono); font-size:0.78rem; opacity:0.8; margin:0;">
                <a href="https://hub.digitailstudios.com/" style="color:#5DCCCA;">Open the hub</a>
                and go to People to change either one. The address has to match
                exactly in both places.
            </p>`;
        tab.insertBefore(panel, tab.firstChild);
    }

    /* ================= keep the devlog form in sync ================= */

    // When an existing devlog is opened for editing, fill the pickers.
    const origEdit = window.editItem;
    if (typeof origEdit === 'function') {
        window.editItem = function (type, id) {
            origEdit.apply(this, arguments);
            if (type !== 'devlogs') return;
            const item = (data.devlogs || []).find((d) => d.id === id);
            if (!item) return;
            const p = document.getElementById('devlog-primary-tag');
            const s = document.getElementById('devlog-secondary-tag');
            if (p) p.value = item.primaryTag || '';
            if (s) s.value = item.secondaryTag || '';
        };
    }

    // And write them back on save.
    const origSave = window.saveItem;
    if (typeof origSave === 'function') {
        window.saveItem = function (event, type) {
            const p = document.getElementById('devlog-primary-tag');
            const s = document.getElementById('devlog-secondary-tag');
            const primary = p ? p.value : '';
            const secondary = s ? s.value : '';
            const before = new Set((data.devlogs || []).map((d) => d.id));

            const result = origSave.apply(this, arguments);

            if (type === 'devlogs') {
                // the edited or newly created entry
                const target = (data.devlogs || []).find((d) => !before.has(d.id))
                    || (data.devlogs || [])[0];
                if (target) {
                    target.primaryTag = primary;
                    target.secondaryTag = secondary;
                }
            }
            return result;
        };
    }

    /* ================= boot ================= */

    function mountAll() {
        mountDevlogPickers();
        mountTagManager();
        mountUsers();
        // mountTagManager() returns early once the panel exists, so the
        // redraw has to happen here or the list never catches up with data
        // that arrived after the panel was built.
        renderTagManager();
        refreshPickers();
    }

    // One pass per frame at most, and stop watching once all three
    // panels exist. Without this the admin pegs a CPU core.
    let queued = false;
    const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            mountAll();
            const done = document.getElementById('devlog-primary-tag')
                      && document.getElementById('tag-kinds-panel')
                      && document.getElementById('admin-users-panel');
            if (done) observer.disconnect();
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountAll);
    } else {
        mountAll();
    }

    const origLoad = window.loadFromServer;
    if (origLoad) {
        window.loadFromServer = async function () {
            await origLoad.apply(this, arguments);
            mountAll();
            renderTagManager();
        };
    }
})();
