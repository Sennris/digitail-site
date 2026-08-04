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

    function tagsOfKind(kind) {
        return (window.data && Array.isArray(data.tags) ? data.tags : [])
            .filter((t) => (t.kind || 'secondary') === kind);
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

    function refreshPickers() {
        [['devlog-primary-tag', 'primary'], ['devlog-secondary-tag', 'secondary']].forEach(([id, kind]) => {
            const sel = document.getElementById(id);
            if (!sel) return;

            const wanted = '<option value="">(none)</option>'
                + tagsOfKind(kind).map((t) =>
                    `<option value="${t.name}">${t.name}</option>`).join('');

            // Only touch the DOM if it would actually change. Rewriting
            // unconditionally from inside a MutationObserver callback
            // retriggers the observer and loops forever.
            if (sel.innerHTML === wanted) return;

            const current = sel.value;
            sel.innerHTML = wanted;
            if (current) sel.value = current;
        });
    }

    /* ================= 2. tag management ================= */

    function tagListHTML(kind) {
        const tags = tagsOfKind(kind);
        if (!tags.length) return '<p style="opacity:0.6; font-family:monospace;">None yet.</p>';
        return tags.map((t) => `
            <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem;">
                <input type="color" value="${t.color || '#5DCCCA'}"
                       data-tag-color="${t.id}" style="width:44px; height:34px; padding:2px;">
                <input type="text" value="${t.name}" data-tag-name="${t.id}"
                       style="flex:1; font-family:monospace;">
                <button type="button" class="btn-rugged" data-tag-delete="${t.id}"
                        style="font-size:0.75rem; padding:0.3rem 0.6rem; background:#E74C3C;">
                    Remove
                </button>
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

        panel.innerHTML = `
            <h3 style="font-family:var(--font-display); margin:0 0 0.35rem;">Devlog tags</h3>
            <p style="font-family:var(--font-mono); font-size:0.78rem; opacity:0.75; margin:0 0 1.25rem;">
                Every devlog gets one <strong>primary</strong> tag (which game it's about,
                or studio news) and one <strong>secondary</strong> tag (what kind of update it is).
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
    }

    /* ================= 3. admin accounts ================= */

    async function loadUsers() {
        const box = document.getElementById('admin-users-list');
        if (!box) return;
        try {
            const res = await fetch('/api/auth/users');
            if (!res.ok) throw new Error('Could not load accounts');
            const users = await res.json();
            box.innerHTML = users.map((u) => `
                <div style="display:flex; gap:0.75rem; align-items:center; padding:0.55rem 0;
                            border-top:2px dashed rgba(185,204,204,0.25);">
                    <span style="flex:1; font-family:monospace; font-size:0.88rem;">
                        ${u.email}${u.isYou ? ' <strong style="color:#5DCCCA;">(you)</strong>' : ''}
                    </span>
                    ${u.isYou ? '' : `<button type="button" class="btn-rugged"
                        data-remove-user="${u.id}" data-email="${u.email}"
                        style="font-size:0.72rem; padding:0.25rem 0.6rem; background:#E74C3C;">
                        Remove</button>`}
                </div>`).join('');

            box.querySelectorAll('[data-remove-user]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`Remove admin access for ${btn.dataset.email}?`)) return;
                    const res = await fetch('/api/auth/users/' + btn.dataset.removeUser,
                                            { method: 'DELETE' });
                    const out = await res.json();
                    showAlert(res.ok ? `Removed ${out.removed}` : `❌ ${out.error}`,
                              res.ok ? 'success' : 'error');
                    loadUsers();
                });
            });
        } catch (e) {
            box.innerHTML = `<p style="font-family:monospace; opacity:0.7;">${e.message}</p>`;
        }
    }

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
            <h3 style="font-family:var(--font-display); margin:0 0 0.35rem;">Admin accounts</h3>
            <p style="font-family:var(--font-mono); font-size:0.78rem; opacity:0.75; margin:0 0 1rem;">
                Anyone here can edit and publish site content. Added straight
                away, no "Save to site" needed.
            </p>

            <div id="admin-users-list"></div>

            <div style="margin-top:1.25rem; padding-top:1rem;
                        border-top:2px dashed rgba(185,204,204,0.25);">
                <div style="display:grid; grid-template-columns:1fr 1fr auto; gap:0.6rem;">
                    <input type="email" id="new-admin-email" placeholder="email"
                           autocomplete="off" style="font-family:monospace;">
                    <input type="password" id="new-admin-password"
                           placeholder="password (10+ characters)"
                           autocomplete="new-password" style="font-family:monospace;">
                    <button type="button" class="btn-rugged" id="add-admin-btn"
                            style="font-size:0.78rem;">Add</button>
                </div>
            </div>`;
        tab.insertBefore(panel, tab.firstChild);

        document.getElementById('add-admin-btn').addEventListener('click', async () => {
            const email = document.getElementById('new-admin-email').value.trim();
            const password = document.getElementById('new-admin-password').value;
            const res = await fetch('/api/auth/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const out = await res.json();
            if (res.ok) {
                showAlert(`✅ ${out.email} can now sign in`, 'success');
                document.getElementById('new-admin-email').value = '';
                document.getElementById('new-admin-password').value = '';
                loadUsers();
            } else {
                showAlert(`❌ ${out.error}`, 'error');
            }
        });

        loadUsers();
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
