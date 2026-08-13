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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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
        if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
            return res.status(401).json({ error: "Unauthorized access. Please log in." });
        }
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

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

const dualUploadFields = upload.fields([
    { name: 'coverImage', maxCount: 1 }, 
    { name: 'pdfBook', maxCount: 1 }
]);

const profileUploadFields = upload.fields([
    { name: 'idDoc', maxCount: 1 },
    { name: 'isbnDoc', maxCount: 1 },
    { name: 'profilePic', maxCount: 1 }
]);

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
    return fileName;
}

const integrationId = process.env.PAYNOW_INTEGRATION_ID || "25640"; 
const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;
const paynow = new Paynow(integrationId, integrationKey);

// ==========================================
//           USER AUTH ENDPOINTS
// ==========================================

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
        if (error.code === '23505') {
            return res.status(400).json({ error: "Username or Email already exists." });
        }
        return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ success: true, message: "Registration successful!" });
});

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

app.get('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: "Could not log out." });
        if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
            return res.json({ success: true, message: "Logged out successfully!" });
        }
        res.redirect('/');
    });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ loggedIn: false });
    res.json({ loggedIn: true, user: req.session.user });
});

// ==========================================
//        AUTHOR PROFILE & KYC ENDPOINTS
// ==========================================

app.get('/api/author/profile', requireLogin, async (req, res) => {
    const userId = req.session.user.id;

    const { data, error } = await supabase
        .from('users')
        .select(`
            legal_name, id_number, id_doc_path, phone, address, kin_name, 
            kin_relation, kin_phone, isbn, isbn_doc_path, profile_complete,
            bio, profile_pic_url, facebook_handle, tiktok_handle, twitter_handle, instagram_handle,
            facebook_followers, tiktok_followers, twitter_followers, instagram_followers
        `)
        .eq('id', userId)
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || {});
});

