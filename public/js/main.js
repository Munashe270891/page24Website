document.addEventListener('DOMContentLoaded', () => {
    // Page Elements & Pointers
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
    const modalAuthorName = document.getElementById('modal-author-name');
    const modalAuthorRank = document.getElementById('modal-author-rank');
    const followAuthorBtn = document.getElementById('follow-author-btn');
    const modalPrice = document.getElementById('modal-price');
    
    // Preview Modal - Author Card Pointers
    const modalAuthorPic = document.getElementById('modal-author-pic');
    const modalAuthorLegal = document.getElementById('modal-author-legal');
    const modalAuthorBio = document.getElementById('modal-author Bio') || document.getElementById('modal-author-bio');
    const modalDescription = document.getElementById('modal-description');

    // Preview Modal - Social Links Pointers
    const linkFb = document.getElementById('link-fb');
    const linkTt = document.getElementById('link-tt');
    const linkTw = document.getElementById('link-tw');
    const linkIg = document.getElementById('link-ig');
    const noSocialMsg = document.getElementById('no-social-msg');

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
    
    // GLOBAL STATE: Stores IDs of authors followed by current user across site/reader
    let userFollowedAuthorIds = new Set();

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

    // ==========================================
    // 0. READER AUTH & FOLLOW STATE SYNC ENGINE
    // ==========================================
    async function checkUserAuthStatus() {
        const authContainer = document.getElementById('auth-nav-container');

        try {
            const response = await fetch('/api/user'); 
            if (!response.ok) throw new Error('Not logged in');

            const userData = await response.json();

            if (userData && (userData.user || userData.id || userData.email)) {
                const user = userData.user || userData;
                const displayName = escapeHTML(user.name || user.username || user.email || 'Reader');

                // Render signed-in reader state in header
                if (authContainer) {
                    authContainer.innerHTML = `
                        <div style="display: inline-flex; align-items: center; gap: 8px;">
                            <span style="font-size: 0.85rem; font-weight: 600; color: var(--primary-green, #1B4D3E);">
                                👤 ${displayName}
                            </span>
                            <button id="logout-btn" class="nav-btn-secondary" style="padding: 5px 10px; font-size: 0.8rem; cursor: pointer; border-radius: 4px;">
                                Sign Out
                            </button>
                        </div>
                    `;

                    const logoutBtn = document.getElementById('logout-btn');
                    if (logoutBtn) {
                        logoutBtn.addEventListener('click', async () => {
                            try {
                                await fetch('/api/logout', { method: 'POST' });
                            } catch (err) {
                                console.error('Logout error:', err);
                            } finally {
                                window.location.reload();
                            }
                        });
                    }
                }

                // Fetch current user's followed authors to sync button states
                await fetchUserFollows();

            } else if (authContainer) {
                authContainer.innerHTML = `<a href="/login" id="auth-btn" class="nav-btn-primary">Sign In</a>`;
            }
        } catch (error) {
            if (authContainer) {
                authContainer.innerHTML = `<a href="/login" id="auth-btn" class="nav-btn-primary">Sign In</a>`;
            }
        }
    }

    // Fetch followed authors array from server
    async function fetchUserFollows() {
        try {
            const res = await fetch('/api/user/follows');
            if (res.ok) {
                const data = await res.json();
                // Expecting data.followedAuthorIds or array of IDs
                const ids = data.followedAuthorIds || data.follows || data || [];
                if (Array.isArray(ids)) {
                    userFollowedAuthorIds = new Set(ids.map(id => String(id)));
                }
            }
        } catch (err) {
            console.error('Error fetching user follows:', err);
        }
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

    // ==========================================
    // 1. DYNAMIC CATALOGUE LOADER ENGINE
    // ==========================================
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

    // ==========================================
    // 2. RENDERING ENGINE WITH ACTIVE FILTERS
    // ==========================================
    function renderFilteredGrid() {
        if (!bookGrid) return;
        bookGrid.innerHTML = '';

        const searchString = searchInput ? searchInput.value.toLowerCase().trim() : '';

        const filteredBooks = localStoreBooksCache.filter(book => {
            const bookCat = (book.category || 'Other').toLowerCase();
            const bookSub = (book.sub_theme || book.subTheme || '').toLowerCase();
            const titleText = (book.title || '').toLowerCase();
            const authorText = (book.author || book.author_name || '').toLowerCase();

            const matchesCat = (selectedCategory === 'All') || (bookCat === selectedCategory.toLowerCase());
            const matchesSub = (selectedCategory !== 'Shona Novels') || 
                               (selectedSubTheme === 'All') || 
                               (bookSub === selectedSubTheme.toLowerCase());
            const matchesSearch = !searchString || titleText.includes(searchString) || authorText.includes(searchString);

            return matchesCat && matchesSub && matchesSearch;
        });

        if (catalogHeading) {
            if (selectedCategory === 'All') {
                catalogHeading.textContent = 'Featured Zimbabwean Stories';
            } else if (selectedCategory === 'Shona Novels' && selectedSubTheme !== 'All') {
                catalogHeading.textContent = `Shona Novels: ${selectedSubTheme}`;
            } else {
                catalogHeading.textContent = `${selectedCategory} Books`;
            }
        }

        if (filteredBooks.length === 0) {
            bookGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; opacity: 0.7; padding: 40px 0;">No books found matching your selected filters.</p>`;
            return;
        }

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

    // ==========================================
    // 3. CATEGORY & SUB-THEME EVENT HANDLERS
    // ==========================================
    window.filterByCategory = function(catName, btnElement) {
        selectedCategory = catName;
        selectedSubTheme = 'All';

        document.querySelectorAll('.cat-pill').forEach(btn => btn.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');

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

        document.querySelectorAll('.sub-pill').forEach(btn => btn.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');

        renderFilteredGrid();
    };

    // Smart Universal Social Link Parser Fix
    function formatSocialUrl(rawInput, platform) {
        if (!rawInput || String(rawInput).trim() === '') return null;
        let str = String(rawInput).trim();

        // If author pasted a complete HTTP/HTTPS URL or share link, return as-is
        if (str.startsWith('http://') || str.startsWith('https://')) {
            return str;
        }

        // Clean handle if author entered @username or leading slashes
        if (str.startsWith('@')) str = str.substring(1);
        if (str.startsWith('/')) str = str.substring(1);

        switch (platform) {
            case 'facebook': return `https://www.facebook.com/${str}`;
            case 'tiktok': return `https://www.tiktok.com/@${str}`;
            case 'twitter': return `https://x.com/${str}`;
            case 'instagram': return `https://www.instagram.com/${str}`;
            default: return `https://${str}`;
        }
    }

    function setupSocialLink(element, value, platform) {
        if (!element) return false;
        
        const validUrl = formatSocialUrl(value, platform);
        if (validUrl) {
            element.href = validUrl;
            element.target = '_blank';
            element.rel = 'noopener noreferrer';
            element.classList.remove('hidden');
            element.style.display = 'inline-flex';
            return true;
        } else {
            element.classList.add('hidden');
            element.style.display = 'none';
            return false;
        }
    }

    // ==========================================
    // 4. MODAL INTERACTION CONTROLLER INTERFACE
    // ==========================================
    function attachPreviewButtonListeners() {
        const previewButtons = document.querySelectorAll('.buy-btn');
        
        previewButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const bookId = Number(e.target.getAttribute('data-id'));
                const selectedBook = localStoreBooksCache.find(b => Number(b.id) === bookId);
                
                if (selectedBook && previewModal) {
                    const coverSrc = selectedBook.cover_image || selectedBook.coverImage || '/images/default-cover.png';
                    const numericPrice = Number(selectedBook.price || 0);
                    const authorNameText = selectedBook.author || selectedBook.author_name || 'Unknown Author';
                    const authorId = String(selectedBook.author_id || selectedBook.user_id || selectedBook.authorId || '');
                    
                    if (modalCover) {
                        modalCover.src = coverSrc;
                        modalCover.style.objectFit = 'contain';
                    }
                    if (modalTitle) modalTitle.textContent = selectedBook.title;
                    if (modalAuthorName) modalAuthorName.textContent = authorNameText;
                    if (modalPrice) modalPrice.textContent = numericPrice === 0 ? 'FREE' : `$${numericPrice.toFixed(2)} USD`;
                    if (modalDescription) {
                        modalDescription.textContent = selectedBook.description || 'No overview summary details text has been drafted for this volume yet.';
                    }

                    if (modalAuthorLegal) modalAuthorLegal.textContent = authorNameText;
                    if (modalAuthorBio) modalAuthorBio.textContent = selectedBook.author_bio || selectedBook.bio || 'Page 24 Published Author.';
                    if (modalAuthorPic) modalAuthorPic.src = selectedBook.author_picture || selectedBook.profile_picture_url || '/images/default-avatar.png';
                    if (modalAuthorRank) modalAuthorRank.textContent = selectedBook.author_rank ? `Rank #${selectedBook.author_rank}` : 'Top Creator';

                    // Synchronize Follow Button State from Global Set
                    if (followAuthorBtn) {
                        if (authorId) {
                            followAuthorBtn.setAttribute('data-author-id', authorId);
                            
                            if (userFollowedAuthorIds.has(authorId)) {
                                followAuthorBtn.textContent = '✓ Following';
                                followAuthorBtn.style.background = '#6b6f6c';
                            } else {
                                followAuthorBtn.textContent = '+ Follow Author';
                                followAuthorBtn.style.background = 'var(--primary-green-light, #27ae60)';
                            }
                        } else {
                            followAuthorBtn.removeAttribute('data-author-id');
                            followAuthorBtn.textContent = '+ Follow Author';
                            followAuthorBtn.style.background = 'var(--primary-green-light, #27ae60)';
                        }
                    }

                    const hasFb = setupSocialLink(linkFb, selectedBook.facebook_url || selectedBook.facebook_handle || selectedBook.facebook, 'facebook');
                    const hasTt = setupSocialLink(linkTt, selectedBook.tiktok_url || selectedBook.tiktok_handle || selectedBook.tiktok, 'tiktok');
                    const hasTw = setupSocialLink(linkTw, selectedBook.twitter_url || selectedBook.twitter_handle || selectedBook.twitter, 'twitter');
                    const hasIg = setupSocialLink(linkIg, selectedBook.instagram_url || selectedBook.instagram_handle || selectedBook.instagram, 'instagram');
                    
                    if (noSocialMsg) {
                        if (!hasFb && !hasTt && !hasTw && !hasIg) {
                            noSocialMsg.classList.remove('hidden');
                            noSocialMsg.style.display = 'inline';
                        } else {
                            noSocialMsg.classList.add('hidden');
                            noSocialMsg.style.display = 'none';
                        }
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

    if (closeModalBtn && previewModal) {
        closeModalBtn.addEventListener('click', () => { previewModal.style.display = 'none'; });
    }

    // ==========================================
    // 5. TOP AUTHORS CONTROLLER MODULE
    // ==========================================
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

        const sortedAuthors = [...cachedAuthorsData].sort((a, b) => {
            const aSales = Number(a.total_books_sold || a.books_read || 0);
            const bSales = Number(b.total_books_sold || b.books_read || 0);
            return bSales - aSales;
        });

        topAuthorsListContainer.innerHTML = sortedAuthors.map((author, index) => {
            const safeName = escapeHTML(author.name || author.legal_name || 'Anonymous Author');
            const safeBio = escapeHTML(author.bio || 'Page 24 Published Author.');
            const avatarSrc = author.profile_picture_url || author.profile_pic_url || '/images/default-avatar.png';
            const salesCount = Number(author.total_books_sold || author.books_read || 0);
            const authorId = String(author.id || '');

            const socialLinksObj = author.social_links || {};
            const fbUrl = formatSocialUrl(socialLinksObj.facebook || author.facebook_handle || author.facebook_url, 'facebook');
            const ttUrl = formatSocialUrl(socialLinksObj.tiktok || author.tiktok_handle || author.tiktok_url, 'tiktok');
            const twUrl = formatSocialUrl(socialLinksObj.twitter || author.twitter_handle || author.twitter_url, 'twitter');
            const igUrl = formatSocialUrl(socialLinksObj.instagram || author.instagram_handle || author.instagram_url, 'instagram');

            const badges = [];
            if (fbUrl) badges.push(`<a href="${escapeHTML(fbUrl)}" target="_blank" rel="noopener noreferrer" class="social-badge fb" title="Facebook"><i class="fab fa-facebook-f"></i></a>`);
            if (ttUrl) badges.push(`<a href="${escapeHTML(ttUrl)}" target="_blank" rel="noopener noreferrer" class="social-badge tt" title="TikTok"><i class="fab fa-tiktok"></i></a>`);
            if (twUrl) badges.push(`<a href="${escapeHTML(twUrl)}" target="_blank" rel="noopener noreferrer" class="social-badge tw" title="X / Twitter"><i class="fab fa-x-twitter"></i></a>`);
            if (igUrl) badges.push(`<a href="${escapeHTML(igUrl)}" target="_blank" rel="noopener noreferrer" class="social-badge ig" title="Instagram"><i class="fab fa-instagram"></i></a>`);

            const badgesHTML = badges.length > 0 
                ? `<div class="author-social-badges" style="margin-top: 6px;">${badges.join('')}</div>` 
                : `<span style="font-size: 11px; color: #888; font-style: italic; display: block; margin-top: 4px;">No social links</span>`;

            const isFollowing = userFollowedAuthorIds.has(authorId);
            const btnText = isFollowing ? '✓ Following' : '+ Follow';
            const btnBg = isFollowing ? '#6b6f6c' : 'var(--primary-green, #1B4D3E)';

            return `
                <div class="author-card" style="display: flex; gap: 15px; background: #fff; padding: 14px; border-radius: 8px; border: 1px solid var(--border-tan, #E2DACD); align-items: center; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                    <span style="font-size: 18px; font-weight: 800; color: var(--accent-orange, #d97736); width: 30px; text-align: center;">#${index + 1}</span>
                    <img src="${avatarSrc}" alt="${safeName}" style="width: 55px; height: 55px; border-radius: 50%; object-fit: cover; border: 1px solid #ccc;" onerror="this.src='/images/default-avatar.png'">
                    
                    <div style="flex: 1;">
                        <h3 style="margin: 0 0 3px 0; font-size: 15px; color: var(--text-dark, #2C3E50);">${safeName}</h3>
                        <p style="margin: 0 0 6px 0; font-size: 12px; color: #555; line-height: 1.3;">${safeBio}</p>
                        
                        <div style="font-size: 11px; color: var(--primary-green, #1B4D3E); font-weight: 600; margin-bottom: 4px;">
                            📚 ${salesCount} Reads/Purchases
                        </div>

                        ${badgesHTML}
                    </div>

                    <button onclick="followAuthor('${authorId}')" style="background: ${btnBg}; color: white; border: none; padding: 8px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; white-space: nowrap;">
                        ${btnText}
                    </button>
                </div>
            `;
        }).join('');
    }

    // Global Follow Author Handlers
    window.toggleFollowAuthor = async function() {
        const followBtn = document.getElementById('follow-author-btn');
        const authorId = followBtn ? followBtn.getAttribute('data-author-id') : null;

        if (!authorId) {
            alert('Author information not available.');
            return;
        }

        try {
            const response = await fetch(`/api/authors/${authorId}/follow`, { method: 'POST' });
            const result = await response.json();

            if (response.ok && result.success) {
                userFollowedAuthorIds.add(String(authorId));
                if (followBtn) {
                    followBtn.textContent = '✓ Following';
                    followBtn.style.background = '#6b6f6c';
                }
            } else {
                alert(result.error || result.message || 'Please log in to follow authors.');
            }
        } catch (err) {
            console.error('Follow request error:', err);
            alert('Could not follow author. Please try again.');
        }
    };

    window.followAuthor = async function(authorId) {
        if (!authorId) return;

        try {
            const response = await fetch(`/api/authors/${authorId}/follow`, { method: 'POST' });
            const result = await response.json();

            if (response.ok && result.success) {
                userFollowedAuthorIds.add(String(authorId));
                loadTopAuthors();
            } else {
                alert(result.error || result.message || 'Please log in to follow authors.');
            }
        } catch (err) {
            console.error('Follow request error:', err);
            alert('Could not follow author. Please try again.');
        }
    };

    // Close Modals on backdrop click
    window.addEventListener('click', (e) => { 
        if (e.target === previewModal) previewModal.style.display = 'none'; 
        if (e.target === authorsModal) authorsModal.style.display = 'none';
    });

    // Real-time search trigger
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderFilteredGrid();
        });
    }

    // Run Initializations on Page Load
    checkUserAuthStatus();
    loadStoreBooks();
});
