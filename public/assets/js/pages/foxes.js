/* foxes.html - page script */
/* Extracted verbatim from the old inline <script> block.
   Shared behaviour is being consolidated into site.js one
   page at a time - see README. */

/* The photo URL is typed by a person in the admin, so it is escaped
   before it goes anywhere near an attribute. A stray quote in a filename
   would otherwise close the src early and put the rest inside the tag.
   Declared at the top of the file rather than beside its use: this is a
   classic script, and a function nested inside a block is only hoisted
   within that block. */
function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

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
                    
                    // The admin's photo field stores a URL - the media picker
                    // puts "/media/2026/08/....webp" in it. This line used to
                    // drop that value straight into the card as text, so the
                    // photo never appeared: the browser was handed an address
                    // where it expected a picture. Every other page on the
                    // site builds an <img> from the same kind of value; foxes
                    // was the one that did not. Reported by the team 14 Aug 2026.
                    //
                    // A value that already starts with "<" is markup somebody
                    // typed in before the picker existed, so it is left alone.
                    const imageHTML = fox.image
                        ? (String(fox.image).trim().startsWith('<')
                            ? fox.image
                            : `<img src="${escapeAttr(fox.image)}" alt="${escapeAttr(fox.nameEn || 'Fox')}">`)
                        : `<span class="en">[ Photo Placeholder ]</span><span class="mi">[ Pikitia Placeholder ]</span>`;

                    card.innerHTML = `
                        <div class="fox-photo-wrap">
                            <div class="year-badge">${fox.year}</div>
                            <div class="image-placeholder card-image-source">
                                ${imageHTML}
                            </div>
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

        /* The console secret and the fox hunt used to be copy-pasted
           here and into three other page scripts. Four copies of one
           feature is four things to keep in step, and they had already
           drifted - this file ran the hunt on a page with no paw in it.
           Both now live in assets/js/eggs.js, loaded on every page.
           Moved, not copied. */
