document.addEventListener('DOMContentLoaded', async () => {
    // ==========================================
    //       CORE WORKSPACE DOM SELECTORS
    // ==========================================
    const menuDash = document.getElementById('menu-dash');
    const menuCreate = document.getElementById('menu-create');
    const menuStudio = document.getElementById('menu-studio'); // Web Studio sidebar link
    const quickCreate = document.getElementById('quick-create-trigger');
    const dashboardView = document.getElementById('dashboard-view');
    const creatorView = document.getElementById('creator-view');
    const studioView = document.getElementById('studio-view'); // Web Studio section view
    const menuSales = document.getElementById('menu-sales');
    const salesView = document.getElementById('sales-view');
    // Select dynamic document type elements
    const modeOptions = document.querySelectorAll('input[name="upload-mode"]');
    const pdfGroup = document.getElementById('pdf-input-group');
    const htmlGroup = document.getElementById('html-input-group');

    // ==========================================
    //       SESSION CHECK & AUTHOR PROFILE
    // ==========================================
    let currentUser = null;

    try {
        const authResponse = await fetch('/api/auth/me');
        const authData = await authResponse.json();

        if (!authResponse.ok || !authData.loggedIn) {
            // If session is expired or invalid, boot to login
            window.location.href = '/login';
            return;
        }

        currentUser = authData.user;

        // Dynamic Greeting swap! Replaces 'Welcome, Chengetai 👤' dynamically
        const welcomeTag = document.querySelector('.welcome-tag');
        if (welcomeTag) {
            welcomeTag.innerHTML = `Welcome, ${currentUser.username} 👤`;
        }
        
        // Dynamic Greeting swap fallback
        const welcomeElement = document.querySelector('.logo + p, header p, .welcome-text, [class*="Welcome"]');
        if (welcomeElement) {
            welcomeElement.innerHTML = `Welcome, ${currentUser.username} <span style="font-size:12px; opacity:0.7;">👤</span>`;
        }

       // Load Author's actual books & populate actual balance metrics
        loadAuthorBooks();
        loadSalesAnalytics();

    } catch (err) {
        console.error("Auth check error:", err);
        window.location.href = '/login';
        return;
    }

    // ==========================================
    //         4-WAY VIEW TOGGLING SYSTEM
    // ==========================================
    function showDashboard() {
        dashboardView.classList.remove('hidden');
        creatorView.classList.add('hidden');
        if (studioView) studioView.classList.add('hidden');
        if (salesView) salesView.classList.add('hidden');
        
        menuDash.classList.add('active');
        if (menuCreate) menuCreate.classList.remove('active');
        if (menuStudio) menuStudio.classList.remove('active');
        if (menuSales) menuSales.classList.remove('active');
    }

    function showCreator() {
        dashboardView.classList.add('hidden');
        creatorView.classList.remove('hidden');
        if (studioView) studioView.classList.add('hidden');
        if (salesView) salesView.classList.add('hidden');
        
        menuDash.classList.remove('active');
        if (menuCreate) menuCreate.classList.add('active');
        if (menuStudio) menuStudio.classList.remove('active');
        if (menuSales) menuSales.classList.remove('active');
    }

    function showStudio() {
        dashboardView.classList.add('hidden');
        creatorView.classList.add('hidden');
        if (studioView) studioView.classList.remove('hidden');
        if (salesView) salesView.classList.add('hidden');
        
        menuDash.classList.remove('active');
        if (menuCreate) menuCreate.classList.remove('active');
        if (menuStudio) menuStudio.classList.add('active');
        if (menuSales) menuSales.classList.remove('active');
        loadStudioBooks();
    }

    function showSales() {
        dashboardView.classList.add('hidden');
        creatorView.classList.add('hidden');
        if (studioView) studioView.classList.add('hidden');
        if (salesView) salesView.classList.remove('hidden');
        
        menuDash.classList.remove('active');
        if (menuCreate) menuCreate.classList.remove('active');
        if (menuStudio) menuStudio.classList.remove('active');
        if (menuSales) menuSales.classList.add('active');
        loadSalesAnalytics(); // Fetch data dynamically
    }

    // Attach Sidebar Navigation Event Listeners
    if (menuDash) menuDash.addEventListener('click', (e) => { e.preventDefault(); showDashboard(); });
    if (menuCreate) menuCreate.addEventListener('click', (e) => { e.preventDefault(); showCreator(); });
    if (menuStudio) menuStudio.addEventListener('click', (e) => { e.preventDefault(); showStudio(); });
    if (menuSales) menuSales.addEventListener('click', (e) => { e.preventDefault(); showSales(); });
    if (quickCreate) quickCreate.addEventListener('click', showCreator);

    // Conditional Creation Elements Listener (PDF vs Online)
    modeOptions.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'pdf') {
                pdfGroup.classList.remove('hidden');
                htmlGroup.classList.add('hidden');
            } else {
                pdfGroup.classList.add('hidden');
                htmlGroup.classList.remove('hidden');
            }
        });
    });

    // ==========================================
    //   ASYNCHRONOUS FORM PIPELINE SUBMISSION
    // ==========================================
    const publishForm = document.getElementById('publish-master-form');
    if (publishForm) {
        publishForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Extraction: Pull book parameters safely
            const title = publishForm.querySelector('input[placeholder="Enter Book Title"]').value;
            const description = document.getElementById('book-description').value; 
            const price = publishForm.querySelector('input[placeholder="e.g. 5.00"]').value;
            const mode = publishForm.querySelector('input[name="upload-mode"]:checked').value;
            const allowDownload = document.getElementById('book-download-rule').value; 
            const coverInput = document.getElementById('cover-upload');
            
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', description); 
            formData.append('price', price);
            formData.append('mode', mode);
            formData.append('allowDownload', allowDownload); 
            
            // Check and isolate the cover image file
            if (coverInput && coverInput.files && coverInput.files.length > 0) {
                const physicalCoverFile = coverInput.files[0];
                formData.append('coverImage', physicalCoverFile);
            } else {
                alert('Please select a front cover image first.');
                return;
            }
            
            if (mode === 'pdf') {
                const pdfInput = document.getElementById('pdf-upload');
                if (pdfInput && pdfInput.files && pdfInput.files.length > 0) {
                    const physicalPdfFile = pdfInput.files[0]; 
                    formData.append('pdfBook', physicalPdfFile);
                } else {
                    alert('Please attach your book PDF manuscript file.');
                    return;
                }
            } else {
                // FIXED: Targeted the specific chapter inputs directly using placeholders
                const chapterTitleInput = publishForm.querySelector('input[placeholder="e.g. Chapter 1: The Journey Begins"]');
                const chapterBodyInput = publishForm.querySelector('textarea[placeholder="Paste or type your chapter text here..."]');
                const chapterTitle = chapterTitleInput ? chapterTitleInput.value : '';
                const chapterBody = chapterBodyInput ? chapterBodyInput.value : '';
                formData.append('chapterTitle', chapterTitle);
                formData.append('chapterBody', chapterBody);
            }

            try {
                const submitBtn = publishForm.querySelector('.save-master-btn');
                submitBtn.textContent = "Processing and Uploading Master File Master Pipeline...";
                submitBtn.disabled = true;

                const response = await fetch('/api/books/publish', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (response.ok) {
                    alert(`Content Uploaded Successfully! Reference Database ID: ${result.bookId}`);
                    publishForm.reset();
                    showDashboard(); 
                    location.reload(); 
                } else {
                    alert(`Pipeline Processing Failure: ${result.error}`);
                }
                submitBtn.textContent = "Save Content Profile";
                submitBtn.disabled = false;
            } catch (err) {
                console.error(err);
                alert('An unexpected server communication fault occurred.');
                const submitBtn = publishForm.querySelector('.save-master-btn');
                if (submitBtn) {
                    submitBtn.textContent = "Save Content Profile";
                    submitBtn.disabled = false;
                }
            }
        });
    }

    // ==========================================
    //    FETCH AND RENDER AUTHOR'S BOOKS (UPDATED)
    // ==========================================
    async function loadAuthorBooks() {
        const container = document.getElementById('author-books-container');
        if (!container) return;

        try {
            const response = await fetch('/api/books/my-books');
            if (!response.ok) throw new Error('Failed to load books.');
            const books = await response.json();

            if (books.length === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: #fff; border-radius: 8px; border: 1px dashed var(--border-tan); width: 100%;">
                        <h3 style="color: var(--primary-green); margin-bottom: 8px;">You haven't published any books yet!</h3>
                        <p style="opacity: 0.7; margin-bottom: 15px;">Click the button below to publish your first masterpiece.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = ''; 

            books.forEach(book => {
                const bookCard = document.createElement('div');
                bookCard.className = 'author-book-card';
                bookCard.style.position = 'relative'; // Anchor for styling actions safely

                const coverStyle = book.coverImage 
                    ? `background: url('${book.coverImage}') no-repeat center; background-size: cover;` 
                    : '';

                const parsedPrice = typeof book.price === 'number' ? book.price : parseFloat(book.price) || 0.00;

                bookCard.innerHTML = `
                    <div class="cover-thumb" style="${coverStyle} width: 120px; height: 170px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 11px; padding: 5px; box-sizing: border-box; background-color: var(--primary-green); color: #fff;">
                        ${!book.coverImage ? book.title.toUpperCase() : ''}
                    </div>
                    <div class="book-meta" style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <h3 style="margin-bottom: 5px;">${book.title}</h3>
                            <p style="margin: 2px 0;"><strong>Type:</strong> ${book.mode.toUpperCase()}</p>
                            <p style="margin: 2px 0;"><strong>Distribution:</strong> ${parseInt(book.allowDownload) === 1 ? '🔓 Downloadable' : '🔒 Secure Stream'}</p>
                            <p style="margin: 2px 0;"><strong>Price:</strong> $${parsedPrice.toFixed(2)} USD</p>
                        </div>
                        
                        <!-- MANAGEMENT MANAGEMENT CONTROL FOOTER -->
                        <div style="margin-top: 10px; display: flex; gap: 8px;">
                            <button class="mgmt-edit-btn" style="background: #34495e; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: bold;">📝 Edit Details</button>
                            <button class="mgmt-del-btn" style="background: #c0392b; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: bold;">🗑️ Delete</button>
                        </div>
                    </div>
                `;

                // Wire up click mechanisms specifically for this single card element instance
                bookCard.querySelector('.mgmt-edit-btn').addEventListener('click', () => openEditModal(book));
                bookCard.querySelector('.mgmt-del-btn').addEventListener('click', () => deleteBookPipeline(book.id, book.title));

                container.appendChild(bookCard);
            });

        } catch (error) {
            console.error("Error loading books:", error);
            container.innerHTML = `<p style="color: red;">⚠️ Error feeding your books pipeline: ${error.message}</p>`;
        }
    }
    

    // ==========================================
    //      WEB STUDIO CLIENT RENDER ENGINE
    // ==========================================

    // 1. Fetch all 'html' mode books for the sidebar selector
    async function loadStudioBooks() {
        const booksListContainer = document.getElementById('studio-books-list');
        if (!booksListContainer) return;

        try {
            const response = await fetch('/api/books/my-web-books');
            const books = await response.json();

            if (books.length === 0) {
                booksListContainer.innerHTML = `
                    <p style="font-size: 13px; color: gray; text-align: center; padding: 10px;">
                        No Web Books found. Create one using the 'Create New Book' panel set to "Compose Online"!
                    </p>
                `;
                return;
            }

            booksListContainer.innerHTML = '';
            books.forEach(book => {
                const bookItem = document.createElement('div');
                bookItem.style = `
                    padding: 10px;
                    border: 1px solid var(--border-tan);
                    background-color: var(--bg-cream-light);
                    border-radius: 4px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                `;
                bookItem.innerHTML = `
                    <strong>${book.title}</strong>
                    <span style="font-size: 11px; display: block; opacity: 0.7;">Click to open Web Studio</span>
                `;
                bookItem.addEventListener('click', () => selectBookForStudio(book));
                booksListContainer.appendChild(bookItem);
            });

        } catch (err) {
            console.error("Error loading studio list:", err);
            booksListContainer.innerHTML = '<p style="color:red;">Error loading web books.</p>';
        }
    }

    // 2. Open specific book, hide placeholder, display chapter forms
    async function selectBookForStudio(book) {
        const placeholder = document.getElementById('studio-editor-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        
        const editorPanel = document.getElementById('studio-editor-panel');
        if (editorPanel) {
            editorPanel.classList.remove('hidden');
            editorPanel.style.display = 'block';
        }

        const titleHeader = document.getElementById('current-editing-book-title');
        if (titleHeader) titleHeader.textContent = book.title;

        const hiddenIdInput = document.getElementById('editor-book-id');
        if (hiddenIdInput) hiddenIdInput.value = book.id;

        loadChapters(book.id);
    }

    // 3. Load chapters already saved for this book
    async function loadChapters(bookId) {
        const chaptersContainer = document.getElementById('studio-chapters-list');
        if (!chaptersContainer) return;

        try {
            const response = await fetch(`/api/books/${bookId}/chapters`);
            const chapters = await response.json();

            if (chapters.length === 0) {
                chaptersContainer.innerHTML = `
                    <p style="font-size: 13px; color: gray; padding: 10px; background: var(--bg-cream-light); border-radius: 4px;">
                        No chapters written yet. Start writing Chapter 1 below!
                    </p>
                `;
                return;
            }

            chaptersContainer.innerHTML = '';
            chapters.forEach((ch, idx) => {
                const item = document.createElement('div');
                item.style = `
                    padding: 8px 12px;
                    background: #fdfdfd;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                `;
                item.innerHTML = `
                    <span><strong>Chapter ${idx + 1}:</strong> ${ch.title}</span>
                    <span style="font-size: 11px; color: gray;">Published: ${new Date(ch.created_at).toLocaleDateString()}</span>
                `;
                chaptersContainer.appendChild(item);
            });

        } catch (err) {
            console.error("Failed to load chapters:", err);
            chaptersContainer.innerHTML = '<p style="color: red;">Failed to retrieve chapters list.</p>';
        }
    }

    // 4. Handle Save Chapter submission
    const addChapterForm = document.getElementById('add-chapter-form');
    if (addChapterForm) {
        addChapterForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const bookId = document.getElementById('editor-book-id').value;
            const title = document.getElementById('new-chapter-title').value;
            const content = document.getElementById('new-chapter-body').value;

            try {
                const response = await fetch('/api/books/chapters', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookId, title, content })
                });

                const result = await response.json();

                if (response.ok) {
                    alert('🎉 Chapter saved and published successfully!');
                    addChapterForm.reset();
                    loadChapters(bookId); // Reload chapters list
                } else {
                    alert(`Save Failed: ${result.error}`);
                }
            } catch (err) {
                console.error(err);
                alert('Communication error saving chapter.');
            }
        });
    }
    // ==========================================
    //      MODAL CONTROLS & MANAGEMENT PIPELINE
    // ==========================================
    const editModal = document.getElementById('edit-book-modal');
    const closeModelBtn = document.getElementById('close-modal-btn');
    const editForm = document.getElementById('edit-book-form');

    function openEditModal(book) {
        if (!editModal) return;
        document.getElementById('edit-book-id').value = book.id;
        document.getElementById('edit-book-description').value = book.description;
        document.getElementById('edit-book-price').value = book.price;
        
        editModal.style.display = 'flex';
    }

    if (closeModelBtn) {
        closeModelBtn.addEventListener('click', () => {
            editModal.style.display = 'none';
        });
    }

    // Submit inline profile changes to SQLite
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-book-id').value;
            const description = document.getElementById('edit-book-description').value;
            const price = document.getElementById('edit-book-price').value;

            try {
                const response = await fetch(`/api/books/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description, price })
                });

                if (response.ok) {
                    alert('✨ Book profiles modified smoothly!');
                    editModal.style.display = 'none';
                    loadAuthorBooks(); // Refresh list display container
                } else {
                    const data = await response.json();
                    alert(`Update Error: ${data.error}`);
                }
            } catch (err) {
                console.error(err);
                alert('Communication breakdown during edit lifecycle execution.');
            }
        });
    }

    // Perform verification audit and issue DELETE instructions to backend
    async function deleteBookPipeline(bookId, title) {
        const doubleCheck = confirm(`⚠️ DANGER AUDIT:\nAre you absolutely certain you want to permanently erase "${title}"?\n\nThis cannot be undone, and all associated chapters will be cleared!`);
        if (!doubleCheck) return;

        try {
            const response = await fetch(`/api/books/${bookId}`, { method: 'DELETE' });
            if (response.ok) {
                alert(`💥 "${title}" has been safely purged from records.`);
                loadAuthorBooks(); // Re-render content stream
            } else {
                const data = await response.json();
                alert(`Purge Fault: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Server request execution interruption during book destruction sequence.');
        }
    }
    // ==========================================
    //      SALES & ROYALTIES DATA ENGINE
    // ==========================================
    // ==========================================
    //      SALES & ROYALTIES DATA ENGINE
    // ==========================================
    async function loadSalesAnalytics() {
        const statsEarnings = document.getElementById('stats-total-earnings');
        const statsSales = document.getElementById('stats-total-sales');
        const breakdownList = document.getElementById('sales-breakdown-list');
        const recentList = document.getElementById('recent-transactions-list');
        
        // Dashboard views elements
        const dashEcoCash = document.getElementById('dashboard-ecocash-balance');
        const dashActivityLog = document.getElementById('dashboard-activity-log');

        try {
            const response = await fetch('/api/analytics/sales');
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Failed to fetch sales analytics.');

            // Format total earnings
            const formattedEarnings = `$${data.totalEarnings.toFixed(2)} USD`;

            // Render Headline Metrics
            if (statsEarnings) statsEarnings.textContent = `$${data.totalEarnings.toFixed(2)}`;
            if (statsSales) statsSales.textContent = data.totalSalesCount;
            
            // Render on main Dashboard Cards (Replaces Mock Data!)
            if (dashEcoCash) dashEcoCash.textContent = formattedEarnings;

            // Render Book-by-Book Breakdowns
            if (breakdownList) {
                if (Object.keys(data.bookBreakdown).length === 0) {
                    breakdownList.innerHTML = `<p style="font-size:13px; color:gray; text-align:center; padding: 20px;">No sales recorded yet across your books.</p>`;
                } else {
                    breakdownList.innerHTML = '';
                    for (const [title, stats] of Object.entries(data.bookBreakdown)) {
                        const row = document.createElement('div');
                        row.style = `padding: 12px; border: 1px solid var(--border-tan); border-radius: 4px; background: var(--bg-cream-light); display: flex; justify-content: space-between; align-items: center;`;
                        row.innerHTML = `
                            <div>
                                <strong style="color:var(--primary-green);">${title}</strong>
                                <div style="font-size:11px; opacity:0.7;">Copies sold: ${stats.sales}</div>
                            </div>
                            <strong style="color:#2c3e50;">$${stats.earnings.toFixed(2)} USD</strong>
                        `;
                        breakdownList.appendChild(row);
                    }
                }
            }

            // Render Recent Transactions Feed (Both on Analytics view and main Dashboard view)
            if (data.recentTransactions.length === 0) {
                const emptyMsg = `<p style="font-size:13px; color:gray; text-align:center; padding:15px;">No customer purchase logs generated yet.</p>`;
                if (recentList) recentList.innerHTML = emptyMsg;
                if (dashActivityLog) dashActivityLog.innerHTML = `<p style="font-size:13px; color:gray; padding:10px 0;">No recent transactions.</p>`;
            } else {
                if (recentList) recentList.innerHTML = '';
                if (dashActivityLog) dashActivityLog.innerHTML = '';

                data.recentTransactions.forEach((tx, idx) => {
                    // Update main Analytics page transaction feed
                    if (recentList) {
                        const item = document.createElement('div');
                        item.style = `padding: 8px 12px; font-size:12px; background: #fff; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;`;
                        item.innerHTML = `
                            <div>
                                <strong>${tx.buyer_name}</strong> purchased <span style="font-style:italic;">${tx.book_title}</span>
                                <div style="font-size:10px; opacity:0.6;">${new Date(tx.sale_date).toLocaleString()}</div>
                            </div>
                            <strong style="color:#27ae60;">+$${tx.sale_price.toFixed(2)}</strong>
                        `;
                        recentList.appendChild(item);
                    }

                    // Update main Dashboard view activity logs (show top 3)
                    if (dashActivityLog && idx < 3) {
                        const logItem = document.createElement('div');
                        logItem.className = 'log-item';
                        logItem.innerHTML = `
                            <span>${tx.buyer_name} bought "${tx.book_title}"<br>
                            <small>${new Date(tx.sale_date).toLocaleDateString()}</small></span>
                            <strong>+ ${tx.sale_price} USD</strong>
                        `;
                        dashActivityLog.appendChild(logItem);
                    }
                });
            }

        } catch (err) {
            console.error("Failed to load analytics feed:", err);
        }
    }
});