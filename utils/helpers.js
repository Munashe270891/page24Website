const crypto = require('crypto');
const supabase = require('../database');

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

function getSafeExtension(file) {
    const originalExtension = require('path')
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

module.exports = {
    sendError,
    isSafeLocalPath,
    normalizeBoolean,
    normalizeEmail,
    normalizeText,
    parsePositivePrice,
    serializeBook,
    regenerateSession,
    getProfileValue,
    getSafeExtension,
    uploadToSupabase,
    downloadPdf,
    getBookAccess,
    bookSelect,
    authorSelect,
    profileSelect
};
