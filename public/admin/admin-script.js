// Data Storage
let data = {
    devlogs: [],
    foxes: [],
    team: [],
    game: null,
    social: [],
    links: [],
    homepage: null
};

let currentTab = 'devlogs';
let currentEditId = null;
let selectedTags = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderAllLists();
    setupFileInput();
    initializeForms();
});

// Tab Switching
// Homepage subtabs.
//
// Sections are HIDDEN, never removed - every field stays in the page, so a
// save still picks up all of them no matter which subtab happens to be open.
function switchHomepageSub(name, clickedBtn) {
    const tab = document.getElementById('homepage-tab');
    if (!tab) return;
    tab.setAttribute('data-sub', name);
    tab.querySelectorAll('.subtab').forEach(function (b) { b.classList.remove('active'); });
    if (clickedBtn) clickedBtn.classList.add('active');
    if (name !== 'links') {
        const editor = document.getElementById('link-editor');
        if (editor) editor.style.display = 'none';
    }
}

function switchTab(tabName, clickedBtn) {
    currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    if (clickedBtn) clickedBtn.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Hide all editors
    hideAllEditors();
}

function hideAllEditors() {
    document.getElementById('devlog-editor').style.display = 'none';
    document.getElementById('fox-editor').style.display = 'none';
    document.getElementById('team-editor').style.display = 'none';
    document.getElementById('social-editor').style.display = 'none';
    document.getElementById('link-editor').style.display = 'none';
    // homepage-editor stays visible on its tab — don't hide it
}

// File Upload Handling
//
// The JSON import was removed - the panel reads and writes the live
// database now, so importing an old file could only ever overwrite good
// content with stale content. These are kept as harmless no-ops so
// nothing that still calls them throws.
function setupFileInput() {
    const fileInput = document.getElementById('file-input');
    if (!fileInput) return;
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadJSONFile(file, fileInput.dataset.type);
        }
    });
}

function uploadJSON(type) {
    const fileInput = document.getElementById('file-input');
    if (!fileInput) return;
    fileInput.dataset.type = type;
    fileInput.click();
}

function loadJSONFile(file, type) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const jsonData = JSON.parse(e.target.result);
            if (type === 'homepage') {
                data.homepage = jsonData;
                data.links = jsonData.communityLinks || [];
                renderList('links');
                updateStats('links');
                // Populate homepage editor fields
                populateHomepageForm(jsonData);
            } else if (type === 'game') {
                data.game = jsonData;
                // Populate game form fields directly
                const titleEn = document.getElementById('game-title-en');
                if (titleEn && jsonData) {
                    titleEn.value = jsonData.titleEn || '';
                    document.getElementById('game-title-mi').value = jsonData.titleMi || '';
                    document.getElementById('game-tagline-en').value = jsonData.taglineEn || '';
                    document.getElementById('game-tagline-mi').value = jsonData.taglineMi || '';
                    document.getElementById('game-trailer').value = jsonData.trailerUrl || '';
                }
            } else {
                data[type] = jsonData;
                renderList(type);
                updateStats(type);
            }
            showAlert(`✅ ${capitalizeFirst(type)} loaded successfully!`, 'success');
        } catch (error) {
            showAlert(`❌ Invalid JSON file. Please check the format.`, 'error');
        }
    };
    reader.readAsText(file);
}

// Render Lists
function renderAllLists() {
    renderList('devlogs');
    renderList('foxes');
    renderList('team');
    renderList('social');
    renderList('links');
    updateAllStats();
}

