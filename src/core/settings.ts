import { db } from '../db';
import Decimal from 'decimal.js';

/**
 * Settings Manager - Handles all group configuration commands
 */

export const Settings = {
    /**
     * Set Inbound Fee Rate
     */
    async setInboundRate(chatId: number, rate: number): Promise<string> {
        await db.query(`
            UPDATE group_settings 
            SET rate_in = $1, updated_at = NOW()
            WHERE group_id = $2
        `, [rate, chatId]);

        return `✅ **Inbound Fee Updated**\nNew Rate: ${rate}%`;
    },

    /**
     * Set Outbound Fee Rate
     */
    async setOutboundRate(chatId: number, rate: number): Promise<string> {
        await db.query(`
            UPDATE group_settings 
            SET rate_out = $1, updated_at = NOW()
            WHERE group_id = $2
        `, [rate, chatId]);

        return `✅ **Outbound Fee Updated**\nNew Rate: ${rate}%`;
    },

    /**
     * Set Forex Rate (Generic)
     */
    async setForexRate(chatId: number, currency: 'usd' | 'myr' | 'php' | 'thb', rate: number): Promise<string> {
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
            return `✅ **${currencyName} Hidden**\nRate set to 0 (will not display in bills)`;
        }

        return `✅ **${currencyName} Rate Updated**\nNew Rate: ${rate}`;
    },

    /**
     * Set Display Mode
     */
    async setDisplayMode(chatId: number, mode: number): Promise<string> {
        const modeDesc = {
            1: 'Original (Full Detail)',
            2: 'Top 3 Transactions',
            3: 'Top 1 Transaction',
            4: 'Summary Only'
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
        await db.query(`
            UPDATE group_settings 
            SET show_decimals = $1, updated_at = NOW()
            WHERE group_id = $2
        `, [show, chatId]);

        return show
            ? `✅ **Decimals Enabled**\nAmounts will show decimal places`
            : `✅ **Decimals Disabled**\nAmounts will be rounded`;
    },

    /**
     * Get Current Settings
     */
    async getSettings(chatId: number): Promise<any> {
        const res = await db.query(`
            SELECT * FROM group_settings WHERE group_id = $1
        `, [chatId]);

        return res.rows[0] || {};
    }
};
