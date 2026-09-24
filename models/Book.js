/**
 * Canonical book shape used by the Supabase-backed application.
 *
 * Persistence is handled by server.js through Supabase.
 * This file intentionally does not define a Mongoose model.
 */

function serializeBook(row) {
    return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        author: row.author_name || row.author || '',
        description: row.description || '',
        price: Number(row.price) || 0,
        mode: row.mode || 'pdf',
        status: row.status || 'active',
        category: row.category || null,
        subTheme: row.sub_theme || null,
        coverImage: row.cover_image || null,
        pdfSource: row.pdf_source || null,
        allowDownload: Number(row.allow_download) === 1,
        createdAt: row.created_at || null
    };
}

module.exports = {
    serializeBook
};
