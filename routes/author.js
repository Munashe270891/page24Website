const express = require('express');
const supabase = require('../database');
const { requireLogin } = require('../middleware/auth');
const {
    sendError,
    normalizeText,
    profileSelect,
    getProfileValue,
    uploadToSupabase
} = require('../utils/helpers');
const { profileUploadFields } = require('../utils/upload');

const router = express.Router();

router.get('/profile', requireLogin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select(profileSelect)
            .eq('id', req.session.user.id)
            .maybeSingle();

        if (error) {
            return sendError(res, 500, error.message);
        }

        res.json(data || {});
    } catch (error) {
        console.error('Profile lookup error:', error);
        sendError(res, 500, 'Failed to load profile.');
    }
});

router.post(
    '/profile',
    requireLogin,
    profileUploadFields,
    async (req, res) => {
        try {
            const userId = req.session.user.id;
            const body = req.body;

            const legalName = normalizeText(
                getProfileValue(body, 'legalName', 'legal_name'),
                150
            );

            const phone = normalizeText(body.phone, 50);

            if (!legalName || !phone) {
                return sendError(
                    res,
                    400,
                    'Please complete your Full Legal Name and Phone Number.'
                );
            }

            const { data: existing, error: existingError } = await supabase
                .from('users')
                .select('id_doc_path,isbn_doc_path')
                .eq('id', userId)
                .single();

            if (existingError || !existing) {
                return sendError(res, 500, 'Unable to load existing profile.');
            }

            let idDocPath = existing.id_doc_path;
            let isbnDocPath = existing.isbn_doc_path;

            if (req.files?.idDoc?.[0]) {
                idDocPath = await uploadToSupabase(
                    req.files.idDoc[0],
                    'covers'
                );
            }

            if (req.files?.isbnDoc?.[0]) {
                isbnDocPath = await uploadToSupabase(
                    req.files.isbnDoc[0],
                    'covers'
                );
            }

            const update = {
                legal_name: legalName,
                phone,
                id_number: getProfileValue(
                    body,
                    'idNumber',
                    'id_number'
                ),
                id_doc_path: idDocPath,
                address: body.address || null,
                kin_name: getProfileValue(
                    body,
                    'kinName',
                    'kin_name',
                    body.nextOfKinName
                ),
                kin_relation: getProfileValue(
                    body,
                    'kinRelation',
                    'kin_relation',
                    body.nextOfKinRelation
                ),
                kin_phone: getProfileValue(
                    body,
                    'kinPhone',
                    'kin_phone',
                    body.nextOfKinPhone
                ),
                isbn: body.isbn || null,
                isbn_doc_path: isbnDocPath,
                profile_complete: 1,
                bio: body.bio
                    ? String(body.bio).substring(0, 160)
                    : null
            };

            const { error } = await supabase
                .from('users')
                .update(update)
                .eq('id', userId);

            if (error) {
                return sendError(res, 500, error.message);
            }

            res.json({
                success: true,
                message: 'Author profile saved successfully!'
            });
        } catch (error) {
            console.error('Profile error:', error);
            sendError(res, 500, 'Failed to save author profile.');
        }
    }
);

router.get('/notifications', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .or(`user_id.eq.${userId},user_id.is.null`)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            return sendError(res, 500, error.message);
        }

        res.json(data || []);
    } catch (error) {
        console.error('Notification lookup error:', error);
        sendError(res, 500, 'Failed to load notifications.');
    }
});

router.post('/notifications/:id/read', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: 1 })
            .eq('id', req.params.id)
            .or(`user_id.eq.${userId},user_id.is.null`);

        if (error) {
            return sendError(res, 500, error.message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Notification update error:', error);
        sendError(res, 500, 'Failed to update notification.');
    }
});

router.get('/analytics/sales', requireLogin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('purchases')
            .select(
                'id,price,created_at,books!inner(title,user_id),users!purchases_buyer_id_fkey(username)'
            )
            .eq('books.user_id', req.session.user.id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            return sendError(
                res,
                500,
                'Failed to retrieve sales data.'
            );
        }

        const bookBreakdown = {};

        const recentTransactions = (data || []).map(purchase => {
            const title = purchase.books?.title || 'Unknown Title';
            const price = Number(purchase.price) || 0;

            bookBreakdown[title] ||= {
                sales: 0,
                earnings: 0
            };

            bookBreakdown[title].sales += 1;
            bookBreakdown[title].earnings += price;

            return {
                purchase_id: purchase.id,
                sale_price: price,
                sale_date: purchase.created_at,
                book_title: title,
                buyer_name: purchase.users?.username || 'Unknown'
            };
        });

        res.json({
            totalSalesCount: recentTransactions.length,
            totalEarnings: recentTransactions.reduce(
                (sum, row) => sum + row.sale_price,
                0
            ),
            recentTransactions,
            bookBreakdown,
            limited: true
        });
    } catch (error) {
        console.error('Analytics error:', error);
        sendError(res, 500, 'Failed to retrieve sales data.');
    }
});

module.exports = router;
