const express = require('express');
const crypto = require('crypto');
const supabase = require('../database');
const { paynow, PORT } = require('../config');
const { requireLogin } = require('../middleware/auth');
const { sendError, normalizeEmail } = require('../utils/helpers');

const router = express.Router();

router.post('/initiate', async (req, res) => {
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

router.post('/callback', (req, res) => {
    console.info('Paynow callback received.');
    res.sendStatus(200);
});

router.post('/:id/buy', requireLogin, async (req, res) => {
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

module.exports = router;
