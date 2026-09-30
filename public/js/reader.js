let currentUser = null;
let allLibraryBooks = [];
let activeCategory = 'All';
let activeSubTheme = 'All';

// Multi-chapter state tracking
let currentChapters = [];
let currentChapterIdx = 0;

// Reader Theme State ('cream' or 'dark')
let currentReaderTheme = 'cream';

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getCoverUrl(book) {
    let raw = book.cover_image || book.coverImage || book.cover_url || '';
    if (raw && !raw.startsWith('http') && !raw.startsWith('/')) {
        raw = '/' + raw;
    }
    return raw || '/images/default-cover.png';
}

// 1. Check Auth & Synchronize Navigation State
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        const authBtn = document.getElementById('auth-btn');
        const logoutBtn = document.getElementById('logout-btn');

        if (data.loggedIn) {
            currentUser = data.user;
            authBtn.textContent = currentUser.username;
            authBtn.href = "/dashboard";
            logoutBtn.style.display = "inline-block";
        } else {
            currentUser = null;
            authBtn.textContent = "Sign In";
            authBtn.href = "/login?returnTo=/read";
            logoutBtn.style.display = "none";
        }
    } catch (err) {
        currentUser = null;
    }
}

async function handleLogout() {
    await fetch('/api/auth/logout', { headers: { 'Accept': 'application/json' } });
    window.location.reload();
}

// 2. Service Worker & PWA Install
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error(err));
}

let deferredPrompt;
const installBtn = document.getElementById('pwa-install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

installBtn.addEventListener('click', () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => deferredPrompt = null);
    } else {
        alert("To install Page 24 Reader App:\n\n• Mobile: Tap browser menu -> 'Add to Home Screen'\n• Desktop: Click the Install icon in your address bar.");
    }
});

// 3. Tab Navigation
function switchTab(tabName) {
    document.querySelectorAll('.tab-screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    if (tabName === 'read') {
        document.getElementById('screen-read').classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('top-header-title').textContent = currentBookTitle || "📖 Read Now";
    } else if (tabName === 'store') {
        document.getElementById('screen-store').classList.add('active');
        document.querySelectorAll('.tab-btn')[2].classList.add('active');
        document.getElementById('top-header-title').textContent = "🛒 Page 24 Store";
        if (typeof loadPublicCatalog === 'function') loadPublicCatalog();
    } else if (tabName === 'library') {
        document.getElementById('screen-library').classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('top-header-title').textContent = "📚 My Books";
        loadUserLibrary();
    }
}

// 4. Reader Engine & Mobile Swipe Controls
let pdfDoc = null, pageNum = 1, currentBookTitle = "";
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const urlParams = new URLSearchParams(window.location.search);
const initialBookId = urlParams.get('bookId') || urlParams.get('id');

async function openBook(bookId) {
    switchTab('read');
    document.getElementById('status-text').style.display = 'block';
    document.getElementById('status-text').textContent = 'Opening secure reader...';
    document.getElementById('pdf-wrapper').style.display = 'none';
    document.getElementById('html-wrapper').style.display = 'none';
    document.getElementById('chapter-controls').style.display = 'none';

    try {
        const res = await fetch(`/api/books/secure-source?bookId=${bookId}`);
        if (!res.ok) throw new Error("Could not load book source.");
        const book = await res.json();

        currentBookTitle = book.title;
        document.getElementById('top-header-title').textContent = book.title;
        document.getElementById('status-text').style.display = 'none';

        if (book.mode === 'pdf') {
            document.getElementById('pdf-wrapper').style.display = 'block';
            renderPdfView(`/api/books/${bookId}/pdf-stream`);
        } else {
            document.getElementById('html-wrapper').style.display = 'block';
            
            // Attempt multi-chapter retrieval
            try {
                const chapRes = await fetch(`/api/books/${bookId}/chapters`);
                if (chapRes.ok) {
                    const chapters = await chapRes.json();
                    if (chapters && chapters.length > 0) {
                        currentChapters = chapters;
                        currentChapterIdx = 0;
                        renderCurrentChapter();
                        return;
                    }
                }
            } catch(e) { console.warn("Single chapter mode fallback active"); }

            // Single chapter fallback from secure-source
            document.getElementById('chapter-title').textContent = book.chapterTitle || book.title;
            document.getElementById('chapter-content').innerHTML = book.chapterBody || "No text body available.";
        }
    } catch (err) {
        document.getElementById('status-text').textContent = "Unable to load book content. Please log in or confirm purchase.";
    }
}

