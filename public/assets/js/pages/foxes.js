/* foxes.html - page script */
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

        // 2. Fetch JSON and Render Fox Cards
        const grid = document.getElementById('fox-grid');
        let observer; // Define observer outside so we can use it in the fetch

        // Function to set up scroll animations
        function setupObserver() {
            observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                    }
                });
            }, { threshold: 0.1 });

            const hiddenElements = document.querySelectorAll('.fade-in-section');
            hiddenElements.forEach((el) => observer.observe(el));
        }

        fetch('/api/content/foxes')
            .then(response => {
                if (!response.ok) throw new Error("JSON file not found");
                return response.json();
            })
            .then(data => {
                data.forEach(fox => {
                    const card = document.createElement('div');
                    card.className = 'card fox-card fade-in-section';
                    
                    const imageHTML = fox.image ? fox.image : `<span class="en">[ Photo Placeholder ]</span><span class="mi">[ Pikitia Placeholder ]</span>`;

                    card.innerHTML = `
                        <div class="image-placeholder card-image-source">
                            <div class="year-badge">${fox.year}</div>
                            ${imageHTML}
                        </div>
                        <h3>
                            <span class="en">${fox.nameEn}</span>
                            <span class="mi">${fox.nameMi}</span>
                        </h3>
                        <div class="stat-row">
                            <span class="stat-label"><span class="en">Adoption Package</span><span class="mi">Mōkī Whāngai</span></span> 
                            <span class="stat-value"><span class="en">${fox.packageEn || ''}</span><span class="mi">${fox.packageMi || ''}</span></span>
                        </div>
                        <p class="fox-desc">
                            <span class="en">${fox.descEn || ""}</span>
                            <span class="mi">${fox.descMi || ""}</span>
                        </p>
                        <span class="read-more">
                            <span class="en">Read Full Biography →</span>
                            <span class="mi">Pānuihia te Haurongo →</span>
                        </span>
                        
                        <div class="full-content" style="display: none;">
                            <span class="en">${fox.bioEn || ""}</span>
                            <span class="mi">${fox.bioMi || ""}</span>
                        </div>
                    `;
                    grid.appendChild(card);
                });
                
                // Re-initialize the observer so the new cards get animated
                setupObserver();
            })
            .catch(error => {
                console.error("Error loading foxes:", error);
                grid.innerHTML = `<p style="text-align: center; width: 100%; grid-column: 1/-1;"><span class="en">No foxes found. Did you create foxes.json?</span><span class="mi">Kāore i kitea he rēpokia.</span></p>`;
                setupObserver();
            });


        // 3. Fox Modal Engine (Updated to work with dynamic JSON cards)
        const modal = document.getElementById('fox-modal');
        const closeBtn = document.querySelector('.modal-close-btn');

        if(modal && closeBtn) {
            // Using event delegation so it works on elements loaded *after* the page loads
            grid.addEventListener('click', (e) => {
                const readMoreBtn = e.target.closest('.read-more');
                if (readMoreBtn) {
                    const card = readMoreBtn.closest('.fox-card');
                    
                    const year = card.querySelector('.year-badge').innerText;
                    // We remove the year badge before putting the image into the modal so it looks cleaner
                    let imageHTML = card.querySelector('.card-image-source').innerHTML;
                    imageHTML = imageHTML.replace(/<div class="year-badge">.*?<\/div>/, ''); 

                    const titleEn = card.querySelector('h3 .en').innerText;
                    const titleMi = card.querySelector('h3 .mi').innerText;
                    
                    const statLabelEn = card.querySelector('.stat-label .en').innerText;
                    const statLabelMi = card.querySelector('.stat-label .mi').innerText;
                    const statValueEn = card.querySelector('.stat-value .en').innerText;
                    const statValueMi = card.querySelector('.stat-value .mi').innerText;
                    
                    // Pulling from the hidden full content div now!
                    const fullBioEn = card.querySelector('.full-content .en').innerHTML;
                    const fullBioMi = card.querySelector('.full-content .mi').innerHTML;

                    modal.querySelector('.modal-year').innerText = year;
                    modal.querySelector('.modal-image').innerHTML = imageHTML;
                    modal.querySelector('.modal-title .en').innerText = titleEn;
                    modal.querySelector('.modal-title .mi').innerText = titleMi;
                    
                    modal.querySelector('.modal-stat').innerHTML = `<span class="stat-label"><span class="en">${statLabelEn}</span><span class="mi">${statLabelMi}</span></span> <span class="stat-value"><span class="en">${statValueEn}</span><span class="mi">${statValueMi}</span></span>`;
                    
                    modal.querySelector('.modal-text .en').innerHTML = fullBioEn;
                    modal.querySelector('.modal-text .mi').innerHTML = fullBioMi;

                    modal.classList.add('active');
                    document.body.style.overflow = 'hidden'; // Stop background scrolling
                }
            });

            function closeModal() {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto'; // Re-enable background scrolling
            }

            closeBtn.addEventListener('click', closeModal);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
            });
        }

        // 4. EASTER EGG 1: 
        console.log(
            "%c🦊 You found the fox den!\n\nIf you're reading this, you must be a nerd.\nWe like nerds. Come chat with us in Discord!", 
            "display: block; background: #1D0D12; color: #5DCCCA; font-size: 16px; font-weight: bold; padding: 20px; border-radius: 6px; line-height: 1.5; font-family: monospace;"
        );

        // 5. EASTER EGG 2: 
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
