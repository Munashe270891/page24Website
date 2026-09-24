const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const path = require('path');
const { Paynow } = require('paynow');
const supabase = require('./database');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-session-secret-in-production',
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// API requests must never be redirected to an HTML login page.
function requireLogin(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized access. Please log in.' });
    next();
}

async function requireAdmin(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized access.' });
    try {
        const { data: user, error } = await supabase.from('users').select('role').eq('id', req.session.user.id).single();
        if (error || !user || user.role !== 'admin') return res.status(403).json({ error: 'Administrator privileges required.' });
        next();
    } catch (error) {
        console.error('Admin authentication error:', error);
        res.status(500).json({ error: 'Server authentication error.' });
    }
}

function normalizeBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    return ['true', '1', 'on', 'yes'].includes(String(value).trim().toLowerCase());
}

function serializeBook(book = {}) {
    return {
        id: book.id,
        userId: book.user_id,
        title: book.title || '',
        author: book.author_name || book.author || '',
        description: book.description || '',
        price: Number(book.price) || 0,
        mode: book.mode || 'pdf',
        status: book.status || 'active',
        category: book.category || null,
        subTheme: book.sub_theme || null,
        coverImage: book.cover_image || null,
        pdfSource: book.pdf_source || null,
        allowDownload: normalizeBoolean(book.allow_download),
        createdAt: book.created_at || null
    };
}

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
const dualUploadFields = upload.fields([{ name: 'coverImage', maxCount: 1 }, { name: 'pdfBook', maxCount: 1 }]);
const profileUploadFields = upload.fields([
    { name: 'idDoc', maxCount: 1 },
    { name: 'isbnDoc', maxCount: 1 },
    { name: 'profilePic', maxCount: 1 }
]);

async function uploadToSupabase(file, bucket) {
    if (!file || !file.buffer) throw new Error('Invalid upload.');
    const originalExtension = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
    const extension = originalExtension || (file.mimetype === 'application/pdf' ? '.pdf' : '');
    const fileName = `${crypto.randomUUID()}${extension}`;
    const { error } = await supabase.storage.from(bucket).upload(fileName, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false
    });
    if (error) throw error;
    if (bucket === 'covers') {
        const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
        return data.publicUrl;
    }
    return fileName;
}

function regenerateSession(req, user) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) return reject(error);
            req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
            resolve(req.session.user);
        });
    });
}

function getProfileValue(body, camel, snake, fallback = null) {
    return body[camel] !== undefined ? body[camel] : (body[snake] !== undefined ? body[snake] : fallback);
}

const integrationId = process.env.PAYNOW_INTEGRATION_ID || '25640';
const paynow = new Paynow(integrationId, process.env.PAYNOW_INTEGRATION_KEY);

// Authentication
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: 'All registration fields are required.' });
        if (String(password).length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
        const { error } = await supabase.from('users').insert([{
            username: String(username).trim(), email: String(email).trim().toLowerCase(),
            password: await bcrypt.hash(password, 12), role: 'author'
        }]);
        if (error) return res.status(error.code === '23505' ? 400 : 500).json({ error: error.code === '23505' ? 'Username or email already exists.' : error.message });
        res.status(201).json({ success: true, message: 'Registration successful!' });
    } catch (error) { res.status(500).json({ error: 'Registration failed.' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, redirectTo } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
        const { data: user, error } = await supabase.from('users').select('id,username,email,password,role').eq('email', String(email).trim().toLowerCase()).maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid email or password.' });
        const sessionUser = await regenerateSession(req, user);
        const destination = typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : ((user.role === 'author' || user.role === 'admin') ? '/dashboard' : '/read');
        res.json({ success: true, message: 'Logged in successfully!', user: sessionUser, redirectUrl: destination });
    } catch (error) { console.error('Login error:', error); res.status(500).json({ error: 'Login failed.' }); }
});

