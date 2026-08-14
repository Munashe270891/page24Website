// SECURITY FIX: global helpers and safe escaping moved to top-level so all functions can use them
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

// SECURITY FIX: safe HTML escape available globally (used by loadNotifications and others)
function escapeHtml(text) {
    if (text === undefined || text === null) return '';
    return String(text)
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#039;');
}

// SECURITY FIX: helper to check fetch responses and parse JSON with error handling
async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    let body = null;
    if (contentType.includes('application/json')) {
        body = await res.json();
    } else {
        body = await res.text();
    }
    if (!res.ok) {
        const errMsg = (body && body.error)? body.error : (typeof body === 'string'? body : res.statusText);
        const e = new Error(errMsg || `HTTP ${res.status}`);
        e.response = body;
        throw e;
    }
    return body;
}

// SECURITY FIX: modal utilities - single set used by JS and safe for inline HTML onclicks
function openModal(el) {
    if (!el) return;
    el.classList.add('is-open');
    document.body.classList.add('modal-open');
}
function closeModal(el) {
    if (!el) return;
    el.classList.remove('is-open');
    // remove modal-open if no more modals open
    if (!document.querySelector('.modal.is-open')) {
        document.body.classList.remove('modal-open');
    }
}
function closeAllModals() {
    $$('.modal.is-open').forEach(m => closeModal(m));
}
// Close modals on ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllModals();
        // also close notif dropdowns
        const nd = $('#notif-dropdown');
        if (nd && nd.classList.contains('is-open')) nd.classList.remove('is-open');
    }
});
// Close modals / dropdowns on outside click
document.addEventListener('click', (e) => {
    // notif dropdown
    const dropdown = $('#notif-dropdown');
    const bellBtn = $('#notif-bell-btn');
    if (dropdown && dropdown.classList.contains('is-open') &&!dropdown.contains(e.target) &&!(bellBtn && bellBtn.contains(e.target))) {
        dropdown.classList.remove('is-open'); // SECURITY FIX: use class is-open
    }

    // modals - if click is outside.modal-content close the modal
    $$('.modal.is-open').forEach(modal => {
        const content = modal.querySelector('.modal-content');
        if (content &&!content.contains(e.target) &&!e.target.closest('.modal-trigger')) {
            closeModal(modal);
        }
    });
});

// Expose a single dropdown toggle that uses is-open
window.toggleNotifDropdown = function() {
    const dd = $('#notif-dropdown');
    if (dd) dd.classList.toggle('is-open'); // SECURITY FIX: use class is-open
};

// Expose withdraw modal opener for any inline HTML calls (single implementation)
window.openWithdrawModal = function() {
    const modal = $('#withdraw-modal');
    if (modal) openModal(modal);
};
window.closeWithdrawModal = function() {
    const modal = $('#withdraw-modal');
    if (modal) closeModal(modal);
};

