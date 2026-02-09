import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

import { MockDB } from './MockDB';

// Determine Mode
const isDefaultUrl = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('host:5432');
let dbClient: any;

if (isDefaultUrl) {
    console.warn('⚠️  DATABASE_URL is not configured. Switching to High-Speed InMemory Mode (Safe Mode).');
    dbClient = new MockDB();
} else {
    // Connection Pool with High-Performance Tuning for Parallelism
    dbClient = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
        max: 30, // Increased from 10 to 30 for parallel FIGHTER processing
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000, // Increased to 5s for stability
    });
}

export const db = {
    query: (text: string, params?: any[]) => dbClient.query(text, params),
    getClient: () => dbClient.connect ? dbClient.connect() : dbClient.getClient(), // Handle Mock vs Pool

    // Auto-Migrate function
    migrate: async () => {
        if (isDefaultUrl) {
            return dbClient.migrate();
        }

        const client = await dbClient.connect();
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
            } else {
                console.warn('⚠️ Migrations directory not found. Running inline safeguards...');
            }

            // 3. INLINE SAFEGUARDS (Self-Healing)
            // Ensure 'welcome_enabled' exists even if file migration missed it
            // FIXED: Default is now FALSE (Quiet Mode) as per SIR's request
            await client.query(`
                DO $$ 
                BEGIN 
                    BEGIN
                        ALTER TABLE group_settings ADD COLUMN welcome_enabled BOOLEAN DEFAULT FALSE;
                    EXCEPTION
                        WHEN duplicate_column THEN NULL;
                    END;
                END $$;
            `);
            console.log('✅ Safeguard: welcome_enabled verified.');

        } catch (err) {
            console.error('❌ Migration Failed:', err);
            // Don't throw in production to keep app alive
        } finally {
            client.release();
        }
    }
};
