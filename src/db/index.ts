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

    // ELITE CLOUD TUNING: Use original URL to preserve sslmode=require and other crucial params
    dbClient = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }, // Fallback safety for Railway/DigitalOcean
        max: 20,                            // Balanced for performance
        idleTimeoutMillis: 30000,           // Keep connections alive for reuse (Fast)
        connectionTimeoutMillis: 10000,     // 10s wait for new pipes
    });

    // CRITICAL: Prevent pool errors from crashing the main AI process
    dbClient.on('error', (err: any) => {
        console.error('⚠️ [DB_RESOURCE_WARNING]:', err.message);
    });
}

export const db = {
    isReady: false,

    // Surgical Query Wrapper (Root Cause Protection)
    query: async (text: string, params?: any[]) => {
        try {
            return await dbClient.query(text, params);
        } catch (err: any) {
            // Handle common cloud termination errors with a single silent retry
            const isRecoverable = /terminated|closed|connection/i.test(err.message);
            if (isRecoverable) {
                console.log('🔄 [DB_HEAL] Recovering pipe...');
                return await dbClient.query(text, params);
            }
            throw err;
        }
    },
    getClient: () => dbClient.connect ? dbClient.connect() : dbClient.getClient(),

    // Auto-Migrate function with ELITE RESILIENCE
    migrate: async () => {
        if (isDefaultUrl) {
            db.isReady = true;
            return;
        }

        // Run in background to stay "Non-Stop"
        (async () => {
            console.log('🔄 Lily Engine: Initializing Memory Layer...');
            try {
                const client = await dbClient.connect();

                // 1. One-Shot Integrity Check (Fast)
                const schemaPath = path.join(__dirname, 'schema.sql');
                if (fs.existsSync(schemaPath)) {
                    await client.query(fs.readFileSync(schemaPath, 'utf8'));
                }

                // 2. Surgical Safeguards
                await client.query(`
                    DO $$ 
                    BEGIN 
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_settings' AND column_name='welcome_enabled') THEN
                            ALTER TABLE group_settings ADD COLUMN welcome_enabled BOOLEAN DEFAULT FALSE;
                            ALTER TABLE group_settings ADD COLUMN calc_enabled BOOLEAN DEFAULT TRUE;
                        END IF;
                    END $$;
                `);

                client.release();
                db.isReady = true;
                console.log('💎 Database Layer: STABLE & ONLINE');

            } catch (err: any) {
                console.error('🛑 [DB_INIT_DELAY] Memory banks lagging:', err.message);
                // We don't loop here anymore; the 'query' wrapper handles retries later
                db.isReady = false;
            }
        })();
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
