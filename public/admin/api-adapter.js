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

    // Never let a cached copy answer here. The admin has to show what is
    // actually stored, or you end up editing a stale version of the site.
    const FRESH = { cache: 'no-store' };

    async function loadFromServer() {
        const results = await Promise.all([
            ...TYPES.map((t) =>
                fetch(`/api/content/${t}`, FRESH)
                    .then((r) => (r.ok ? r.json() : []))
                    .catch(() => [])
            ),
            fetch('/api/content/homepage', FRESH).then((r) => (r.ok ? r.json() : null)).catch(() => null),
            fetch('/api/content/game', FRESH).then((r) => (r.ok ? r.json() : null)).catch(() => null),
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
            // Pull whatever is currently typed into the homepage and game
            // forms into the working copy BEFORE publishing. Without this,
            // a change you made but did not press the form's own button
            // under is silently dropped - which is what kept the
            // announcement banner switched on after it was unticked.
            if (typeof collectHomepageInfo === 'function') collectHomepageInfo();
            if (typeof collectGameInfo === 'function') collectGameInfo();

            for (const type of TYPES) {
                await putContent(type, data[type] || []);
            }

            // homepage settings and community links save together
            const homepage = data.homepage ? { ...data.homepage } : {};
            homepage.communityLinks = data.links || [];
            await putContent('homepage', homepage);

            if (data.game) await putContent('game', data.game);

            // Read it straight back. If what you see after saving is not
            // what you meant to save, you find out now rather than on the
            // live site.
            await loadFromServer();
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
