/* press.html - page script */

const langToggleBtn = document.getElementById('lang-toggle-btn');
const body = document.body;

langToggleBtn.addEventListener('click', () => {
    if (body.classList.contains('lang-en')) {
        body.classList.remove('lang-en');
        body.classList.add('lang-mi');
    } else {
        body.classList.remove('lang-mi');
        body.classList.add('lang-en');
    }
});


/* ---------- building blocks ---------- */

// Every value on this page is typed by hand in the admin panel, so it is all
// built as real elements and set with textContent. Nothing is interpolated
// into an HTML string.

function pair(tag, className, en, mi) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    const e = document.createElement('span');
    e.className = 'en';
    e.textContent = en || mi || '';
    const m = document.createElement('span');
    m.className = 'mi';
    m.textContent = mi || en || '';
    el.append(e, m);
    return el;
}

function section(titleEn, titleMi) {
    const sec = document.createElement('section');
    sec.className = 'press-section';
    sec.appendChild(pair('h2', 'press-section__title', titleEn, titleMi));
    return sec;
}

// A copy button beside anything a journalist will want to paste. Saves them
// selecting a paragraph by hand, which is the single most common thing a
// press kit gets used for.
function copyable(text) {
    const wrap = document.createElement('div');
    wrap.className = 'press-copy';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'press-copy__btn';
    const label = document.createElement('span');
    label.className = 'en';
    label.textContent = 'Copy';
    const labelMi = document.createElement('span');
    labelMi.className = 'mi';
    labelMi.textContent = 'Tāruatia';
    btn.append(label, labelMi);

    btn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(text);
            label.textContent = 'Copied';
            labelMi.textContent = 'Kua tāruatia';
        } catch {
            // Clipboard access can be refused. Say so rather than looking
            // like nothing happened.
            label.textContent = 'Select it manually';
            labelMi.textContent = 'Tīpakohia ā-ringa';
        }
        setTimeout(() => {
            label.textContent = 'Copy';
            labelMi.textContent = 'Tāruatia';
        }, 2500);
    });

    wrap.appendChild(btn);
    return wrap;
}

