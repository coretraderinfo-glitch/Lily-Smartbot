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
        max: 10, // Optimized for Railway Starter plans
        idleTimeoutMillis: 10000, // Reclaim connections faster
        connectionTimeoutMillis: 20000, // Even more generous for cloud stability
    });
}

export const db = {
    query: (text: string, params?: any[]) => dbClient.query(text, params),
    getClient: () => dbClient.connect ? dbClient.connect() : dbClient.getClient(), // Handle Mock vs Pool

    // Auto-Migrate function with RESILIENCE (Root Cause Fix)
    migrate: async () => {
        if (isDefaultUrl) return dbClient.migrate();

        console.log('🔄 Lily Engine: Initializing Database Persistence...');

        // RETRY WRAPPER: 3 attempts with exponential backoff
        for (let attempt = 1; attempt <= 3; attempt++) {
            let client;
            try {
                // Wait briefly for cloud network stabilization (Cold start safety)
                if (attempt > 1) await new Promise(r => setTimeout(r, 5000));

                client = await dbClient.connect();
                console.log(`✅ [DB] Connection Established (Attempt ${attempt}/3).`);

                // 1. Ensure Base Schema (One-Shot)
                const schemaPath = path.join(__dirname, 'schema.sql');
                if (fs.existsSync(schemaPath)) {
                    await client.query(fs.readFileSync(schemaPath, 'utf8'));
                }

                // 2. SURGICAL SAFEGUARDS (Consolidated for Maximum Speed)
                await client.query(`
                    DO $$ 
                    BEGIN 
                        -- Check and Add columns atomically
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_settings' AND column_name='welcome_enabled') THEN
                            ALTER TABLE group_settings ADD COLUMN welcome_enabled BOOLEAN DEFAULT FALSE;
                            ALTER TABLE group_settings ADD COLUMN calc_enabled BOOLEAN DEFAULT TRUE;
                            ALTER TABLE group_settings ADD COLUMN auditor_enabled BOOLEAN DEFAULT FALSE;
                            ALTER TABLE group_settings ADD COLUMN mc_enabled BOOLEAN DEFAULT FALSE;
                        END IF;
                    END $$;

                    -- Rapid Integrity Fix
                    UPDATE group_settings SET 
                        welcome_enabled = COALESCE(welcome_enabled, false),
                        calc_enabled = COALESCE(calc_enabled, true)
                    WHERE welcome_enabled IS NULL OR calc_enabled IS NULL;
                `);

                console.log('💎 Database Integrity: VERIFIED.');
                return; // SUCCESS - Exit function

            } catch (err: any) {
                console.warn(`⚠️ [DB] Connection Attempt ${attempt} failed: ${err.message}`);
                if (attempt === 3) {
                    console.error('� [FATAL BYPASS] Database unreachable. Booting Lily in Degraded Mode...');
                }
            } finally {
                if (client) client.release();
            }
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
