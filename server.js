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

if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be configured in production.');
}

if (!process.env.PAYNOW_INTEGRATION_KEY) {
    console.warn('PAYNOW_INTEGRATION_KEY is not configured. Payment initiation will fail.');
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'local-development-session-secret';
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: SESSION_SECRET,
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

function sendError(res, status, message) {
    return res.status(status).json({ error: message });
}

function isSafeLocalPath(value) {
    return typeof value === 'string'
        && value.startsWith('/')
        && !value.startsWith('//')
        && !value.includes('\\');
}

function normalizeBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value === 1;
    }

    return ['true', '1', 'on', 'yes'].includes(
        String(value).trim().toLowerCase()
    );
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeText(value, maxLength = 255) {
    return String(value || '').trim().substring(0, maxLength);
}

function parsePositivePrice(value) {
    const price = Number.parseFloat(value);

    if (!Number.isFinite(price) || price < 0) {
        return null;
    }

    return Math.round(price * 100) / 100;
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

/*
 * Updated Authentication Middlewares:
 * Differentiate between API requests (return JSON) and browser view navigation (redirect to /login).
 */
function requireLogin(req, res, next) {
    if (!req.session.user) {
        if (req.path.startsWith('/api/') || req.headers['accept']?.includes('application/json')) {
            return sendError(res, 401, 'Unauthorized access. Please log in.');
        }
        return res.redirect('/login');
    }

    next();
}

async function requireAdmin(req, res, next) {
    if (!req.session.user) {
        if (req.path.startsWith('/api/') || req.headers['accept']?.includes('application/json')) {
            return sendError(res, 401, 'Unauthorized access.');
        }
        return res.redirect('/login');
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', req.session.user.id)
            .maybeSingle();

        if (error) {
            console.error('Admin lookup error:', error);
            if (req.path.startsWith('/api/')) {
                return sendError(res, 500, 'Unable to verify administrator privileges.');
            }
            return res.redirect('/');
        }

        if (!user || user.role !== 'admin') {
            if (req.path.startsWith('/api/')) {
                return sendError(res, 403, 'Administrator privileges required.');
            }
            return res.redirect('/');
        }

        next();
    } catch (error) {
        console.error('Admin authentication error:', error);
        if (req.path.startsWith('/api/')) {
            return sendError(res, 500, 'Server authentication error.');
        }
        return res.redirect('/');
    }
}

function regenerateSession(req, user) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) {
                return reject(error);
            }

            req.session.user = {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            };

            resolve(req.session.user);
        });
    });
}

function getProfileValue(body, camel, snake, fallback = null) {
    if (body[camel] !== undefined) {
        return body[camel];
    }

    if (body[snake] !== undefined) {
        return body[snake];
    }

    return fallback;
}

/*
 * Upload validation.
 */
const allowedImageTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
]);

const allowedDocumentTypes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
]);

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_UPLOAD_SIZE,
        files: 3
    },
    fileFilter: (req, file, callback) => {
        const isPdfUpload = file.fieldname === 'pdfBook';
        const allowedTypes = isPdfUpload
            ? new Set(['application/pdf'])
            : file.fieldname === 'coverImage'
                ? allowedImageTypes
                : allowedDocumentTypes;

        if (!allowedTypes.has(file.mimetype)) {
            return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE'));
        }

        callback(null, true);
    }
});

const dualUploadFields = upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'pdfBook', maxCount: 1 }
]);

const profileUploadFields = upload.fields([
    { name: 'idDoc', maxCount: 1 },
    { name: 'isbnDoc', maxCount: 1 }
]);

function getSafeExtension(file) {
    const originalExtension = path
        .extname(file.originalname || '')
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '')
        .slice(0, 10);

    if (file.mimetype === 'application/pdf') {
        return '.pdf';
    }

    if (file.mimetype === 'image/jpeg') {
        return '.jpg';
    }

    if (file.mimetype === 'image/png') {
        return '.png';
    }

    if (file.mimetype === 'image/webp') {
        return '.webp';
    }

    if (file.mimetype === 'image/gif') {
        return '.gif';
    }

    return originalExtension;
}

