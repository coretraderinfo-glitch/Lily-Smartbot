import IORedis from 'ioredis';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    console.log('🔍 Diagnostic Started...');

    // 1. Check Redis
    try {
        const redis = new IORedis(process.env.REDIS_URL!, { connectTimeout: 5000 });
        await redis.ping();
        console.log('✅ Redis: CONNECTED');
        await redis.quit();
    } catch (e: any) {
        console.error('❌ Redis: FAILED -', e.message);
    }

    // 2. Check Database
    try {
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
        });
        await pool.query('SELECT NOW()');
        console.log('✅ Database: CONNECTED');
        await pool.end();
    } catch (e: any) {
        console.error('❌ Database: FAILED -', e.message);
    }

    // 3. Check Token
    if (process.env.BOT_TOKEN) {
        console.log('✅ Bot Token: PRESENT');
    } else {
        console.error('❌ Bot Token: MISSING');
    }

    console.log('🔍 Diagnostic Finished.');
}

check();
