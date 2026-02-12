import { Pool, PoolClient } from 'pg';
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
    // Extract info for logging
    const dbMatch = dbUrl.match(/@([^/]+)\/(.+)$/);
    const dbHost = dbMatch ? dbMatch[1] : 'External';

    console.log(`🔌 [DB] Initializing Resilient Pool for: ${dbHost}`);

    // STANDARD PRODUCTION CONFIGURATION (Stable)
    dbClient = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
        keepAlive: true // CRITICAL: Keeps TCP stream active
    });

    // Pool Level Error Handling (Prevents Crashes)
    dbClient.on('error', (err: any) => {
        console.error('🛑 [DB_FATAL] Unexpected pool error:', err.message);
    });
}

/**
 * World-Class Reliable Query Wrapper
 * Retries on temporary connection blips
 */
async function reliableQuery(text: string, params?: any[], retryCount = 0): Promise<any> {
    try {
        return await dbClient.query(text, params);
    } catch (err: any) {
        const isTransient = err.message.includes('terminated') ||
            err.message.includes('timeout') ||
            err.message.includes('closed') ||
            err.message.includes('ECONNRESET');

        if (isTransient && retryCount < 3) {
            const delay = Math.pow(2, retryCount) * 1000;
            console.warn(`⏳ [DB_RECOVERY] Connection blip detected. Retrying in ${delay}ms... (Attempt ${retryCount + 1}/3)`);
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

    // Auto-Migrate function (NON-BLOCKING / SOFT FAIL)
    migrate: async () => {
        if (isDefaultUrl) {
            return dbClient.migrate();
        }

        let client;
        try {
            console.log('🔄 [Migration] Handshaking with Database...');

            // Attempt Connection
            client = await dbClient.connect();

            console.log('🔄 [Migration] Running Security & Feature Safeguards...');

            // Extended timeout for migrations
            await client.query('SET statement_timeout = 60000');

            // 1. Ensure Base Schema (schema.sql contains the core tables)
            const schemaPath = path.join(__dirname, 'schema.sql');
            if (fs.existsSync(schemaPath)) {
                const schemaSql = fs.readFileSync(schemaPath, 'utf8');
                await client.query(schemaSql);
            }

            // 2. SELF-HEALING COLUMN INJECTION (Ultra-Resilient)
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

            // 3. RELATIONAL INTEGRITY (CASCADE UPGRADE)
            // This is critical for the 'Purge' and 'Delete' features to work without errors.
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

            // 4. NULL COALESCE (Prevents Logic Errors)
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

            console.log('✅ [DB_HEAL] Pipeline Synced and Hardened.');

        } catch (err: any) {
            console.warn('⚠️ [Migration_Warn] Handshake failed, skipping deep checks:', err.message);
            // DO NOT THROW. Allow bot to start in "Limited Mode".
        } finally {
            if (client) client.release();
        }
    },

    // Supergroup Migration Support (Resilient)
    migrateGroup: async (oldId: string | number, newId: string | number) => {
        const client = await dbClient.connect();
        try {
            await client.query('BEGIN');
            console.log(`🔄 [Migration] Moving Identity: ${oldId} -> ${newId}`);

            const tables = ['group_settings', 'group_operators', 'group_admins', 'user_cache', 'transactions', 'historical_archives', 'mc_settings', 'mc_deals'];

            // 1. Purge potentially conflicting 'new' shell
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
            console.log(`✅ [Migration] Identity Shift Complete.`);
        } catch (e) {
            await client.query('ROLLBACK');
            console.error(`❌ [Migration] Identity Shift Failed:`, e);
            throw e;
        } finally {
            client.release();
        }
    }
};