// Main app logic
document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // 1. NAVIGATION & VIEW SWITCHING LOGIC
    // -------------------------------------------------------------
    const navItems = {
        'dashboard-view': $('#menu-dash'),
        'creator-view': $('#menu-create'),
        'studio-view': $('#menu-studio'),
        'sales-view': $('#menu-sales'),
        'profile-view': $('#menu-profile')
    };

    window.switchTab = function(targetTabId, evt) {
        if (evt) evt.preventDefault();

        // Hide all views & deactivate menu items
        $$('.view-section').forEach(view => view.classList.add('hidden'));
        $$('.side-menu.menu-item').forEach(item => item.classList.remove('active'));

        // Show target view
        const targetView = document.getElementById(targetTabId);
        if (targetView) targetView.classList.remove('hidden');

        // Activate menu button
        if (navItems[targetTabId]) {
            navItems[targetTabId].classList.add('active');
        }

        // Trigger view-specific data reloads
        if (targetTabId === 'dashboard-view') loadDashboardBooks();
        if (targetTabId === 'studio-view') loadStudioWebBooks();
        if (targetTabId === 'sales-view') loadSalesAnalytics();
        if (targetTabId === 'profile-view') loadAuthorProfile();
    };

    const quickCreateTrigger = $('#quick-create-trigger');
    if (quickCreateTrigger) {
        quickCreateTrigger.addEventListener('click', (e) => switchTab('creator-view', e));
    }

    // -------------------------------------------------------------
    // 2. PUBLISH FORMAT SWITCH & CATEGORY DEPENDENCIES
    // -------------------------------------------------------------
    const modeRadios = $$('input[name="upload-mode"]');
    const pdfGroup = $('#pdf-input-group');
    const htmlGroup = $('#html-input-group');
    const ruleSelect = $('#book-download-rule');

    function handleFormatChange(selectedMode) {
        if (selectedMode === 'pdf') {
            if (pdfGroup) pdfGroup.classList.remove('hidden');
            if (htmlGroup) htmlGroup.classList.add('hidden');
            if (ruleSelect && ruleSelect.options[1]) {
                ruleSelect.options[1].disabled = false;
            }
        } else {
            if (pdfGroup) pdfGroup.classList.add('hidden');
            if (htmlGroup) htmlGroup.classList.remove('hidden');
            if (ruleSelect) {
                ruleSelect.value = "0";
                if (ruleSelect.options[1]) {
                    ruleSelect.options[1].disabled = true;
                }
            }
        }
    }

    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => handleFormatChange(e.target.value));
    });

    const checkedRadio = document.querySelector('input[name="upload-mode"]:checked');
    if (checkedRadio) handleFormatChange(checkedRadio.value);

    const categorySelect = $('#book-category');
    const subThemeGroup = $('#sub-theme-group');

    if (categorySelect && subThemeGroup) {
        categorySelect.addEventListener('change', (e) => {
            subThemeGroup.style.display = (e.target.value === 'Shona Novels')? 'block' : 'none';
        });
    }

    // -------------------------------------------------------------
    // 3. FETCH CURRENT USER & INITIALIZE DASHBOARD
    // -------------------------------------------------------------
    (async () => {
        try {
            const data = await fetchJson('/api/auth/me');
            if (data.loggedIn && data.user) {
                const displayName = data.user.name || data.user.username || '';
                const welcomeTag = document.querySelector('.welcome-tag');
                if (welcomeTag) welcomeTag.textContent = `Welcome 👤 ${displayName}`;

                const authorNameInput = $('#book-author-name');
                if (authorNameInput &&!authorNameInput.value) {
                    authorNameInput.value = displayName;
                }
            }
        } catch (err) {
            console.error("Failed to load user info:", err);
        }
    })();

    loadDashboardBooks();
    loadNotifications();

    // -------------------------------------------------------------
    // 4. LOAD AUTHOR'S BOOKS (MY BOOKS DASHBOARD)
    // -------------------------------------------------------------
    async function loadDashboardBooks() {
        const booksContainer = $('#author-books-container');
        if (!booksContainer) return;

        booksContainer.innerHTML = ''; // clear immediately
        try {
            const books = await fetchJson('/api/books/my-books');

            if (!books || books.length === 0) {
                const p = document.createElement('p');
                p.style.color = 'var(--text-dark, #222)';
                p.style.opacity = '0.6';
                p.style.width = '100%';
                p.textContent = 'You have not published any books yet.';
                booksContainer.appendChild(p);
                return;
            }

            books.forEach(book => {
                // Create safe DOM nodes instead of innerHTML (SECURITY FIX)
                const card = document.createElement('div');
                card.className = 'author-book-card';

                const rawPrice = parseFloat(book.price) || 0;
                const coverSrc = book.coverImage || book.cover_image || '/images/default-cover.png';

                const img = document.createElement('img');
                img.className = 'cover-thumb';
                img.src = coverSrc;
                img.alt = (book.title? String(book.title) : 'book cover');
                img.onerror = function () { this.src = '/images/default-cover.png'; };

                const meta = document.createElement('div');
                meta.className = 'book-meta';

                const h3 = document.createElement('h3');
                h3.textContent = book.title? String(book.title) : 'Untitled';

                const descP = document.createElement('p');
                if (book.description) {
                    const short = String(book.description).substring(0, 80);
                    descP.textContent = short + (String(book.description).length > 80? '...' : '');
                } else {
                    descP.textContent = '';
                }

                const priceP = document.createElement('p');
                priceP.innerHTML = `<strong>Price:</strong> `;
                const priceSpan = document.createElement('span');
                priceSpan.style.color = 'var(--primary-green-light, #27ae60)';
                priceSpan.textContent = `$${rawPrice.toFixed(2)} USD`;
                priceP.appendChild(priceSpan);

                const statusP = document.createElement('p');
                const badge = document.createElement('span');
                badge.className = 'badge ' + (book.status === 'Draft'? 'status-draft' : 'status-pub');
                badge.textContent = (book.mode? String(book.mode).toUpperCase() : 'PDF');
                statusP.appendChild(badge);

                const actionsDiv = document.createElement('div');
                actionsDiv.style.display = 'flex';
                actionsDiv.style.gap = '8px';
                actionsDiv.style.marginTop = '10px';

                const editBtn = document.createElement('button');
                editBtn.className = 'btn-edit-book';
                editBtn.style.cssText = 'background: var(--primary-green, #1b3d2b); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;';
                editBtn.textContent = 'Edit';
                editBtn.addEventListener('click', () => openEditModal(book.id, book.description || '', rawPrice));

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-delete-book';
                deleteBtn.style.cssText = 'background: var(--danger-red, #dc3545); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;';
                deleteBtn.textContent = 'Delete';
                deleteBtn.addEventListener('click', () => deleteBook(book.id));

                actionsDiv.appendChild(editBtn);
                actionsDiv.appendChild(deleteBtn);

                meta.appendChild(h3);
                meta.appendChild(descP);
                meta.appendChild(priceP);
                meta.appendChild(statusP);
                meta.appendChild(actionsDiv);

                card.appendChild(img);
                card.appendChild(meta);

                booksContainer.appendChild(card);
            });
        } catch (err) {
            console.error("Failed to fetch author books:", err);
            const p = document.createElement('p');
            p.style.color = 'var(--text-danger, #dc3545)';
            p.textContent = 'Unable to load your books right now.';
            booksContainer.appendChild(p);
        }
    }
    window.loadDashboardBooks = loadDashboardBooks; // keep name exported

    // -------------------------------------------------------------
    // 5. CREATE / PUBLISH BOOK FORM SUBMISSION with validation
    // -------------------------------------------------------------
    const publishForm = $('#publish-master-form');
    if (publishForm) {
        publishForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Gather inputs safely
            const authorNameInput = $('#book-author-name');
            const categorySelectEl = $('#book-category');
            const subThemeSelect = $('#book-sub-theme');
            const titleInput = $('#book-title');
            const priceInput = $('#book-price');
            const descInput = $('#book-description');

            const selectedRadio = document.querySelector('input[name="upload-mode"]:checked');
            const mode = selectedRadio? selectedRadio.value : 'pdf';

            const downloadRuleEl = $('#book-download-rule');

            // SECURITY FIX: Validation rules
            const title = titleInput? titleInput.value.trim() : '';
            if (!title || title.length < 3) {
                alert('⚠️ Title must be at least 3 characters long.');
                return;
            }

            const downloadRuleVal = downloadRuleEl? downloadRuleEl.value : '0';
            if (mode === 'html' && downloadRuleVal!== '0') {
                alert('⚠️ HTML/web books cannot be set to downloadable. Change download rule to 0 or switch to PDF.');
                return;
            }

            const copyrightCheck = $('#copyright-ownership-check');
            const termsCheck = $('#copyright-terms-check');
            if (!(copyrightCheck && copyrightCheck.checked) ||!(termsCheck && termsCheck.checked)) {
                alert('⚠️ You must confirm copyright ownership and agree to the terms to publish.');
                return;
            }

            const coverFileInput = $('#cover-upload');
            if (coverFileInput && coverFileInput.files[0]) {
                const coverFile = coverFileInput.files[0];
                // 5 MB limit
                if (coverFile.size > 5 * 1024 * 1024) {
                    alert('⚠️ Cover image must be 5MB or smaller.');
                    return;
                }
            }

            if (mode === 'pdf') {
                const pdfFileInput = $('#pdf-upload');
                if (pdfFileInput && pdfFileInput.files[0]) {
                    const pdfFile = pdfFileInput.files[0];
                    // 50 MB limit
                    if (pdfFile.size > 50 * 1024 * 1024) {
                        alert('⚠️ PDF file must be 50MB or smaller.');
                        return;
                    }
                }
            }

            // Build FormData
            const formData = new FormData();
            formData.append('authorName', authorNameInput? authorNameInput.value.trim() : '');

            const categoryVal = categorySelectEl? categorySelectEl.value : 'Other';
            formData.append('category', categoryVal);
            formData.append('subTheme', (categoryVal === 'Shona Novels' && subThemeSelect)? subThemeSelect.value : '');

            formData.append('title', title);
            formData.append('description', descInput? descInput.value.trim() : '');
            formData.append('price', priceInput? priceInput.value : '0');
            formData.append('mode', mode);
            formData.append('allowDownload', downloadRuleEl? downloadRuleEl.value : '0');

            if (coverFileInput && coverFileInput.files[0]) {
                formData.append('coverImage', coverFileInput.files[0]);
            }

            if (mode === 'pdf') {
                const pdfFileInput = $('#pdf-upload');
                if (pdfFileInput && pdfFileInput.files[0]) {
                    formData.append('pdfBook', pdfFileInput.files[0]);
                }
            } else {
                const chapterTitleInput = $('#initial-chapter-title');
                const chapterBodyInput = $('#initial-chapter-body');
                const initialBody = chapterBodyInput? chapterBodyInput.value.trim() : '';
                formData.append('chapterTitle', chapterTitleInput? chapterTitleInput.value.trim() : '');
                formData.append('chapterBody', initialBody);
                formData.append('content', initialBody);
            }

            formData.append('agreeCopyright', copyrightCheck && copyrightCheck.checked? 'true' : 'false');
            formData.append('agreeTerms', termsCheck && termsCheck.checked? 'true' : 'false');

            // Submit and handle response with error checking (SECURITY FIX)
            try {
                const res = await fetch('/api/books/publish', {
                    method: 'POST',
                    body: formData
                });
                const contentType = res.headers.get('content-type') || '';
                const data = contentType.includes('application/json')? await res.json() : { message: await res.text() };
                if (!res.ok) {
                    alert(`❌ ${data.error || data.message || res.statusText}`);
                    return;
                }
                alert("🎉 Success! Your book has been published.");
                publishForm.reset();
                switchTab('dashboard-view');
            } catch (err) {
                console.error('Publish error', err);
                alert("⚠️ Publishing failed. Please check your connection.");
            }
        });
    }

    // -------------------------------------------------------------
    // 6. AUTHOR PROFILE & PAYOUT DETAILS
    // -------------------------------------------------------------
    const profileForm = $('#author-profile-form');

    function cleanHandle(val) {
        if (!val) return '';
        let cleaned = val.trim().replace(/^https?:\/\/(www\.)?(facebook|twitter|x|instagram|tiktok)\.com\//i, '');
        if (cleaned.startsWith('@')) cleaned = cleaned.substring(1);
        if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
        return cleaned;
    }

    async function loadAuthorProfile() {
        try {
            const data = await fetchJson('/api/author/profile');
            if (!data) return;

            const setVal = (id, val) => { const el = $(`#${id}`); if (el) el.value = val || ''; };
            const setCheck = (id, val) => { const el = $(`#${id}`); if (el) el.checked = val?? true; };

            setVal('author-legal-name', data.legal_name || data.legalName);
            setVal('author-phone', data.phone);
            setVal('author-isbn', data.isbn);
            setVal('author-bio', data.bio);

            setVal('author-fb-handle', data.facebook_handle || data.facebookHandle);
            setVal('author-tt-handle', data.tiktok_handle || data.tiktokHandle);
            setVal('author-tw-handle', data.twitter_handle || data.twitterHandle);
            setVal('author-ig-handle', data.instagram_handle || data.instagramHandle);

            setCheck('show-fb', data.show_facebook?? data.showFacebook);
            setCheck('show-tt', data.show_tiktok?? data.showTiktok);
            setCheck('show-tw', data.show_twitter?? data.showTwitter);
            setCheck('show-ig', data.show_instagram?? data.showInstagram);
        } catch (err) {
            console.error("Failed to load author profile:", err);
        }
    }
    window.loadAuthorProfile = loadAuthorProfile; // keep exported name

    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData();
            const legalNameInput = $('#author-legal-name');
            const phoneInput = $('#author-phone');
            const isbnInput = $('#author-isbn');
            const isbnDocInput = $('#author-isbn-proof');

            if (legalNameInput) formData.append('legalName', legalNameInput.value.trim());
            if (phoneInput) formData.append('phone', phoneInput.value.trim());
            if (isbnInput && isbnInput.value.trim()) formData.append('isbn', isbnInput.value.trim());
            if (isbnDocInput && isbnDocInput.files[0]) formData.append('isbnDoc', isbnDocInput.files[0]);

            const profilePicInput = $('#author-profile-pic');
            const bioInput = $('#author-bio');
            const fbInput = $('#author-fb-handle');
            const ttInput = $('#author-tt-handle');
            const twInput = $('#author-tw-handle');
            const igInput = $('#author-ig-handle');

            if (profilePicInput && profilePicInput.files[0]) formData.append('profilePic', profilePicInput.files[0]);
            if (bioInput) formData.append('bio', bioInput.value.trim());

            if (fbInput) formData.append('facebookHandle', cleanHandle(fbInput.value));
            if (ttInput) formData.append('tiktokHandle', cleanHandle(ttInput.value));
            if (twInput) formData.append('twitterHandle', cleanHandle(twInput.value));
            if (igInput) formData.append('instagramHandle', cleanHandle(igInput.value));

            formData.append('showFacebook', $('#show-fb')?.checked? 'true' : 'false');
            formData.append('showTiktok', $('#show-tt')?.checked? 'true' : 'false');
            formData.append('showTwitter', $('#show-tw')?.checked? 'true' : 'false');
            formData.append('showInstagram', $('#show-ig')?.checked? 'true' : 'false');

            try {
                const res = await fetch('/api/author/profile', { method: 'POST', body: formData });
                const contentType = res.headers.get('content-type') || '';
                const data = contentType.includes('application/json')? await res.json() : { message: await res.text() };
                if (!res.ok) {
                    alert(`❌ ${data.error || data.message || res.statusText}`);
                    return;
                }
                alert("✅ Author profile details updated successfully!");
                loadAuthorProfile();
            } catch (err) {
                console.error('Profile update failed', err);
                alert("⚠️ Profile update failed.");
            }
        });
    }

    // -------------------------------------------------------------
    // 7. ENHANCED WEB BOOK STUDIO LOGIC (FULL CHAPTER CRUD & REORDER)
    // -------------------------------------------------------------
    const studioBooksList = $('#studio-books-list');
    const studioEditorPanel = $('#studio-editor-panel');
    const studioEditorPlaceholder = $('#studio-editor-placeholder');
    const studioChaptersList = $('#studio-chapters-list');
    const addChapterForm = $('#add-chapter-form');
    const chapterPreviewPane = $('#chapter-preview-pane');

    let currentEditingBookId = null;
    let currentActiveBookChapters = [];

    async function loadStudioWebBooks() {
        if (!studioBooksList) return;
        studioBooksList.innerHTML = '';
        try {
            const books = await fetchJson('/api/books/my-web-books');
            if (!books || books.length === 0) {
                const p = document.createElement('p');
                p.style.fontSize = '13px';
                p.style.color = 'var(--text-muted, #777)';
                p.textContent = 'No web books found. Create one under "Create New Book" with HTML/Web option!';
                studioBooksList.appendChild(p);
                return;
            }

            books.forEach(book => {
                const btn = document.createElement('button');
                btn.className = 'studio-book-select-btn';
                btn.style.cssText = 'width: 100%; text-align: left; padding: 10px; margin-bottom: 8px; border: 1px solid var(--border-tan, #ccc); background: var(--bg-cream-light, #fafafa);';
                const strong = document.createElement('strong');
                strong.textContent = book.title? String(book.title) : 'Untitled';
                btn.appendChild(strong);
                btn.addEventListener('click', () => selectStudioBook(book));
                studioBooksList.appendChild(btn);
            });
        } catch (err) {
            console.error("Error loading web books:", err);
            const p = document.createElement('p');
            p.style.fontSize = '13px';
            p.style.color = 'var(--text-danger, #dc3545)';
            p.textContent = 'Unable to load web books.';
            studioBooksList.appendChild(p);
        }
    }
    window.loadStudioWebBooks = loadStudioWebBooks; // keep name

    function selectStudioBook(book) {
        currentEditingBookId = book.id;
        if (studioEditorPlaceholder) studioEditorPlaceholder.classList.add('hidden');
        if (studioEditorPanel) studioEditorPanel.classList.remove('hidden');

        const titleElem = $('#current-editing-book-title');
        const idInput = $('#editor-book-id');

        if (titleElem) titleElem.textContent = book.title || 'Untitled';
        if (idInput) idInput.value = book.id;

        loadChapters(book.id);
    }

    async function loadChapters(bookId) {
        try {
            const chapters = await fetchJson(`/api/books/${bookId}/chapters`);
            if (!studioChaptersList) return;
            studioChaptersList.innerHTML = '';
            currentActiveBookChapters = chapters || [];

            if (!chapters || chapters.length === 0) {
                const p = document.createElement('p');
                p.style.fontSize = '12px';
                p.style.color = 'var(--text-muted, #777)';
                p.textContent = 'No chapters added yet.';
                studioChaptersList.appendChild(p);
                if (chapterPreviewPane) chapterPreviewPane.textContent = 'Select a chapter to preview its content.';
                return;
            }

            chapters.forEach((chap, idx) => {
                const item = document.createElement('div');
                item.className = 'studio-chapter-item';
                item.style.cssText = 'background: #f8f9fa; border: 1px solid #ddd; padding: 10px; border-radius: 4px; font-size: 13px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';

                const left = document.createElement('div');
                left.style.cursor = 'pointer';
                left.style.flexGrow = '1';
                left.className = 'chap-title-click';
                left.innerHTML = `<strong>Chapter ${chap.chapter_number || idx + 1}:</strong> `;
                const titleSpan = document.createElement('span');
                titleSpan.textContent = chap.title || 'Untitled Chapter';
                left.appendChild(titleSpan);

                left.addEventListener('click', () => renderChapterPreview(chap));

                const right = document.createElement('div');
                right.style.display = 'flex';
                right.style.gap = '6px';
                right.style.alignItems = 'center';

                const upBtn = document.createElement('button');
                upBtn.className = 'btn-chap-up';
                upBtn.style.padding = '2px 6px';
                upBtn.style.cursor = 'pointer';
                upBtn.textContent = '▲';
                if (idx === 0) upBtn.disabled = true;
                upBtn.addEventListener('click', () => moveChapterOrder(bookId, chapters, idx, 'up'));

                const downBtn = document.createElement('button');
                downBtn.className = 'btn-chap-down';
                downBtn.style.padding = '2px 6px';
                downBtn.style.cursor = 'pointer';
                downBtn.textContent = '▼';
                if (idx === chapters.length - 1) downBtn.disabled = true;
                downBtn.addEventListener('click', () => moveChapterOrder(bookId, chapters, idx, 'down'));

                const viewBtn = document.createElement('button');
                viewBtn.className = 'btn-chap-view';
                viewBtn.style.cssText = 'background: #27ae60; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;';
                viewBtn.textContent = 'View';
                viewBtn.addEventListener('click', () => window.openViewChapterModal(chap.id || chap._id));

                const editBtn = document.createElement('button');
                editBtn.className = 'btn-chap-edit';
                editBtn.style.cssText = 'background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;';
                editBtn.textContent = 'Edit';
                editBtn.addEventListener('click', () => window.openEditChapterModal(chap.id || chap._id, bookId));

                const delBtn = document.createElement('button');
                delBtn.className = 'btn-chap-del';
                delBtn.style.cssText = 'background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;';
                delBtn.textContent = 'Delete';
                delBtn.addEventListener('click', () => deleteChapter(bookId, chap.id || chap._id));

                right.appendChild(upBtn);
                right.appendChild(downBtn);
                right.appendChild(viewBtn);
                right.appendChild(editBtn);
                right.appendChild(delBtn);

                item.appendChild(left);
                item.appendChild(right);

                studioChaptersList.appendChild(item);
            });
        } catch (err) {
            console.error("Error loading chapters:", err);
            if (studioChaptersList) {
                studioChaptersList.innerHTML = '';
                const p = document.createElement('p');
                p.style.fontSize = '13px';
                p.style.color = 'var(--text-danger, #dc3545)';
                p.textContent = 'Unable to load chapters.';
                studioChaptersList.appendChild(p);
            }
        }
    }

    // Render Chapter Body Preview in side-pane (SECURITY FIX: use textContent not innerHTML)
    function renderChapterPreview(chap) {
        if (!chapterPreviewPane) return;
        chapterPreviewPane.innerHTML = ''; // clear first

        const title = document.createElement('h3');
        title.textContent = chap.title || 'Untitled';
        const hr = document.createElement('hr');
        hr.style.border = '0';
        hr.style.borderTop = '1px solid #eee';
        hr.style.margin = '10px 0';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'chapter-rendered-content';
        contentDiv.style.lineHeight = '1.6';
        // SECURITY FIX: treat content as text to avoid XSS (no HTML rendering)
        contentDiv.textContent = chap.content || chap.body || 'No content available.';

        chapterPreviewPane.appendChild(title);
        chapterPreviewPane.appendChild(hr);
        chapterPreviewPane.appendChild(contentDiv);
    }

    // Add New Chapter
    if (addChapterForm) {
        addChapterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const bookId = $('#editor-book-id')? $('#editor-book-id').value : currentEditingBookId;
            const titleInput = $('#new-chapter-title');
            const bodyInput = $('#new-chapter-body');

            const title = titleInput? titleInput.value.trim() : '';
            const bodyContent = bodyInput? bodyInput.value.trim() : '';

            try {
                const data = await fetchJson(`/api/books/${bookId}/chapters`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookId, title, content: bodyContent, body: bodyContent })
                });
                alert("📖 Chapter added and published successfully!");
                if (titleInput) titleInput.value = '';
                if (bodyInput) bodyInput.value = '';
                loadChapters(bookId);
            } catch (err) {
                console.error(err);
                alert("⚠️ Failed to post new chapter.");
            }
        });
    }

    // Modal View & Edit Functions Exposed Globally (use single modal utilities)
    window.openViewChapterModal = function(chapterId) {
        const chapter = currentActiveBookChapters.find(c => (c.id || c._id) == chapterId);
        if (!chapter) {
            alert('Chapter content not found.');
            return;
        }

        const titleElem = $('#view-chapter-title');
        const bodyElem = $('#view-chapter-body');

        if (titleElem) titleElem.textContent = chapter.title || 'Untitled Chapter';
        if (bodyElem) bodyElem.textContent = chapter.content || chapter.body || 'No content written for this chapter yet.';

        const modal = $('#view-chapter-modal');
        if (modal) openModal(modal);
    };

    window.closeViewChapterModal = function() {
        const modal = $('#view-chapter-modal');
        if (modal) closeModal(modal);
    };

    window.openEditChapterModal = function(chapterId, bookId) {
        const chapter = currentActiveBookChapters.find(c => (c.id || c._id) == chapterId);
        if (!chapter) {
            alert('Unable to load chapter details for editing.');
            return;
        }

        const idInput = $('#edit-chapter-id');
        const bookIdInput = $('#edit-chapter-book-id');
        const titleInput = $('#edit-chapter-title-input');
        const bodyInput = $('#edit-chapter-body-input');

        if (idInput) idInput.value = chapterId;
        if (bookIdInput) bookIdInput.value = bookId || currentEditingBookId;
        if (titleInput) titleInput.value = chapter.title || '';
        if (bodyInput) bodyInput.value = chapter.content || chapter.body || '';

        const modal = $('#edit-chapter-modal');
        if (modal) openModal(modal);
    };

    window.closeEditChapterModal = function() {
        const modal = $('#edit-chapter-modal');
        if (modal) closeModal(modal);
    };

    // Save Chapter Updates Form Handler
    const editChapterForm = $('#edit-chapter-form');
    if (editChapterForm) {
        editChapterForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const chapterId = $('#edit-chapter-id')? $('#edit-chapter-id').value : '';
            const bookId = $('#edit-chapter-book-id')? $('#edit-chapter-book-id').value : currentEditingBookId;
            const updatedTitle = $('#edit-chapter-title-input')? $('#edit-chapter-title-input').value : '';
            const updatedBody = $('#edit-chapter-body-input')? $('#edit-chapter-body-input').value : '';

            try {
                const data = await fetchJson(`/api/books/${bookId}/chapters/${chapterId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: updatedTitle, content: updatedBody, body: updatedBody })
                });

                alert('✅ Chapter updated successfully!');
                window.closeEditChapterModal();
                loadChapters(bookId);
            } catch (error) {
                console.error('Update Chapter Error:', error);
                alert(`❌ ${error.message || 'Chapter could not be updated.'}`);
            }
        });
    }

    // Delete Chapter
    function deleteChapter(bookId, chapterId) {
        if (confirm("⚠️ Delete this chapter permanently?")) {
            fetch(`/api/books/${bookId}/chapters/${chapterId}`, { method: 'DELETE' })
               .then(async res => {
                    if (!res.ok) {
                        const txt = await res.text();
                        throw new Error(txt || res.statusText);
                    }
                    return res.json();
                })
               .then(data => {
                    loadChapters(bookId);
                })
               .catch(() => alert("⚠️ Failed to delete chapter."));
        }
    }

    // Reorder Chapters
    function moveChapterOrder(bookId, chapters, currentIndex, direction) {
        const targetIndex = direction === 'up'? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= chapters.length) return;

        // Swap locally
        const temp = chapters[currentIndex];
        chapters[currentIndex] = chapters[targetIndex];
        chapters[targetIndex] = temp;

        const reorderedIds = chapters.map(c => c.id || c._id);

        fetch(`/api/books/${bookId}/chapters/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapterOrder: reorderedIds })
        })
       .then(async res => {
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || res.statusText);
            }
            return res.json();
        })
       .then(data => {
            loadChapters(bookId);
        })
       .catch(() => alert("⚠️ Failed to update order."));
    }

    // -------------------------------------------------------------
    // 8. SALES & ROYALTIES ANALYTICS
    // -------------------------------------------------------------
    async function loadSalesAnalytics() {
        try {
            const data = await fetchJson('/api/analytics/sales');

            const totalEarnings = $('#stats-total-earnings');
            const totalSales = $('#stats-total-sales');
            const earnedAmount = parseFloat(data.totalEarnings || 0).toFixed(2);

            if (totalEarnings) totalEarnings.textContent = `$${earnedAmount}`;
            if (totalSales) totalSales.textContent = data.totalSalesCount || 0;

            const ecocashBal = $('#dashboard-ecocash-balance');
            if (ecocashBal) ecocashBal.textContent = `$${earnedAmount} USD`;

            const breakdownList = $('#sales-breakdown-list');
            if (breakdownList) {
                breakdownList.innerHTML = '';
                if (!data.bookBreakdown || Object.keys(data.bookBreakdown).length === 0) {
                    const p = document.createElement('p');
                    p.style.fontSize =
