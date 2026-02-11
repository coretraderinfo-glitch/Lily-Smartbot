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

    // RECOVERY MODE: Restoring the "Rock Solid" configuration
    const cleanUrl = dbUrl.split('?')[0]; // Critical: Remove conflicting params

    dbClient = new Pool({
        connectionString: cleanUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,                       // Safe limit for stability
        idleTimeoutMillis: 2000,       // Fast cycling to prevent dead pipes
        connectionTimeoutMillis: 10000, // Faster failure detection (10s)
        application_name: 'Lily_Production_Instance',
    });

    // TCP KeepAlive Configuration (Cloud-Native)
    dbClient.on('connect', (client: any) => {
        // @ts-ignore - access internal socket for keepalive hardening
        if (client.connection && client.connection.stream) {
            client.connection.stream.setKeepAlive(true, 60000);
        }
    });

    // CRITICAL: Prevent unhandled errors from crashing the bot process
    dbClient.on('error', (err: any) => {
        console.error('⚠️ [DB_POOL_ERROR] Unexpected pool error:', err.message);
    });
}

export const db = {
    // Self-Healing Query Wrapper (THE ULTIMATE FIX)
    query: async (text: string, params?: any[]) => {
        try {
            return await dbClient.query(text, params);
        } catch (err: any) {
            // If connection was lost, try one more time before giving up
            const isDead = /terminated|closed|connection/i.test(err.message);
            if (isDead) {
                console.warn('🔄 [DB_RECOVERY] Connection dropped. Healing pipe and retrying...');
                // Tiny delay to allow cloud stack to reset
                await new Promise(r => setTimeout(r, 500));
                return await dbClient.query(text, params);
            }
            throw err;
        }
    },
    getClient: () => dbClient.connect ? dbClient.connect() : dbClient.getClient(),

    isReady: false,

    /**
     * AUTO-MIGRATE: The Foundation of Lily
     * Ensures all tables and columns are ready before the bot takes her first breath.
     */
    migrate: async () => {
        if (isDefaultUrl) {
            db.isReady = true;
            return;
        }

        const client = await dbClient.connect();
        try {
            console.log('🔄 Lily Foundation: Synchronizing Memory Banks...');

            // 1. Base Schema (schema.sql)
            const schemaPath = path.join(__dirname, 'schema.sql');
            if (fs.existsSync(schemaPath)) {
                await client.query(fs.readFileSync(schemaPath, 'utf8'));
            }

            // 2. Incremental Migrations (db/migrations/*.sql)
            const migrationsDir = path.join(process.cwd(), 'db/migrations');
            if (fs.existsSync(migrationsDir)) {
                const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
                for (const file of files) {
                    try {
                        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                        await client.query(sql);
                    } catch (e: any) {
                        // Skip if already applied
                        if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
                            console.warn(`[DB] Migration ${file} warning:`, e.message);
                        }
                    }
                }
            }

            // 3. FINAL INTEGRITY WRAPPER
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
            console.log('💎 Lily Foundation: STABLE & SYNCED.');

        } catch (err: any) {
            console.error('🛑 [DB_FATAL] Foundation Sync Failed:', err.message);
            throw err; // In blocking mode, we want to know if foundations are broken
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
