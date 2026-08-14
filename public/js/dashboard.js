document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // 1. NAVIGATION & VIEW SWITCHING LOGIC
    // -------------------------------------------------------------
    const navItems = {
        'dashboard-view': document.getElementById('menu-dash'),
        'creator-view': document.getElementById('menu-create'),
        'studio-view': document.getElementById('menu-studio'),
        'sales-view': document.getElementById('menu-sales'),
        'profile-view': document.getElementById('menu-profile')
    };

    window.switchTab = function(targetTabId, evt) {
        if (evt) evt.preventDefault();

        // Hide all views & deactivate menu items
        document.querySelectorAll('.view-section').forEach(view => view.classList.add('hidden'));
        document.querySelectorAll('.side-menu .menu-item').forEach(item => item.classList.remove('active'));

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

    const quickCreateTrigger = document.getElementById('quick-create-trigger');
    if (quickCreateTrigger) {
        quickCreateTrigger.addEventListener('click', (e) => switchTab('creator-view', e));
    }

    // -------------------------------------------------------------
    // 2. PUBLISH FORMAT SWITCH & CATEGORY DEPENDENCIES
    // -------------------------------------------------------------
    const modeRadios = document.querySelectorAll('input[name="upload-mode"]');
    const pdfGroup = document.getElementById('pdf-input-group');
    const htmlGroup = document.getElementById('html-input-group');
    const ruleSelect = document.getElementById('book-download-rule');

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

    const categorySelect = document.getElementById('book-category');
    const subThemeGroup = document.getElementById('sub-theme-group');
    
    if (categorySelect && subThemeGroup) {
        categorySelect.addEventListener('change', (e) => {
            subThemeGroup.style.display = (e.target.value === 'Shona Novels') ? 'block' : 'none';
        });
    }

    // -------------------------------------------------------------
    // 3. FETCH CURRENT USER & INITIALIZE DASHBOARD
    // -------------------------------------------------------------
    fetch('/api/auth/me')
        .then(res => res.json())
        .then(data => {
            if (data.loggedIn && data.user) {
                const displayName = data.user.name || data.user.username || '';
                const welcomeTag = document.querySelector('.welcome-tag');
                if (welcomeTag) welcomeTag.innerText = `Welcome 👤 ${displayName}`;

                const authorNameInput = document.getElementById('book-author-name');
                if (authorNameInput && !authorNameInput.value) {
                    authorNameInput.value = displayName;
                }
            }
        })
        .catch(err => console.error("Failed to load user info:", err));

    loadDashboardBooks();
    loadNotifications();

    // -------------------------------------------------------------
    // 4. LOAD AUTHOR'S BOOKS (MY BOOKS DASHBOARD)
    // -------------------------------------------------------------
    function loadDashboardBooks() {
        const booksContainer = document.getElementById('author-books-container');
        if (!booksContainer) return;

        fetch('/api/books/my-books')
            .then(res => res.json())
            .then(books => {
                booksContainer.innerHTML = '';

                if (!books || books.length === 0) {
                    booksContainer.innerHTML = '<p style="color: var(--text-dark, #222); opacity: 0.6; width: 100%;">You have not published any books yet.</p>';
                    return;
                }

                books.forEach(book => {
                    const card = document.createElement('div');
                    card.className = 'author-book-card';
                    const rawPrice = parseFloat(book.price) || 0;
                    const coverSrc = book.coverImage || book.cover_image || '/images/default-cover.png';

                    card.innerHTML = `
                        <img src="${coverSrc}" alt="${escapeHtml(book.title)}" class="cover-thumb" onerror="this.src='/images/default-cover.png'">
                        <div class="book-meta">
                            <h3>${escapeHtml(book.title)}</h3>
                            <p>${book.description ? escapeHtml(book.description.substring(0, 80)) + '...' : ''}</p>
                            <p><strong>Price:</strong> <span style="color: var(--primary-green-light, #27ae60);">$${rawPrice.toFixed(2)} USD</span></p>
                            <p><span class="badge ${book.status === 'Draft' ? 'status-draft' : 'status-pub'}">${book.mode ? book.mode.toUpperCase() : 'PDF'}</span></p>
                            <div style="display: flex; gap: 8px; margin-top: 10px;">
                                <button class="btn-edit-book" style="background: var(--primary-green, #1b3d2b); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Edit</button>
                                <button class="btn-delete-book" style="background: var(--danger-red, #dc3545); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
                            </div>
                        </div>
                    `;

                    // Safe Event Listeners replacing inline onclicks
                    card.querySelector('.btn-edit-book').addEventListener('click', () => openEditModal(book.id, book.description || '', rawPrice));
                    card.querySelector('.btn-delete-book').addEventListener('click', () => deleteBook(book.id));

                    booksContainer.appendChild(card);
                });
            })
            .catch(err => console.error("Failed to fetch author books:", err));
    }

    window.escapeHtml = function(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    // -------------------------------------------------------------
    // 5. CREATE / PUBLISH BOOK FORM SUBMISSION
    // -------------------------------------------------------------
    const publishForm = document.getElementById('publish-master-form');
    if (publishForm) {
        publishForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData();
            const authorNameInput = document.getElementById('book-author-name');
            const categorySelect = document.getElementById('book-category');
            const subThemeSelect = document.getElementById('book-sub-theme');
            const titleInput = document.getElementById('book-title');
            const priceInput = document.getElementById('book-price');
            const descInput = document.getElementById('book-description');

            formData.append('authorName', authorNameInput ? authorNameInput.value.trim() : '');
            
            const categoryVal = categorySelect ? categorySelect.value : 'Other';
            formData.append('category', categoryVal);
            formData.append('subTheme', (categoryVal === 'Shona Novels' && subThemeSelect) ? subThemeSelect.value : '');

            formData.append('title', titleInput ? titleInput.value.trim() : '');
            formData.append('description', descInput ? descInput.value.trim() : '');
            formData.append('price', priceInput ? priceInput.value : '0');

            const selectedRadio = document.querySelector('input[name="upload-mode"]:checked');
            const mode = selectedRadio ? selectedRadio.value : 'pdf';
            formData.append('mode', mode);

            const downloadRule = document.getElementById('book-download-rule');
            formData.append('allowDownload', downloadRule ? downloadRule.value : '0');

            const coverFileInput = document.getElementById('cover-upload');
            if (coverFileInput && coverFileInput.files[0]) {
                formData.append('coverImage', coverFileInput.files[0]);
            }

            if (mode === 'pdf') {
                const pdfFileInput = document.getElementById('pdf-upload');
                if (pdfFileInput && pdfFileInput.files[0]) {
                    formData.append('pdfBook', pdfFileInput.files[0]);
                }
            } else {
                const chapterTitleInput = document.getElementById('initial-chapter-title');
                const chapterBodyInput = document.getElementById('initial-chapter-body');
                const initialBody = chapterBodyInput ? chapterBodyInput.value.trim() : '';
                
                formData.append('chapterTitle', chapterTitleInput ? chapterTitleInput.value.trim() : '');
                formData.append('chapterBody', initialBody);
                formData.append('content', initialBody);
            }

            const copyrightCheck = document.getElementById('copyright-ownership-check');
            const termsCheck = document.getElementById('copyright-terms-check');

            formData.append('agreeCopyright', copyrightCheck && copyrightCheck.checked ? 'true' : 'false');
            formData.append('agreeTerms', termsCheck && termsCheck.checked ? 'true' : 'false');

            fetch('/api/books/publish', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert(`❌ ${data.error}`);
                } else {
                    alert("🎉 Success! Your book has been published.");
                    publishForm.reset();
                    switchTab('dashboard-view');
                }
            })
            .catch(err => alert("⚠️ Publishing failed. Please check your connection."));
        });
    }

    // -------------------------------------------------------------
    // 6. AUTHOR PROFILE & PAYOUT DETAILS
    // -------------------------------------------------------------
    const profileForm = document.getElementById('author-profile-form');

    function cleanHandle(val) {
        if (!val) return '';
        let cleaned = val.trim().replace(/^https?:\/\/(www\.)?(facebook|twitter|x|instagram|tiktok)\.com\//i, '');
        if (cleaned.startsWith('@')) cleaned = cleaned.substring(1);
        if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
        return cleaned;
    }

    function loadAuthorProfile() {
        fetch('/api/author/profile')
            .then(res => res.json())
            .then(data => {
                if (!data) return;

                const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
                const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val ?? true; };

                setVal('author-legal-name', data.legal_name || data.legalName);
                setVal('author-phone', data.phone);
                setVal('author-isbn', data.isbn);
                setVal('author-bio', data.bio);

                setVal('author-fb-handle', data.facebook_handle || data.facebookHandle);
                setVal('author-tt-handle', data.tiktok_handle || data.tiktokHandle);
                setVal('author-tw-handle', data.twitter_handle || data.twitterHandle);
                setVal('author-ig-handle', data.instagram_handle || data.instagramHandle);

                setCheck('show-fb', data.show_facebook ?? data.showFacebook);
                setCheck('show-tt', data.show_tiktok ?? data.showTiktok);
                setCheck('show-tw', data.show_twitter ?? data.showTwitter);
                setCheck('show-ig', data.show_instagram ?? data.showInstagram);
            })
            .catch(err => console.error("Failed to load author profile:", err));
    }

    if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData();
            const legalNameInput = document.getElementById('author-legal-name');
            const phoneInput = document.getElementById('author-phone');
            const isbnInput = document.getElementById('author-isbn');
            const isbnDocInput = document.getElementById('author-isbn-proof');

            if (legalNameInput) formData.append('legalName', legalNameInput.value.trim());
            if (phoneInput) formData.append('phone', phoneInput.value.trim());
            if (isbnInput && isbnInput.value.trim()) formData.append('isbn', isbnInput.value.trim());
            if (isbnDocInput && isbnDocInput.files[0]) formData.append('isbnDoc', isbnDocInput.files[0]);

            const profilePicInput = document.getElementById('author-profile-pic');
            const bioInput = document.getElementById('author-bio');
            const fbInput = document.getElementById('author-fb-handle');
            const ttInput = document.getElementById('author-tt-handle');
            const twInput = document.getElementById('author-tw-handle');
            const igInput = document.getElementById('author-ig-handle');

            if (profilePicInput && profilePicInput.files[0]) formData.append('profilePic', profilePicInput.files[0]);
            if (bioInput) formData.append('bio', bioInput.value.trim());

            if (fbInput) formData.append('facebookHandle', cleanHandle(fbInput.value));
            if (ttInput) formData.append('tiktokHandle', cleanHandle(ttInput.value));
            if (twInput) formData.append('twitterHandle', cleanHandle(twInput.value));
            if (igInput) formData.append('instagramHandle', cleanHandle(igInput.value));

            formData.append('showFacebook', document.getElementById('show-fb')?.checked ? 'true' : 'false');
            formData.append('showTiktok', document.getElementById('show-tt')?.checked ? 'true' : 'false');
            formData.append('showTwitter', document.getElementById('show-tw')?.checked ? 'true' : 'false');
            formData.append('showInstagram', document.getElementById('show-ig')?.checked ? 'true' : 'false');

            fetch('/api/author/profile', { method: 'POST', body: formData })
                .then(res => res.json())
                .then(data => {
                    if (data.error) alert(`❌ ${data.error}`);
                    else {
                        alert("✅ Author profile details updated successfully!");
                        loadAuthorProfile();
                    }
                })
                .catch(() => alert("⚠️ Profile update failed."));
        });
    }

    // -------------------------------------------------------------
    // 7. ENHANCED WEB BOOK STUDIO LOGIC (FULL CHAPTER CRUD & REORDER)
    // -------------------------------------------------------------
    const studioBooksList = document.getElementById('studio-books-list');
    const studioEditorPanel = document.getElementById('studio-editor-panel');
    const studioEditorPlaceholder = document.getElementById('studio-editor-placeholder');
    const studioChaptersList = document.getElementById('studio-chapters-list');
    const addChapterForm = document.getElementById('add-chapter-form');
    const chapterPreviewPane = document.getElementById('chapter-preview-pane');

    let currentEditingBookId = null;
    let currentActiveBookChapters = [];

    function loadStudioWebBooks() {
        if (!studioBooksList) return;
        fetch('/api/books/my-web-books')
            .then(res => res.json())
            .then(books => {
                studioBooksList.innerHTML = '';
                if (!books || books.length === 0) {
                    studioBooksList.innerHTML = '<p style="font-size: 13px; color: var(--text-muted, #777);">No web books found. Create one under "Create New Book" with HTML/Web option!</p>';
                    return;
                }

                books.forEach(book => {
                    const btn = document.createElement('button');
                    btn.className = 'studio-book-select-btn';
                    btn.style.cssText = "width: 100%; text-align: left; padding: 10px; margin-bottom: 8px; border: 1px solid var(--border-tan, #ccc); background: var(--bg-cream-light, #fafafa); border-radius: 4px; cursor: pointer;";
                    btn.innerHTML = `<strong>${escapeHtml(book.title)}</strong>`;
                    btn.onclick = () => selectStudioBook(book);
                    studioBooksList.appendChild(btn);
                });
            })
            .catch(err => console.error("Error loading web books:", err));
    }

    function selectStudioBook(book) {
        currentEditingBookId = book.id;
        if (studioEditorPlaceholder) studioEditorPlaceholder.classList.add('hidden');
        if (studioEditorPanel) studioEditorPanel.classList.remove('hidden');

        const titleElem = document.getElementById('current-editing-book-title');
        const idInput = document.getElementById('editor-book-id');

        if (titleElem) titleElem.innerText = book.title;
        if (idInput) idInput.value = book.id;

        loadChapters(book.id);
    }

    function loadChapters(bookId) {
        fetch(`/api/books/${bookId}/chapters`)
            .then(res => res.json())
            .then(chapters => {
                if (!studioChaptersList) return;
                studioChaptersList.innerHTML = '';
                currentActiveBookChapters = chapters || [];

                if (!chapters || chapters.length === 0) {
                    studioChaptersList.innerHTML = '<p style="font-size: 12px; color: var(--text-muted, #777);">No chapters added yet.</p>';
                    if (chapterPreviewPane) chapterPreviewPane.innerHTML = '<em>Select a chapter to preview its content.</em>';
                    return;
                }

                chapters.forEach((chap, idx) => {
                    const item = document.createElement('div');
                    item.className = 'studio-chapter-item';
                    item.style.cssText = "background: #f8f9fa; border: 1px solid #ddd; padding: 10px; border-radius: 4px; font-size: 13px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;";

                    const chapNum = chap.chapter_number || idx + 1;
                    const chapId = chap.id || chap._id;
                    
                    item.innerHTML = `
                        <div style="cursor: pointer; flex-grow: 1;" class="chap-title-click">
                            <strong>Chapter ${chapNum}:</strong> ${escapeHtml(chap.title)}
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <button class="btn-chap-up" style="padding: 2px 6px; cursor: pointer;" ${idx === 0 ? 'disabled' : ''}>▲</button>
                            <button class="btn-chap-down" style="padding: 2px 6px; cursor: pointer;" ${idx === chapters.length - 1 ? 'disabled' : ''}>▼</button>
                            <button class="btn-chap-view" style="background: #27ae60; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">View</button>
                            <button class="btn-chap-edit" style="background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">Edit</button>
                            <button class="btn-chap-del" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">Delete</button>
                        </div>
                    `;

                    // Actions
                    item.querySelector('.chap-title-click').onclick = () => renderChapterPreview(chap);
                    item.querySelector('.btn-chap-view').onclick = () => window.openViewChapterModal(chapId);
                    item.querySelector('.btn-chap-edit').onclick = () => window.openEditChapterModal(chapId, bookId);
                    item.querySelector('.btn-chap-del').onclick = () => deleteChapter(bookId, chapId);
                    
                    item.querySelector('.btn-chap-up').onclick = () => moveChapterOrder(bookId, chapters, idx, 'up');
                    item.querySelector('.btn-chap-down').onclick = () => moveChapterOrder(bookId, chapters, idx, 'down');

                    studioChaptersList.appendChild(item);
                });
            })
            .catch(err => console.error("Error loading chapters:", err));
    }

    // Render Chapter Body Preview in side-pane
    function renderChapterPreview(chap) {
        if (!chapterPreviewPane) return;
        chapterPreviewPane.innerHTML = `
            <h3>${escapeHtml(chap.title)}</h3>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 10px 0;">
            <div class="chapter-rendered-content" style="line-height: 1.6;">
                ${chap.content || chap.body || '<p><em>No content available.</em></p>'}
            </div>
        `;
    }

    // Add New Chapter
    if (addChapterForm) {
        addChapterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const bookId = document.getElementById('editor-book-id').value;
            const titleInput = document.getElementById('new-chapter-title');
            const bodyInput = document.getElementById('new-chapter-body');

            const title = titleInput ? titleInput.value.trim() : '';
            const bodyContent = bodyInput ? bodyInput.value.trim() : '';

            fetch(`/api/books/${bookId}/chapters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookId, title, content: bodyContent, body: bodyContent })
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) alert(`❌ ${data.error}`);
                else {
                    alert("📖 Chapter added and published successfully!");
                    if (titleInput) titleInput.value = '';
                    if (bodyInput) bodyInput.value = '';
                    loadChapters(bookId);
                }
            })
            .catch(() => alert("⚠️ Failed to post new chapter."));
        });
    }

    // Modal View & Edit Functions Exposed Globally
    window.openViewChapterModal = function(chapterId) {
        const chapter = currentActiveBookChapters.find(c => (c.id || c._id) == chapterId);
        if (!chapter) {
            alert('Chapter content not found.');
            return;
        }

        const titleElem = document.getElementById('view-chapter-title');
        const bodyElem = document.getElementById('view-chapter-body');
        
        if (titleElem) titleElem.innerText = chapter.title || 'Untitled Chapter';
        if (bodyElem) bodyElem.innerText = chapter.content || chapter.body || 'No content written for this chapter yet.';
        
        const modal = document.getElementById('view-chapter-modal');
        if (modal) modal.style.display = 'flex';
    };

    window.closeViewChapterModal = function() {
        const modal = document.getElementById('view-chapter-modal');
        if (modal) modal.style.display = 'none';
    };

    window.openEditChapterModal = function(chapterId, bookId) {
        const chapter = currentActiveBookChapters.find(c => (c.id || c._id) == chapterId);
        if (!chapter) {
            alert('Unable to load chapter details for editing.');
            return;
        }

        const idInput = document.getElementById('edit-chapter-id');
        const bookIdInput = document.getElementById('edit-chapter-book-id');
        const titleInput = document.getElementById('edit-chapter-title-input');
        const bodyInput = document.getElementById('edit-chapter-body-input');

        if (idInput) idInput.value = chapterId;
        if (bookIdInput) bookIdInput.value = bookId || currentEditingBookId;
        if (titleInput) titleInput.value = chapter.title || '';
        if (bodyInput) bodyInput.value = chapter.content || chapter.body || '';

        const modal = document.getElementById('edit-chapter-modal');
        if (modal) modal.style.display = 'flex';
    };

    window.closeEditChapterModal = function() {
        const modal = document.getElementById('edit-chapter-modal');
        if (modal) modal.style.display = 'none';
    };

    // Save Chapter Updates Form Handler
    const editChapterForm = document.getElementById('edit-chapter-form');
    if (editChapterForm) {
        editChapterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const chapterId = document.getElementById('edit-chapter-id').value;
            const bookId = document.getElementById('edit-chapter-book-id').value || currentEditingBookId;
            const updatedTitle = document.getElementById('edit-chapter-title-input').value;
            const updatedBody = document.getElementById('edit-chapter-body-input').value;

            try {
                const response = await fetch(`/api/books/${bookId}/chapters/${chapterId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: updatedTitle, content: updatedBody, body: updatedBody })
                });

                const data = await response.json();

                if (response.ok && !data.error) {
                    alert('✅ Chapter updated successfully!');
                    window.closeEditChapterModal();
                    loadChapters(bookId);
                } else {
                    alert(`❌ ${data.error || 'Chapter could not be updated.'}`);
                }
            } catch (error) {
                console.error('Update Chapter Error:', error);
                alert('⚠️ Error connecting to the server while updating chapter.');
            }
        });
    }

    // Delete Chapter
    function deleteChapter(bookId, chapterId) {
        if (confirm("⚠️ Delete this chapter permanently?")) {
            fetch(`/api/books/${bookId}/chapters/${chapterId}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.error) alert(`❌ ${data.error}`);
                    else loadChapters(bookId);
                })
                .catch(() => alert("⚠️ Failed to delete chapter."));
        }
    }

    // Reorder Chapters
    function moveChapterOrder(bookId, chapters, currentIndex, direction) {
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
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
        .then(res => res.json())
        .then(data => {
            if (data.error) alert(`❌ ${data.error}`);
            else loadChapters(bookId);
        })
        .catch(() => alert("⚠️ Failed to update order."));
    }

    // -------------------------------------------------------------
    // 8. SALES & ROYALTIES ANALYTICS
    // -------------------------------------------------------------
    function loadSalesAnalytics() {
        fetch('/api/analytics/sales')
            .then(res => res.json())
            .then(data => {
                const totalEarnings = document.getElementById('stats-total-earnings');
                const totalSales = document.getElementById('stats-total-sales');
                const earnedAmount = parseFloat(data.totalEarnings || 0).toFixed(2);

                if (totalEarnings) totalEarnings.innerText = `$${earnedAmount}`;
                if (totalSales) totalSales.innerText = data.totalSalesCount || 0;

                const ecocashBal = document.getElementById('dashboard-ecocash-balance');
                if (ecocashBal) ecocashBal.innerText = `$${earnedAmount} USD`;

                const breakdownList = document.getElementById('sales-breakdown-list');
                if (breakdownList) {
                    breakdownList.innerHTML = '';
                    if (!data.bookBreakdown || Object.keys(data.bookBreakdown).length === 0) {
                        breakdownList.innerHTML = '<p style="font-size: 13px; color: var(--text-muted, #777);">No sales recorded yet.</p>';
                    } else {
                        for (const [title, stats] of Object.entries(data.bookBreakdown)) {
                            const row = document.createElement('div');
                            row.style.cssText = "display: flex; justify-content: space-between; border-bottom: 1px dashed #eee; padding: 8px 0; font-size: 13px;";
                            row.innerHTML = `<span><strong>${escapeHtml(title)}</strong> (${stats.sales} sold)</span><strong style="color: var(--primary-green, #1b3d2b);">$${parseFloat(stats.earnings || 0).toFixed(2)}</strong>`;
                            breakdownList.appendChild(row);
                        }
                    }
                }

                const txList = document.getElementById('recent-transactions-list');
                if (txList) {
                    txList.innerHTML = '';
                    if (!data.recentTransactions || data.recentTransactions.length === 0) {
                        txList.innerHTML = '<p style="font-size: 13px; color: var(--text-muted, #777);">No transactions available.</p>';
                    } else {
                        data.recentTransactions.forEach(tx => {
                            const row = document.createElement('div');
                            row.className = 'log-item';
                            row.innerHTML = `
                                <span><strong>${escapeHtml(tx.buyer_name || 'Anonymous')}</strong> purchased <em>${escapeHtml(tx.book_title)}</em></span>
                                <span style="color: var(--primary-green-light, #27ae60); font-weight: bold;">+$${parseFloat(tx.sale_price || 0).toFixed(2)}</span>
                            `;
                            txList.appendChild(row);
                        });
                    }
                }
            })
            .catch(err => console.error("Error loading sales data:", err));
    }

    const withdrawBtn = document.querySelector('.withdraw-btn');
    if (withdrawBtn) {
        withdrawBtn.addEventListener('click', () => {
            const phoneInput = document.getElementById('author-phone');
            const phone = phoneInput ? phoneInput.value.trim() : '';

            fetch('/api/payouts/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) alert(`❌ ${data.error}`);
                else alert("✅ Withdrawal request submitted successfully!");
            })
            .catch(() => alert("⚠️ Withdrawal request failed."));
        });
    }

    // -------------------------------------------------------------
    // 9. BOOK EDIT & DELETE MODAL HANDLERS
    // -------------------------------------------------------------
    const editModal = document.getElementById('edit-book-modal');
    const editForm = document.getElementById('edit-book-form');
    const closeModalBtn = document.getElementById('close-modal-btn');

    window.openEditModal = function(id, description, price) {
        if (!editModal) return;
        const idInput = document.getElementById('edit-book-id');
        const descInput = document.getElementById('edit-book-description');
        const priceInput = document.getElementById('edit-book-price');

        if (idInput) idInput.value = id;
        if (descInput) descInput.value = description;
        if (priceInput) priceInput.value = price;

        editModal.style.display = 'flex';
    };

    if (closeModalBtn && editModal) {
        closeModalBtn.addEventListener('click', () => { editModal.style.display = 'none'; });
    }

    if (editForm) {
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-book-id').value;
            const description = document.getElementById('edit-book-description').value;
            const price = document.getElementById('edit-book-price').value;

            fetch(`/api/books/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description, price })
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) alert(`❌ ${data.error}`);
                else {
                    alert("✅ Book details updated!");
                    if (editModal) editModal.style.display = 'none';
                    loadDashboardBooks();
                }
            });
        });
    }

    window.deleteBook = function(id) {
        if (confirm("⚠️ Are you sure you want to permanently delete this book? This action cannot be undone.")) {
            fetch(`/api/books/${id}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.error) alert(`❌ ${data.error}`);
                    else {
                        alert("🗑️ Book permanently removed.");
                        loadDashboardBooks();
                    }
                });
        }
    };
});

// ==========================================
//          NOTIFICATION CENTER LOGIC
// ==========================================
function loadNotifications() {
    fetch('/api/notifications')
        .then(res => res.json())
        .then(notifications => {
            const listContainer = document.getElementById('notif-list-container');
            const badge = document.getElementById('notif-badge');
            if (!listContainer || !Array.isArray(notifications)) return;

            const unreadCount = notifications.filter(n => !n.is_read).length;

            if (unreadCount > 0 && badge) {
                badge.textContent = unreadCount;
                badge.classList.remove('hidden');
            } else if (badge) {
                badge.classList.add('hidden');
            }

            if (notifications.length === 0) {
                listContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted, #777); font-size: 13px; padding: 15px 0;">No new notifications</p>`;
                return;
            }

            listContainer.innerHTML = notifications.map(notif => `
                <div class="notif-card ${notif.is_read ? '' : 'unread'}" onclick="markNotificationRead(${notif.id})">
                    <span class="notif-card-title" style="font-weight: bold; font-size: 13px; display: block;">📢 ${escapeHtml(notif.title)}</span>
                    <p class="notif-card-body" style="margin: 4px 0; font-size: 12px; color: var(--text-dark, #222);">${escapeHtml(notif.message)}</p>
                    <small class="notif-card-date" style="font-size: 10px; color: var(--text-muted, #777);">${new Date(notif.createdAt || notif.created_at).toLocaleDateString()}</small>
                </div>
            `).join('');
        })
        .catch(err => console.error("Notification load error:", err));
}

window.toggleNotifDropdown = function() {
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
};

window.markNotificationRead = function(id) {
    fetch(`/api/notifications/${id}/read`, { method: 'POST' })
        .then(() => loadNotifications())
        .catch(err => console.error("Failed to mark notification as read:", err));
};

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    const bellBtn = document.getElementById('notif-bell-btn');
    
    if (dropdown && !dropdown.classList.contains('hidden') && bellBtn && !bellBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});
