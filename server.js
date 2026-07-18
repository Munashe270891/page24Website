require('dotenv').config(); // Load secret keys from your local configuration environment
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Paynow } = require('paynow'); 
const db = require('./database');
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

// Set up secure session cookies to track logged-in users
app.use(session({
    secret: process.env.SESSION_SECRET || 'zim-publish-secure-random-key-1234',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if running on HTTPS in production
        maxAge: 24 * 60 * 60 * 1000 // Session lasts 24 hours
    }
}));

// Auth Guard Middleware: Redirects guests away from protected pages
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// Configure Local File Storage for Book Assets
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'public/assets/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });
const dualUploadFields = upload.fields([{ name: 'coverImage', maxCount: 1 }, { name: 'pdfBook', maxCount: 1 }]);

if (!fs.existsSync('public/assets')) {
    fs.mkdirSync('public/assets', { recursive: true });
}

// Map merchant credential fields securely
const integrationId = process.env.PAYNOW_INTEGRATION_ID || "25640"; 
const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;

// Initialize Paynow Transaction Gateway Engine Driver
const paynow = new Paynow(integrationId, integrationKey);

// ==========================================
//           USER AUTH ENDPOINTS
// ==========================================

// 1. Register User
app.post('/api/auth/register', (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: "All registration fields are required." });
    }

    // Hash the password securely before saving it
    const hashedPassword = bcrypt.hashSync(password, 10);
    const sql = `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`;
    const params = [username, email, hashedPassword, role || 'author'];

    db.run(sql, params, function(err) {
        if (err) {
            if (err.message.includes("UNIQUE constraint failed")) {
                return res.status(400).json({ error: "Username or Email already exists." });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ success: true, message: "Registration successful!" });
    });
});

// 2. Login User
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: "Invalid email or password." });

        // Verify password
        const passwordMatches = bcrypt.compareSync(password, user.password);
        if (!passwordMatches) return res.status(401).json({ error: "Invalid email or password." });

        // Store user in session
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        res.json({ success: true, message: "Logged in successfully!", user: req.session.user });
    });
});

// 3. Logout User
app.get('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: "Could not log out." });
        res.redirect('/');
    });
});

// 4. Get Current User Details (Frontend will use this to replace mockup names)
app.get('/api/auth/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ loggedIn: false });
    res.json({ loggedIn: true, user: req.session.user });
});

// ==========================================
//              PAGE VIEWS ROUTES
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));

// Registration and Login Pages
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));

// Protect the dashboard view so only logged-in users can open it
app.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Serve the anti-piracy full screen document preview canvas
app.get('/read', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'reader.html'));
});

