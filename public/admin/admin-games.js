/**
 * The Games tab.
 *
 * Self-contained on purpose. admin-script.js is the fragile part of this
 * panel, so this mounts alongside it rather than being threaded through it.
 *
 * Two rules this file follows deliberately, both learned the hard way here:
 *
 *   - Never touch `window.data`. admin-script.js declares its store with
 *     `let data`, and a top-level `let` in a classic script does NOT become
 *     a property of window. Three separate features in this panel read
 *     nothing for months because they checked `window.data` first. Go
 *     through store() below.
 *
 *   - Never redraw the DOM unconditionally from anything an observer can
 *     retrigger. Every render here is behind a signature check.
 */

(function () {
    'use strict';

    /* ---------- reaching the shared store safely ---------- */

    function store() {
        // typeof, not window.data. See the note above.
        if (typeof data === 'undefined') return null;
        return data;
    }

    function games() {
        const d = store();
        if (!d) return [];
        if (!Array.isArray(d.games)) d.games = [];
        return d.games;
    }

    let selectedId = null;

    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function alertUser(msg, kind) {
        if (typeof showAlert === 'function') showAlert(msg, kind || 'success');
    }

    function nextId() {
        return games().reduce((max, g) => Math.max(max, Number(g.id) || 0), 0) + 1;
    }

    function blankGame() {
        return {
            id: nextId(), slug: '',
            titleEn: '', titleMi: '', taglineEn: '', taglineMi: '',
            blurbEn: '', blurbMi: '', trailerUrl: '', keyArt: '',
            statusEn: '', statusMi: '',
            ctaLabelEn: '', ctaLabelMi: '', ctaUrl: '',
            noteEn: '', noteMi: '',
            featured: false, published: false, features: [],
        };
    }

    function selected() {
        return games().find((g) => g.id === selectedId) || null;
    }


    /* ---------- the list down the side ---------- */

    function listHTML() {
        const list = games();
        if (!list.length) {
            return '<p class="helper-text">No games yet. Add one to get started.</p>';
        }
        return list.map((g, i) => {
            const name = g.titleEn || 'Untitled';
            const flags = [];
            if (g.featured) flags.push('★ Featured');
            flags.push(g.published ? 'Live' : 'Hidden');
            return `
                <div class="game-row${g.id === selectedId ? ' is-selected' : ''}">
                    <button type="button" class="game-row-name"
                            data-game-select="${g.id}">
                        ${esc(name)}
                        <span class="game-row-flags">${esc(flags.join(' · '))}</span>
                    </button>
                    <span class="game-row-tools">
                        <button type="button" data-game-move="${g.id}" data-dir="-1"
                                title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
                        <button type="button" data-game-move="${g.id}" data-dir="1"
                                title="Move down" ${i === list.length - 1 ? 'disabled' : ''}>▼</button>
                        <button type="button" data-game-delete="${g.id}"
                                title="Delete">✕</button>
                    </span>
                </div>`;
        }).join('');
    }

    function renderList() {
        const panel = document.getElementById('games-list-panel');
        if (!panel) return;

        // Signature guard. Without it this can be retriggered by its own
        // write and spin forever.
        const sig = games().map((g) =>
            [g.id, g.titleEn, g.featured, g.published].join('~')
        ).join('|') + '#' + selectedId;
        if (panel.dataset.gamesSignature === sig) return;
        panel.dataset.gamesSignature = sig;

        panel.innerHTML = listHTML();
    }


    /* ---------- the editor ---------- */

    function featureRowHTML(f, i) {
        return `
            <div class="feature-row" data-feature-index="${i}">
                <div class="feature-row-head">
                    <strong>Section ${i + 1}</strong>
                    <span class="game-row-tools">
                        <button type="button" data-feature-move="${i}" data-dir="-1"
                                title="Move up">▲</button>
                        <button type="button" data-feature-move="${i}" data-dir="1"
                                title="Move down">▼</button>
                        <button type="button" data-feature-delete="${i}"
                                title="Remove section">✕</button>
                    </span>
                </div>
                <div class="form-group">
                    <label>Heading (English)</label>
                    <input type="text" data-feature-field="taglineEn" data-index="${i}"
                           value="${esc(f.taglineEn)}" placeholder="Don't freeze. Don't panic.">
                </div>
                <div class="form-group">
                    <label>Heading (Te Reo Māori)</label>
                    <input type="text" data-feature-field="taglineMi" data-index="${i}"
                           value="${esc(f.taglineMi)}">
                    <div class="helper-text">Leave blank to show the English heading.</div>
                </div>
                <div class="form-group">
                    <label>Text (English)</label>
                    <textarea rows="4" data-feature-field="textEn"
                              data-index="${i}">${esc(f.textEn)}</textarea>
                </div>
                <div class="form-group">
                    <label>Text (Te Reo Māori)</label>
                    <textarea rows="4" data-feature-field="textMi"
                              data-index="${i}">${esc(f.textMi)}</textarea>
                </div>
                <div class="form-group">
                    <label>Screenshot</label>
                    <input type="text" id="game-feature-image-${i}"
                           data-feature-field="image" data-index="${i}"
                           value="${esc(f.image)}"
                           placeholder="Upload or paste an image URL">
                </div>
            </div>`;
    }

    function editorHTML(g) {
        if (!g) {
            return `<div class="card">
                <h2>Games</h2>
                <p class="helper-text">Pick a game from the list, or add a new one.</p>
            </div>`;
        }

        return `
        <div class="card">
            <h2>${esc(g.titleEn || 'Untitled game')}</h2>

            <div class="form-group">
                <label>
                    <input type="checkbox" data-game-field="published"
                           ${g.published ? 'checked' : ''}>
                    Show this game on the website
                </label>
                <div class="helper-text">Leave this off while a project is unannounced. Hidden games are not sent to the public site at all, not even the title.</div>
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" data-game-field="featured"
                           ${g.featured ? 'checked' : ''}>
                    This is the main game
                </label>
                <div class="helper-text">The one on the front page card and on the game page by default. Only one game can hold this at a time.</div>
            </div>

            <hr class="game-divider">

            <div class="form-group">
                <label>Title (English)</label>
                <input type="text" data-game-field="titleEn" value="${esc(g.titleEn)}">
            </div>
            <div class="form-group">
                <label>Title (Te Reo Māori)</label>
                <input type="text" data-game-field="titleMi" value="${esc(g.titleMi)}">
            </div>
            <div class="form-group">
                <label>Tagline (English)</label>
                <input type="text" data-game-field="taglineEn" value="${esc(g.taglineEn)}"
                       placeholder="The line under the title">
            </div>
            <div class="form-group">
                <label>Tagline (Te Reo Māori)</label>
                <input type="text" data-game-field="taglineMi" value="${esc(g.taglineMi)}">
            </div>
            <div class="form-group">
                <label>Status label (English)</label>
                <input type="text" data-game-field="statusEn" value="${esc(g.statusEn)}"
                       placeholder="In development">
            </div>
            <div class="form-group">
                <label>Status label (Te Reo Māori)</label>
                <input type="text" data-game-field="statusMi" value="${esc(g.statusMi)}">
            </div>
            <div class="form-group">
                <label>Web address name</label>
                <input type="text" data-game-field="slug" value="${esc(g.slug)}"
                       placeholder="paper-crown">
                <div class="helper-text">Used in a link like /game.html?g=paper-crown. Lower case, dashes instead of spaces.</div>
            </div>
            <div class="form-group">
                <label>Trailer URL</label>
                <input type="text" data-game-field="trailerUrl" value="${esc(g.trailerUrl)}"
                       placeholder="https://www.youtube.com/watch?v=...">
            </div>

            <hr class="game-divider">
            <h3 class="game-subhead">Front page card</h3>

            <div class="form-group">
                <label>Key art</label>
                <input type="text" id="game-keyart" data-game-field="keyArt"
                       value="${esc(g.keyArt)}" placeholder="Upload or paste an image URL">
                <div id="game-keyart-preview"></div>
            </div>
            <div class="form-group">
                <label>Short blurb (English)</label>
                <textarea rows="3" data-game-field="blurbEn">${esc(g.blurbEn)}</textarea>
            </div>
            <div class="form-group">
                <label>Short blurb (Te Reo Māori)</label>
                <textarea rows="3" data-game-field="blurbMi">${esc(g.blurbMi)}</textarea>
            </div>

            <hr class="game-divider">
            <h3 class="game-subhead">Page sections</h3>
            <p class="helper-text">The alternating blocks down the game page. Add as many as you like, or none.</p>

            <div id="game-features-list">
                ${(g.features || []).map(featureRowHTML).join('')}
            </div>

            <div class="button-group">
                <button type="button" class="btn-rugged" id="game-add-feature">+ Add a section</button>
            </div>

            <div class="form-group">
                <label>Holding message (English)</label>
                <textarea rows="2" data-game-field="noteEn"
                          placeholder="More about this one soon.">${esc(g.noteEn)}</textarea>
                <div class="helper-text">Shown in place of the sections while there are none. Leave blank to show nothing.</div>
            </div>
            <div class="form-group">
                <label>Holding message (Te Reo Māori)</label>
                <textarea rows="2" data-game-field="noteMi">${esc(g.noteMi)}</textarea>
            </div>

            <hr class="game-divider">
            <h3 class="game-subhead">Button at the bottom</h3>

            <div class="form-group">
                <label>Button text (English)</label>
                <input type="text" data-game-field="ctaLabelEn" value="${esc(g.ctaLabelEn)}"
                       placeholder="Add to Steam Wishlist">
            </div>
            <div class="form-group">
                <label>Button text (Te Reo Māori)</label>
                <input type="text" data-game-field="ctaLabelMi" value="${esc(g.ctaLabelMi)}">
            </div>
            <div class="form-group">
                <label>Button link</label>
                <input type="text" data-game-field="ctaUrl" value="${esc(g.ctaUrl)}"
                       placeholder="https://store.steampowered.com/app/...">
                <div class="helper-text">Leave blank to hide the button.</div>
            </div>

            <div class="button-group">
                <span class="save-hint">Changes are kept as a draft. Press 💾 Save to site at the top of the page to publish them.</span>
            </div>
        </div>`;
    }

    function renderEditor(force) {
        const mount = document.getElementById('games-editor');
        if (!mount) return;

        const g = selected();
        // Redrawing while someone is typing would move the caret, so the
        // editor is only rebuilt when the game changes or a row is added
        // or removed - never on a keystroke.
        const sig = g
            ? [g.id, (g.features || []).length].join('~')
            : 'none';
        if (!force && mount.dataset.editorSignature === sig) return;
        mount.dataset.editorSignature = sig;

        mount.innerHTML = editorHTML(g);
    }

    function renderAll(force) {
        renderList();
        renderEditor(force);
    }


    /* ---------- edits ---------- */

    function setField(name, value) {
        const g = selected();
        if (!g) return;
        g[name] = value;

        if (name === 'featured' && value === true) {
            // Only one game can be the main one.
            games().forEach((other) => { if (other !== g) other.featured = false; });
        }
        if (name === 'titleEn' || name === 'published' || name === 'featured') {
            renderList();
        }
    }

    document.addEventListener('input', (e) => {
        const gameField = e.target.getAttribute && e.target.getAttribute('data-game-field');
        if (gameField) { setField(gameField, e.target.value); return; }

        const featField = e.target.getAttribute && e.target.getAttribute('data-feature-field');
        if (featField) {
            const g = selected();
            const i = Number(e.target.getAttribute('data-index'));
            if (g && g.features && g.features[i]) g.features[i][featField] = e.target.value;
        }
    });

    document.addEventListener('change', (e) => {
        const field = e.target.getAttribute && e.target.getAttribute('data-game-field');
        if (field && e.target.type === 'checkbox') {
            setField(field, e.target.checked);
            if (field === 'featured') renderAll(true);
        }
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('button');
        if (!btn) return;

        const selectId = btn.getAttribute('data-game-select');
        if (selectId) {
            selectedId = Number(selectId);
            renderAll(true);
            return;
        }

        const moveId = btn.getAttribute('data-game-move');
        if (moveId) {
            const list = games();
            const i = list.findIndex((g) => g.id === Number(moveId));
            const j = i + Number(btn.getAttribute('data-dir'));
            if (i >= 0 && j >= 0 && j < list.length) {
                [list[i], list[j]] = [list[j], list[i]];
                renderList();
            }
            return;
        }

        const deleteId = btn.getAttribute('data-game-delete');
        if (deleteId) {
            const list = games();
            const i = list.findIndex((g) => g.id === Number(deleteId));
            if (i < 0) return;
            const name = list[i].titleEn || 'this game';
            if (!confirm(`Delete ${name}? This cannot be undone once you press Save to site.`)) return;
            const wasFeatured = list[i].featured;
            list.splice(i, 1);
            if (wasFeatured && list.length) list[0].featured = true;
            if (selectedId === Number(deleteId)) selectedId = list.length ? list[0].id : null;
            renderAll(true);
            alertUser('Game removed. Press 💾 Save to site to publish it.', 'success');
            return;
        }

        if (btn.id === 'game-add') {
            const g = blankGame();
            if (!games().length) { g.featured = true; g.published = true; }
            games().push(g);
            selectedId = g.id;
            renderAll(true);
            return;
        }

        if (btn.id === 'game-add-feature') {
            const g = selected();
            if (!g) return;
            if (!Array.isArray(g.features)) g.features = [];
            g.features.push({ taglineEn: '', taglineMi: '', textEn: '', textMi: '', image: '' });
            renderEditor(true);
            return;
        }

        const featMove = btn.getAttribute('data-feature-move');
        if (featMove !== null && featMove !== undefined) {
            const g = selected();
            if (!g || !g.features) return;
            const i = Number(featMove);
            const j = i + Number(btn.getAttribute('data-dir'));
            if (j >= 0 && j < g.features.length) {
                [g.features[i], g.features[j]] = [g.features[j], g.features[i]];
                renderEditor(true);
            }
            return;
        }

        const featDelete = btn.getAttribute('data-feature-delete');
        if (featDelete !== null && featDelete !== undefined) {
            const g = selected();
            if (!g || !g.features) return;
            g.features.splice(Number(featDelete), 1);
            renderEditor(true);
        }
    });


    /* ---------- wiring ---------- */

    // api-adapter.js calls window.loadFromServer. admin-extras.js already
    // wraps it to redraw the tag manager; this wraps whatever is there by
    // the time we load, so both redraws survive.
    function installWrapper() {
        const inner = window.loadFromServer;
        if (typeof inner !== 'function') return false;
        if (inner.__gamesWrapped) return true;

        const wrapped = async function (...args) {
            const out = await inner.apply(this, args);
            const d = store();
            if (d) {
                if (!Array.isArray(d.games)) d.games = [];
                if (selectedId === null && d.games.length) {
                    const main = d.games.find((g) => g.featured) || d.games[0];
                    selectedId = main.id;
                }
                if (selectedId !== null && !d.games.some((g) => g.id === selectedId)) {
                    selectedId = d.games.length ? d.games[0].id : null;
                }
            }
            renderAll(true);
            return out;
        };
        wrapped.__gamesWrapped = true;
        window.loadFromServer = wrapped;
        return true;
    }

    function boot() {
        if (!installWrapper()) {
            // api-adapter.js has not published it yet. Try again next tick.
            setTimeout(boot, 0);
            return;
        }
        renderAll(true);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 0);
    }

    // Exposed for tools/test_games.mjs.
    window.__games = {
        renderAll,
        selectGame: (id) => { selectedId = id; renderAll(true); },
        selectedId: () => selectedId,
    };
})();
