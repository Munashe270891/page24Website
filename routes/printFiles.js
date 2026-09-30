const express = require('express');
const router = express.Router();
const { supabase } = require('../database');
const { requireLogin } = require('../middleware/auth'); // FIXED: was authenticateToken

router.post('/upload', requireLogin, async (req, res) => {
  try {
    const { bookId, interiorPdfUrl, coverPrintPdfUrl, whatsappNumber } = req.body;
    const authorId = req.session.user.id; // FIXED: you use session, not req.user.id

    if(!interiorPdfUrl?.toLowerCase().endsWith('.pdf') || !coverPrintPdfUrl?.toLowerCase().endsWith('.pdf')){
      return res.status(400).json({ error: 'Both files must be PDF' });
    }

    if(whatsappNumber){
      await supabase.from('users').update({ whatsapp_number: whatsappNumber }).eq('id', authorId);
    }

    const { data, error } = await supabase.from('print_files').insert([{
      book_id: bookId, author_id: authorId, interior_pdf_url: interiorPdfUrl, cover_print_pdf_url: coverPrintPdfUrl
    }]).select().single();

    if(error) return res.status(500).json({ error: error.message });

    await supabase.from('books').update({ print_approval_status: 'pending', is_physical_available: false }).eq('id', bookId);

    res.json({ success: true, message: 'Files uploaded! Review in 1-3 days via Email/WhatsApp.' });
  } catch (err) {
    console.error('Print upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