app.get('/api/auth/logout', (req, res) => {
    req.session.destroy(error => error ? res.status(500).json({ error: 'Could not log out.' }) : res.json({ success: true, message: 'Logged out successfully!' }));
});
app.get('/api/auth/me', (req, res) => req.session.user ? res.json({ loggedIn: true, user: req.session.user }) : res.status(401).json({ loggedIn: false }));

// Author profile and KYC
const profileSelect = `legal_name,id_number,id_doc_path,phone,address,kin_name,kin_relation,kin_phone,isbn,isbn_doc_path,profile_complete,bio,profile_pic_url,facebook_handle,tiktok_handle,twitter_handle,instagram_handle,facebook_followers,tiktok_followers,twitter_followers,instagram_followers,show_facebook,show_tiktok,show_twitter,show_instagram`;
app.get('/api/author/profile', requireLogin, async (req, res) => {
    const { data, error } = await supabase.from('users').select(profileSelect).eq('id', req.session.user.id).single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || {});
});

app.post('/api/author/profile', requireLogin, profileUploadFields, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const body = req.body;
        const legalName = getProfileValue(body, 'legalName', 'legal_name');
        const phone = body.phone;
        if (!legalName || !phone) return res.status(400).json({ error: 'Please complete your Full Legal Name and Phone Number.' });
        const { data: existing, error: existingError } = await supabase.from('users').select('id_doc_path,isbn_doc_path,profile_pic_url').eq('id', userId).single();
        if (existingError) return res.status(500).json({ error: existingError.message });
        let idDocPath = existing.id_doc_path;
        let isbnDocPath = existing.isbn_doc_path;
        let profilePicUrl = existing.profile_pic_url;
        if (req.files?.idDoc?.[0]) idDocPath = await uploadToSupabase(req.files.idDoc[0], 'covers');
        if (req.files?.isbnDoc?.[0]) isbnDocPath = await uploadToSupabase(req.files.isbnDoc[0], 'covers');
        if (req.files?.profilePic?.[0]) profilePicUrl = await uploadToSupabase(req.files.profilePic[0], 'covers');
        const update = {
            legal_name: legalName, phone, id_number: getProfileValue(body, 'idNumber', 'id_number'),
            id_doc_path: idDocPath, address: body.address || null,
            kin_name: getProfileValue(body, 'kinName', 'kin_name', body.nextOfKinName),
            kin_relation: getProfileValue(body, 'kinRelation', 'kin_relation', body.nextOfKinRelation),
            kin_phone: getProfileValue(body, 'kinPhone', 'kin_phone', body.nextOfKinPhone),
            isbn: body.isbn || null, isbn_doc_path: isbnDocPath, profile_complete: 1,
            bio: body.bio ? String(body.bio).substring(0, 160) : null, profile_pic_url: profilePicUrl,
            facebook_handle: getProfileValue(body, 'facebookHandle', 'facebook_handle'),
            tiktok_handle: getProfileValue(body, 'tiktokHandle', 'tiktok_handle'),
            twitter_handle: getProfileValue(body, 'twitterHandle', 'twitter_handle'),
            instagram_handle: getProfileValue(body, 'instagramHandle', 'instagram_handle'),
            facebook_followers: parseInt(getProfileValue(body, 'facebookFollowers', 'facebook_followers', 0), 10) || 0,
            tiktok_followers: parseInt(getProfileValue(body, 'tiktokFollowers', 'tiktok_followers', 0), 10) || 0,
            twitter_followers: parseInt(getProfileValue(body, 'twitterFollowers', 'twitter_followers', 0), 10) || 0,
            instagram_followers: parseInt(getProfileValue(body, 'instagramFollowers', 'instagram_followers', 0), 10) || 0,
            show_facebook: normalizeBoolean(getProfileValue(body, 'showFacebook', 'show_facebook')),
            show_tiktok: normalizeBoolean(getProfileValue(body, 'showTiktok', 'show_tiktok')),
            show_twitter: normalizeBoolean(getProfileValue(body, 'showTwitter', 'show_twitter')),
            show_instagram: normalizeBoolean(getProfileValue(body, 'showInstagram', 'show_instagram'))
        };
        const { error } = await supabase.from('users').update(update).eq('id', userId);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true, message: 'Author profile saved successfully!' });
    } catch (error) { console.error('Profile error:', error); res.status(500).json({ error: error.message }); }
});