app.post('/api/author/profile', requireLogin, profileUploadFields, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Support both camelCase and snake_case field key variants sent from frontend
        const legalName = req.body.legalName || req.body.legal_name;
        const idNumber = req.body.idNumber || req.body.id_number;
        const phone = req.body.phone;
        const address = req.body.address;
        const kinName = req.body.kinName || req.body.kin_name || req.body.nextOfKinName;
        const kinRelation = req.body.kinRelation || req.body.kin_relation || req.body.nextOfKinRelation;
        const kinPhone = req.body.kinPhone || req.body.kin_phone || req.body.nextOfKinPhone;
        const isbn = req.body.isbn;
        const bio = req.body.bio;

        const facebookHandle = req.body.facebookHandle || req.body.facebook_handle;
        const tiktokHandle = req.body.tiktokHandle || req.body.tiktok_handle;
        const twitterHandle = req.body.twitterHandle || req.body.twitter_handle;
        const instagramHandle = req.body.instagramHandle || req.body.instagram_handle;

        const facebookFollowers = req.body.facebookFollowers || req.body.facebook_followers;
        const tiktokFollowers = req.body.tiktokFollowers || req.body.tiktok_followers;
        const twitterFollowers = req.body.twitterFollowers || req.body.twitter_followers;
        const instagramFollowers = req.body.instagramFollowers || req.body.instagram_followers;

        // Validate required KYC fields
        if (!legalName || !idNumber || !phone || !address || !kinName || !kinRelation || !kinPhone) {
            return res.status(400).json({ 
                error: "All required KYC fields (Legal Name, ID Number, Phone, Address, Next of Kin Details) must be completed." 
            });
        }

        // Fetch existing user to keep old file paths if no new files are uploaded
        const { data: existingUser, error: userErr } = await supabase
            .from('users')
            .select('id_doc_path, isbn_doc_path, profile_pic_url')
            .eq('id', userId)
            .single();

        if (userErr) {
            console.error(">>> [PROFILE FETCH ERROR]:", userErr);
            return res.status(500).json({ error: "Failed to locate author record." });
        }

        let idDocPath = existingUser ? existingUser.id_doc_path : null;
        let isbnDocPath = existingUser ? existingUser.isbn_doc_path : null;
        let profilePicUrl = existingUser ? existingUser.profile_pic_url : null;

        if (req.files) {
            if (req.files['idDoc']) {
                idDocPath = await uploadToSupabase(req.files['idDoc'][0], 'covers');
            }
            if (req.files['isbnDoc']) {
                isbnDocPath = await uploadToSupabase(req.files['isbnDoc'][0], 'covers');
            }
            if (req.files['profilePic']) {
                profilePicUrl = await uploadToSupabase(req.files['profilePic'][0], 'covers');
            }
        }

        if (!idDocPath) {
            return res.status(400).json({ error: "A clear Government ID image or document upload is required." });
        }

        const { error: updateErr } = await supabase
            .from('users')
            .update({ 
                legal_name: legalName, 
                id_number: idNumber, 
                id_doc_path: idDocPath, 
                phone: phone, 
                address: address, 
                kin_name: kinName, 
                kin_relation: kinRelation, 
                kin_phone: kinPhone, 
                isbn: isbn || null, 
                isbn_doc_path: isbnDocPath,
                profile_complete: 1,
                bio: bio ? bio.substring(0, 160) : null,
                profile_pic_url: profilePicUrl,
                facebook_handle: facebookHandle || null,
                tiktok_handle: tiktokHandle || null,
                twitter_handle: twitterHandle || null,
                instagram_handle: instagramHandle || null,
                facebook_followers: parseInt(facebookFollowers) || 0,
                tiktok_followers: parseInt(tiktokFollowers) || 0,
                twitter_followers: parseInt(twitterFollowers) || 0,
                instagram_followers: parseInt(instagramFollowers) || 0
            })
            .eq('id', userId);

        if (updateErr) {
            console.error(">>> [PROFILE UPDATE ERROR]:", updateErr);
            return res.status(500).json({ error: updateErr.message });
        }

        res.json({ success: true, message: "KYC & Author Profile saved successfully!" });
    } catch (err) {
        console.error(">>> [PROFILE EXCEPTION]:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
//          TOP AUTHORS LEADERBOARD
// ==========================================

app.get('/api/top-authors', async (req, res) => {
    try {
        const { data: authors, error: authorsErr } = await supabase
            .from('users')
            .select(`
                id, username, legal_name, address, bio, profile_pic_url,
                facebook_handle, tiktok_handle, twitter_handle, instagram_handle,
                facebook_followers, tiktok_followers, twitter_followers, instagram_followers
            `)
            .or('role.eq.author,role.eq.admin');

        if (authorsErr) return res.status(500).json({ error: authorsErr.message });

        const { data: purchases, error: purchasesErr } = await supabase
            .from('purchases')
            .select('id, books!inner(user_id)');

        if (purchasesErr) console.warn("Could not calculate purchases count:", purchasesErr.message);

        const salesCountMap = {};
        if (purchases) {
            purchases.forEach(p => {
                const authorId = p.books ? p.books.user_id : null;
                if (authorId) {
                    salesCountMap[authorId] = (salesCountMap[authorId] || 0) + 1;
                }
            });
        }

        let followerCountMap = {};
        const { data: followers } = await supabase
            .from('followers')
            .select('author_id');

        if (followers) {
            followers.forEach(f => {
                followerCountMap[f.author_id] = (followerCountMap[f.author_id] || 0) + 1;
            });
        }

        const formattedAuthors = (authors || []).map(author => {
            const displayName = author.legal_name || author.username || 'Anonymous Author';
            const totalSales = salesCountMap[author.id] || 0;
            const siteFollowers = followerCountMap[author.id] || 0;

            const totalSocialFollowers = (author.facebook_followers || 0) + 
                                         (author.tiktok_followers || 0) + 
                                         (author.twitter_followers || 0) + 
                                         (author.instagram_followers || 0);

            return {
                id: author.id,
                name: displayName,
                bio: author.bio || (author.address ? `Author based in ${author.address}` : 'Page 24 Published Author.'),
                profile_picture_url: author.profile_pic_url || null,
                total_books_sold: totalSales,
                books_read: totalSales,
                site_followers: siteFollowers,
                social_followers: totalSocialFollowers,
                social_links: {
                    facebook: author.facebook_handle ? `https://facebook.com/${author.facebook_handle}` : null,
                    tiktok: author.tiktok_handle ? `https://tiktok.com/@${author.tiktok_handle.replace('@', '')}` : null,
                    twitter: author.twitter_handle ? `https://x.com/${author.twitter_handle}` : null,
                    instagram: author.instagram_handle ? `https://instagram.com/${author.instagram_handle}` : null
                }
            };
        });

        res.json({ success: true, authors: formattedAuthors });
    } catch (err) {
        console.error(">>> [TOP AUTHORS FETCH ERROR]:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/authors/:id/follow', requireLogin, async (req, res) => {
    const targetAuthorId = req.params.id;
    const currentUserId = req.session.user.id;

    if (targetAuthorId == currentUserId) {
        return res.status(400).json({ success: false, error: "You cannot follow yourself." });
    }

    try {
        const { error } = await supabase
            .from('followers')
            .insert([{ author_id: targetAuthorId, follower_id: currentUserId }]);

        if (error) {
            // Unique violation: User already follows author -> treat request as Unfollow action
            if (error.code === '23505') {
                await supabase
                    .from('followers')
                    .delete()
                    .eq('author_id', targetAuthorId)
                    .eq('follower_id', currentUserId);

                return res.json({ success: true, action: 'unfollowed', message: "Unfollowed author." });
            }
            return res.status(500).json({ success: false, error: error.message });
        }

        res.json({ success: true, action: 'followed', message: "Author followed successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
    try {
        const { data: books, error } = await supabase
            .from('books')
            .select(`
                *,
                users (
                    id,
                    bio,
                    profile_pic_url,
                    facebook_handle,
                    tiktok_handle,
                    twitter_handle,
                    instagram_handle,
                    facebook_followers,
                    tiktok_followers,
                    twitter_followers,
                    instagram_followers
                )
            `)
            .or('status.eq.active,status.is.null')
            .order('id', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        const { data: followers } = await supabase.from('followers').select('author_id');
        const followerCountMap = {};
        if (followers) {
            followers.forEach(f => {
                followerCountMap[f.author_id] = (followerCountMap[f.author_id] || 0) + 1;
            });
        }

        const formattedBooks = (books || []).map(book => {
            const author = book.users || {};
            const siteFollowers = followerCountMap[author.id] || 0;
            const socialFollowers = (author.facebook_followers || 0) + 
                                    (author.tiktok_followers || 0) + 
                                    (author.twitter_followers || 0) + 
                                    (author.instagram_followers || 0);

            return {
                ...book,
                author_id: author.id || book.user_id,
                author_bio: author.bio || null,
                author_picture: author.profile_pic_url || null,
                site_followers: siteFollowers,
                social_followers: socialFollowers,
                facebook_url: author.facebook_handle ? `https://facebook.com/${author.facebook_handle}` : null,
                tiktok_url: author.tiktok_handle ? `https://tiktok.com/@${author.tiktok_handle.replace('@', '')}` : null,
                twitter_url: author.twitter_handle ? `https://x.com/${author.twitter_handle}` : null,
                instagram_url: author.instagram_handle ? `https://instagram.com/${author.instagram_handle}` : null
            };
        });

        res.json(formattedBooks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.post('/api/books/publish', requireLogin, dualUploadFields, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { 
            title, 
            description, 
            price, 
            mode, 
            allowDownload, 
            downloadRule,
            category,
            subTheme,
            authorName,
            chapterTitle, 
            chapterBody, 
            content,
            agreeCopyright, 
            agreeTerms 
        } = req.body;

        const isCopyrightAgreed = agreeCopyright === 'true' || agreeCopyright === true || agreeCopyright === 'on';
        const isTermsAgreed = agreeTerms === 'true' || agreeTerms === true || agreeTerms === 'on';

        if (!isCopyrightAgreed || !isTermsAgreed) {
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

        if (mode === 'pdf') {
            if (req.files && req.files['pdfBook']) {
                securePdfPath = await uploadToSupabase(req.files['pdfBook'][0], 'pdfs');
            } else {
                return res.status(400).json({ error: "PDF file document is required when publishing in PDF mode." });
            }
        }

        const effectiveAuthorName = authorName || req.session.user.username;
        const finalAllowDownload = allowDownload !== undefined ? allowDownload : downloadRule;

        const { data: newBook, error: bookErr } = await supabase
            .from('books')
            .insert([{
                user_id: userId,
                title,
                author: effectiveAuthorName,
                author_name: effectiveAuthorName,
                category: category || null,
                sub_theme: subTheme || null,
                description,
                price: parseFloat(price) || 0,
                mode: mode || 'pdf',
                allow_download: parseInt(finalAllowDownload) || 0,
                status: 'active',
                cover_image: coverImageUrl,
                pdf_source: securePdfPath
            }])
            .select()
            .single();

        if (bookErr) {
            console.error(">>> [BOOK INSERT ERROR]:", bookErr);
            return res.status(500).json({ error: bookErr.message });
        }

        const finalBody = chapterBody || content;
        if (mode === 'html' && (chapterTitle || finalBody)) {
            const { error: chapErr } = await supabase
                .from('chapters')
                .insert([{ 
                    book_id: newBook.id, 
                    chapter_number: 1,
                    title: chapterTitle || "Chapter 1", 
                    body: finalBody || "" 
                }]);

            if (chapErr) {
                console.error(">>> [CHAPTER INSERT ERROR]:", chapErr);
                return res.status(500).json({ error: chapErr.message });
            }
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
        .order('chapter_number', { ascending: true })
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
        .order('chapter_number', { ascending: true });

    if (chapErr) return res.status(500).json({ error: 'Failed to retrieve chapters.' });
    res.json(chapters);
});

app.post('/api/books/chapters', requireLogin, async (req, res) => {
    const { bookId, title, content, body } = req.body;
    const finalContent = content || body;

    if (!bookId || !title || !finalContent) {
        return res.status(400).json({ error: 'Missing required chapter parameters.' });
    }

    const { data: book, error: bookErr } = await supabase
        .from('books')
        .select('id')
        .eq('id', bookId)
        .eq('user_id', req.session.user.id)
        .single();

    if (bookErr || !book) return res.status(403).json({ error: 'Unauthorized book pipeline action.' });

    const { data: existingChapters } = await supabase
        .from('chapters')
        .select('chapter_number')
        .eq('book_id', bookId)
        .order('chapter_number', { ascending: false })
        .limit(1);

    const nextChapterNum = (existingChapters && existingChapters.length > 0) ? (existingChapters[0].chapter_number + 1) : 1;

    const { data: chapter, error: insertErr } = await supabase
        .from('chapters')
        .insert([{ book_id: bookId, chapter_number: nextChapterNum, title, body: finalContent }])
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
