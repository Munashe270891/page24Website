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

    let localStoreBooksCache = []; // Stores loaded records for lightning-fast button reading

    // 1. DYNAMIC CATALOGUE LOADER ENGINE
    async function loadStoreBooks() {
        try {
            const response = await fetch('/api/books');
            if (!response.ok) throw new Error('Could not pull database records.');
            
            localStoreBooksCache = await response.json();
            bookGrid.innerHTML = '';

            if (localStoreBooksCache.length === 0) {
                bookGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; opacity: 0.6; padding: 40px 0;">No books have been published onto the Page 24 network yet.</p>`;
                return;
            }

            localStoreBooksCache.forEach(book => {
                const card = document.createElement('div');
                card.className = 'book-card';
                
                card.innerHTML = `
                    <img src="${book.coverImage}" class="book-cover-placeholder" alt="${book.title} Cover" style="object-fit: cover; width: 100%; max-height: 240px;">
                    <h3>${book.title}</h3>
                    <p class="author-tag">By ${book.author}</p>
                    <p class="price-tag" style="font-weight: 700; color: var(--accent-orange); margin: 0 0 12px 0;">$${Number(book.price).toFixed(2)} USD</p>
                    <button class="buy-btn" data-id="${book.id}">Read Preview</button>
                `;
                
                bookGrid.appendChild(card);
            });

            // Attach listeners to every newly created "Read Preview" button inside grid tree
            attachPreviewButtonListeners();

        } catch (error) {
            console.error(error);
            bookGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: red;">Failed to sync with store server ecosystem layout.</p>`;
        }
    }

    // 2. MODAL INTERACTION CONTROLLER INTERFACE
    function attachPreviewButtonListeners() {
        const previewButtons = document.querySelectorAll('.buy-btn');
        
        previewButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const bookId = Number(e.target.getAttribute('data-id'));
                
                // Find matching entry from cache array locally
                const selectedBook = localStoreBooksCache.find(b => b.id === bookId);
                
                if (selectedBook) {
                    // Inject information row data elements into preview overlay frame fields
                    modalCover.src = selectedBook.coverImage;
                    modalTitle.textContent = selectedBook.title;
                    modalAuthor.textContent = `By ${selectedBook.author}`;
                    modalPrice.textContent = `$${Number(selectedBook.price).toFixed(2)} USD`;
                    modalDescription.textContent = selectedBook.description || 'No overview summary details text has been drafted for this volume yet.';
                    
                    // Fire display execution styles
                    previewModal.style.display = 'flex';
                    
                    // FIXED: Re-mapped the trigger logic to execute an instant direct redirect shortcut hook onto our canvas page
                    const modalBuyBtn = document.getElementById('modal-buy-btn');
                    modalBuyBtn.onclick = () => {
                        alert("Ecosystem bypass check clearance: Launching Secure Anti-Piracy View...");
                        window.location.href = `/read?bookId=${selectedBook.id}`;
                    };

                }
            });
        });
    }

    // Modal Closing Operations
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => { previewModal.style.display = 'none'; });
    }
    window.addEventListener('click', (e) => { if (e.target === previewModal) previewModal.style.display = 'none'; });

    // Trigger loader execution loop instantly on document initialize
    loadStoreBooks();

    // 3. REAL-TIME SEARCH FILTER SYSTEM
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchString = e.target.value.toLowerCase().trim();
            const bookCards = document.querySelectorAll('.book-card');

            bookCards.forEach(card => {
                const titleText = card.querySelector('h3').textContent.toLowerCase();
                const authorText = card.querySelector('.author-tag').textContent.toLowerCase();

                if (titleText.includes(searchString) || authorText.includes(searchString)) {
                    card.style.removeProperty('display');
                } else {
                    card.style.setProperty('display', 'none', 'important');
                }
            });
        });
    }
});
