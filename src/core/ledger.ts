import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import { Settings } from './settings';

/**
 * The Ledger: Core Financial Engine
 */

export const Ledger = {

    /**
     * Start the Day
     */
    async startDay(chatId: number): Promise<string> {
        const client = await db.getClient();
        try {
            const groupRes = await client.query('SELECT * FROM groups WHERE id = $1', [chatId]);
            const group = groupRes.rows[0];
            if (!group) {
                await db.query('INSERT INTO groups (id, title) VALUES ($1, $2)', [chatId, 'Group ' + chatId]);
            }
            await client.query('UPDATE groups SET current_state = $1 WHERE id = $2', ['RECORDING', chatId]);
            return await Ledger.generateBill(chatId);
        } finally {
            client.release();
        }
    },

    /**
     * Stop the Day
     */
    async stopDay(chatId: number): Promise<string> {
        await db.query('UPDATE groups SET current_state = $1 WHERE id = $2', ['ENDED', chatId]);
        return await Ledger.generateBill(chatId); // Auto-show bill on stop
    },

    /**
     * Add Transaction (Deposit/Payout)
     */
    async addTransaction(chatId: number, userId: number, username: string, type: 'DEPOSIT' | 'PAYOUT', amountStr: string, currency: string = 'CNY'): Promise<string> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // 1. Ensure Settings Exist
            await Settings.ensureSettings(chatId);

            // 2. Get Settings
            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0];
            const groupRes = await client.query('SELECT timezone FROM groups WHERE id = $1', [chatId]);
            const timezone = groupRes.rows[0]?.timezone || 'Asia/Shanghai';

            const amount = new Decimal(amountStr);
            let fee = new Decimal(0);
            let net = amount;
            let rate = new Decimal(0);

            // 2. Calculate Fee
            if (type === 'DEPOSIT') {
                rate = new Decimal(settings.rate_in || 0);
                fee = amount.mul(rate).div(100);
                net = amount.sub(fee);
            } else if (type === 'PAYOUT') {
                rate = new Decimal(settings.rate_out || 0);
                fee = amount.mul(rate).div(100);
            }

            // 3. Insert
            const txId = randomUUID();
            const date = getBusinessDate(timezone);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                txId, chatId, userId, username, date,
                type, amount.toString(), rate.toString(), fee.toString(), net.toString(), currency
            ]);

            await client.query('COMMIT');

            // Return full bill instead of simple confirmation
            return await Ledger.generateBill(chatId);

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    /**
     * Generate The Master Bill (CLEAR FORMAT)
     */
    async generateBill(chatId: number): Promise<string> {
        return await Ledger.generateBillWithMode(chatId, 1);
    },

    /**
     * Add Correction (Void/Negative Entry)
     * 入款-XXX or 下发-XXX
     */
    async addCorrection(chatId: number, userId: number, username: string, type: 'DEPOSIT' | 'PAYOUT', amountStr: string): Promise<string> {
        // Corrections are negative amounts
        const negativeAmount = `-${amountStr}`;
        return await Ledger.addTransaction(chatId, userId, username, type, negativeAmount);
    },

    /**
     * Add Return Transaction
     * 回款XXX
     */
    async addReturn(chatId: number, userId: number, username: string, amountStr: string): Promise<string> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const groupRes = await client.query('SELECT timezone FROM groups WHERE id = $1', [chatId]);
            const timezone = groupRes.rows[0]?.timezone || 'Asia/Shanghai';
            const amount = new Decimal(amountStr);
            const txId = randomUUID();
            const date = getBusinessDate(timezone);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, 'RETURN', $6, 0, 0, $6, 'CNY')
            `, [txId, chatId, userId, username, date, amount.toString()]);

            await client.query('COMMIT');

            // Return full bill instead of simple confirmation
            return await Ledger.generateBill(chatId);

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    /**
     * Clear Today's Data
     */
    async clearToday(chatId: number): Promise<string> {
        const client = await db.getClient();
        try {
            const groupRes = await client.query('SELECT timezone FROM groups WHERE id = $1', [chatId]);
            const timezone = groupRes.rows[0]?.timezone || 'Asia/Shanghai';
            const date = getBusinessDate(timezone);

            await client.query(`
                DELETE FROM transactions 
                WHERE group_id = $1 AND business_date = $2
            `, [chatId, date]);

            return await Ledger.generateBill(chatId);
        } finally {
            client.release();
        }
    },

    /**
     * Generate Bill with Display Mode Support
     */
    async generateBillWithMode(chatId: number, mode?: number): Promise<string> {
        const client = await db.getClient();
        try {
            const groupRes = await client.query('SELECT timezone FROM groups WHERE id = $1', [chatId]);
            const timezone = groupRes.rows[0]?.timezone || 'Asia/Shanghai';
            const date = getBusinessDate(timezone);

            // Ensure settings exist
            await Settings.ensureSettings(chatId);

            const txRes = await client.query(`
                SELECT * FROM transactions 
                WHERE group_id = $1 AND business_date = $2 
                ORDER BY recorded_at ASC
            `, [chatId, date]);

            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0] || { rate_in: 0, rate_out: 0, display_mode: 1, show_decimals: true };
            const displayMode = mode || settings.display_mode || 1;
            const showDecimals = settings.show_decimals !== false;

            // Aggregate
            const deposits = txRes.rows.filter(t => t.type === 'DEPOSIT');
            const payouts = txRes.rows.filter(t => t.type === 'PAYOUT');
            const returns = txRes.rows.filter(t => t.type === 'RETURN');

            let totalInRaw = new Decimal(0);
            let totalInNet = new Decimal(0);
            let totalOut = new Decimal(0);
            let totalReturn = new Decimal(0);

            deposits.forEach(t => {
                totalInRaw = totalInRaw.add(new Decimal(t.amount_raw));
                totalInNet = totalInNet.add(new Decimal(t.net_amount));
            });
            payouts.forEach(t => {
                totalOut = totalOut.add(new Decimal(t.amount_raw));
            });
            returns.forEach(t => {
                totalReturn = totalReturn.add(new Decimal(t.amount_raw));
            });

            const balance = totalInNet.sub(totalOut).add(totalReturn);
            const format = (val: Decimal) => showDecimals ? val.toFixed(2) : val.toFixed(0);

            // Render based on mode
            let msg = '';

            if (displayMode === 4) {
                // Mode 4: Summary Only
                msg = `📅 Ledger Update\n`;
                msg += `Total In: ${format(totalInRaw)}\n`;
                msg += `Total Out: ${format(totalOut)}\n`;
                msg += `Balance: ${format(balance)}`;
            } else if (displayMode === 5) {
                // Mode 5: Count Mode
                msg = `📊 Transaction Count\n\n`;
                txRes.rows.forEach((t, i) => {
                    const sign = t.type === 'DEPOSIT' ? '+' : '-';
                    msg += `${i + 1}. ${sign}${format(new Decimal(t.amount_raw))}\n`;
                });
                msg += `\nTotal: ${format(balance)}`;
            } else {
                const depositLimit = displayMode === 2 ? 3 : displayMode === 3 ? 1 : 1000;
                const payoutLimit = displayMode === 2 ? 3 : displayMode === 3 ? 1 : 1000;

                msg = `📅 ${date}\n\n`;

                const displayDeposits = deposits.slice(-depositLimit);
                const displayPayouts = payouts.slice(-payoutLimit);

                msg += `入款（${deposits.length}笔）：\n`;
                displayDeposits.forEach(t => {
                    const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: timezone });
                    msg += ` ${time}  ${format(new Decimal(t.amount_raw))}\n`;
                });
                if (deposits.length === 0) msg += ` (无)\n`;

                msg += `\n下发（${payouts.length}笔）：\n`;
                displayPayouts.forEach(t => {
                    const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: timezone });
                    msg += ` ${time}  ${format(new Decimal(t.amount_raw))}\n`;
                });
                if (payouts.length === 0) msg += ` (无)\n`;

                // SUMMARY BLOCK (Match Photo Guideline)
                msg += `━━━━━━━━━━━━━━━━\n`;
                msg += `💰 总入款： ${format(totalInRaw)}\n`;
                msg += `📊 费率： ${settings.rate_in || 0}%\n`;

                // Forex Selection
                let forexRate = new Decimal(0);
                let suffix = 'USD';
                let rateLabel = 'USD汇率';

                if (new Decimal(settings.rate_usd || 0).gt(0)) {
                    forexRate = new Decimal(settings.rate_usd);
                    suffix = 'USD';
                    rateLabel = 'USD汇率';
                } else if (new Decimal(settings.rate_myr || 0).gt(0)) {
                    forexRate = new Decimal(settings.rate_myr);
                    suffix = 'MYR';
                    rateLabel = 'MYR汇率';
                } else if (new Decimal(settings.rate_php || 0).gt(0)) {
                    forexRate = new Decimal(settings.rate_php);
                    suffix = 'PHP';
                    rateLabel = 'PHP汇率';
                } else if (new Decimal(settings.rate_thb || 0).gt(0)) {
                    forexRate = new Decimal(settings.rate_thb);
                    suffix = 'THB';
                    rateLabel = '泰铢汇率';
                }

                const conv = (val: Decimal) => {
                    if (forexRate.isZero()) return '0';
                    return val.div(forexRate).toFixed(showDecimals ? 2 : 0);
                };

                if (!forexRate.isZero()) {
                    msg += `💵 ${rateLabel}： ${forexRate.toFixed(2)}\n`;
                    msg += `📥 应下发： ${format(totalInNet)} | ${conv(totalInNet)} ${suffix}\n`;
                    msg += `📤 总下发： ${format(totalOut)} | ${conv(totalOut)} ${suffix}\n`;
                    msg += `💎 余： ${format(balance)} | ${conv(balance)} ${suffix}\n`;
                } else {
                    msg += `✅ 净入款： ${format(totalInNet)}\n`;
                    msg += `📤 总下发： ${format(totalOut)}\n`;
                    msg += `💎 余： ${format(balance)}\n`;
                }
            }

            return msg;
        } finally {
            client.release();
        }
    }
};
