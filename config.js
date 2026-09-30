const { Paynow } = require('paynow');

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SESSION must be configured in production.');
}

if (!process.env.PAYNOW_INTEGRATION_KEY) {
    console.warn('PAYNOW_INTEGRATION_KEY is not configured. Payment initiation will fail.');
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'local-development-session-secret';
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

const integrationId = process.env.PAYNOW_INTEGRATION_ID || '25640';
const paynow = new Paynow(
    integrationId,
    process.env.PAYNOW_INTEGRATION_KEY
);

const SESSION_CONFIG = {
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
};

module.exports = {
    PORT,
    isProduction,
    SESSION_SECRET,
    MAX_UPLOAD_SIZE,
    integrationId,
    paynow,
    SESSION_CONFIG
};
