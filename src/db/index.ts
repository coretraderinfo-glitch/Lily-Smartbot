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
        max: 30,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });
}

export const db = {
    query: (text: string, params?: any[]) => dbClient.query(text, params),
    getClient: () => dbClient.connect ? dbClient.connect() : dbClient.getClient(), // Handle Mock vs Pool

    // Auto-Migrate function
    migrate: async () => {
        if (isDefaultUrl) {
            return dbClient.migrate();
        }

        const client = await dbClient.connect();
        try {
            console.log('🔄 Running Database Migrations...');

            // 1. Ensure Base Schema
            const schemaPath = path.join(__dirname, 'schema.sql');
            if (fs.existsSync(schemaPath)) {
                const schemaSql = fs.readFileSync(schemaPath, 'utf8');
                await client.query(schemaSql);
                console.log('✅ Base Schema Synced.');
            }

            // 2. Run Enterprise Migrations (Step 2 logic)
            const migrationsDir = path.join(process.cwd(), 'db/migrations');
            if (fs.existsSync(migrationsDir)) {
                const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
                for (const file of files) {
                    console.log(`⏳ Applying Migration: ${file}...`);
                    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                    await client.query(sql);
                }
                console.log('✅ Enterprise Pipes Successfully Connected.');
            } else {
                console.warn('⚠️ Migrations directory not found. Running inline safeguards...');
            }

            // 3. INLINE SAFEGUARDS (Self-Healing)
            // Ensure 'welcome_enabled' exists even if file migration missed it
            // FIXED: Default is now FALSE (Quiet Mode) as per SIR's request
            await client.query(`
                DO $$ 
                BEGIN 
                    BEGIN
                        ALTER TABLE group_settings ADD COLUMN welcome_enabled BOOLEAN DEFAULT FALSE;
                    EXCEPTION
                        WHEN duplicate_column THEN NULL;
                    END;
                END $$;
            `);
            console.log('✅ Safeguard: welcome_enabled verified.');

            // Ensure 'calc_enabled' exists
            await client.query(`
                DO $$ 
                BEGIN 
                    BEGIN
                        ALTER TABLE group_settings ADD COLUMN calc_enabled BOOLEAN DEFAULT TRUE;
                    EXCEPTION
                        WHEN duplicate_column THEN NULL;
                    END;
                END $$;
            `);
            console.log('✅ Safeguard: calc_enabled verified.');

            // Ensure 'auditor_enabled' exists (Silent Auditor)
            await client.query(`
                DO $$ 
                BEGIN 
                    BEGIN
                        ALTER TABLE group_settings ADD COLUMN auditor_enabled BOOLEAN DEFAULT FALSE;
                    EXCEPTION
                        WHEN duplicate_column THEN NULL;
                    END;
                END $$;
            `);
            console.log('✅ Safeguard: auditor_enabled verified.');

            // WORLD-CLASS CLEANUP: Ensure no NULLs exist for toggles (Root Cause for "Ghost Toggles")
            await client.query(`
                DO $$ 
                BEGIN 
                    BEGIN
                        ALTER TABLE group_settings ADD COLUMN mc_enabled BOOLEAN DEFAULT FALSE;
                    EXCEPTION WHEN duplicate_column THEN NULL; END;
                END $$;
            `);

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
            console.log('✅ Safeguard: Settings Integrity Cleaned.');

            // ENSURE 'last_seen' exists in 'groups' (Critical for Dashboard Sync)
            await client.query(`
                DO $$ 
                BEGIN 
                    BEGIN
                        ALTER TABLE groups ADD COLUMN last_seen TIMESTAMPTZ DEFAULT NOW();
                    EXCEPTION
                        WHEN duplicate_column THEN NULL;
                    END;
                END $$;
            `);
            console.log('✅ Safeguard: groups.last_seen verified.');

            // ENSURE Fleet Tables Exist (Master Mode Recovery)
            await client.query(`
                CREATE TABLE IF NOT EXISTS fleet_nodes (
                    id SERIAL PRIMARY KEY,
                    client_name VARCHAR(100) NOT NULL,
                    server_endpoint VARCHAR(255),
                    status VARCHAR(20) DEFAULT 'ONLINE',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS node_groups (
                    node_id INT REFERENCES fleet_nodes(id),
                    group_id BIGINT REFERENCES groups(id),
                    assigned_at TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (node_id, group_id)
                );
            `);
            console.log('✅ Safeguard: Fleet Infrastructure verified.');

            // ENSURE Money Changer Tables Exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS mc_settings (
                    group_id BIGINT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
                    buy_rate NUMERIC(10, 4),
                    sell_rate NUMERIC(10, 4),
                    cash_rate NUMERIC(10, 4),
                    wallet_address TEXT DEFAULT 'TNV4YvE1M4XJq8Z5Y8XqX4YvE1M4XJq8Z5', 
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS mc_deals (
                    id SERIAL PRIMARY KEY,
                    group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
                    user_id BIGINT,
                    username TEXT,
                    type VARCHAR(10),
                    amount NUMERIC(20, 4),
                    rate NUMERIC(10, 4),
                    total_rm NUMERIC(20, 4),
                    txid TEXT UNIQUE,
                    status VARCHAR(20) DEFAULT 'PENDING',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            `);
            console.log('✅ Safeguard: Money Changer Infrastructure verified.');

            // Add new columns to fleet_nodes if missing
            await client.query(`
                DO $$
                BEGIN
                    BEGIN
                        ALTER TABLE fleet_nodes ADD COLUMN unlocked_features TEXT[] DEFAULT '{}';
                    EXCEPTION
                        WHEN duplicate_column THEN NULL;
                    END;
                    BEGIN
                        ALTER TABLE fleet_nodes ADD COLUMN group_limit INT DEFAULT 5;
                    EXCEPTION
                        WHEN duplicate_column THEN NULL;
                    END;
                END $$;
            `);

            // ENSURE Memory Core Tables Exist (Project Elephant)
            await client.query(`
                CREATE TABLE IF NOT EXISTS user_memories (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT,
                    type VARCHAR(50) DEFAULT 'DIRECTIVE',
                    content TEXT,
                    confidence FLOAT DEFAULT 1.0,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    context_group_id BIGINT
                );
                CREATE INDEX IF NOT EXISTS idx_mem_user ON user_memories(user_id);
            `);
            console.log('✅ Safeguard: Memory Core Infrastructure verified.');

            // 4. WORLD-CLASS CASCADE UPGRADE (The Root Cause Fix)
            // We force all child tables to use ON DELETE CASCADE to prevent foreign key violations.
            const fkUpgrade = `
                DO $$
                DECLARE
                    r RECORD;
                BEGIN
                    -- Drop and Recreate Foreign Keys with CASCADE for stability
                    -- group_settings
                    BEGIN ALTER TABLE group_settings DROP CONSTRAINT IF EXISTS group_settings_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE group_settings ADD CONSTRAINT group_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

                    -- transactions
                    BEGIN ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE transactions ADD CONSTRAINT transactions_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

                    -- group_operators
                    BEGIN ALTER TABLE group_operators DROP CONSTRAINT IF EXISTS group_operators_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE group_operators ADD CONSTRAINT group_operators_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

                    -- group_admins
                    BEGIN ALTER TABLE group_admins DROP CONSTRAINT IF EXISTS group_admins_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE group_admins ADD CONSTRAINT group_admins_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

                    -- historical_archives
                    BEGIN ALTER TABLE historical_archives DROP CONSTRAINT IF EXISTS historical_archives_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE historical_archives ADD CONSTRAINT historical_archives_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

                    -- Money Changer (mc_settings & mc_deals)
                    BEGIN ALTER TABLE mc_settings DROP CONSTRAINT IF EXISTS mc_settings_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE mc_settings ADD CONSTRAINT mc_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
                    
                    BEGIN ALTER TABLE mc_deals DROP CONSTRAINT IF EXISTS mc_deals_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE mc_deals ADD CONSTRAINT mc_deals_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

                    -- node_groups
                    BEGIN ALTER TABLE node_groups DROP CONSTRAINT IF EXISTS node_groups_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE node_groups ADD CONSTRAINT node_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

                    -- user_cache (Primary key is composite, but we check for any loose references)
                    -- licenses (used_by_group_id)
                    BEGIN ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_used_by_group_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
                    ALTER TABLE licenses ADD CONSTRAINT licenses_used_by_group_id_fkey FOREIGN KEY (used_by_group_id) REFERENCES groups(id) ON DELETE SET NULL;
                END $$;
            `;
            await client.query(fkUpgrade);
            console.log('💎 [Root Cause] Database Relational Integrity: CASCADE UPGRADED.');

        } catch (err) {
            console.error('❌ Migration Failed:', err);
            // Don't throw in production to keep app alive
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
