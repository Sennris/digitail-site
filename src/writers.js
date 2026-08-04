/**
 * Write handlers.
 *
 * The admin panel holds each content type as a whole array in memory and
 * saves the lot. So the API mirrors that: PUT the full collection, and
 * the server replaces it inside a batch (all or nothing). For a site with
 * twenty devlogs this is simple and safe. If the devlog count ever gets
 * into the thousands, this is the piece to revisit.
 */

const s = (v) => (v === undefined || v === null ? '' : String(v));
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);


export async function putDevlogs(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of devlogs');

    const stmts = [
        db.prepare('DELETE FROM devlog_tags'),
        db.prepare('DELETE FROM devlogs'),
    ];

    for (const d of items) {
        stmts.push(
            db.prepare(
                `INSERT INTO devlogs (id, sort_date, display_date, title_en, title_mi,
                 snippet_en, snippet_mi, content_en, content_mi, image,
                 primary_tag, secondary_tag, published, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'))`
            ).bind(
                n(d.id), s(d.sortDate), s(d.displayDate), s(d.titleEn), s(d.titleMi),
                s(d.snippetEn), s(d.snippetMi), s(d.contentEn), s(d.contentMi), s(d.image),
                s(d.primaryTag), s(d.secondaryTag)
            )
        );
        (d.tags || []).forEach((tag, i) => {
            stmts.push(
                db.prepare('INSERT INTO devlog_tags (devlog_id, tag_name, position) VALUES (?,?,?)')
                  .bind(n(d.id), s(tag), i)
            );
        });
    }

    await db.batch(stmts);
    return items.length;
}


export async function putFoxes(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of foxes');
    const stmts = [db.prepare('DELETE FROM foxes')];
    for (const f of items) {
        stmts.push(
            db.prepare(
                `INSERT INTO foxes (id, name_en, name_mi, year, package_en, package_mi,
                 desc_en, desc_mi, bio_en, bio_mi, image) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(
                n(f.id), s(f.nameEn), s(f.nameMi), n(f.year), s(f.packageEn), s(f.packageMi),
                s(f.descEn), s(f.descMi), s(f.bioEn), s(f.bioMi), s(f.image)
            )
        );
    }
    await db.batch(stmts);
    return items.length;
}


export async function putTeam(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of team members');
    const stmts = [db.prepare('DELETE FROM team')];
    items.forEach((t, i) => {
        stmts.push(
            db.prepare(
                `INSERT INTO team (id, name_en, name_mi, role_en, role_mi,
                 bio_en, bio_mi, avatar, sort_order) VALUES (?,?,?,?,?,?,?,?,?)`
            ).bind(
                n(t.id), s(t.nameEn), s(t.nameMi), s(t.roleEn), s(t.roleMi),
                s(t.bioEn), s(t.bioMi), s(t.avatar), i
            )
        );
    });
    await db.batch(stmts);
    return items.length;
}


export async function putSocial(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of social posts');
    const stmts = [
        db.prepare('DELETE FROM social_tags'),
        db.prepare('DELETE FROM social_posts'),
    ];
    for (const p of items) {
        stmts.push(
            db.prepare(
                `INSERT INTO social_posts (id, platform, title, date, url, thumbnail, description)
                 VALUES (?,?,?,?,?,?,?)`
            ).bind(
                n(p.id), s(p.platform), s(p.title), s(p.date),
                s(p.url), s(p.thumbnail), s(p.description)
            )
        );
        (p.tags || []).forEach((tag, i) => {
            stmts.push(
                db.prepare('INSERT INTO social_tags (post_id, tag_name, position) VALUES (?,?,?)')
                  .bind(n(p.id), s(tag), i)
            );
        });
    }
    await db.batch(stmts);
    return items.length;
}


export async function putTags(db, items) {
    if (!Array.isArray(items)) throw new Error('Expected an array of tags');
    const stmts = [db.prepare('DELETE FROM tags')];
    for (const t of items) {
        stmts.push(
            db.prepare('INSERT INTO tags (id, name, color, category, kind) VALUES (?,?,?,?,?)')
              .bind(n(t.id), s(t.name), s(t.color) || '#5DCCCA',
                    s(t.category) || 'general', s(t.kind) || 'secondary')
        );
    }
    await db.batch(stmts);
    return items.length;
}


export async function putSetting(db, key, value) {
    if (value === null || typeof value !== 'object') {
        throw new Error(`Expected an object for ${key}`);
    }
    await db
        .prepare(`INSERT INTO settings (key, value, updated_at)
                  VALUES (?, ?, datetime('now'))
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                                 updated_at = excluded.updated_at`)
        .bind(key, JSON.stringify(value))
        .run();
    return 1;
}


export const WRITERS = {
    devlogs:  (db, body) => putDevlogs(db, body),
    foxes:    (db, body) => putFoxes(db, body),
    team:     (db, body) => putTeam(db, body),
    social:   (db, body) => putSocial(db, body),
    tags:     (db, body) => putTags(db, body),
    homepage: (db, body) => putSetting(db, 'homepage', body),
    game:     (db, body) => putSetting(db, 'game', body),
};
