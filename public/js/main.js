document.addEventListener('DOMContentLoaded', () => {
    const bookGrid = document.querySelector('.book-grid');
    const searchInput = document.getElementById('store-search');
    const browseBtn = document.getElementById('browse-books-btn');
    const subThemeRow = document.getElementById('shona-subthemes-row');
    const catalogHeading = document.getElementById('catalog-heading');
    
    // Preview Modal Element Pointers
    const previewModal = document.getElementById('preview-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalCover = document.getElementById('modal-cover');
    const modalTitle = document.getElementById('modal-title');
    const modalAuthor = document.getElementById('modal-author');
    const modalPrice = document.getElementById('modal-price');
    const modalDescription = document.getElementById('modal-description');

    // Top Authors Modal Element Pointers
    const topAuthorsBtn = document.getElementById('top-authors-nav-btn');
    const authorsModal = document.getElementById('authors-modal');
    const closeAuthorsModalBtn = document.getElementById('close-authors-modal');
    const rankingCriteriaSelect = document.getElementById('ranking-criteria');
    const topAuthorsListContainer = document.getElementById('top-authors-list');

    let localStoreBooksCache = []; // Master store from API
    let cachedAuthorsData = [];     // Master authors array for dynamic sorting
    let selectedCategory = 'All';
    let selectedSubTheme = 'All';

    // Helper to escape HTML characters safely
    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Smooth-scroll "Browse Books" in top header
    if (browseBtn) {
        browseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const filterSection = document.getElementById('category-filter-section');
            if (filterSection) {
                filterSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // 1. DYNAMIC CATALOGUE LOADER ENGINE
    async function loadStoreBooks() {
        if (!bookGrid) return;

        try {
            const response = await fetch('/api/books');
            if (!response.ok) throw new Error('Could not pull database records.');
            
            localStoreBooksCache = await response.json();

            if (!Array.isArray(localStoreBooksCache) || localStoreBooksCache.length === 0) {
                bookGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; opacity: 0.6; padding: 40px 0;">No books have been published onto the Page 24 network yet.</p>`;
                return;
            }

            renderFilteredGrid();

        } catch (error) {
            console.error('Store Load Error:', error);
            bookGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #dc3545;">Failed to sync with store server layout.</p>`;
        }
    }

    // 2. RENDERING ENGINE WITH ACTIVE FILTERS
    function renderFilteredGrid() {
        if (!bookGrid) return;
        bookGrid.innerHTML = '';

        const searchString = searchInput ? searchInput.value.toLowerCase().trim() : '';

        // Filter master cache by Category, Sub-theme, and Search String
        const filteredBooks = localStoreBooksCache.filter(book => {
            const bookCat = (book.category || 'Other').toLowerCase();
            const bookSub = (book.sub_theme || book.subTheme || '').toLowerCase();
            const titleText = (book.title || '').toLowerCase();
            const authorText = (book.author || book.author_name || '').toLowerCase();

            // Match Category
            const matchesCat = (selectedCategory === 'All') || (bookCat === selectedCategory.toLowerCase());
            
            // Match Sub-theme (when Shona Novels is selected)
            const matchesSub = (selectedCategory !== 'Shona Novels') || 
                               (selectedSubTheme === 'All') || 
                               (bookSub === selectedSubTheme.toLowerCase());

            // Match Search Bar Input
            const matchesSearch = !searchString || titleText.includes(searchString) || authorText.includes(searchString);

            return matchesCat && matchesSub && matchesSearch;
        });

        // Dynamic Section Heading Update
        if (catalogHeading) {
            if (selectedCategory === 'All') {
                catalogHeading.textContent = 'Featured Zimbabwean Stories';
            } else if (selectedCategory === 'Shona Novels' && selectedSubTheme !== 'All') {
                catalogHeading.textContent = `Shona Novels: ${selectedSubTheme}`;
            } else {
                catalogHeading.textContent = `${selectedCategory} Books`;
            }
        }

        // Empty state
        if (filteredBooks.length === 0) {
            bookGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; opacity: 0.7; padding: 40px 0;">No books found matching your selected filters.</p>`;
            return;
        }

        // Render matching cards
        filteredBooks.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card';
            
            const coverSrc = book.cover_image || book.coverImage || '/images/default-cover.png';
            const safeTitle = escapeHTML(book.title);
            const safeAuthor = escapeHTML(book.author || book.author_name || 'Unknown Author');
            const numericPrice = Number(book.price || 0);
            const priceFormatted = numericPrice.toFixed(2);
            const priceLabel = numericPrice === 0 ? 'FREE' : `$${priceFormatted} USD`;

            card.innerHTML = `
                <div class="cover-wrapper" style="width: 100%; max-width: 220px; aspect-ratio: 2 / 3; margin: 0 auto 15px auto; background: rgba(0, 0, 0, 0.04); border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                    <img src="${coverSrc}" class="book-cover-placeholder" alt="${safeTitle} Cover" style="width: 100%; height: 100%; object-fit: contain; border-radius: 6px;" onerror="this.src='/images/default-cover.png'">
                </div>
                <h3 style="margin: 0 0 6px 0; font-size: 1.1rem; line-height: 1.3;">${safeTitle}</h3>
                <p class="author-tag" style="margin: 0 0 8px 0; font-size: 0.9rem; opacity: 0.8;">By ${safeAuthor}</p>
                <p class="price-tag" style="font-weight: 700; color: var(--accent-orange, #d97736); margin: 0 0 14px 0;">${priceLabel}</p>
                <button class="buy-btn" data-id="${book.id}">Read Preview</button>
            `;
            
            bookGrid.appendChild(card);
        });

        attachPreviewButtonListeners();
    }

    // 3. CATEGORY & SUB-THEME EVENT HANDLERS (Global Scope)
    window.filterByCategory = function(catName, btnElement) {
        selectedCategory = catName;
        selectedSubTheme = 'All'; // Reset sub-theme when category changes

        // Active state formatting for Category Pills
        document.querySelectorAll('.cat-pill').forEach(btn => btn.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');

        // Toggle Sub-theme bar visibility
        if (subThemeRow) {
            if (catName === 'Shona Novels') {
                subThemeRow.style.display = 'flex';
                document.querySelectorAll('.sub-pill').forEach(b => b.classList.remove('active'));
                const firstSubPill = subThemeRow.querySelector('.sub-pill');
                if (firstSubPill) firstSubPill.classList.add('active');
            } else {
                subThemeRow.style.display = 'none';
            }
        }

        renderFilteredGrid();
    };

    window.filterBySubTheme = function(subName, btnElement) {
        selectedSubTheme = subName;

        // Active state formatting for Sub-Theme Pills
        document.querySelectorAll('.sub-pill').forEach(btn => btn.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');

        renderFilteredGrid();
    };

    // 4. MODAL INTERACTION CONTROLLER INTERFACE
    function attachPreviewButtonListeners() {
        const previewButtons = document.querySelectorAll('.buy-btn');
        
        previewButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const bookId = Number(e.target.getAttribute('data-id'));
                const selectedBook = localStoreBooksCache.find(b => Number(b.id) === bookId);
                
                if (selectedBook && previewModal) {
                    const coverSrc = selectedBook.cover_image || selectedBook.coverImage || '/images/default-cover.png';
                    const numericPrice = Number(selectedBook.price || 0);
                    
                    if (modalCover) {
                        modalCover.src = coverSrc;
                        modalCover.style.objectFit = 'contain';
                    }
                    if (modalTitle) modalTitle.textContent = selectedBook.title;
                    if (modalAuthor) modalAuthor.textContent = `By ${selectedBook.author || selectedBook.author_name || 'Unknown Author'}`;
                    if (modalPrice) modalPrice.textContent = numericPrice === 0 ? 'FREE' : `$${numericPrice.toFixed(2)} USD`;
                    if (modalDescription) {
                        modalDescription.textContent = selectedBook.description || 'No overview summary details text has been drafted for this volume yet.';
                    }
                    
                    const modalBuyBtn = document.getElementById('modal-buy-btn');
                    if (modalBuyBtn) {
                        modalBuyBtn.textContent = numericPrice === 0 ? 'Read / Download Free' : 'Open Reader';
                        modalBuyBtn.onclick = () => {
                            window.location.href = `/read?id=${selectedBook.id}`;
                        };
                    }

                    previewModal.style.display = 'flex';
                }
            });
        });
    }

    // Modal Closing Operations
    if (closeModalBtn && previewModal) {
        closeModalBtn.addEventListener('click', () => { previewModal.style.display = 'none'; });
    }

    // 5. TOP AUTHORS CONTROLLER MODULE
    if (topAuthorsBtn && authorsModal) {
        topAuthorsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            authorsModal.style.display = 'flex';
            loadTopAuthors();
        });
    }

    if (closeAuthorsModalBtn && authorsModal) {
        closeAuthorsModalBtn.addEventListener('click', () => {
            authorsModal.style.display = 'none';
        });
    }

    if (rankingCriteriaSelect) {
        rankingCriteriaSelect.addEventListener('change', () => {
            renderAuthorsList(rankingCriteriaSelect.value);
        });
    }

    async function loadTopAuthors() {
        if (!topAuthorsListContainer) return;
        topAuthorsListContainer.innerHTML = '<p style="text-align: center; padding: 20px; opacity: 0.7;">Loading top authors...</p>';

        try {
            const response = await fetch('/api/top-authors');
            if (!response.ok) throw new Error('Failed to fetch author analytics.');

            const data = await response.json();
            
            if (!data.success || !Array.isArray(data.authors) || data.authors.length === 0) {
                topAuthorsListContainer.innerHTML = '<p style="text-align: center; padding: 20px; opacity: 0.7;">No active authors found on Page 24 yet.</p>';
                return;
            }

            cachedAuthorsData = data.authors;
            renderAuthorsList(rankingCriteriaSelect ? rankingCriteriaSelect.value : 'overall');

        } catch (error) {
            console.error('Top Authors Fetch Error:', error);
            topAuthorsListContainer.innerHTML = '<p style="text-align: center; color: #dc3545; padding: 20px;">Could not load top authors list.</p>';
        }
    }

    function renderAuthorsList(criteria) {
        if (!topAuthorsListContainer || cachedAuthorsData.length === 0) return;

        // Dynamic Sorting Logic
        const sortedAuthors = [...cachedAuthorsData].sort((a, b) => {
            const aSales = Number(a.total_books_sold || a.books_read || 0);
            const bSales = Number(b.total_books_sold || b.books_read || 0);
            
            const aSiteFollowers = Number(a.site_followers || 0);
            const bSiteFollowers = Number(b.site_followers || 0);
            
            const aSocial = Number(a.social_followers || 0);
            const bSocial = Number(b.social_followers || 0);

            // Composite Weighted Score
            const aScore = (aSales * 10) + (aSiteFollowers * 5) + (aSocial * 0.1);
            const bScore = (bSales * 10) + (bSiteFollowers * 5) + (bSocial * 0.1);

            if (criteria === 'sales') return bSales - aSales;
            if (criteria === 'site_followers') return bSiteFollowers - aSiteFollowers;
            if (criteria === 'social_reach') return bSocial - aSocial;
            return bScore - aScore; // Default: 'overall'
        });

        topAuthorsListContainer.innerHTML = sortedAuthors.map((author, index) => {
            const safeName = escapeHTML(author.name || 'Anonymous Author');
            const safeBio = escapeHTML(author.bio || 'Page 24 Published Author.');
            const avatarSrc = author.profile_picture_url || '/images/default-avatar.png';
            
            const salesCount = Number(author.total_books_sold || author.books_read || 0);
            const siteFollowersCount = Number(author.site_followers || 0);
            const socialReachCount = Number(author.social_followers || 0);

            return `
                <div class="author-card" style="display: flex; gap: 15px; background: #fff; padding: 14px; border-radius: 8px; border: 1px solid var(--border-tan, #E2DACD); align-items: center; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                    <span style="font-size: 18px; font-weight: 800; color: var(--accent-orange, #d97736); width: 30px; text-align: center;">#${index + 1}</span>
                    <img src="${avatarSrc}" alt="${safeName}" style="width: 55px; height: 55px; border-radius: 50%; object-fit: cover; border: 1px solid #ccc;" onerror="this.src='/images/default-avatar.png'">
                    
                    <div style="flex: 1;">
                        <h3 style="margin: 0 0 3px 0; font-size: 15px; color: var(--text-dark, #2C3E50);">${safeName}</h3>
                        <p style="margin: 0 0 6px 0; font-size: 12px; color: #555; line-height: 1.3;">${safeBio}</p>
                        
                        <div style="font-size: 11px; color: var(--primary-green, #1B4D3E); font-weight: 600; display: flex; gap: 10px; flex-wrap: wrap;">
                            <span>📚 ${salesCount} Reads/Purchases</span>
                            <span>👥 ${siteFollowersCount} Site Followers</span>
                            <span>🌐 ${socialReachCount.toLocaleString()} Social Reach</span>
                        </div>
                    </div>

                    <button onclick="followAuthor('${author.id}')" style="background: var(--primary-green, #1B4D3E); color: white; border: none; padding: 8px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; white-space: nowrap;">
                        + Follow
                    </button>
                </div>
            `;
        }).join('');
    }

    // Global Follow Author Action Handler
    window.followAuthor = async function(authorId) {
        try {
            const response = await fetch(`/api/authors/${authorId}/follow`, { method: 'POST' });
            const result = await response.json();

            if (response.ok && result.success) {
                alert('Author followed successfully!');
                loadTopAuthors(); // Refresh metrics list
            } else {
                alert(result.error || result.message || 'Please log in to follow authors.');
            }
        } catch (err) {
            console.error('Follow request error:', err);
            alert('Could not follow author. Please try again.');
        }
    };

    // Close Modals when clicking outside
    window.addEventListener('click', (e) => { 
        if (e.target === previewModal) previewModal.style.display = 'none'; 
        if (e.target === authorsModal) authorsModal.style.display = 'none';
    });

    // Real-time search input trigger
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderFilteredGrid();
        });
    }

    // Load book data
    loadStoreBooks();
});
