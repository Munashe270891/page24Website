document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // 1. NAVIGATION & VIEW SWITCHING LOGIC
    // -------------------------------------------------------------
    const navItems = {
        'dashboard-view': document.getElementById('menu-dash'),
        'creator-view': document.getElementById('menu-create'),
        'studio-view': document.getElementById('menu-studio'),
        'sales-view': document.getElementById('menu-sales'),
        'profile-view': document.getElementById('menu-profile'),
        'admin-view': document.getElementById('menu-admin')
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
        if (targetTabId === 'admin-view' && typeof window.loadAdminBooks === 'function') {
            window.loadAdminBooks();
        }
    };

    // Quick create shortcut from dashboard view
    const quickCreateTrigger = document.getElementById('quick-create-trigger');
    if (quickCreateTrigger) {
        quickCreateTrigger.addEventListener('click', (e) => switchTab('creator-view', e));
    }

    // -------------------------------------------------------------
    // 2. PUBLISH FORMAT SWITCH & ANTI-PIRACY AUTO-LOCK
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

    // Run once on load to set initial state
    const checkedRadio = document.querySelector('input[name="upload-mode"]:checked');
    if (checkedRadio) handleFormatChange(checkedRadio.value);

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

                // Pre-fill the Author Name in the book creation form
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
                    booksContainer.innerHTML = '<p style="color: var(--text-dark, #222); opacity: 0.6;">You have not published any books yet.</p>';
                    return;
                }

                books.forEach(book => {
                    const card = document.createElement('div');
                    card.className = 'book-card';
                    card.style.cssText = "background: white; border: 1px solid var(--border-tan, #ccc); border-radius: 8px; padding: 15px; margin-bottom: 15px; display: flex; gap: 15px; align-items: center;";

                    const rawPrice = parseFloat(book.price) || 0;
                    card.innerHTML = `
                        <img src="${book.coverImage}" alt="${book.title}" style="width: 70px; height: 100px; object-fit: cover; border-radius: 4px;">
                        <div style="flex-grow: 1;">
                            <h3 style="margin: 0 0 5px 0; color: var(--primary-green, #1e4d2b);">${book.title}</h3>
                            <p style="font-size: 13px; color: #666; margin: 0 0 5px 0;">${book.description ? book.description.substring(0, 80) + '...' : ''}</p>
                            <span style="font-weight: bold; color: #27ae60;">$${rawPrice.toFixed(2)} USD</span> | 
                            <span style="font-size: 12px; color: #888; text-transform: uppercase;">Format: ${book.mode}</span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="openEditModal(${book.id}, '${escapeHtml(book.description || '')}', ${rawPrice})" style="background: #2980b9; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Edit</button>
                            <button onclick="deleteBook(${book.id})" style="background: #c0392b; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
                        </div>
                    `;
                    booksContainer.appendChild(card);
                });
            })
            .catch(err => console.error("Failed to fetch author books:", err));
    }

    // Safe string escaping helper for onclick handlers
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

            // Append subTheme if category is Shona Novels
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
                formData.append('chapterTitle', chapterTitleInput ? chapterTitleInput.value.trim() : '');
                formData.append('chapterBody', chapterBodyInput ? chapterBodyInput.value.trim() : '');
            }

            const copyrightCheck = document.getElementById('copyright-ownership-check');
            const termsCheck = document.getElementById('copyright-terms-check');

            formData.append('agreeCopyright', copyrightCheck && copyrightCheck.checked ? '1' : '');
            formData.append('agreeTerms', termsCheck && termsCheck.checked ? '1' : '');

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
                alert("⚠️ Publishing failed. Please check network connection and try again.");
            });
        });
    }

    // -------------------------------------------------------------
    // 6. AUTHOR PROFILE & KYC SUBMISSION & LOAD
    // -------------------------------------------------------------
    const profileForm = document.getElementById('author-profile-form');

    function loadAuthorProfile() {
        fetch('/api/author/profile')
            .then(res => res.json())
            .then(data => {
                if (!data) return;
                if (data.legal_name) document.getElementById('author-legal-name').value = data.legal_name;
                if (data.id_number) document.getElementById('author-id-number').value = data.id_number;
                if (data.phone) document.getElementById('author-phone').value = data.phone;
                if (data.address) document.getElementById('author-address').value = data.address;
                if (data.kin_name) document.getElementById('kin-name').value = data.kin_name;
                if (data.kin_relation) document.getElementById('kin-relation').value = data.kin_relation;
                if (data.kin_phone) document.getElementById('kin-phone').value = data.kin_phone;
                if (data.isbn) document.getElementById('author-isbn').value = data.isbn;

                if (data.id_doc_path) {
                    const idUpload = document.getElementById('author-id-upload');
                    if (idUpload) idUpload.removeAttribute('required');
                }
            })
            .catch(err => console.error("Failed to load author profile:", err));
    }

    if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData();
            formData.append('legalName', document.getElementById('author-legal-name').value);
            formData.append('idNumber', document.getElementById('author-id-number').value);
            formData.append('phone', document.getElementById('author-phone').value);
            formData.append('address', document.getElementById('author-address').value);
            formData.append('kinName', document.getElementById('kin-name').value);
            formData.append('kinRelation', document.getElementById('kin-relation').value);
            formData.append('kinPhone', document.getElementById('kin-phone').value);

            const isbn = document.getElementById('author-isbn').value;
            if (isbn) formData.append('isbn', isbn);

            const idDoc = document.getElementById('author-id-upload').files[0];
            if (idDoc) formData.append('idDoc', idDoc);

            const isbnDoc = document.getElementById('author-isbn-proof').files[0];
            if (isbnDoc) formData.append('isbnDoc', isbnDoc);

            fetch('/api/author/profile', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert(`❌ ${data.error}`);
                } else {
                    alert("✅ Profile & KYC Verification details updated successfully!");
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
                    studioBooksList.innerHTML = '<p style="font-size: 13px; color: gray;">No web books found. Create one under "Create New Book" with HTML/Web option!</p>';
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

        document.getElementById('current-editing-book-title').innerText = book.title;
        document.getElementById('editor-book-id').value = book.id;

        loadChapters(book.id);
    }

    function loadChapters(bookId) {
        fetch(`/api/books/${bookId}/chapters`)
            .then(res => res.json())
            .then(chapters => {
                if (!studioChaptersList) return;
                studioChaptersList.innerHTML = '';
                if (!chapters || chapters.length === 0) {
                    studioChaptersList.innerHTML = '<p style="font-size: 12px; color: gray;">No chapters added yet.</p>';
                    return;
                }

                chapters.forEach((chap, idx) => {
                    const item = document.createElement('div');
                    item.style.cssText = "background: #f8f9fa; border: 1px solid #ddd; padding: 10px; border-radius: 4px; font-size: 13px;";
                    item.innerHTML = `<strong>Chapter ${idx + 1}:</strong> ${chap.title}`;
                    studioChaptersList.appendChild(item);
                });
            });
    }

    if (addChapterForm) {
        addChapterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const bookId = document.getElementById('editor-book-id').value;
            const title = document.getElementById('new-chapter-title').value;
            const content = document.getElementById('new-chapter-body').value;

            fetch('/api/books/chapters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookId, title, content })
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert(`❌ ${data.error}`);
                } else {
                    alert("📖 Chapter added and published successfully!");
                    document.getElementById('new-chapter-title').value = '';
                    document.getElementById('new-chapter-body').value = '';
                    loadChapters(bookId);
                }
            });
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
                        breakdownList.innerHTML = '<p style="font-size: 13px; color: gray;">No sales recorded yet.</p>';
                    } else {
                        for (const [title, stats] of Object.entries(data.bookBreakdown)) {
                            const row = document.createElement('div');
                            row.style.cssText = "display: flex; justify-content: space-between; border-bottom: 1px dashed #eee; padding-bottom: 8px; font-size: 13px;";
                            row.innerHTML = `<span><strong>${title}</strong> (${stats.sales} sold)</span><strong style="color: var(--primary-green, #1e4d2b);">$${stats.earnings.toFixed(2)}</strong>`;
                            breakdownList.appendChild(row);
                        }
                    }
                }

                const txList = document.getElementById('recent-transactions-list');
                if (txList) {
                    txList.innerHTML = '';
                    if (!data.recentTransactions || data.recentTransactions.length === 0) {
                        txList.innerHTML = '<p style="font-size: 13px; color: gray;">No transactions available.</p>';
                    } else {
                        data.recentTransactions.forEach(tx => {
                            const row = document.createElement('div');
                            row.style.cssText = "background: #f8f9fa; border: 1px solid #eee; padding: 10px; border-radius: 4px; font-size: 12px;";
                            row.innerHTML = `<strong>${tx.buyer_name}</strong> purchased <em>${tx.book_title}</em> for <span style="color: var(--primary-green, #1e4d2b); font-weight: bold;">$${parseFloat(tx.sale_price).toFixed(2)}</span> on ${new Date(tx.sale_date).toLocaleDateString()}`;
                            txList.appendChild(row);
                        });
                    }
                }
            })
            .catch(err => console.error("Error loading sales data:", err));
    }

    // -------------------------------------------------------------
    // 9. BOOK EDIT & DELETE MODAL HANDLERS
    // -------------------------------------------------------------
    const editModal = document.getElementById('edit-book-modal');
    const editForm = document.getElementById('edit-book-form');
    const closeModalBtn = document.getElementById('close-modal-btn');

    window.openEditModal = function(id, description, price) {
        if (!editModal) return;
        document.getElementById('edit-book-id').value = id;
        document.getElementById('edit-book-description').value = description;
        document.getElementById('edit-book-price').value = price;
        editModal.style.display = 'flex';
    };

    if (closeModalBtn) {
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
                    editModal.style.display = 'none';
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

            const unreadCount = notifications.filter(n => n.is_read === 0).length;

            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }

            if (notifications.length === 0) {
                listContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted, #777); font-size: 13px; padding: 15px 0;">No new notifications</p>`;
                return;
            }

            listContainer.innerHTML = notifications.map(notif => `
                <div class="notif-card ${notif.is_read ? '' : 'unread'}">
                    <span class="notif-card-title">📢 ${notif.title}</span>
                    <p class="notif-card-body">${notif.message}</p>
                    <small class="notif-card-date">${new Date(notif.createdAt || notif.created_at).toLocaleDateString()}</small>
                </div>
            `).join('');
        })
        .catch(err => console.error("Notification load error:", err));
}

window.toggleNotifDropdown = function() {
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
};