async function uploadToSupabase(file, bucket) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
        throw new Error('Invalid upload.');
    }

    const fileName = `${crypto.randomUUID()}${getSafeExtension(file)}`;

    const { error } = await supabase
        .storage
        .from(bucket)
        .upload(fileName, file.buffer, {
            contentType: file.mimetype || 'application/octet-stream',
            upsert: false
        });

    if (error) {
        throw error;
    }

    if (bucket === 'covers') {
        const { data } = supabase
            .storage
            .from(bucket)
            .getPublicUrl(fileName);

        return data.publicUrl;
    }

    return fileName;
}

async function downloadPdf(res, storagePath, disposition, fileName = null) {
    const { data: file, error } = await supabase
        .storage
        .from('pdfs')
        .download(storagePath);

    if (error || !file) {
        return sendError(res, 404, 'Failed to retrieve PDF file.');
    }

    res.type('application/pdf');

    if (disposition === 'attachment' && fileName) {
        const safeName = String(fileName)
            .replace(/[^a-z0-9._-]/gi, '_')
            .substring(0, 150);

        res.set(
            'Content-Disposition',
            `attachment; filename="${safeName}.pdf"`
        );
    } else {
        res.set('Content-Disposition', 'inline');
    }

    return res.send(
        Buffer.from(await file.arrayBuffer())
    );
}

async function getBookAccess(bookId, userId) {
    const { data: book, error } = await supabase
        .from('books')
        .select('id,user_id,price,status,pdf_source,title,allow_download')
        .eq('id', bookId)
        .maybeSingle();

    if (error || !book) {
        return { book: null, allowed: false };
    }

    if (book.status === 'offline') {
        return { book, allowed: false };
    }

    if (Number(book.price) === 0) {
        return { book, allowed: true };
    }

    if (!userId) {
        return { book, allowed: false };
    }

    if (String(book.user_id) === String(userId)) {
        return { book, allowed: true };
    }

    const { data: purchase, error: purchaseError } = await supabase
        .from('purchases')
        .select('id')
        .eq('book_id', bookId)
        .eq('buyer_id', userId)
        .maybeSingle();

    if (purchaseError) {
        console.error('Purchase access lookup error:', purchaseError);
        return { book, allowed: false };
    }

    return {
        book,
        allowed: Boolean(purchase)
    };
}

const integrationId = process.env.PAYNOW_INTEGRATION_ID || '25640';
const paynow = new Paynow(
    integrationId,
    process.env.PAYNOW_INTEGRATION_KEY
);

/*
 * Authentication
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        const username = normalizeText(req.body.username, 80);
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!username || !email || !password) {
            return sendError(res, 400, 'All registration fields are required.');
        }

        if (username.length < 3) {
            return sendError(res, 400, 'Username must contain at least 3 characters.');
        }

        if (password.length < 8) {
            return sendError(
                res,
                400,
                'Password must contain at least 8 characters.'
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return sendError(res, 400, 'Please provide a valid email address.');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const { error } = await supabase
            .from('users')
            .insert([{
                username,
                email,
                password: passwordHash,
                role: 'author'
            }]);

        if (error) {
            if (error.code === '23505') {
                return sendError(
                    res,
                    400,
                    'Username or email already exists.'
                );
            }

            console.error('Registration database error:', error);
            return sendError(res, 500, 'Registration failed.');
        }

        res.status(201).json({
            success: true,
            message: 'Registration successful!'
        });
    } catch (error) {
        console.error('Registration error:', error);
        sendError(res, 500, 'Registration failed.');
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!email || !password) {
            return sendError(
                res,
                400,
                'Email and password are required.'
            );
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id,username,email,password,role')
            .eq('email', email)
            .maybeSingle();

        if (error) {
            console.error('Login lookup error:', error);
            return sendError(res, 500, 'Login failed.');
        }

        if (!user || !user.password) {
            return sendError(res, 401, 'Invalid email or password.');
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return sendError(res, 401, 'Invalid email or password.');
        }

        const sessionUser = await regenerateSession(req, user);

        const requestedRedirect = req.body.redirectTo;

        const destination = isSafeLocalPath(requestedRedirect)
            ? requestedRedirect
            : (user.role === 'author' || user.role === 'admin')
                ? '/dashboard'
                : '/read';

        res.json({
            success: true,
            message: 'Logged in successfully!',
            user: sessionUser,
            redirectUrl: destination
        });
    } catch (error) {
        console.error('Login error:', error);
        sendError(res, 500, 'Login failed.');
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(error => {
        if (error) {
            console.error('Logout error:', error);
            return sendError(res, 500, 'Could not log out.');
        }

        res.clearCookie('connect.sid');
        res.json({
            success: true,
            message: 'Logged out successfully!'
        });
    });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ loggedIn: false });
    }

    res.json({
        loggedIn: true,
        user: req.session.user
    });
});

/*
 * Author profile and KYC
 */
