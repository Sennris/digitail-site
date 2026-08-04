/* ==========================================================================
   DIGI TAIL STUDIOS - SHARED SITE SCRIPT
   ==========================================================================
   Loaded by every public page. Handles the three things every page needs:
     1. English / te reo Māori toggle
     2. Scroll reveal animations
     3. Easter eggs (paw hunt, Konami blizzard, console message)

   Page-specific behaviour lives in assets/js/pages/<pagename>.js
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. LANGUAGE TOGGLE
   Remembers the visitor's choice so they don't have to re-pick it on
   every page. Also updates <html lang> so screen readers announce the
   correct language.
   -------------------------------------------------------------------------- */

const Lang = {
    STORAGE_KEY: 'digitail-lang',

    init() {
        const saved = localStorage.getItem(this.STORAGE_KEY) || 'en';
        this.set(saved);

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#lang-toggle-btn, .lang-toggle-btn');
            if (!btn) return;
            this.set(document.body.classList.contains('lang-en') ? 'mi' : 'en');
        });
    },

    set(lang) {
        document.body.classList.remove('lang-en', 'lang-mi');
        document.body.classList.add('lang-' + lang);
        document.documentElement.setAttribute('lang', lang === 'mi' ? 'mi' : 'en');
        localStorage.setItem(this.STORAGE_KEY, lang);
    },

    current() {
        return document.body.classList.contains('lang-mi') ? 'mi' : 'en';
    },

    /* Helper for scripts that need to show one of two strings */
    pick(en, mi) {
        return this.current() === 'mi' ? mi : en;
    }
};


/* --------------------------------------------------------------------------
   2. SCROLL REVEAL
   Anything with .fade-in-section fades up as it enters the viewport.
   Call Reveal.observe(element) after injecting content dynamically.
   -------------------------------------------------------------------------- */

const Reveal = {
    observer: null,

    init() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    this.observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        const hero = document.querySelector('.hero-section');
        if (hero) hero.classList.add('is-visible');

        document.querySelectorAll('.fade-in-section').forEach((el) => {
            this.observer.observe(el);
        });
    },

    /* Re-run on newly added elements, e.g. after loading content from the API */
    observe(root = document) {
        if (!this.observer) return;
        root.querySelectorAll('.fade-in-section:not(.is-visible)').forEach((el) => {
            this.observer.observe(el);
        });
    }
};


/* --------------------------------------------------------------------------
   3. EASTER EGGS
   -------------------------------------------------------------------------- */

const EasterEggs = {
    TOTAL_PAWS: 3,
    STORAGE_KEY: 'skulkPaws',

    init() {
        this.console();
        this.pawHunt();
        this.konami();
    },

    console() {
        window.console.log(
            "%c🦊 You found the fox den!\n\nIf you're reading this, you must be a nerd.\nWe like nerds. Come chat with us in Discord!",
            'display: block; background: #1D0D12; color: #5DCCCA; font-size: 16px; font-weight: bold; padding: 20px; border-radius: 6px; line-height: 1.5; font-family: monospace;'
        );
    },

    found() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    },

    pawHunt() {
        const paws = document.querySelectorAll('.secret-paw');
        const alreadyFound = this.found();

        paws.forEach((paw) => {
            if (alreadyFound.includes(paw.id)) paw.classList.add('found');

            paw.addEventListener('click', () => {
                const current = this.found();

                if (current.includes(paw.id)) {
                    alert(Lang.pick(
                        'You already found this one! Check the other pages.',
                        'Kua kitea kē tēnei! Tirohia ētahi atu whārangi.'
                    ));
                    return;
                }

                current.push(paw.id);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(current));
                paw.classList.add('found');

                if (current.length === this.TOTAL_PAWS) {
                    alert(Lang.pick(
                        '🦊 You found all 3 hidden paws! Welcome to the deep den...',
                        '🦊 Kua kitea ngā tapuwae e 3! Nau mai ki te rua hōhonu...'
                    ));
                    window.open('https://www.youtube.com/results?search_query=laughing+arctic+fox', '_blank');
                } else {
                    alert(Lang.pick(
                        `🐾 Paw found! (${current.length}/${this.TOTAL_PAWS}) Keep hunting...`,
                        `🐾 Kua kitea te tapuwae! (${current.length}/${this.TOTAL_PAWS}) Rapua tonutia...`
                    ));
                }
            });
        });
    },

    konami() {
        const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                          'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        let index = 0;

        document.addEventListener('keydown', (e) => {
            if (e.key === sequence[index]) {
                index++;
                if (index === sequence.length) {
                    this.blizzard();
                    index = 0;
                }
            } else {
                index = 0;
            }
        });
    },

    blizzard() {
        alert(Lang.pick(
            'SYSTEM OVERRIDE: Arctic protocols initiated. Dress warmly. ❄️',
            'PŪNAHA WHAKAHAERE: Kua timata ngā kawa Ākitiki. Kia mahana te kākahu. ❄️'
        ));

        document.body.style.transition = 'background-color 3s ease';
        document.body.style.backgroundColor = '#0a0406';

        if (document.getElementById('blizzard-canvas')) return;

        const canvas = document.createElement('canvas');
        canvas.id = 'blizzard-canvas';
        Object.assign(canvas.style, {
            position: 'fixed', top: '0', left: '0',
            width: '100vw', height: '100vh',
            pointerEvents: 'none', zIndex: '9999',
            opacity: '0', transition: 'opacity 3s ease'
        });
        document.body.appendChild(canvas);
        setTimeout(() => { canvas.style.opacity = '1'; }, 100);

        this.snow(canvas);
    },

    snow(canvas) {
        const ctx = canvas.getContext('2d');
        let W = window.innerWidth;
        let H = window.innerHeight;
        canvas.width = W;
        canvas.height = H;

        window.addEventListener('resize', () => {
            W = canvas.width = window.innerWidth;
            H = canvas.height = window.innerHeight;
        });

        const MAX = 150;
        const flakes = Array.from({ length: MAX }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 3 + 1,
            d: Math.random() * MAX
        }));

        let angle = 0;

        function frame() {
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(229, 218, 191, 0.8)';
            ctx.beginPath();
            flakes.forEach((f) => {
                ctx.moveTo(f.x, f.y);
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2, true);
            });
            ctx.fill();

            angle += 0.01;
            flakes.forEach((f, i) => {
                f.y += Math.cos(angle + f.d) + 1 + f.r / 2;
                f.x += Math.sin(angle) * 2;

                if (f.x > W + 5 || f.x < -5 || f.y > H) {
                    if (i % 3 > 0) {
                        Object.assign(f, { x: Math.random() * W, y: -10 });
                    } else if (Math.sin(angle) > 0) {
                        Object.assign(f, { x: -5, y: Math.random() * H });
                    } else {
                        Object.assign(f, { x: W + 5, y: Math.random() * H });
                    }
                }
            });

            requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
    }
};


/* --------------------------------------------------------------------------
   BOOT
   -------------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
    Lang.init();
    Reveal.init();
    EasterEggs.init();
});
