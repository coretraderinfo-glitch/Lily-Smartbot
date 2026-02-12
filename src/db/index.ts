import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import { MockDB } from './MockDB';

// Determine Mode
const dbUrl = process.env.DATABASE_URL || '';
const isDefaultUrl = !dbUrl || dbUrl.includes('host:5432') || dbUrl.includes('placeholder');
let dbClient: any;

/**
 * 💎 WORLD-CLASS POOL ENGINE
 * Created with surgical precision for high-uptime environments.
 */
const createPool = () => {
    if (isDefaultUrl) {
        console.warn('⚠️  DATABASE_URL is placeholder or missing. Using Safe Mode (MockDB).');
        return new MockDB();
    }

    const config = {
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        max: 6, // Optimized for high-frequency trading bot
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 30000, // 30s for heavy handshakes
        maxUses: 7500, // Lifecycle management
        keepAlive: true
    };

    const pool = new Pool(config);

    // Global Pool Monitor
    pool.on('error', (err: any) => {
        console.error('🛑 [DB_HEARTBEAT] Sudden death in connection pool:', err.message);
        // Self-Healing will trigger on the next query
    });

    return pool;
};

dbClient = createPool();

/**
 * 🧠 LILY INTELLIGENT RETRY ENGINE
 * Implements linear backoff and emergency pool reconstruction.
 */
