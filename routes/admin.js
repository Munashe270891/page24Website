const express = require('express');
const supabase = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendError, normalizeText } = require('../utils/helpers');

const router = express.Router();

router.get('/books', requireAdmin, async (req, res) => {
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

router.post(
    '/books/:id/toggle-status',
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

router.post(
    '/broadcast-notification',
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

module.exports = router;