function renderCurrentChapter() {
    if (!currentChapters || currentChapters.length === 0) return;
    const chap = currentChapters[currentChapterIdx];
    document.getElementById('chapter-title').textContent = chap.title || `Chapter ${chap.chapter_number || (currentChapterIdx + 1)}`;
    document.getElementById('chapter-content').innerHTML = chap.body || chap.content || "";
    
    const controls = document.getElementById('chapter-controls');
    if (currentChapters.length > 1) {
        controls.style.display = 'flex';
        document.getElementById('chapter-index-label').textContent = `Chapter ${currentChapterIdx + 1} of ${currentChapters.length}`;
        document.getElementById('prev-chapter').disabled = currentChapterIdx === 0;
        document.getElementById('next-chapter').disabled = currentChapterIdx === currentChapters.length - 1;
    } else {
        controls.style.display = 'none';
    }
}

function navigateChapter(direction) {
    const nextIdx = currentChapterIdx + direction;
    if (nextIdx >= 0 && nextIdx < currentChapters.length) {
        currentChapterIdx = nextIdx;
        renderCurrentChapter();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function renderPdfView(pdfUrl) {
    pdfjsLib.getDocument(pdfUrl).promise.then(doc => {
        pdfDoc = doc;
        pageNum = 1;
        document.getElementById('page-count').textContent = doc.numPages;
        renderPage(pageNum);
    }).catch(err => {
        console.error("PDF Render error:", err);
        document.getElementById('status-text').style.display = 'block';
        document.getElementById('status-text'].textContent = "Error rendering PDF file.";
    });
}

function renderPage(num) {
    pdfDoc.getPage(num).then(page => {
        const canvas = document.getElementById('pdf-render');
        const ctx = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 1.5 });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        page.render({ canvasContext: ctx, viewport: viewport });
    });
    document.getElementById('page-num').textContent = num;
}

document.getElementById('prev-page').addEventListener('click', () => {
    if (pdfDoc && pageNum > 1) { pageNum--; renderPage(pageNum); }
});
document.getElementById('next-page').addEventListener('click', () => {
    if (pdfDoc && pageNum < pdfDoc.numPages) { pageNum++; renderPage(pageNum); }
});

// ==========================================
// MOBILE THUMB SWIPE GESTURE ENGINE          
// ==========================================
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

const readerScreen = document.getElementById('screen-read');

if (readerScreen) {
    readerScreen.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    readerScreen.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipeGesture();
    }, { passive: true });
}

function handleSwipeGesture() {
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    const threshold = 50; // Minimum pixel drag to qualify as a swipe

    // Determine if swipe was mostly horizontal or vertical
    if (Math.abs(diffX) > Math.abs(diffY)) {
        if (Math.abs(diffX) > threshold) {
            if (diffX > 0) {
                // Swipe Right -> Previous Chapter / Page
                if (currentChapters.length > 1) {
                    navigateChapter(-1);
                } else if (pdfDoc && pageNum > 1) {
                    pageNum--; renderPage(pageNum);
                }
            } else {
                // Swipe Left -> Next Chapter / Page
                if (currentChapters.length > 1) {
                    navigateChapter(1);
                } else if (pdfDoc && pageNum < pdfDoc.numPages) {
                    pageNum++; renderPage(pageNum);
                }
            }
        }
    } else {
        if (Math.abs(diffY) > threshold) {
            if (diffY > 0) {
                // Swipe Down -> Previous item/chapter
                if (currentChapters.length > 1 && diffY > 80) navigateChapter(-1);
            } else {
                // Swipe Up -> Next item/chapter
                if (currentChapters.length > 1 && diffY < -80) navigateChapter(1);
            }
        }
    }
}

// ==========================================
// THEME TOGGLE ENGINE (Cream vs Dark Mode)   
// ==========================================
function toggleReaderTheme() {
    const readScreen = document.getElementById('screen-read');
    if (currentReaderTheme === 'cream') {
        currentReaderTheme = 'dark';
        readScreen.style.backgroundColor = '#121212';
        readScreen.style.color = '#e0e0e0';
        // Apply dark background to webbook body blocks if present
        document.querySelectorAll('.book-content-body, #chapter-content').forEach(el => {
            el.style.backgroundColor = '#1e1e1e';
            el.style.color = '#f1f5f9';
        });
    } else {
        currentReaderTheme = 'cream';
        readScreen.style.backgroundColor = '';
        readScreen.style.color = '';
        document.querySelectorAll('.book-content-body, #chapter-content').forEach(el => {
            el.style.backgroundColor = '';
            el.style.color = '';
        });
    }
}

