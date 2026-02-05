import { db } from '../db';
import { randomBytes } from 'crypto';

/**
 * The Vault: Handles License Generation and Activation
 */

export const Licensing = {
    /**
     * Generate a new License Key (Owner Only)
     */
    async generateKey(days: number, maxUsers: number = 100, createdBy: number): Promise<string> {
        const key = 'LILY-' + randomBytes(4).toString('hex').toUpperCase();

        await db.query(`
            INSERT INTO licenses (key, duration_days, max_users, created_by)
            VALUES ($1, $2, $3, $4)
        `, [key, days, maxUsers, createdBy]);

        return key;
    },

    /**
     * Activate a License for a Group
     */
    async activateGroup(chatId: number, key: string): Promise<{ success: boolean; message: string }> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // 1. Check Key Validity
            const keyRes = await client.query(`
                SELECT * FROM licenses 
                WHERE key = $1 AND is_used = FALSE
            `, [key]);

            if (keyRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, message: '❌ Invalid or Used Key.' };
            }

            const license = keyRes.rows[0];

            // 2. Calculate Dates
            const now = new Date();
            const expiry = new Date();
            expiry.setDate(now.getDate() + license.duration_days);

            // 3. Update License
            await client.query(`
                UPDATE licenses 
                SET is_used = TRUE, used_by_group_id = $1, activated_at = NOW(), expires_at = $2
                WHERE key = $3
            `, [chatId, expiry, key]);

            // 4. Update Group
            await client.query(`
                INSERT INTO groups (id, status, license_key, license_expiry)
                VALUES ($1, 'ACTIVE', $2, $3)
                ON CONFLICT (id) DO UPDATE 
                SET status = 'ACTIVE', license_key = $2, license_expiry = $3
            `, [chatId, key, expiry]);

            // 5. Ensure Settings Exist
            await client.query(`
                INSERT INTO group_settings (group_id) VALUES ($1) ON CONFLICT DO NOTHING
            `, [chatId]);

            await client.query('COMMIT');
            return {
                success: true,
                message: `✅ **Activation Successful!**\nExpiry: ${expiry.toISOString().split('T')[0]}\nDays: ${license.duration_days}`
            };

        } catch (e) {
            await client.query('ROLLBACK');
            console.error(e);
            return { success: false, message: '⚠️ System Error during activation.' };
        } finally {
            client.release();
        }
    },

    /**
     * Check if a group is allowed to operate
     * Returns TRUE if Active and Not Expired
     */
    async isGroupActive(chatId: number): Promise<boolean> {
        const res = await db.query(`
            SELECT status, license_expiry FROM groups WHERE id = $1
        `, [chatId]);

        if (res.rows.length === 0) return false;

        const group = res.rows[0];
        if (group.status !== 'ACTIVE') return false;

        // Expiry Check
        if (group.license_expiry && new Date() > new Date(group.license_expiry)) {
            // Auto-Expire
            await db.query(`UPDATE groups SET status = 'EXPIRED' WHERE id = $1`, [chatId]);
            return false;
        }

        return true;
    }
};
