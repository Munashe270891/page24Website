const express = require('express');
const router = express.Router();
const { supabase } = require('../database');

router.get('/zones', async (req, res) => {
  const { data } = await supabase.from('shipping_zones').select('*').order('base_fee', {ascending: true});
  res.json(data);
});

module.exports = router;
