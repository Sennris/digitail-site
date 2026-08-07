/**
 * Image uploads.
 *
 * Files live in R2 and are served back through this Worker at /media/<key>,
 * so there's no second domain to set up and no bucket to make public.
 *
 * Resizing and compression happen in the browser before upload (see
 * public/admin/media-upload.js). That keeps this side simple and means
 * no image processing library has to run in the Worker.
 */

const ALLOWED = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/gif':  'gif',
    'image/avif': 'avif',
};

// Press packs. These are NOT images: the admin uploads them untouched, with
// no browser-side resizing, because compressing a zip would corrupt it.
const ALLOWED_FILES = {
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/pdf': 'pdf',
};

// Images arrive already shrunk by the browser, so 10MB is generous. A press
// pack is a bundle of full-resolution art and cannot be shrunk on the way in.
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 60 * 1024 * 1024;

const NO_CACHE = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
};

const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: NO_CACHE });

const fail = (message, status = 400) =>
    new Response(JSON.stringify({ error: message }), { status, headers: NO_CACHE });


/** Strip anything that could cause trouble in a URL or object key. */
function safeName(name) {
    return (name || 'image')
        .toLowerCase()
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'image';
}

async function shortHash(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].slice(0, 5)
        .map((b) => b.toString(16).padStart(2, '0')).join('');
}


/* ---------- upload ---------- */

export async function handleUpload(request, env) {
    if (!env.MEDIA) {
        return fail('R2 bucket is not bound to this Worker. Check wrangler.toml.', 500);
    }

    let form;
    try {
        form = await request.formData();
    } catch {
        return fail('Upload must be sent as form data');
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') return fail('No file in the upload');

    const type = file.type || '';
    const ext = ALLOWED[type] || ALLOWED_FILES[type];
    if (!ext) {
        return fail(
            `${type || 'That file type'} is not supported. ` +
            'Use JPG, PNG, WebP, GIF or AVIF for images, or ZIP or PDF for a press pack.'
        );
    }

    const isImage = Boolean(ALLOWED[type]);
    const cap = isImage ? MAX_BYTES : MAX_FILE_BYTES;

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) return fail('That file is empty');
    if (buffer.byteLength > cap) {
        return fail(
            `That file is ${(buffer.byteLength / 1048576).toFixed(1)}MB. ` +
            `The limit is ${cap / 1048576}MB.`
        );
    }

    const now = new Date();
    const hash = await shortHash(buffer);
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/`
              + `${hash}-${safeName(file.name)}.${ext}`;

    await env.MEDIA.put(key, buffer, {
        httpMetadata: {
            contentType: type,
            cacheControl: 'public, max-age=31536000, immutable',
        },
    });

    const url = `/media/${key}`;
    const width = Number(form.get('width')) || 0;
    const height = Number(form.get('height')) || 0;
    const alt = String(form.get('alt') || '');

    await env.DB.prepare(
        `INSERT INTO media (r2_key, url, filename, content_type, size_bytes, width, height, alt_text)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(r2_key) DO UPDATE SET uploaded_at = datetime('now')`
    ).bind(key, url, file.name || '', type, buffer.byteLength, width, height, alt).run();

    return json({
        ok: true, url, key,
        size: buffer.byteLength,
        filename: file.name || '',
    });
}


/* ---------- list ---------- */

export async function handleList(env) {
    const { results } = await env.DB.prepare(
        `SELECT id, url, filename, content_type, size_bytes, width, height, alt_text, uploaded_at
         FROM media ORDER BY uploaded_at DESC LIMIT 200`
    ).all();

    return json(results.map((r) => ({
        id: r.id,
        url: r.url,
        filename: r.filename,
        contentType: r.content_type,
        size: r.size_bytes,
        width: r.width,
        height: r.height,
        alt: r.alt_text,
        uploadedAt: r.uploaded_at,
    })));
}


/* ---------- delete ---------- */

export async function handleDelete(env, id) {
    const row = await env.DB.prepare('SELECT r2_key FROM media WHERE id = ?').bind(id).first();
    if (!row) return fail('No such image', 404);

    await env.MEDIA.delete(row.r2_key);
    await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run();

    return json({ ok: true, deleted: row.r2_key });
}


/* ---------- serve ---------- */

export async function serveMedia(request, env, url) {
    if (!env.MEDIA) return new Response('Media not configured', { status: 500 });

    const key = decodeURIComponent(url.pathname.replace(/^\/media\//, ''));
    if (!key || key.includes('..')) return new Response('Not found', { status: 404 });

    const object = await env.MEDIA.get(key);
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Keys contain a content hash, so the same URL always means the same
    // bytes and it's safe to cache forever.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    // Honour conditional requests so repeat visitors get a cheap 304.
    if (request.headers.get('If-None-Match') === object.httpEtag) {
        return new Response(null, { status: 304, headers });
    }

    return new Response(object.body, { headers });
}