function renderList(type) {
    const listContainer = document.getElementById(`${type}-list`);
    
    if (!data[type] || data[type].length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <p>No items yet</p>
            </div>
        `;
        return;
    }

    const items = [...data[type]];
    if (type === 'devlogs') {
        items.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
    }

    listContainer.innerHTML = items.map(item => {
        let title, subtitle;
        
        switch(type) {
            case 'devlogs':
                title = item.titleEn;
                subtitle = item.displayDate;
                break;
            case 'foxes':
                title = item.nameEn;
                subtitle = `Year: ${item.year}`;
                break;
            case 'team':
                title = item.nameEn;
                subtitle = item.roleEn;
                break;
            case 'social':
                title = item.title;
                subtitle = `${item.platform} - ${item.date}`;
                break;
            case 'links':
                title = (item.emoji || '') + ' ' + item.titleEn;
                subtitle = item.link || 'No link set';
                break;
        }

        return `
            <div class="list-item ${item.id === currentEditId ? 'active' : ''}" 
                 onclick="editItem('${type}', ${item.id})">
                <h3>${title}</h3>
                <p>${subtitle}</p>
            </div>
        `;
    }).join('');
}

// Create New Item
function createNewItem(type) {
    currentEditId = null;
    selectedTags = [];
    showEditor(type);
    populateForm(type, null);
}

// Normalize type names (singular → plural for data keys)
function toDataType(type) {
    const map = { 'devlog': 'devlogs', 'fox': 'foxes', 'link': 'links' };
    return map[type] || type;
}

// Edit Item
function editItem(type, id) {
    const item = data[type].find(i => i.id === id);
    if (!item) return;
    
    currentEditId = id;
    selectedTags = item.tags ? [...item.tags] : [];
    showEditor(type);
    populateForm(type, item);
    renderList(type);
}

// Show Editor
function showEditor(type) {
    hideAllEditors();
    const editorMap = {
        'devlog': 'devlog-editor', 'devlogs': 'devlog-editor',
        'fox': 'fox-editor', 'foxes': 'fox-editor',
        'team': 'team-editor',
        'link': 'link-editor', 'links': 'link-editor',
        'social': 'social-editor'
    };
    const editorId = editorMap[type] || 'social-editor';
    
    document.getElementById(editorId).style.display = 'block';
    document.getElementById(editorId).scrollIntoView({ behavior: 'smooth' });
}

// Initialize Forms
function initializeForms() {
    // Devlog Form
    document.getElementById('devlog-editor').innerHTML = `
        <h2 id="devlog-title">New Devlog</h2>
        <form id="devlog-form" onsubmit="saveItem(event, 'devlogs')">
            <div class="form-group">
                <label>Display Date</label>
                <input type="text" id="devlog-display-date" placeholder="e.g., May 24, 2026 - Robson" required>
            </div>
            <div class="form-group">
                <label>Sort Date</label>
                <input type="date" id="devlog-sort-date" required>
            </div>
            <div class="form-group">
                <label>Tags</label>
                <div class="tag-input-container" id="devlog-tags"></div>
                <select id="devlog-tag-select" onchange="addTag('devlog')">
                    <option value="">+ Add Tag</option>
                    <option value="Code">Code</option>
                    <option value="Bug">Bug</option>
                    <option value="Art">Art</option>
                    <option value="Audio">Audio</option>
                    <option value="News">Studio News</option>
                    <option value="Physics">Physics</option>
                    <option value="Mechanics">Mechanics</option>
                </select>
            </div>
            <div class="form-group">
                <label>Title (English)</label>
                <input type="text" id="devlog-title-en" required>
            </div>
            <div class="form-group">
                <label>Title (Te Reo Māori)</label>
                <input type="text" id="devlog-title-mi" placeholder="Too Add">
            </div>
            <div class="form-group">
                <label>Snippet (English)</label>
                <textarea id="devlog-snippet-en" required></textarea>
            </div>
            <div class="form-group">
                <label>Snippet (Te Reo Māori)</label>
                <textarea id="devlog-snippet-mi" placeholder="Too Add"></textarea>
            </div>
            <div class="form-group">
                <label>Content (English)</label>
                <textarea id="devlog-content-en" style="min-height: 300px;" required></textarea>
                <div class="helper-text">Use &lt;br&gt;&lt;br&gt; for paragraphs, &lt;strong&gt;text&lt;/strong&gt; for bold</div>
            </div>
            <div class="form-group">
                <label>Content (Te Reo Māori)</label>
                <textarea id="devlog-content-mi" style="min-height: 300px;" placeholder="Too Add"></textarea>
            </div>
            <div class="form-group">
                <label>Image URL (Optional)</label>
                <input type="text" id="devlog-image" placeholder="Paste Giphy or image URL">
                <div id="devlog-image-preview"></div>
            </div>
            <div class="button-group">
                <button type="submit" class="btn-rugged">💾 Save</button>
                <button type="button" class="btn-rugged btn-danger" onclick="deleteItem('devlogs')" id="devlog-delete" style="display: none;">🗑️ Delete</button>
                <button type="button" class="btn-rugged" onclick="cancelEdit('devlogs')">✖ Cancel</button>
            </div>
        </form>
    `;

    // Fox Form
    document.getElementById('fox-editor').innerHTML = `
        <h2 id="fox-title">New Fox</h2>
        <form id="fox-form" onsubmit="saveItem(event, 'foxes')">
            <div class="form-group">
                <label>Fox Name (English)</label>
                <input type="text" id="fox-name-en" placeholder="e.g., Frosty" required>
            </div>
            <div class="form-group">
                <label>Fox Name (Te Reo Māori)</label>
                <input type="text" id="fox-name-mi" placeholder="Same or leave as is">
            </div>
            <div class="form-group">
                <label>Year Adopted</label>
                <input type="number" id="fox-year" placeholder="e.g., 2026" required>
            </div>
            <div class="form-group">
                <label>Adoption Package (English)</label>
                <input type="text" id="fox-package-en" placeholder="e.g., Digital Video & Bio" required>
            </div>
            <div class="form-group">
                <label>Adoption Package (Te Reo Māori)</label>
                <input type="text" id="fox-package-mi" placeholder="Translation">
            </div>
            <div class="form-group">
                <label>Short Description (English)</label>
                <textarea id="fox-desc-en" required></textarea>
            </div>
            <div class="form-group">
                <label>Short Description (Te Reo Māori)</label>
                <textarea id="fox-desc-mi"></textarea>
            </div>
            <div class="form-group">
                <label>Full Biography (English)</label>
                <textarea id="fox-bio-en" style="min-height: 300px;" required></textarea>
            </div>
            <div class="form-group">
                <label>Full Biography (Te Reo Māori)</label>
                <textarea id="fox-bio-mi" style="min-height: 300px;"></textarea>
            </div>
            <div class="form-group">
                <label>Image URL (Optional)</label>
                <input type="text" id="fox-image" placeholder="Photo URL">
                <div id="fox-image-preview"></div>
            </div>
            <div class="button-group">
                <button type="submit" class="btn-rugged">💾 Save</button>
                <button type="button" class="btn-rugged btn-danger" onclick="deleteItem('foxes')" id="fox-delete" style="display: none;">🗑️ Delete</button>
                <button type="button" class="btn-rugged" onclick="cancelEdit('foxes')">✖ Cancel</button>
            </div>
        </form>
    `;

    // Team Form
    document.getElementById('team-editor').innerHTML = `
        <h2 id="team-title">New Team Member</h2>
        <form id="team-form" onsubmit="saveItem(event, 'team')">
            <div class="form-group">
                <label>Name (English)</label>
                <input type="text" id="team-name-en" required>
            </div>
            <div class="form-group">
                <label>Name (Te Reo Māori)</label>
                <input type="text" id="team-name-mi">
            </div>
            <div class="form-group">
                <label>Role/Title (English)</label>
                <input type="text" id="team-role-en" placeholder="e.g., Lead Developer" required>
            </div>
            <div class="form-group">
                <label>Role/Title (Te Reo Māori)</label>
                <input type="text" id="team-role-mi">
            </div>
            <div class="form-group">
                <label>Bio (English)</label>
                <textarea id="team-bio-en" style="min-height: 200px;" required></textarea>
            </div>
            <div class="form-group">
                <label>Bio (Te Reo Māori)</label>
                <textarea id="team-bio-mi" style="min-height: 200px;"></textarea>
            </div>
            <div class="form-group">
                <label>Avatar/Photo URL (Optional)</label>
                <input type="text" id="team-avatar" placeholder="Photo URL">
                <div id="team-image-preview"></div>
            </div>
            <div class="button-group">
                <button type="submit" class="btn-rugged">💾 Save</button>
                <button type="button" class="btn-rugged btn-danger" onclick="deleteItem('team')" id="team-delete" style="display: none;">🗑️ Delete</button>
                <button type="button" class="btn-rugged" onclick="cancelEdit('team')">✖ Cancel</button>
            </div>
        </form>
    `;

    // Social Form
    document.getElementById('social-editor').innerHTML = `
        <h2 id="social-form-title">New Social Post</h2>
        <form id="social-form" onsubmit="saveItem(event, 'social')">
            <div class="form-group">
                <label>Platform</label>
                <select id="social-platform" required>
                    <option value="">Select Platform</option>
                    <option value="Instagram">Instagram</option>
                    <option value="YouTube">YouTube</option>
                    <option value="TikTok">TikTok</option>
                    <option value="Twitter">Twitter / X</option>
                    <option value="Discord">Discord</option>
                    <option value="Steam">Steam</option>
                    <option value="Blog">Blog Post</option>
                </select>
            </div>
            <div class="form-group">
                <label>Title/Caption</label>
                <input type="text" id="social-post-title" placeholder="Short description of the post" required>
            </div>
            <div class="form-group">
                <label>Date Posted</label>
                <input type="date" id="social-date" required>
            </div>
            <div class="form-group">
                <label>Post URL</label>
                <input type="url" id="social-url" placeholder="https://instagram.com/..." required>
                <div class="helper-text">Link to the actual post</div>
            </div>
            <div class="form-group">
                <label>Thumbnail/Image URL (Optional)</label>
                <input type="text" id="social-thumbnail" placeholder="Image URL">
                <div id="social-image-preview"></div>
            </div>
            <div class="form-group">
                <label>Description (Optional)</label>
                <textarea id="social-description"></textarea>
            </div>
            <div class="form-group">
                <label>Tags</label>
                <div class="tag-input-container" id="social-tags"></div>
                <select id="social-tag-select" onchange="addTag('social')">
                    <option value="">+ Add Tag</option>
                    <option value="Behind the Scenes">Behind the Scenes</option>
                    <option value="Gameplay">Gameplay</option>
                    <option value="Art">Art</option>
                    <option value="Update">Update</option>
                    <option value="Community">Community</option>
                    <option value="Devlog">Devlog</option>
                    <option value="Announcement">Announcement</option>
                </select>
            </div>
            <div class="button-group">
                <button type="submit" class="btn-rugged">💾 Save</button>
                <button type="button" class="btn-rugged btn-danger" onclick="deleteItem('social')" id="social-delete" style="display: none;">🗑️ Delete</button>
                <button type="button" class="btn-rugged" onclick="cancelEdit('social')">✖ Cancel</button>
            </div>
        </form>
    `;

    // Link Form
    document.getElementById('link-editor').innerHTML = `
        <h2 id="link-title">New Link</h2>
        <form id="link-form" onsubmit="saveItem(event, 'links')">
            <div class="form-group">
                <label>Emoji Icon</label>
                <input type="text" id="link-emoji" placeholder="e.g., 🍜 or 🎮" style="max-width: 100px;">
            </div>
            <div class="form-group">
                <label>Title (English)</label>
                <input type="text" id="link-title-en" placeholder="e.g., Dev Logs" required>
            </div>
            <div class="form-group">
                <label>Title (Te Reo Māori)</label>
                <input type="text" id="link-title-mi" placeholder="e.g., Ngā Rātaka Whakawhanake">
            </div>
            <div class="form-group">
                <label>Description (English)</label>
                <textarea id="link-text-en" required></textarea>
            </div>
            <div class="form-group">
                <label>Description (Te Reo Māori)</label>
                <textarea id="link-text-mi"></textarea>
            </div>
            <div class="form-group">
                <label>Link URL</label>
                <input type="text" id="link-url" placeholder="e.g., devlogs.html or https://...">
                <div class="helper-text">Leave blank for non-clickable cards</div>
            </div>
            <div class="button-group">
                <button type="submit" class="btn-rugged">💾 Save</button>
                <button type="button" class="btn-rugged btn-danger" onclick="deleteItem('links')" id="link-delete" style="display: none;">🗑️ Delete</button>
                <button type="button" class="btn-rugged" onclick="cancelEdit('links')">✖ Cancel</button>
            </div>
        </form>
    `;

        // Homepage Form
    const homepageEditor = document.getElementById('homepage-editor');
    if (homepageEditor) {
        homepageEditor.innerHTML = `
            <h2>Homepage Settings</h2>
            <form id="homepage-form" onsubmit="saveHomepageInfo(event)">
                <div class="hp-sec" data-sec="hero">
                <h3 style="color: var(--frozen-juniper); font-family: var(--font-mono); margin-top: 0;">Hero Section</h3>
                <div class="form-group">
                    <label>Site Title</label>
                    <input type="text" id="hp-hero-title" placeholder="Digi Tail Studios">
                </div>
                <div class="form-group">
                    <label>Tagline (English)</label>
                    <input type="text" id="hp-hero-tagline-en" placeholder="// Indie Game Development from Aotearoa">
                </div>
                <div class="form-group">
                    <label>Tagline (Te Reo Māori)</label>
                    <input type="text" id="hp-hero-tagline-mi" placeholder="// Whanaketanga Kēmu Motuhake mai i Aotearoa">
                </div>

                </div>

                <div class="hp-sec" data-sec="announce">
                <h3 style="color: var(--frozen-juniper); font-family: var(--font-mono);">Announcement Banner</h3>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="hp-announce-enabled" style="width: auto; margin-right: 0.5rem;">
                        Enable Announcement
                    </label>
                </div>
                <div class="form-group">
                    <label>Announcement Text</label>
                    <input type="text" id="hp-announce-text" placeholder="e.g., Paper Crown demo now available!">
                </div>
                <div class="form-group">
                    <label>Banner Image URL</label>
                    <input type="text" id="hp-announce-image" placeholder="Full-width banner image URL">
                    <div id="hp-announce-image-preview"></div>
                    <div class="helper-text">Full-width image banner. Text overlay is optional — leave text blank for image-only.</div>
                </div>
                <div class="form-group">
                    <label>Announcement Link (Optional)</label>
                    <input type="text" id="hp-announce-link" placeholder="https://...">
                </div>
                <div class="form-group">
                    <label>Announcement Style (text-only fallback)</label>
                    <select id="hp-announce-style">
                        <option value="info">Info (Teal)</option>
                        <option value="warning">Warning (Gold)</option>
                        <option value="alert">Alert (Red)</option>
                    </select>
                </div>

                </div>

                <div class="hp-sec" data-sec="mascot">
                <h3 style="color: var(--frozen-juniper); font-family: var(--font-mono);">Mascot Settings</h3>
                <div class="form-group">
                    <label>Current Mascot</label>
                    <select id="hp-mascot-current">
                        <option value="default">Default Arctic Fox</option>
                        <option value="halloween">Spooky Fox (Halloween)</option>
                        <option value="christmas">Holiday Fox (Christmas)</option>
                        <option value="newyear">Party Fox (New Year)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="hp-mascot-auto" style="width: auto; margin-right: 0.5rem;" checked>
                        Auto-switch mascot by date
                    </label>
                    <div class="helper-text">When enabled, mascot changes automatically based on calendar dates</div>
                </div>

                <div class="form-group">
                    <label>Default Mascot Image URL</label>
                    <input type="text" id="hp-mascot-default-img" placeholder="Image URL for default mascot">
                    <div id="hp-mascot-default-preview"></div>
                </div>
                <div class="form-group">
                    <label>Halloween Mascot Image URL</label>
                    <input type="text" id="hp-mascot-halloween-img" placeholder="Spooky fox image (Oct 1-31)">
                </div>
                <div class="form-group">
                    <label>Christmas Mascot Image URL</label>
                    <input type="text" id="hp-mascot-christmas-img" placeholder="Holiday fox image (Dec 1-31)">
                </div>
                <div class="form-group">
                    <label>New Year Mascot Image URL</label>
                    <input type="text" id="hp-mascot-newyear-img" placeholder="Party fox image (Dec 31 - Jan 7)">
                </div>

                </div>

                <div class="button-group">
                    <button type="submit" class="btn-rugged">💾 Save Homepage Settings</button>
                    <span class="save-hint">Saved as a draft. Press \ud83d\udcbe Save to site at the top of the page to publish it.</span>
                </div>
            </form>
        `;
    }

        // Game Form
    document.getElementById('game-editor').innerHTML = `
        <h2>Game Information</h2>
        <form id="game-form" onsubmit="saveGameInfo(event)">
            <div class="form-group">
                <label>Game Title (English)</label>
                <input type="text" id="game-title-en" placeholder="Project Name" required>
            </div>
            <div class="form-group">
                <label>Game Title (Te Reo Māori)</label>
                <input type="text" id="game-title-mi">
            </div>
            <div class="form-group">
                <label>Tagline (English)</label>
                <input type="text" id="game-tagline-en" required>
            </div>
            <div class="form-group">
                <label>Tagline (Te Reo Māori)</label>
                <input type="text" id="game-tagline-mi">
            </div>
            <div class="form-group">
                <label>Trailer URL (YouTube embed URL)</label>
                <input type="text" id="game-trailer" placeholder="https://www.youtube.com/embed/...">
                <div class="helper-text">Leave blank to show placeholder</div>
            </div>
            <div class="button-group">
                <button type="submit" class="btn-rugged">💾 Save Game Info</button>
                    <span class="save-hint">Saved as a draft. Press \ud83d\udcbe Save to site at the top of the page to publish it.</span>
            </div>
        </form>
    `;

    // Setup image previews
    setupImagePreviews();
}

// Image Preview Setup
function setupImagePreviews() {
    const imageInputs = {
        'devlog-image': 'devlog-image-preview',
        'fox-image': 'fox-image-preview',
        'team-avatar': 'team-image-preview',
        'social-thumbnail': 'social-image-preview',
        'hp-announce-image': 'hp-announce-image-preview',
        'hp-mascot-default-img': 'hp-mascot-default-preview'
    };

    Object.entries(imageInputs).forEach(([inputId, previewId]) => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', (e) => {
                const url = e.target.value.trim();
                const preview = document.getElementById(previewId);
                if (url) {
                    preview.innerHTML = `<img src="${url}" class="image-preview" alt="" onerror="this.style.display='none'">`;
                } else {
                    preview.innerHTML = '';
                }
            });
        }
    });
}

// Populate Form
function populateForm(type, item) {
    // Normalize singular to plural
    const pluralMap = { 'devlog': 'devlogs', 'fox': 'foxes', 'link': 'links' };
    type = pluralMap[type] || type;
    
    if (type === 'devlogs') {
        if (item) {
            document.getElementById('devlog-title').textContent = 'Edit Devlog';
            document.getElementById('devlog-delete').style.display = 'inline-flex';
            document.getElementById('devlog-display-date').value = item.displayDate;
            const formattedDate = `${item.sortDate.slice(0,4)}-${item.sortDate.slice(4,6)}-${item.sortDate.slice(6,8)}`;
            document.getElementById('devlog-sort-date').value = formattedDate;
            document.getElementById('devlog-title-en').value = item.titleEn;
            document.getElementById('devlog-title-mi').value = item.titleMi;
            document.getElementById('devlog-snippet-en').value = item.snippetEn;
            document.getElementById('devlog-snippet-mi').value = item.snippetMi;
            document.getElementById('devlog-content-en').value = item.contentEn;
            document.getElementById('devlog-content-mi').value = item.contentMi;
            if (item.image) {
                const match = item.image.match(/src='([^']+)'/);
                if (match) {
                    document.getElementById('devlog-image').value = match[1];
                    document.getElementById('devlog-image-preview').innerHTML = `<img src="${match[1]}" class="image-preview" alt="">`;
                }
            }
        } else {
            document.getElementById('devlog-title').textContent = 'New Devlog';
            document.getElementById('devlog-delete').style.display = 'none';
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('devlog-sort-date').value = today;
            document.getElementById('devlog-display-date').value = '';
            document.getElementById('devlog-title-en').value = '';
            document.getElementById('devlog-title-mi').value = '';
            document.getElementById('devlog-snippet-en').value = '';
            document.getElementById('devlog-snippet-mi').value = '';
            document.getElementById('devlog-content-en').value = '';
            document.getElementById('devlog-content-mi').value = '';
            document.getElementById('devlog-image').value = '';
            document.getElementById('devlog-image-preview').innerHTML = '';
            selectedTags = [];
        }
        renderTags('devlog');
    }
    else if (type === 'foxes') {
        if (item) {
            document.getElementById('fox-title').textContent = 'Edit Fox';
            document.getElementById('fox-delete').style.display = 'inline-flex';
            document.getElementById('fox-name-en').value = item.nameEn;
            document.getElementById('fox-name-mi').value = item.nameMi;
            document.getElementById('fox-year').value = item.year;
            document.getElementById('fox-package-en').value = item.packageEn;
            document.getElementById('fox-package-mi').value = item.packageMi;
            document.getElementById('fox-desc-en').value = item.descEn;
            document.getElementById('fox-desc-mi').value = item.descMi;
            document.getElementById('fox-bio-en').value = item.bioEn;
            document.getElementById('fox-bio-mi').value = item.bioMi;
            if (item.image) {
                document.getElementById('fox-image').value = item.image;
                document.getElementById('fox-image-preview').innerHTML = `<img src="${item.image}" class="image-preview" alt="">`;
            }
        } else {
            document.getElementById('fox-title').textContent = 'New Fox';
            document.getElementById('fox-delete').style.display = 'none';
            document.getElementById('fox-name-en').value = '';
            document.getElementById('fox-name-mi').value = '';
            document.getElementById('fox-year').value = '';
            document.getElementById('fox-package-en').value = '';
            document.getElementById('fox-package-mi').value = '';
            document.getElementById('fox-desc-en').value = '';
            document.getElementById('fox-desc-mi').value = '';
            document.getElementById('fox-bio-en').value = '';
            document.getElementById('fox-bio-mi').value = '';
            document.getElementById('fox-image').value = '';
            document.getElementById('fox-image-preview').innerHTML = '';
        }
    }
    else if (type === 'team') {
        if (item) {
            document.getElementById('team-title').textContent = 'Edit Team Member';
            document.getElementById('team-delete').style.display = 'inline-flex';
            document.getElementById('team-name-en').value = item.nameEn;
            document.getElementById('team-name-mi').value = item.nameMi;
            document.getElementById('team-role-en').value = item.roleEn;
            document.getElementById('team-role-mi').value = item.roleMi;
            document.getElementById('team-bio-en').value = item.bioEn;
            document.getElementById('team-bio-mi').value = item.bioMi;
            if (item.avatar) {
                document.getElementById('team-avatar').value = item.avatar;
                document.getElementById('team-image-preview').innerHTML = `<img src="${item.avatar}" class="image-preview" alt="">`;
            }
        } else {
            document.getElementById('team-title').textContent = 'New Team Member';
            document.getElementById('team-delete').style.display = 'none';
            document.getElementById('team-name-en').value = '';
            document.getElementById('team-name-mi').value = '';
            document.getElementById('team-role-en').value = '';
            document.getElementById('team-role-mi').value = '';
            document.getElementById('team-bio-en').value = '';
            document.getElementById('team-bio-mi').value = '';
            document.getElementById('team-avatar').value = '';
            document.getElementById('team-image-preview').innerHTML = '';
        }
    }
    else if (type === 'links') {
        if (item) {
            document.getElementById('link-title').textContent = 'Edit Link';
            document.getElementById('link-delete').style.display = 'inline-flex';
            document.getElementById('link-emoji').value = item.emoji || '';
            document.getElementById('link-title-en').value = item.titleEn || '';
            document.getElementById('link-title-mi').value = item.titleMi || '';
            document.getElementById('link-text-en').value = item.textEn || '';
            document.getElementById('link-text-mi').value = item.textMi || '';
            document.getElementById('link-url').value = item.link || '';
        } else {
            document.getElementById('link-title').textContent = 'New Link';
            document.getElementById('link-delete').style.display = 'none';
            document.getElementById('link-emoji').value = '';
            document.getElementById('link-title-en').value = '';
            document.getElementById('link-title-mi').value = '';
            document.getElementById('link-text-en').value = '';
            document.getElementById('link-text-mi').value = '';
            document.getElementById('link-url').value = '';
        }
    }
    else if (type === 'social') {
        if (item) {
            document.getElementById('social-form-title').textContent = 'Edit Social Post';
            document.getElementById('social-delete').style.display = 'inline-flex';
            document.getElementById('social-platform').value = item.platform;
            document.getElementById('social-post-title').value = item.title;
            document.getElementById('social-date').value = item.date;
            document.getElementById('social-url').value = item.url;
            document.getElementById('social-thumbnail').value = item.thumbnail || '';
            document.getElementById('social-description').value = item.description || '';
            if (item.thumbnail) {
                document.getElementById('social-image-preview').innerHTML = `<img src="${item.thumbnail}" class="image-preview" alt="">`;
            }
            selectedTags = item.tags ? [...item.tags] : [];
        } else {
            document.getElementById('social-form-title').textContent = 'New Social Post';
            document.getElementById('social-delete').style.display = 'none';
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('social-date').value = today;
            document.getElementById('social-platform').value = '';
            document.getElementById('social-post-title').value = '';
            document.getElementById('social-url').value = '';
            document.getElementById('social-thumbnail').value = '';
            document.getElementById('social-description').value = '';
            document.getElementById('social-image-preview').innerHTML = '';
            selectedTags = [];
        }
        renderTags('social');
    }
}

// Populate Homepage Form
function populateHomepageForm(hp) {
    const heroTitle = document.getElementById('hp-hero-title');
    if (!heroTitle) return; // form not initialized yet
    
    if (hp.hero) {
        heroTitle.value = hp.hero.titleEn || '';
        document.getElementById('hp-hero-tagline-en').value = hp.hero.taglineEn || '';
        document.getElementById('hp-hero-tagline-mi').value = hp.hero.taglineMi || '';
    }
    if (hp.announcement) {
        document.getElementById('hp-announce-enabled').checked = hp.announcement.enabled || false;
        document.getElementById('hp-announce-image').value = hp.announcement.image || '';
        document.getElementById('hp-announce-text').value = hp.announcement.text || '';
        document.getElementById('hp-announce-link').value = hp.announcement.link || '';
        document.getElementById('hp-announce-style').value = hp.announcement.style || 'info';
        if (hp.announcement.image) {
            document.getElementById('hp-announce-image-preview').innerHTML = '<img src="' + hp.announcement.image + '" class="image-preview" alt="" style="max-width:100%;">';
        }
    }
    if (hp.mascot) {
        document.getElementById('hp-mascot-current').value = hp.mascot.current || 'default';
        document.getElementById('hp-mascot-auto').checked = hp.mascot.autoSwitch !== false;
        
        // Populate mascot image URLs
        if (hp.mascot.versions) {
            ['default', 'halloween', 'christmas', 'newyear'].forEach(key => {
                const imgInput = document.getElementById('hp-mascot-' + key + '-img');
                if (imgInput && hp.mascot.versions[key]) {
                    imgInput.value = hp.mascot.versions[key].image || '';
                }
            });
            // Preview default mascot
            if (hp.mascot.versions.default && hp.mascot.versions.default.image) {
                document.getElementById('hp-mascot-default-preview').innerHTML = '<img src="' + hp.mascot.versions.default.image + '" class="image-preview" alt="" style="max-height:120px;">';
            }
        }
    }
}

// Tag Management
function addTag(type) {
    const select = document.getElementById(`${type}-tag-select`);
    const tag = select.value;
    
    if (tag && !selectedTags.includes(tag)) {
        selectedTags.push(tag);
        renderTags(type);
    }
    
    select.value = '';
}

function removeTag(tag, type) {
    selectedTags = selectedTags.filter(t => t !== tag);
    renderTags(type);
}

function renderTags(type) {
    const container = document.getElementById(`${type}-tags`);
    container.innerHTML = selectedTags.map(tag => `
        <span class="tag-badge">
            ${tag}
            <button type="button" onclick="removeTag('${tag}', '${type}')">&times;</button>
        </span>
    `).join('');
}

// Save Item
function saveItem(event, type) {
    event.preventDefault();
    
    // Normalize singular to plural
    const pluralMap = { 'devlog': 'devlogs', 'fox': 'foxes', 'link': 'links' };
    type = pluralMap[type] || type;
    
    let itemData = {};
    
    if (type === 'devlogs') {
        const sortDateInput = document.getElementById('devlog-sort-date').value;
        const sortDate = sortDateInput.replace(/-/g, '');
        const imageUrl = document.getElementById('devlog-image').value.trim();
        const image = imageUrl ? `<img src='${imageUrl}' style='width: 100%; height: 100%; object-fit: cover; border-radius: 2px;'>` : '';
        
        itemData = {
            sortDate,
            displayDate: document.getElementById('devlog-display-date').value,
            tags: selectedTags,
            titleEn: document.getElementById('devlog-title-en').value,
            titleMi: document.getElementById('devlog-title-mi').value || 'Too Add',
            snippetEn: document.getElementById('devlog-snippet-en').value,
            snippetMi: document.getElementById('devlog-snippet-mi').value || 'Too Add',
            contentEn: document.getElementById('devlog-content-en').value,
            contentMi: document.getElementById('devlog-content-mi').value || 'Too Add',
            image
        };
    }
    else if (type === 'foxes') {
        itemData = {
            nameEn: document.getElementById('fox-name-en').value,
            nameMi: document.getElementById('fox-name-mi').value,
            year: parseInt(document.getElementById('fox-year').value),
            packageEn: document.getElementById('fox-package-en').value,
            packageMi: document.getElementById('fox-package-mi').value,
            descEn: document.getElementById('fox-desc-en').value,
            descMi: document.getElementById('fox-desc-mi').value,
            bioEn: document.getElementById('fox-bio-en').value,
            bioMi: document.getElementById('fox-bio-mi').value,
            image: document.getElementById('fox-image').value.trim()
        };
    }
    else if (type === 'team') {
        itemData = {
            nameEn: document.getElementById('team-name-en').value,
            nameMi: document.getElementById('team-name-mi').value,
            roleEn: document.getElementById('team-role-en').value,
            roleMi: document.getElementById('team-role-mi').value,
            bioEn: document.getElementById('team-bio-en').value,
            bioMi: document.getElementById('team-bio-mi').value,
            avatar: document.getElementById('team-avatar').value.trim()
        };
    }
    else if (type === 'social') {
        itemData = {
            platform: document.getElementById('social-platform').value,
            title: document.getElementById('social-post-title').value,
            date: document.getElementById('social-date').value,
            url: document.getElementById('social-url').value,
            thumbnail: document.getElementById('social-thumbnail').value.trim(),
            description: document.getElementById('social-description').value,
            tags: [...selectedTags]
        };
    }
    else if (type === 'links') {
        itemData = {
            emoji: document.getElementById('link-emoji').value,
            titleEn: document.getElementById('link-title-en').value,
            titleMi: document.getElementById('link-title-mi').value,
            textEn: document.getElementById('link-text-en').value,
            textMi: document.getElementById('link-text-mi').value,
            link: document.getElementById('link-url').value.trim()
        };
    }
    
    if (currentEditId === null) {
        const maxId = data[type].length > 0 ? Math.max(...data[type].map(d => d.id)) : 0;
        itemData.id = maxId + 1;
        data[type].push(itemData);
        showAlert(`✅ ${capitalizeFirst(type.slice(0, -1))} created!`, 'success');
    } else {
        const index = data[type].findIndex(d => d.id === currentEditId);
        itemData.id = currentEditId;
        data[type][index] = itemData;
        showAlert(`✅ ${capitalizeFirst(type.slice(0, -1))} updated!`, 'success');
    }
    
    renderList(type);
    updateStats(type);
    cancelEdit(type);
}

// Save Game Info
function collectGameInfo() {
    if (!document.getElementById('game-title-en')) return false;

    data.game = {
        titleEn: document.getElementById('game-title-en').value,
        titleMi: document.getElementById('game-title-mi').value,
        taglineEn: document.getElementById('game-tagline-en').value,
        taglineMi: document.getElementById('game-tagline-mi').value,
        trailerUrl: document.getElementById('game-trailer').value.trim()
    };

    return true;
}

function saveGameInfo(event) {
    if (event) event.preventDefault();
    collectGameInfo();
    showAlert('✅ Game info updated. Press 💾 Save to site to publish it.', 'success');
}

// Save Homepage Info
//
// Split in two on purpose. collectHomepageInfo() reads the form into the
// working copy and is ALSO called by "Save to site", so a change can never
// be left behind in a form you did not press the button under. That was
// the announcement banner bug: unticking Enabled, then pressing Save to
// site, published the old ticked value.
function collectHomepageInfo() {
    if (!document.getElementById('hp-announce-enabled')) return false;

    if (!data.homepage) data.homepage = {};
    
    data.homepage.hero = {
        titleEn: document.getElementById('hp-hero-title').value || 'Digi Tail Studios',
        titleMi: document.getElementById('hp-hero-title').value || 'Digi Tail Studios',
        taglineEn: document.getElementById('hp-hero-tagline-en').value,
        taglineMi: document.getElementById('hp-hero-tagline-mi').value
    };
    
    data.homepage.announcement = {
        enabled: document.getElementById('hp-announce-enabled').checked,
        image: document.getElementById('hp-announce-image').value.trim(),
        text: document.getElementById('hp-announce-text').value,
        link: document.getElementById('hp-announce-link').value,
        style: document.getElementById('hp-announce-style').value
    };
    
    if (!data.homepage.mascot) {
        data.homepage.mascot = { current: 'default', autoSwitch: true, versions: {} };
    }
    data.homepage.mascot.current = document.getElementById('hp-mascot-current').value;
    data.homepage.mascot.autoSwitch = document.getElementById('hp-mascot-auto').checked;
    
    // Save mascot images into versions
    const versions = data.homepage.mascot.versions || {};
    ['default', 'halloween', 'christmas', 'newyear'].forEach(key => {
        if (!versions[key]) versions[key] = {};
        const imgInput = document.getElementById('hp-mascot-' + key + '-img');
        if (imgInput) versions[key].image = imgInput.value.trim();
    });
    data.homepage.mascot.versions = versions;

    return true;
}

function saveHomepageInfo(event) {
    if (event) event.preventDefault();
    collectHomepageInfo();
    showAlert('✅ Homepage settings updated. Press 💾 Save to site to publish them.', 'success');
}

// Delete Item
function deleteItem(type) {
    if (!currentEditId) return;
    
    // Normalize singular to plural
    const pluralMap = { 'devlog': 'devlogs', 'fox': 'foxes', 'link': 'links' };
    type = pluralMap[type] || type;
    
    if (confirm('Are you sure you want to delete this? This cannot be undone.')) {
        data[type] = data[type].filter(d => d.id !== currentEditId);
        renderList(type);
        updateStats(type);
        cancelEdit(type);
        showAlert('🗑️ Item deleted', 'success');
    }
}

// Cancel Edit
function cancelEdit(type) {
    hideAllEditors();
    currentEditId = null;
    selectedTags = [];
    const pluralMap = { 'devlog': 'devlogs', 'fox': 'foxes', 'link': 'links' };
    type = pluralMap[type] || type;
    renderList(type);
}

// Update Stats
function updateAllStats() {
    updateStats('devlogs');
    updateStats('foxes');
    updateStats('team');
    updateStats('social');
    updateStats('links');
}

function updateStats(type) {
    if (type === 'devlogs') {
        document.getElementById('devlog-total').textContent = data.devlogs.length;
        const now = new Date();
        const thisMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const thisMonthCount = data.devlogs.filter(d => d.sortDate.startsWith(thisMonth)).length;
        document.getElementById('devlog-month').textContent = thisMonthCount;
    }
    else if (type === 'foxes') {
        document.getElementById('fox-total').textContent = data.foxes.length;
    }
    else if (type === 'team') {
        document.getElementById('team-total').textContent = data.team.length;
    }
    else if (type === 'social') {
        document.getElementById('social-total').textContent = data.social.length;
        const instagram = data.social.filter(p => p.platform === 'Instagram').length;
        const youtube = data.social.filter(p => p.platform === 'YouTube').length;
        document.getElementById('social-instagram').textContent = instagram;
        document.getElementById('social-youtube').textContent = youtube;
    }
    else if (type === 'links') {
        document.getElementById('links-total').textContent = data.links.length;
    }
}

// Download JSON
function downloadAllJSON() {
    ['devlogs', 'foxes', 'team', 'social'].forEach(type => {
        if (data[type].length > 0) {
            downloadJSON(type);
        }
    });
    
    if (data.game) {
        downloadJSON('game');
    }
    
    // Save homepage.json (settings + links)
    if (data.links.length > 0 || data.homepage) {
        const homepageData = data.homepage || {};
        homepageData.communityLinks = data.links;
        const json = JSON.stringify(homepageData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'homepage.json';
        a.click();
        URL.revokeObjectURL(url);
    }
    
    showAlert('💾 All JSON files downloaded!', 'success');
}

function downloadJSON(type) {
    const json = JSON.stringify(data[type], null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Alert System
function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Utilities
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
