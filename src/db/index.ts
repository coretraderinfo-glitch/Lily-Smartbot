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

            // 1. Ensure Base Schema
            const schemaPath = path.join(__dirname, 'schema.sql');
            if (fs.existsSync(schemaPath)) {
                const schemaSql = fs.readFileSync(schemaPath, 'utf8');
                await client.query(schemaSql);
                console.log('✅ Base Schema Synced.');
            }

            // 2. Run Enterprise Migrations (Step 2 logic)
            const migrationsDir = path.join(process.cwd(), 'db/migrations');
            if (fs.existsSync(migrationsDir)) {
                const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
                for (const file of files) {
                    console.log(`⏳ Applying Migration: ${file}...`);
                    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                    await client.query(sql);
                }
                console.log('✅ Enterprise Pipes Successfully Connected.');
            }

        } catch (err) {
            console.error('❌ Migration Failed:', err);
            throw err;
        } finally {
            client.release();
        }
    }
};
