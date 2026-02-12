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
 * Optimized for Railway Internal & External networking.
 */
const createPool = () => {
    if (isDefaultUrl) {
        console.warn('⚠️  DATABASE_URL is placeholder or missing. Using Safe Mode (MockDB).');
        return new MockDB();
    }

    // Surgical SSL Logic: If internal, disable SSL to prevent handshake timeouts.
    const isInternal = dbUrl.includes('railway.internal');

    const config = {
        connectionString: dbUrl,
        ssl: isInternal ? false : { rejectUnauthorized: false },
        max: 10, // Increased for concurrent processing
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 45000, // 45s maximum patience for handshakes
        maxUses: 7500,
        keepAlive: true
    };

    console.log(`🔌 [DB_INIT] Mode: ${isInternal ? 'INTERNAL (Non-SSL)' : 'EXTERNAL (SSL)'}`);
    const pool = new Pool(config);

    pool.on('error', (err: any) => {
        console.error('🛑 [DB_HEARTBEAT] Sudden death in connection pool:', err.message);
    });

    return pool;
};

dbClient = createPool();

/**
 * 🧠 LILY INTELLIGENT RETRY ENGINE
 */
async function reliableQuery(text: string, params?: any[], retryCount = 0): Promise<any> {
    try {
        return await dbClient.query(text, params);
    } catch (err: any) {
        const isTransient = err.message.includes('terminated') ||
            err.message.includes('timeout') ||
            err.message.includes('closed') ||
            err.message.includes('ECONNRESET') ||
            err.message.includes('53300');

        if (isTransient && retryCount < 5) {
            const delay = 2000 * (retryCount + 1);
            console.warn(`⏳ [DB_RECOVERY] Attempt ${retryCount + 1}/5: System healing... (${err.message})`);

            // EMERGENCY REFRESH
            if (retryCount >= 2 && !isDefaultUrl) {
                console.log('🔄 [DB_AUTO_HEAL] Recycling pool mid-flight to clear dead sockets...');
                try {
                    const oldPool = dbClient;
                    dbClient = createPool();
                    setTimeout(() => oldPool.end().catch(() => { }), 15000);
                } catch (e) { }
            }

            await new Promise(resolve => setTimeout(resolve, delay));
            return reliableQuery(text, params, retryCount + 1);
        }
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
     * 🛡️ WORLD CLASS MIGRATION GORILLA
     * Runs with absolute priority to ensure features come online.
     */
    migrate: async () => {
        if (isDefaultUrl) return dbClient.migrate();

        const runMigrationOnce = async (isBackground = false) => {
            let client;
            try {
                if (isBackground) console.log('🔄 [Lily_Migration] background cycle starting...');
                client = await dbClient.connect();

                // 🛸 Priority Setup
                await client.query('SET statement_timeout = 60000');
                await client.query('SELECT 1');

                const schemaPath = path.join(__dirname, 'schema.sql');
                if (fs.existsSync(schemaPath)) {
                    await client.query(fs.readFileSync(schemaPath, 'utf8'));
                }

                // Inject Columns with Surgical Precision
                const safeguards = [
                    { t: 'group_settings', c: 'welcome_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'calc_enabled', type: 'BOOLEAN DEFAULT TRUE' },
                    { t: 'group_settings', c: 'auditor_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'ai_brain_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'guardian_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'mc_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'show_decimals', type: 'BOOLEAN DEFAULT TRUE' },
                    { t: 'groups', c: 'last_seen', type: 'TIMESTAMPTZ DEFAULT NOW()' },
                    { t: 'groups', c: 'system_url', type: 'TEXT DEFAULT NULL' }
                ];

                for (const s of safeguards) {
                    await client.query(`ALTER TABLE ${s.t} ADD COLUMN IF NOT EXISTS ${s.c.split(' ')[0]} ${s.type.replace('DEFAULT ', '')}`);
                    // Ensure default is set for existing rows
                    await client.query(`UPDATE ${s.t} SET ${s.c.split(' ')[0]} = ${s.type.split('DEFAULT ')[1]} WHERE ${s.c.split(' ')[0]} IS NULL`);
                }

                console.log('✅ [Lily_Migration] SUCCESS: Features unlocked and database synchronized.');
                return true;
            } catch (err: any) {
                console.error(`⚠️ [Lily_Migration] FAILED: ${err.message}. Features might be locked.`);
                return false;
            } finally {
                if (client) client.release();
            }
        };

        // Execution Logic: Synchronous first attempt, background loop thereafter.
        const ok = await runMigrationOnce();
        if (!ok) {
            console.warn('🚀 [Lily_Mode] Proceeding in Limited Mode. Synchronization will continue in the background.');
            const interval = setInterval(async () => {
                if (await runMigrationOnce(true)) {
                    console.log('💎 [Lily_Mode] System fully synchronized. Upgrade to Full Mode complete.');
                    clearInterval(interval);
                }
            }, 30000);
        }
    },

    migrateGroup: async (oldId: string | number, newId: string | number) => {
        const client = await dbClient.connect();
        try {
            await client.query('BEGIN');
            const tables = ['group_settings', 'group_operators', 'group_admins', 'user_cache', 'transactions', 'historical_archives', 'mc_settings', 'mc_deals'];
            for (const t of tables) { try { await client.query(`DELETE FROM ${t} WHERE group_id = $1`, [newId]); } catch (e) { } }
            try { await client.query('DELETE FROM groups WHERE id = $1', [newId]); } catch (e) { }
            await client.query(`
                INSERT INTO groups (id, title, status, current_state, timezone, currency_symbol, license_key, license_expiry, created_at, last_seen, system_url)
                SELECT $2, title, status, current_state, timezone, currency_symbol, license_key, license_expiry, created_at, last_seen, system_url
                FROM groups WHERE id = $1
            `, [oldId, newId]);
            for (const t of tables) { try { await client.query(`UPDATE ${t} SET group_id = $2 WHERE group_id = $1`, [oldId, newId]); } catch (e) { } }
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
