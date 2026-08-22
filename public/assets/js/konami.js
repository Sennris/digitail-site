/**
 * The Konami blizzard, on every page.
 *
 * ⚠️ THIS USED TO LIVE INSIDE pages/index.js, which only the homepage
 * loads - so the code only worked there. Asked for on 22 Aug 2026: it
 * should work everywhere. Moved out whole rather than copied, because
 * two copies of an easter egg is two things to keep in step and nobody
 * would ever notice them drifting.
 *
 * Loaded on all thirteen public pages, next to a11y.js and
 * card-click.js. NOT loaded in /admin - a snowstorm over the content
 * manager is nobody's idea of a good time.
 *
 * Bilingual, the same way the rest of the site is: the copy follows the
 * lang-en class on <body> that lang-persist.js sets.
 */
(function () {
    'use strict';

    var SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

    var index = 0;
    var running = null;

    function inEnglish() {
        return document.body.classList.contains('lang-en');
    }

    /* ⚠️ NOT WHILE SOMEBODY IS TYPING. The site has a newsletter box, a
       fan art form and a search - "b" and "a" are ordinary letters, and
       an arrow key in a text field is how you move the cursor. Without
       this, filling in a form could set off a snowstorm, which reads as
       the page breaking rather than as a joke. */
    function typing(target) {
        if (!target) return false;
        var tag = (target.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select'
            || target.isContentEditable;
    }

    /* Somebody who has asked their system for less movement has asked
       for less movement. They still get the message and the darkened
       room - the joke survives - but 150 particles do not fly at them. */
    function stillnessWanted() {
        return window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    document.addEventListener('keydown', function (e) {
        if (typing(e.target)) { index = 0; return; }

        // Escape puts the room back. Without a way out, the only exit
        // from the blizzard is a page reload - and the animation runs
        // for as long as the tab is open.
        if (e.key === 'Escape' && running) { stop(); return; }

        if (e.key === SEQUENCE[index]) {
            index += 1;
            if (index === SEQUENCE.length) {
                index = 0;
                start();
            }
        } else {
            index = 0;
        }
    });

    /* ⚠️ EVERYTHING START() CREATED COMES BACK OFF HERE, and the pieces
       are held on the `running` object so this stays one function
       rather than a chain of wrappers. An earlier draft re-wrapped
       `stop` from inside snow() to get at the resize listener; that
       works once and then stacks a new wrapper on every blizzard. */
    function stop() {
        if (!running) return;
        if (running.timer) window.clearInterval(running.timer);
        if (running.resized) window.removeEventListener('resize', running.resized);
        if (running.canvas && running.canvas.parentNode) {
            running.canvas.parentNode.removeChild(running.canvas);
        }
        document.body.style.backgroundColor = running.background;
        running = null;
    }

    function start() {
        if (running) return;

        window.alert(inEnglish()
            ? 'SYSTEM OVERRIDE: Arctic protocols initiated. Dress warmly. \u2744\ufe0f'
            : 'P\u016aNAHA WHAKAHAERE: Kua timata ng\u0101 kawa \u0100kitiki. Kia mahana te k\u0101kahu. \u2744\ufe0f');

        var background = document.body.style.backgroundColor;
        document.body.style.transition = 'background-color 3s ease';
        document.body.style.backgroundColor = '#0a0406';

        var canvas = document.createElement('canvas');
        canvas.id = 'blizzard-canvas';
        /* Decoration. A screen reader has nothing useful to say about a
           canvas of snowflakes, and the site is audited for this. */
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '9999';
        canvas.style.opacity = '0';
        canvas.style.transition = 'opacity 3s ease';
        document.body.appendChild(canvas);

        window.setTimeout(function () { canvas.style.opacity = '1'; }, 100);

        running = { canvas: canvas, background: background, timer: null, resized: null };
        snow(canvas);
    }

    function snow(canvas) {
        var ctx = canvas.getContext('2d');
        var W = window.innerWidth;
        var H = window.innerHeight;
        canvas.width = W;
        canvas.height = H;

        /* ⚠️ THE RESIZE LISTENER COMES OFF AGAIN when the blizzard stops.
           The version this was lifted from added one every time it ran
           and never removed it. Kept on `running` so stop() can find it. */
        function resized() {
            W = window.innerWidth;
            H = window.innerHeight;
            canvas.width = W;
            canvas.height = H;
        }
        window.addEventListener('resize', resized);
        running.resized = resized;

        var MAX = 150;
        var flakes = [];
        for (var i = 0; i < MAX; i += 1) {
            flakes.push({
                x: Math.random() * W,
                y: Math.random() * H,
                r: Math.random() * 3 + 1,
                d: Math.random() * MAX,
            });
        }

        var angle = 0;

        function draw() {
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(229, 218, 191, 0.8)';
            ctx.beginPath();
            for (var n = 0; n < MAX; n += 1) {
                ctx.moveTo(flakes[n].x, flakes[n].y);
                ctx.arc(flakes[n].x, flakes[n].y, flakes[n].r, 0, Math.PI * 2, true);
            }
            ctx.fill();
        }

        function move() {
            angle += 0.01;
            for (var n = 0; n < MAX; n += 1) {
                var f = flakes[n];
                f.y += Math.cos(angle + f.d) + 1 + f.r / 2;
                f.x += Math.sin(angle) * 2;

                if (f.x > W + 5 || f.x < -5 || f.y > H) {
                    if (n % 3 > 0) {
                        flakes[n] = { x: Math.random() * W, y: -10, r: f.r, d: f.d };
                    } else if (Math.sin(angle) > 0) {
                        flakes[n] = { x: -5, y: Math.random() * H, r: f.r, d: f.d };
                    } else {
                        flakes[n] = { x: W + 5, y: Math.random() * H, r: f.r, d: f.d };
                    }
                }
            }
        }

        if (stillnessWanted()) {
            // One frame. Snow on the ground rather than snow in the air.
            draw();
            running.timer = null;
        } else {
            running.timer = window.setInterval(function () { draw(); move(); }, 33);
        }

    }
}());
