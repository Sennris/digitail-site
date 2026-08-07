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

    const TYPES = ['devlogs', 'foxes', 'team', 'social', 'tags', 'games',
                   'pressItems', 'pressAssets'];

    /* ---------- load ---------- */

    // Never let a cached copy answer here. The admin has to show what is
    // actually stored, or you end up editing a stale version of the site.
    const FRESH = { cache: 'no-store' };

    const loadedOk = { games: false, pressItems: false, pressAssets: false };

    async function loadFromServer() {
        const results = await Promise.all([
            ...TYPES.map((t) =>
                fetch(`/api/content/${t}`, FRESH)
                    .then((r) => (r.ok ? r.json() : []))
                    .catch(() => [])
            ),
            fetch('/api/content/homepage', FRESH).then((r) => (r.ok ? r.json() : null)).catch(() => null),
            fetch('/api/content/game', FRESH).then((r) => (r.ok ? r.json() : null)).catch(() => null),
            fetch('/api/content/gamesPage', FRESH).then((r) => (r.ok ? r.json() : null)).catch(() => null),
            fetch('/api/content/pressKit', FRESH).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        TYPES.forEach((t, i) => { data[t] = results[i] || []; });

        // Games only publish if they actually arrived. A failed fetch hands
        // back an empty array, and saving that would delete every game -
        // the same shape of accident that once published blank hero
        // taglines over real ones.
        loadedOk.games = Array.isArray(results[TYPES.indexOf('games')]);
        loadedOk.pressItems = Array.isArray(results[TYPES.indexOf('pressItems')]);
        loadedOk.pressAssets = Array.isArray(results[TYPES.indexOf('pressAssets')]);

        const homepage = results[TYPES.length];
        const game = results[TYPES.length + 1];

        data.homepage = homepage || null;
        data.links = (homepage && homepage.communityLinks) || [];
        data.game = game || null;
        // 404s until it has been saved once, which is not an error.
        data.gamesPage = results[TYPES.length + 2] || {};
        data.pressKit = results[TYPES.length + 3] || {};

        if (typeof renderAllLists === 'function') renderAllLists();

        // These used to be called as loadGameForm() / loadHomepageForm(),
        // which are not the names of any function in admin-script.js. The
        // typeof guards meant the mistake never surfaced - the forms just
        // sat empty. Call the real ones, and say so out loud if they are
        // missing rather than failing quietly.
        if (typeof populateGameForm === 'function') populateGameForm(data.game);
        else console.error('[admin] populateGameForm missing - game form will be empty');

        if (typeof populateHomepageForm === 'function') populateHomepageForm(data.homepage);
        else console.error('[admin] populateHomepageForm missing - homepage form will be empty');

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
                // A failed fetch hands back an empty array. Publishing that
                // would delete every row. Same guard, same reason, for all
                // three lists that are edited from a tab she may never open.
                if (type in loadedOk && !loadedOk[type]) {
                    console.warn(`[admin] ${type} did not load; leaving them alone`);
                    continue;
                }
                await putContent(type, data[type] || []);
            }

            if (data.pressKit && Object.keys(data.pressKit).length) {
                await putContent('pressKit', data.pressKit);
            }

            if (data.gamesPage && Object.keys(data.gamesPage).length) {
                await putContent('gamesPage', data.gamesPage);
            }

            // homepage settings and community links save together
            const homepage = data.homepage ? { ...data.homepage } : {};
            homepage.communityLinks = data.links || [];
            await putContent('homepage', homepage);

            // The 'game' blob is no longer written from here. putGames on the
            // server keeps it in step with whichever game is featured, so
            // publishing a separate copy from the browser could only ever put
            // it back out of date.

            // Read it straight back. If what you see after saving is not
            // what you meant to save, you find out now rather than on the
            // live site.
            // window.loadFromServer, not the local one: admin-extras.js
            // wraps it to also refresh the tag manager and the tag
            // dropdowns. Calling the inner function skips all of that.
            await (window.loadFromServer || loadFromServer)();
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

    // Go through window.loadFromServer, not the local one: admin-extras.js
    // wraps it to redraw the tag manager and the tag dropdowns once the
    // content has arrived. Calling the inner function skips all of that,
    // which is why the tag manager sat empty until something else forced a
    // redraw. The flag stops a double load when readyState is already
    // 'interactive' but DOMContentLoaded has not fired yet.
    let booted = false;
    function boot() {
        if (booted) return;
        booted = true;
        return (window.loadFromServer || loadFromServer)();
    }

    window.addEventListener('DOMContentLoaded', boot);
    // setTimeout so any script that loads after this one has a chance to
    // install its wrapper first.
    if (document.readyState !== 'loading') setTimeout(boot, 0);

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