// Only http and https survive, and it is the URL parser that decides, not
// a regular expression - the same shape src/fanart.js uses for links a
// stranger sends us. A value that is not a web address comes back empty
// and stays plain text.
function safeUrl(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return '';
    let parsed;
    try { parsed = new URL(text); } catch { return ''; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
}

function looksLikeEmail(value) {
    const text = String(value == null ? '' : value).trim();
    return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(text) ? text : '';
}

// A journalist reading the factsheet should be able to click the website
// rather than select and copy it. The row used to be plain text whatever
// was in it, which is what the team reported. The label still comes from
// us; only the value is ever hand-typed, and it is set with textContent.
function linkedValue(value) {
    const href = safeUrl(value);
    const email = href ? '' : looksLikeEmail(value);
    if (!href && !email) return document.createTextNode(value);
    const a = document.createElement('a');
    a.href = href || ('mailto:' + email);
    if (href) a.rel = 'noopener';
    a.textContent = value;
    return a;
}

function factRow(labelEn, labelMi, value) {
    if (!value) return null;
    const row = document.createElement('div');
    row.className = 'press-fact';
    row.appendChild(pair('dt', 'press-fact__label', labelEn, labelMi));
    const dd = document.createElement('dd');
    dd.className = 'press-fact__value';
    dd.appendChild(linkedValue(value));
    row.appendChild(dd);
    return row;
}

function factsheet(rows) {
    const real = rows.filter(Boolean);
    if (!real.length) return null;
    const dl = document.createElement('dl');
    dl.className = 'press-factsheet';
    real.forEach((r) => dl.append(...r.childNodes.length ? [r] : []));
    return dl;
}

// One Enter is a line break, two is a new paragraph. The credits are a
// list of names typed one per line and every line ran together, because
// only a BLANK line counted for anything. Built as text nodes and <br>
// elements - nothing is interpolated into an HTML string.
function linesInto(el, text) {
    String(text).split('\n').forEach((line, i) => {
        if (i) el.appendChild(document.createElement('br'));
        el.appendChild(document.createTextNode(line));
    });
}

function paraPair(en, mi) {
    const p = document.createElement('p');
    const e = document.createElement('span');
    e.className = 'en';
    linesInto(e, en || mi || '');
    const m = document.createElement('span');
    m.className = 'mi';
    linesInto(m, mi || en || '');
    p.append(e, m);
    return p;
}

function prose(en, mi, withCopy) {
    if (!en && !mi) return null;
    const wrap = document.createElement('div');
    wrap.className = 'press-prose';
    // Blank lines become paragraphs. She writes in a plain textarea, so this
    // is the only formatting available until rich text lands.
    (en || mi).split(/\n\s*\n/).forEach((para, i) => {
        const enPara = (en || '').split(/\n\s*\n/)[i] || '';
        const miPara = (mi || '').split(/\n\s*\n/)[i] || '';
        if (!enPara && !miPara) return;
        wrap.appendChild(paraPair(enPara, miPara));
    });
    if (withCopy && en) wrap.appendChild(copyable(en));
    return wrap;
}

// A row added in the admin and then left blank would otherwise render as a
// bare bordered strip with no text in it - a ghost bar down the page. Empty
// entries are dropped rather than shown.
function hasContent(item) {
    return Boolean(item.titleEn || item.titleMi || item.bodyEn ||
                   item.bodyMi || item.source || item.url);
}

function itemList(allRows) {
    const rows = allRows.filter(hasContent);
    if (!rows.length) return null;
    const ul = document.createElement('ul');
    ul.className = 'press-list';
    rows.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'press-list__item';

        const head = document.createElement('div');
        head.className = 'press-list__head';
        if (item.url) {
            const a = document.createElement('a');
            a.href = item.url;
            a.rel = 'noopener';
            a.append(...pair('span', null, item.titleEn, item.titleMi).childNodes);
            head.appendChild(a);
        } else {
            head.appendChild(pair('span', null, item.titleEn, item.titleMi));
        }
        li.appendChild(head);

        if (item.bodyEn || item.bodyMi) {
            li.appendChild(pair('p', 'press-list__body', item.bodyEn, item.bodyMi));
        }

        // The award she added put its link in the Source box, which printed
        // it as plain text. Each part is checked on its own so a web address
        // anywhere in the line becomes clickable and everything else stays
        // exactly as typed.
        const metaBits = [item.source, item.dateLabel].filter(Boolean);
        if (metaBits.length) {
            const m = document.createElement('p');
            m.className = 'press-list__meta';
            metaBits.forEach((bit, i) => {
                if (i) m.appendChild(document.createTextNode(' · '));
                m.appendChild(linkedValue(bit));
            });
            li.appendChild(m);
        }
        ul.appendChild(li);
    });
    return ul;
}

function assetList(allRows) {
    // A file with no URL behind it is a download that goes nowhere.
    const rows = allRows.filter((a) => a.url && (a.labelEn || a.labelMi));
    if (!rows.length) return null;
    const ul = document.createElement('ul');
    ul.className = 'press-assets';
    rows.forEach((asset) => {
        const li = document.createElement('li');
        li.className = 'press-assets__item';

        const a = document.createElement('a');
        a.className = 'press-assets__link';
        a.href = asset.url || '#';
        // Same origin, so this makes the browser save the file instead of
        // trying to display it.
        a.setAttribute('download', '');

        if (asset.kind !== 'pack' && asset.url) {
            const img = document.createElement('img');
            img.src = asset.url;
            img.alt = '';
            img.loading = 'lazy';
            a.appendChild(img);
        }

        a.appendChild(pair('span', 'press-assets__label', asset.labelEn, asset.labelMi));
        if (asset.noteEn || asset.noteMi) {
            a.appendChild(pair('span', 'press-assets__note', asset.noteEn, asset.noteMi));
        }
        li.appendChild(a);
        ul.appendChild(li);
    });
    return ul;
}

