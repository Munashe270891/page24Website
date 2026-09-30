const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const { PORT, SESSION_CONFIG } = require('./config');
const { requireLogin, requireAdmin } = require('./middleware/auth');
const { sendError } = require('./utils/helpers');

const app = express();

app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session(SESSION_CONFIG));

// --- API ROUTES ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/author', require('./routes/author'));
app.use('/api/books', require('./routes/books'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));

// --- HTML VIEW ROUTES ---
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

// --- API ERROR HANDLING ---
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
