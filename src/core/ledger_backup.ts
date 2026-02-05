import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';

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
            const date = getBusinessDate(group.timezone); // Use utility

            await client.query('UPDATE groups SET current_state = $1 WHERE id = $2', ['RECORDING', chatId]);
            return `✅ **Ledger Started** for ${date}\nAll transactions are now being recorded.`;
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

            // 1. Get Settings
            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0];
            const groupRes = await client.query('SELECT timezone FROM groups WHERE id = $1', [chatId]);
            const timezone = groupRes.rows[0].timezone;

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
                // Payout syntax usually doesn't deduct fee from itself, it adds cost? 
                // Creating simplified logic: Fee is tracked but Net is what is sent.
                // Re-reading user requirement: "应下发" (Should Payout) = Net Inbound.
                // Payout reduces the "余" (Balance).
                // Let's stick to standard: Payout 500 = Balance - 500.
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

            if (type === 'DEPOSIT') {
                return `✅ **Deposit**: ${amount} (Fee: ${fee})`;
            } else {
                return `📤 **Payout**: ${amount} ${currency}`;
            }

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    /**
     * Generate The Master Bill (Template Engine)
     */
    async generateBill(chatId: number): Promise<string> {
        const client = await db.getClient();
        try {
            const groupRes = await client.query('SELECT timezone FROM groups WHERE id = $1', [chatId]);
            const timezone = groupRes.rows[0].timezone;
            const date = getBusinessDate(timezone);

            // 1. Fetch Data
            const txRes = await client.query(`
                SELECT * FROM transactions 
                WHERE group_id = $1 AND business_date = $2 
                ORDER BY recorded_at ASC
            `, [chatId, date]);

            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0];

            // 2. Aggregate
            const deposits = txRes.rows.filter(t => t.type === 'DEPOSIT');
            const payouts = txRes.rows.filter(t => t.type === 'PAYOUT');

            let totalInRaw = new Decimal(0);
            let totalInNet = new Decimal(0);
            let totalOut = new Decimal(0);

            const displayDeposits = deposits.slice(-5); // Last 5

            deposits.forEach(t => {
                totalInRaw = totalInRaw.add(new Decimal(t.amount_raw));
                totalInNet = totalInNet.add(new Decimal(t.net_amount));
            });
            payouts.forEach(t => {
                totalOut = totalOut.add(new Decimal(t.amount_raw)); // Payouts usually tracked by Raw amount sent
            });

            // 3. Calculations
            const balance = totalInNet.sub(totalOut);
            const rateUsd = new Decimal(settings.rate_usd || 0); // "USD汇率"

            // Helper: Convert to USD
            const toUsd = (cny: Decimal) => {
                if (rateUsd.isZero()) return '0';
                return cny.div(rateUsd).toFixed(2);
            };

            // 4. Render Template
            let msg = `📅 Date: ${date}\n\n`;

            msg += `入款（${deposits.length}笔）：\n`;
            displayDeposits.forEach(t => {
                const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false });
                msg += ` ${time}  ${new Decimal(t.amount_raw)}\n`;
            });
            if (deposits.length === 0) msg += ` (无)\n`;

            msg += `\n下发（${payouts.length}笔）：\n`;
            // Show last 3 payouts maybe?
            payouts.slice(-3).forEach(t => {
                const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false });
                msg += ` ${time}  ${new Decimal(t.amount_raw)}\n`;
            });
            if (payouts.length === 0) msg += ` (无)\n`;

            msg += `\n----------------\n`;
            msg += `总入款：${totalInRaw.toFixed(2)}\n`;
            msg += `费率：${settings.rate_in}%\n`;
            msg += `USD汇率：${rateUsd.toFixed(2)}\n`;

            // "应下发" (Should Payout) = Net Income available to be paid out
            msg += `应下发：${totalInNet.toFixed(2)}｜${toUsd(totalInNet)} USD\n`;

            msg += `总下发：${totalOut.toFixed(2)}｜${toUsd(totalOut)} USD\n`;

            msg += `余：${balance.toFixed(2)}｜${toUsd(balance)} USD\n`;

            return msg;
        } finally {
            client.release();
        }
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
            const timezone = groupRes.rows[0].timezone;
            const amount = new Decimal(amountStr);
            const txId = randomUUID();
            const date = getBusinessDate(timezone);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, 'RETURN', $6, 0, 0, $6, 'CNY')
            `, [txId, chatId, userId, username, date, amount.toString()]);

            await client.query('COMMIT');
            return `✅ **Return Recorded**: ${amount}`;

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
            const timezone = groupRes.rows[0].timezone;
            const date = getBusinessDate(timezone);

            const result = await client.query(`
                DELETE FROM transactions 
                WHERE group_id = $1 AND business_date = $2
            `, [chatId, date]);

            return `✅ **Data Cleared**\n${result.rowCount} transactions deleted for ${date}.`;
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
            const timezone = groupRes.rows[0].timezone;
            const date = getBusinessDate(timezone);

            const txRes = await client.query(`
                SELECT * FROM transactions 
                WHERE group_id = $1 AND business_date = $2 
                ORDER BY recorded_at ASC
            `, [chatId, date]);

            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0];
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
            const rateUsd = new Decimal(settings.rate_usd || 0);

            const format = (val: Decimal) => showDecimals ? val.toFixed(2) : val.toFixed(0);
            const toUsd = (cny: Decimal) => {
                if (rateUsd.isZero()) return '0';
                return showDecimals ? cny.div(rateUsd).toFixed(2) : cny.div(rateUsd).toFixed(0);
            };

            // Render based on mode
            let msg = '';

            if (displayMode === 4) {
                // Mode 4: Summary Only
                msg = `📅 Ledger Update\n`;
                msg += `Total In: ${format(totalInRaw)}\n`;
                msg += `Total Out: ${format(totalOut)}\n`;
                msg += `Balance: ${format(balance)}`;
            } else if (displayMode === 5) {
                // Mode 5: Count Mode (计数模式)
                msg = `📊 Transaction Count\n\n`;
                txRes.rows.forEach((t, i) => {
                    const sign = t.type === 'DEPOSIT' ? '+' : '-';
                    msg += `${i + 1}. ${sign}${format(new Decimal(t.amount_raw))}\n`;
                });
                msg += `\nTotal: ${format(balance)}`;
            } else {
                // Mode 1, 2, 3: Detailed (with varying item counts)
                const depositLimit = displayMode === 2 ? 3 : displayMode === 3 ? 1 : 5;
                const payoutLimit = displayMode === 2 ? 3 : displayMode === 3 ? 1 : 3;

                msg = `📅 Date: ${date}\n\n`;
                msg += `入款（${deposits.length}笔）：\n`;
                deposits.slice(-depositLimit).forEach(t => {
                    const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false });
                    msg += ` ${time}  ${format(new Decimal(t.amount_raw))}\n`;
                });
                if (deposits.length === 0) msg += ` (无)\n`;

                msg += `\n下发（${payouts.length}笔）：\n`;
                payouts.slice(-payoutLimit).forEach(t => {
                    const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false });
                    msg += ` ${time}  ${format(new Decimal(t.amount_raw))}\n`;
                });
                if (payouts.length === 0) msg += ` (无)\n`;

                msg += `\n----------------\n`;
                msg += `总入款：${format(totalInRaw)}\n`;
                msg += `费率：${settings.rate_in}%\n`;
                msg += `USD汇率：${format(rateUsd)}\n`;
                msg += `应下发：${format(totalInNet)}｜${toUsd(totalInNet)} USD\n`;
                msg += `总下发：${format(totalOut)}｜${toUsd(totalOut)} USD\n`;
                msg += `余：${format(balance)}｜${toUsd(balance)} USD\n`;
            }

            return msg;
        } finally {
            client.release();
        }
    }
};

