const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('⚠️ Missing Supabase environment variables! Check your .env file or deployment settings.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Successfully initialized Supabase client! ⚡');

module.exports = supabase;