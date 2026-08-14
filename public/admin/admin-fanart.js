/**
 * The Fan Art subtab.
 *
 * Two halves that talk to two different tables:
 *
 *   THE QUEUE      /api/fanart/submissions - what people sent in.
 *                  Holds contact details and the permission record.
 *                  Never reaches the public site.
 *   THE GALLERY    data.fanArt, saved through the normal content PUT.
 *                  What the public actually sees.
 *
 * PUBLISHING IS ONE BUTTON. The artist name and credit link travel from
 * the submission to the gallery row on the server, in handleFanArtPublish.
 * They are never retyped here and this panel cannot edit them afterwards -
 * putFanArt in src/writers.js does not accept them. A credit typed twice
 * is a credit that eventually goes wrong, and getting somebody's name
 * wrong on their own artwork is the one mistake here that actually hurts.
 *
 * Self-contained like admin-mascots.js, and it follows the same three
 * house rules:
 *
 *   - Never touch `window.data`. admin-script.js declares its store with
 *     `let data`, which does NOT become a window property. Go through
 *     store().
 *
 *   - Every render is behind a signature check. media-upload.js runs a
 *     MutationObserver over the document, and an unconditional DOM write
 *     inside a render it can retrigger loops forever.
 *
 *   - installWrapper() runs at PARSE TIME, not inside boot(). api-adapter.js
 *     registers its DOMContentLoaded handler first, so a wrapper installed
 *     in boot() misses the initial load and the list sits empty.
 */