const profileSelect = [
    'legal_name',
    'id_number',
    'id_doc_path',
    'phone',
    'address',
    'kin_name',
    'kin_relation',
    'kin_phone',
    'isbn',
    'isbn_doc_path',
    'profile_complete',
    'bio'
].join(',');

app.get('/api/author/profile', requireLogin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select(profileSelect)
            .eq('id', req.session.user.id)
            .maybeSingle();

        if (error) {
            return sendError(res, 500, error.message);
        }

        res.json(data || {});
    } catch (error) {
        console.error('Profile lookup error:', error);
        sendError(res, 500, 'Failed to load profile.');
    }
});

app.post(
    '/api/author/profile',
    requireLogin,
    profileUploadFields,
    async (req, res) => {
        try {
            const userId = req.session.user.id;
            const body = req.body;

            const legalName = normalizeText(
                getProfileValue(body, 'legalName', 'legal_name'),
                150
            );

            const phone = normalizeText(body.phone, 50);

            if (!legalName || !phone) {
                return sendError(
                    res,
                    400,
                    'Please complete your Full Legal Name and Phone Number.'
                );
            }

            const { data: existing, error: existingError } = await supabase
                .from('users')
                .select('id_doc_path,isbn_doc_path')
                .eq('id', userId)
                .single();

            if (existingError || !existing) {
                return sendError(res, 500, 'Unable to load existing profile.');
            }

            let idDocPath = existing.id_doc_path;
            let isbnDocPath = existing.isbn_doc_path;

            if (req.files?.idDoc?.[0]) {
                idDocPath = await uploadToSupabase(
                    req.files.idDoc[0],
                    'covers'
                );
            }

            if (req.files?.isbnDoc?.[0]) {
                isbnDocPath = await uploadToSupabase(
                    req.files.isbnDoc[0],
                    'covers'
                );
            }

            const update = {
                legal_name: legalName,
                phone,
                id_number: getProfileValue(
                    body,
                    'idNumber',
                    'id_number'
                ),
                id_doc_path: idDocPath,
                address: body.address || null,
                kin_name: getProfileValue(
                    body,
                    'kinName',
                    'kin_name',
                    body.nextOfKinName
                ),
                kin_relation: getProfileValue(
                    body,
                    'kinRelation',
                    'kin_relation',
                    body.nextOfKinRelation
                ),
                kin_phone: getProfileValue(
                    body,
                    'kinPhone',
                    'kin_phone',
                    body.nextOfKinPhone
                ),
                isbn: body.isbn || null,
                isbn_doc_path: isbnDocPath,
                profile_complete: 1,
                bio: body.bio
                    ? String(body.bio).substring(0, 160)
                    : null
            };

            const { error } = await supabase
                .from('users')
                .update(update)
                .eq('id', userId);

            if (error) {
                return sendError(res, 500, error.message);
            }

            res.json({
                success: true,
                message: 'Author profile saved successfully!'
            });
        } catch (error) {
            console.error('Profile error:', error);
            sendError(res, 500, 'Failed to save author profile.');
        }
    }
);

/*
 * Notifications
 */
app.get('/api/notifications', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .or(`user_id.eq.${userId},user_id.is.null`)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            return sendError(res, 500, error.message);
        }

        res.json(data || []);
    } catch (error) {
        console.error('Notification lookup error:', error);
        sendError(res, 500, 'Failed to load notifications.');
    }
});

app.post('/api/notifications/:id/read', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: 1 })
            .eq('id', req.params.id)
            .or(`user_id.eq.${userId},user_id.is.null`);

        if (error) {
            return sendError(res, 500, error.message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Notification update error:', error);
        sendError(res, 500, 'Failed to update notification.');
    }
});

/*
 * Pages
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/read', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'reader.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'terms.html'));
});

app.get('/secret-admin-console', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

/*
 * Books
 */
const bookSelect = [
    'id',
    'user_id',
    'title',
    'author',
    'author_name',
    'description',
    'price',
    'mode',
    'status',
    'category',
    'sub_theme',
    'cover_image',
    'pdf_source',
    'allow_download',
    'created_at'
].join(',');

