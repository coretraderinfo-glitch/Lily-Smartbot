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
            const date = getBusinessDate(group.timezone);

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
        return await Ledger.generateBill(chatId);
    },

    /**
     * Add Transaction (Deposit/Payout)
     */
    async addTransaction(chatId: number, userId: number, username: string, type: 'DEPOSIT' | 'PAYOUT', amountStr: string, currency: string = 'CNY'): Promise<string> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0];
            const groupRes = await client.query('SELECT timezone FROM groups WHERE id = $1', [chatId]);
            const timezone = groupRes.rows[0].timezone;

            const amount = new Decimal(amountStr);
            let fee = new Decimal(0);
            let net = amount;
            let rate = new Decimal(0);

            if (type === 'DEPOSIT') {
                rate = new Decimal(settings.rate_in || 0);
                fee = amount.mul(rate).div(100);
                net = amount.sub(fee);
            } else if (type === 'PAYOUT') {
                rate = new Decimal(settings.rate_out || 0);
                fee = amount.mul(rate).div(100);
            }

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
     * Generate The Master Bill (CLEAR FORMAT)
     */
    async generateBill(chatId: number): Promise<string> {
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

            const deposits = txRes.rows.filter(t => t.type === 'DEPOSIT');
            const payouts = txRes.rows.filter(t => t.type === 'PAYOUT');

            let totalInRaw = new Decimal(0);
            let totalInNet = new Decimal(0);
            let totalOut = new Decimal(0);

            deposits.forEach(t => {
                totalInRaw = totalInRaw.add(new Decimal(t.amount_raw));
                totalInNet = totalInNet.add(new Decimal(t.net_amount));
            });
            payouts.forEach(t => {
                totalOut = totalOut.add(new Decimal(t.amount_raw));
            });

            const totalFee = totalInRaw.sub(totalInNet);
            const balance = totalInNet.sub(totalOut);
            const rateUsd = new Decimal(settings.rate_usd || 0);

            const toUsd = (cny: Decimal) => {
                if (rateUsd.isZero()) return '0';
                return cny.div(rateUsd).toFixed(2);
            };

            // CLEAR CALCULATION FORMAT
            let msg = `📅 ${date}\n\n`;

            msg += `入款（${deposits.length}笔）：\n`;
            deposits.slice(-5).forEach(t => {
                const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false });
                msg += ` ${time}  ${new Decimal(t.amount_raw).toFixed(2)}\n`;
            });
            if (deposits.length === 0) msg += ` (无)\n`;

            msg += `\n下发（${payouts.length}笔）：\n`;
            payouts.slice(-3).forEach(t => {
                const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false });
                msg += ` ${time}  ${new Decimal(t.amount_raw).toFixed(2)}\n`;
            });
            if (payouts.length === 0) msg += ` (无)\n`;

            msg += `\n━━━━━━━━━━━━━━━━\n`;
            msg += `💰 入款总计：${totalInRaw.toFixed(2)}\n`;
            msg += `📊 费率：${settings.rate_in}%\n`;
            msg += `💸 手续费：-${totalFee.toFixed(2)}\n`;
            msg += `✅ 净入款：${totalInNet.toFixed(2)}\n`;
            msg += `\n`;
            msg += `📤 下发总计：${totalOut.toFixed(2)}\n`;
            msg += `\n`;
            msg += `━━━━━━━━━━━━━━━━\n`;
            msg += `💎 余额：${balance.toFixed(2)}\n`;

            if (!rateUsd.isZero()) {
                msg += `💵 USD汇率：${rateUsd.toFixed(2)}\n`;
                msg += `💵 USD余额：${toUsd(balance)} USD\n`;
            }

            return msg;
        } finally {
            client.release();
        }
    },

    // ... (rest of methods: addCorrection, addReturn, clearToday, generateBillWithMode)
};
