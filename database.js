const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Creates a physical database file inside your project directory automatically
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('SQLite initialization fault:', err.message);
    else console.log('Successfully connected to the local SQLite database file! 🗄️');
});

// Initialize the structured database tables schema for Page 24
db.serialize(() => {
    // 1. Create Users Table (Includes KYC verification fields)
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'author', -- 'author', 'reader', or 'admin'
            legal_name TEXT,
            id_number TEXT,
            id_doc_path TEXT,
            phone TEXT,
            address TEXT,
            kin_name TEXT,
            kin_relation TEXT,
            kin_phone TEXT,
            isbn TEXT,
            isbn_doc_path TEXT,
            profile_complete INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Helper to safely add missing columns to users table if database.sqlite already exists
    const addColumnToUsers = (colName, colType) => {
        db.run(`ALTER TABLE users ADD COLUMN ${colName} ${colType}`, () => {
            // Silently swallow errors if column already exists
        });
    };

    addColumnToUsers('legal_name', 'TEXT');
    addColumnToUsers('id_number', 'TEXT');
    addColumnToUsers('id_doc_path', 'TEXT');
    addColumnToUsers('phone', 'TEXT');
    addColumnToUsers('address', 'TEXT');
    addColumnToUsers('kin_name', 'TEXT');
    addColumnToUsers('kin_relation', 'TEXT');
    addColumnToUsers('kin_phone', 'TEXT');
    addColumnToUsers('isbn', 'TEXT');
    addColumnToUsers('isbn_doc_path', 'TEXT');
    addColumnToUsers('profile_complete', 'INTEGER DEFAULT 0');

    // 2. Create Books Table (with user_id referencing users)
    db.run(`
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            author TEXT DEFAULT 'Munashe Soka',
            description TEXT,
            price REAL NOT NULL,
            mode TEXT CHECK(mode IN ('pdf', 'html')) NOT NULL,
            allowDownload INTEGER DEFAULT 0, -- 0 = Secure Stream Only, 1 = Allow Download
            status TEXT DEFAULT 'active', -- 'active' or 'offline'
            coverImage TEXT NOT NULL,
            pdfSource TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        )
    `);

    // Safely add status column to books table for existing databases
    db.run(`ALTER TABLE books ADD COLUMN status TEXT DEFAULT 'active'`, () => {
        // Silently swallow error if column already exists
    });

    // 3. Create Chapters Table
    db.run(`
        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER,
            title TEXT,
            body TEXT,
            FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
        )
    `);

    // 4. Create Purchases Table (for tracking sales & royalties)
    db.run(`
        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER,
            buyer_id INTEGER,
            price REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY(buyer_id) REFERENCES users(id)
        )
    `);

    // 5. Create Notifications Table (for system updates & announcements)
    db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER, -- NULL means global system-wide announcement
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
});

module.exports = db;