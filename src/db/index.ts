import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Optional: Keep MockDB if you have it, otherwise standard pool
import { MockDB } from './MockDB';

// Determine Mode
const dbUrl = process.env.DATABASE_URL || '';
const isDefaultUrl = !dbUrl || dbUrl.includes('host:5432') || dbUrl.includes('placeholder');
let pool: any;

if (isDefaultUrl) {
    console.warn('⚠️  DATABASE_URL is placeholder or missing. Using Safe Mode (MockDB).');
    pool = new MockDB();
} else {
    console.log(`🔌 [DB] Initializing Standard Connection Pool...`);

    // CLASSIC STABLE CONFIGURATION (Hardened for Cloud)
    pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        max: 25,        // Increased to 25 for High-Throughput (Bot + Worker + Web + Scheduler)
        min: 2,         // Keep 2 warm connections
        idleTimeoutMillis: 15000,
        connectionTimeoutMillis: 10000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 0
    });

    pool.on('error', (err: any) => {
        // Log but don't crash. The query wrapper will handle retries.
        if (err.message.includes('terminated')) return;
        console.error('⚠️ [DB_POOL_ERROR]', err.message);
    });
}

export const db = {
    isReady: false,

    // SHIELDED QUERY - Retries 3 TIMES with DELAY
    query: async (text: string, params?: any[]) => {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                return await pool.query(text, params);
            } catch (err: any) {
                attempts++;
                const isNetworkError = err.message.includes('terminated') ||
                    err.message.includes('closed') ||
                    err.message.includes('ended') ||
                    err.message.includes('timeout') ||
                    err.message.includes('reset');

                if (isNetworkError && attempts < maxAttempts) {
                    const delay = attempts * 1000;
                    console.warn(`🔄 [DB_RETRY_${attempts}] Blip detected (${err.message}). Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                throw err;
            }
        }
    },

    // STANDARD CLIENT GETTER
    getClient: async () => {
        // Retry Wrapper for direct client acquisition too
        try {
            return await pool.connect();
        } catch (e) {
            console.warn('🔄 [DB_CONNECT_RETRY] Initial connect failed. Retrying once...');
            await new Promise(r => setTimeout(r, 1000));
            return await pool.connect();
        }
    },

    /**
     * WAIT FOR FOUNDATION
     * Simple polling, no complex timeouts.
     */
    waitForReady: async () => {
        while (!db.isReady) {
            await new Promise(r => setTimeout(r, 500));
        }
    },

    /**
     * CLASSIC MIGRATION
     * Runs once on startup. RETRIES until success or hard failure.
     */
    migrate: async () => {
        if (isDefaultUrl) {
            db.isReady = true;
            return;
        }

        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            console.log(`🔄 [DB_SYNC] Synchronizing Database Schema (Attempt ${attempts + 1}/${maxAttempts})...`);
            let client;
            try {
                client = await pool.connect();

                // 1. Base Schema Check
                const checkRes = await client.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'groups'");
                const needsBase = checkRes.rows.length === 0;

                if (needsBase) {
                    const schemaPath = [
                        path.join(__dirname, 'schema.sql'),
                        path.join(process.cwd(), 'src/db/schema.sql'),
                        path.join(process.cwd(), 'dist/src/db/schema.sql')
                    ].find(p => fs.existsSync(p));

                    if (schemaPath) {
                        console.log('📦 [DB_INIT] Applying Base Schema...');
                        await client.query(fs.readFileSync(schemaPath, 'utf8'));
                    }
                }

                // 2. Migrations
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
                                console.warn(`[DB_MIGRATE] Note (${file}): ${e.message}`);
                            }
                        }
                    }
                }

                db.isReady = true;
                console.log('✅ [DB_READY] Database Synchronized & Stable.');
                return; // SUCCESS

            } catch (err: any) {
                attempts++;
                console.error(`🛑 [DB_SYNC_FAIL] Attempt ${attempts} failed:`, err.message);
                if (attempts < maxAttempts) {
                    const wait = Math.min(attempts * 2000, 10000); // Wait 2s, 4s, 6s... up to 10s
                    console.log(`⏳ Waiting ${wait}ms before next sync attempt...`);
                    await new Promise(r => setTimeout(r, wait));
                } else {
                    console.error('💀 [DB_FATAL] All sync attempts failed. Bot will stay in sync loop.');
                }
            } finally {
                if (client) client.release();
            }
        }
    },

    // Support for Supergroup Migration (Kept for feature parity)
    migrateGroup: async (oldId: string | number, newId: string | number) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const tables = ['group_settings', 'group_operators', 'group_admins', 'user_cache', 'node_groups', 'transactions', 'historical_archives'];

            for (const t of tables) {
                try { await client.query(`DELETE FROM ${t} WHERE group_id = $1`, [newId]); } catch (e) { }
            }
            try { await client.query('DELETE FROM groups WHERE id = $1', [newId]); } catch (e) { }

            await client.query(`
                INSERT INTO groups (id, title, status, current_state, timezone, currency_symbol, license_key, license_expiry, created_at, last_seen, system_url)
                SELECT $2, title, status, current_state, timezone, currency_symbol, license_key, license_expiry, created_at, last_seen, system_url
                FROM groups WHERE id = $1
            `, [oldId, newId]);

            for (const t of tables) {
                try { await client.query(`UPDATE ${t} SET group_id = $2 WHERE group_id = $1`, [oldId, newId]); } catch (e) { }
            }
            try { await client.query(`UPDATE licenses SET used_by_group_id = $2 WHERE used_by_group_id = $1`, [oldId, newId]); } catch (e) { }

            await client.query('DELETE FROM groups WHERE id = $1', [oldId]);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
};
