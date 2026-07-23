document.addEventListener('DOMContentLoaded', () => {
    const bookGrid = document.querySelector('.book-grid');
    const searchInput = document.getElementById('store-search');
    
    // Modal Element Pointers
    const previewModal = document.getElementById('preview-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalCover = document.getElementById('modal-cover');
    const modalTitle = document.getElementById('modal-title');
    const modalAuthor = document.getElementById('modal-author');
    const modalPrice = document.getElementById('modal-price');
    const modalDescription = document.getElementById('modal-description');

    let localStoreBooksCache = []; // Stores loaded records for fast reading

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

    // 1. DYNAMIC CATALOGUE LOADER ENGINE
    async function loadStoreBooks() {
        if (!bookGrid) return;

        try {
            const response = await fetch('/api/books');
            if (!response.ok) throw new Error('Could not pull database records.');
            
            localStoreBooksCache = await response.json();
            bookGrid.innerHTML = '';

            if (!Array.isArray(localStoreBooksCache) || localStoreBooksCache.length === 0) {
                bookGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; opacity: 0.6; padding: 40px 0;">No books have been published onto the Page 24 network yet.</p>`;
                return;
            }

            localStoreBooksCache.forEach(book => {
                const card = document.createElement('div');
                card.className = 'book-card';
                
                // Fallback for cover image field names (camelCase vs snake_case)
                const coverSrc = book.coverImage || book.cover_image || '/images/default-cover.png';
                const safeTitle = escapeHTML(book.title);
                const safeAuthor = escapeHTML(book.author || 'Unknown Author');
                const priceFormatted = Number(book.price || 0).toFixed(2);

                card.innerHTML = `
                    <img src="${coverSrc}" class="book-cover-placeholder" alt="${safeTitle} Cover" style="object-fit: cover; width: 100%; max-height: 240px;" onerror="this.src='/images/default-cover.png'">
                    <h3>${safeTitle}</h3>
                    <p class="author-tag">By ${safeAuthor}</p>
                    <p class="price-tag" style="font-weight: 700; color: var(--accent-orange, #d97736); margin: 0 0 12px 0;">$${priceFormatted} USD</p>
                    <button class="buy-btn" data-id="${book.id}">Read Preview</button>
                `;
                
                bookGrid.appendChild(card);
            });

            // Attach listeners to every newly created "Read Preview" button
            attachPreviewButtonListeners();

        } catch (error) {
            console.error('Store Load Error:', error);
            bookGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #dc3545;">Failed to sync with store server layout.</p>`;
        }
    }

    // 2. MODAL INTERACTION CONTROLLER INTERFACE
    function attachPreviewButtonListeners() {
        const previewButtons = document.querySelectorAll('.buy-btn');
        
        previewButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const bookId = Number(e.target.getAttribute('data-id'));
                
                // Find matching entry from cache array
                const selectedBook = localStoreBooksCache.find(b => Number(b.id) === bookId);
                
                if (selectedBook && previewModal) {
                    const coverSrc = selectedBook.coverImage || selectedBook.cover_image || '/images/default-cover.png';
                    
                    if (modalCover) modalCover.src = coverSrc;
                    if (modalTitle) modalTitle.textContent = selectedBook.title;
                    if (modalAuthor) modalAuthor.textContent = `By ${selectedBook.author || 'Unknown Author'}`;
                    if (modalPrice) modalPrice.textContent = `$${Number(selectedBook.price || 0).toFixed(2)} USD`;
                    if (modalDescription) {
                        modalDescription.textContent = selectedBook.description || 'No overview summary details text has been drafted for this volume yet.';
                    }
                    
                    // Show modal
                    previewModal.style.display = 'flex';
                    
                    // Direct redirect button to reader workspace
                    const modalBuyBtn = document.getElementById('modal-buy-btn');
                    if (modalBuyBtn) {
                        modalBuyBtn.onclick = () => {
                            window.location.href = `/read?bookId=${selectedBook.id}`;
                        };
                    }
                }
            });
        });
    }

    // Modal Closing Operations
    if (closeModalBtn && previewModal) {
        closeModalBtn.addEventListener('click', () => { previewModal.style.display = 'none'; });
    }
    if (previewModal) {
        window.addEventListener('click', (e) => { 
            if (e.target === previewModal) previewModal.style.display = 'none'; 
        });
    }

    // Trigger loader execution loop instantly
    loadStoreBooks();

    // 3. REAL-TIME SEARCH FILTER SYSTEM
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchString = e.target.value.toLowerCase().trim();
            const bookCards = document.querySelectorAll('.book-card');

            bookCards.forEach(card => {
                const titleElem = card.querySelector('h3');
                const authorElem = card.querySelector('.author-tag');
                
                const titleText = titleElem ? titleElem.textContent.toLowerCase() : '';
                const authorText = authorElem ? authorElem.textContent.toLowerCase() : '';

                if (titleText.includes(searchString) || authorText.includes(searchString)) {
                    card.style.removeProperty('display');
                } else {
                    card.style.setProperty('display', 'none', 'important');
                }
            });
        });
    }
});