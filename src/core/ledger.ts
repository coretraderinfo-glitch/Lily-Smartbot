import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import { Settings } from './settings';
import { Security } from '../utils/security';
import { PDFExport } from './pdf';
import { ExcelExport } from './excel';

/**
 * World-Class Financial Ledger Engine
 * Handles math, transactions, and real-time reporting
 */

export interface Transaction {
    id: string;
    group_id: number;
    operator_id: number;
    operator_name: string;
    type: 'DEPOSIT' | 'PAYOUT' | 'RETURN' | 'CORRECTION';
    amount_raw: string;
    fee_rate: string;
    fee_amount: string;
    net_amount: string;
    currency: string;
    business_date: string;
    recorded_at: Date;
}

export interface BillResult {
    text: string;
    showMore?: boolean;
    url?: string;
}

export const Ledger = {
    /**
     * Get metadata for a group
     */
    async _getMeta(chatId: number): Promise<{ timezone: string, resetHour: number, baseSymbol: string }> {
        const res = await db.query('SELECT timezone, reset_hour, currency_symbol FROM groups WHERE id = $1', [chatId]);
        const row = res.rows[0];
        return {
            timezone: row?.timezone || 'Asia/Shanghai',
            resetHour: row?.reset_hour || 4,
            baseSymbol: row?.currency_symbol || 'CNY'
        };
    },

    /**
     * Start a new day
     */
    async startDay(chatId: number): Promise<string> {
        const meta = await Ledger._getMeta(chatId);
        const date = getBusinessDate(meta.timezone, meta.resetHour);
        return `🚀 **系统已就绪 (System Ready)**\n📅 业务日期: ${date}\n💡 请开始记账 (Start recording now)`;
    },

    /**
     * End the day and archive
     */
    async stopDay(chatId: number): Promise<{ text: string, pdf: string }> {
        const bill = await Ledger.generateBill(chatId);
        const pdf = await PDFExport.generateDailyPDF(chatId);

        return {
            text: `🏁 **本日记录结束 (Day Ended)**\n\n${bill.text}\n\n✅ 所有数据已成功归档至 PDF。`,
            pdf: pdf.toString('base64')
        };
    },

    /**
     * Add a transaction (Core Logic)
     */
    async addTransaction(chatId: number, userId: number, username: string, type: 'DEPOSIT' | 'PAYOUT' | 'RETURN', amountStr: string, currency: string = 'CNY'): Promise<BillResult | string> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const meta = await Ledger._getMeta(chatId);
            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0] || {};

            const amount = new Decimal(amountStr);
            if (amount.lte(0)) return `❌ **Invalid Amount**`;

            const feeRate = type === 'DEPOSIT' ? new Decimal(settings.rate_in || 0) : new Decimal(settings.rate_out || 0);
            const feeAmount = type === 'DEPOSIT' ? amount.mul(feeRate.div(100)) : amount.mul(feeRate.div(100)); // Fee logic: In = subtract, Out = add?

            // Standardizing Financial Formula:
            // Deposits: net = raw - fee
            // Payouts: total = raw + fee (but we record amount_raw as requested)
            const netAmount = type === 'DEPOSIT' ? amount.sub(feeAmount) : amount;

            const txId = randomUUID();
            const date = getBusinessDate(meta.timezone, meta.resetHour);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [txId, chatId, userId, username, date, type, amount.toString(), feeRate.toString(), feeAmount.toString(), netAmount.toString(), currency]);

            await client.query('COMMIT');
            return await Ledger.generateBillWithMode(chatId);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    async addCorrection(chatId: number, userId: number, username: string, type: 'DEPOSIT' | 'PAYOUT', amountStr: string): Promise<BillResult | string> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const meta = await Ledger._getMeta(chatId);
            const amount = new Decimal(amountStr).mul(-1); // Correction is negative

            const txId = randomUUID();
            const date = getBusinessDate(meta.timezone, meta.resetHour);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $7, $8)
            `, [txId, chatId, userId, username, date, type, amount.toString(), meta.baseSymbol]);

            await client.query('COMMIT');
            return await Ledger.generateBillWithMode(chatId);
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

            txs.forEach(t => {
                const amount = new Decimal(t.amount_raw);
                const fee = new Decimal(t.fee_amount || 0);
                const net = new Decimal(t.net_amount || 0);

                if (t.type === 'DEPOSIT') {
                    totalInRaw = totalInRaw.add(amount);
                    totalInNet = totalInNet.add(net);
                } else if (t.type === 'PAYOUT') {
                    totalOut = totalOut.add(amount.add(fee));
                } else if (t.type === 'RETURN') {
                    totalReturn = totalReturn.add(amount);
                }
            });

            const balance = totalInNet.sub(totalOut).add(totalReturn);
            const format = (val: Decimal) => formatNumber(val, showDecimals ? 2 : 0);

            let msg = '';
            let reportUrl = '';
            let showMore = txs.length >= 1;

            if (showMore) {
                const securityToken = Security.generateReportToken(chatId, date);
                let baseUrl = process.env.PUBLIC_URL ||
                    process.env.RAILWAY_PUBLIC_DOMAIN ||
                    process.env.RAILWAY_STATIC_URL ||
                    process.env.RAILWAY_STAGING_DOMAIN;

                if (!baseUrl) {
                    baseUrl = `${process.env.RAILWAY_SERVICE_NAME || 'lily'}.up.railway.app`;
                }

                if (baseUrl) {
                    if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;
                    // World-Class URL-Safe Base64: Prevents "Not Found" by removing slashes
                    const tokenBase64 = Buffer.from(`${chatId}:${date}:${securityToken}`)
                        .toString('base64')
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_')
                        .replace(/=+$/, '');
                    reportUrl = `${baseUrl}/v/${tokenBase64}`;
                }
            }

            if (displayMode === 4) {
                msg = `📅 **账单摘要 (Summary)**\n总入款: ${format(totalInRaw)}\n总下发: -${format(totalOut)}\n应下发: ${format(balance)}`;
            } else if (displayMode === 5) {
                msg = `**计数模式 (Count Mode)**\n\n`;
                txs.forEach((t, i) => msg += `${i + 1}. ${t.type === 'DEPOSIT' ? '➕' : '➖'} ${format(new Decimal(t.amount_raw))}\n`);
                msg += `\n**总额:** ${format(balance)}`;
            } else {
                const limit = 5; // STRICT WORLD-CLASS TRUNCATION
                const [y, m, d] = date.split('-');
                msg = `📅 **${d}-${m}-${y}**\n\n`;

                if (deposits.length > 0) {
                    msg += `📥 **入款 (IN)** (${deposits.length}):\n`;
                    deposits.slice(-limit).forEach(t => {
                        const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: meta.timezone });
                        msg += `\`${time}\`    **${format(new Decimal(t.amount_raw))}**\n`;
                    });
                }

                if (payouts.length > 0) {
                    msg += `\n📤 **下发 (OUT)** (${payouts.length}):\n`;
                    payouts.slice(-limit).forEach(t => {
                        const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: meta.timezone });
                        msg += `\`${time}\`    **-${format(new Decimal(t.amount_raw))}**\n`;
                    });
                }

                msg += `\n━━━━━━━━━━━━━━━━\n`;

                // 1. Exchange Rates Block (Simple Style)
                const activeRates = [];
                if (new Decimal(settings.rate_usd || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_usd), code: 'USD' });
                if (new Decimal(settings.rate_myr || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_myr), code: 'MYR' });
                if (new Decimal(settings.rate_php || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_php), code: 'PHP' });
                if (new Decimal(settings.rate_thb || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_thb), code: 'THB' });

                // 2. Financial Totals (Simple Style matching Photo 1)
                const rateIn = new Decimal(settings.rate_in || 0);
                const conv = (v: Decimal, fx: { rate: Decimal, code: string }) => ` | ${formatNumber(v.div(fx.rate), showDecimals ? 2 : 0)} ${fx.code}`;

                msg += `总入款 (IN): ${format(totalInRaw)}\n`;
                msg += `费率: ${rateIn.toString()}%\n\n`;

                if (activeRates.length > 0) {
                    activeRates.forEach(r => msg += `${r.code}汇率: ${r.rate}\n`);
                }

                msg += `应下发 (IN): ${format(totalInNet)}${activeRates.length > 0 ? conv(totalInNet, activeRates[0]) : ''}\n`;
                msg += `总下发 (OUT): -${format(totalOut)}${activeRates.length > 0 ? conv(totalOut, activeRates[0]) : ''}\n`;
                msg += `余额 (TOTAL): ${format(balance)}${activeRates.length > 0 ? conv(balance, activeRates[0]) : ''}\n`;
            }
            return { text: msg, showMore, url: reportUrl };
        } finally {
            client.release();
        }
    }
};
