const supabase = require('./database');

async function testSupabaseConnection() {
    console.log('🔄 Verifying connection to Supabase cloud database...');
    
    try {
        // Run a lightweight read request to confirm credentials and connection
        const { data, error } = await supabase.from('users').select('id').limit(1);

        if (error) {
            console.error('❌ Supabase connection check failed:', error.message);
            process.exit(1);
        }

        console.log('✅ Connected successfully to Supabase!');
        console.log('ℹ️ Database schema is managed via Supabase SQL Editor.');
    } catch (err) {
        console.error('❌ Unexpected error during connection check:', err.message);
        process.exit(1);
    }
}

testSupabaseConnection();