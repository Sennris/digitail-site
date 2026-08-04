/* social.html - page script */
/* Extracted verbatim from the old inline <script> block.
   Shared behaviour is being consolidated into site.js one
   page at a time - see README. */

// 1. Language Toggle Logic
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

        // 2. Social data + rendering
        let allPosts = [];
        let currentFilter = 'all';
        const grid = document.getElementById('social-grid');

        function renderPosts(posts) {
            if (posts.length === 0) {
                grid.innerHTML = '<p style="text-align: center; width: 100%; grid-column: 1/-1; font-family: var(--font-mono); color: #B9CCCC;">' +
                    '<span class="en">No posts found. Check back soon!</span>' +
                    '<span class="mi">Kāore he tuhinga i kitea. Hoki mai ā tōna wā!</span></p>';
                return;
            }

            grid.innerHTML = posts.map(post => {
                const thumbHTML = post.thumbnail 
                    ? '<img src="' + post.thumbnail + '" alt="' + (post.title || '') + '">'
                    : '<span>[ No Image ]</span>';
                
                const tagsHTML = (post.tags && post.tags.length > 0) 
                    ? '<div class="social-tags">' + post.tags.map(t => '<span class="social-tag">' + t + '</span>').join('') + '</div>'
                    : '';

                const cardTag = post.url ? 'a' : 'div';
                const hrefAttr = post.url ? ' href="' + post.url + '" target="_blank"' : '';

                return '<' + cardTag + ' class="social-card fade-in-section"' + hrefAttr + '>' +
                    '<div class="social-thumbnail">' +
                        '<div class="platform-badge">' + (post.platform || 'Post') + '</div>' +
                        thumbHTML +
                    '</div>' +
                    '<div class="social-date">' + (post.date || '') + '</div>' +
                    '<h3>' + (post.title || 'Untitled') + '</h3>' +
                    '<p>' + (post.description || '') + '</p>' +
                    tagsHTML +
                    (post.url ? '<span class="view-post"><span class="en">View Post →</span><span class="mi">Tirohia →</span></span>' : '') +
                '</' + cardTag + '>';
            }).join('');

            // Trigger scroll animations
            setupObserver();
        }

        function filterPosts(platform) {
            currentFilter = platform;
            
            // Update active button
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            if (platform === 'all') {
                renderPosts(allPosts);
            } else {
                renderPosts(allPosts.filter(p => p.platform === platform));
            }
        }

        function buildFilters(posts) {
            const platforms = [...new Set(posts.map(p => p.platform).filter(Boolean))];
            const filterContainer = document.getElementById('platform-filters');
            
            platforms.forEach(platform => {
                const btn = document.createElement('button');
                btn.className = 'filter-btn';
                btn.onclick = function() { filterPosts(platform); };
                btn.textContent = platform;
                filterContainer.appendChild(btn);
            });
        }

        // 3. Scroll Animation Observer
        function setupObserver() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                    }
                });
            }, { threshold: 0.1 });

            document.querySelectorAll('.fade-in-section').forEach(el => observer.observe(el));
        }

        // 4. Fetch social.json
        fetch('/api/content/social')
            .then(response => {
                if (!response.ok) throw new Error("social.json not found");
                return response.json();
            })
            .then(data => {
                // Sort newest first
                data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                allPosts = data;
                buildFilters(data);
                renderPosts(data);
            })
            .catch(error => {
                console.error("Error loading social posts:", error);
                grid.innerHTML = '<p style="text-align: center; width: 100%; grid-column: 1/-1; font-family: var(--font-mono); color: #B9CCCC;">' +
                    '<span class="en">No posts yet. Create some in the Content Manager!</span>' +
                    '<span class="mi">Kāore he tuhinga. Hangaia ētahi i te Content Manager!</span></p>';
                setupObserver();
            });

        // 5. Console Easter Egg
        console.log(
            "%c🦊 You found the fox den!\n\nIf you're reading this, you must be a nerd.\nWe like nerds. Come chat with us in Discord!", 
            "display: block; background: #1D0D12; color: #5DCCCA; font-size: 16px; font-weight: bold; padding: 20px; border-radius: 6px; line-height: 1.5; font-family: monospace;"
        );
