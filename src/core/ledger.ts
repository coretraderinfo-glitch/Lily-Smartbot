import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import { Settings } from './settings';
import { Security } from '../utils/security';

export interface BillResult {
    text: string;
    showMore?: boolean;
    url?: string;
}

/**
 * THE LEDGER ENGINE: World-Class Financial Processing
 * Ensures absolute precision and high-speed accounting logic.
 */
export const Ledger = {

    /**
     * Internal Metadata Helper: Fetches group configuration efficiently
     */
    async _getMeta(chatId: number) {
        const client = await db.getClient();
        try {
            const groupRes = await client.query('SELECT timezone, reset_hour, currency_symbol, current_state FROM groups WHERE id = $1', [chatId]);
            const group = groupRes.rows[0];
            return {
                timezone: group?.timezone || 'Asia/Shanghai',
                resetHour: group?.reset_hour || 4,
                baseSymbol: group?.currency_symbol || 'CNY',
                state: group?.current_state || 'WAITING_FOR_START'
            };
        } finally {
            client.release();
        }
    },

    /**
     * Start the Business Day
     */
    async startDay(chatId: number): Promise<BillResult | string> {
        const client = await db.getClient();
        try {
            const exists = (await client.query('SELECT count(*) FROM groups WHERE id = $1', [chatId])).rows[0].count > 0;
            if (!exists) {
                await client.query('INSERT INTO groups (id, title) VALUES ($1, $2)', [chatId, 'Group ' + chatId]);
            }
            await client.query('UPDATE groups SET current_state = $1 WHERE id = $2', ['RECORDING', chatId]);
            const bill = await Ledger.generateBill(chatId);
            return {
                text: `🥂 **系统已开启 (New day started!)**\n\n数据录入已激活，请开始您的操作。\n\n${bill.text}`,
                showMore: bill.showMore,
                url: bill.url
            };
        } finally {
            client.release();
        }
    },

    /**
     * Stop the Business Day & Finalize Ledger
     */
    async stopDay(chatId: number): Promise<BillResult> {
        await db.query('UPDATE groups SET current_state = $1 WHERE id = $2', ['ENDED', chatId]);
        return await Ledger.generateBill(chatId);
    },

    /**
     * CORE RECORDING ENGINE: Processes Deposits and Payouts
     * Implements strict numerical validation and precise fee calculation.
     */
    async addTransaction(chatId: number, userId: number, username: string, type: 'DEPOSIT' | 'PAYOUT', amountStr: string, currency: string = 'CNY'): Promise<BillResult | string> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await Settings.ensureSettings(chatId);

            const meta = await Ledger._getMeta(chatId);
            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0];

            // 1. THE NEGATIVE GATE: World-Class Validation
            const amount = new Decimal(amountStr);
            if (amount.lte(0)) {
                return `❌ **金额错误 (Invalid Amount)**\n\n金额必须大于0。如需冲正，请使用 \`入款-金额\` 或 \`下发-金额\`。\n(Amount must be positive. Use correction commands for voids.)`;
            }

            const activeCurrency = currency === 'CNY' ? meta.baseSymbol : currency;
            let fee = new Decimal(0);
            let net = amount;
            let rate = new Decimal(0);

            // 2. PRECISION CALCULATION
            if (type === 'DEPOSIT') {
                rate = new Decimal(settings.rate_in || 0);
                fee = amount.mul(rate).div(100);
                net = amount.sub(fee);
            } else if (type === 'PAYOUT') {
                rate = new Decimal(settings.rate_out || 0);
                fee = amount.mul(rate).div(100);
            }

            const txId = randomUUID();
            const date = getBusinessDate(meta.timezone, meta.resetHour);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [txId, chatId, userId, username, date, type, amount.toString(), rate.toString(), fee.toString(), net.toString(), activeCurrency]);

            await client.query('COMMIT');
            return await Ledger.generateBillWithMode(chatId);

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    /**
     * Add Correction (Manual Voids)
     */
    async addCorrection(chatId: number, userId: number, username: string, type: 'DEPOSIT' | 'PAYOUT', amountStr: string): Promise<BillResult> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const meta = await Ledger._getMeta(chatId);
            const negativeAmount = new Decimal(amountStr).neg();

            const txId = randomUUID();
            const date = getBusinessDate(meta.timezone, meta.resetHour);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $7, $8)
            `, [txId, chatId, userId, username, date, type, negativeAmount.toString(), meta.baseSymbol]);

            await client.query('COMMIT');
            return await Ledger.generateBillWithMode(chatId);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    async addReturn(chatId: number, userId: number, username: string, amountStr: string): Promise<BillResult | string> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const meta = await Ledger._getMeta(chatId);
            const amount = new Decimal(amountStr);
            if (amount.lte(0)) return `❌ **Invalid Amount**`;

            const txId = randomUUID();
            const date = getBusinessDate(meta.timezone, meta.resetHour);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, 'RETURN', $6, 0, 0, $6, $7)
            `, [txId, chatId, userId, username, date, amount.toString(), meta.baseSymbol]);

            await client.query('COMMIT');
            return await Ledger.generateBillWithMode(chatId);
        } finally {
            client.release();
        }
    },

    async generateBill(chatId: number): Promise<BillResult> {
        return await Ledger.generateBillWithMode(chatId, 1);
    },

    async clearToday(chatId: number): Promise<BillResult> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const meta = await Ledger._getMeta(chatId);
            const date = getBusinessDate(meta.timezone, meta.resetHour);

            const txRes = await client.query(`SELECT * FROM transactions WHERE group_id = $1 AND business_date = $2`, [chatId, date]);
            if (txRes.rows.length > 0) {
                await client.query(`INSERT INTO historical_archives (group_id, business_date, type, data_json) VALUES ($1, $2, 'WIPE', $3)`, [chatId, date, JSON.stringify(txRes.rows)]);
                await client.query(`DELETE FROM transactions WHERE group_id = $1 AND business_date = $2`, [chatId, date]);
            }
            await client.query('COMMIT');
            return await Ledger.generateBill(chatId);
        } finally {
            client.release();
        }
    },

    /**
     * GENIUS GRADE RENDERING: Dynamic View Modes
     */
    async generateBillWithMode(chatId: number, mode?: number): Promise<{ text: string, showMore?: boolean, url?: string }> {
        const client = await db.getClient();
        try {
            const meta = await Ledger._getMeta(chatId);
            const date = getBusinessDate(meta.timezone, meta.resetHour);

            await Settings.ensureSettings(chatId);
            const txRes = await client.query(`SELECT * FROM transactions WHERE group_id = $1 AND business_date = $2 ORDER BY recorded_at ASC`, [chatId, date]);
            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0] || { display_mode: 1, show_decimals: true };

            const displayMode = mode || settings.display_mode || 1;
            const showDecimals = settings.show_decimals !== false;

            const txs = txRes.rows;
            const deposits = txs.filter(t => t.type === 'DEPOSIT');
            const payouts = txs.filter(t => t.type === 'PAYOUT');
            const returns = txs.filter(t => t.type === 'RETURN');

            let totalInRaw = new Decimal(0);
            let totalInNet = new Decimal(0);
            let totalOut = new Decimal(0);
            let totalReturn = new Decimal(0);

            deposits.forEach(t => { totalInRaw = totalInRaw.add(new Decimal(t.amount_raw)); totalInNet = totalInNet.add(new Decimal(t.net_amount)); });
            payouts.forEach(t => { totalOut = totalOut.add(new Decimal(t.amount_raw)); });
            returns.forEach(t => { totalReturn = totalReturn.add(new Decimal(t.amount_raw)); });

            const balance = totalInNet.sub(totalOut).add(totalReturn);
            const format = (val: Decimal) => formatNumber(val, showDecimals ? 2 : 0);

            let msg = '';
            // Determine if we should show the "More" button (>= 5 entries today)
            const showMore = txs.length >= 5;
            let reportUrl = '';

            if (showMore) {
                const securityToken = Security.generateReportToken(chatId, date);
                // Railway provides RAILWAY_STATIC_URL or we construct from RAILWAY_PUBLIC_DOMAIN
                const baseUrl = process.env.PUBLIC_URL ||
                    process.env.RAILWAY_STATIC_URL ||
                    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3000');
                const tokenBase64 = Buffer.from(`${chatId}:${date}:${securityToken}`).toString('base64');
                reportUrl = `${baseUrl}/v/${tokenBase64}`;
            }

            if (displayMode === 4) {
                msg = `📅 **Ledger Summary**\nIN: ${format(totalInRaw)}\nOUT: -${format(totalOut)}\nTOTAL: ${format(balance)}`;
            } else if (displayMode === 5) {
                msg = `**Count Mode**\n\n`;
                txs.forEach((t, i) => msg += `${i + 1}. ${t.type === 'DEPOSIT' ? '➕' : '➖'} ${format(new Decimal(t.amount_raw))}\n`);
                msg += `\nTOTAL: ${format(balance)}`;
            } else {
                const limit = displayMode === 2 ? 3 : displayMode === 3 ? 1 : 5;
                const [y, m, d] = date.split('-');
                msg = `📅 **${d}-${m}-${y}**\n\n📥 **入款 (IN)** (${deposits.length}):\n`;
                deposits.slice(-limit).forEach(t => {
                    const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: meta.timezone });
                    msg += `${time}  ${format(new Decimal(t.amount_raw))}\n`;
                });

                msg += `\n📤 **下发 (OUT)** (${payouts.length}):\n`;
                payouts.slice(-limit).forEach(t => {
                    const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: meta.timezone });
                    msg += `${time}  -${format(new Decimal(t.amount_raw))}\n`;
                });

                msg += `━━━━━━━━━━━━━━━━\nIN: ${format(totalInRaw)}\nRate: ${formatNumber(new Decimal(settings.rate_in || 0), 2)}%\n`;

                const fxRates = [];
                if (new Decimal(settings.rate_usd || 0).gt(0)) fxRates.push({ rate: new Decimal(settings.rate_usd), suf: 'USD' });
                if (new Decimal(settings.rate_myr || 0).gt(0)) fxRates.push({ rate: new Decimal(settings.rate_myr), suf: 'MYR' });

                fxRates.forEach(fx => {
                    const conv = (v: Decimal) => formatNumber(v.div(fx.rate), showDecimals ? 2 : 0);
                    msg += `\nIN: ${format(totalInNet)} | ${conv(totalInNet)} ${fx.suf}\nOUT: -${format(totalOut)} | -${conv(totalOut)} ${fx.suf}\nTOTAL: ${format(balance)} | ${conv(balance)} ${fx.suf}\n`;
                });
                if (fxRates.length === 0) msg += `IN: ${format(totalInNet)}\nOUT: -${format(totalOut)}\nTOTAL: ${format(balance)}\n`;
            }
            return { text: msg, showMore, url: reportUrl };
        } finally {
            client.release();
        }
    }
};
