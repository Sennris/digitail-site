/**
 * Image uploading for the admin panel.
 *
 * Adds an Upload button and drag-and-drop to every image field, plus a
 * media library so an image can be reused without re-uploading it.
 *
 * Images are resized and converted to WebP in the browser before being
 * sent, so a 6MB phone photo lands as roughly 200KB. Nothing has to
 * process images on the server.
 */

(function () {
    'use strict';

    const MAX_EDGE = 1600;   // longest side, in pixels
    const QUALITY  = 0.85;

    // Image fields in the admin panel, by input id.
    const IMAGE_FIELDS = [
        'devlog-image', 'fox-image', 'team-avatar', 'social-thumbnail', 'game-keyart',
        'hp-announce-image', 'hp-mascot-default-img', 'hp-mascot-halloween-img',
        'hp-mascot-christmas-img', 'hp-mascot-newyear-img',
    ];


    /* ---------- browser side compression ---------- */

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not a readable image')); };
            img.src = url;
        });
    }

    async function compress(file) {
        // GIFs are left alone. Redrawing one to a canvas would kill the animation.
        if (file.type === 'image/gif') {
            return { blob: file, width: 0, height: 0, name: file.name };
        }

        const img = await loadImage(file);
        let { naturalWidth: w, naturalHeight: h } = img;

        if (Math.max(w, h) > MAX_EDGE) {
            const scale = MAX_EDGE / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', QUALITY));
        if (!blob) return { blob: file, width: w, height: h, name: file.name };

        // If WebP somehow came out bigger, keep the original.
        if (blob.size >= file.size) {
            return { blob: file, width: w, height: h, name: file.name };
        }

        const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
        return { blob, width: w, height: h, name };
    }


    /* ---------- upload ---------- */

    // Anything that is not an image is sent exactly as it left her machine.
    // The compress() path above redraws through a canvas and re-encodes as
    // WebP, which would turn a press pack into a corrupt file that still had
    // a .zip name - the worst kind of broken, because it looks fine until a
    // journalist tries to open it.
    const RAW_TYPES = [
        'application/zip', 'application/x-zip-compressed', 'application/pdf',
    ];
    function isRaw(file) {
        return RAW_TYPES.includes(file.type);
    }

    async function upload(file, onProgress) {
        if (!file.type.startsWith('image/')) {
            throw new Error('That is not an image file');
        }

        onProgress && onProgress('Compressing...');
        const { blob, width, height, name } = isRaw(file)
            ? { blob: file, width: 0, height: 0, name: file.name }
            : await compress(file);

        const form = new FormData();
        form.append('file', new File([blob], name, { type: blob.type }));
        form.append('width', String(width));
        form.append('height', String(height));

        onProgress && onProgress(`Uploading ${(blob.size / 1024).toFixed(0)}KB...`);

        const res = await fetch('/api/media/upload', { method: 'POST', body: form });

        if (res.status === 401) throw new Error('Session expired. Reload and sign in again.');
        if (!res.ok) {
            let msg = 'Upload failed';
            try { msg = (await res.json()).error || msg; } catch { /* keep default */ }
            throw new Error(msg);
        }
        return res.json();
    }


    /* ---------- wiring an input up ---------- */

    // A press pack is not an image: it takes a different picker, a different
    // button label, and no image Library button, because a zip will never be
    // in there.
    function enhance(input, opts) {
        if (input.dataset.uploadReady) return;
        input.dataset.uploadReady = '1';
        const rawFile = Boolean(opts && opts.rawFile);

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:0.5rem; align-items:center; margin-top:0.4rem; flex-wrap:wrap;';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-rugged';
        btn.style.cssText = 'font-size:0.8rem; padding:0.35rem 0.7rem;';
        btn.textContent = rawFile ? '📦 Upload file' : '📁 Upload image';

        const libBtn = document.createElement('button');
        libBtn.type = 'button';
        libBtn.className = 'btn-rugged';
        libBtn.style.cssText = 'font-size:0.8rem; padding:0.35rem 0.7rem;';
        libBtn.textContent = '🖼 Library';

        const status = document.createElement('span');
        status.style.cssText = 'font-family:monospace; font-size:0.78rem; opacity:0.8;';

        const picker = document.createElement('input');
        picker.type = 'file';
        picker.style.display = 'none';

        picker.accept = rawFile ? '.zip,.pdf,application/zip,application/pdf' : 'image/*';

        if (rawFile) wrap.append(btn, status, picker);
        else wrap.append(btn, libBtn, status, picker);
        input.insertAdjacentElement('afterend', wrap);

        async function run(file) {
            btn.disabled = true;
            try {
                const result = await upload(file, (m) => { status.textContent = m; });
                input.value = result.url;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                status.textContent = `✅ ${(result.size / 1024).toFixed(0)}KB`;
                setTimeout(() => { status.textContent = ''; }, 4000);
            } catch (e) {
                status.textContent = `❌ ${e.message}`;
            } finally {
                btn.disabled = false;
                picker.value = '';
            }
        }

        btn.addEventListener('click', () => picker.click());
        picker.addEventListener('change', () => picker.files[0] && run(picker.files[0]));
        libBtn.addEventListener('click', () => openLibrary(input));

        // drag and drop straight onto the text field
        ['dragover', 'dragenter'].forEach((ev) =>
            input.addEventListener(ev, (e) => {
                e.preventDefault();
                input.style.outline = '3px dashed #5DCCCA';
            })
        );
        ['dragleave', 'drop'].forEach((ev) =>
            input.addEventListener(ev, () => { input.style.outline = ''; })
        );
        input.addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) run(file);
        });
    }


    /* ---------- media library ---------- */

    let overlay = null;

    async function openLibrary(targetInput) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.style.cssText =
                'position:fixed; inset:0; background:rgba(29,13,18,0.9); z-index:10000;'
                + 'display:flex; align-items:center; justify-content:center; padding:2rem;';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.style.display = 'none';
            });
            document.body.appendChild(overlay);
        }

        overlay.style.display = 'flex';
        overlay.innerHTML =
            '<div style="background:#B9CCCC; border:3px solid #1D0D12; box-shadow:12px 12px 0 rgba(0,0,0,0.8);'
            + 'border-radius:4px; padding:1.5rem; max-width:900px; width:100%; max-height:80vh; overflow:auto; color:#1D0D12;">'
            + '<h2 style="font-family:Impact,sans-serif; margin:0 0 1rem 0;">Media library</h2>'
            + '<div id="media-grid" style="font-family:monospace;">Loading...</div></div>';

        const grid = overlay.querySelector('#media-grid');

        let items;
        try {
            const res = await fetch('/api/media');
            items = await res.json();
        } catch {
            grid.textContent = 'Could not load the library.';
            return;
        }

        if (!items.length) {
            grid.innerHTML = '<p>Nothing uploaded yet. Use the Upload button on any image field.</p>';
            return;
        }

        grid.style.cssText =
            'display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:1rem;';
        grid.innerHTML = items.map((m) => `
            <div data-url="${m.url}" data-id="${m.id}"
                 style="border:3px solid #1D0D12; background:#DAD2CA; cursor:pointer; border-radius:3px; overflow:hidden;">
                <img src="${m.url}" alt="" style="width:100%; height:100px; object-fit:cover; display:block;">
                <div style="padding:0.4rem; font-family:monospace; font-size:0.65rem; word-break:break-all;">
                    ${m.filename || 'image'}<br>
                    <span style="opacity:0.6;">${(m.size / 1024).toFixed(0)}KB</span>
                </div>
            </div>`).join('');

        grid.querySelectorAll('[data-url]').forEach((el) => {
            el.addEventListener('click', () => {
                targetInput.value = el.dataset.url;
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                overlay.style.display = 'none';
            });
        });
    }


    /* ---------- keep watching, the admin builds forms on the fly ---------- */

    function scan() {
        IMAGE_FIELDS.forEach((id) => {
            const el = document.getElementById(id);
            if (el) enhance(el);
        });

        // Game page sections are added and removed as she edits, so their
        // image fields cannot be listed by id ahead of time.
        document.querySelectorAll('[id^="game-feature-image-"]').forEach((el) => enhance(el));

        // Press kit rows, likewise created and destroyed as she edits.
        document.querySelectorAll('[id^="press-asset-image-"]').forEach((el) => enhance(el));
        document.querySelectorAll('[id^="press-asset-file-"]')
            .forEach((el) => enhance(el, { rawFile: true }));
    }

    // One pass per frame. Without this, scan() runs on every single DOM
    // change and the admin crawls once a few hundred rows are on screen.
    let queued = false;
    const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; scan(); });
    });

    function start() {
        scan();
        observer.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.uploadImage = upload;
})();
