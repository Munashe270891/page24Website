const express = require('express');
const supabase = require('../database');
const { requireLogin } = require('../middleware/auth');
const {
    sendError,
    normalizeBoolean,
    normalizeText,
    parsePositivePrice,
    serializeBook,
    bookSelect,
    authorSelect,
    getBookAccess,
    downloadPdf,
    uploadToSupabase
} = require('../utils/helpers');
const { dualUploadFields } = require('../utils/upload');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { data: books, error } = await supabase
           .from('books')
           .select(`${bookSelect},users(${authorSelect})`)
           .or('status.eq.active,status.is.null')
           .order('id', { ascending: false });

        if (error) {
            return sendError(res, 500, error.message);
        }

        res.json((books || []).map(book => ({
           ...serializeBook(book),
            author_id: book.users?.id || book.user_id,
            author_bio: book.users?.bio || null
        })));
    } catch (error) {
        console.error('Book lookup error:', error);
        sendError(res, 500, 'Failed to load books.');
    }
});

router.get('/my-books', requireLogin, async (req, res) => {
    const { data, error } = await supabase
       .from('books')
       .select(bookSelect)
       .eq('user_id', req.session.user.id)
       .order('id', { ascending: false });

    if (error) {
        return sendError(res, 500, error.message);
    }

    res.json((data || []).map(serializeBook));
});

router.get('/my-library', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { data: purchases, error: purchaseError } = await supabase
           .from('purchases')
           .select('book_id')
           .eq('buyer_id', userId);

        if (purchaseError) {
            return sendError(res, 500, purchaseError.message);
        }

        const ids = (purchases || [])
           .map(purchase => purchase.book_id)
           .filter(id => id !== null && id !== undefined);

        let query = supabase.from('books').select(bookSelect);

        if (ids.length) {
            query = query.or(`user_id.eq.${userId},price.eq.0,id.in.(${ids.join(',')})`);
        } else {
            query = query.or(`user_id.eq.${userId},price.eq.0`);
        }

        const { data, error } = await query.order('id', { ascending: false });

        if (error) {
            return sendError(res, 500, 'Failed to load personal library.');
        }

        res.json((data || []).map(serializeBook));
    } catch (error) {
        console.error('Library lookup error:', error);
        sendError(res, 500, 'Failed to load personal library.');
    }
});

router.get('/:id/pdf-stream', async (req, res) => {
    try {
        const { book, allowed } = await getBookAccess(req.params.id, req.session.user?.id);
        if (!book) return sendError(res, 404, 'Book not found.');
        if (!allowed) return sendError(res, req.session.user ? 403 : 401, req.session.user ? 'You do not own this book.' : 'Please log in to access this book.');
        if (!book.pdf_source) return sendError(res, 404, 'PDF document file not found.');
        return downloadPdf(res, book.pdf_source, 'inline');
    } catch (error) {
        console.error('PDF stream error:', error);
        sendError(res, 500, 'Failed to stream PDF.');
    }
});

router.get('/:id/download-free', async (req, res) => {
    try {
        const { book } = await getBookAccess(req.params.id, req.session.user?.id);
        if (!book) return sendError(res, 404, 'Book not found.');
        if (book.status === 'offline') return sendError(res, 403, 'This book is offline.');
        if (Number(book.price) !== 0) return sendError(res, 403, 'This title requires purchase before downloading.');
        if (!normalizeBoolean(book.allow_download)) return sendError(res, 403, 'Offline downloads are restricted for this book.');
        if (!book.pdf_source) return sendError(res, 404, 'No PDF file attached to this book.');
        return downloadPdf(res, book.pdf_source, 'attachment', book.title || 'book');
    } catch (error) {
        console.error('Free download error:', error);
        sendError(res, 500, 'File retrieval failed.');
    }
});