const authorSelect = [
    'id',
    'bio'
].join(',');

app.get('/api/books', async (req, res) => {
    try {
        const { data: books, error } = await supabase
            .from('books')
            .select(`${bookSelect},users(${authorSelect})`)
            .or('status.eq.active,status.is.null')
            .order('id', { ascending: false });

        if (error) {
            return sendError(res, 500, error.message);
        }

        res.json((books || []).map(book => ({
            ...serializeBook(book),
            author_id: book.users?.id || book.user_id,
            author_bio: book.users?.bio || null
        })));
    } catch (error) {
        console.error('Book lookup error:', error);
        sendError(res, 500, 'Failed to load books.');
    }
});

app.get('/api/books/my-books', requireLogin, async (req, res) => {
    const { data, error } = await supabase
        .from('books')
        .select(bookSelect)
        .eq('user_id', req.session.user.id)
        .order('id', { ascending: false });

    if (error) {
        return sendError(res, 500, error.message);
    }

    res.json((data || []).map(serializeBook));
});

app.get('/api/books/my-library', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const { data: purchases, error: purchaseError } = await supabase
            .from('purchases')
            .select('book_id')
            .eq('buyer_id', userId);

        if (purchaseError) {
            return sendError(res, 500, purchaseError.message);
        }

        const ids = (purchases || [])
            .map(purchase => purchase.book_id)
            .filter(id => id !== null && id !== undefined);

        let query = supabase
            .from('books')
            .select(bookSelect);

        if (ids.length) {
            query = query.or(
                `user_id.eq.${userId},price.eq.0,id.in.(${ids.join(',')})`
            );
        } else {
            query = query.or(
                `user_id.eq.${userId},price.eq.0`
            );
        }

        const { data, error } = await query
            .order('id', { ascending: false });

        if (error) {
            return sendError(
                res,
                500,
                'Failed to load personal library.'
            );
        }

        res.json((data || []).map(serializeBook));
    } catch (error) {
        console.error('Library lookup error:', error);
        sendError(res, 500, 'Failed to load personal library.');
    }
});

/*
 * PDF access is protected. A paid PDF requires ownership or authorship.
 */
app.get('/api/books/:id/pdf-stream', async (req, res) => {
    try {
        const { book, allowed } = await getBookAccess(
            req.params.id,
            req.session.user?.id
        );

        if (!book) {
            return sendError(res, 404, 'Book not found.');
        }

        if (!allowed) {
            return sendError(
                res,
                req.session.user ? 403 : 401,
                req.session.user
                    ? 'You do not own this book.'
                    : 'Please log in to access this book.'
            );
        }

        if (!book.pdf_source) {
            return sendError(res, 404, 'PDF document file not found.');
        }

        return downloadPdf(
            res,
            book.pdf_source,
            'inline'
        );
    } catch (error) {
        console.error('PDF stream error:', error);
        sendError(res, 500, 'Failed to stream PDF.');
    }
});

app.get('/api/books/:id/download-free', async (req, res) => {
    try {
        const { book } = await getBookAccess(
            req.params.id,
            req.session.user?.id
        );

        if (!book) {
            return sendError(res, 404, 'Book not found.');
        }

        if (book.status === 'offline') {
            return sendError(res, 403, 'This book is offline.');
        }

        if (Number(book.price) !== 0) {
            return sendError(
                res,
                403,
                'This title requires purchase before downloading.'
            );
        }

        if (!normalizeBoolean(book.allow_download)) {
            return sendError(
                res,
                403,
                'Offline downloads are restricted for this book.'
            );
        }

        if (!book.pdf_source) {
            return sendError(res, 404, 'No PDF file attached to this book.');
        }

        return downloadPdf(
            res,
            book.pdf_source,
            'attachment',
            book.title || 'book'
        );
    } catch (error) {
        console.error('Free download error:', error);
        sendError(res, 500, 'File retrieval failed.');
    }
});

