import { Pool, PoolClient, Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { MockDB } from './MockDB';

// Determine Mode
const dbUrl = process.env.DATABASE_URL || '';
const isDefaultUrl = !dbUrl || dbUrl.includes('host:5432') || dbUrl.includes('placeholder');
let dbClient: any;

/**
 * �️ HYPER-RESILIENT INFRASTRUCTURE ENGINE
 * Engineered for Railway's Shared Environments.
 */
const createPool = () => {
    if (isDefaultUrl) {
        console.warn('⚠️  DATABASE_URL is placeholder or missing. Using Safe Mode (MockDB).');
        return new MockDB();
    }

    // 1. URL PURIFICATION (REMOVING NOISE)
    const cleanBaseUrl = dbUrl.split('?')[0];
    const isInternal = dbUrl.includes('railway.internal');

    // 2. CONSERVATIVE RESOURCE ALLOCATION (Avoiding "Too many connections")
    const config: any = {
        connectionString: cleanBaseUrl,
        max: 5, // SURGICAL LIMIT: Ensure management UI still has slots
        min: 1, // Keep 1 alive for speed
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000, // FAST FAIL: Detect dead/hung DB instantly
        maxUses: 1000, // Lifecycle management
        keepAlive: true,
        ssl: !isInternal ? { rejectUnauthorized: false } : false
    };

    console.log(`🔌 [AUDIT] Mode: ${isInternal ? 'INTERNAL' : 'EXTERNAL'} | Cap: 5 | SSL: ${!isInternal}`);
    const pool = new Pool(config);

    pool.on('error', (err: any) => {
        console.error('🛑 [AUDIT_DB] Pool Heartbeat Failure:', err.message);
    });

    return pool;
};

dbClient = createPool();

/**
 * 🧠 INTELLIGENT RECOVERY UNIT
 */
async function reliableQuery(text: string, params?: any[], retryCount = 0): Promise<any> {
    try {
        return await dbClient.query(text, params);
    } catch (err: any) {
        const msg = err.message.toLowerCase();
        const isTransient = msg.includes('terminated') ||
            msg.includes('timeout') ||
            msg.includes('closed') ||
            msg.includes('connection') ||
            msg.includes('econnreset') ||
            msg.includes('53300') ||
            msg.includes('handshake');

        if (isTransient && retryCount < 4) {
            const delay = 1000 * (retryCount + 1);
            console.warn(`⏳ [HEAL] Attempt ${retryCount + 1}/4: ${err.message}`);

            // EMERGENCY REFRESH (COLD START)
            if (retryCount === 2) {
                console.log('🔄 [HEAL] Cold Refreshing Pool to purge zombie connections...');
                try {
                    const oldPool = dbClient;
                    dbClient = createPool();
                    setTimeout(() => oldPool.end().catch(() => { }), 2000);
                } catch (e) { }
            }

            await new Promise(resolve => setTimeout(resolve, delay));
            return reliableQuery(text, params, retryCount + 1);
        }

        console.error(`❌ [AUDIT_FATAL] Query definitively failed: ${err.message}`);
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
     * 🛡️ WORLD CLASS SURVIVAL SYNCHRONIZATION
     * Independent of the main pool to ensure feature activation.
     */
    migrate: async () => {
        if (isDefaultUrl) return dbClient.migrate();

        const sync = async () => {
            let directClient;
            try {
                console.log('🔄 [Lily_Core] Core synchronization pulse starting...');

                directClient = new Client({
                    connectionString: dbUrl.split('?')[0],
                    ssl: dbUrl.includes('railway.internal') ? false : { rejectUnauthorized: false },
                    connectionTimeoutMillis: 10000
                });

                await directClient.connect();
                await directClient.query('SET statement_timeout = 30000');

                // Schema injection
                const schemaPath = path.join(__dirname, 'schema.sql');
                if (fs.existsSync(schemaPath)) {
                    await directClient.query(fs.readFileSync(schemaPath, 'utf8'));
                }

                // Inject Core Memories Table
                await directClient.query(`
                    CREATE TABLE IF NOT EXISTS user_memories (
                        id SERIAL PRIMARY KEY,
                        user_id BIGINT,
                        type VARCHAR(50),
                        content TEXT,
                        confidence DECIMAL(3, 2),
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    );
                    CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories (user_id);
                `);

                // Inject Columns (Atomic Safeguards)
                const columns = [
                    { t: 'group_settings', c: 'welcome_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'calc_enabled', type: 'BOOLEAN DEFAULT TRUE' },
                    { t: 'group_settings', c: 'auditor_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'ai_brain_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'guardian_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'mc_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'calctape_enabled', type: 'BOOLEAN DEFAULT FALSE' },
                    { t: 'group_settings', c: 'show_decimals', type: 'BOOLEAN DEFAULT TRUE' },
                    { t: 'groups', c: 'last_seen', type: 'TIMESTAMPTZ DEFAULT NOW()' }
                ];

                for (const col of columns) {
                    await directClient.query(`
                        DO $$ 
                        BEGIN 
                            BEGIN
                                ALTER TABLE ${col.t} ADD COLUMN ${col.c} ${col.type};
                            EXCEPTION WHEN duplicate_column THEN NULL; END;
                        END $$;
                    `);
                    // Force default for existing data
                    await directClient.query(`UPDATE ${col.t} SET ${col.c} = ${col.type.split('DEFAULT ')[1]} WHERE ${col.c} IS NULL`);
                }

                // MIGRATION PATCH: Scheduled Announcements Table (v2.1)
                await directClient.query(`
                    CREATE TABLE IF NOT EXISTS scheduled_announcements (
                        id SERIAL PRIMARY KEY,
                        group_ids BIGINT[],
                        content TEXT NOT NULL,
                        scheduled_at TIMESTAMPTZ NOT NULL,
                        created_by BIGINT NOT NULL,
                        status VARCHAR(20) DEFAULT 'PENDING',
                        error_log TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    );
                    CREATE INDEX IF NOT EXISTS idx_scheduled_announcements_time ON scheduled_announcements (scheduled_at, status);
                `);

                console.log('✅ [Lily_Core] PULSE SUCCESS: All metadata synchronized.');
                return true;
            } catch (err: any) {
                console.warn(`⚠️ [Lily_Core] Pulse failed: ${err.message}. Lily is in survival mode.`);
                return false;
            } finally {
                if (directClient) await directClient.end();
            }
        };

        const ok = await sync();
        if (!ok) {
            const watcher = setInterval(async () => {
                if (await sync()) clearInterval(watcher);
            }, 60000); // Check once a minute
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
                INSERT INTO groups (id, title, status, current_state, timezone, currency_symbol, license_key, license_expiry, created_at, last_seen)
                SELECT $2, title, status, current_state, timezone, currency_symbol, license_key, license_expiry, created_at, last_seen
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
