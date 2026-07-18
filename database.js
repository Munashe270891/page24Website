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
    // 1. Create Users Table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'author', -- 'author' or 'reader'
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

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
            coverImage TEXT NOT NULL,
            pdfSource TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        )
    `);

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
});
// Create the purchases table for tracking sales & royalties
db.run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER,
    buyer_id INTEGER,
    price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY(buyer_id) REFERENCES users(id)
)`);

module.exports = db;