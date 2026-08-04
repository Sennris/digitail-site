/**
 * Bridges the existing admin panel to the live API.
 *
 * Loads AFTER admin-script.js so it can override what it needs to.
 * Two jobs:
 *   1. Pull all content from the API when the page opens, instead of
 *      making you import JSON files by hand.
 *   2. Turn the "download JSON" button into a real save.
 *
 * Everything else in admin-script.js is untouched.
 */

(function () {
    'use strict';

    const TYPES = ['devlogs', 'foxes', 'team', 'social', 'tags'];

    /* ---------- load ---------- */

    async function loadFromServer() {
        const results = await Promise.all([
            ...TYPES.map((t) =>
                fetch(`/api/content/${t}`)
                    .then((r) => (r.ok ? r.json() : []))
                    .catch(() => [])
            ),
            fetch('/api/content/homepage').then((r) => (r.ok ? r.json() : null)).catch(() => null),
            fetch('/api/content/game').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        TYPES.forEach((t, i) => { data[t] = results[i] || []; });

        const homepage = results[TYPES.length];
        const game = results[TYPES.length + 1];

        data.homepage = homepage || null;
        data.links = (homepage && homepage.communityLinks) || [];
        data.game = game || null;

        if (typeof renderAllLists === 'function') renderAllLists();
        if (typeof loadGameForm === 'function') loadGameForm();
        if (typeof loadHomepageForm === 'function') loadHomepageForm();

        const counts = TYPES.map((t) => `${t} ${data[t].length}`).join(', ');
        console.log('[admin] loaded from server:', counts);
    }

    /* ---------- save ---------- */

    async function putContent(type, payload) {
        const res = await fetch(`/api/content/${type}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (res.status === 401) {
            throw new Error('Your session expired. Reload the page and sign in again.');
        }
        if (!res.ok) {
            let msg = `Save failed for ${type}`;
            try { msg = (await res.json()).error || msg; } catch { /* keep default */ }
            throw new Error(msg);
        }
        return res.json();
    }

    async function saveAllToServer() {
        const btn = document.getElementById('save-all-btn');
        const original = btn ? btn.innerHTML : null;
        if (btn) { btn.disabled = true; btn.innerHTML = '💾 Saving...'; }

        try {
            for (const type of TYPES) {
                await putContent(type, data[type] || []);
            }

            // homepage settings and community links save together
            const homepage = data.homepage ? { ...data.homepage } : {};
            homepage.communityLinks = data.links || [];
            await putContent('homepage', homepage);

            if (data.game) await putContent('game', data.game);

            showAlert('✅ Saved. The live site is updated.', 'success');
        } catch (e) {
            showAlert(`❌ ${e.message}`, 'error');
            console.error('[admin] save failed:', e);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = original; }
        }
    }

    /* ---------- wire up ---------- */

    // The old download function is kept as a manual backup export.
    window.downloadAllJSONBackup = window.downloadAllJSON;
    window.downloadAllJSON = saveAllToServer;
    window.saveAllToServer = saveAllToServer;
    window.loadFromServer = loadFromServer;

    window.addEventListener('DOMContentLoaded', loadFromServer);
    if (document.readyState !== 'loading') loadFromServer();

    // Warn before leaving with unsaved edits.
    let dirty = false;
    document.addEventListener('input', () => { dirty = true; });
    const origSave = saveAllToServer;
    window.saveAllToServer = async function () {
        await origSave();
        dirty = false;
    };
    window.addEventListener('beforeunload', (e) => {
        if (!dirty) return;
        e.preventDefault();
        e.returnValue = '';
    });
})();
