import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

import { MockDB } from './MockDB';

// Determine Mode
const dbUrl = process.env.DATABASE_URL || '';
const isDefaultUrl = !dbUrl || dbUrl.includes('host:5432') || dbUrl.includes('placeholder');
let dbClient: any;

if (isDefaultUrl) {
    console.warn('⚠️  DATABASE_URL is placeholder or missing. Using Safe Mode (MockDB).');
    dbClient = new MockDB();
} else {
    // Extract info for logging (Surgical check)
    const dbMatch = dbUrl.match(/@([^/]+)\/(.+)$/);
    const dbHost = dbMatch ? dbMatch[1] : 'External';
    const dbName = dbMatch ? dbMatch[2].split('?')[0] : 'Database';

    console.log(`🔌 [DB] Connecting to Client Node: ${dbHost} [DB: ${dbName}]`);

    dbClient = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }, // Force SSL for Railway stability
        max: 20, // Reduced to avoid hitting Railway limits
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000, // Increased for stability (Cold starts)
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

            // 3. SURGICAL SAFEGUARDS (Consolidated for Speed)
            await client.query(`
                DO $$ 
                BEGIN 
                    -- Column Safeguards
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_settings' AND column_name='welcome_enabled') THEN
                        ALTER TABLE group_settings ADD COLUMN welcome_enabled BOOLEAN DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_settings' AND column_name='calc_enabled') THEN
                        ALTER TABLE group_settings ADD COLUMN calc_enabled BOOLEAN DEFAULT TRUE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_settings' AND column_name='auditor_enabled') THEN
                        ALTER TABLE group_settings ADD COLUMN auditor_enabled BOOLEAN DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_settings' AND column_name='mc_enabled') THEN
                        ALTER TABLE group_settings ADD COLUMN mc_enabled BOOLEAN DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='groups' AND column_name='last_seen') THEN
                        ALTER TABLE groups ADD COLUMN last_seen TIMESTAMPTZ DEFAULT NOW();
                    END IF;
                END $$;

                -- Integrity Cleanup (One Shot)
                UPDATE group_settings SET 
                    welcome_enabled = COALESCE(welcome_enabled, false),
                    auditor_enabled = COALESCE(auditor_enabled, false),
                    ai_brain_enabled = COALESCE(ai_brain_enabled, false),
                    guardian_enabled = COALESCE(guardian_enabled, false),
                    mc_enabled = COALESCE(mc_enabled, false),
                    calc_enabled = COALESCE(calc_enabled, true)
                WHERE welcome_enabled IS NULL OR calc_enabled IS NULL;
            `);

            // 4. CASCADE UPGRADE (REMOVED FROM AUTO-LOOP)
            // This is heavy DDL and should only run manually or during initial setup.
            // Keeping it here commented out for documentation.
            /*
            await client.query(`
                DO $$
                BEGIN
                    -- Upgrade FK constraints to ON DELETE CASCADE
                    -- group_settings
                    BEGIN ALTER TABLE group_settings DROP CONSTRAINT IF EXISTS group_settings_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE group_settings ADD CONSTRAINT group_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
                    -- ... (others)
                END $$;
            `);
            */
            console.log('💎 Database Integrity: STABLE.');

        } catch (err) {
            console.error('❌ Migration Failed:', err);
            // Don't throw in production to keep app alive
        } finally {
            client.release();
        }
    },

    // Supergroup Migration Support
    migrateGroup: async (oldId: string | number, newId: string | number) => {
        const client = await dbClient.connect();
        try {
            await client.query('BEGIN');
            console.log(`🔄 [Migration] Starting Transfer: ${oldId} -> ${newId}`);

            // 1. Purge potentially conflicting 'new' shell (if it exists empty)
            const tables = ['group_settings', 'group_operators', 'group_admins', 'user_cache', 'node_groups', 'transactions', 'historical_archives'];

            for (const t of tables) {
                try { await client.query(`DELETE FROM ${t} WHERE group_id = $1`, [newId]); } catch (e) { }
            }
            try { await client.query('DELETE FROM groups WHERE id = $1', [newId]); } catch (e) { }

            // 2. Clone Group Root
            await client.query(`
                INSERT INTO groups (id, title, status, current_state, timezone, currency_symbol, license_key, license_expiry, created_at, last_seen, system_url)
                SELECT $2, title, status, current_state, timezone, currency_symbol, license_key, license_expiry, created_at, last_seen, system_url
                FROM groups WHERE id = $1
            `, [oldId, newId]);

            // 3. Move Children
            for (const t of tables) {
                try { await client.query(`UPDATE ${t} SET group_id = $2 WHERE group_id = $1`, [oldId, newId]); } catch (e) { }
            }
            try { await client.query(`UPDATE licenses SET used_by_group_id = $2 WHERE used_by_group_id = $1`, [oldId, newId]); } catch (e) { }

            // 4. Destroy Old Identity
            await client.query('DELETE FROM groups WHERE id = $1', [oldId]);

            await client.query('COMMIT');
            console.log(`✅ [Migration] Success! ${oldId} is now ${newId}`);
        } catch (e) {
            await client.query('ROLLBACK');
            console.error(`❌ [Migration] Failed:`, e);
            throw e;
        } finally {
            client.release();
        }
    }
};