app.post(
    '/api/books/publish',
    requireLogin,
    dualUploadFields,
    async (req, res) => {
        try {
            const body = req.body;

            if (
                !normalizeBoolean(body.agreeCopyright)
                || !normalizeBoolean(body.agreeTerms)
            ) {
                return sendError(
                    res,
                    400,
                    'You must accept Copyright & Terms.'
                );
            }

            const title = normalizeText(body.title, 200);

            if (!title) {
                return sendError(res, 400, 'Book title is required.');
            }

            if (!req.files?.coverImage?.[0]) {
                return sendError(
                    res,
                    400,
                    'Front cover artwork is required.'
                );
            }

            const mode = String(body.mode || 'pdf').toLowerCase();

            if (!['pdf', 'html'].includes(mode)) {
                return sendError(res, 400, 'Invalid book mode.');
            }

            if (
                mode === 'pdf'
                && !req.files?.pdfBook?.[0]
            ) {
                return sendError(
                    res,
                    400,
                    'PDF file document is required in PDF mode.'
                );
            }

            const price = parsePositivePrice(body.price);

            if (price === null) {
                return sendError(res, 400, 'Invalid book price.');
            }

            const cover = await uploadToSupabase(
                req.files.coverImage[0],
                'covers'
            );

            const pdf = req.files?.pdfBook?.[0]
                ? await uploadToSupabase(
                    req.files.pdfBook[0],
                    'pdfs'
                )
                : null;

            const author = normalizeText(
                body.authorName || req.session.user.username,
                150
            );

            const { data: book, error } = await supabase
                .from('books')
                .insert([{
                    user_id: req.session.user.id,
                    title,
                    author,
                    author_name: author,
                    description: body.description
                        ? String(body.description).substring(0, 5000)
                        : null,
                    price,
                    mode,
                    category: body.category || null,
                    sub_theme: body.subTheme || null,
                    allow_download: normalizeBoolean(
                        body.allowDownload !== undefined
                            ? body.allowDownload
                            : body.downloadRule
                    ),
                    status: 'active',
                    cover_image: cover,
                    pdf_source: pdf
                }])
                .select(bookSelect)
                .single();

            if (error) {
                console.error('Book insert error:', error);
                return sendError(res, 500, 'Failed to publish book.');
            }

            const content = body.chapterBody ?? body.content;

            if (mode === 'html' && content) {
                const { error: chapterError } = await supabase
                    .from('chapters')
                    .insert([{
                        book_id: book.id,
                        chapter_number: 1,
                        title: normalizeText(
                            body.chapterTitle || 'Chapter 1',
                            200
                        ),
                        body: String(content)
                    }]);

                if (chapterError) {
                    console.error('Initial chapter error:', chapterError);
                    return sendError(
                        res,
                        500,
                        'Book was created, but the first chapter could not be saved.'
                    );
                }
            }

            res.status(201).json({
                success: true,
                bookId: book.id,
                book: serializeBook(book)
            });
        } catch (error) {
            console.error('Publish error:', error);
            sendError(res, 500, 'Failed to publish book.');
        }
    }
);

/*
 * Chapter management.
 * A unique constraint on (book_id, chapter_number) is required.
 */
app.get(
    '/api/books/:bookId/chapters',
    requireLogin,
    async (req, res) => {
        try {
            const { data: book, error: bookError } = await supabase
                .from('books')
                .select('id')
                .eq('id', req.params.bookId)
                .eq('user_id', req.session.user.id)
                .maybeSingle();

            if (bookError) {
                return sendError(res, 500, bookError.message);
            }

            if (!book) {
                return sendError(
                    res,
                    403,
                    'Forbidden or book not found.'
                );
            }

            const { data, error } = await supabase
                .from('chapters')
                .select('*')
                .eq('book_id', req.params.bookId)
                .order('chapter_number');

            if (error) {
                return sendError(res, 500, error.message);
            }

            res.json(data || []);
        } catch (error) {
            console.error('Chapter lookup error:', error);
            sendError(res, 500, 'Failed to load chapters.');
        }
    }
);