// Notifications
app.get('/api/notifications', requireLogin, async (req, res) => {
    const { data, error } = await supabase.from('notifications').select('*').or(`user_id.eq.${req.session.user.id},user_id.is.null`).order('created_at', { ascending: false }).limit(20);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});
app.post('/api/notifications/:id/read', requireLogin, async (req, res) => {
    const { error } = await supabase.from('notifications').update({ is_read: 1 }).eq('id', req.params.id).or(`user_id.eq.${req.session.user.id},user_id.is.null`);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/dashboard', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/read', (req, res) => res.sendFile(path.join(__dirname, 'views', 'reader.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'views', 'terms.html')));
app.get('/secret-admin-console', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));

const bookSelect = 'id,user_id,title,author,author_name,description,price,mode,status,category,sub_theme,cover_image,pdf_source,allow_download,created_at';
app.get('/api/books', async (req, res) => {
    try {
        const { data: books, error } = await supabase.from('books').select(`${bookSelect},users(id,bio,profile_pic_url,facebook_handle,tiktok_handle,twitter_handle,instagram_handle,facebook_followers,tiktok_followers,twitter_followers,instagram_followers,show_facebook,show_tiktok,show_twitter,show_instagram)`).or('status.eq.active,status.is.null').order('id', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json((books || []).map(book => ({ ...serializeBook(book), author_id: book.users?.id || book.user_id, author_bio: book.users?.bio || null, author_picture: book.users?.profile_pic_url || null })));
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/books/my-books', requireLogin, async (req, res) => {
    const { data, error } = await supabase.from('books').select(bookSelect).eq('user_id', req.session.user.id).order('id', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map(serializeBook));
});

app.get('/api/books/my-library', requireLogin, async (req, res) => {
    const userId = req.session.user.id;
    const { data: purchases, error: purchaseError } = await supabase.from('purchases').select('book_id').eq('buyer_id', userId);
    if (purchaseError) return res.status(500).json({ error: purchaseError.message });
    const ids = (purchases || []).map(p => p.book_id);
    let query = supabase.from('books').select(bookSelect);
    query = ids.length ? query.or(`user_id.eq.${userId},price.eq.0,id.in.(${ids.join(',')})`) : query.or(`user_id.eq.${userId},price.eq.0`);
    const { data, error } = await query.order('id', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to load personal library.' });
    res.json((data || []).map(serializeBook));
});

app.get('/api/books/:id/pdf-stream', async (req, res) => {
    const { data: book, error } = await supabase.from('books').select('pdf_source').eq('id', req.params.id).single();
    if (error || !book?.pdf_source) return res.status(404).json({ error: 'PDF document file not found.' });
    const { data: file, error: downloadError } = await supabase.storage.from('pdfs').download(book.pdf_source);
    if (downloadError) return res.status(404).json({ error: 'Failed to download PDF from bucket.' });
    res.type('application/pdf').set('Content-Disposition', 'inline').send(Buffer.from(await file.arrayBuffer()));
});

app.get('/api/books/:id/download-free', async (req, res) => {
    const { data: book, error } = await supabase.from('books').select('title,pdf_source,price,allow_download').eq('id', req.params.id).single();
    if (error || !book) return res.status(404).json({ error: 'Book not found.' });
    if (Number(book.price) !== 0) return res.status(403).json({ error: 'This title requires purchase before downloading.' });
    if (!normalizeBoolean(book.allow_download)) return res.status(403).json({ error: 'Offline downloads are restricted for this book.' });
    if (!book.pdf_source) return res.status(404).json({ error: 'No PDF file attached to this book.' });
    const { data: file, error: downloadError } = await supabase.storage.from('pdfs').download(book.pdf_source);
    if (downloadError) return res.status(404).json({ error: 'File retrieval failed.' });
    const name = `${String(book.title || 'book').replace(/[^a-z0-9]/gi, '_')}.pdf`;
    res.type('application/pdf').set('Content-Disposition', `attachment; filename="${name}"`).send(Buffer.from(await file.arrayBuffer()));
});

app.post('/api/books/publish', requireLogin, dualUploadFields, async (req, res) => {
    try {
        const b = req.body;
        if (!normalizeBoolean(b.agreeCopyright) || !normalizeBoolean(b.agreeTerms)) return res.status(400).json({ error: 'You must accept Copyright & Terms.' });
        if (!req.files?.coverImage?.[0]) return res.status(400).json({ error: 'Front cover artwork is required.' });
        const mode = b.mode || 'pdf';
        if (mode === 'pdf' && !req.files?.pdfBook?.[0]) return res.status(400).json({ error: 'PDF file document is required in PDF mode.' });
        const cover = await uploadToSupabase(req.files.coverImage[0], 'covers');
        const pdf = req.files?.pdfBook?.[0] ? await uploadToSupabase(req.files.pdfBook[0], 'pdfs') : null;
        const author = b.authorName || req.session.user.username;
        const { data: book, error } = await supabase.from('books').insert([{
            user_id: req.session.user.id, title: b.title, author, author_name: author, description: b.description || null,
            price: Number.parseFloat(b.price) || 0, mode, category: b.category || null, sub_theme: b.subTheme || null,
            allow_download: normalizeBoolean(b.allowDownload !== undefined ? b.allowDownload : b.downloadRule), status: 'active', cover_image: cover, pdf_source: pdf
        }]).select(bookSelect).single();
        if (error) return res.status(500).json({ error: error.message });
        const content = b.chapterBody || b.content;
        if (mode === 'html' && content) {
            const { error: chapterError } = await supabase.from('chapters').insert([{ book_id: book.id, chapter_number: 1, title: b.chapterTitle || 'Chapter 1', body: content }]);
            if (chapterError) return res.status(500).json({ error: chapterError.message });
        }
        res.status(201).json({ success: true, bookId: book.id, book: serializeBook(book) });
    } catch (error) { console.error('Publish error:', error); res.status(500).json({ error: error.message }); }
});

// Chapter management. A unique (book_id, chapter_number) constraint is required in Supabase.
app.get('/api/books/:bookId/chapters', requireLogin, async (req, res) => {
    const { data: book } = await supabase.from('books').select('id').eq('id', req.params.bookId).eq('user_id', req.session.user.id).maybeSingle();
    if (!book) return res.status(403).json({ error: 'Forbidden or book not found.' });
    const { data, error } = await supabase.from('chapters').select('*').eq('book_id', req.params.bookId).order('chapter_number');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/books/:bookId/chapters', requireLogin, async (req, res) => {
    const { title, content, body } = req.body;
    const finalContent = content ?? body;
    if (!title || !finalContent) return res.status(400).json({ error: 'Missing required chapter parameters.' });
    const { data: book } = await supabase.from('books').select('id').eq('id', req.params.bookId).eq('user_id', req.session.user.id).maybeSingle();
    if (!book) return res.status(403).json({ error: 'Unauthorized book pipeline action.' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data: last } = await supabase.from('chapters').select('chapter_number').eq('book_id', req.params.bookId).order('chapter_number', { ascending: false }).limit(1).maybeSingle();
        const number = (last?.chapter_number || 0) + 1;
        const { data: chapter, error } = await supabase.from('chapters').insert([{ book_id: req.params.bookId, chapter_number: number, title, body: finalContent }]).select().single();
        if (!error) return res.status(201).json({ success: true, chapterId: chapter.id });
        if (error.code !== '23505') return res.status(500).json({ error: 'Failed to write chapter to database.' });
    }
    res.status(409).json({ error: 'Another chapter was created concurrently. Please retry.' });
});

app.put('/api/books/chapters/:chapterId', requireLogin, async (req, res) => {
    try {
        const { title, body, content } = req.body;
        if (!title || (body === undefined && content === undefined)) return res.status(400).json({ error: 'Chapter title and content are required.' });
        const { data: chapter, error: fetchError } = await supabase.from('chapters').select('id,book_id,books!inner(user_id)').eq('id', req.params.chapterId).maybeSingle();
        if (fetchError) return res.status(500).json({ error: fetchError.message });
        if (!chapter || chapter.books.user_id !== req.session.user.id) return res.status(403).json({ error: 'Unauthorized or chapter not found.' });
        const { data, error } = await supabase.from('chapters').update({ title, body: body ?? content }).eq('id', req.params.chapterId).select().single();
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true, chapter: data });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/books/my-web-books', requireLogin, async (req, res) => {
    const { data, error } = await supabase.from('books').select(bookSelect).eq('user_id', req.session.user.id).eq('mode', 'html');
    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map(serializeBook));
});

app.put('/api/books/:id', requireLogin, dualUploadFields, async (req, res) => {
    try {
        const { data: old, error: fetchError } = await supabase.from('books').select('*').eq('id', req.params.id).eq('user_id', req.session.user.id).single();
        if (fetchError || !old) return res.status(404).json({ error: 'Book not found or unauthorized.' });
        const b = req.body;
        const update = {
            title: b.title || old.title, description: b.description ?? old.description,
            price: b.price === undefined ? old.price : (Number.parseFloat(b.price) || 0), category: b.category || old.category,
            sub_theme: b.subTheme || b.sub_theme || old.sub_theme,
            allow_download: b.allowDownload === undefined && b.allow_download === undefined ? old.allow_download : normalizeBoolean(b.allowDownload ?? b.allow_download),
            cover_image: req.files?.coverImage?.[0] ? await uploadToSupabase(req.files.coverImage[0], 'covers') : old.cover_image,
            pdf_source: req.files?.pdfBook?.[0] ? await uploadToSupabase(req.files.pdfBook[0], 'pdfs') : old.pdf_source
        };
        const { data, error } = await supabase.from('books').update(update).eq('id', req.params.id).eq('user_id', req.session.user.id).select(bookSelect).single();
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true, book: serializeBook(data) });
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.delete('/api/books/:id', requireLogin, async (req, res) => {
    const { data, error } = await supabase.from('books').delete().eq('id', req.params.id).eq('user_id', req.session.user.id).select('id');
    if (error) return res.status(500).json({ error: error.message });
    if (!data?.length) return res.status(404).json({ error: 'Book not found or unauthorized.' });
    res.json({ success: true, message: 'Book permanently deleted.' });
});

// Payments
app.post('/api/payments/initiate', async (req, res) => {
    try {
        const { bookId, email } = req.body;
        const { data: book, error } = await supabase.from('books').select('id,title,price,status').eq('id', bookId).single();
        if (error || !book) return res.status(404).json({ error: 'Book not found.' });
        if (book.status === 'offline') return res.status(403).json({ error: 'This book is offline.' });
        const price = Number(book.price);
        if (!email || !Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'Valid email and price are required.' });
        const payment = paynow.createPayment(`INV${book.id}${Date.now()}`, email);
        payment.add(String(book.title || 'Digital Book Purchase').replace(/[^\w\s]/gi, ''), price);
        const site = process.env.SITE_URL || `http://localhost:${PORT}`;
        paynow.resultUrl = `${site}/api/payments/callback`;
        paynow.returnUrl = `${site}/?status=success&bookId=${book.id}`;
        const response = await paynow.send(payment);
        if (!response?.success) return res.status(400).json({ error: response?.error || 'Payment gateway rejected request.' });
        res.json({ success: true, redirectUrl: response.redirectUrl, pollUrl: response.pollUrl });
    } catch (error) { console.error('Payment error:', error); res.status(500).json({ error: 'Payment processing failed.' }); }
});
app.post('/api/payments/callback', (req, res) => { console.log('Paynow callback received:', req.body); res.sendStatus(200); });
app.post('/api/books/:id/buy', requireLogin, async (req, res) => {
    const { data: book, error } = await supabase.from('books').select('price,user_id,status').eq('id', req.params.id).single();
    if (error || !book) return res.status(404).json({ error: 'Book not found.' });
    if (book.status === 'offline') return res.status(403).json({ error: 'This title is unavailable.' });
    if (book.user_id === req.session.user.id) return res.status(400).json({ error: 'You cannot purchase your own book.' });
    const { data: owned } = await supabase.from('purchases').select('id').eq('book_id', req.params.id).eq('buyer_id', req.session.user.id).maybeSingle();
    if (owned) return res.status(400).json({ error: 'You already own this book.' });
    const { error: insertError } = await supabase.from('purchases').insert([{ book_id: req.params.id, buyer_id: req.session.user.id, price: book.price }]);
    if (insertError) return res.status(500).json({ error: 'Purchase processing failed.' });
    res.json({ success: true, message: 'Book purchased successfully!' });
});

app.get('/api/analytics/sales', requireLogin, async (req, res) => {
    const { data, error } = await supabase.from('purchases').select('id,price,created_at,books!inner(title,user_id),users!purchases_buyer_id_fkey(username)').eq('books.user_id', req.session.user.id).order('created_at', { ascending: false }).limit(100);
    if (error) return res.status(500).json({ error: 'Failed to retrieve sales data.' });
    const bookBreakdown = {};
    const recentTransactions = (data || []).map(p => {
        const title = p.books?.title || 'Unknown Title'; const price = Number(p.price) || 0;
        bookBreakdown[title] ||= { sales: 0, earnings: 0 }; bookBreakdown[title].sales += 1; bookBreakdown[title].earnings += price;
        return { purchase_id: p.id, sale_price: price, sale_date: p.created_at, book_title: title, buyer_name: p.users?.username || 'Unknown' };
    });
    res.json({ totalSalesCount: recentTransactions.length, totalEarnings: recentTransactions.reduce((sum, row) => sum + row.sale_price, 0), recentTransactions, bookBreakdown, limited: true });
});

// Administration
app.get('/api/admin/books', requireAdmin, async (req, res) => {
    const { data, error } = await supabase.from('books').select('id,title,author,status,created_at,users(email)').order('id', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ books: (data || []).map(b => ({ id: b.id, title: b.title, author: b.author, status: b.status || 'active', created_at: b.created_at, author_email: b.users?.email || null })) });
});
app.post('/api/admin/books/:id/toggle-status', requireAdmin, async (req, res) => {
    if (!['active', 'offline'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status value.' });
    const { error } = await supabase.from('books').update({ status: req.body.status }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: `Book status changed to '${req.body.status}'.` });
});
app.post('/api/admin/broadcast-notification', requireAdmin, async (req, res) => {
    if (!req.body.title || !req.body.message) return res.status(400).json({ error: 'Announcement title and message are required.' });
    const { error } = await supabase.from('notifications').insert([{ user_id: req.body.targetUserId || null, title: req.body.title, message: req.body.message }]);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'System update broadcasted successfully!' });
});

app.use('/api', (error, req, res, next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
    if (error) return res.status(500).json({ error: 'Unexpected server error.' });
    next();
});

app.listen(PORT, () => console.log(`Page 24 active at http://localhost:${PORT}`));

module.exports = app;