function appendAll(parent, nodes) {
    nodes.filter(Boolean).forEach((n) => parent.appendChild(n));
}


/* ---------- the two kinds of press kit ---------- */

function studioKit(kit, items, assets, games) {
    const frag = document.createDocumentFragment();
    const of = (kind) => items.filter((i) => !i.gameId && i.kind === kind);
    const assetsOf = (kind) => assets.filter((a) => !a.gameId && a.kind === kind);

    const facts = document.createElement('section');
    facts.className = 'press-section';
    facts.appendChild(pair('h2', 'press-section__title', 'Factsheet', 'Pepa meka'));
    const dl = document.createElement('dl');
    dl.className = 'press-factsheet';
    appendAll(dl, [
        factRow('Founded', 'I whakatūria', kit.foundedEn),
        factRow('Based in', 'Kei', kit.basedInEn),
        factRow('Team size', 'Rahi o te tira', kit.teamSizeEn),
        factRow('Website', 'Paetukutuku', kit.websiteUrl),
        factRow('Press contact', 'Whakapā pāpāho', kit.contactEmail),
    ]);
    if (dl.children.length) { facts.appendChild(dl); frag.appendChild(facts); }

    const about = prose(kit.descriptionEn, kit.descriptionMi, true);
    if (about) {
        const s = section('About Digi Tail Studios', 'Mō Digi Tail Studios');
        s.appendChild(about);
        frag.appendChild(s);
    }

    const history = prose(kit.historyEn, kit.historyMi, true);
    if (history) {
        const s = section('History', 'Hītori');
        s.appendChild(history);
        frag.appendChild(s);
    }

    if (games.length) {
        const s = section('Our games', 'Ā mātou kēmu');
        const ul = document.createElement('ul');
        ul.className = 'press-list';
        games.forEach((g) => {
            const li = document.createElement('li');
            li.className = 'press-list__item';
            const a = document.createElement('a');
            a.href = 'press.html?g=' + encodeURIComponent(g.slug);
            a.append(...pair('span', null, g.titleEn, g.titleMi).childNodes);
            li.appendChild(a);
            if (g.taglineEn || g.taglineMi) {
                li.appendChild(pair('p', 'press-list__body', g.taglineEn, g.taglineMi));
            }
            ul.appendChild(li);
        });
        s.appendChild(ul);
        frag.appendChild(s);
    }

    [['award', 'Awards and recognition', 'Ngā tohu'],
     ['quote', 'Quotes', 'Ngā kōrero'],
     ['article', 'Selected articles', 'Ngā tuhinga'],
     ['link', 'Additional links', 'Ētahi atu hono']].forEach(([kind, en, mi]) => {
        const list = itemList(of(kind));
        if (!list) return;
        const s = section(en, mi);
        s.appendChild(list);
        frag.appendChild(s);
    });

    [['pack', 'Press packs', 'Ngā pouaka pāpāho'],
     ['logo', 'Logos and icons', 'Ngā tohu'],
     ['image', 'Images', 'Ngā whakaahua']].forEach(([kind, en, mi]) => {
        const list = assetList(assetsOf(kind));
        if (!list) return;
        const s = section(en, mi);
        s.appendChild(list);
        frag.appendChild(s);
    });

    const permission = prose(kit.permissionEn, kit.permissionMi, true);
    if (permission) {
        const s = section('Video and streaming permission', 'Whakaaetanga ataata');
        s.classList.add('press-section--highlight');
        s.appendChild(permission);
        frag.appendChild(s);
    }

    const credits = prose(kit.creditsEn, kit.creditsMi, false);
    if (credits) {
        const s = section('Credits', 'Ngā mihi');
        s.appendChild(credits);
        frag.appendChild(s);
    }

    if (kit.contactEmail) {
        const s = section('Get in touch', 'Whakapā mai');
        const a = document.createElement('a');
        a.className = 'press-contact';
        a.href = 'mailto:' + kit.contactEmail;
        a.textContent = kit.contactEmail;
        s.appendChild(a);
        const note = prose(kit.contactNoteEn, kit.contactNoteMi, false);
        if (note) s.appendChild(note);
        frag.appendChild(s);
    }

    return frag;
}