router.post(
    '/publish',
    requireLogin,
    dualUploadFields,
    async (req, res) => {
        try {
            const body = req.body;

            if (!normalizeBoolean(body.agreeCopyright) || !normalizeBoolean(body.agreeTerms)) {
                return sendError(res, 400, 'You must accept Copyright & Terms.');
            }

            const title = normalizeText(body.title, 200);
            if (!title) return sendError(res, 400, 'Book title is required.');
            if (!req.files?.coverImage?.[0]) return sendError(res, 400, 'Front cover artwork is required.');

            const mode = String(body.mode || 'pdf').toLowerCase();
            if (!['pdf', 'html'].includes(mode)) return sendError(res, 400, 'Invalid book mode.');
            if (mode === 'pdf' && !req.files?.pdfBook?.[0]) return sendError(res, 400, 'PDF file document is required in PDF mode.');

            const price = parsePositivePrice(body.price);
            if (price === null) return sendError(res, 400, 'Invalid book price.');

            const cover = await uploadToSupabase(req.files.coverImage[0], 'covers');
            const pdf = req.files?.pdfBook?.[0] ? await uploadToSupabase(req.files.pdfBook[0], 'pdfs') : null;
            const author = normalizeText(body.authorName || req.session.user.username, 150);

            const isPhysical = normalizeBoolean(body.is_physical) || normalizeBoolean(body.isPhysical) || body.is_physical === 'true';

            const { data: book, error } = await supabase
               .from('books')
               .insert([{
                    user_id: req.session.user.id,
                    title,
                    author,
                    author_name: author,
                    description: body.description ? String(body.description).substring(0, 5000) : null,
                    price,
                    mode,
                    category: body.category || null,
                    sub_theme: body.subTheme || null,
                    allow_download: normalizeBoolean(body.allowDownload !== undefined ? body.allowDownload : body.downloadRule),
                    status: 'active',
                    cover_image: cover,
                    pdf_source: pdf,
                    is_physical: isPhysical
                }])
               .select(bookSelect)
               .single();

            if (error) {
                console.error('Book insert error:', error);
                return sendError(res, 500, `Failed to publish book: ${error.message}`);
            }

            const content = body.chapterBody ?? body.content;
            if (mode === 'html' && content) {
                const { error: chapterError } = await supabase
                   .from('chapters')
                   .insert([{
                        book_id: book.id,
                        chapter_number: 1,
                        title: normalizeText(body.chapterTitle || 'Chapter 1', 200),
                        body: String(content)
                    }]);
                if (chapterError) {
                    console.error('Initial chapter error:', chapterError);
                    return sendError(res, 500, 'Book was created, but the first chapter could not be saved.');
                }
            }

            res.status(201).json({ success: true, bookId: book.id, book: serializeBook(book) });
        } catch (error) {
            console.error('Publish error:', error);
            sendError(res, 500, 'Failed to publish book.');
        }
    }
);

router.get('/:bookId/chapters', requireLogin, async (req, res) => {
    try {
        const { data: book, error: bookError } = await supabase.from('books').select('id').eq('id', req.params.bookId).eq('user_id', req.session.user.id).maybeSingle();
        if (bookError) return sendError(res, 500, bookError.message);
        if (!book) return sendError(res, 403, 'Forbidden or book not found.');
        const { data, error } = await supabase.from('chapters').select('*').eq('book_id', req.params.bookId).order('chapter_number');
        if (error) return sendError(res, 500, error.message);
        res.json(data || []);
    } catch (error) {
        console.error('Chapter lookup error:', error);
        sendError(res, 500, 'Failed to load chapters.');
    }
});

router.post('/:bookId/chapters', requireLogin, async (req, res) => {
    try {
        const title = normalizeText(req.body.title, 200);
        const finalContent = req.body.content ?? req.body.body;
        if (!title || finalContent === undefined || finalContent === null) return sendError(res, 400, 'Missing required chapter parameters.');
        const { data: book, error: bookError } = await supabase.from('books').select('id').eq('id', req.params.bookId).eq('user_id', req.session.user.id).maybeSingle();
        if (bookError) return sendError(res, 500, bookError.message);
        if (!book) return sendError(res, 403, 'Unauthorized book pipeline action.');
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const { data: last } = await supabase.from('chapters').select('chapter_number').eq('book_id', req.params.bookId).order('chapter_number', { ascending: false }).limit(1).maybeSingle();
            const number = (last?.chapter_number || 0) + 1;
            const { data: chapter, error } = await supabase.from('chapters').insert([{ book_id: req.params.bookId, chapter_number: number, title, body: String(finalContent) }]).select().single();
            if (!error) return res.status(201).json({ success: true, chapterId: chapter.id });
            if (error.code !== '23505') return sendError(res, 500, 'Failed to write chapter to database.');
        }
        sendError(res, 409, 'Another chapter was created concurrently. Please retry.');
    } catch (error) {
        console.error('Chapter creation error:', error);
        sendError(res, 500, 'Failed to create chapter.');
    }
});

