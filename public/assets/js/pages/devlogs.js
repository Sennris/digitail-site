/* devlogs.html - page script */
/* Extracted verbatim from the old inline <script> block.
   Shared behaviour is being consolidated into site.js one
   page at a time - see README. */

// 1. Language Toggle Logic
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

        // 2. FETCH JSON AND RENDER CARDS
        const grid = document.getElementById('devlog-grid');
        const filterGroup = document.querySelector('.filter-group');
        const sortSelect = document.getElementById('sort-select');
        let cards = []; 
        let currentFilter = 'all';

        // Load the database
        fetch('/api/content/devlogs')
            .then(response => {
                if (!response.ok) throw new Error("JSON file not found");
                return response.json();
            })
            .then(data => {
                // Build the HTML for each log
                data.forEach(log => {
                    const card = document.createElement('div');
                    card.className = 'card devlog-card';
                    
                    // Pipe-delimited and matched exactly. A comma-joined
                    // string matched by substring meant a filter for "art"
                    // also caught "Smart Objects".
                    const tagsString = [log.primaryTag, log.secondaryTag, ...(log.tags || [])]
                        .filter(Boolean).map(t => t.toLowerCase()).join('|');
                    card.setAttribute('data-tags', tagsString);
                    card.setAttribute('data-date', log.sortDate);

                    // Primary tag reads as the subject, secondary as the update type.
                    const primaryHTML = log.primaryTag
                        ? `<span class="tag-badge tag-badge--primary">${log.primaryTag}</span>` : '';
                    const secondaryHTML = log.secondaryTag
                        ? `<span class="tag-badge tag-badge--secondary">${log.secondaryTag}</span>` : '';
                    const legacyHTML = (log.tags || [])
                        .filter(t => t !== log.primaryTag && t !== log.secondaryTag)
                        .map(tag => `<span class="tag-badge">${tag}</span>`).join('');
                    const tagsHTML = primaryHTML + secondaryHTML + legacyHTML;

                    // The Smart Image Fix
                    const cardImageHTML = log.image ? `<div class="image-placeholder">${log.image}</div>` : '';
                    const modalImageHTML = log.image ? `<div class="image-placeholder">${log.image}</div>` : '';
                    card.innerHTML = `
                        ${cardImageHTML}
                        <div class="log-meta">
                            <span class="log-date">${log.displayDate}</span>
                            <div class="log-tags">${tagsHTML}</div>
                        </div>
                        <h3>
                            <span class="en">${log.titleEn}</span>
                            <span class="mi">${log.titleMi}</span>
                        </h3>
                        <p>
                            <span class="en">${log.snippetEn}</span>
                            <span class="mi">${log.snippetMi}</span>
                        </p>
                        <span class="read-more">
                            <span class="en">Read Log →</span>
                            <span class="mi">Pānuihia Rātaka →</span>
                        </span>
                        
                        <div class="full-content" style="display: none;">
                            ${modalImageHTML}
                            <span class="en">${log.contentEn}</span>
                            <span class="mi">${log.contentMi}</span>
                        </div>
                    `;
                    grid.appendChild(card);
                });

                cards = Array.from(grid.querySelectorAll('.devlog-card'));
                updateGrid('all', sortSelect.value);
            })
            .catch(error => {
                console.error("Error loading devlogs:", error);
                grid.innerHTML = `<p style="text-align: center; width: 100%; grid-column: 1/-1;"><span class="en">No logs found. Did you create devlogs.json?</span><span class="mi">Kāore i kitea he rātaka.</span></p>`;
            });

        // 3. Filtering & Sorting Logic
        function updateGrid(activeFilter, sortOrder) {
            if (cards.length === 0) return; 

            cards.sort((a, b) => {
                const dateA = parseInt(a.getAttribute('data-date'));
                const dateB = parseInt(b.getAttribute('data-date'));
                return sortOrder === 'newest' ? dateB - dateA : dateA - dateB; 
            });

            grid.innerHTML = ''; 
            cards.forEach(card => {
                const tags = (card.getAttribute('data-tags') || '').split('|').filter(Boolean);
                if (activeFilter === 'all' || tags.includes(activeFilter)) {
                    card.style.display = 'flex'; 
                } else {
                    card.style.display = 'none'; 
                }
                grid.appendChild(card);
            });
        }

        // Delegated, so it keeps working after the buttons are rebuilt from
        // the tag list below.
        if (filterGroup) {
            filterGroup.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-rugged');
                if (!btn || !filterGroup.contains(btn)) return;
                filterGroup.querySelectorAll('.btn-rugged')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.getAttribute('data-filter');
                updateGrid(currentFilter, sortSelect.value);
            });
        }

        // --- FILTER BUTTONS COME FROM THE TAG MANAGER ---
        //
        // These used to be typed into devlogs.html, so adding a tag in the
        // admin panel could never add a button. Now the row is rebuilt from
        // the tags marked as filter buttons, in the order set there.
        //
        // If the request fails, or nothing is marked as a filter, the buttons
        // already in the page are left exactly as they are - an empty filter
        // row would be worse than a slightly stale one.
        fetch('/api/content/tags')
            .then(response => (response.ok ? response.json() : null))
            .then(tags => {
                if (!filterGroup || !Array.isArray(tags)) return;

                const shown = tags.filter(t => t && t.name && t.filter !== false);
                if (!shown.length) return;

                filterGroup.textContent = '';

                const addButton = (value, en, mi, isActive) => {
                    const btn = document.createElement('button');
                    btn.className = 'btn-rugged' + (isActive ? ' active' : '');
                    btn.setAttribute('data-filter', value);

                    const enSpan = document.createElement('span');
                    enSpan.className = 'en';
                    enSpan.textContent = en;

                    const miSpan = document.createElement('span');
                    miSpan.className = 'mi';
                    miSpan.textContent = mi || en;

                    btn.append(enSpan, miSpan);
                    filterGroup.appendChild(btn);
                };

                addButton('all', 'All Logs', 'Katoa', true);
                shown.forEach(t => addButton(t.name.toLowerCase(), t.name, t.nameMi));

                currentFilter = 'all';
                updateGrid(currentFilter, sortSelect.value);
            })
            .catch(error => console.error('Error loading filter tags:', error));

        sortSelect.addEventListener('change', (e) => {
            updateGrid(currentFilter, e.target.value);
        });

        // 4. MODAL (HOVER SCREEN) LOGIC
        const modal = document.getElementById('devlog-modal');
        const modalCloseBtn = modal.querySelector('.modal-close-btn');
        const modalTitleEn = modal.querySelector('.modal-title .en');
        const modalTitleMi = modal.querySelector('.modal-title .mi');
        const modalDate = modal.querySelector('.modal-date');
        const modalBodyContent = document.getElementById('modal-body-content'); 

        function openModal(card) {
            const titleEn = card.querySelector('h3 .en').innerText;
            const titleMi = card.querySelector('h3 .mi').innerText;
            const date = card.querySelector('.log-date').innerText;
            const fullContentHTML = card.querySelector('.full-content').innerHTML;

            modalTitleEn.innerText = titleEn;
            modalTitleMi.innerText = titleMi;
            modalDate.innerText = date;
            modalBodyContent.innerHTML = fullContentHTML;

            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        grid.addEventListener('click', (e) => {
            const readMoreBtn = e.target.closest('.read-more');
            if (readMoreBtn) {
                e.preventDefault(); 
                const parentCard = readMoreBtn.closest('.devlog-card');
                openModal(parentCard);
            }
        });

        function closeModal() {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto'; 
        }

        modalCloseBtn.addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
        });

        // 5. EASTER EGG 1: The Dev Console Secret
        console.log(
            "%c🦊 You found the fox den!\n\nIf you're reading this, you must be a nerd.\nWe like nerds. Come chat with us in Discord!", 
            "display: block; background: #1D0D12; color: #5DCCCA; font-size: 16px; font-weight: bold; padding: 20px; border-radius: 6px; line-height: 1.5; font-family: monospace;"
        );

        // 6. EASTER EGG 2: The Fox Hunt Engine
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