// ==========================================
//             BOOK ACTIONS ENDPOINTS
// ==========================================
app.get('/api/books', (req, res) => {
    db.all(`SELECT * FROM books ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
// Get books published strictly by the logged-in user (for Dashboard view)
app.get('/api/books/my-books', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.all(`SELECT * FROM books WHERE user_id = ? ORDER BY id DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Updated Publish endpoint to assign the book to the logged-in author!
app.post('/api/books/publish', requireLogin, dualUploadFields, (req, res) => {
    const { title, description, price, mode, allowDownload, chapterTitle, chapterBody } = req.body;
    const coverImageUrl = req.files['coverImage'] ? `/assets/${req.files['coverImage'][0].filename}` : null;
    const securePdfUrl = req.files['pdfBook'] ? `/assets/${req.files['pdfBook'][0].filename}` : null;
    
    if (!coverImageUrl) return res.status(400).json({ error: "A book front cover artwork is required." });

    // Link the book to the user logged into this session
    const userId = req.session.user.id;
    const authorName = req.session.user.username; 

    const bookSql = `INSERT INTO books (user_id, title, author, description, price, mode, allowDownload, coverImage, pdfSource) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const bookParams = [userId, title, authorName, description, parseFloat(price), mode, parseInt(allowDownload), coverImageUrl, mode === 'pdf' ? securePdfUrl : null];

    db.run(bookSql, bookParams, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const lastInsertedBookId = this.lastID;

        if (mode === 'html' && chapterTitle) {
            const chapSql = `INSERT INTO chapters (book_id, title, body) VALUES (?, ?, ?)`;
            db.run(chapSql, [lastInsertedBookId, chapterTitle, chapterBody], (chapErr) => {
                if (chapErr) return res.status(500).json({ error: chapErr.message });
                return res.status(201).json({ success: true, bookId: lastInsertedBookId });
            });
        } else {
            return res.status(201).json({ success: true, bookId: lastInsertedBookId });
        }
    });
});

// Secured Reader Stream
app.get('/api/books/secure-source', (req, res) => {
    const bookId = req.query.bookId;
    
    db.get(`
        SELECT books.*, chapters.title AS chapterTitle, chapters.body AS chapterBody 
        FROM books 
        LEFT JOIN chapters ON books.id = chapters.book_id 
        WHERE books.id = ?
    `, [bookId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Secure clearance matching identity fault." });
        res.json(row);
    });
});

// ==========================================
//             PAYMENT SUBSYSTEM INTEGRATION
// ==========================================
app.post('/api/payments/initiate', (req, res) => {
    const { bookId, email } = req.body;

    db.get(`SELECT * FROM books WHERE id = ?`, [bookId], async (err, book) => {
        if (err || !book) {
            return res.status(404).json({ error: "Targeted book item profile could not be verified." });
        }

        const validPrice = parseFloat(book.price);
        if (isNaN(validPrice) || validPrice <= 0) {
            return res.status(400).json({ error: "Invalid book price encountered for billing pipeline." });
        }

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
});

app.post('/api/payments/callback', (req, res) => {
    console.log("📥 Received Asynchronous Payment Status Webhook from Paynow Zimbabwe:", req.body); 
    res.sendStatus(200); 
});

// ==========================================
//        SALES & ROYALTIES ANALYTICS
// ==========================================

// 1. Get sales and earnings breakdown for the logged-in author
app.get('/api/analytics/sales', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const authorId = req.session.user.id;

    const query = `
        SELECT 
            p.id as purchase_id,
            p.price as sale_price,
            p.created_at as sale_date,
            b.title as book_title,
            u.username as buyer_name
        FROM purchases p
        JOIN books b ON p.book_id = b.id
        JOIN users u ON p.buyer_id = u.id
        WHERE b.user_id = ?
        ORDER BY p.created_at DESC
    `;

    db.all(query, [authorId], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to retrieve sales data.' });
        }

        const totalSalesCount = rows.length;
        const totalEarnings = rows.reduce((sum, row) => sum + row.sale_price, 0);

        const bookBreakdown = {};
        rows.forEach(row => {
            if (!bookBreakdown[row.book_title]) {
                bookBreakdown[row.book_title] = { sales: 0, earnings: 0 };
            }
            bookBreakdown[row.book_title].sales += 1;
            bookBreakdown[row.book_title].earnings += row.sale_price;
        });

        res.json({
            totalSalesCount,
            totalEarnings,
            recentTransactions: rows,
            bookBreakdown
        });
    });
});

// 2. SANDBOX BUY ROUTE: Let a user simulated-buy any book (for testing)
app.post('/api/books/:id/buy', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const bookId = req.params.id;
    const buyerId = req.session.user.id;

    db.get('SELECT price, user_id FROM books WHERE id = ?', [bookId], (err, book) => {
        if (err || !book) {
            return res.status(404).json({ error: 'Book not found.' });
        }

        if (book.user_id === buyerId) {
            return res.status(400).json({ error: 'You cannot purchase your own book!' });
        }

        db.get('SELECT id FROM purchases WHERE book_id = ? AND buyer_id = ?', [bookId, buyerId], (err, alreadyBought) => {
            if (alreadyBought) {
                return res.status(400).json({ error: 'You already own this book!' });
            }

            db.run('INSERT INTO purchases (book_id, buyer_id, price) VALUES (?, ?, ?)', [bookId, buyerId, book.price], function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Purchase processing failed.' });
                }
                res.json({ success: true, message: 'Book purchased successfully!' });
            });
        });
    });
});

// ==========================================
//            ENGINE ACTIVATION
// ==========================================
app.listen(PORT, () => console.log(`Page 24 active at http://localhost:${PORT}`));
// ==========================================
//    WEB BOOK STUDIO CHAPTER MANAGEMENT
// ==========================================

// 1. Get all HTML/Web books created by the logged-in author
app.get('/api/books/my-web-books', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = `SELECT * FROM books WHERE user_id = ? AND mode = 'html'`;
    db.all(query, [req.session.user.id], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database query failure.' });
        }
        res.json(rows);
    });
});

// 2. Get all chapters written for a specific book
app.get('/api/books/:bookId/chapters', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { bookId } = req.params;

    // Verify first that this book belongs to the logged-in user
    db.get(`SELECT id FROM books WHERE id = ? AND user_id = ?`, [bookId, req.session.user.id], (err, book) => {
        if (err || !book) {
            return res.status(403).json({ error: 'Forbidden or book not found.' });
        }

        db.all(`SELECT * FROM chapters WHERE book_id = ? ORDER BY id ASC`, [bookId], (err, chapters) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to retrieve chapters.' });
            }
            res.json(chapters);
        });
    });
});

// 3. Save / Add a new chapter to a web book
app.post('/api/books/chapters', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { bookId, title, content } = req.body;

    if (!bookId || !title || !content) {
        return res.status(400).json({ error: 'Missing required chapter parameters.' });
    }

    // Verify book ownership
    db.get(`SELECT id FROM books WHERE id = ? AND user_id = ?`, [bookId, req.session.user.id], (err, book) => {
        if (err || !book) {
            return res.status(403).json({ error: 'Unauthorized book pipeline action.' });
        }

        const insertQuery = `INSERT INTO chapters (book_id, title, content) VALUES (?, ?, ?)`;
        db.run(insertQuery, [bookId, title, content], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to write chapter to database.' });
            }
            res.json({ success: true, chapterId: this.lastID });
        });
    });
});
// ==========================================
//        BOOK MANAGEMENT (EDIT & DELETE)
// ==========================================

// 1. Update book metadata (Price and Description)
app.put('/api/books/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const bookId = req.params.id;
    const { description, price } = req.body;

    if (!description || !price) {
        return res.status(400).json({ error: 'Missing updated parameters.' });
    }

    const updateQuery = `UPDATE books SET description = ?, price = ? WHERE id = ? AND user_id = ?`;
    db.run(updateQuery, [description, price, bookId, req.session.user.id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to update book profile.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Book not found or unauthorized.' });
        }
        res.json({ success: true, message: 'Book updated successfully!' });
    });
});

// 2. Permanently Delete a Book
app.delete('/api/books/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const bookId = req.params.id;

    // Delete query uses ON DELETE CASCADE automatically for chapters table if set up
    const deleteQuery = `DELETE FROM books WHERE id = ? AND user_id = ?`;
    db.run(deleteQuery, [bookId, req.session.user.id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to purge book from database.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Book not found or unauthorized.' });
        }
        res.json({ success: true, message: 'Book permanently deleted.' });
    });
});