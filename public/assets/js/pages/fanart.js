/* fanart.html - page script */
/*
 * ⚠️ EVERY VALUE ON THIS PAGE CAME FROM A STRANGER.
 *
 * Artist names, titles and links here were typed into a public form by
 * somebody nobody at the studio has met. This is the only page on the
 * site where that is true, which is why nothing below builds markup by
 * interpolating into a template string the way foxes.js and devlogs.js
 * do. Elements are created and filled with textContent. A name
 * containing a script tag renders as a name containing a script tag.
 *
 * The server already refuses any link that is not http or https, so a
 * `javascript:` credit link never reaches the database. Setting href
 * from a parsed value here is the second half of that, not the first.
 */

(function () {
    'use strict';

    /* ---------- language toggle, same as every other page ---------- */
    var langToggleBtn = document.getElementById('lang-toggle-btn');
    var body = document.body;
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', function () {
            if (body.classList.contains('lang-en')) {
                body.classList.remove('lang-en');
                body.classList.add('lang-mi');
            } else {
                body.classList.remove('lang-mi');
                body.classList.add('lang-en');
            }
        });
    }

    function el(tag, text, className) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null && text !== '') node.textContent = text;
        return node;
    }

    /* ---------- reveal on scroll ---------- */

    /*
     * ⚠️ THIS RUNS UNCONDITIONALLY, AND IT MUST.
     *
     * core.css sets .fade-in-section to `opacity: 0; visibility: hidden`
     * and only .is-visible brings it back. So anything carrying that
     * class is INVISIBLE AND UNCLICKABLE until this observer reaches it.
     *
     * It used to live at the bottom of the gallery fetch's success path,
     * which meant an empty gallery - the state this page is in until the
     * first piece is published - returned early, never created the
     * observer, and left the submission form completely gone from the
     * page. Nothing in the test suite could see it: the form was in the
     * markup, the script had every string it was supposed to have, and
     * the page was still broken.
     *
     * The reveal has nothing to do with the gallery data. Keep it out
     * here where no fetch result can skip it.
     */
    var revealer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.1 });

    function reveal(root) {
        (root || document).querySelectorAll('.fade-in-section').forEach(function (node) {
            revealer.observe(node);
        });
    }

    reveal();

    /* ---------- the gallery ---------- */

    var grid = document.getElementById('fanart-grid');

    function buildPiece(item, index) {
        var card = el('figure', null, 'fanart-card fade-in-section');
        // The drift stack: every third card sits a little lower. Same
        // trick games.html uses - it keeps an odd number of pieces from
        // leaving an obvious hole in the last row.
        if (index % 3 === 1) card.classList.add('fanart-card--drift');

        var frame = el('div', null, 'fanart-frame');
        if (item.image) {
            var img = document.createElement('img');
            img.src = item.image;
            // Written by the team when publishing, never by the artist,
            // and never empty - handleFanArtPublish falls back to
            // "Fan art by <name>" rather than shipping a blank alt.
            img.alt = item.altText || '';
            img.loading = 'lazy';
            img.decoding = 'async';
            frame.appendChild(img);
        } else {
            frame.appendChild(el('span', '[ Artwork ]', 'image-placeholder'));
        }
        card.appendChild(frame);

        var caption = el('figcaption', null, 'fanart-credit');
        if (item.title) caption.appendChild(el('span', item.title, 'fanart-title'));

        var by = el('span', null, 'fanart-by');
        by.appendChild(el('span', 'by ', 'en'));
        by.appendChild(el('span', 'nā ', 'mi'));

        if (item.creditLink) {
            var link = document.createElement('a');
            link.href = item.creditLink;
            link.target = '_blank';
            // noopener because this is an outbound link to somewhere
            // nobody vetted; noreferrer keeps the visitor's path private.
            link.rel = 'noopener noreferrer nofollow';
            link.textContent = item.artistName;
            by.appendChild(link);
        } else {
            by.appendChild(el('span', item.artistName));
        }
        caption.appendChild(by);
        card.appendChild(caption);
        return card;
    }

    fetch('/api/content/fanArt')
        .then(function (response) {
            if (!response.ok) throw new Error('Could not load the gallery');
            return response.json();
        })
        .then(function (items) {
            if (!grid) return;
            grid.textContent = '';
            // null means migration 0014 has not run. An empty array means
            // there is genuinely nothing up yet. Different situations,
            // and the second one is not an error.
            if (!Array.isArray(items) || !items.length) {
                grid.appendChild(el('p',
                    'No fan art up yet. Yours could be the first.', 'empty-note'));
                return;
            }
            items.forEach(function (item, index) {
                grid.appendChild(buildPiece(item, index));
            });
            // The cards did not exist when reveal() first ran, so they
            // get picked up here. Observing a node twice is harmless.
            reveal(grid);
        })
        .catch(function () {
            if (grid) {
                grid.textContent = '';
                grid.appendChild(el('p',
                    'The gallery could not be loaded just now.', 'empty-note'));
            }
        });

    /* ---------- the submission form ---------- */

    var form = document.getElementById('fanart-form');
    var status = document.getElementById('fanart-status');
    if (!form) return;

    function say(message, isError) {
        status.textContent = message;
        status.classList.toggle('is-error', !!isError);
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();

        var consent = document.getElementById('fa-consent');
        if (!consent.checked) {
            say('Please tick the permission box so we know it is alright to show your art.', true);
            return;
        }

        var button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        say('Sending…');

        var token = form.querySelector('[name="cf-turnstile-response"]');

        fetch('/api/fanart/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                artistName: document.getElementById('fa-name').value,
                creditLink: document.getElementById('fa-link').value,
                artUrl: document.getElementById('fa-art').value,
                title: document.getElementById('fa-title').value,
                note: document.getElementById('fa-note').value,
                contactEmail: document.getElementById('fa-email').value,
                consent: true,
                'cf-turnstile-response': token ? token.value : '',
            }),
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function (result) {
                if (!result.ok) {
                    say(result.data.error || 'Something went wrong. Please try again.', true);
                    button.disabled = false;
                    // The widget is single-use: without a reset, a second
                    // attempt after any error fails the check every time
                    // and looks like the form is broken.
                    if (window.turnstile) window.turnstile.reset();
                    return;
                }
                form.reset();
                say('Thank you. We have got it, and someone will take a look soon.');
                button.disabled = false;
                if (window.turnstile) window.turnstile.reset();
            })
            .catch(function () {
                say('We could not reach the studio just now. Please try again shortly.', true);
                button.disabled = false;
                if (window.turnstile) window.turnstile.reset();
            });
    });
}());
