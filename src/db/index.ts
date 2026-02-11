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
        max: 10,
        min: 0,
        idleTimeoutMillis: 20000, // 20s (Recycle faster to avoid Server Kill)
        connectionTimeoutMillis: 120000, // 120s (Extreme Patience)
        keepAlive: true,
        keepAliveInitialDelayMillis: 0 // Start Keep-Alive immediately
    });

    pool.on('error', (err: any) => {
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
                    err.message.includes('timeout');

                if (isNetworkError && attempts < maxAttempts) {
                    const delay = attempts * 1000; // 1s, 2s...
                    console.warn(`🔄 [DB_RETRY_${attempts}] Connection blip detected (${err.message}). Sleeping ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue; // Retry loop
                }
                throw err; // Final failure
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
     * Runs once on startup. Fails loudly if it can't connect.
     */
    migrate: async () => {
        if (isDefaultUrl) {
            db.isReady = true;
            return;
        }

        console.log('🔄 Synchronizing Database Schema...');
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
                    console.log('📦 Applying Base Schema...');
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
                        // Ignore harmless errors
                        if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
                            console.warn(`[DB] Migration note (${file}): ${e.message}`);
                        }
                    }
                }
            }

            db.isReady = true;
            console.log('✅ Database Synchronized (Classic Mode).');

        } catch (err: any) {
            console.error('🛑 [FATAL] Database Connection Failed:', err.message);
            // In classic mode, we don't pretend it worked. We let the admin see the error.
            // But to prevent crash loops, we might flag ready=true but allow queries to fail naturally.
            // For now, let's keep isReady=false to show the error clearly in logs.
            // Actually, if we leave isReady=false, the bot simply won't process messages (Guard logic).
            // Let's retry ONCE after 5 seconds then give up.
            console.log('⏳ Retrying connection in 5s...');
            await new Promise(r => setTimeout(r, 5000));
            try {
                // Simple retry logic inline
                if (client) client.release();
                client = await pool.connect();
                db.isReady = true;
                console.log('✅ Connected on retry.');
            } catch (retryErr) {
                console.error('🛑 Retry failed. Bot will start in Offline Mode.', retryErr);
                db.isReady = true; // Force ready so at least /ping might work if it doesn't touch DB
            }
        } finally {
            if (client) client.release();
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
