const express = require('express');
const router = express.Router();
const { supabase } = require('../database');
const { requireLogin } = require('../middleware/auth'); // FIXED

// POST Create Physical Order - FINAL VERSION WITH shipping_fee + book_price
router.post('/create-order', requireLogin, async (req, res) => {
  try {
    const { bookId, shippingZoneId, shippingMethod } = req.body;
    const buyerId = req.session.user.id; // FIXED: was req.user.id

    // 1. Get book price
    const { data: book, error: bookErr } = await supabase
      .from('books').select('id, price, is_physical').eq('id', bookId).single();
    
    if (bookErr || !book) return res.status(404).json({ error: 'Book not found' });

    // Optional: block if not physical (remove if you want digital to also use this route)
    // if (!book.is_physical) return res.status(400).json({ error: 'Book is not available as physical' });

    // 2. Calculate shipping
    let shippingFee = 0;
    let fulfillmentStatus = 'processing';

    if (shippingMethod === 'platform_checkout') {
      const { data: zone } = await supabase.from('shipping_zones').select('base_fee').eq('id', shippingZoneId).single();
      shippingFee = zone ? Number(zone.base_fee) : 0;
      fulfillmentStatus = 'paid_with_shipping';
    } else {
      // manual_arrangement - Harare office pickup or author arranges own courier (50% refund logic later)
      shippingFee = 0;
      fulfillmentStatus = 'paid_book_only_manual_shipping_pending';
    }

    const totalPrice = Number(book.price) + shippingFee;

    // 3. Insert with ALL your columns
    const { data: order, error: orderErr } = await supabase
      .from('purchases')
      .insert([{
        book_id: bookId,
        buyer_id: buyerId,
        book_price: Number(book.price),
        shipping_fee: shippingFee,
        price: totalPrice,
        shipping_zone_id: shippingZoneId,
        shipping_method: shippingMethod,
        fulfillment_status: fulfillmentStatus,
        is_physical_order: true,
        is_sample_order: false
      }])
      .select()
      .single();

    if (orderErr) throw orderErr;

    res.json({ 
      success: true, 
      orderId: order.id, 
      status: fulfillmentStatus,
      bookPrice: Number(book.price),
      shippingFee,
      totalPrice
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
