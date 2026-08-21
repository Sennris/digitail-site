/* about.html - page script */

/* Attribute-safe, top level, same as foxes.js and index.js. A stored
   media URL is a plain string; a quote in it would close the src early. */
function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
/* Extracted verbatim from the old inline <script> block.
   Shared behaviour is being consolidated into site.js one
   page at a time - see README. */

/**
 * The first sentence of a bio, for the card's text box.
 *
 * ⚠️ TOP LEVEL, not nested in a block. This is a classic script, so a
 * function declared inside an if or a callback only hoists within that
 * block - the same trap the fox photo fix hit in foxes.js.
 *
 * No lookbehind in the regex on purpose. Safari below 16.4 throws a
 * SyntaxError on lookbehind AT PARSE TIME, which would take out the whole
 * file rather than just this line.
 */
function firstLine(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    // At least 20 characters before the full stop, or "Dr." and "e.g."
    // end the sentence and the box shows two words.
    const sentence = clean.match(/^.{20,150}?[.!?](?=\s|$)/);
    if (sentence) return sentence[0];
    return clean.length > 120 ? clean.slice(0, 117).trimEnd() + '\u2026' : clean;
}

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
                    
                    // The sizing used to be an inline style, which beats any
                    // stylesheet - so "the photo is cut off" could not be
                    // fixed in about.css at all. It lives in .player-avatar
                    // img now, where it can be changed like everything else.
                    const avatarHTML = member.avatar 
                        ? '<img src="' + escapeAttr(member.avatar) + '" alt="' + escapeAttr(member.nameEn) + '">'
                        : '<span class="en">[ photo soon ]</span><span class="mi">[ pikitia ā muri ]</span>';
                    
                    // Built in the order it is meant to READ, which is now
                    // also the order it appears: name plate, art, type line,
                    // text box, button. about.css used to shuffle these with
                    // order: properties, which made the page disagree with
                    // what a screen reader announces.
                    const flavourBox = (member.bioEn || member.bioMi)
                        ? '<div class="card-flavour"></div>'
                        : '';

                    card.innerHTML = `
                        <div class="player-number">#${cardNo}</div>
                        <div class="card-front">
                            <h3>
                                <span class="en">${member.nameEn}</span>
                                <span class="mi">${member.nameMi || member.nameEn}</span>
                            </h3>
                            <div class="player-avatar">${avatarHTML}</div>
                            <p>
                                <span class="en">${member.roleEn}</span>
                                <span class="mi">${member.roleMi || member.roleEn}</span>
                            </p>
                            ${flavourBox}
                            <button type="button" class="flip-hint"
                                    aria-haspopup="dialog">
                                <span class="en">read bio</span>
                                <span class="mi">pānui kōrero</span>
                            </button>
                        </div>
                        <div class="card-back" id="bio-${cardNo}">
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
                    // One line off the front of the bio for the text box.
                    // Written with textContent, not into the template, so a
                    // stray < in somebody's bio cannot become markup.
                    const flavourEl = card.querySelector('.card-flavour');
                    if (flavourEl) {
                        flavourEl.textContent = firstLine(member.bioEn || member.bioMi || '');
                    }

                    const bioBtn = card.querySelector('.flip-hint');
                    if (bioBtn) {
                        bioBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            openTeamModal(member);
                        });
                    }

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


/* ------------------------------------------------------------------
   Team bio modal. Same pattern as the devlogs page so the two pages
   behave identically.
   ------------------------------------------------------------------ */
const teamModal = document.getElementById('team-modal');

function openTeamModal(member) {
    if (!teamModal) return;

    teamModal.querySelector('.modal-title .en').innerText = member.nameEn || '';
    teamModal.querySelector('.modal-title .mi').innerText = member.nameMi || member.nameEn || '';

    const role = teamModal.querySelector('.modal-date');
    role.innerHTML = '<span class="en">' + (member.roleEn || '') + '</span>'
                   + '<span class="mi">' + (member.roleMi || member.roleEn || '') + '</span>';

    const avatar = member.avatar
        ? '<div class="modal-avatar"><img src="' + escapeAttr(member.avatar) + '" alt="' + escapeAttr(member.nameEn || '') + '"></div>'
        : '';

    teamModal.querySelector('#team-modal-body').innerHTML =
        avatar
        + '<p><span class="en">' + (member.bioEn || '') + '</span>'
        + '<span class="mi">' + (member.bioMi || member.bioEn || '') + '</span></p>';

    teamModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeTeamModal() {
    if (!teamModal) return;
    teamModal.classList.remove('active');
    document.body.style.overflow = '';
}

if (teamModal) {
    teamModal.querySelector('.modal-close-btn').addEventListener('click', closeTeamModal);
    teamModal.addEventListener('click', (e) => {
        if (e.target === teamModal) closeTeamModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && teamModal.classList.contains('active')) closeTeamModal();
    });
}
