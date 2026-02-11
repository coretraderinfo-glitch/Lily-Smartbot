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

    // ELITE SYSTEM RESTORATION: Use full URL for handshake integrity
    dbClient = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        max: 20, // Increased for hyper-scale
        min: 2,  // Keep 2 warm connections at all times
        idleTimeoutMillis: 30000, // 30s Hold (More stable for cold providers)
        connectionTimeoutMillis: 60000, // 60s Buffer (Crucial for cold starts)
        application_name: 'Lily_Master_HyperScale',
    });

    // TCP KeepAlive (Standard)
    dbClient.on('connect', (client: any) => {
        // @ts-ignore
        if (client.connection && client.connection.stream) {
            client.connection.stream.setKeepAlive(true, 60000);
        }
    });

    // Error Shield
    dbClient.on('error', (err: any) => {
        console.error('⚠️ [DB_POOL_ERROR] Unexpected pool error:', err.message);
    });
}

export const db = {
    query: async (text: string, params?: any[]) => {
        try {
            return await dbClient.query(text, params);
        } catch (err: any) {
            // Self-Healing Logic: Detect lost, cold, or reset pipes
            // Included 'fatal' and 'auth' for specific cloud provider handshake failures
            const isDead = /terminated|closed|connection|timeout|reset|pipe|fatal|auth|handshake/i.test(err.message);
            if (isDead) {
                console.warn('🔄 [DB_RECOVERY] Pipe instability detected. Healing and retrying...');
                // Wait 3s for the cloud stack to reset the handshake
                await new Promise(r => setTimeout(r, 3000));
                return await dbClient.query(text, params);
            }
            throw err;
        }
    },
    getClient: () => dbClient.connect ? dbClient.connect() : dbClient.getClient(),

    isReady: false,

    /**
     * WAIT FOR FOUNDATION: Blocks execution until the DB is migrated and ready.
     * Prevents modules from crashing during the initial 5-10s cold boot.
     */
    waitForReady: async (maxWaitMs: number = 60000) => {
        const start = Date.now();
        while (!db.isReady) {
            if (Date.now() - start > maxWaitMs) {
                throw new Error('🛑 [DB_TIMEOUT] Foundation took too long to synchronize.');
            }
            await new Promise(r => setTimeout(r, 500)); // Poll every 500ms
        }
    },

    /**
     * AUTO-MIGRATE: The "Wake Up" Protocol
     * Retries connection until stable to handle Cold Boots gracefully.
     */
    migrate: async () => {
        if (isDefaultUrl) {
            db.isReady = true;
            return;
        }

        console.log('🔄 Lily Foundation: Synchronizing Memory Banks...');

        // RETRY LOOP: Infinite Resilience (Capped logs)
        let attempt = 1;
        while (true) {
            let client;
            try {
                // Attempt Connection
                client = await dbClient.connect();

                // 1. Base Schema (Universal Path)
                const schemaPath = [
                    path.join(__dirname, 'schema.sql'),
                    path.join(process.cwd(), 'src/db/schema.sql'),
                    path.join(process.cwd(), 'dist/src/db/schema.sql')
                ].find(p => fs.existsSync(p));

                if (schemaPath) {
                    await client.query(fs.readFileSync(schemaPath, 'utf8'));
                }

                // 2. Incremental Migrations (Deep Search)
                let migrationsDir = [
                    path.join(process.cwd(), 'db/migrations'),
                    path.join(process.cwd(), 'dist/db/migrations')
                ].find(p => fs.existsSync(p));

                if (migrationsDir) {
                    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
                    for (const file of files) {
                        try {
                            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                            await client.query(sql);
                        } catch (e: any) {
                            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
                                console.warn(`[DB] Migration warning (${file}): ${e.message}`);
                            }
                        }
                    }
                }

                // 3. Global Logic Verification
                await client.query(`
                    UPDATE group_settings SET 
                        welcome_enabled = COALESCE(welcome_enabled, false),
                        calc_enabled = COALESCE(calc_enabled, true),
                        auditor_enabled = COALESCE(auditor_enabled, false),
                        ai_brain_enabled = COALESCE(ai_brain_enabled, false),
                        guardian_enabled = COALESCE(guardian_enabled, false),
                        mc_enabled = COALESCE(mc_enabled, false)
                    WHERE welcome_enabled IS NULL OR calc_enabled IS NULL;
                `);

                db.isReady = true;
                console.log(`💎 Lily Foundation: STABLE & SYNCED (Attempts: ${attempt}).`);
                return; // Success!

            } catch (err: any) {
                const isConnectionErr = /terminated|closed|connection|timeout|reset|pipe|fatal|auth|handshake/i.test(err.message);
                if (isConnectionErr || attempt < 100) {
                    if (attempt % 5 === 0) console.warn(`⏳ [DB_WAKEUP] Database is still sleeping/busy (Attempt ${attempt})...`);
                    // Backoff: Wait 5s and try again
                    await new Promise(r => setTimeout(r, 5000));
                    attempt++;
                } else {
                    console.error('🛑 [DB_FATAL] Foundation Sync Critical Failure:', err.message);
                    await new Promise(r => setTimeout(r, 10000)); // Still wait 10s before next try
                    attempt++;
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
