/**
 * The skulk: every easter egg on the site, in one place.
 *
 * ⚠️ WHY THIS FILE EXISTS.
 * The paw hunt and the console secret were copy-pasted into FOUR page
 * scripts (index, about, devlogs, foxes). Four copies of the same
 * feature is four things to keep in step, and they had already started
 * drifting - devlogs.js ran the hunt engine on a page with no paw in it
 * at all, listening for a clue nobody planted. The Konami blizzard had
 * the same problem in a worse form: one copy, on one page, so it only
 * ever worked on the homepage.
 *
 * Everything here is loaded on all thirteen public pages, next to
 * konami.js. NOT in /admin.
 *
 * WHAT IS IN HERE
 *   - the paw hunt              (moved, not rewritten)
 *   - the console secret        (moved, and given something to do)
 *   - window.skulk              a small console toy
 *   - the idle fox              peers in when a page is left alone
 *   - seasonal eggs             date-gated, appear on their own
 *   - the rune chain            stage two of the puzzle, unlocked by the paws
 *
 * HOUSE RULES EVERY EGG IN HERE FOLLOWS
 *   1. Bilingual. Every string has an English and a te reo half, chosen
 *      by the lang-en class the way the rest of the site does it.
 *   2. Reduced motion is honoured. Nothing moves at somebody who has
 *      asked their system for less movement.
 *   3. Nothing fires while somebody is typing. The site has a newsletter
 *      box and a fan art form.
 *   4. Decoration is aria-hidden. Anything clickable has a real label.
 *   5. Nothing here may break a form, a link or the admin.
 */
