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
        max: 5,        // Lean pool (Starter-friendly) to prevent connection leaks
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 10000,
        keepAlive: true, // Prevent 'Connection terminated unexpectedly' ghosting
    });

    // CRITICAL: Prevent unhandled errors from crashing the bot process
    dbClient.on('error', (err: any) => {
        console.error('⚠️ [DB_POOL_ERROR] Unexpected pool error:', err.message);
    });
}

export const db = {
    query: (text: string, params?: any[]) => dbClient.query(text, params),
    getClient: () => dbClient.connect ? dbClient.connect() : dbClient.getClient(), // Handle Mock vs Pool

    isReady: false,

    // Auto-Migrate function with NON-BLOCKING RESILIENCE (Ultra Fix)
    migrate: async () => {
        if (isDefaultUrl) {
            db.isReady = true;
            return;
        }

        // We run this in the background to avoid holding up the 'AI Soul' startup
        (async () => {
            console.log('🔄 Lily Engine: Initializing Memory Banks (Background)...');

            for (let attempt = 1; attempt <= 5; attempt++) {
                let client;
                try {
                    client = await dbClient.connect();

                    // Atomic Integrity Check
                    await client.query('SELECT 1');

                    const schemaPath = path.join(__dirname, 'schema.sql');
                    if (fs.existsSync(schemaPath)) {
                        await client.query(fs.readFileSync(schemaPath, 'utf8'));
                    }

                    // Consolidated Surgical Safeguards
                    await client.query(`
                        DO $$ 
                        BEGIN 
                            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_settings' AND column_name='welcome_enabled') THEN
                                ALTER TABLE group_settings ADD COLUMN welcome_enabled BOOLEAN DEFAULT FALSE;
                                ALTER TABLE group_settings ADD COLUMN calc_enabled BOOLEAN DEFAULT TRUE;
                            END IF;
                        END $$;
                    `);

                    db.isReady = true;
                    console.log(`💎 Database Connectivity: STABLE (Attempt ${attempt}).`);
                    return;

                } catch (err: any) {
                    console.warn(`⏳ [DB_WARMUP] Memory bank busy (Attempt ${attempt}/5): ${err.message}`);
                    await new Promise(r => setTimeout(r, 4000));
                } finally {
                    if (client) client.release();
                }
            }
            console.error('🛑 [CRITICAL] Memory banks offline. Lily running in Degraded Mode.');
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
