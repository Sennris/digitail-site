/**
 * A snow globe you can shake. Foxes page only.
 *
 * ⚠️ THE PHYSICS IS THE BLIZZARD'S, ON PURPOSE.
 * konami.js already had a working snow simulation - drift, wind angle,
 * flakes that re-enter from whichever edge the wind is coming from. This
 * reuses that shape rather than inventing a second one, so if the snow
 * ever looks wrong there is one idea of how snow behaves to go and fix.
 *
 * The difference is where the snow lives: the blizzard is a full-screen
 * fixed canvas, and this is a small one you can pick up and shake. Shake
 * hard and the flakes get thrown; leave it alone and they settle.
 *
 * ⚠️ IT DOES NOT RUN UNTIL SOMEBODY TOUCHES IT, and it stops when it is
 * off screen. An animation loop ticking away in a background tab for a
 * page nobody is looking at is a flat battery and a warm laptop for no
 * reason at all.
 */
(function () {
    'use strict';

    var HOST_ID = 'snow-globe';
    var MAX = 90;

    function stillnessWanted() {
        return !!(window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function inEnglish() {
        return document.body.classList.contains('lang-en');
    }

    function start() {
        var host = document.getElementById(HOST_ID);
        if (!host) return;

        var canvas = document.createElement('canvas');
        canvas.className = 'globe-canvas';
        /* The globe is a toy, not information. The button below it is the
           part that has to be operable and labelled. */
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);

        var shake = document.createElement('button');
        shake.type = 'button';
        shake.className = 'globe-shake';
        shake.textContent = inEnglish() ? 'Shake it' : 'R\u016bria';
        host.appendChild(shake);

        var ctx = canvas.getContext('2d');
        var W = 0;
        var H = 0;
        var flakes = [];
        var angle = 0;
        var energy = 0;
        var running = false;
        var frame = null;

        function size() {
            var box = host.getBoundingClientRect();
            // A square globe, capped so it never dominates the page.
            var side = Math.max(160, Math.min(320, Math.round(box.width)));
            W = side;
            H = side;
            canvas.width = side;
            canvas.height = side;
            canvas.style.width = side + 'px';
            canvas.style.height = side + 'px';
        }

        function seed() {
            flakes = [];
            for (var i = 0; i < MAX; i += 1) {
                flakes.push({
                    x: Math.random() * W,
                    y: Math.random() * H,
                    r: Math.random() * 2.2 + 0.8,
                    d: Math.random() * MAX,
                });
            }
        }

        function draw() {
            ctx.clearRect(0, 0, W, H);

            // The glass. Drawn first so the snow sits inside it.
            ctx.save();
            ctx.beginPath();
            ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
            ctx.clip();

            ctx.fillStyle = 'rgba(29, 13, 18, 0.85)';
            ctx.fillRect(0, 0, W, H);

            ctx.fillStyle = 'rgba(229, 218, 191, 0.85)';
            ctx.beginPath();
            for (var i = 0; i < MAX; i += 1) {
                ctx.moveTo(flakes[i].x, flakes[i].y);
                ctx.arc(flakes[i].x, flakes[i].y, flakes[i].r, 0, Math.PI * 2, true);
            }
            ctx.fill();
            ctx.restore();

            // The rim.
            ctx.strokeStyle = 'rgba(93, 204, 202, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        function move() {
            angle += 0.01;
            // Energy is what a shake adds. It bleeds off, and when it is
            // gone the snow is just falling again.
            energy *= 0.94;

            for (var i = 0; i < MAX; i += 1) {
                var f = flakes[i];
                f.y += Math.cos(angle + f.d) + 0.6 + f.r / 3 + energy * (Math.random() - 0.3);
                f.x += Math.sin(angle) * 1.4 + energy * (Math.random() - 0.5) * 2;

                // Inside the glass, or back to the top.
                var dx = f.x - W / 2;
                var dy = f.y - H / 2;
                if (Math.sqrt(dx * dx + dy * dy) > W / 2 - 4 || f.y > H) {
                    flakes[i] = {
                        x: W / 2 + (Math.random() - 0.5) * (W / 2),
                        y: 6 + Math.random() * 10,
                        r: f.r,
                        d: f.d,
                    };
                }
            }
        }

        function tick() {
            move();
            draw();
            // Settle down and stop, rather than spinning for ever.
            if (energy < 0.02) {
                var settled = flakes.every(function (f) { return f.y > H * 0.75; });
                if (settled) { running = false; frame = null; return; }
            }
            frame = window.requestAnimationFrame(tick);
        }

        function run() {
            if (running) return;
            running = true;
            frame = window.requestAnimationFrame(tick);
        }

        function stop() {
            running = false;
            if (frame) window.cancelAnimationFrame(frame);
            frame = null;
        }

        function shaken() {
            energy = 6;
            if (stillnessWanted()) {
                // The snow is re-scattered and drawn once. The toy still
                // does something; it just does not animate at somebody
                // who asked it not to.
                seed();
                draw();
                return;
            }
            run();
        }

        shake.addEventListener('click', shaken);
        // Dragging across the glass shakes it too, which is the thing
        // everybody tries first.
        canvas.addEventListener('pointermove', function (e) {
            if (e.buttons !== 1) return;
            energy = Math.min(8, energy + 0.6);
            if (!stillnessWanted()) run();
        });

        window.addEventListener('resize', function () { size(); seed(); draw(); });

        /* ⚠️ STOPS WHEN IT SCROLLS OUT OF SIGHT. Without this the loop
           runs the whole time the page is open, for a toy three screens
           further up. IntersectionObserver is in every browser this site
           supports; if it is somehow missing, the toy simply keeps its
           default behaviour of stopping when the snow settles. */
        if (window.IntersectionObserver) {
            new window.IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) stop();
                });
            }, { threshold: 0 }).observe(host);
        }

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) stop();
        });

        size();
        seed();
        draw();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
}());
