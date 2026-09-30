const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../database');
const {
    sendError,
    normalizeText,
    normalizeEmail,
    isSafeLocalPath,
    regenerateSession
} = require('../utils/helpers');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const username = normalizeText(req.body.username, 80);
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!username || !email || !password) {
            return sendError(res, 400, 'All registration fields are required.');
        }

        if (username.length < 3) {
            return sendError(res, 400, 'Username must contain at least 3 characters.');
        }

        if (password.length < 8) {
            return sendError(
                res,
                400,
                'Password must contain at least 8 characters.'
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return sendError(res, 400, 'Please provide a valid email address.');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const { error } = await supabase
            .from('users')
            .insert([{
                username,
                email,
                password: passwordHash,
                role: 'author'
            }]);

        if (error) {
            if (error.code === '23505') {
                return sendError(
                    res,
                    400,
                    'Username or email already exists.'
                );
            }

            console.error('Registration database error:', error);
            return sendError(res, 500, 'Registration failed.');
        }

        res.status(201).json({
            success: true,
            message: 'Registration successful!'
        });
    } catch (error) {
        console.error('Registration error:', error);
        sendError(res, 500, 'Registration failed.');
    }
});

router.post('/login', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!email || !password) {
            return sendError(
                res,
                400,
                'Email and password are required.'
            );
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id,username,email,password,role')
            .eq('email', email)
            .maybeSingle();

        if (error) {
            console.error('Login lookup error:', error);
            return sendError(res, 500, 'Login failed.');
        }

        if (!user || !user.password) {
            return sendError(res, 401, 'Invalid email or password.');
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return sendError(res, 401, 'Invalid email or password.');
        }

        const sessionUser = await regenerateSession(req, user);

        const requestedRedirect = req.body.redirectTo;

        const destination = isSafeLocalPath(requestedRedirect)
            ? requestedRedirect
            : (user.role === 'author' || user.role === 'admin')
                ? '/dashboard'
                : '/read';

        res.json({
            success: true,
            message: 'Logged in successfully!',
            user: sessionUser,
            redirectUrl: destination
        });
    } catch (error) {
        console.error('Login error:', error);
        sendError(res, 500, 'Login failed.');
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(error => {
        if (error) {
            console.error('Logout error:', error);
            return sendError(res, 500, 'Could not log out.');
        }

        res.clearCookie('connect.sid');
        res.json({
            success: true,
            message: 'Logged out successfully!'
        });
    });
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Could not log out.');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

router.get('/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ loggedIn: false });
    }

    res.json({
        loggedIn: true,
        user: req.session.user
    });
});

module.exports = router;
