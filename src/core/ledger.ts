import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
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
            return `🥂 **系统已开启 (News day started!)**\n\n数据录入已激活，请开始您的操作。\n\n${await Ledger.generateBill(chatId)}`;
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
            const groupRes = await client.query('SELECT timezone, reset_hour, currency_symbol FROM groups WHERE id = $1', [chatId]);
            const group = groupRes.rows[0];
            const timezone = group?.timezone || 'Asia/Shanghai';
            const resetHour = group?.reset_hour || 4;
            const baseSymbol = group?.currency_symbol || 'CNY';

            // Use group default if currency is not explicitly provided (e.g. for +100)
            const activeCurrency = currency === 'CNY' ? baseSymbol : currency;

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
            const date = getBusinessDate(timezone, resetHour);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                txId, chatId, userId, username, date,
                type, amount.toString(), rate.toString(), fee.toString(), net.toString(), activeCurrency
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

            const groupRes = await client.query('SELECT timezone, reset_hour, currency_symbol FROM groups WHERE id = $1', [chatId]);
            const group = groupRes.rows[0];
            const timezone = group?.timezone || 'Asia/Shanghai';
            const resetHour = group?.reset_hour || 4;
            const currency = group?.currency_symbol || 'CNY';

            const amount = new Decimal(amountStr);
            const txId = randomUUID();
            const date = getBusinessDate(timezone, resetHour);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, 'RETURN', $6, 0, 0, $6, $7)
            `, [txId, chatId, userId, username, date, amount.toString(), currency]);

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
            await client.query('BEGIN');

            const groupRes = await client.query('SELECT timezone, reset_hour FROM groups WHERE id = $1', [chatId]);
            const timezone = groupRes.rows[0]?.timezone || 'Asia/Shanghai';
            const resetHour = groupRes.rows[0]?.reset_hour || 4;
            const date = getBusinessDate(timezone, resetHour);

            // 1. Snapshot the data before wiping
            const txRes = await client.query(`
                SELECT * FROM transactions 
                WHERE group_id = $1 AND business_date = $2
            `, [chatId, date]);

            if (txRes.rows.length > 0) {
                // 2. Move to The Archive (Vault)
                await client.query(`
                    INSERT INTO historical_archives (group_id, business_date, type, data_json)
                    VALUES ($1, $2, 'TRANSACTION_WIPE', $3)
                `, [chatId, date, JSON.stringify(txRes.rows)]);

                // 3. Clear from active ledger
                await client.query(`
                    DELETE FROM transactions 
                    WHERE group_id = $1 AND business_date = $2
                `, [chatId, date]);
            }

            await client.query('COMMIT');
            return await Ledger.generateBill(chatId);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
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
            const groupRes = await client.query('SELECT timezone, reset_hour FROM groups WHERE id = $1', [chatId]);
            const timezone = groupRes.rows[0]?.timezone || 'Asia/Shanghai';
            const resetHour = groupRes.rows[0]?.reset_hour || 4;
            const date = getBusinessDate(timezone, resetHour);

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
            const format = (val: Decimal) => formatNumber(val, showDecimals ? 2 : 0);

            // 🛠️ ALIGNMENT HELPER: Right-align numbers using spaces and monospaced font
            const padAmount = (val: Decimal, width: number = 10) => {
                const f = format(val);
                return `\`${f.padStart(width, ' ')}\\u2007\``; // Using figure space for better alignment
            };

            // Render based on mode
            let msg = '';

            if (displayMode === 4) {
                // Mode 4: Summary Only
                msg = `📅 **Ledger Update**\n`;
                msg += `总入款 (IN): \`${format(totalInRaw)}\`\n`;
                msg += `总下发 (OUT): \`-${format(totalOut)}\`\n`;
                msg += `余额 (TOTAL): \`${format(balance)}\``;
            } else if (displayMode === 5) {
                // Mode 5: Count Mode
                msg = `**Transaction Count**\n\n`;
                txRes.rows.forEach((t, i) => {
                    const sign = t.type === 'DEPOSIT' ? '➕' : '➖';
                    msg += `${i + 1}. ${sign} \`${format(new Decimal(t.amount_raw))}\`\n`;
                });
                msg += `\n余额 (TOTAL): \`${format(balance)}\``;
            } else {
                // DEFAULT / MODE 1: Show latest 5 for conciseness
                const depositLimit = displayMode === 2 ? 3 : displayMode === 3 ? 1 : 5;
                const payoutLimit = displayMode === 2 ? 3 : displayMode === 3 ? 1 : 5;

                const [y, m, d_part] = date.split('-');
                const displayDate = `${d_part}-${m}-${y}`;

                msg = `📅 **${displayDate}**\n\n`;

                const displayDeposits = deposits.slice(-depositLimit);
                const displayPayouts = payouts.slice(-payoutLimit);

                // Calculate max width for padding
                const allListAmounts = [...displayDeposits, ...displayPayouts].map(t => format(new Decimal(t.amount_raw)).length);
                const maxWidth = Math.max(...allListAmounts, 10);

                msg += `📥 **入款 (IN)** （${deposits.length}笔）：\n`;
                displayDeposits.forEach(t => {
                    const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: timezone });
                    const amt = format(new Decimal(t.amount_raw));
                    msg += ` \`${time}\`  \`${amt.padStart(maxWidth, ' ')}\`\n`;
                });
                if (deposits.length === 0) msg += ` (无)\n`;

                msg += `\n📤 **下发 (OUT)** （${payouts.length}笔）：\n`;
                displayPayouts.forEach(t => {
                    const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: timezone });
                    const amt = `-${format(new Decimal(t.amount_raw))}`;
                    msg += ` \`${time}\`  \`${amt.padStart(maxWidth + 1, ' ')}\`\n`;
                });
                if (payouts.length === 0) msg += ` (无)\n`;

                // SUMMARY BLOCK (Professional Alignment)
                const summaryWidth = Math.max(format(totalInRaw).length, format(totalInNet).length, format(totalOut).length, format(balance).length, 12);

                msg += `━━━━━━━━━━━━━━━━\n`;
                msg += `总入款 (IN)： \`${format(totalInRaw).padStart(summaryWidth, ' ')}\`\n`;
                msg += `费率： \`${formatNumber(new Decimal(settings.rate_in || 0), 2).padStart(summaryWidth - 1, ' ')}%\`\n`;

                // ACTIVE FOREX DETECTION (Multiple Currencies)
                const activeRates = [];
                if (new Decimal(settings.rate_usd || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_usd), suffix: 'USD', label: 'USD汇率' });
                if (new Decimal(settings.rate_myr || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_myr), suffix: 'MYR', label: 'MYR汇率' });
                if (new Decimal(settings.rate_php || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_php), suffix: 'PHP', label: 'PHP汇率' });
                if (new Decimal(settings.rate_thb || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_thb), suffix: 'THB', label: '泰铢汇率' });

                if (activeRates.length > 0) {
                    activeRates.forEach(fx => {
                        const conv = (val: Decimal) => formatNumber(val.div(fx.rate), showDecimals ? 2 : 0);

                        msg += `\n${fx.label}： \`${formatNumber(fx.rate, 2)}\`\n`;
                        msg += `应下发 (IN)： \`${format(totalInNet).padStart(summaryWidth, ' ')}\` | \`${conv(totalInNet).padStart(10, ' ')} ${fx.suffix}\`\n`;
                        msg += `总下发 (OUT)： \`-${format(totalOut).padStart(summaryWidth - 1, ' ')}\` | \`-${conv(totalOut).padStart(9, ' ')} ${fx.suffix}\`\n`;
                        msg += `余额 (TOTAL)： \`${format(balance).padStart(summaryWidth, ' ')}\` | \`${conv(balance).padStart(10, ' ')} ${fx.suffix}\`\n`;
                    });
                } else {
                    msg += `净入款 (IN)： \`${format(totalInNet).padStart(summaryWidth, ' ')}\`\n`;
                    msg += `总下发 (OUT)： \`-${format(totalOut).padStart(summaryWidth - 1, ' ')}\`\n`;
                    msg += `余额 (TOTAL)： \`${format(balance).padStart(summaryWidth, ' ')}\`\n`;
                }
            }

            return msg;
        } finally {
            client.release();
        }
    }
};