router.put('/chapters/:chapterId', requireLogin, async (req, res) => {
    try {
        const title = normalizeText(req.body.title, 200);
        const body = req.body.body ?? req.body.content;
        if (!title || body === undefined || body === null) return sendError(res, 400, 'Chapter title and content are required.');
        const { data: chapter, error: fetchError } = await supabase.from('chapters').select('id,book_id,books!inner(user_id)').eq('id', req.params.chapterId).maybeSingle();
        if (fetchError) return sendError(res, 500, fetchError.message);
        if (!chapter || chapter.books.user_id !== req.session.user.id) return sendError(res, 403, 'Unauthorized or chapter not found.');
        const { data, error } = await supabase.from('chapters').update({ title, body: String(body) }).eq('id', req.params.chapterId).select().single();
        if (error) return sendError(res, 500, error.message);
        res.json({ success: true, chapter: data });
    } catch (error) {
        console.error('Chapter update error:', error);
        sendError(res, 500, 'Failed to update chapter.');
    }
});

router.get('/my-web-books', requireLogin, async (req, res) => {
    const { data, error } = await supabase.from('books').select(bookSelect).eq('user_id', req.session.user.id).eq('mode', 'html').order('id', { ascending: false });
    if (error) return sendError(res, 500, error.message);
    res.json((data || []).map(serializeBook));
});

router.put('/:id', requireLogin, dualUploadFields, async (req, res) => {
    try {
        const { data: old, error: fetchError } = await supabase.from('books').select('*').eq('id', req.params.id).eq('user_id', req.session.user.id).maybeSingle();
        if (fetchError) return sendError(res, 500, fetchError.message);
        if (!old) return sendError(res, 404, 'Book not found or unauthorized.');
        const body = req.body;
        const update = {};

        if (body.title !== undefined) {
            const title = normalizeText(body.title, 200);
            if (!title) return sendError(res, 400, 'Book title is required.');
            update.title = title;
        }
        if (body.description !== undefined) update.description = String(body.description).substring(0, 5000);
        if (body.price !== undefined) {
            const price = parsePositivePrice(body.price);
            if (price === null) return sendError(res, 400, 'Invalid book price.');
            update.price = price;
        }
        if (body.category !== undefined) update.category = body.category || null;
        if (body.subTheme !== undefined || body.sub_theme !== undefined) update.sub_theme = body.subTheme ?? body.sub_theme ?? null;
        if (body.allowDownload !== undefined || body.allow_download !== undefined) update.allow_download = normalizeBoolean(body.allowDownload ?? body.allow_download);

        if (body.is_physical !== undefined || body.isPhysical !== undefined) {
            update.is_physical = normalizeBoolean(body.is_physical ?? body.isPhysical);
        }

        if (req.files?.coverImage?.[0]) update.cover_image = await uploadToSupabase(req.files.coverImage[0], 'covers');
        if (req.files?.pdfBook?.[0]) update.pdf_source = await uploadToSupabase(req.files.pdfBook[0], 'pdfs');

        if (!Object.keys(update).length) return sendError(res, 400, 'No changes were supplied.');

        const { data, error } = await supabase.from('books').update(update).eq('id', req.params.id).eq('user_id', req.session.user.id).select(bookSelect).single();
        if (error) return sendError(res, 500, error.message);
        res.json({ success: true, book: serializeBook(data) });
    } catch (error) {
        console.error('Book update error:', error);
        sendError(res, 500, 'Failed to update book.');
    }
});

router.delete('/:id', requireLogin, async (req, res) => {
    try {
        const { data, error } = await supabase.from('books').delete().eq('id', req.params.id).eq('user_id', req.session.user.id).select('id');
        if (error) return sendError(res, 500, error.message);
        if (!data?.length) return sendError(res, 404, 'Book not found or unauthorized.');
        res.json({ success: true, message: 'Book permanently deleted.' });
    } catch (error) {
        console.error('Book deletion error:', error);
        sendError(res, 500, 'Failed to delete book.');
    }
});

module.exports = router;