function gameKit(game, kit, items, assets) {
    const frag = document.createDocumentFragment();
    const p = (game.press && typeof game.press === 'object') ? game.press : {};
    const of = (kind) => items.filter((i) => i.gameId === game.id && i.kind === kind);
    const assetsOf = (kind) => assets.filter((a) => a.gameId === game.id && a.kind === kind);

    const facts = document.createElement('section');
    facts.className = 'press-section';
    facts.appendChild(pair('h2', 'press-section__title', 'Factsheet', 'Pepa meka'));
    const dl = document.createElement('dl');
    dl.className = 'press-factsheet';
    appendAll(dl, [
        factRow('Developer', 'Kaihanga', kit.studioNameEn || 'Digi Tail Studios'),
        factRow('Based in', 'Kei', kit.basedInEn),
        factRow('Release date', 'Rā tuku', p.releaseDateEn),
        factRow('Platforms', 'Ngā pūnaha', p.platformsEn),
        factRow('Price', 'Utu', p.priceEn),
        factRow('Website', 'Paetukutuku', kit.websiteUrl),
        factRow('Press contact', 'Whakapā pāpāho', kit.contactEmail),
    ]);
    if (dl.children.length) { facts.appendChild(dl); frag.appendChild(facts); }

    const about = prose(p.descriptionEn || game.blurbEn, p.descriptionMi || game.blurbMi, true);
    if (about) {
        const s = section('Description', 'Whakaahuatanga');
        s.appendChild(about);
        frag.appendChild(s);
    }

    if (Array.isArray(game.features) && game.features.length) {
        const s = section('Features', 'Ngā āhuatanga');
        const ul = document.createElement('ul');
        ul.className = 'press-list';
        game.features.forEach((f) => {
            const li = document.createElement('li');
            li.className = 'press-list__item';
            li.appendChild(pair('span', null, f.taglineEn, f.taglineMi));
            if (f.textEn || f.textMi) {
                li.appendChild(pair('p', 'press-list__body', f.textEn, f.textMi));
            }
            ul.appendChild(li);
        });
        s.appendChild(ul);
        frag.appendChild(s);
    }

    if (game.trailerUrl) {
        const s = section('Trailer', 'Ataata whakatairanga');
        const a = document.createElement('a');
        a.className = 'press-contact';
        a.href = game.trailerUrl;
        a.rel = 'noopener';
        a.textContent = game.trailerUrl;
        s.appendChild(a);
        frag.appendChild(s);
    }

    [['pack', 'Press packs', 'Ngā pouaka pāpāho'],
     ['logo', 'Logos and icons', 'Ngā tohu'],
     ['image', 'Images', 'Ngā whakaahua']].forEach(([kind, en, mi]) => {
        const list = assetList(assetsOf(kind));
        if (!list) return;
        const s = section(en, mi);
        s.appendChild(list);
        frag.appendChild(s);
    });

    [['award', 'Awards and recognition', 'Ngā tohu'],
     ['quote', 'Quotes', 'Ngā kōrero'],
     ['article', 'Selected articles', 'Ngā tuhinga'],
     ['link', 'Additional links', 'Ētahi atu hono']].forEach(([kind, en, mi]) => {
        const list = itemList(of(kind));
        if (!list) return;
        const s = section(en, mi);
        s.appendChild(list);
        frag.appendChild(s);
    });

    // Content considerations sit deliberately close to the video permission,
    // because both are things a streamer needs before they hit record.
    const notes = prose(p.contentNotesEn, p.contentNotesMi, false);
    if (notes) {
        const s = section('Content considerations', 'Ngā whakaaro rauemi');
        s.classList.add('press-section--note');
        s.appendChild(notes);
        frag.appendChild(s);
    }

    const permission = prose(kit.permissionEn, kit.permissionMi, true);
    if (permission) {
        const s = section('Video and streaming permission', 'Whakaaetanga ataata');
        s.classList.add('press-section--highlight');
        s.appendChild(permission);
        frag.appendChild(s);
    }

    if (kit.contactEmail) {
        const s = section('Get in touch', 'Whakapā mai');
        const a = document.createElement('a');
        a.className = 'press-contact';
        a.href = 'mailto:' + kit.contactEmail;
        a.textContent = kit.contactEmail;
        s.appendChild(a);
        frag.appendChild(s);
    }

    return frag;
}


