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
