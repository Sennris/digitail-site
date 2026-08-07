/* game.html - page script */
/* Shared behaviour is being consolidated into site.js one page at a
   time - see README. The language toggle below is still per-page. */

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


/* ---------- rendering a game ---------- */

// Everything on this page used to be typed into game.html, including three
// sections describing a game the studio is not making. It is all editable
// from the Games tab in the admin panel now.
//
// Nothing here writes over the page unless real content came back. A failed
// fetch, or a field left blank in the admin, leaves whatever is already in
// the HTML - so a blank field can never wipe the page.

function setPair(enId, miId, en, mi) {
    const enEl = document.getElementById(enId);
    const miEl = document.getElementById(miId);
    if (enEl && en) enEl.textContent = en;
    if (miEl && (mi || en)) miEl.textContent = mi || en;
    return Boolean(en);
}

function renderTrailer(url) {
    if (!url) return;
    const container = document.getElementById('trailer-container');
    if (!container) return;

    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);
    if (yt) {
        const frame = document.createElement('iframe');
        frame.width = '100%';
        frame.height = '100%';
        frame.src = 'https://www.youtube.com/embed/' + yt[1];
        frame.title = 'Game trailer';
        frame.allowFullscreen = true;
        frame.style.border = '0';
        frame.style.borderRadius = '2px';
        container.replaceChildren(frame);
        return;
    }

    const video = document.createElement('video');
    video.controls = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:2px;';
    const source = document.createElement('source');
    source.src = url;
    video.appendChild(source);
    container.replaceChildren(video);
}

// Built as real elements rather than an HTML string. Every value here is
// typed by hand in the admin panel, and pasting hand-typed text into
// markup is how a stray quote breaks a page.
function featureSection(feature, index) {
    const section = document.createElement('section');
    section.className = 'alternating-row';

    const textSide = document.createElement('div');
    textSide.className = 'text-side fade-in-section';

    if (feature.taglineEn || feature.taglineMi) {
        const tagline = document.createElement('div');
        tagline.className = 'tagline';
        const en = document.createElement('span');
        en.className = 'en';
        en.textContent = feature.taglineEn || feature.taglineMi;
        const mi = document.createElement('span');
        mi.className = 'mi';
        mi.textContent = feature.taglineMi || feature.taglineEn;
        tagline.append(en, mi);
        textSide.appendChild(tagline);
    }

    if (feature.textEn || feature.textMi) {
        const para = document.createElement('p');
        const en = document.createElement('span');
        en.className = 'en';
        en.textContent = feature.textEn || feature.textMi;
        const mi = document.createElement('span');
        mi.className = 'mi';
        mi.textContent = feature.textMi || feature.textEn;
        para.append(en, mi);
        textSide.appendChild(para);
    }

    const cardSide = document.createElement('div');
    cardSide.className = 'card-side fade-in-section';
    const card = document.createElement('div');
    card.className = 'screenshot-card';

    if (feature.image) {
        const img = document.createElement('img');
        img.src = feature.image;
        img.loading = 'lazy';
        img.alt = feature.taglineEn || '';
        img.className = 'screenshot-image';
        card.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'screenshot-placeholder';
        const en = document.createElement('span');
        en.className = 'en';
        en.textContent = '[ Screenshot ' + (index + 1) + ' ]';
        const mi = document.createElement('span');
        mi.className = 'mi';
        mi.textContent = '[ Pikitia ' + (index + 1) + ' ]';
        placeholder.append(en, mi);
        card.appendChild(placeholder);
    }

    cardSide.appendChild(card);
    section.append(textSide, cardSide);
    return section;
}

function render(game) {
    if (!game) return;

    const titleEl = document.getElementById('game-title');
    if (titleEl && game.titleEn) {
        titleEl.querySelector('.en').textContent = game.titleEn;
        titleEl.querySelector('.mi').textContent = game.titleMi || game.titleEn;
        document.title = game.titleEn + ' | Digi Tail Studios';
    }

    setPair('game-tagline-en', 'game-tagline-mi', game.taglineEn, game.taglineMi);

    const statusEl = document.getElementById('game-status');
    if (statusEl && game.statusEn) {
        setPair('game-status-en', 'game-status-mi', game.statusEn, game.statusMi);
        statusEl.hidden = false;
    }

    renderTrailer(game.trailerUrl);

    const mount = document.getElementById('game-features');
    const features = Array.isArray(game.features) ? game.features : [];
    if (mount && features.length) {
        mount.replaceChildren(...features.map(featureSection));
    }

    // The holding message stands in for the sections while there are none,
    // so a game that has just been added does not leave a bare page.
    const noteEl = document.getElementById('game-note');
    if (noteEl && !features.length && (game.noteEn || game.noteMi)) {
        setPair('game-note-en', 'game-note-mi', game.noteEn, game.noteMi);
        noteEl.hidden = false;
    }

    setPair('game-cta-heading-en', 'game-cta-heading-mi',
        game.ctaHeadingEn, game.ctaHeadingMi);
    setPair('game-cta-body-en', 'game-cta-body-mi',
        game.ctaBodyEn, game.ctaBodyMi);

    const ctaSection = document.getElementById('game-cta-section');
    const cta = document.getElementById('game-cta');
    if (cta && ctaSection) {
        if (game.ctaUrl) {
            cta.href = game.ctaUrl;
            if (game.ctaLabelEn) {
                setPair('game-cta-en', 'game-cta-mi', game.ctaLabelEn, game.ctaLabelMi);
            }
        } else {
            // No link means no button. A dead "#" link on a wishlist button
            // reads as broken rather than as "not yet". The heading and text
            // stay if she has written her own; otherwise the whole block goes,
            // rather than leaving the placeholder wishlist copy stranded with
            // nothing to click.
            cta.hidden = true;
            if (!game.ctaHeadingEn && !game.ctaBodyEn) ctaSection.hidden = true;
        }
    }
}

function watchForReveals() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.1 });

    const hero = document.querySelector('.game-hero');
    if (hero) hero.classList.add('is-visible');

    document.querySelectorAll('.fade-in-section:not(.is-visible)')
        .forEach((el) => observer.observe(el));
}

// /game.html?g=paper-crown opens a specific game. No parameter shows the
// featured one. Unpublished games never come back from this endpoint.
fetch('/api/content/games', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((games) => {
        if (!Array.isArray(games) || !games.length) return null;
        const wanted = new URLSearchParams(location.search).get('g');
        return (wanted && games.find((g) => g.slug === wanted || String(g.id) === wanted))
            || games.find((g) => g.featured)
            || games[0];
    })
    .catch(() => null)
    .then((game) => {
        render(game);
        watchForReveals();
    });
