require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { Paynow } = require('paynow'); 
const supabase = require('./database'); // Import Supabase Client
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
//              MIDDLEWARE SETUP
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust Render's reverse proxy for secure HTTPS cookies
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'zim-publish-secure-random-key-1234',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

async function requireAdmin(req, res, next) {
    if (!req.session.user) {
        if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
            return res.status(401).json({ error: "Unauthorized access." });
        }
        return res.redirect('/login');
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', req.session.user.id)
            .single();

        if (error || !user || user.role !== 'admin') {
            if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
                return res.status(403).json({ error: "Access denied: Administrator privileges required." });
            }
            return res.status(403).send("Access Denied: Administrator Privileges Required.");
        }
        next();
    } catch (err) {
        return res.status(500).json({ error: "Server authentication error." });
    }
}

// Memory Storage for Supabase Bucket Uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const dualUploadFields = upload.fields([
    { name: 'coverImage', maxCount: 1 }, 
    { name: 'pdfBook', maxCount: 1 }
]);

const profileUploadFields = upload.fields([
    { name: 'idDoc', maxCount: 1 },
    { name: 'isbnDoc', maxCount: 1 }
]);

// Helper Function: Stream file directly to Supabase Storage Buckets
async function uploadToSupabase(file, bucket) {
    const fileName = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (error) throw error;

    if (bucket === 'covers') {
        const { data: publicUrlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(fileName);
        return publicUrlData.publicUrl;
    }
    return fileName; // Return storage identifier key for private PDF bucket
}

const integrationId = process.env.PAYNOW_INTEGRATION_ID || "25640"; 
const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;
const paynow = new Paynow(integrationId, integrationKey);

// ==========================================
//           USER AUTH ENDPOINTS
// ==========================================

// 1. Register User
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: "All registration fields are required." });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const { data, error } = await supabase
        .from('users')
        .insert([{ username, email, password: hashedPassword, role: role || 'author' }]);

    if (error) {
        if (error.code === '23505') { // Postgres unique constraint failure
            return res.status(400).json({ error: "Username or Email already exists." });
        }
        return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ success: true, message: "Registration successful!" });
});

// 2. Login User
app.post('/api/auth/login', async (req, res) => {
    const { email, password, redirectTo } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!user) return res.status(401).json({ error: "Invalid email or password." });

    const passwordMatches = bcrypt.compareSync(password, user.password);
    if (!passwordMatches) return res.status(401).json({ error: "Invalid email or password." });

    req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
    };

    let destination = redirectTo;
    if (!destination) {
        destination = (user.role === 'author' || user.role === 'admin') ? '/dashboard' : '/read';
    }

    res.json({ 
        success: true, 
        message: "Logged in successfully!", 
        user: req.session.user,
        redirectUrl: destination 
    });
});

// 3. Logout User
app.get('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: "Could not log out." });
        if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
            return res.json({ success: true, message: "Logged out successfully!" });
        }
        res.redirect('/');
    });
});

// 4. Get Current User Details
app.get('/api/auth/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ loggedIn: false });
    res.json({ loggedIn: true, user: req.session.user });
});

// ==========================================
//        AUTHOR PROFILE & KYC ENDPOINTS
// ==========================================

// 1. Get Logged-in Author's KYC Profile
app.get('/api/author/profile', requireLogin, async (req, res) => {
    const userId = req.session.user.id;

    const { data, error } = await supabase
        .from('users')
        .select('legal_name, id_number, id_doc_path, phone, address, kin_name, kin_relation, kin_phone, isbn, isbn_doc_path, profile_complete')
        .eq('id', userId)
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || {});
});