// 5. Category & Filter Controls
function filterByCategory(category, btn) {
    activeCategory = category;
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const subRow = document.getElementById('shona-subthemes-row');
    if (category === 'Shona Novels') {
        subRow.style.display = 'flex';
    } else {
        subRow.style.display = 'none';
        activeSubTheme = 'All';
    }

    if (typeof renderPublicGrid === 'function' && window.allBooksData) {
        renderPublicGrid();
    }
}

function filterBySubTheme(subTheme, btn) {
    activeSubTheme = subTheme;
    document.querySelectorAll('.sub-pill').forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (typeof renderPublicGrid === 'function' && window.allBooksData) {
        renderPublicGrid();
    }
}

// Close Book Preview Modal Only
document.getElementById('close-modal-btn').addEventListener('click', () => {
    document.getElementById('preview-modal').style.display = 'none';
});

// 6. User Personal Library Pipeline
async function loadUserLibrary() {
    const grid = document.getElementById('library-books-grid');

    if (!currentUser) {
        grid.innerHTML = `
            <div class="guest-box">
                <h3 style="margin-top:0; color: var(--primary-green);">Sign In Required</h3>
                <p style="color:#666; font-size:14px; margin-bottom: 20px;">
                    Please sign in to view your books or saved downloads.
                </p>
                <a href="/login?returnTo=/read" class="action-btn" style="width: auto; padding: 10px 24px;">Sign In / Register</a>
            </div>
        `;
        return;
    }

    try {
        const res = await fetch('/api/books/my-library');
        if (res.status === 401) {
            grid.innerHTML = `
                <div class="guest-box">
                    <p style="color:#666;">Please sign in to view your books or saved downloads.</p>
                    <a href="/login?returnTo=/read" class="action-btn" style="width: auto; padding: 10px 20px;">Sign In</a>
                </div>
            `;
            return;
        }
        allLibraryBooks = await res.json();
        renderLibraryGrid(allLibraryBooks);
    } catch (err) {
        grid.innerHTML = "<p style='grid-column:1/-1; text-align:center;'>Unable to load library right now.</p>";
    }
}

function renderLibraryGrid(books) {
    const grid = document.getElementById('library-books-grid');
    if (!books || books.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #777;">You haven't unlocked any books yet.</p>`;
        return;
    }
    grid.innerHTML = books.map(b => {
        const numericPrice = parseFloat(b.price || 0);
        const isFree = numericPrice === 0;
        let actionBtn = `<button class="action-btn" onclick="openBook(${b.id})">📖 Open Book</button>`;
        
        if (isFree && b.mode === 'pdf' && parseInt(b.allow_download) === 1) {
            actionBtn = `
                <button class="action-btn" onclick="openBook(${b.id})">📖 Read</button>
                <a href="/api/books/${b.id}/download-free" class="action-btn btn-free">📥 Download</a>
            `;
        }

        const coverSrc = getCoverUrl(b);
        const safeTitle = escapeHTML(b.title);
        const safeAuthor = escapeHTML(b.author || 'Unknown');

        return `
            <div class="book-card">
                <div class="book-cover-container">
                    <img src="${coverSrc}" alt="${safeTitle} cover" onerror="this.onerror=null; this.src='/images/default-cover.png';">
                </div>
                <div class="book-info">
                    <div>
                        <div class="book-title">${safeTitle}</div>
                        <div class="book-author">by ${safeAuthor}</div>
                    </div>
                    <div>${actionBtn}</div>
                </div>
            </div>
        `;
    }).join('');
}

function filterLibraryBooks() {
    const query = document.getElementById('library-search-input').value.toLowerCase();
    const filtered = allLibraryBooks.filter(b => 
        (b.title && b.title.toLowerCase().includes(query)) || 
        (b.author && b.author.toLowerCase().includes(query))
    );
    renderLibraryGrid(filtered);
}

// Initialize Reader Application
checkAuth().then(() => {
    if (initialBookId) {
        openBook(initialBookId);
    } else {
        switchTab('library');
    }
});
