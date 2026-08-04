/* index.html - page script */
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

        // Newsletter Form
        const form = document.getElementById('newsletter-form');
        const emailInput = document.getElementById('email');
        const confirmEmailInput = document.getElementById('confirm-email');

        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault(); 
                if (emailInput.value !== confirmEmailInput.value) {
                    if (document.body.classList.contains('lang-en')) {
                        alert("Oops! Those email addresses don't match. Please check them again.");
                    } else {
                        alert("Aue! Kāore e ōrite ana aua wāhitau īmēra. Tena koa tirohia anō.");
                    }
                    confirmEmailInput.style.borderColor = "red";
                    confirmEmailInput.style.boxShadow = "4px 4px 0px rgba(255,0,0,0.5)";
                    return; 
                } 
                confirmEmailInput.style.borderColor = "#1D0D12";
                confirmEmailInput.style.boxShadow = "none";
                const formData = new FormData(form);
                fetch(form.action, { method: 'POST', body: formData })
                .then(response => { window.location.href = "thankyou.html"; })
                .catch(error => { window.location.href = "thankyou.html"; });
            });
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

                // Mascot
                if (data.mascot && data.mascot.versions) {
                    let mascotKey = data.mascot.current || 'default';
                    
                    // Auto-switch by date if enabled
                    if (data.mascot.autoSwitch) {
                        const now = new Date();
                        const mmdd = String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
                        for (const [key, ver] of Object.entries(data.mascot.versions)) {
                            if (key === 'default' || !ver.activeDates) continue;
                            const [start, end] = ver.activeDates;
                            if ((start <= end && mmdd >= start && mmdd <= end) || 
                                (start > end && (mmdd >= start || mmdd <= end))) {
                                mascotKey = key;
                                break;
                            }
                        }
                    }
                    
                    const mascotData = data.mascot.versions[mascotKey] || data.mascot.versions['default'];
                    if (mascotData && mascotData.image) {
                        const mascotEl = document.getElementById('hero-mascot');
                        mascotEl.innerHTML = '<img src="' + mascotData.image + '" alt="' + (mascotData.name || 'Studio Mascot') + '">';
                        mascotEl.style.display = 'block';
                    }
                }

                // Announcement banner
                if (data.announcement && data.announcement.enabled) {
                    const banner = document.getElementById('announcement-banner');
                    if (banner) {
                        const hasImage = data.announcement.image && data.announcement.image.trim();
                        const hasText = data.announcement.text && data.announcement.text.trim();
                        
                        if (hasImage) {
                            let html = '<img src="' + data.announcement.image + '" alt="Announcement">';
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
                if (tickerEl && trackEl && data.ticker && data.ticker.enabled
                    && Array.isArray(data.ticker.items) && data.ticker.items.length) {
                    // duplicated so the scroll loops without a visible seam
                    const once = data.ticker.items
                        .map(t => '<span>' + t + '</span>').join('');
                    trackEl.innerHTML = once + once;
                    if (data.ticker.speed) {
                        trackEl.style.animationDuration = data.ticker.speed + 's';
                    }
                    tickerEl.hidden = false;
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
            })
            .catch(error => console.error('Error fetching homepage data:', error));

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
                            '<img src="' + newest.thumbnail + '" style="width:100%;height:100%;object-fit:cover;border-radius:2px;">';
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
                    if(newestFox.image) {
                        foxImageContainer.innerHTML = newestFox.image;
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
                            window.open("https://www.youtube.com/results?search_query=laughing+arctic+fox", "_blank"); 
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

        // --- EASTER EGG 3: THE KONAMI BLIZZARD ---
        const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        let konamiIndex = 0;

        document.addEventListener('keydown', (e) => {
            if (e.key === konamiSequence[konamiIndex]) {
                konamiIndex++;
                if (konamiIndex === konamiSequence.length) {
                    triggerBlizzard();
                    konamiIndex = 0; 
                }
            } else {
                konamiIndex = 0; 
            }
        });

        function triggerBlizzard() {
            alert(document.body.classList.contains('lang-en') ? 
                "SYSTEM OVERRIDE: Arctic protocols initiated. Dress warmly. ❄️" : 
                "PŪNAHA WHAKAHAERE: Kua timata ngā kawa Ākitiki. Kia mahana te kākahu. ❄️");

            document.body.style.transition = "background-color 3s ease";
            document.body.style.backgroundColor = "#0a0406"; 

            let canvas = document.getElementById('blizzard-canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'blizzard-canvas';
                document.body.appendChild(canvas);
                
                canvas.style.position = 'fixed';
                canvas.style.top = '0';
                canvas.style.left = '0';
                canvas.style.width = '100vw';
                canvas.style.height = '100vh';
                canvas.style.pointerEvents = 'none'; 
                canvas.style.zIndex = '9999';
                canvas.style.opacity = '0';
                canvas.style.transition = 'opacity 3s ease';
                
                setTimeout(() => { canvas.style.opacity = '1'; }, 100);
                
                startSnowPhysics(canvas);
            }
        }

        function startSnowPhysics(canvas) {
            const ctx = canvas.getContext('2d');
            let W = window.innerWidth;
            let H = window.innerHeight;
            canvas.width = W;
            canvas.height = H;

            window.addEventListener('resize', () => {
                W = window.innerWidth;
                H = window.innerHeight;
                canvas.width = W;
                canvas.height = H;
            });

            const maxFlakes = 150; 
            const flakes = [];

            for (let i = 0; i < maxFlakes; i++) {
                flakes.push({
                    x: Math.random() * W,
                    y: Math.random() * H,
                    r: Math.random() * 3 + 1, 
                    d: Math.random() * maxFlakes 
                });
            }

            let angle = 0;

            function drawFlakes() {
                ctx.clearRect(0, 0, W, H);
                ctx.fillStyle = "rgba(229, 218, 191, 0.8)"; 
                ctx.beginPath();
                for (let i = 0; i < maxFlakes; i++) {
                    let f = flakes[i];
                    ctx.moveTo(f.x, f.y);
                    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2, true);
                }
                ctx.fill();
                updatePhysics();
            }

            function updatePhysics() {
                angle += 0.01;
                for (let i = 0; i < maxFlakes; i++) {
                    let f = flakes[i];
                    f.y += Math.cos(angle + f.d) + 1 + f.r / 2;
                    f.x += Math.sin(angle) * 2;

                    if (f.x > W + 5 || f.x < -5 || f.y > H) {
                        if (i % 3 > 0) {
                            flakes[i] = { x: Math.random() * W, y: -10, r: f.r, d: f.d };
                        } else {
                            if (Math.sin(angle) > 0) {
                                flakes[i] = { x: -5, y: Math.random() * H, r: f.r, d: f.d };
                            } else {
                                flakes[i] = { x: W + 5, y: Math.random() * H, r: f.r, d: f.d };
                            }
                        }
                    }
                }
            }
            setInterval(drawFlakes, 33);
        }