// 2. Save / Update Author KYC Profile
app.post('/api/author/profile', requireLogin, profileUploadFields, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { legalName, idNumber, phone, address, kinName, kinRelation, kinPhone, isbn } = req.body;

        if (!legalName || !idNumber || !phone || !address || !kinName || !kinRelation || !kinPhone) {
            return res.status(400).json({ error: "All required KYC fields must be completed." });
        }

        let idDocPath = null;
        let isbnDocPath = null;

        if (req.files && req.files['idDoc']) {
            idDocPath = await uploadToSupabase(req.files['idDoc'][0], 'covers');
        }

        if (req.files && req.files['isbnDoc']) {
            isbnDocPath = await uploadToSupabase(req.files['isbnDoc'][0], 'covers');
        }

        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('id_doc_path, isbn_doc_path')
            .eq('id', userId)
            .single();

        if (userErr) return res.status(500).json({ error: userErr.message });

        const finalIdDoc = idDocPath || (user ? user.id_doc_path : null);
        const finalIsbnDoc = isbnDocPath || (user ? user.isbn_doc_path : null);

        if (!finalIdDoc) {
            return res.status(400).json({ error: "A clear Government ID image or document upload is required." });
        }

        const { error: updateErr } = await supabase
            .from('users')
            .update({ 
                legal_name: legalName, 
                id_number: idNumber, 
                id_doc_path: finalIdDoc, 
                phone, 
                address, 
                kin_name: kinName, 
                kin_relation: kinRelation, 
                kin_phone: kinPhone, 
                isbn: isbn || null, 
                isbn_doc_path: finalIsbnDoc,
                profile_complete: 1
            })
            .eq('id', userId);

        if (updateErr) return res.status(500).json({ error: updateErr.message });
        res.json({ success: true, message: "KYC Author Verification Profile saved successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
//          NOTIFICATIONS SYSTEM
// ==========================================

app.get('/api/notifications', requireLogin, async (req, res) => {
    const userId = req.session.user.id;

    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .or(`user_id.eq.${userId},user_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/notifications/:id/read', requireLogin, async (req, res) => {
    const notificationId = req.params.id;

    const { error } = await supabase
        .from('notifications')
        .update({ is_read: 1 })
        .eq('id', notificationId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ==========================================
//              PAGE VIEWS ROUTES
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/dashboard', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/read', (req, res) => res.sendFile(path.join(__dirname, 'views', 'reader.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'views', 'terms.html')));
app.get('/secret-admin-console', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));

// ==========================================
//             BOOK ACTIONS ENDPOINTS
// ==========================================

app.get('/api/books', async (req, res) => {
    const { data, error } = await supabase
        .from('books')
        .select('*')
        .or('status.eq.active,status.is.null')
        .order('id', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Secure PDF Streaming from Private Bucket
app.get('/api/books/:id/pdf-stream', async (req, res) => {
    const bookId = req.params.id;

    const { data: book, error } = await supabase
        .from('books')
        .select('pdf_source, mode')
        .eq('id', bookId)
        .single();

    if (error || !book || !book.pdf_source) {
        return res.status(404).json({ error: "PDF document file not found." });
    }

    const { data: fileData, error: downloadErr } = await supabase.storage
        .from('pdfs')
        .download(book.pdf_source);

    if (downloadErr) return res.status(404).json({ error: "Failed to download PDF from bucket." });

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
});

// Secure Free PDF Download Endpoint
app.get('/api/books/:id/download-free', async (req, res) => {
    const bookId = req.params.id;

    const { data: book, error } = await supabase
        .from('books')
        .select('title, pdf_source, price, allow_download')
        .eq('id', bookId)
        .single();

    if (error || !book) return res.status(404).json({ error: "Book not found." });

    if (parseFloat(book.price) !== 0) {
        return res.status(403).json({ error: "This title requires purchase before downloading." });
    }

    if (parseInt(book.allow_download) !== 1) {
        return res.status(403).json({ error: "The author has restricted offline file downloads for this book." });
    }

    if (!book.pdf_source) {
        return res.status(404).json({ error: "No PDF file attached to this book." });
    }

    const { data: fileData, error: downloadErr } = await supabase.storage
        .from('pdfs')
        .download(book.pdf_source);

    if (downloadErr) return res.status(404).json({ error: "File retrieval failed." });

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const downloadFileName = `${book.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
    res.send(buffer);
});

app.get('/api/books/my-library', requireLogin, async (req, res) => {
    const userId = req.session.user.id;

    const { data: purchases } = await supabase
        .from('purchases')
        .select('book_id')
        .eq('buyer_id', userId);

    const purchasedBookIds = purchases ? purchases.map(p => p.book_id) : [];

    let filterString = `user_id.eq.${userId},price.eq.0`;
    if (purchasedBookIds.length > 0) {
        filterString += `,id.in.(${purchasedBookIds.join(',')})`;
    }

    const { data: books, error } = await supabase
        .from('books')
        .select('*')
        .or(filterString)
        .order('id', { ascending: false });

    if (error) return res.status(500).json({ error: "Failed to load personal library." });
    res.json(books);
});

app.get('/api/books/my-books', requireLogin, async (req, res) => {
    const userId = req.session.user.id;

    const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', userId)
        .order('id', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Book Publishing Endpoint connected directly to Supabase Storage
app.post('/api/books/publish', requireLogin, dualUploadFields, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { title, description, price, mode, allowDownload, chapterTitle, chapterBody, agreeCopyright, agreeTerms } = req.body;

        if (!agreeCopyright || !agreeTerms) {
            return res.status(400).json({ 
                error: "Legal Compliance Rejection: You must accept Copyright & Terms." 
            });
        }

        let coverImageUrl = null;
        let securePdfPath = null;

        if (req.files && req.files['coverImage']) {
            coverImageUrl = await uploadToSupabase(req.files['coverImage'][0], 'covers');
        } else {
            return res.status(400).json({ error: "Front cover artwork is required." });
        }

        if (mode === 'pdf' && req.files && req.files['pdfBook']) {
            securePdfPath = await uploadToSupabase(req.files['pdfBook'][0], 'pdfs');
        }

        const authorName = req.session.user.username;

        const { data: newBook, error: bookErr } = await supabase
            .from('books')
            .insert([{
                user_id: userId,
                title,
                author: authorName,
                description,
                price: parseFloat(price),
                mode,
                allow_download: parseInt(allowDownload) || 0,
                status: 'active',
                cover_image: coverImageUrl,
                pdf_source: securePdfPath
            }])
            .select()
            .single();

        if (bookErr) return res.status(500).json({ error: bookErr.message });

        if (mode === 'html' && chapterTitle) {
            const { error: chapErr } = await supabase
                .from('chapters')
                .insert([{ book_id: newBook.id, title: chapterTitle, body: chapterBody }]);

            if (chapErr) return res.status(500).json({ error: chapErr.message });
        }

        res.status(201).json({ success: true, bookId: newBook.id });
    } catch (err) {
        console.error(">>> [PUBLISH PIPELINE ERROR]:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/books/secure-source', async (req, res) => {
    const bookId = req.query.bookId;

    const { data: book, error: bookErr } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

    if (bookErr || !book) return res.status(404).json({ error: "Secure clearance matching identity fault." });

    const { data: chapter } = await supabase
        .from('chapters')
        .select('title, body')
        .eq('book_id', bookId)
        .maybeSingle();

    res.json({
        ...book,
        chapterTitle: chapter ? chapter.title : null,
        chapterBody: chapter ? chapter.body : null
    });
});

// ==========================================
//    WEB BOOK STUDIO CHAPTER MANAGEMENT
// ==========================================

app.get('/api/books/my-web-books', requireLogin, async (req, res) => {
    const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', req.session.user.id)
        .eq('mode', 'html');

    if (error) return res.status(500).json({ error: 'Database query failure.' });
    res.json(data);
});

app.get('/api/books/:bookId/chapters', requireLogin, async (req, res) => {
    const { bookId } = req.params;

    const { data: book, error: bookErr } = await supabase
        .from('books')
        .select('id')
        .eq('id', bookId)
        .eq('user_id', req.session.user.id)
        .single();

    if (bookErr || !book) return res.status(403).json({ error: 'Forbidden or book not found.' });

    const { data: chapters, error: chapErr } = await supabase
        .from('chapters')
        .select('*')
        .eq('book_id', bookId)
        .order('id', { ascending: true });

    if (chapErr) return res.status(500).json({ error: 'Failed to retrieve chapters.' });
    res.json(chapters);
});

app.post('/api/books/chapters', requireLogin, async (req, res) => {
    const { bookId, title, content } = req.body;

    if (!bookId || !title || !content) {
        return res.status(400).json({ error: 'Missing required chapter parameters.' });
    }

    const { data: book, error: bookErr } = await supabase
        .from('books')
        .select('id')
        .eq('id', bookId)
        .eq('user_id', req.session.user.id)
        .single();

    if (bookErr || !book) return res.status(403).json({ error: 'Unauthorized book pipeline action.' });

    const { data: chapter, error: insertErr } = await supabase
        .from('chapters')
        .insert([{ book_id: bookId, title, body: content }])
        .select()
        .single();

    if (insertErr) return res.status(500).json({ error: 'Failed to write chapter to database.' });
    res.json({ success: true, chapterId: chapter.id });
});

// ==========================================
//        BOOK MANAGEMENT (EDIT & DELETE)
// ==========================================

app.put('/api/books/:id', requireLogin, async (req, res) => {
    const bookId = req.params.id;
    const { description, price } = req.body;

    if (!description || price === undefined) {
        return res.status(400).json({ error: 'Missing updated parameters.' });
    }

    const { data, error } = await supabase
        .from('books')
        .update({ description, price: parseFloat(price) })
        .eq('id', bookId)
        .eq('user_id', req.session.user.id)
        .select();

    if (error) return res.status(500).json({ error: 'Failed to update book profile.' });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Book not found or unauthorized.' });

    res.json({ success: true, message: 'Book updated successfully!' });
});

app.delete('/api/books/:id', requireLogin, async (req, res) => {
    const bookId = req.params.id;

    const { data, error } = await supabase
        .from('books')
        .delete()
        .eq('id', bookId)
        .eq('user_id', req.session.user.id)
        .select();

    if (error) return res.status(500).json({ error: 'Failed to purge book from database.' });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Book not found or unauthorized.' });

    res.json({ success: true, message: 'Book permanently deleted.' });
});

// ==========================================
//             PAYMENT SUBSYSTEM
// ==========================================

app.post('/api/payments/initiate', async (req, res) => {
    const { bookId, email } = req.body;

    const { data: book, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

    if (error || !book) return res.status(404).json({ error: "Targeted book item profile could not be verified." });

    if (book.status === 'offline') {
        return res.status(403).json({ error: "This book has been taken offline and cannot be purchased." });
    }

    const validPrice = parseFloat(book.price);
    if (isNaN(validPrice) || validPrice <= 0) return res.status(400).json({ error: "Invalid book price encountered for billing pipeline." });

    const cleanTitle = (book.title || "Digital Book Purchase").replace(/[^\w\s]/gi, '');

    let payment = paynow.createPayment(`INV${book.id}${Date.now()}`, email); 
    payment.add(cleanTitle, validPrice); 

    try {
        paynow.resultUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/api/payments/callback`; 
        paynow.returnUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/?status=success&bookId=${book.id}`; 

        let response = await paynow.send(payment);

        if (response && response.success) {
            res.json({ success: true, redirectUrl: response.redirectUrl, pollUrl: response.pollUrl }); 
        } else {
            const paynowError = response ? response.error : "Unknown connection timeout.";
            console.error(">>> [PAYNOW REJECTION]:", paynowError);
            res.status(400).json({ error: `Paynow Gateway Rejected Request: ${paynowError}` });
        }
    } catch (error) {
        console.error(">>> [PAYNOW EXCEPTION CRASH]:", error);
        res.status(500).json({ error: "Internal payment processing engine crash fault." });
    }
});

app.post('/api/payments/callback', (req, res) => {
    console.log("📥 Received Asynchronous Payment Status Webhook from Paynow Zimbabwe:", req.body); 
    res.sendStatus(200); 
});

// SANDBOX BUY ROUTE
app.post('/api/books/:id/buy', requireLogin, async (req, res) => {
    const bookId = req.params.id;
    const buyerId = req.session.user.id;

    const { data: book, error: bookErr } = await supabase
        .from('books')
        .select('price, user_id, status')
        .eq('id', bookId)
        .single();

    if (bookErr || !book) return res.status(404).json({ error: 'Book not found.' });

    if (book.status === 'offline') {
        return res.status(403).json({ error: 'This title is currently offline and unavailable for purchase.' });
    }

    if (book.user_id === buyerId) {
        return res.status(400).json({ error: 'You cannot purchase your own book!' });
    }

    const { data: alreadyBought } = await supabase
        .from('purchases')
        .select('id')
        .eq('book_id', bookId)
        .eq('buyer_id', buyerId)
        .maybeSingle();

    if (alreadyBought) return res.status(400).json({ error: 'You already own this book!' });

    const { error: insertErr } = await supabase
        .from('purchases')
        .insert([{ book_id: bookId, buyer_id: buyerId, price: book.price }]);

    if (insertErr) return res.status(500).json({ error: 'Purchase processing failed.' });
    res.json({ success: true, message: 'Book purchased successfully!' });
});

// ==========================================
//        SALES & ROYALTIES ANALYTICS
// ==========================================

app.get('/api/analytics/sales', requireLogin, async (req, res) => {
    const authorId = req.session.user.id;

    const { data: purchases, error } = await supabase
        .from('purchases')
        .select(`
            id,
            price,
            created_at,
            books!inner(title, user_id),
            users!purchases_buyer_id_fkey(username)
        `)
        .eq('books.user_id', authorId)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed to retrieve sales data.' });

    const totalSalesCount = purchases.length;
    const totalEarnings = purchases.reduce((sum, row) => sum + Number(row.price), 0);

    const bookBreakdown = {};
    const recentTransactions = purchases.map(p => {
        const title = p.books ? p.books.title : 'Unknown Title';
        const price = Number(p.price);

        if (!bookBreakdown[title]) {
            bookBreakdown[title] = { sales: 0, earnings: 0 };
        }
        bookBreakdown[title].sales += 1;
        bookBreakdown[title].earnings += price;

        return {
            purchase_id: p.id,
            sale_price: price,
            sale_date: p.created_at,
            book_title: title,
            buyer_name: p.users ? p.users.username : 'Unknown'
        };
    });

    res.json({
        totalSalesCount,
        totalEarnings,
        recentTransactions,
        bookBreakdown
    });
});

// ==========================================
//          ADMINISTRATOR MODERATION
// ==========================================

app.get('/api/admin/books', requireAdmin, async (req, res) => {
    const { data: books, error } = await supabase
        .from('books')
        .select(`
            id,
            title,
            author,
            status,
            created_at,
            users(email)
        `)
        .order('id', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const formattedBooks = books.map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        status: b.status || 'active',
        created_at: b.created_at,
        author_email: b.users ? b.users.email : null
    }));

    res.json({ books: formattedBooks });
});

app.post('/api/admin/books/:id/toggle-status', requireAdmin, async (req, res) => {
    const bookId = req.params.id;
    const { status } = req.body;

    if (!['active', 'offline'].includes(status)) {
        return res.status(400).json({ error: "Invalid status value provided." });
    }

    const { error } = await supabase
        .from('books')
        .update({ status })
        .eq('id', bookId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: `Book status changed to '${status}'.` });
});

app.post('/api/admin/broadcast-notification', requireAdmin, async (req, res) => {
    const { title, message, targetUserId } = req.body;

    if (!title || !message) {
        return res.status(400).json({ error: "Announcement title and message are required." });
    }

    const { error } = await supabase
        .from('notifications')
        .insert([{ user_id: targetUserId || null, title, message }]);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: "System update broadcasted successfully!" });
});

// ==========================================
//             ENGINE ACTIVATION
// ==========================================

app.listen(PORT, () => console.log(`Page 24 active at http://localhost:${PORT}`));