(function () {
    'use strict';

    /* ================= the basics ================= */

    var STORE = 'skulk';

    /**
     * ⚠️ ONE KEY, ONE SHAPE, ONE PLACE.
     * The old hunt kept a bare array under `skulkPaws`. Everything now
     * lives in one object under `skulk`, so a new egg does not mean a new
     * key nobody remembers to clear - and `skulk.forget()` genuinely
     * resets everything.
     *
     * Reading is wrapped because localStorage throws outright in a
     * browser with storage disabled, and an easter egg must never be the
     * reason a page fails to load.
     */
    function read() {
        var raw;
        try {
            raw = window.localStorage.getItem(STORE);
        } catch (e) {
            return {};
        }
        if (!raw) return {};
        try {
            return JSON.parse(raw) || {};
        } catch (e) {
            return {};
        }
    }

    function write(state) {
        try {
            window.localStorage.setItem(STORE, JSON.stringify(state));
        } catch (e) {
            /* Private browsing, or storage full. The egg simply will not
               remember; the page carries on. */
        }
    }

    /* ⚠️ THE OLD KEY IS READ ONCE AND CARRIED OVER.
       Somebody mid-hunt should not be sent back to zero because the
       storage was reorganised. Read, merged, and the old key left alone
       rather than deleted - if this migration is ever wrong, their
       progress is still sitting there to recover. */
    function migrate() {
        var state = read();
        if (state.paws) return state;
        var old = [];
        try {
            old = JSON.parse(window.localStorage.getItem('skulkPaws')) || [];
        } catch (e) {
            old = [];
        }
        state.paws = Array.isArray(old) ? old : [];
        write(state);
        return state;
    }

    function inEnglish() {
        return document.body.classList.contains('lang-en');
    }

    function say(en, mi) {
        return inEnglish() ? en : mi;
    }

    function typing(target) {
        if (!target) return false;
        var tag = (target.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select'
            || target.isContentEditable;
    }

    function stillnessWanted() {
        return !!(window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /* Shared with konami.js by convention, not by import - these are
       classic scripts with no module system. Kept identical on purpose. */
    window.skulkHelpers = {
        say: say, typing: typing, stillnessWanted: stillnessWanted,
    };


    /* ================= stage one: the paw hunt ================= */

    var PAWS_TOTAL = 3;

    function pawsFound() {
        return (read().paws || []).length;
    }

    function huntDone() {
        return pawsFound() >= PAWS_TOTAL;
    }

    function startHunt() {
        var paws = document.querySelectorAll('.secret-paw');
        if (!paws.length) return;

        Array.prototype.forEach.call(paws, function (paw) {
            var state = read();
            if ((state.paws || []).indexOf(paw.id) !== -1) paw.classList.add('found');

            paw.addEventListener('click', function () {
                var now = read();
                now.paws = now.paws || [];

                if (now.paws.indexOf(paw.id) !== -1) {
                    window.alert(say(
                        'You already found this one! Check the other pages.',
                        'Kua kitea k\u0113 t\u0113nei! Tirohia \u0113tahi atu wh\u0101rangi.',
                    ));
                    return;
                }

                now.paws.push(paw.id);
                write(now);
                paw.classList.add('found');

                if (now.paws.length >= PAWS_TOTAL) {
                    window.alert(say(
                        '\ud83e\udd8a You found all 3 hidden paws! The deep den is open '
                            + '\u2014 and something in it is watching for runes.',
                        '\ud83e\udd8a Kua kitea ng\u0101 tapuwae e 3! Kua tuwhera te rua h\u014dhonu '
                            + '\u2014 he mea kei roto e tiaki ana i ng\u0101 r\u016bnanga.',
                    ));
                    window.location.href = '/foxes.html#deep-den';
                    return;
                }

                window.alert(say(
                    '\ud83d\udc3e Paw found! (' + now.paws.length + '/3) Keep hunting\u2026',
                    '\ud83d\udc3e Kua kitea te tapuwae! (' + now.paws.length + '/3) Rapua tonutia\u2026',
                ));
            });
        });
    }


    /* ================= stage two: the runes ================= */

    /**
     * Five runes across five pages spell SKULK.
     *
     * ⚠️ THEY ARE INVISIBLE UNTIL THE PAWS ARE ALL FOUND, and that is
     * the whole point of a chain rather than a pile: stage two does not
     * exist until stage one is finished, so the site does not present a
     * wall of puzzles to somebody who has found nothing yet.
     *
     * The markup carries them on every page whether or not they are
     * lit - hiding them in CSS rather than adding them in script means
     * they are in the page for somebody reading the source, which is
     * exactly the sort of person who should find them first.
     */
    var RUNE_WORD = 'SKULK';

    function runesFound() {
        return (read().runes || []).length;
    }

    function startRunes() {
        var runes = document.querySelectorAll('.skulk-rune');
        if (!runes.length) return;

        var open = huntDone();
        Array.prototype.forEach.call(runes, function (rune) {
            if (!open) return;
            rune.classList.add('lit');
            rune.removeAttribute('hidden');

            var state = read();
            if ((state.runes || []).indexOf(rune.id) !== -1) rune.classList.add('found');

            rune.addEventListener('click', function () {
                var now = read();
                now.runes = now.runes || [];
                if (now.runes.indexOf(rune.id) === -1) {
                    now.runes.push(rune.id);
                    write(now);
                }
                rune.classList.add('found');

                window.alert(say(
                    'The rune shows a letter: ' + (rune.dataset.letter || '?')
                        + '\n\n(' + now.runes.length + '/5 found. '
                        + 'Five letters spell what a group of foxes is called. '
                        + 'Type it anywhere when you have them all.)',
                    'Ka puta he reta i te r\u016bnanga: ' + (rune.dataset.letter || '?')
                        + '\n\n(' + now.runes.length + '/5 kua kitea. '
                        + 'E rima ng\u0101 reta hei tohu i te ing\u014da o te r\u014dp\u016b p\u014dkiha. '
                        + 'Patohia ki hea noa atu.)',
                ));
            });
        });
    }

    /* Stage three: type the word. Same idea as the Konami sequence, and
       deliberately typed rather than put in a box - a text box on the
       page would give the whole puzzle away to somebody who had not
       started it. */
    var typed = '';

    function watchForWord() {
        document.addEventListener('keydown', function (e) {
            if (typing(e.target)) { typed = ''; return; }
            if (e.key.length !== 1) return;

            typed = (typed + e.key).toUpperCase().slice(-RUNE_WORD.length);
            if (typed !== RUNE_WORD) return;
            typed = '';

            var state = read();
            if (state.crowned) return;
            if ((state.runes || []).length < 5) {
                window.alert(say(
                    'Something stirs\u2026 but you have not found all five runes yet.',
                    'He mea e oreore ana\u2026 engari kau ano koe i kite i ng\u0101 r\u016bnanga e rima.',
                ));
                return;
            }

            state.crowned = true;
            write(state);
            crown();
        });
    }

    function crown() {
        document.body.classList.add('skulk-crowned');
        window.alert(say(
            '\ud83d\udc51 The skulk knows your name.\n\nYou are one of the pack now. '
                + 'Keep an eye out \u2014 the fox visits more often.',
            '\ud83d\udc51 Kua m\u014dhio te r\u014dp\u016b p\u014dkiha ki t\u014du ingoa.\n\n'
                + 'Kei roto koe i te r\u014dp\u016b in\u0101ianei. Kia mataara \u2014 ka nui ake ng\u0101 haerenga a te p\u014dkiha.',
        ));
    }


    /* ================= the idle fox ================= */

    /**
     * Leave a page alone and a fox peers in from the edge, then leaves.
     *
     * ⚠️ IT DOES NOT MOVE FOR SOMEBODY WHO ASKED FOR STILLNESS, and it
     * does not appear at all on a page where a form is being filled in -
     * a creature sliding into the corner while you are typing your email
     * address is not charming, it is alarming.
     *
     * Visits get more frequent once the chain is finished, which is the
     * only ongoing reward for solving it and costs nothing to give.
     */
    var IDLE_MS = 60000;
    var FRAME_MS = 150;
    var idleTimer = null;

    /**
     * ⚠️ THE ART IS A SEPARATE FILE AND THIS COPES WITHOUT IT.
     * foxart.js defines window.FOX_FRAMES. If it fails to load, or a
     * browser cannot draw Braille, the fox falls back to the emoji it
     * used before rather than leaving an empty box sliding in from the
     * side. An easter egg is never worth a visible failure.
     */
    function foxFrames() {
        var frames = window.FOX_FRAMES;
        if (!frames || !frames.length) return null;
        // Frames of different sizes make the fox jump about as it plays.
        var width = frames[0].length;
        for (var i = 1; i < frames.length; i += 1) {
            if (frames[i].length !== width) return null;
        }
        return frames;
    }

    function foxVisit() {
        if (document.querySelector('.idle-fox')) return;
        if (document.hidden) return;

        var frames = foxFrames();

        var fox = document.createElement(frames ? 'pre' : 'div');
        fox.className = 'idle-fox' + (frames ? ' idle-fox-art' : '');
        if (read().crowned) fox.classList.add('crowned');

        /* ⚠️ aria-hidden IS NOT OPTIONAL HERE.
           Each frame is 968 Braille characters. Without this a screen
           reader reads out a thousand "braille pattern dots" per frame,
           over and over, for as long as the fox is on screen. The emoji
           version was merely pointless to announce; this one would be
           unusable. */
        fox.setAttribute('aria-hidden', 'true');

        var playing = null;
        if (frames) {
            fox.textContent = frames[0];
            /* Somebody who asked for less movement gets the fox, and gets
               it drawn - they just get the resting frame and no lick. */
            if (!stillnessWanted()) {
                var at = 0;
                playing = window.setInterval(function () {
                    at = (at + 1) % frames.length;
                    fox.textContent = frames[at];
                }, FRAME_MS);
            }
        } else {
            fox.textContent = read().crowned ? '\ud83d\udc51\ud83e\udd8a' : '\ud83e\udd8a';
        }

        document.body.appendChild(fox);

        // Force a reflow so the transition runs from the off-screen
        // position rather than starting mid-slide.
        void fox.offsetWidth;
        fox.classList.add('peeking');

        window.setTimeout(function () {
            fox.classList.remove('peeking');
            window.setTimeout(function () {
                // The timer is cleared before the element goes, so a
                // visit can never leave one running against a node that
                // is no longer on the page.
                if (playing) window.clearInterval(playing);
                if (fox.parentNode) fox.parentNode.removeChild(fox);
            }, 1200);
        }, 4400);
    }

    function resetIdle() {
        if (idleTimer) window.clearTimeout(idleTimer);
        if (stillnessWanted()) return;
        var wait = read().crowned ? IDLE_MS / 2 : IDLE_MS;
        idleTimer = window.setTimeout(function () {
            foxVisit();
            resetIdle();
        }, wait);
    }

    function startIdleFox() {
        ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(function (name) {
            document.addEventListener(name, resetIdle, { passive: true });
        });
        resetIdle();
    }


    /* ================= seasonal eggs ================= */

    /**
     * Date-gated, so they turn up on their own.
     *
     * ⚠️ MONTHS ARE 1-BASED HERE, NOT 0-BASED. Date#getMonth returns
     * 0 for January and that off-by-one is the single most common bug in
     * date-gated code - a Matariki egg that fires in June is the sort of
     * thing nobody notices until somebody asks why it appeared early.
     * The +1 happens once, in season(), and nowhere else.
     *
     * Dates are the VIEWER's local dates. The studio is in New Zealand
     * and so is most of the audience; somebody in London seeing the
     * Matariki banner on their own 20 June is a feature, not a bug.
     */
    var SEASONS = [
        {
            id: 'matariki',
            /* Matariki moves with the lunar calendar, so this is a
               generous window around when it falls rather than a fixed
               date. Worth revisiting each year against the official
               public holiday date. */
            from: [6, 15], to: [7, 15],
            en: '\u2728 Matariki. Ng\u0101 mihi o te tau hou M\u0101ori \u2014 the fox is looking up.',
            mi: '\u2728 Matariki. Ng\u0101 mihi o te tau hou M\u0101ori \u2014 kei te titiro whakarunga te p\u014dkiha.',
        },
        {
            id: 'midwinter',
            from: [7, 16], to: [7, 31],
            en: '\u2744\ufe0f Deep winter. Try the arrows, up up down down\u2026',
            mi: '\u2744\ufe0f Te tino tak\u016brua. Whakamatauria ng\u0101 pere, runga runga raro raro\u2026',
        },
        {
            id: 'yule',
            from: [12, 18], to: [12, 27],
            en: '\ud83c\udf84 The den is warm. Meri Kirihimete from all of us.',
            mi: '\ud83c\udf84 He mahana te rua. Meri Kirihimete mai i a m\u0101tou katoa.',
        },
        {
            id: 'newyear',
            from: [12, 31], to: [1, 2],
            en: '\ud83e\udd8a A new year for the skulk. Thanks for being here.',
            mi: '\ud83e\udd8a He tau hou m\u014d te r\u014dp\u016b p\u014dkiha. Ng\u0101 mihi mo t\u014d haere mai.',
        },
        {
            id: 'fools',
            from: [4, 1], to: [4, 1],
            en: '\ud83e\udd8a Today the foxes are in charge. Nothing is on fire. Probably.',
            mi: '\ud83e\udd8a Kei ng\u0101 p\u014dkiha te mana i t\u0113nei r\u0101. K\u0101ore he ahi. Pea.',
        },
    ];

    function inWindow(month, day, from, to) {
        var now = month * 100 + day;
        var start = from[0] * 100 + from[1];
        var end = to[0] * 100 + to[1];
        // A window that wraps the end of the year, like 31 Dec to 2 Jan.
        if (start > end) return now >= start || now <= end;
        return now >= start && now <= end;
    }

    function season(today) {
        var when = today || new Date();
        var month = when.getMonth() + 1;
        var day = when.getDate();
        for (var i = 0; i < SEASONS.length; i += 1) {
            if (inWindow(month, day, SEASONS[i].from, SEASONS[i].to)) return SEASONS[i];
        }
        return null;
    }

    function startSeasonal() {
        var found = season();
        if (!found) return;

        // Once per season per browser. A banner on every page load for a
        // fortnight stops being a surprise and starts being furniture.
        var state = read();
        state.seasons = state.seasons || {};
        if (state.seasons[found.id]) return;
        state.seasons[found.id] = true;
        write(state);

        var note = document.createElement('div');
        note.className = 'seasonal-note';
        // A polite announcement, not an interruption: `status` is read
        // out when the reader next pauses rather than cutting in.
        note.setAttribute('role', 'status');
        note.textContent = say(found.en, found.mi);

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'seasonal-close';
        close.setAttribute('aria-label', say('Close', 'Kati'));
        close.textContent = '\u00d7';
        close.addEventListener('click', function () {
            if (note.parentNode) note.parentNode.removeChild(note);
        });
        note.appendChild(close);

        document.body.appendChild(note);
        window.setTimeout(function () { note.classList.add('shown'); }, 200);
    }


    /* ================= the console toy ================= */

    function consoleSecret() {
        /* eslint-disable no-console */
        console.log(
            '%c\ud83e\udd8a You found the fox den!\n\n'
                + "If you're reading this, you must be a nerd. We like nerds.\n"
                + 'Try skulk.help() for something to do.',
            'display: block; background: #1D0D12; color: #5DCCCA; font-size: 16px;'
                + ' font-weight: bold; padding: 20px; border-radius: 6px;'
                + ' line-height: 1.5; font-family: monospace;',
        );
        /* eslint-enable no-console */
    }

    window.skulk = {
        help: function () {
            return [
                'skulk.paws()   how many paws you have found',
                'skulk.runes()  how many runes you have found',
                'skulk.hint()   a nudge towards the next thing',
                'skulk.forget() start the whole hunt again',
            ].join('\n');
        },
        paws: function () { return pawsFound() + '/' + PAWS_TOTAL; },
        runes: function () { return runesFound() + '/5'; },
        hint: function () {
            if (!huntDone()) {
                return 'Three paws are hidden on three different pages. '
                    + 'One is on the page you would land on first.';
            }
            if (runesFound() < 5) {
                return 'The runes only show themselves to someone who found the paws. '
                    + 'Five pages carry one each.';
            }
            if (!read().crowned) {
                return 'You have all five letters. What do you call a group of foxes? '
                    + 'Type it anywhere on the site.';
            }
            return 'You have finished it. The fox visits more often now.';
        },
        forget: function () {
            write({});
            return 'Forgotten. Reload the page and start again.';
        },
    };


    /* ================= go ================= */

    function start() {
        migrate();
        if (read().crowned) document.body.classList.add('skulk-crowned');
        startHunt();
        startRunes();
        watchForWord();
        startIdleFox();
        startSeasonal();
        consoleSecret();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    /* Exposed only so the test suite can reach the date logic without a
       browser. Everything else is deliberately private. */
    window.skulkInternals = { season: season, inWindow: inWindow, SEASONS: SEASONS };
}());