/* ---------- assembling the page ---------- */

function renderSwitcher(games, currentSlug) {
    const nav = document.getElementById('press-switcher');
    if (!nav || !games.length) return;

    const make = (label, labelMi, slug) => {
        const a = document.createElement('a');
        a.className = 'press-switcher__link';
        a.href = slug ? 'press.html?g=' + encodeURIComponent(slug) : 'press.html';
        if ((slug || '') === (currentSlug || '')) {
            a.classList.add('is-current');
            a.setAttribute('aria-current', 'page');
        }
        a.append(...pair('span', null, label, labelMi).childNodes);
        return a;
    };

    nav.replaceChildren(make('The studio', 'Te taiwhanga', ''));
    games.forEach((g) => nav.appendChild(make(g.titleEn, g.titleMi, g.slug)));
}

function renderHeader(kit) {
    if (!kit) return;
    const h = document.getElementById('press-heading');
    if (h && (kit.headingEn || kit.headingMi)) {
        h.querySelector('.en').textContent = kit.headingEn || kit.headingMi;
        h.querySelector('.mi').textContent = kit.headingMi || kit.headingEn;
    }
    const introEn = document.getElementById('press-intro-en');
    const introMi = document.getElementById('press-intro-mi');
    if (introEn && (kit.introEn || kit.introMi)) {
        introEn.textContent = kit.introEn || kit.introMi;
    }
    if (introMi && (kit.introMi || kit.introEn)) {
        introMi.textContent = kit.introMi || kit.introEn;
    }
}

Promise.all([
    fetch('/api/content/pressKit', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/content/pressItems', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/content/pressAssets', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/content/games', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
]).then(([kitRaw, itemsRaw, assetsRaw, gamesRaw]) => {
    const kit = kitRaw && typeof kitRaw === 'object' ? kitRaw : {};
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    const assets = Array.isArray(assetsRaw) ? assetsRaw : [];
    const games = Array.isArray(gamesRaw) ? gamesRaw : [];

    renderHeader(kit);

    const wanted = new URLSearchParams(location.search).get('g');
    const game = wanted
        ? games.find((g) => g.slug === wanted || String(g.id) === wanted)
        : null;

    renderSwitcher(games, game ? game.slug : '');

    const mount = document.getElementById('press-body');
    if (!mount) return;

    const frag = game
        ? gameKit(game, kit, items, assets)
        : studioKit(kit, items, assets, games);

    if (!frag.childNodes.length) {
        // Nothing has been filled in yet. Say so plainly rather than showing
        // a page of empty headings.
        mount.replaceChildren(pair('p', 'press-loading',
            'This press kit is still being put together. Email us and we will send you what you need.',
            'Kei te hangaia tonu tēnei pouaka pāpāho.'));
        return;
    }

    if (game) {
        const h = document.getElementById('press-heading');
        if (h && (game.titleEn || game.titleMi)) {
            h.querySelector('.en').textContent = game.titleEn || game.titleMi;
            h.querySelector('.mi').textContent = game.titleMi || game.titleEn;
            document.title = (game.titleEn || game.titleMi) + ' press kit | Digi Tail Studios';
        }
    }

    mount.replaceChildren(frag);
});
