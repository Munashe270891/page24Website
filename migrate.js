const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to your existing database file (adjust 'database.sqlite' if yours is named differently)
const dbPath = path.join(__dirname, 'database.sqlite'); 
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Could not connect to database:', err.message);
        process.exit(1);
    }
    console.log('Connected to the SQLite database.');
});

db.serialize(() => {
    // Add the user_id column to the books table if it doesn't exist
    db.run(`ALTER TABLE books ADD COLUMN user_id INTEGER`, (err) => {
        if (err) {
            if (err.message.includes("duplicate column name")) {
                console.log('ℹ️ user_id column already exists. No migration needed.');
            } else {
                console.error('❌ Error adding user_id column:', err.message);
            }
        } else {
            console.log('✅ Successfully added user_id column to the books table!');
        }
        
        // Close database connection
        db.close((closeErr) => {
            if (closeErr) {
                console.error('Error closing database:', closeErr.message);
            } else {
                console.log('Database connection closed.');
            }
        });
    });
});
// Add this snippet inside migrate.js to create the chapters table!
db.run(`
    CREATE TABLE IF NOT EXISTS chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        chapter_order INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
`, (err) => {
    if (err) {
        console.error('❌ Error creating chapters table:', err.message);
    } else {
        console.log('✅ Successfully set up chapters table in SQLite!');
    }
});