app.post(
    '/api/books/:bookId/chapters',
    requireLogin,
    async (req, res) => {
        try {
            const title = normalizeText(req.body.title, 200);
            const finalContent = req.body.content ?? req.body.body;

            if (!title || finalContent === undefined || finalContent === null) {
                return sendError(
                    res,
                    400,
                    'Missing required chapter parameters.'
                );
            }

            const { data: book, error: bookError } = await supabase
                .from('books')
                .select('id')
                .eq('id', req.params.bookId)
                .eq('user_id', req.session.user.id)
                .maybeSingle();

            if (bookError) {
                return sendError(res, 500, bookError.message);
            }

            if (!book) {
                return sendError(
                    res,
                    403,
                    'Unauthorized book pipeline action.'
                );
            }

            for (let attempt = 0; attempt < 3; attempt += 1) {
                const { data: last } = await supabase
                    .from('chapters')
                    .select('chapter_number')
                    .eq('book_id', req.params.bookId)
                    .order('chapter_number', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const number = (last?.chapter_number || 0) + 1;

                const { data: chapter, error } = await supabase
                    .from('chapters')
                    .insert([{
                        book_id: req.params.bookId,
                        chapter_number: number,
                        title,
                        body: String(finalContent)
                    }])
                    .select()
                    .single();

                if (!error) {
                    return res.status(201).json({
                        success: true,
                        chapterId: chapter.id
                    });
                }

                if (error.code !== '23505') {
                    return sendError(
                        res,
                        500,
                        'Failed to write chapter to database.'
                    );
                }
            }

            sendError(
                res,
                409,
                'Another chapter was created concurrently. Please retry.'
            );
        } catch (error) {
            console.error('Chapter creation error:', error);
            sendError(res, 500, 'Failed to create chapter.');
        }
    }
);

app.put(
    '/api/books/chapters/:chapterId',
    requireLogin,
    async (req, res) => {
        try {
            const title = normalizeText(req.body.title, 200);
            const body = req.body.body ?? req.body.content;

            if (!title || body === undefined || body === null) {
                return sendError(
                    res,
                    400,
                    'Chapter title and content are required.'
                );
            }

            const {
                data: chapter,
                error: fetchError
            } = await supabase
                .from('chapters')
                .select('id,book_id,books!inner(user_id)')
                .eq('id', req.params.chapterId)
                .maybeSingle();

            if (fetchError) {
                return sendError(res, 500, fetchError.message);
            }

            if (
                !chapter
                || chapter.books.user_id !== req.session.user.id
            ) {
                return sendError(
                    res,
                    403,
                    'Unauthorized or chapter not found.'
                );
            }

            const { data, error } = await supabase
                .from('chapters')
                .update({
                    title,
                    body: String(body)
                })
                .eq('id', req.params.chapterId)
                .select()
                .single();

            if (error) {
                return sendError(res, 500, error.message);
            }

            res.json({
                success: true,
                chapter: data
            });
        } catch (error) {
            console.error('Chapter update error:', error);
            sendError(res, 500, 'Failed to update chapter.');
        }
    }
);

app.get('/api/books/my-web-books', requireLogin, async (req, res) => {
    const { data, error } = await supabase
        .from('books')
        .select(bookSelect)
        .eq('user_id', req.session.user.id)
        .eq('mode', 'html')
        .order('id', { ascending: false });

    if (error) {
        return sendError(res, 500, error.message);
    }

    res.json((data || []).map(serializeBook));
});

app.put(
    '/api/books/:id',
    requireLogin,
    dualUploadFields,
    async (req, res) => {
        try {
            const {
                data: old,
                error: fetchError
            } = await supabase
                .from('books')
                .select('*')
                .eq('id', req.params.id)
                .eq('user_id', req.session.user.id)
                .maybeSingle();

            if (fetchError) {
                return sendError(res, 500, fetchError.message);
            }

            if (!old) {
                return sendError(
                    res,
                    404,
                    'Book not found or unauthorized.'
                );
            }

            const body = req.body;
            const update = {};

            if (body.title !== undefined) {
                const title = normalizeText(body.title, 200);

                if (!title) {
                    return sendError(res, 400, 'Book title is required.');
                }

                update.title = title;
            }

            if (body.description !== undefined) {
                update.description = String(body.description)
                    .substring(0, 5000);
            }

            if (body.price !== undefined) {
                const price = parsePositivePrice(body.price);

                if (price === null) {
                    return sendError(res, 400, 'Invalid book price.');
                }

                update.price = price;
            }

            if (body.category !== undefined) {
                update.category = body.category || null;
            }

            if (
                body.subTheme !== undefined
                || body.sub_theme !== undefined
            ) {
                update.sub_theme = body.subTheme
                    ?? body.sub_theme
                    ?? null;
            }

            if (
                body.allowDownload !== undefined
                || body.allow_download !== undefined
            ) {
                update.allow_download = normalizeBoolean(
                    body.allowDownload ?? body.allow_download
                );
            }

            if (req.files?.coverImage?.[0]) {
                update.cover_image = await uploadToSupabase(
                    req.files.coverImage[0],
                    'covers'
                );
            }

            if (req.files?.pdfBook?.[0]) {
                update.pdf_source = await uploadToSupabase(
                    req.files.pdfBook[0],
                    'pdfs'
                );
            }

            if (!Object.keys(update).length) {
                return sendError(res, 400, 'No changes were supplied.');
            }

            const { data, error } = await supabase
                .from('books')
                .update(update)
                .eq('id', req.params.id)
                .eq('user_id', req.session.user.id)
                .select(bookSelect)
                .single();

            if (error) {
                return sendError(res, 500, error.message);
            }

            res.json({
                success: true,
                book: serializeBook(data)
            });
        } catch (error) {
            console.error('Book update error:', error);
            sendError(res, 500, 'Failed to update book.');
        }
    }
);

app.delete('/api/books/:id', requireLogin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('books')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.session.user.id)
            .select('id');

        if (error) {
            return sendError(res, 500, error.message);
        }

        if (!data?.length) {
            return sendError(
                res,
                404,
                'Book not found or unauthorized.'
            );
        }

        res.json({
            success: true,
            message: 'Book permanently deleted.'
        });
    } catch (error) {
        console.error('Book deletion error:', error);
        sendError(res, 500, 'Failed to delete book.');
    }
});

