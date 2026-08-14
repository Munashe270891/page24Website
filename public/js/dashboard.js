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

        // Hide all views
        document.querySelectorAll('.view-section').forEach(view => view.classList.add('hidden'));
        // Deactivate all side-menu items
        document.querySelectorAll('.side-menu .menu-item').forEach(item => item.classList.remove('active'));

        // Show target view
        const targetView = document.getElementById(targetTabId);
        if (targetView) targetView.classList.remove('hidden');

        // Activate corresponding menu button
        if (navItems[targetTabId]) {
            navItems[targetTabId].classList.add('active');
        }

        // Trigger view-specific data reloads
        if (targetTabId === 'dashboard-view') loadDashboardBooks();
        if (targetTabId === 'studio-view') loadStudioWebBooks();
        if (targetTabId === 'sales-view') loadSalesAnalytics();
        if (targetTabId === 'profile-view') loadAuthorProfile();
    };

    // Quick create shortcut from dashboard view
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
                ruleSelect.options[1].disabled = false; // Enable PDF download option
            }
        } else { // HTML / Web Book selected
            if (pdfGroup) pdfGroup.classList.add('hidden');
            if (htmlGroup) htmlGroup.classList.remove('hidden');
            if (ruleSelect) {
                ruleSelect.value = "0"; // Auto-lock to Read in App Only
                if (ruleSelect.options[1]) {
                    ruleSelect.options[1].disabled = true; // Disable download option
                }
            }
        }
    }

    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => handleFormatChange(e.target.value));
    });

    // Run once on load to set initial format state
    const checkedRadio = document.querySelector('input[name="upload-mode"]:checked');
    if (checkedRadio) handleFormatChange(checkedRadio.value);

    // Dynamic Category Handler matching `#sub-theme-group` in dashboard.html
    const categorySelect = document.getElementById('book-category');
    const subThemeGroup = document.getElementById('sub-theme-group');
    
    if (categorySelect && subThemeGroup) {
        categorySelect.addEventListener('change', (e) => {
            if (e.target.value === 'Shona Novels') {
                subThemeGroup.style.display = 'block';
            } else {
                subThemeGroup.style.display = 'none';
            }
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

                // Pre-fill Author Name input in creation form
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
                        <img src="${coverSrc}" alt="${book.title}" class="cover-thumb" onerror="this.src='/images/default-cover.png'">
                        <div class="book-meta">
                            <h3>${book.title}</h3>
                            <p>${book.description ? book.description.substring(0, 80) + '...' : ''}</p>
                            <p><strong>Price:</strong> <span style="color: var(--primary-green-light, #27ae60);">$${rawPrice.toFixed(2)} USD</span></p>
                            <p><span class="badge ${book.status === 'Draft' ? 'status-draft' : 'status-pub'}">${book.mode ? book.mode.toUpperCase() : 'PDF'}</span></p>
                            <div style="display: flex; gap: 8px; margin-top: 10px;">
                                <button onclick="openEditModal(${book.id}, '${escapeHtml(book.description || '')}', ${rawPrice})" style="background: var(--primary-green, #1b3d2b); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Edit</button>
                                <button onclick="deleteBook(${book.id})" style="background: var(--danger-red, #dc3545); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
                            </div>
                        </div>
                    `;
                    booksContainer.appendChild(card);
                });
            })
            .catch(err => console.error("Failed to fetch author books:", err));
    }

    // Safe string escaping helper for inline onclick handlers
    window.escapeHtml = function(text) {
        return text ? text.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
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

            if (categoryVal === 'Shona Novels' && subThemeSelect) {
                formData.append('subTheme', subThemeSelect.value);
            } else {
                formData.append('subTheme', '');
            }

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
            .catch(err => {
                console.error(err);
                alert("⚠️ Publishing failed. Please check your network connection and try again.");
            });
        });
    }

    // -------------------------------------------------------------
    // 6. AUTHOR PROFILE & PAYOUT DETAILS SUBMISSION & LOAD
    // -------------------------------------------------------------
    const profileForm = document.getElementById('author-profile-form');

    function cleanHandle(val) {
        if (!val) return '';
        let cleaned = val.trim();
        cleaned = cleaned.replace(/^https?:\/\/(www\.)?(facebook|twitter|x|instagram|tiktok)\.com\//i, '');
        if (cleaned.startsWith('@')) cleaned = cleaned.substring(1);
        if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
        return cleaned;
    }

    function loadAuthorProfile() {
        fetch('/api/author/profile')
            .then(res => res.json())
            .then(data => {
                if (!data) return;

                // Contact & Legal Identity
                const legalName = document.getElementById('author-legal-name');
                const phone = document.getElementById('author-phone');
                const isbn = document.getElementById('author-isbn');

                if (legalName) legalName.value = data.legal_name || data.legalName || '';
                if (phone) phone.value = data.phone || '';
                if (isbn) isbn.value = data.isbn || '';

                // Social Media Handles, Bio & Checkboxes
                const bio = document.getElementById('author-bio');
                const fbHandle = document.getElementById('author-fb-handle');
                const ttHandle = document.getElementById('author-tt-handle');
                const twHandle = document.getElementById('author-tw-handle');
                const igHandle = document.getElementById('author-ig-handle');

                const showFb = document.getElementById('show-fb');
                const showTt = document.getElementById('show-tt');
                const showTw = document.getElementById('show-tw');
                const showIg = document.getElementById('show-ig');

                if (bio) bio.value = data.bio || '';
                if (fbHandle) fbHandle.value = data.facebook_handle || data.facebookHandle || '';
                if (ttHandle) ttHandle.value = data.tiktok_handle || data.tiktokHandle || '';
                if (twHandle) twHandle.value = data.twitter_handle || data.twitterHandle || '';
                if (igHandle) igHandle.value = data.instagram_handle || data.instagramHandle || '';

                if (showFb) showFb.checked = data.show_facebook ?? data.showFacebook ?? true;
                if (showTt) showTt.checked = data.show_tiktok ?? data.showTiktok ?? true;
                if (showTw) showTw.checked = data.show_twitter ?? data.showTwitter ?? true;
                if (showIg) showIg.checked = data.show_instagram ?? data.showInstagram ?? true;
            })
            .catch(err => console.error("Failed to load author profile:", err));
    }

    if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData();

            // Legal & Identity
            const legalNameInput = document.getElementById('author-legal-name');
            const phoneInput = document.getElementById('author-phone');
            const isbnInput = document.getElementById('author-isbn');
            const isbnDocInput = document.getElementById('author-isbn-proof');

            if (legalNameInput) formData.append('legalName', legalNameInput.value.trim());
            if (phoneInput) formData.append('phone', phoneInput.value.trim());
            if (isbnInput && isbnInput.value.trim()) formData.append('isbn', isbnInput.value.trim());
            if (isbnDocInput && isbnDocInput.files[0]) {
                formData.append('isbnDoc', isbnDocInput.files[0]);
            }

            // Public Profile & Social Handles
            const profilePicInput = document.getElementById('author-profile-pic');
            const bioInput = document.getElementById('author-bio');
            const fbHandleInput = document.getElementById('author-fb-handle');
            const ttHandleInput = document.getElementById('author-tt-handle');
            const twHandleInput = document.getElementById('author-tw-handle');
            const igHandleInput = document.getElementById('author-ig-handle');

            const showFbCheck = document.getElementById('show-fb');
            const showTtCheck = document.getElementById('show-tt');
            const showTwCheck = document.getElementById('show-tw');
            const showIgCheck = document.getElementById('show-ig');

            if (profilePicInput && profilePicInput.files[0]) {
                formData.append('profilePic', profilePicInput.files[0]);
            }
            if (bioInput) formData.append('bio', bioInput.value.trim());

            if (fbHandleInput) formData.append('facebookHandle', cleanHandle(fbHandleInput.value));
            if (ttHandleInput) formData.append('tiktokHandle', cleanHandle(ttHandleInput.value));
            if (twHandleInput) formData.append('twitterHandle', cleanHandle(twHandleInput.value));
            if (igHandleInput) formData.append('instagramHandle', cleanHandle(igHandleInput.value));

            formData.append('showFacebook', showFbCheck && showFbCheck.checked ? 'true' : 'false');
            formData.append('showTiktok', showTtCheck && showTtCheck.checked ? 'true' : 'false');
            formData.append('showTwitter', showTwCheck && showTwCheck.checked ? 'true' : 'false');
            formData.append('showInstagram', showIgCheck && showIgCheck.checked ? 'true' : 'false');

            fetch('/api/author/profile', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert(`❌ ${data.error}`);
                } else {
                    alert("✅ Author profile details updated successfully!");
                    loadAuthorProfile();
                }
            })
            .catch(err => alert("⚠️ Profile update failed."));
        });
    }

    // -------------------------------------------------------------
    // 7. WEB BOOK STUDIO LOGIC
    // -------------------------------------------------------------
    const studioBooksList = document.getElementById('studio-books-list');
    const studioEditorPanel = document.getElementById('studio-editor-panel');
    const studioEditorPlaceholder = document.getElementById('studio-editor-placeholder');
    const studioChaptersList = document.getElementById('studio-chapters-list');
    const addChapterForm = document.getElementById('add-chapter-form');

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
                    btn.innerHTML = `<strong>${book.title}</strong>`;
                    btn.onclick = () => selectStudioBook(book);
                    studioBooksList.appendChild(btn);
                });
            })
            .catch(err => console.error("Error loading web books:", err));
    }

    function selectStudioBook(book) {
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
                if (!chapters || chapters.length === 0) {
                    studioChaptersList.innerHTML = '<p style="font-size: 12px; color: var(--text-muted, #777);">No chapters added yet.</p>';
                    return;
                }

                chapters.forEach((chap, idx) => {
                    const item = document.createElement('div');
                    item.style.cssText = "background: #f8f9fa; border: 1px solid #ddd; padding: 10px; border-radius: 4px; font-size: 13px; margin-bottom: 6px;";
                    item.innerHTML = `<strong>Chapter ${chap.chapter_number || idx + 1}:</strong> ${chap.title}`;
                    studioChaptersList.appendChild(item);
                });
            })
            .catch(err => console.error("Error loading chapters:", err));
    }

    if (addChapterForm) {
        addChapterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const bookId = document.getElementById('editor-book-id').value;
            const titleInput = document.getElementById('new-chapter-title');
            const bodyInput = document.getElementById('new-chapter-body');

            const title = titleInput ? titleInput.value : '';
            const bodyContent = bodyInput ? bodyInput.value : '';

            fetch(`/api/books/${bookId}/chapters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    bookId, 
                    title, 
                    content: bodyContent,
                    body: bodyContent 
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert(`❌ ${data.error}`);
                } else {
                    alert("📖 Chapter added and published successfully!");
                    if (titleInput) titleInput.value = '';
                    if (bodyInput) bodyInput.value = '';
                    loadChapters(bookId);
                }
            })
            .catch(err => alert("⚠️ Failed to post new chapter."));
        });
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
                            row.innerHTML = `<span><strong>${title}</strong> (${stats.sales} sold)</span><strong style="color: var(--primary-green, #1b3d2b);">$${parseFloat(stats.earnings || 0).toFixed(2)}</strong>`;
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
                                <span><strong>${tx.buyer_name || 'Anonymous'}</strong> purchased <em>${tx.book_title}</em></span>
                                <span style="color: var(--primary-green-light, #27ae60); font-weight: bold;">+$${parseFloat(tx.sale_price || 0).toFixed(2)}</span>
                            `;
                            txList.appendChild(row);
                        });
                    }
                }
            })
            .catch(err => console.error("Error loading sales data:", err));
    }

    // Payout withdrawal handler
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
            .catch(err => alert("⚠️ Withdrawal request failed."));
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
                if (data.error) {
                    alert(`❌ ${data.error}`);
                } else {
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
                    if (data.error) {
                        alert(`❌ ${data.error}`);
                    } else {
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
                    <span class="notif-card-title" style="font-weight: bold; font-size: 13px; display: block;">📢 ${notif.title}</span>
                    <p class="notif-card-body" style="margin: 4px 0; font-size: 12px; color: var(--text-dark, #222);">${notif.message}</p>
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

// Global click listener to dismiss notification dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    const bellBtn = document.getElementById('notif-bell-btn');
    
    if (dropdown && !dropdown.classList.contains('hidden') && bellBtn && !bellBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});
