/* games.html - page script */

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


/* ---------- the list ---------- */

// Every value rendered here is typed by hand in the admin panel, so it is
// built as real elements and set with textContent. Pasting hand-typed text
// into an HTML string is how one stray quote takes a page down.

function bilingual(tag, className, en, mi) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    const enSpan = document.createElement('span');
    enSpan.className = 'en';
    enSpan.textContent = en || mi || '';
    const miSpan = document.createElement('span');
    miSpan.className = 'mi';
    miSpan.textContent = mi || en || '';
    el.append(enSpan, miSpan);
    return el;
}

function plank(game) {
    const article = document.createElement('article');
    article.className = 'game-plank';

    // A game only links through once there is something on the other side.
    // hasPage comes from the API and is derived from the game's own content,
    // so it can never disagree with what is actually there.
    const inner = document.createElement(game.hasPage ? 'a' : 'div');
    inner.className = 'game-plank__inner';
    if (game.hasPage) {
        inner.href = 'game.html?g=' + encodeURIComponent(game.slug);
    }

    const art = document.createElement('div');
    art.className = 'game-plank__art';
    if (game.keyArt) {
        const img = document.createElement('img');
        img.src = game.keyArt;
        img.alt = '';
        img.loading = 'lazy';
        art.appendChild(img);
    } else {
        art.classList.add('is-empty');
        art.appendChild(bilingual('span', null, '[ Key art ]', '[ Toi matua ]'));
    }

    const bodyEl = document.createElement('div');
    bodyEl.className = 'game-plank__body';

    if (game.statusEn || game.statusMi) {
        bodyEl.appendChild(
            bilingual('p', 'game-plank__status', game.statusEn, game.statusMi));
    }

    bodyEl.appendChild(
        bilingual('h2', 'game-plank__title', game.titleEn, game.titleMi));

    if (game.taglineEn || game.taglineMi) {
        bodyEl.appendChild(
            bilingual('p', 'game-plank__tagline', game.taglineEn, game.taglineMi));
    } else if (game.blurbEn || game.blurbMi) {
        bodyEl.appendChild(
            bilingual('p', 'game-plank__tagline', game.blurbEn, game.blurbMi));
    }

    if (game.hasPage) {
        bodyEl.appendChild(
            bilingual('span', 'game-plank__more', 'View project →', 'Tirohia te kaupapa →'));
    } else {
        // Announced, but there is nothing to click through to yet. Saying so
        // is kinder than a link that lands on an empty page.
        bodyEl.appendChild(
            bilingual('span', 'game-plank__soon', 'More soon', 'Ā tōna wā'));
    }

    inner.append(art, bodyEl);
    article.appendChild(inner);
    return article;
}

function renderStack(games) {
    const mount = document.getElementById('games-stack');
    if (!mount) return;

    if (!Array.isArray(games) || !games.length) {
        mount.replaceChildren(
            bilingual('p', 'games-empty',
                'Nothing to show just yet. Check back soon.',
                'Kāore he mea hei whakaatu ināianei. Hoki mai ā tōna wā.'));
        return;
    }

    mount.replaceChildren(...games.map(plank));

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.1 });
    mount.querySelectorAll('.game-plank').forEach((el) => observer.observe(el));
}

// Both headings used to be written only if the ENGLISH one was filled in,
// so a te reo heading saved on its own was thrown away and the page kept
// the wording baked into games.html. That is exactly what happened: she
// filled in the te reo box, left English empty, and the page did not
// change. Each language now stands on its own, and either one fills in
// for a blank other - the same fallback bilingual() and pair() already
// use everywhere else on the site.
function renderHeader(page) {
    if (!page) return;
    const title = document.getElementById('games-title');
    if (title && (page.titleEn || page.titleMi)) {
        title.querySelector('.en').textContent = page.titleEn || page.titleMi;
        title.querySelector('.mi').textContent = page.titleMi || page.titleEn;
        document.title = (page.titleEn || page.titleMi) + ' | Digi Tail Studios';
    }
    const introEn = document.getElementById('games-intro-en');
    const introMi = document.getElementById('games-intro-mi');
    if (introEn && (page.introEn || page.introMi)) {
        introEn.textContent = page.introEn || page.introMi;
    }
    if (introMi && (page.introMi || page.introEn)) {
        introMi.textContent = page.introMi || page.introEn;
    }
}

Promise.all([
    fetch('/api/content/games', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    // 404s until the heading has been saved once. That is fine - the wording
    // already in games.html stands in until then.
    fetch('/api/content/gamesPage', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
]).then(([games, page]) => {
    renderHeader(page);
    renderStack(games);
});
