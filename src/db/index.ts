import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Connection String from Env
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

export const db = {
    query: (text: string, params?: any[]) => pool.query(text, params),
    getClient: () => pool.connect(),
    
    // Auto-Migrate function
    migrate: async () => {
        const client = await pool.connect();
        try {
            console.log('🔄 Running Database Migrations...');
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            await client.query(schemaSql);
            console.log('✅ Database Schema Synced.');
        } catch (err) {
            console.error('❌ Migration Failed:', err);
            throw err;
        } finally {
            client.release();
        }
    }
};
