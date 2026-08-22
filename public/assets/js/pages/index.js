/* index.html - page script */

/* Turns a stored value into something safe to put inside an attribute.
   A media URL is a plain string in the database, and a quote in it would
   otherwise close the src early and put the rest inside the tag.
   Declared at the TOP of the file rather than beside its use: this is a
   classic script, and a function nested inside a block only hoists within
   that block. Same helper, same reasoning, as foxes.js. */
function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
/* Extracted verbatim from the old inline <script> block.
   Shared behaviour is being consolidated into site.js one
   page at a time - see README. */

// Language Toggle
        const langToggleBtn = document.getElementById('lang-toggle-btn');
        const body = document.body;

        if (langToggleBtn) {
            langToggleBtn.addEventListener('click', () => {
                if (body.classList.contains('lang-en')) {
                    body.classList.remove('lang-en');
                    body.classList.add('lang-mi');
                } else {
                    body.classList.remove('lang-mi');
                    body.classList.add('lang-en');
                }
            });
        }

        // Scroll Animation
        document.addEventListener("DOMContentLoaded", function() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                    }
                });
            }, { threshold: 0.1 });

            const hero = document.querySelector('.hero-section');
            if(hero) hero.classList.add('is-visible');

            const hiddenElements = document.querySelectorAll('.fade-in-section');
            hiddenElements.forEach((el) => observer.observe(el));
        });

        // Newsletter signup.
        //
        // Posts to this site's own /api/subscribe, which checks the
        // Turnstile token before saving anything. Errors are shown in the
        // form rather than in an alert box, and the page only moves on
        // when the signup actually worked.
        const form = document.getElementById('newsletter-form');
        const emailInput = document.getElementById('email');
        const confirmEmailInput = document.getElementById('confirm-email');
        const statusBox = document.getElementById('newsletter-status');
        const submitBtn = form ? form.querySelector('.submit-btn') : null;

        const say = function (en, mi, isError) {
            if (!statusBox) return;
            statusBox.innerHTML = '';
            const enSpan = document.createElement('span');
            enSpan.className = 'en';
            enSpan.textContent = en;
            const miSpan = document.createElement('span');
            miSpan.className = 'mi';
            miSpan.textContent = mi;
            statusBox.appendChild(enSpan);
            statusBox.appendChild(miSpan);
            statusBox.classList.toggle('is-error', !!isError);
        };

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();

                if (emailInput.value.trim().toLowerCase()
                    !== confirmEmailInput.value.trim().toLowerCase()) {
                    say("Those email addresses don't match. Please check them again.",
                        'Kāore e ōrite ana aua wāhitau īmēra. Tēnā koa tirohia anō.', true);
                    confirmEmailInput.style.borderColor = 'red';
                    confirmEmailInput.style.boxShadow = '4px 4px 0px rgba(255,0,0,0.5)';
                    confirmEmailInput.focus();
                    return;
                }
                confirmEmailInput.style.borderColor = '#1D0D12';
                confirmEmailInput.style.boxShadow = 'none';

                // Turnstile drops its token into a hidden field it adds itself.
                const tokenField = form.querySelector('[name="cf-turnstile-response"]');
                const token = tokenField ? tokenField.value : '';
                if (!token) {
                    say('Please wait a moment for the "not a robot" check to finish, then try again.',
                        'Taria mō te wā poto kia oti te arowhai "ehara i te karetao", kātahi ka ngana anō.', true);
                    return;
                }

                if (submitBtn) submitBtn.disabled = true;
                say('Signing you up...', 'Kei te tuhi i a koe...', false);

                fetch(form.action, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: document.getElementById('name').value,
                        email: emailInput.value,
                        'cf-turnstile-response': token
                    })
                })
                .then(function (response) {
                    return response.json().then(function (data) {
                        return { ok: response.ok, data: data };
                    });
                })
                .then(function (result) {
                    if (result.ok && result.data.ok) {
                        window.location.href = 'thankyou.html';
                        return;
                    }
                    say(result.data.error || 'Something went wrong. Please try again.',
                        result.data.error || 'I raru tētahi mea. Tēnā koa ngana anō.', true);
                    if (submitBtn) submitBtn.disabled = false;
                    // Tokens are single use. Without a reset, a second
                    // attempt reuses a spent token and is always rejected.
                    if (window.turnstile) window.turnstile.reset();
                })
                .catch(function () {
                    say('We could not reach the server. Please check your connection and try again.',
                        'Kāore i taea te toro atu ki te tūmau. Tirohia tō hononga, ka ngana anō.', true);
                    if (submitBtn) submitBtn.disabled = false;
                    if (window.turnstile) window.turnstile.reset();
                });
            });
        }

        // --- HOMEPAGE SECTION COPY -------------------------------------
        //
        // Every heading and paragraph down this page used to be typed into
        // index.html. They are editable from the admin panel now (Homepage
        // tab, Page copy).
        //
        // A blank field means "leave the page alone", NOT "publish nothing".
        // Writing an empty string here would wipe live copy the moment an
        // unfilled field was saved - which is exactly what happened once
        // before on the hero taglines and the announcement.
        function applySectionCopy(sections) {
            if (!sections || typeof sections !== 'object') return;

            // Newlines become real <br> elements and *word* becomes <em>word</em>.
            // Built as nodes, never by assigning innerHTML: this text is typed
            // by hand in a textarea, so one stray angle bracket pasted into
            // markup would take the homepage down.
            function write(el, text) {
                if (!el || !text) return;
                const frag = document.createDocumentFragment();
                text.split(/\r?\n/).forEach((line, lineIndex) => {
                    if (lineIndex > 0) frag.appendChild(document.createElement('br'));
                    line.split(/\*([^*]+)\*/).forEach((piece, i) => {
                        if (!piece) return;
                        if (i % 2 === 1) {
                            const em = document.createElement('em');
                            em.textContent = piece;
                            frag.appendChild(em);
                        } else {
                            frag.appendChild(document.createTextNode(piece));
                        }
                    });
                });
                el.replaceChildren(frag);
            }

            Object.keys(sections).forEach((groupName) => {
                const groupValues = sections[groupName];
                if (!groupValues || typeof groupValues !== 'object') return;
                Object.keys(groupValues).forEach((fieldName) => {
                    // headingEn -> hs-about-heading-en
                    const lang = /Mi$/.test(fieldName) ? 'mi' : 'en';
                    const base = fieldName.replace(/(En|Mi)$/, '');
                    write(
                        document.getElementById(`hs-${groupName}-${base}-${lang}`),
                        groupValues[fieldName]
                    );
                });
            });
        }

        /* ---------- which mascot shows today ----------
           The rule, agreed before this was built: when two scheduled
           mascots both cover today, the one with the SHORTER date range
           wins, and list order breaks a tie. A mascot with no dates at all
           counts as an infinitely long range, so it is the fallback
           without needing to be flagged as one - any dated mascot covering
           today beats it.

           Dates are read in the VISITOR's local time, not New Zealand
           time. That is deliberate, and is what the old four-slot version
           did: someone in London should see the Halloween mascot on their
           31 October, not ours. */

        const MASCOT_SIZES = ['small', 'medium', 'large'];
        const pad2 = (v) => String(v).padStart(2, '0');

        // Returns null for "no dates set", which means always eligible.
        // Tolerates either date format in either field: a repeating mascot
        // cares only about the MM-DD tail, a one-off needs the year, and
        // one date on its own means a single day.
        function mascotDates(m, now) {
            let start = String(m.dateStart || '').trim();
            let end = String(m.dateEnd || '').trim();
            if (!start && !end) return null;
            if (!start) start = end;
            if (!end) end = start;
            if (m.repeatsYearly) {
                return { start: start.slice(-5), end: end.slice(-5) };
            }
            const year = String(now.getFullYear());
            if (start.length === 5) start = year + '-' + start;
            if (end.length === 5) end = year + '-' + end;
            return { start, end };
        }

        function mascotCoversToday(m, now) {
            const d = mascotDates(m, now);
            if (!d) return true;
            const today = m.repeatsYearly
                ? pad2(now.getMonth() + 1) + '-' + pad2(now.getDate())
                : now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
            if (d.start <= d.end) return today >= d.start && today <= d.end;
            // A repeating range is allowed to wrap the year end, e.g. New
            // Year running 12-31 to 01-07. A one-off with its dates the
            // wrong way round is a typo, not a wrap, so it matches nothing
            // rather than quietly covering eleven months.
            return m.repeatsYearly ? (today >= d.start || today <= d.end) : false;
        }

        // Length of the range in days, inclusive of both ends. Infinity for
        // a mascot with no dates - that is what makes it lose to everything.
        function mascotSpan(m, now) {
            const d = mascotDates(m, now);
            if (!d) return Infinity;
            if (m.repeatsYearly) {
                // Counted on a fixed non-leap year so the number does not
                // move about; it is only ever compared with another span.
                const toDay = (mmdd) => {
                    const parts = mmdd.split('-');
                    return Date.UTC(2001, (Number(parts[0]) || 1) - 1, Number(parts[1]) || 1) / 86400000;
                };
                const a = toDay(d.start);
                const b = toDay(d.end);
                return (b >= a ? b - a : b - a + 365) + 1;
            }
            const a = Date.parse(d.start + 'T00:00:00Z');
            const b = Date.parse(d.end + 'T00:00:00Z');
            if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return Infinity;
            return (b - a) / 86400000 + 1;
        }

        function pickMascot(list, now) {
            const live = (Array.isArray(list) ? list : [])
                .filter((m) => m && m.enabled !== false);
            if (!live.length) return null;

            // The manual override wins outright, calendar or not.
            const forced = live.find((m) => m.forced);
            if (forced) return forced;

            const covering = live.filter((m) => mascotCoversToday(m, now));
            if (!covering.length) return null;

            // Shortest span wins. Walking the list in her order and only
            // replacing on a STRICTLY shorter span means an earlier entry
            // keeps a tie, which is the agreed tiebreak - and it does not
            // depend on the engine's sort being stable.
            let best = covering[0];
            let bestSpan = mascotSpan(best, now);
            for (let i = 1; i < covering.length; i++) {
                const span = mascotSpan(covering[i], now);
                if (span < bestSpan) { best = covering[i]; bestSpan = span; }
            }
            return best;
        }

        // The pre-0012 shape, used only until the migration has been run.
        function legacyMascot(blob) {
            if (!blob || !blob.versions) return null;
            const v = blob.versions[blob.current || 'default'] || blob.versions.default;
            return v ? { name: v.name, image: v.image, size: 'medium' } : null;
        }

        function renderMascot(m) {
            const el = document.getElementById('hero-mascot');
            if (!el || !m || !m.image) return;
            // Built as an element rather than concatenated into innerHTML.
            // A single quote in a hand-typed name used to break the markup
            // here, because the name went straight into an alt attribute.
            const img = document.createElement('img');
            img.src = m.image;
            img.alt = m.name || 'Studio mascot';

            // The name, on a little tag. Built as an element with
            // textContent for the same reason the alt attribute is set
            // rather than concatenated: it is hand-typed in the admin.
            const parts = [img];
            if (m.name) {
                const tag = document.createElement('span');
                tag.className = 'hero-mascot__name';
                tag.textContent = m.name;
                parts.push(tag);
            }
            el.replaceChildren(...parts);
            MASCOT_SIZES.forEach((s) => el.classList.remove('mascot-' + s));
            el.classList.add('mascot-' + (MASCOT_SIZES.indexOf(m.size) >= 0 ? m.size : 'medium'));
            el.style.display = 'block';
        }

        // --- FETCH HOMEPAGE CONTENT FROM JSON ---
        fetch('/api/content/homepage')
            .then(response => response.json())
            .then(data => {
                // Hero section
                if (data.hero) {
                    const titleEl = document.getElementById('hero-title');
                    const taglineEn = document.getElementById('hero-tagline-en');
                    const taglineMi = document.getElementById('hero-tagline-mi');
                    if (titleEl && data.hero.titleEn) titleEl.innerText = data.hero.titleEn;
                    if (taglineEn && data.hero.taglineEn) taglineEn.innerText = data.hero.taglineEn;
                    if (taglineMi && data.hero.taglineMi) taglineMi.innerText = data.hero.taglineMi;
                }

                // Mascot. Its own collection since migration 0012 - see the
                // block of functions above. If that endpoint has nothing to
                // say (the Worker deployed before the migration was run) the
                // old four-slot blob on the homepage settings is used, so the
                // hero is never left bare during the gap.
                fetch('/api/content/mascots')
                    .then(r => (r.ok ? r.json() : null))
                    .then(list => {
                        const picked = (Array.isArray(list) && list.length)
                            ? pickMascot(list, new Date())
                            : legacyMascot(data.mascot);
                        renderMascot(picked);
                    })
                    .catch(() => renderMascot(legacyMascot(data.mascot)));

                // Announcement banner
                if (data.announcement && data.announcement.enabled) {
                    const banner = document.getElementById('announcement-banner');
                    if (banner) {
                        const hasImage = data.announcement.image && data.announcement.image.trim();
                        const hasText = data.announcement.text && data.announcement.text.trim();
                        
                        if (hasImage) {
                            let html = '<img src="' + escapeAttr(data.announcement.image) + '" alt="Announcement">';
                            if (hasText) {
                                const textContent = data.announcement.link 
                                    ? '<a href="' + data.announcement.link + '">' + data.announcement.text + '</a>'
                                    : data.announcement.text;
                                html += '<div class="announce-overlay">' + textContent + '</div>';
                            }
                            banner.innerHTML = html;
                        } else if (hasText) {
                            // Text-only fallback
                            const styleMap = { info: '#5DCCCA', warning: '#E5DABF', alert: '#E74C3C' };
                            const bgColor = styleMap[data.announcement.style] || '#5DCCCA';
                            banner.style.backgroundColor = bgColor;
                            banner.style.color = '#1D0D12';
                            banner.classList.add('text-only');
                            banner.innerHTML = data.announcement.link 
                                ? '<a href="' + data.announcement.link + '">' + data.announcement.text + '</a>'
                                : data.announcement.text;
                        }
                        
                        if (hasImage || hasText) banner.classList.add('active');
                    }
                }

                // Ticker strip, edited from the admin panel
                const tickerEl = document.getElementById('site-ticker');
                const trackEl = document.getElementById('ticker-track');
                // Settings saved before the ticker existed have no ticker key,
                // so fall back to the same defaults the admin editor shows.
                const tickerCfg = data.ticker || {
                    enabled: true, speed: 32,
                    items: ['\u{1F98A} DEVLOGS EVERY WEEK', '\u2744\uFE0F MADE IN \u014CTAUTAHI',
                            '\u{1F3AE} WISHLIST SOON', '\u2615 POWERED BY LONG BLACKS',
                            '\u{1F43E} THREE PAWS HIDDEN ON THIS SITE'],
                };
                if (tickerEl && trackEl && tickerCfg.enabled !== false
                    && Array.isArray(tickerCfg.items) && tickerCfg.items.length) {
                    trackEl.textContent = '';

                    // Lay down one copy of the list.
                    function appendCopy(hideFromScreenReaders) {
                        tickerCfg.items.forEach(function (item) {
                            const cell = document.createElement('span');
                            cell.textContent = item;
                            if (hideFromScreenReaders) cell.setAttribute('aria-hidden', 'true');
                            trackEl.appendChild(cell);

                            const dot = document.createElement('span');
                            dot.className = 'ticker__sep';
                            dot.textContent = '\u2022';
                            dot.setAttribute('aria-hidden', 'true');
                            trackEl.appendChild(dot);
                        });
                    }

                    tickerEl.hidden = false;
                    appendCopy(false);

                    // The animation slides the track left by exactly half its
                    // width, so the second half has to be an identical repeat
                    // of the first AND the whole thing has to be at least two
                    // strip-widths long, or the band empties out before it
                    // loops. A short list on a wide monitor did exactly that.
                    const oneCopy = trackEl.scrollWidth || 1;
                    const stripWidth = tickerEl.clientWidth || oneCopy;
                    const copiesPerHalf = Math.max(1, Math.ceil(stripWidth / oneCopy));

                    for (let i = 1; i < copiesPerHalf; i++) appendCopy(true);
                    for (let i = 0; i < copiesPerHalf; i++) appendCopy(true);

                    // Keep the reading speed steady no matter how many
                    // repeats it took to fill the screen.
                    const baseSpeed = tickerCfg.speed || 32;
                    trackEl.style.animationDuration = (baseSpeed * copiesPerHalf) + 's';
                }

                // Community Links (card-grid banners)
                if (data.communityLinks && data.communityLinks.length > 0) {
                    const grid = document.getElementById('community-links-grid');
                    if (grid) {
                        grid.innerHTML = '';
                        data.communityLinks.forEach((link, index) => {
                            const delay = (index * 0.1 + 0.1).toFixed(1);
                            const tag = link.link ? 'a' : 'div';
                            const linkAttr = link.link ? ' href="' + link.link + '"' : '';
                            const linkStyle = link.link ? ' display: block; text-decoration: none;' : '';
                            
                            const el = document.createElement(tag);
                            el.className = 'banner community-link fade-in-section';
                            el.style.cssText = 'transition-delay: ' + delay + 's;' + linkStyle;
                            if (link.link) el.href = link.link;
                            
                            const textEn = (link.textEn || '').replace(/\n/g, '<br>');
                            const textMi = (link.textMi || '').replace(/\n/g, '<br>');
                            
                            el.innerHTML = '<h4><span class="en">' + (link.emoji || '') + ' ' + link.titleEn + '</span>' +
                                '<span class="mi">' + (link.emoji || '') + ' ' + link.titleMi + '</span></h4>' +
                                '<p><span class="en">' + textEn + '</span>' +
                                '<span class="mi">' + textMi + '</span></p>';
                            
                            grid.appendChild(el);
                        });
                        
                        // Re-observe new elements for scroll animation
                        const obs = new IntersectionObserver((entries) => {
                            entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); });
                        }, { threshold: 0.1 });
                        grid.querySelectorAll('.fade-in-section').forEach(el => obs.observe(el));
                    }
                }

                applySectionCopy(data.sections);
            })
            .catch(error => console.error('Error fetching homepage data:', error));

        // --- FETCH THE GAME SETTINGS FOR THE HOMEPAGE SNIPPET ---
        //
        // This card used to be typed into index.html, so editing the game in
        // the admin panel changed game.html and left the homepage showing the
        // old name and blurb. Anything left blank in the admin keeps whatever
        // is already written in the page, so a half-filled form never wipes
        // the homepage.
        fetch('/api/content/game')
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (game) {
                if (!game) return;

                const setText = function (id, value) {
                    const el = document.getElementById(id);
                    if (el && value) el.textContent = value;
                };

                setText('home-game-name', game.titleEn);
                setText('home-game-title', game.titleEn);
                setText('home-game-blurb-en', game.blurbEn);
                setText('home-game-blurb-mi', game.blurbMi || game.blurbEn);

                if (game.keyArt) {
                    const art = document.getElementById('home-game-art');
                    if (art) {
                        art.textContent = '';
                        const img = document.createElement('img');
                        img.src = game.keyArt;
                        img.alt = game.titleEn || 'Key art';
                        art.appendChild(img);
                    }
                }
            })
            .catch(function (error) { console.error('Error fetching game data:', error); });

        // --- FETCH LATEST DEVLOG FOR HOMEPAGE ---
        fetch('/api/content/devlogs')
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    // Sort to make sure we get the absolute newest one
                    data.sort((a, b) => parseInt(b.sortDate) - parseInt(a.sortDate));
                    const newestLog = data[0];
                    
                    // Inject the newest log data into the homepage card
                    document.getElementById('home-log-title-en').innerText = newestLog.titleEn;
                    document.getElementById('home-log-title-mi').innerText = newestLog.titleMi;
                    document.getElementById('home-log-desc-en').innerText = newestLog.snippetEn;
                    document.getElementById('home-log-desc-mi').innerText = newestLog.snippetMi;
                }
            })
            .catch(error => console.error('Error fetching latest devlog:', error));

        // --- FETCH LATEST SOCIAL POST FOR HOMEPAGE ---
        fetch('/api/content/social')
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    // Sort by date descending
                    data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                    const newest = data[0];
                    
                    document.getElementById('home-social-title-en').innerText = newest.title || 'New Post';
                    document.getElementById('home-social-title-mi').innerText = newest.title || 'Tuhinga Hou';
                    
                    document.getElementById('home-social-desc-en').innerText = newest.description || '';
                    document.getElementById('home-social-desc-mi').innerText = newest.description || '';
                    
                    if (newest.thumbnail) {
                        document.getElementById('home-social-image').innerHTML = 
                            '<img src="' + escapeAttr(newest.thumbnail) + '" alt="' + escapeAttr(newest.title || 'Latest social post') + '" style="width:100%;height:100%;object-fit:cover;border-radius:2px;">';
                    }
                }
            })
            .catch(error => console.error('Error fetching social posts:', error));

        // --- FETCH LATEST FOX FOR HOMEPAGE ---
        fetch('/api/content/foxes')
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    // Sort by ID to ensure we are grabbing the newest addition
                    data.sort((a, b) => b.id - a.id); 
                    const newestFox = data[0];
                    
                    // Inject the newest fox data into the homepage card
                    const foxImageContainer = document.getElementById('home-fox-image');
                    if (newestFox.image) {
                        // ⚠️ THIS USED TO BE `innerHTML = newestFox.image`.
                        // The stored value is a URL, not markup, so the
                        // homepage printed "/media/2026/08/....webp" as TEXT
                        // inside the dashed placeholder and no picture ever
                        // appeared. Exactly the same bug as the foxes page
                        // had, in a file that never got the same fix.
                        //
                        // A value that already starts with < is hand-written
                        // markup from before the media picker existed, so it
                        // is left alone.
                        foxImageContainer.innerHTML = String(newestFox.image).trim().startsWith('<')
                            ? newestFox.image
                            : '<img src="' + escapeAttr(newestFox.image) + '" alt="'
                                + escapeAttr(newestFox.nameEn || 'Adopted fox') + '">';
                    }
                    
                    document.getElementById('home-fox-title-en').innerText = "Meet " + newestFox.nameEn + " (Class of " + newestFox.year + ")";
                    document.getElementById('home-fox-title-mi').innerText = "Tūtaki ki a " + newestFox.nameMi + " (Karaehe o " + newestFox.year + ")";
                    
                    document.getElementById('home-fox-desc-en').innerHTML = newestFox.descEn || newestFox.snippetEn || '';
                    document.getElementById('home-fox-desc-mi').innerHTML = newestFox.descMi || newestFox.snippetMi || '';
                }
            })
            .catch(error => console.error('Error fetching latest fox:', error));

        // EASTER EGG 1: Console Secret
        console.log(
            "%c🦊 You found the fox den!\n\nIf you're reading this, you must be a nerd.\nWe like nerds. Come chat with us in Discord!", 
            "display: block; background: #1D0D12; color: #5DCCCA; font-size: 16px; font-weight: bold; padding: 20px; border-radius: 6px; line-height: 1.5; font-family: monospace;"
        );

        // EASTER EGG 2: Fox Hunt Engine
        document.addEventListener('DOMContentLoaded', () => {
            const paws = document.querySelectorAll('.secret-paw');
            paws.forEach(paw => {
                let foundPaws = JSON.parse(localStorage.getItem('skulkPaws')) || [];
                if (foundPaws.includes(paw.id)) {
                    paw.classList.add('found'); 
                }
                paw.addEventListener('click', () => {
                    let currentFound = JSON.parse(localStorage.getItem('skulkPaws')) || [];
                    if (!currentFound.includes(paw.id)) {
                        currentFound.push(paw.id);
                        localStorage.setItem('skulkPaws', JSON.stringify(currentFound));
                        paw.classList.add('found');
                        if (currentFound.length === 3) {
                            alert(document.body.classList.contains('lang-en') ? 
                                "🦊 You found all 3 hidden paws! Welcome to the deep den..." : 
                                "🦊 Kua kitea ngā tapuwae e 3! Nau mai ki te rua hōhonu...");
                            window.location.href = "/foxes.html#deep-den";
                        } else {
                            alert(document.body.classList.contains('lang-en') ? 
                                `🐾 Paw found! (${currentFound.length}/3) Keep hunting...` : 
                                `🐾 Kua kitea te tapuwae! (${currentFound.length}/3) Rapua tonutia...`);
                        }
                    } else {
                        alert(document.body.classList.contains('lang-en') ? 
                            "You already found this one! Check the other pages." : 
                            "Kua kitea kē tēnei! Tirohia ētahi atu whārangi.");
                    }
                });
            });
        });

        /* The Konami blizzard used to live here, which is why it only
           ever worked on the homepage - this file is the only place it
           was loaded. Moved to assets/js/konami.js on 22 Aug 2026 and
           loaded on every public page. Moved, not copied: two versions
           of an easter egg is two things to keep in step, and nobody
           would ever notice them drifting apart. */
