import { db } from '../db';
import { formatNumber } from '../utils/format';
import Decimal from 'decimal.js';

/**
 * Settings Manager - Handles all group configuration commands
 * FIXED: Uses UPSERT to auto-create settings rows
 */

export const Settings = {
    /**
     * Ensure group_settings row exists (Helper)
     */
    async ensureSettings(chatId: number): Promise<void> {
        await db.query(`
            INSERT INTO group_settings (group_id)
            VALUES ($1)
            ON CONFLICT (group_id) DO NOTHING
        `, [chatId]);
    },

    /**
     * Set Inbound Fee Rate
     */
    async setInboundRate(chatId: number, rate: number): Promise<string> {
        await Settings.ensureSettings(chatId);
        await db.query(`
            UPDATE group_settings 
            SET rate_in = $1, updated_at = NOW()
            WHERE group_id = $2
        `, [rate, chatId]);

        return `✅ **费率设置成功 (Inbound Fee Updated)**\n🔹 现行费率: ${rate}%`;
    },

    /**
     * Set Outbound Fee Rate
     */
    async setOutboundRate(chatId: number, rate: number): Promise<string> {
        await Settings.ensureSettings(chatId);
        await db.query(`
            UPDATE group_settings 
            SET rate_out = $1, updated_at = NOW()
            WHERE group_id = $2
        `, [rate, chatId]);

        return `✅ **下发费率设置成功 (Outbound Fee Updated)**\n🔸 现行费率: ${rate}%`;
    },

    /**
     * Set Forex Rate (Generic)
     */
    async setForexRate(chatId: number, currency: 'usd' | 'myr' | 'php' | 'thb', rate: number): Promise<string> {
        await Settings.ensureSettings(chatId);
        const column = `rate_${currency}`;
        const currencyName = {
            usd: 'USD (美元)',
            myr: 'MYR (马币)',
            php: 'PHP (比索)',
            thb: 'THB (泰铢)'
        }[currency];

        await db.query(`
            UPDATE group_settings 
            SET ${column} = $1, updated_at = NOW()
            WHERE group_id = $2
        `, [rate, chatId]);

        if (rate === 0) {
            return `ℹ️ **Currency Layout Updated**\n${currencyName} has been hidden from reports.`;
        }

        return `✅ **汇率同步成功 (Forex Synchronized)**\n💱 币种: ${currencyName}\n💹 汇率: ${formatNumber(rate, 2)}\n\n*账单数据已实时更新。*`;
    },

    /**
     * Set Display Mode
     */
    async setDisplayMode(chatId: number, mode: number): Promise<string> {
        await Settings.ensureSettings(chatId);
        const modeDesc = {
            1: 'Original (Full Detail)',
            2: 'Top 3 Transactions',
            3: 'Top 1 Transaction',
            4: 'Summary Only',
            5: 'Count Mode'
        }[mode] || 'Custom';

        await db.query(`
            UPDATE group_settings 
            SET display_mode = $1, updated_at = NOW()
            WHERE group_id = $2
        `, [mode, chatId]);

        return `✅ **Display Mode Updated**\nMode: ${modeDesc}`;
    },

    /**
     * Toggle Decimals
     */
    async setDecimals(chatId: number, show: boolean): Promise<string> {
        await Settings.ensureSettings(chatId);
        await db.query(`
            UPDATE group_settings 
            SET show_decimals = $1, updated_at = NOW()
            WHERE group_id = $2
        `, [show, chatId]);

        return show
            ? `✅ **显示设置 (Enabled)**\n📊 账单将显示所有小数位。`
            : `✅ **显示设置 (Disabled)**\n📊 账单将自动四舍五入。`;
    },

    /**
     * Get Current Settings
     */
    async getSettings(chatId: number): Promise<any> {
        await Settings.ensureSettings(chatId);
        const res = await db.query(`
            SELECT * FROM group_settings WHERE group_id = $1
        `, [chatId]);

        return res.rows[0] || {};
    }
};
