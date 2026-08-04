/* about.html - page script */
/* Extracted verbatim from the old inline <script> block.
   Shared behaviour is being consolidated into site.js one
   page at a time - see README. */

// Language Toggle Logic
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

        // --- FETCH TEAM DATA FROM JSON ---
        const teamGrid = document.getElementById('team-grid');
        fetch('/api/content/team')
            .then(response => {
                if (!response.ok) throw new Error("team.json not found");
                return response.json();
            })
            .then(members => {
                teamGrid.innerHTML = '';
                members.forEach((member, index) => {
                    const card = document.createElement('div');
                    card.className = 'player-card';
                    const cardNo = String(index + 1).padStart(2, '0');
                    
                    const avatarHTML = member.avatar 
                        ? '<img src="' + member.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:4px;">'
                        : '<span class="en">[ photo soon ]</span><span class="mi">[ pikitia ā muri ]</span>';
                    
                    card.innerHTML = `
                        <div class="player-number">#${cardNo}</div>
                        <div class="card-front">
                            <div class="player-avatar">${avatarHTML}</div>
                            <h3>
                                <span class="en">${member.nameEn}</span>
                                <span class="mi">${member.nameMi || member.nameEn}</span>
                            </h3>
                            <p>
                                <span class="en">${member.roleEn}</span>
                                <span class="mi">${member.roleMi || member.roleEn}</span>
                            </p>
                            <span class="flip-hint">
                                <span class="en">click for bio</span>
                                <span class="mi">pāwhiri mō te kōrero</span>
                            </span>
                        </div>
                        <div class="card-back">
                            <div class="stat-row">
                                <span class="stat-label">
                                    <span class="en">Bio</span>
                                    <span class="mi">Kōrero</span>
                                </span>
                                <span class="stat-value">
                                    <span class="en">${member.bioEn || ''}</span>
                                    <span class="mi">${member.bioMi || member.bioEn || ''}</span>
                                </span>
                            </div>
                        </div>
                    `;
                    card.addEventListener('click', () => {
                        card.classList.toggle('flipped');
                    });

                    teamGrid.appendChild(card);
                });
            })
            .catch(error => {
                console.error('Error loading team:', error);
                teamGrid.innerHTML = '<p style="text-align:center; width:100%; grid-column:1/-1;"><span class="en">Team data could not be loaded.</span><span class="mi">Kāore i taea te uta i ngā kōrero rōpū.</span></p>';
            });

                // EASTER EGG 1: The Dev Console Secret
        console.log(
            "%c🦊 You found the fox den!\n\nIf you're reading this, you must be a nerd.\nWe like nerds. Come chat with us in Discord!", 
            "display: block; background: #1D0D12; color: #5DCCCA; font-size: 16px; font-weight: bold; padding: 20px; border-radius: 6px; line-height: 1.5; font-family: monospace;"
        );

        // EASTER EGG 2: The Fox Hunt Engine
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