/*
 * Payments
 */
app.post('/api/payments/initiate', async (req, res) => {
    try {
        if (!process.env.PAYNOW_INTEGRATION_KEY) {
            return sendError(
                res,
                503,
                'Payment service is not configured.'
            );
        }

        const bookId = req.body.bookId;
        const email = normalizeEmail(req.body.email);

        if (!bookId || !email) {
            return sendError(
                res,
                400,
                'Book ID and email are required.'
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return sendError(
                res,
                400,
                'Please provide a valid email address.'
            );
        }

        const { data: book, error } = await supabase
            .from('books')
            .select('id,title,price,status')
            .eq('id', bookId)
            .maybeSingle();

        if (error || !book) {
            return sendError(res, 404, 'Book not found.');
        }

        if (book.status === 'offline') {
            return sendError(res, 403, 'This book is offline.');
        }

        const price = Number(book.price);

        if (!Number.isFinite(price) || price <= 0) {
            return sendError(
                res,
                400,
                'This book does not require payment.'
            );
        }

        const reference = `INV-${book.id}-${Date.now()}-${crypto
            .randomBytes(4)
            .toString('hex')}`;

        const payment = paynow.createPayment(reference, email);

        payment.add(
            String(book.title || 'Digital Book Purchase')
                .replace(/[^\w\s.-]/gi, '')
                .substring(0, 100),
            price
        );

        const site = (
            process.env.SITE_URL
            || `http://localhost:${PORT}`
        ).replace(/\/+$/, '');

        paynow.resultUrl = `${site}/api/payments/callback`;
        paynow.returnUrl = `${site}/?status=success&bookId=${encodeURIComponent(book.id)}`;

        const response = await paynow.send(payment);

        if (!response?.success) {
            return sendError(
                res,
                400,
                response?.error || 'Payment gateway rejected request.'
            );
        }

        res.json({
            success: true,
            reference,
            redirectUrl: response.redirectUrl,
            pollUrl: response.pollUrl
        });
    } catch (error) {
        console.error('Payment initiation error:', error);
        sendError(res, 500, 'Payment processing failed.');
    }
});

app.post('/api/payments/callback', (req, res) => {
    console.info('Paynow callback received.');
    res.sendStatus(200);
});

app.post('/api/books/:id/buy', requireLogin, async (req, res) => {
    try {
        const { data: book, error } = await supabase
            .from('books')
            .select('id,price,user_id,status')
            .eq('id', req.params.id)
            .maybeSingle();

        if (error || !book) {
            return sendError(res, 404, 'Book not found.');
        }

        if (book.status === 'offline') {
            return sendError(res, 403, 'This title is unavailable.');
        }

        if (String(book.user_id) === String(req.session.user.id)) {
            return sendError(
                res,
                400,
                'You cannot purchase your own book.'
            );
        }

        if (Number(book.price) === 0) {
            return sendError(
                res,
                400,
                'This book is free and does not require purchase.'
            );
        }

        const { data: owned, error: ownedError } = await supabase
            .from('purchases')
            .select('id')
            .eq('book_id', req.params.id)
            .eq('buyer_id', req.session.user.id)
            .maybeSingle();

        if (ownedError) {
            return sendError(res, 500, 'Unable to check book ownership.');
        }

        if (owned) {
            return sendError(res, 400, 'You already own this book.');
        }

        sendError(
            res,
            402,
            'Complete payment through the payment gateway before accessing this book.'
        );
    } catch (error) {
        console.error('Purchase error:', error);
        sendError(res, 500, 'Purchase processing failed.');
    }
});

/*
 * Analytics
 */
app.get('/api/analytics/sales', requireLogin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('purchases')
            .select(
                'id,price,created_at,books!inner(title,user_id),users!purchases_buyer_id_fkey(username)'
            )
            .eq('books.user_id', req.session.user.id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            return sendError(
                res,
                500,
                'Failed to retrieve sales data.'
            );
        }

        const bookBreakdown = {};

        const recentTransactions = (data || []).map(purchase => {
            const title = purchase.books?.title || 'Unknown Title';
            const price = Number(purchase.price) || 0;

            bookBreakdown[title] ||= {
                sales: 0,
                earnings: 0
            };

            bookBreakdown[title].sales += 1;
            bookBreakdown[title].earnings += price;

            return {
                purchase_id: purchase.id,
                sale_price: price,
                sale_date: purchase.created_at,
                book_title: title,
                buyer_name: purchase.users?.username || 'Unknown'
            };
        });

        res.json({
            totalSalesCount: recentTransactions.length,
            totalEarnings: recentTransactions.reduce(
                (sum, row) => sum + row.sale_price,
                0
            ),
            recentTransactions,
            bookBreakdown,
            limited: true
        });
    } catch (error) {
        console.error('Analytics error:', error);
        sendError(res, 500, 'Failed to retrieve sales data.');
    }
});

