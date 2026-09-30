document.addEventListener('DOMContentLoaded', () => {
    const state = {
        currentEditingBookId: null,
        currentEditingChapterId: null
    };

    const apiFetch = async (url, options = {}) => {
        const customOptions = { ...options };

        if (!(customOptions.body instanceof FormData)) {
            customOptions.headers = {
                ...(customOptions.headers || {}),
                'Content-Type': 'application/json'
            };
        }

        const response = await fetch(url, {
            credentials: 'same-origin',
            ...customOptions
        });

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await response.json()
            : await response.text();

        if (!response.ok) {
            const message =
                typeof payload === 'object' && payload && payload.error
                    ? payload.error
                    : `Request failed with status ${response.status}`;

            if (response.status === 401) {
                window.location.href = '/login';
            }

            throw new Error(message);
        }

        return payload;
    };

    const navItems = {
        'dashboard-view': document.getElementById('menu-dash'),
        'creator-view': document.getElementById('menu-create'),
        'studio-view': document.getElementById('menu-studio'),
        'sales-view': document.getElementById('menu-sales'),
        'profile-view': document.getElementById('menu-profile')
    };

    window.switchTab = function(targetTabId, evt) {
        if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();

        document.querySelectorAll('.view-section').forEach((view) => {
            view.classList.add('hidden');
        });

        document.querySelectorAll('.side-menu .menu-item').forEach((item) => {
            item.classList.remove('active');
        });

        const targetView = document.getElementById(targetTabId);
        if (targetView) targetView.classList.remove('hidden');

        if (navItems[targetTabId]) {
            navItems[targetTabId].classList.add('active');
        }

        if (targetTabId === 'dashboard-view') loadDashboardBooks();
        if (targetTabId === 'studio-view') loadStudioWebBooks();
        if (targetTabId === 'sales-view') loadSalesAnalytics();
        if (targetTabId === 'profile-view') loadAuthorProfile();
    };

    const quickCreateTrigger = document.getElementById('quick-create-trigger');
    if (quickCreateTrigger) {
        quickCreateTrigger.addEventListener('click', (event) => switchTab('creator-view', event));
    }

    const modeRadios = document.querySelectorAll('input[name="upload-mode"]');
    const pdfGroup = document.getElementById('pdf-input-group');
    const htmlGroup = document.getElementById('html-input-group');
    const ruleSelect = document.getElementById('book-download-rule');

    function handleFormatChange(selectedMode) {
        const mode = selectedMode || 'pdf';

        if (mode === 'pdf') {
            if (pdfGroup) pdfGroup.classList.remove('hidden');
            if (htmlGroup) htmlGroup.classList.add('hidden');
            if (ruleSelect && ruleSelect.options[1]) {
                ruleSelect.options[1].disabled = false;
            }
            return;
        }

        if (pdfGroup) pdfGroup.classList.add('hidden');
        if (htmlGroup) htmlGroup.classList.remove('hidden');

        if (ruleSelect) {
            ruleSelect.value = '0';
            if (ruleSelect.options[1]) {
                ruleSelect.options[1].disabled = true;
            }
        }
    }

    modeRadios.forEach((radio) => {
        radio.addEventListener('change', (event) => {
            handleFormatChange(event.target.value);
        });
    });

    const checkedRadio = document.querySelector('input[name="upload-mode"]:checked');
    if (checkedRadio) {
        handleFormatChange(checkedRadio.value);
    }

    const categorySelect = document.getElementById('book-category');
    const subThemeGroup = document.getElementById('sub-theme-group');

    if (categorySelect && subThemeGroup) {
        const syncSubThemeVisibility = () => {
            subThemeGroup.style.display =
                categorySelect.value === 'Shona Novels' ? 'block' : 'none';
        };

        categorySelect.addEventListener('change', syncSubThemeVisibility);
        syncSubThemeVisibility();
    }

    async function loadCurrentUser() {
        try {
            const data = await apiFetch('/api/auth/me');

            if (!data.loggedIn || !data.user) {
                window.location.href = '/login';
                return;
            }

            const displayName =
                data.user.name ||
                data.user.legal_name ||
                data.user.username ||
                '';

            const welcomeTag = document.querySelector('.welcome-tag');
            if (welcomeTag) {
                welcomeTag.textContent = `Welcome 👤 ${displayName}`;
            }

            const authorNameInput = document.getElementById('book-author-name');
            if (authorNameInput && !authorNameInput.value) {
                authorNameInput.value = displayName;
            }
        } catch (error) {
            console.error('Failed to load user info:', error);
        }
    }

    function getBookMode(book) {
        return String(book.mode || 'pdf').toLowerCase();
    }

    function getBookCover(book) {
        return book.cover_image || book.coverImage || '/images/default-cover.png';
    }

    function escapeText(input) {
        return String(input ?? '');
    }

    async function loadDashboardBooks() {
        const container = document.getElementById('author-books-container');
        if (!container) return;

        container.innerHTML = '<p style="color: var(--text-dark, #222); opacity: 0.6; width: 100%;">Loading your books...</p>';

        try {
            const books = await apiFetch('/api/books/my-books');
            container.innerHTML = '';

            if (!Array.isArray(books) || books.length === 0) {
                container.innerHTML = '<p style="color: var(--text-dark, #222); opacity: 0.6; width: 100%;">You have not published any books yet.</p>';
                return;
            }

            books.forEach((book) => {
                const card = document.createElement('div');
                card.className = 'author-book-card';

                const cover = document.createElement('img');
                cover.className = 'cover-thumb';
                cover.src = getBookCover(book);
                cover.alt = escapeText(book.title || 'Book cover');
                cover.onerror = function() {
                    this.src = '/images/default-cover.png';
                };

                const meta = document.createElement('div');
                meta.className = 'book-meta';

                const title = document.createElement('h3');
                title.textContent = book.title || 'Untitled Book';

                const description = document.createElement('p');
                const rawDescription = escapeText(book.description || '');
                description.textContent = rawDescription.length > 80
                    ? `${rawDescription.substring(0, 80)}...`
                    : rawDescription;

                const price = document.createElement('p');
                const rawPrice = Number(book.price) || 0;
                price.innerHTML = `<strong>Price:</strong> <span style="color: var(--primary-green-light, #27ae60);">$${rawPrice.toFixed(2)} USD</span>`;

                const badge = document.createElement('p');
                badge.innerHTML = `<span class="badge ${book.status === 'Draft' ? 'status-draft' : 'status-pub'}">${getBookMode(book).toUpperCase()}</span>`;

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '8px';
                actions.style.marginTop = '10px';

                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.textContent = 'Edit';
                editButton.style.background = 'var(--primary-green, #1b3d2b)';
                editButton.style.color = 'white';
                editButton.style.border = 'none';
                editButton.style.padding = '6px 12px';
                editButton.style.borderRadius = '4px';
                editButton.style.cursor = 'pointer';
                editButton.addEventListener('click', () => {
                    window.openEditModal(
                        book.id,
                        book.description || '',
                        rawPrice,
                        getBookMode(book)
                    );
                });

                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.textContent = 'Delete';
                deleteButton.style.background = 'var(--danger-red, #dc3545)';
                deleteButton.style.color = 'white';
                deleteButton.style.border = 'none';
                deleteButton.style.padding = '6px 12px';
                deleteButton.style.borderRadius = '4px';
                deleteButton.style.cursor = 'pointer';
                deleteButton.addEventListener('click', () => {
                    window.deleteBook(book.id);
                });

                actions.appendChild(editButton);
                actions.appendChild(deleteButton);

                meta.appendChild(title);
                meta.appendChild(description);
                meta.appendChild(price);
                meta.appendChild(badge);
                meta.appendChild(actions);

                card.appendChild(cover);
                card.appendChild(meta);
                container.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to fetch author books:', error);
            container.innerHTML = `<p style="color: var(--danger-red, #dc3545);">Unable to load books: ${escapeText(error.message)}</p>`;
        }
    }

    const publishForm = document.getElementById('publish-master-form');
    if (publishForm) {
        publishForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(publishForm);
            const selectedMode = document.querySelector('input[name="upload-mode"]:checked')?.value || 'pdf';
            formData.set('mode', selectedMode);

            const titleValue = (document.getElementById('book-title')?.value || '').trim();
            if (!titleValue) {
                alert('Please enter a book title.');
                return;
            }

            const priceValue = Number(document.getElementById('book-price')?.value || '0');
            if (!Number.isFinite(priceValue) || priceValue < 0) {
                alert('Book price must be a valid non-negative number.');
                return;
            }

            const copyrightAccepted = document.getElementById('copyright-ownership-check')?.checked === true;
            const termsAccepted = document.getElementById('copyright-terms-check')?.checked === true;
            formData.set('agreeCopyright', String(copyrightAccepted));
            formData.set('agreeTerms', String(termsAccepted));

            const downloadRule = document.getElementById('book-download-rule');
            const allowDownload = selectedMode === 'html'
                ? '0'
                : (downloadRule?.value || '0');
            formData.set('allowDownload', allowDownload);

            if (selectedMode === 'html') {
                const chapterTitle = (document.getElementById('initial-chapter-title')?.value || '').trim();
                const chapterBody = (document.getElementById('initial-chapter-body')?.value || '').trim();
                formData.set('chapterTitle', chapterTitle);
                formData.set('chapterBody', chapterBody);
                formData.set('content', chapterBody);
            }

            try {
                const result = await apiFetch('/api/books/publish', {
                    method: 'POST',
                    body: formData
                });

                alert(result.message || '🎉 Success! Your book has been published.');
                publishForm.reset();
                handleFormatChange('pdf');
                switchTab('dashboard-view');
                await loadDashboardBooks();
            } catch (error) {
                console.error('Publishing failed:', error);
                alert(`⚠️ Publishing failed: ${error.message}`);
            }
        });
    }

    function loadAuthorProfile() {
        const profileForm = document.getElementById('author-profile-form');
        if (!profileForm) return;

        apiFetch('/api/author/profile')
            .then((data) => {
                if (!data) return;

                const phone = document.getElementById('author-phone');
                const bio = document.getElementById('author-bio');

                if (phone) phone.value = data.phone || '';
                if (bio) bio.value = data.bio || '';
            })
            .catch((error) => {
                console.error('Failed to load author profile:', error);
            });
    }

    const profileForm = document.getElementById('author-profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(profileForm);

            const phoneInput = document.getElementById('author-phone');
            const bioInput = document.getElementById('author-bio');

            if (phoneInput) formData.set('phone', phoneInput.value.trim());
            if (bioInput) formData.set('bio', bioInput.value.trim());

            try {
                const result = await apiFetch('/api/author/profile', {
                    method: 'POST',
                    body: formData
                });

                alert(result.message || '✅ Author profile details updated successfully!');
                await loadAuthorProfile();
            } catch (error) {
                console.error('Profile update failed:', error);
                alert(`⚠️ Profile update failed: ${error.message}`);
            }
        });
    }

    const studioBooksList = document.getElementById('studio-books-list');
    const studioEditorPanel = document.getElementById('studio-editor-panel');
    const studioEditorPlaceholder = document.getElementById('studio-editor-placeholder');
    const studioChaptersList = document.getElementById('studio-chapters-list');
    const addChapterForm = document.getElementById('add-chapter-form');

    async function loadStudioWebBooks() {
        if (!studioBooksList) return;

        try {
            const books = await apiFetch('/api/books/my-web-books');
            studioBooksList.innerHTML = '';

            if (!Array.isArray(books) || books.length === 0) {
                studioBooksList.innerHTML = '<p style="font-size: 13px; color: var(--text-muted, #777);">No web books found. Create one under "Create New Book" with HTML/Web option!</p>';
                return;
            }

            books.forEach((book) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'studio-book-select-btn';
                button.style.cssText = 'width: 100%; text-align: left; padding: 10px; margin-bottom: 8px; border: 1px solid var(--border-tan, #ccc); background: var(--bg-cream-light, #fafafa); border-radius: 4px; cursor: pointer;';
                button.textContent = book.title || 'Untitled web book';
                button.addEventListener('click', () => selectStudioBook(book));
                studioBooksList.appendChild(button);
            });
        } catch (error) {
            console.error('Error loading web books:', error);
        }
    }

    function selectStudioBook(book) {
        if (studioEditorPlaceholder) studioEditorPlaceholder.classList.add('hidden');
        if (studioEditorPanel) studioEditorPanel.classList.remove('hidden');

        const titleElem = document.getElementById('current-editing-book-title');
        const idInput = document.getElementById('editor-book-id');

        if (titleElem) titleElem.textContent = book.title || 'Untitled web book';
        if (idInput) idInput.value = book.id;

        loadChapters(book.id);
    }

    async function loadChapters(bookId) {
        const list = document.getElementById('studio-chapters-list');
        if (!list) return;

        list.innerHTML = '<p style="font-size: 12px; color: var(--text-muted, #777);">Loading chapters...</p>';

        try {
            const chapters = await apiFetch(`/api/books/${encodeURIComponent(bookId)}/chapters`);
            list.innerHTML = '';

            if (!Array.isArray(chapters) || chapters.length === 0) {
                list.innerHTML = '<p style="font-size: 12px; color: var(--text-muted, #777);">No chapters added yet.</p>';
                return;
            }

            chapters.forEach((chapter, index) => {
                const item = document.createElement('div');
                item.style.cssText = 'background: #f8f9fa; border: 1px solid #ddd; padding: 10px; border-radius: 4px; font-size: 13px; margin-bottom: 6px;';
                item.innerHTML = `<strong>Chapter ${chapter.chapter_number || index + 1}:</strong> ${escapeText(chapter.title || 'Untitled')}</>`;
                list.appendChild(item);
            });
        } catch (error) {
            console.error('Error loading chapters:', error);
            list.innerHTML = '<p style="font-size: 12px; color: var(--text-muted, #777);">Unable to load chapters.</p>';
        }
    }

    if (addChapterForm) {
        addChapterForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const bookId = document.getElementById('editor-book-id')?.value;
            const titleInput = document.getElementById('new-chapter-title');
            const bodyInput = document.getElementById('new-chapter-body');

            const title = titleInput?.value.trim() || '';
            const bodyContent = bodyInput?.value.trim() || '';

            if (!bookId || !title || !bodyContent) {
                alert('Please provide both a chapter title and chapter content.');
                return;
            }

            try {
                await apiFetch(`/api/books/${encodeURIComponent(bookId)}/chapters`, {
                    method: 'POST',
                    body: JSON.stringify({ title, body: bodyContent })
                });

                if (titleInput) titleInput.value = '';
                if (bodyInput) bodyInput.value = '';

                await loadChapters(bookId);
                alert('📖 Chapter added and published successfully!');
            } catch (error) {
                console.error('Failed to add chapter:', error);
                alert(`⚠️ Failed to add chapter: ${error.message}`);
            }
        });
    }

    async function loadSalesAnalytics() {
        try {
            const data = await apiFetch('/api/analytics/sales');

            const totalEarnings = document.getElementById('stats-total-earnings');
            const netRoyalties = document.getElementById('stats-net-royalties');
            const totalSales = document.getElementById('stats-total-sales');

            const grossTotal = Number(data.totalEarnings || data.total_earnings || 0);
            const authorNet75 = (grossTotal * 0.75).toFixed(2);
            const platformFee20 = (grossTotal * 0.20).toFixed(2);
            const opsFee5 = (grossTotal * 0.05).toFixed(2);

            if (totalEarnings) totalEarnings.textContent = `$${grossTotal.toFixed(2)}`;
            if (netRoyalties) netRoyalties.textContent = `$${authorNet75}`;
            if (totalSales) totalSales.textContent = String(data.totalSalesCount || data.total_sales_count || 0);

            const ecocashBal = document.getElementById('dashboard-ecocash-balance');
            const platformFee = document.getElementById('dashboard-platform-fee');
            const opsFee = document.getElementById('dashboard-ops-fee');

            if (ecocashBal) ecocashBal.textContent = `$${authorNet75} USD`;
            if (platformFee) platformFee.textContent = `$${platformFee20} USD`;
            if (opsFee) opsFee.textContent = `$${opsFee5} USD`;

            const breakdownList = document.getElementById('sales-breakdown-list');
            if (breakdownList) {
                breakdownList.innerHTML = '';

                if (!data.bookBreakdown || Object.keys(data.bookBreakdown).length === 0) {
                    breakdownList.innerHTML = '<p style="font-size: 13px; color: var(--text-muted, #777);">No sales recorded yet.</p>';
                } else {
                    Object.entries(data.bookBreakdown).forEach(([title, stats]) => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display: flex; justify-content: space-between; border-bottom: 1px dashed #eee; padding: 8px 0; font-size: 13px;';
                        const bookGross = Number(stats.earnings || 0);
                        const bookNet = (bookGross * 0.75).toFixed(2);
                        row.innerHTML = `<span><strong>${escapeText(title)}</strong> (${escapeText(stats.sales)} sold)</span><strong style="color: var(--primary-green, #1b3d2b);">$${bookNet} Net</strong>`;
                        breakdownList.appendChild(row);
                    });
                }
            }

            const txList = document.getElementById('recent-transactions-list');
            const dashActivityLog = document.getElementById('dashboard-activity-log');

            if (txList) {
                txList.innerHTML = '';
                if (dashActivityLog) dashActivityLog.innerHTML = '';

                if (!data.recentTransactions || data.recentTransactions.length === 0) {
                    const emptyMsg = '<p style="font-size: 13px; color: var(--text-muted, #777); padding: 10px 0;">No transactions available.</p>';
                    txList.innerHTML = emptyMsg;
                    if (dashActivityLog) dashActivityLog.innerHTML = emptyMsg;
                    return;
                }

                data.recentTransactions.forEach((tx) => {
                    const salePrice = Number(tx.sale_price || 0);
                    const netEarned = (salePrice * 0.75).toFixed(2);
                    const rowHtml = `
                        <span><strong>${escapeText(tx.buyer_name || 'Anonymous')}</strong> purchased <em>${escapeText(tx.book_title || 'Unknown book')}</em></span>
                        <span style="color: var(--primary-green-light, #27ae60); font-weight: bold;">+$${netEarned}</span>
                    `;

                    const txRow = document.createElement('div');
                    txRow.className = 'log-item';
                    txRow.innerHTML = rowHtml;
                    txList.appendChild(txRow);

                    if (dashActivityLog) {
                        const logRow = document.createElement('div');
                        logRow.className = 'log-item';
                        logRow.style.cssText = 'display: flex; justify-content: space-between; border-bottom: 1px solid #f0f0f0; padding: 8px 0; font-size: 12px;';
                        logRow.innerHTML = rowHtml;
                        dashActivityLog.appendChild(logRow);
                    }
                });
            }
        } catch (error) {
            console.error('Error loading sales data:', error);
        }
    }

    const editModal = document.getElementById('edit-book-modal');
    const editForm = document.getElementById('edit-book-form');
    const closeModalBtn = document.getElementById('close-modal-btn');

    window.openEditModal = async function(id, description, price, mode) {
        if (!editModal) return;

        state.currentEditingBookId = id;
        state.currentEditingChapterId = null;

        const idInput = document.getElementById('edit-book-id');
        const descInput = document.getElementById('edit-book-description');
        const priceInput = document.getElementById('edit-book-price');

        if (idInput) idInput.value = id;
        if (descInput) descInput.value = description || '';
        if (priceInput) priceInput.value = Number(price || 0).toFixed(2);

        let chapterGroup = document.getElementById('edit-chapter-group');
        const contentTextArea = document.getElementById('edit-book-content') || document.getElementById('edit-chapter-body');

        // Setup AI Formatter Trigger Button dynamically inside the Edit Modal if HTML mode
        let formatterTriggerBtn = document.getElementById('launch-formatter-btn');
        if (!formatterTriggerBtn && contentTextArea) {
            formatterTriggerBtn = document.createElement('button');
            formatterTriggerBtn.type = 'button';
            formatterTriggerBtn.id = 'launch-formatter-btn';
            formatterTriggerBtn.innerHTML = '<i class="fas fa-magic"></i> Open AI Layout Formatter';
            formatterTriggerBtn.style.cssText = 'margin-bottom: 10px; padding: 6px 12px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; display: block;';
            formatterTriggerBtn.addEventListener('click', () => {
                if (typeof openLayoutFormatter === 'function') {
                    openLayoutFormatter(contentTextArea.id, id, state.currentEditingChapterId);
                } else {
                    alert('Formatter utility is not loaded.');
                }
            });
            contentTextArea.parentNode.insertBefore(formatterTriggerBtn, contentTextArea);
        }

        if (String(mode).toLowerCase() === 'html') {
            if (formatterTriggerBtn) formatterTriggerBtn.style.display = 'block';

            if (!chapterGroup && editForm) {
                chapterGroup = document.createElement('div');
                chapterGroup.id = 'edit-chapter-group';
                chapterGroup.className = 'form-group';
                chapterGroup.style.marginBottom = '15px';
                chapterGroup.innerHTML = `
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">SELECT CHAPTER TO EDIT</label>
                    <select id="edit-chapter-select" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;"></select>
                `;

                if (contentTextArea) {
                    contentTextArea.parentNode.insertBefore(chapterGroup, contentTextArea);
                } else {
                    editForm.appendChild(chapterGroup);
                }
            }

            if (chapterGroup) chapterGroup.style.display = 'block';
            if (contentTextArea) contentTextArea.style.display = 'block';

            try {
                const chapters = await apiFetch(`/api/books/${encodeURIComponent(id)}/chapters`);
                const selectElem = document.getElementById('edit-chapter-select');

                if (selectElem) {
                    selectElem.innerHTML = '';

                    if (Array.isArray(chapters) && chapters.length > 0) {
                        chapters.forEach((chapter) => {
                            const option = document.createElement('option');
                            option.value = chapter.id;
                            option.textContent = `Chapter ${chapter.chapter_number || ''}: ${chapter.title || 'Untitled'}`;
                            option.dataset.title = chapter.title || 'Chapter';
                            option.dataset.body = chapter.body || chapter.content || '';
                            selectElem.appendChild(option);
                        });

                        state.currentEditingChapterId = chapters[0].id;
                        if (contentTextArea) contentTextArea.value = chapters[0].body || chapters[0].content || '';

                        selectElem.onchange = () => {
                            const selectedOption = selectElem.options[selectElem.selectedIndex];
                            state.currentEditingChapterId = selectedOption?.value || null;
                            if (contentTextArea) {
                                contentTextArea.value = selectedOption?.dataset.body || '';
                            }
                        };
                    } else {
                        selectElem.innerHTML = '<option value="">No chapters found</option>';
                        if (contentTextArea) contentTextArea.value = '';
                    }
                }
            } catch (error) {
                console.error('Failed to load chapter content for editing:', error);
            }
        } else {
            if (formatterTriggerBtn) formatterTriggerBtn.style.display = 'none';
            if (chapterGroup) chapterGroup.style.display = 'none';
            if (contentTextArea) contentTextArea.style.display = 'none';
        }

        editModal.style.display = 'flex';
    };

    if (closeModalBtn && editModal) {
        closeModalBtn.addEventListener('click', () => {
            editModal.style.display = 'none';
        });
    }

    if (editForm) {
        editForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const id = document.getElementById('edit-book-id')?.value;
            const description = document.getElementById('edit-book-description')?.value || '';
            const price = document.getElementById('edit-book-price')?.value || '0';
            const contentTextArea = document.getElementById('edit-book-content') || document.getElementById('edit-chapter-body');
            const pdfFileInput = document.getElementById('edit-book-pdf-file');

            if (!id) {
                alert('Missing book ID.');
                return;
            }

            try {
                // Package updates into FormData to support optional replacement PDF files
                const formData = new FormData();
                formData.append('description', description);
                formData.append('price', price);

                if (pdfFileInput && pdfFileInput.files[0]) {
                    formData.append('pdfFile', pdfFileInput.files[0]);
                }

                const bookResult = await apiFetch(`/api/books/${encodeURIComponent(id)}`, {
                    method: 'PUT',
                    body: formData
                });

                if (bookResult && bookResult.error) {
                    alert(`❌ ${bookResult.error}`);
                    return;
                }

                if (state.currentEditingChapterId && contentTextArea) {
                    const selectElem = document.getElementById('edit-chapter-select');
                    const selectedOption = selectElem ? selectElem.options[selectElem.selectedIndex] : null;
                    const chapterTitle = selectedOption?.dataset.title || 'Chapter';

                    await apiFetch(`/api/books/chapters/${encodeURIComponent(state.currentEditingChapterId)}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            title: chapterTitle,
                            body: contentTextArea.value
                        })
                    });
                }

                alert('✅ Book details and files updated successfully!');
                if (editModal) editModal.style.display = 'none';
                if (pdfFileInput) pdfFileInput.value = '';
                await loadDashboardBooks();
            } catch (error) {
                console.error('Error saving book edits:', error);
                alert(`⚠️ An error occurred while updating the book: ${error.message}`);
            }
        });
    }

    window.deleteBook = function(id) {
        if (!confirm('⚠️ Are you sure you want to permanently delete this book? This action cannot be undone.')) {
            return;
        }

        apiFetch(`/api/books/${encodeURIComponent(id)}`, { method: 'DELETE' })
            .then((data) => {
                alert(data.message || '🗑️ Book permanently removed.');
                loadDashboardBooks();
            })
            .catch((error) => {
                console.error('Delete failed:', error);
                alert(`❌ ${error.message}`);
            });
    };

    async function loadNotifications() {
        try {
            const notifications = await apiFetch('/api/notifications');
            const listContainer = document.getElementById('notif-list-container');
            const badge = document.getElementById('notif-badge');

            if (!listContainer || !Array.isArray(notifications)) return;

            const unreadCount = notifications.filter((notification) => !notification.is_read).length;

            if (badge) {
                badge.textContent = String(unreadCount);
                badge.classList.toggle('hidden', unreadCount === 0);
            }

            listContainer.innerHTML = '';

            if (notifications.length === 0) {
                listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted, #777); font-size: 13px; padding: 15px 0;">No new notifications</p>';
                return;
            }

            notifications.forEach((notif) => {
                const card = document.createElement('div');
                card.className = `notif-card ${notif.is_read ? '' : 'unread'}`;
                card.style.cursor = 'pointer';

                const title = document.createElement('span');
                title.className = 'notif-card-title';
                title.style.fontWeight = 'bold';
                title.style.fontSize = '13px';
                title.style.display = 'block';
                title.textContent = `📢 ${notif.title || ''}`;

                const message = document.createElement('p');
                message.className = 'notif-card-body';
                message.style.margin = '4px 0';
                message.style.fontSize = '12px';
                message.style.color = 'var(--text-dark, #222)';
                message.textContent = notif.message || '';

                const time = document.createElement('small');
                time.className = 'notif-card-date';
                time.style.fontSize = '10px';
                time.style.color = 'var(--text-muted, #777)';
                time.textContent = new Date(notif.createdAt || notif.created_at).toLocaleDateString();

                card.appendChild(title);
                card.appendChild(message);
                card.appendChild(time);

                card.addEventListener('click', async () => {
                    try {
                        await apiFetch(`/api/notifications/${encodeURIComponent(notif.id)}/read`, {
                            method: 'POST'
                        });
                        await loadNotifications();
                    } catch (error) {
                        console.error('Failed to mark notification as read:', error);
                    }
                });

                listContainer.appendChild(card);
            });
        } catch (error) {
            console.error('Notification load error:', error);
        }
    }

    window.toggleNotifDropdown = function() {
        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown) dropdown.classList.toggle('hidden');
    };

    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('notif-dropdown');
        const bellBtn = document.getElementById('notif-bell-btn');

        if (dropdown && !dropdown.classList.contains('hidden') && bellBtn && !bellBtn.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.add('hidden');
        }
    });

    loadCurrentUser();
    loadDashboardBooks();
    loadNotifications();
    loadSalesAnalytics();
    loadAuthorProfile();
});
