import { Pool, PoolClient, Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { MockDB } from './MockDB';

// Determine Mode
const dbUrl = process.env.DATABASE_URL || '';
const isDefaultUrl = !dbUrl || dbUrl.includes('host:5432') || dbUrl.includes('placeholder');
let dbClient: any;

/**
 * 💎 ELITE DUAL-MODE POOL ENGINE
 * Automatically handles Railway internal vs external SSL handshakes.
 */
const createPool = (forceSsl: boolean | null = null) => {
    if (isDefaultUrl) {
        console.warn('⚠️  DATABASE_URL is placeholder or missing. Using Safe Mode (MockDB).');
        return new MockDB();
    }

    // Determine SSL state (Force -> Internal Detection -> Default External)
    const isInternal = dbUrl.includes('railway.internal');
    const useSsl = forceSsl !== null ? forceSsl : (isInternal ? false : true);

    const config: any = {
        connectionString: dbUrl,
        max: 8,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 20000, // 20s Fail-Fast to trigger retries
        maxUses: 5000,
        keepAlive: true
    };

    if (useSsl) {
        config.ssl = { rejectUnauthorized: false };
    } else {
        config.ssl = false;
        // Strip ?sslmode=... from URL to prevent driver conflicts
        if (config.connectionString.includes('sslmode=')) {
            config.connectionString = config.connectionString.replace(/([?&])sslmode=[^&]+/, '');
        }
    }

    console.log(`🔌 [DB_HEART] Mode: ${useSsl ? 'SSL (Hardened)' : 'PLAIN (Internal)'} | Host: ${isInternal ? 'Internal' : 'External'}`);
    const pool = new Pool(config);

    pool.on('error', (err: any) => {
        console.error('🛑 [DB_POOL] Unexpected error:', err.message);
    });

    return pool;
};

dbClient = createPool();

/**
 * 🧠 ADVANCED RECOVERY WRAPPER
 */
async function reliableQuery(text: string, params?: any[], retryCount = 0): Promise<any> {
    try {
        return await dbClient.query(text, params);
    } catch (err: any) {
        const msg = err.message.toLowerCase();
        const isTransient = msg.includes('terminated') ||
            msg.includes('timeout') ||
            msg.includes('closed') ||
            msg.includes('econnreset') ||
            msg.includes('53300');

        if (isTransient && retryCount < 5) {
            const delay = 1000 * (retryCount + 1);
            console.warn(`⏳ [DB_LILY] Healing... Attempt ${retryCount + 1}/5 (${err.message})`);

            // EMERGENCY REFRESH: If we keep failing, try toggling SSL mode
            if (retryCount === 2 && !isDefaultUrl) {
                console.log('🔄 [DB_LILY] Exhausted strategy. Toggling SSL mode...');
                try {
                    const currentSsl = dbClient.options?.ssl !== false;
                    dbClient = createPool(!currentSsl);
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
     * �️ AUTONOMOUS MIGRATION ENGINE
     * Uses an independent, direct connection for schema updates to avoid pool congestion.
     */
    migrate: async () => {
        if (isDefaultUrl) return dbClient.migrate();

        const sync = async () => {
            let directClient;
            try {
                console.log('🔄 [Lily_Sync] Establishing direct line to DB...');

                // Use a dedicated client for migration to bypass pool limits
                directClient = new Client({
                    connectionString: dbUrl,
                    ssl: dbUrl.includes('railway.internal') ? false : { rejectUnauthorized: false },
                    connectionTimeoutMillis: 15000
                });

                await directClient.connect();
                await directClient.query('SET statement_timeout = 60000');
                await directClient.query('SELECT 1');

                const schemaPath = path.join(__dirname, 'schema.sql');
                if (fs.existsSync(schemaPath)) {
                    await directClient.query(fs.readFileSync(schemaPath, 'utf8'));
                }

                // Inject Columns
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
                    await directClient.query(`ALTER TABLE ${s.t} ADD COLUMN IF NOT EXISTS ${s.c.split(' ')[0]} ${s.type.replace('DEFAULT ', '')}`);
                    await directClient.query(`UPDATE ${s.t} SET ${s.c.split(' ')[0]} = ${s.type.split('DEFAULT ')[1]} WHERE ${s.c.split(' ')[0]} IS NULL`);
                }

                console.log('✅ [Lily_Sync] System synchronized. All features active.');
                return true;
            } catch (err: any) {
                console.error(`⚠️ [Lily_Sync] Connection failed: ${err.message}`);
                return false;
            } finally {
                if (directClient) await directClient.end();
            }
        };

        const success = await sync();
        if (!success) {
            const runner = setInterval(async () => {
                if (await sync()) clearInterval(runner);
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