(function () {
    'use strict';

    function store() {
        // typeof, not window.data. See the note above.
        if (typeof data === 'undefined') return null;
        return data;
    }

    function gallery() {
        const d = store();
        if (!d) return [];
        if (!Array.isArray(d.fanArt)) d.fanArt = [];
        return d.fanArt;
    }

    let submissions = [];
    let queueSig = '';
    let gallerySig = '';

    function el(tag, text, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null && text !== '') node.textContent = text;
        return node;
    }

    /* ---------- the queue ---------- */

    function loadSubmissions() {
        return fetch('/api/fanart/submissions', { credentials: 'same-origin' })
            .then((r) => (r.ok ? r.json() : { submissions: [] }))
            .then((d) => { submissions = d.submissions || []; renderQueue(false); })
            .catch(() => { /* leave whatever is on screen */ });
    }

    function setStatus(id, status) {
        return fetch(`/api/fanart/submissions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ status }),
        }).then(loadSubmissions);
    }

    function renderQueue(force) {
        const box = document.getElementById('fanart-queue');
        if (!box) return;

        const sig = JSON.stringify(submissions.map((s) => [s.id, s.status]));
        if (!force && sig === queueSig) return;
        queueSig = sig;

        box.textContent = '';

        const waiting = submissions.filter((s) => s.status === 'new');
        if (!waiting.length) {
            box.appendChild(el('p', 'Nothing waiting. Submissions from the website land here.', 'muted'));
        }

        submissions.forEach((sub) => {
            const row = el('div', null, `fa-sub fa-sub--${sub.status}`);

            const head = el('div', null, 'fa-sub__head');
            head.appendChild(el('strong', sub.artistName));
            head.appendChild(el('span', sub.status, 'fa-sub__status'));
            row.appendChild(head);

            if (sub.title) row.appendChild(el('div', sub.title, 'fa-sub__title'));

            // Every link here points somewhere nobody has vetted yet.
            const art = document.createElement('a');
            art.href = sub.artUrl;
            art.target = '_blank';
            art.rel = 'noopener noreferrer nofollow';
            art.textContent = 'open the art →';
            row.appendChild(art);

            if (sub.creditLink) {
                const who = document.createElement('a');
                who.href = sub.creditLink;
                who.target = '_blank';
                who.rel = 'noopener noreferrer nofollow';
                who.textContent = 'their page →';
                who.className = 'fa-sub__who';
                row.appendChild(who);
            }

            if (sub.note) row.appendChild(el('p', sub.note, 'fa-sub__note'));
            if (sub.contactEmail) row.appendChild(el('div', sub.contactEmail, 'fa-sub__email'));

            // The permission record, shown in full. If this is ever
            // questioned the answer needs to be the exact sentence they
            // agreed to, not a summary of it.
            const consent = el('details', null, 'fa-sub__consent');
            consent.appendChild(el('summary', `permission ticked ${sub.consentAt}`));
            consent.appendChild(el('p', sub.consentText));
            row.appendChild(consent);

            if (sub.status === 'new') {
                const actions = el('div', null, 'fa-sub__actions');

                const upload = document.createElement('input');
                upload.type = 'text';
                upload.placeholder = 'Image path, uploaded on the Media tab';
                upload.className = 'fa-sub__image';

                const alt = document.createElement('input');
                alt.type = 'text';
                alt.placeholder = 'Alt text - describe the picture';
                alt.className = 'fa-sub__alt';

                const publish = el('button', 'Publish', 'btn');
                publish.type = 'button';
                publish.addEventListener('click', () => {
                    if (!upload.value.trim()) {
                        window.alert('Upload the image on the Media tab first, then paste its path here.');
                        return;
                    }
                    publish.disabled = true;
                    fetch('/api/fanart/publish', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({
                            submissionId: sub.id,
                            image: upload.value,
                            altText: alt.value,
                        }),
                    })
                        .then((r) => r.json())
                        .then((res) => {
                            publish.disabled = false;
                            if (res.error) { window.alert(res.error); return; }
                            // The gallery lives in the shared store, which
                            // only refills on a reload from the server.
                            if (typeof loadFromServer === 'function') loadFromServer();
                            loadSubmissions();
                        })
                        .catch(() => { publish.disabled = false; });
                });

                const decline = el('button', 'Not this one', 'btn btn--quiet');
                decline.type = 'button';
                decline.addEventListener('click', () => {
                    // Declined rows are KEPT, so the same piece arriving
                    // twice is recognisable and nobody gets asked again.
                    if (window.confirm('Mark this as not going up? It stays in the list.')) {
                        setStatus(sub.id, 'declined');
                    }
                });

                actions.appendChild(upload);
                actions.appendChild(alt);
                actions.appendChild(publish);
                actions.appendChild(decline);
                row.appendChild(actions);
            } else if (sub.status === 'declined') {
                const reopen = el('button', 'Reopen', 'btn btn--quiet');
                reopen.type = 'button';
                reopen.addEventListener('click', () => setStatus(sub.id, 'new'));
                row.appendChild(reopen);
            }

            box.appendChild(row);
        });
    }

    /* ---------- the published gallery ---------- */

    function renderGallery(force) {
        const box = document.getElementById('fanart-published');
        if (!box) return;

        const items = gallery();
        const sig = JSON.stringify(items.map((i) => [i.id, i.title, i.image, i.altText, i.enabled]));
        if (!force && sig === gallerySig) return;
        gallerySig = sig;

        box.textContent = '';
        if (!items.length) {
            box.appendChild(el('p', 'Nothing published yet.', 'muted'));
            return;
        }

        items.forEach((item, index) => {
            const row = el('div', null, 'fa-piece');

            // Not editable, deliberately. The credit came from what the
            // artist typed and putFanArt will not accept a change to it.
            const credit = el('div', null, 'fa-piece__credit');
            credit.appendChild(el('strong', item.artistName));
            credit.appendChild(el('span', ' — credit is fixed from the submission', 'muted'));
            row.appendChild(credit);

            const title = document.createElement('input');
            title.type = 'text';
            title.value = item.title || '';
            title.placeholder = 'Title';
            title.addEventListener('input', () => { item.title = title.value; });
            row.appendChild(title);

            const image = document.createElement('input');
            image.type = 'text';
            image.value = item.image || '';
            image.placeholder = 'Image path';
            image.addEventListener('input', () => { item.image = image.value; });
            row.appendChild(image);

            const alt = document.createElement('input');
            alt.type = 'text';
            alt.value = item.altText || '';
            alt.placeholder = 'Alt text';
            alt.addEventListener('input', () => { item.altText = alt.value; });
            row.appendChild(alt);

            // A takedown is this switch, not a delete: the piece leaves the
            // public page immediately and the record of who sent it and
            // what they agreed to stays.
            const onoff = document.createElement('label');
            const box2 = document.createElement('input');
            box2.type = 'checkbox';
            box2.checked = item.enabled !== false;
            box2.addEventListener('change', () => {
                item.enabled = box2.checked;
                renderGallery(true);
            });
            onoff.appendChild(box2);
            onoff.appendChild(document.createTextNode(' Showing on the site'));
            row.appendChild(onoff);

            const up = el('button', '↑', 'btn btn--quiet');
            up.type = 'button';
            up.disabled = index === 0;
            up.addEventListener('click', () => {
                const list = gallery();
                const swap = list[index - 1];
                list[index - 1] = list[index];
                list[index] = swap;
                renderGallery(true);
            });
            row.appendChild(up);

            box.appendChild(row);
        });
    }

    function renderAll(force) {
        renderQueue(force);
        renderGallery(force);
    }

    /* ---------- wiring ---------- */

    function installWrapper() {
        const inner = window.loadFromServer;
        if (typeof inner !== 'function') return false;
        if (inner.__fanArtWrapped) return true;

        const wrapped = async function (...args) {
            const out = await inner.apply(this, args);
            const d = store();
            if (d && !Array.isArray(d.fanArt)) d.fanArt = [];
            renderAll(true);
            return out;
        };
        wrapped.__fanArtWrapped = true;
        window.loadFromServer = wrapped;
        return true;
    }

    installWrapper();

    function settle() {
        const started = Date.now();
        const timer = setInterval(() => {
            installWrapper();
            renderAll(false);
            if (Date.now() - started > 15000) clearInterval(timer);
        }, 120);
    }

    function boot() {
        installWrapper();
        loadSubmissions();
        renderAll(true);
        settle();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 0);
    }

    window.__fanArt = { renderAll, loadSubmissions, queue: () => submissions };
}());
