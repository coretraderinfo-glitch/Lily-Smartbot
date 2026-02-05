import { Job } from 'bullmq';
import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';

interface CommandJob {
    chatId: number;
    userId: number;
    username: string;
    text: string;
    messageId: number;
}

export const processCommand = async (job: Job<CommandJob>) => {
    const { chatId, userId, username, text, messageId } = job.data;
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Ensure Group Exists
        let groupRes = await client.query('SELECT * FROM groups WHERE id = $1', [chatId]);
        if (groupRes.rows.length === 0) {
            await client.query('INSERT INTO groups (id, title) VALUES ($1, $2)', [chatId, 'New Group']); // Title will update later
            await client.query('INSERT INTO group_settings (group_id) VALUES ($1)', [chatId]); // Defaults
            groupRes = await client.query('SELECT * FROM groups WHERE id = $1', [chatId]);
        }
        const group = groupRes.rows[0];

        // 2. State Check (Optimization: Cache this)
        const state = group.current_state;

        // 3. Command Regex Parsers
        // -------------------------

        // START (开始)
        if (text === '开始' || text.toLowerCase() === 'start') {
            await client.query('UPDATE groups SET current_state = $1 WHERE id = $2', ['RECORDING', chatId]);
            await client.query('COMMIT');
            return `✅ **Ledger Started** for ${getBusinessDate(group.timezone)}\nInput commands now.`;
        }

        // END (结束)
        if (text === '结束记录') {
            await client.query('UPDATE groups SET current_state = $1 WHERE id = $2', ['ENDED', chatId]);
            await client.query('COMMIT');
            return `🛑 **Ledger Ended**.\nNo more transactions allowed today.`;
        }

        // IF NOT RECORDING, IGNORE OTHERS
        if (state !== 'RECORDING' && !text.startsWith('设置')) { // Settings allowed anytime? Maybe.
            await client.query('ROLLBACK');
            return null; // Silent ignore or warning
        }

        // DEPOSIT (+1000)
        // Regex: ^\+(\d+(\.\d+)?)
        const depositMatch = text.match(/^\+(\d+(\.\d+)?)$/);
        if (depositMatch) {
            const amount = new Decimal(depositMatch[1]);

            // Get Rates
            const settingsRes = await client.query('SELECT rate_in FROM group_settings WHERE group_id = $1', [chatId]);
            const rateIn = new Decimal(settingsRes.rows[0].rate_in);

            // Calculate
            const fee = amount.mul(rateIn).div(100);
            const net = amount.sub(fee);

            // Insert
            const txId = randomUUID();
            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, 'DEPOSIT', $6, $7, $8, $9, 'CNY')
            `, [
                txId, chatId, userId, username,
                getBusinessDate(group.timezone),
                amount.toString(), rateIn.toString(), fee.toString(), net.toString()
            ]);

            await client.query('COMMIT');
            return `✅ **Deposit Recorded**\nAmount: ${amount}\nFee: ${fee}\nNet: ${net}`;
        }

        // PAYOUT (下发500)
        if (text.startsWith('下发')) {
            const valStr = text.replace('下发', '').trim();
            // Check for USDT 'u' suffix
            const isUsdt = valStr.toLowerCase().endsWith('u');
            const numStr = isUsdt ? valStr.slice(0, -1) : valStr;

            if (!isNaN(parseFloat(numStr))) {
                const amount = new Decimal(numStr);

                // TODO: Outbound Rates
                const settingsRes = await client.query('SELECT rate_out FROM group_settings WHERE group_id = $1', [chatId]);
                const rateOut = new Decimal(settingsRes.rows[0].rate_out);
                const fee = amount.mul(rateOut).div(100);
                const net = amount.sub(fee); // Or Add fee? Usually deducted from balance. User logic 01 says "Deduct from Group Balance"

                const currency = isUsdt ? 'USDT' : 'CNY';
                const txId = randomUUID();

                await client.query(`
                    INSERT INTO transactions 
                    (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                    VALUES ($1, $2, $3, $4, $5, 'PAYOUT', $6, $7, $8, $9, $10)
                `, [
                    txId, chatId, userId, username,
                    getBusinessDate(group.timezone),
                    amount.toString(), rateOut.toString(), fee.toString(), net.toString(), currency
                ]);

                await client.query('COMMIT');
                return `📤 **Payout Recorded**\nAmount: ${amount} ${currency}`;
            }
        }

        // SHOW BILL (显示账单)
        if (text === '显示账单') {
            const today = getBusinessDate(group.timezone);
            const txRes = await client.query(`
                SELECT * FROM transactions 
                WHERE group_id = $1 AND business_date = $2 
                ORDER BY recorded_at DESC 
                LIMIT 5
             `, [chatId, today]);

            const sumRes = await client.query(`
                SELECT 
                    SUM(CASE WHEN type='DEPOSIT' THEN net_amount ELSE 0 END) as total_in,
                    SUM(CASE WHEN type='PAYOUT' THEN net_amount ELSE 0 END) as total_out
                FROM transactions
                WHERE group_id = $1 AND business_date = $2
             `, [chatId, today]);

            const totalIn = sumRes.rows[0].total_in || 0;
            const totalOut = sumRes.rows[0].total_out || 0;

            let msg = `📅 **Bill for ${today}**\n\n`;
            txRes.rows.forEach(tx => {
                const icon = tx.type === 'DEPOSIT' ? '🟢' : '🔴';
                msg += `${icon} ${new Decimal(tx.amount_raw)} (${tx.operator_name})\n`;
            });

            msg += `\n💰 **In**: ${totalIn}\n📤 **Out**: ${totalOut}`;

            await client.query('COMMIT');
            return msg;
        }

        await client.query('COMMIT');
        return null; // Unknown command

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        throw e;
    } finally {
        client.release();
    }
};