/*
 * Administration
 */
app.get('/api/admin/books', requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('books')
            .select('id,title,author,status,created_at,users(email)')
            .order('id', { ascending: false });

        if (error) {
            return sendError(res, 500, error.message);
        }

        res.json({
            books: (data || []).map(book => ({
                id: book.id,
                title: book.title,
                author: book.author,
                status: book.status || 'active',
                created_at: book.created_at,
                author_email: book.users?.email || null
            }))
        });
    } catch (error) {
        console.error('Admin books error:', error);
        sendError(res, 500, 'Failed to load administration books.');
    }
});

app.post(
    '/api/admin/books/:id/toggle-status',
    requireAdmin,
    async (req, res) => {
        try {
            if (!['active', 'offline'].includes(req.body.status)) {
                return sendError(res, 400, 'Invalid status value.');
            }

            const { error } = await supabase
                .from('books')
                .update({ status: req.body.status })
                .eq('id', req.params.id);

            if (error) {
                return sendError(res, 500, error.message);
            }

            res.json({
                success: true,
                message: `Book status changed to '${req.body.status}'.`
            });
        } catch (error) {
            console.error('Admin book status error:', error);
            sendError(res, 500, 'Failed to change book status.');
        }
    }
);

app.post(
    '/api/admin/broadcast-notification',
    requireAdmin,
    async (req, res) => {
        try {
            const title = normalizeText(req.body.title, 200);
            const message = normalizeText(req.body.message, 5000);

            if (!title || !message) {
                return sendError(
                    res,
                    400,
                    'Announcement title and message are required.'
                );
            }

            const { error } = await supabase
                .from('notifications')
                .insert([{
                    user_id: req.body.targetUserId || null,
                    title,
                    message
                }]);

            if (error) {
                return sendError(res, 500, error.message);
            }

            res.json({
                success: true,
                message: 'System update broadcasted successfully!'
            });
        } catch (error) {
            console.error('Notification broadcast error:', error);
            sendError(res, 500, 'Failed to broadcast notification.');
        }
    }
);

/*
 * API error handling.
 */
app.use('/api', (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return sendError(
                res,
                400,
                'Uploaded file exceeds the 50MB limit.'
            );
        }

        return sendError(res, 400, 'Invalid file upload.');
    }

    console.error('Unhandled API error:', error);
    sendError(res, 500, 'Unexpected server error.');
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Page 24 active at http://localhost:${PORT}`);
    });
}

module.exports = app;
