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
    async activateGroup(chatId: number, key: string, groupTitle: string = 'Unnamed Group', activatorId: number, activatorName: string): Promise<{ success: boolean; message: string }> {
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

            // 3. Register/Update Group First (Satisfy Foreign Key Constraint)
            await client.query(`
                INSERT INTO groups (id, status, license_key, license_expiry, title)
                VALUES ($1, 'ACTIVE', $2, $3, $4)
                ON CONFLICT (id) DO UPDATE 
                SET status = 'ACTIVE', license_key = $2, license_expiry = $3, title = $4
            `, [chatId, key, expiry, groupTitle]);

            // 4. Link License to Group
            await client.query(`
                UPDATE licenses 
                SET is_used = TRUE, used_by_group_id = $1, activated_at = NOW(), expires_at = $2
                WHERE key = $3
            `, [chatId, expiry, key]);

            // 5. Ensure Settings Exist
            await client.query(`
                INSERT INTO group_settings (group_id) VALUES ($1) ON CONFLICT DO NOTHING
            `, [chatId]);

            // 🔥 CRITICAL FIX: Auto-add activator as first operator
            await client.query(`
                INSERT INTO group_operators (group_id, user_id, username, added_by)
                VALUES ($1, $2, $3, $2)
                ON CONFLICT (group_id, user_id) DO NOTHING
            `, [chatId, activatorId, activatorName]);

            await client.query('COMMIT');

            // Calculate days remaining for display
            const daysRemaining = license.duration_days;
            const expiryDate = expiry.toISOString().split('T')[0];

            return {
                success: true,
                message: `✨ **欢迎加入 Lily 智能账本系统！**\n**Welcome to Lily Smart Ledger!**\n\n🎉 您的服务已成功激活，祝您工作顺利，生意兴隆！\n(Your service is now active. Wishing you smooth operations and prosperous business!)\n\n📅 **授权期限 (License Period):** ${daysRemaining} 天 (Days)\n🗓️ **到期日期 (Expiry Date):** ${expiryDate}\n\n👤 **您已自动设为操作人 (Auto-added as Operator)**\n💼 现在您可以开始使用完整功能了！\n(You can now access all features!)`
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