async function reliableQuery(text: string, params?: any[], retryCount = 0): Promise<any> {
    try {
        return await dbClient.query(text, params);
    } catch (err: any) {
        const isTransient = err.message.includes('terminated') ||
            err.message.includes('timeout') ||
            err.message.includes('closed') ||
            err.message.includes('ECONNRESET') ||
            err.message.includes('53300'); // Resource limit

        const errorMsg = err.message.toLowerCase();
        const isAuthError = errorMsg.includes('auth') || errorMsg.includes('password');

        if (isAuthError) {
            console.error('🔥 [DB_CRITICAL] Authentication failure. Credentials might be rotated.');
            throw err;
        }

        if (isTransient && retryCount < 4) {
            const delay = 1500 * (retryCount + 1);
            console.warn(`⏳ [DB_RECOVERY] Blip detected. Lily is healing system in ${delay}ms... (${retryCount + 1}/4)`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // If we are at the halfway point, try to refresh the pool locally
            if (retryCount === 2 && !isDefaultUrl) {
                console.log('🔄 [DB_AUTO_HEAL] Recycling pool mid-flight...');
                try {
                    const oldPool = dbClient;
                    dbClient = createPool();
                    setTimeout(() => oldPool.end().catch(() => { }), 10000);
                } catch (e) { }
            }

            return reliableQuery(text, params, retryCount + 1);
        }

        console.error(`❌ [DB_FATAL] Query definitively failed after retries: ${err.message}`);
        throw err;
    }
}

export const db = {
    query: reliableQuery,

    getClient: async (): Promise<PoolClient> => {
        if (isDefaultUrl) return dbClient.getClient();
        return await dbClient.connect();
    },

    /**
     * 🛡️ AUTO-MIGRATE WORKER
     * Ensures Lily is active & secure without blocking the main event loop.
     */
    migrate: async () => {
        if (isDefaultUrl) return dbClient.migrate();

        const runMigrationOnce = async () => {
            let client;
            try {
                console.log('🔄 [Lily_Core] Preparing database handshake...');
                client = await dbClient.connect();

                // 🛰️ Health Check
                await client.query('SELECT 1');

                console.log('🔄 [Lily_Core] Core detected. Injecting safeguards...');
                await client.query('SET statement_timeout = 60000');

                // 1. Schema Injection
                const schemaPath = path.join(__dirname, 'schema.sql');
                if (fs.existsSync(schemaPath)) {
                    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
                    await client.query(schemaSql);
                }

                // 2. Resilient Column Safeguards
                const safeguards = [
                    { table: 'group_settings', col: 'welcome_enabled', type: 'BOOLEAN', def: 'FALSE' },
                    { table: 'group_settings', col: 'calc_enabled', type: 'BOOLEAN', def: 'TRUE' },
                    { table: 'group_settings', col: 'auditor_enabled', type: 'BOOLEAN', def: 'FALSE' },
                    { table: 'group_settings', col: 'ai_brain_enabled', type: 'BOOLEAN', def: 'FALSE' },
                    { table: 'group_settings', col: 'guardian_enabled', type: 'BOOLEAN', def: 'FALSE' },
                    { table: 'group_settings', col: 'mc_enabled', type: 'BOOLEAN', def: 'FALSE' },
                    { table: 'groups', col: 'last_seen', type: 'TIMESTAMPTZ', def: 'NOW()' },
                    { table: 'groups', col: 'system_url', type: 'TEXT', def: 'NULL' }
                ];

                for (const s of safeguards) {
                    await client.query(`
                        DO $$ 
                        BEGIN 
                            BEGIN
                                ALTER TABLE ${s.table} ADD COLUMN ${s.col} ${s.type} DEFAULT ${s.def};
                            EXCEPTION WHEN duplicate_column THEN NULL; END;
                        END $$;
                    `);
                }

                // 3. Relational Cascade (Master-Copy)
                const fkActions = [
                    { table: 'group_settings', fk: 'group_settings_group_id_fkey', ref: 'groups(id)' },
                    { table: 'transactions', fk: 'transactions_group_id_fkey', ref: 'groups(id)' },
                    { table: 'group_operators', fk: 'group_operators_group_id_fkey', ref: 'groups(id)' },
                    { table: 'group_admins', fk: 'group_admins_group_id_fkey', ref: 'groups(id)' },
                    { table: 'historical_archives', fk: 'historical_archives_group_id_fkey', ref: 'groups(id)' },
                    { table: 'mc_settings', fk: 'mc_settings_group_id_fkey', ref: 'groups(id)' },
                    { table: 'mc_deals', fk: 'mc_deals_group_id_fkey', ref: 'groups(id)' }
                ];

                for (const f of fkActions) {
                    await client.query(`
                        DO $$ 
                        BEGIN 
                            ALTER TABLE ${f.table} DROP CONSTRAINT IF EXISTS ${f.fk};
                            ALTER TABLE ${f.table} ADD CONSTRAINT ${f.fk} FOREIGN KEY (group_id) REFERENCES ${f.ref} ON DELETE CASCADE;
                        EXCEPTION WHEN OTHERS THEN NULL; END $$;
                    `);
                }

                // 4. Data Homogenization
                await client.query(`
                    UPDATE group_settings SET 
                        welcome_enabled = COALESCE(welcome_enabled, false),
                        auditor_enabled = COALESCE(auditor_enabled, false),
                        ai_brain_enabled = COALESCE(ai_brain_enabled, false),
                        guardian_enabled = COALESCE(guardian_enabled, false),
                        mc_enabled = COALESCE(mc_enabled, false),
                        calc_enabled = COALESCE(calc_enabled, true)
                    WHERE welcome_enabled IS NULL 
                       OR auditor_enabled IS NULL 
                       OR ai_brain_enabled IS NULL 
                       OR guardian_enabled IS NULL 
                       OR calc_enabled IS NULL;
                `);

                console.log('✅ [Lily_Core] All systems synchronized. World-Class status active.');
                return true;
            } catch (err: any) {
                console.warn(`⏳ [Lily_Core] Handshake delayed: ${err.message}. Retrying in background...`);
                return false;
            } finally {
                if (client) client.release();
            }
        };

        // Execution Logic: Block 1st attempt, then background loop
        const success = await runMigrationOnce();
        if (!success) {
            const interval = setInterval(async () => {
                if (await runMigrationOnce()) clearInterval(interval);
            }, 60000); // Retry every minute until the DB wakes up
        }
    },

    // Identity Shift (Resilient)
    migrateGroup: async (oldId: string | number, newId: string | number) => {
        const client = await dbClient.connect();
        try {
            await client.query('BEGIN');
            console.log(`🔄 [Migration] Identity Shift: ${oldId} -> ${newId}`);

            const tables = ['group_settings', 'group_operators', 'group_admins', 'user_cache', 'transactions', 'historical_archives', 'mc_settings', 'mc_deals'];

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
            console.log(`✅ [Migration] Success.`);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
};
