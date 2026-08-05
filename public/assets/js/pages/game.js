/* game.html - page script */
/* Extracted verbatim from the old inline <script> block.
   Shared behaviour is being consolidated into site.js one
   page at a time - see README. */

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

        // --- FETCH GAME DATA FROM JSON ---
        fetch('/api/content/game')
            .then(response => {
                if (!response.ok) throw new Error("game.json not found");
                return response.json();
            })
            .then(data => {
                // Update title
                const titleEl = document.getElementById('game-title');
                if (titleEl && data.titleEn) {
                    titleEl.querySelector('.en').innerText = data.titleEn;
                    titleEl.querySelector('.mi').innerText = data.titleMi || data.titleEn;
                }

                // The tagline fields have existed in the admin panel since
                // Phase 2 and were never displayed anywhere. They are the
                // line under the title.
                const tagEn = document.getElementById('game-tagline-en');
                const tagMi = document.getElementById('game-tagline-mi');
                if (tagEn && data.taglineEn) tagEn.innerText = data.taglineEn;
                if (tagMi && (data.taglineMi || data.taglineEn)) {
                    tagMi.innerText = data.taglineMi || data.taglineEn;
                }

                // Update page title
                if (data.titleEn) {
                    document.title = data.titleEn + ' | Digi Tail Studios';
                }

                // Handle trailer URL
                if (data.trailerUrl) {
                    const container = document.getElementById('trailer-container');
                    if (container) {
                        // Check if it's a YouTube URL and embed it
                        const ytMatch = data.trailerUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
                        if (ytMatch) {
                            container.innerHTML = '<iframe width="100%" height="100%" src="https://www.youtube.com/embed/' + ytMatch[1] + '" frameborder="0" allowfullscreen style="border-radius:2px;"></iframe>';
                        } else {
                            container.innerHTML = '<video controls style="width:100%;height:100%;object-fit:cover;border-radius:2px;"><source src="' + data.trailerUrl + '"></video>';
                        }
                    }
                }
            })
            .catch(error => console.error('Error fetching game data:', error));

                document.addEventListener("DOMContentLoaded", function() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                    }
                });
            }, {
                threshold: 0.1 
            });

            // Make sure the first sections are instantly visible
            document.querySelector('.game-hero').classList.add('is-visible');

            const hiddenElements = document.querySelectorAll('.fade-in-section');
            hiddenElements.forEach((el) => observer.observe(el));
        });
