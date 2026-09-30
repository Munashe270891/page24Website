const supabase = require('../database');
const { sendError } = require('../utils/helpers');

function requireLogin(req, res, next) {
    if (!req.session.user) {
        if (req.path.startsWith('/api/') || req.headers['accept']?.includes('application/json')) {
            return sendError(res, 401, 'Unauthorized access. Please log in.');
        }
        return res.redirect('/login');
    }

    next();
}

async function requireAdmin(req, res, next) {
    if (!req.session.user) {
        if (req.path.startsWith('/api/') || req.headers['accept']?.includes('application/json')) {
            return sendError(res, 401, 'Unauthorized access.');
        }
        return res.redirect('/login');
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', req.session.user.id)
            .maybeSingle();

        if (error) {
            console.error('Admin lookup error:', error);
            if (req.path.startsWith('/api/')) {
                return sendError(res, 500, 'Unable to verify administrator privileges.');
            }
            return res.redirect('/');
        }

        if (!user || user.role !== 'admin') {
            if (req.path.startsWith('/api/')) {
                return sendError(res, 403, 'Administrator privileges required.');
            }
            return res.redirect('/');
        }

        next();
    } catch (error) {
        console.error('Admin authentication error:', error);
        if (req.path.startsWith('/api/')) {
            return sendError(res, 500, 'Server authentication error.');
        }
        return res.redirect('/');
    }
}

module.exports = {
    requireLogin,
    requireAdmin
};
