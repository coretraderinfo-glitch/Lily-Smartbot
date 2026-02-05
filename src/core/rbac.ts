import { db } from '../db';

/**
 * RBAC Manager - Handles operator permissions
 */

export const RBAC = {
    /**
     * Add Operator
     */
    async addOperator(chatId: number, userId: number, username: string, addedBy: number): Promise<string> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Check if already exists
            const existing = await client.query(`
                SELECT * FROM group_operators 
                WHERE group_id = $1 AND user_id = $2
            `, [chatId, userId]);

            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return `ℹ️ **@${username}** is already an operator.`;
            }

            // Add operator
            await client.query(`
                INSERT INTO group_operators (group_id, user_id, username, role, added_by)
                VALUES ($1, $2, $3, 'OPERATOR', $4)
            `, [chatId, userId, username, addedBy]);

            await client.query('COMMIT');
            return `✅ **Operator Added**\n@${username} can now manage transactions.`;

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    /**
     * Remove Operator
     */
    async removeOperator(chatId: number, userId: number, username: string): Promise<string> {
        const result = await db.query(`
            DELETE FROM group_operators 
            WHERE group_id = $1 AND user_id = $2
            RETURNING *
        `, [chatId, userId]);

        if (result.rows.length === 0) {
            return `ℹ️ **@${username}** was not an operator.`;
        }

        return `✅ **Operator Removed**\n@${username} can no longer manage transactions.`;
    },

    /**
     * List Operators
     */
    async listOperators(chatId: number): Promise<string> {
        const result = await db.query(`
            SELECT username, role, created_at 
            FROM group_operators 
            WHERE group_id = $1
            ORDER BY created_at ASC
        `, [chatId]);

        if (result.rows.length === 0) {
            return `ℹ️ **No Operators Set**\nUse "设置操作人 @username" to add operators.`;
        }

        let msg = `👥 **Authorized Operators** (${result.rows.length})\n\n`;
        result.rows.forEach((op, i) => {
            const icon = op.role === 'OWNER' ? '👑' : op.role === 'ADMIN' ? '⭐' : '✓';
            msg += `${i + 1}. ${icon} @${op.username}\n`;
        });

        return msg;
    },

    /**
     * Check if user is authorized
     */
    async isAuthorized(chatId: number, userId: number): Promise<boolean> {
        const result = await db.query(`
            SELECT * FROM group_operators 
            WHERE group_id = $1 AND user_id = $2
        `, [chatId, userId]);

        return result.rows.length > 0;
    }
};
