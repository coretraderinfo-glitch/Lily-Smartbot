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
    async _getMeta(chatId: number): Promise<{ timezone: string, resetHour: number, baseSymbol: string, systemUrl?: string }> {
        const res = await db.query('SELECT timezone, reset_hour, currency_symbol, system_url FROM groups WHERE id = $1', [chatId]);
        const row = res.rows[0];
        return {
            timezone: row?.timezone || 'Asia/Shanghai',
            resetHour: row?.reset_hour || 4,
            baseSymbol: row?.currency_symbol || 'CNY',
            systemUrl: row?.system_url
        };
    },

    /**
     * Start a new day
     */
    async startDay(chatId: number): Promise<string> {
        const meta = await Ledger._getMeta(chatId);
        const date = getBusinessDate(meta.timezone, meta.resetHour);

        // Update state to RECORDING
        await db.query(`UPDATE groups SET current_state = 'RECORDING' WHERE id = $1`, [chatId]);

        // Daily rotating wishes (7 different messages)
        const wishes = [
            "🌟 祝您今日财源广进！May your wealth flow abundantly today!",
            "💎 愿今天的每一笔交易都顺利！Wishing smooth transactions ahead!",
            "🚀 新的一天，新的机遇！A new day brings new opportunities!",
            "✨ 祝您生意兴隆，财运亨通！May prosperity follow you today!",
            "🎯 专注目标，成功在望！Stay focused, success awaits!",
            "🌈 愿今日充满好运与收获！May today bring fortune and rewards!",
            "💰 祝您日进斗金，事业腾飞！Wishing you abundant success!"
        ];

        const dayOfWeek = new Date().getDay();
        const todayWish = wishes[dayOfWeek];

        return `🚀 **系统已就绪 (System Ready)**\n📅 业务日期: ${date}\n\n${todayWish}\n\n💡 请开始记账 (Start recording now)`;
    },

    /**
     * End the day and archive
     */
    async stopDay(chatId: number): Promise<{ text: string, pdf: string }> {
        const bill = await Ledger.generateBill(chatId);
        const pdf = await PDFExport.generateDailyPDF(chatId);

        // Reset state to WAITING_FOR_START
        await db.query(`UPDATE groups SET current_state = 'WAITING_FOR_START' WHERE id = $1`, [chatId]);

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

            let amount = new Decimal(amountStr);
            if (amount.lte(0)) return `❌ **Invalid Amount**`;

            const feeRate = type === 'DEPOSIT' ? new Decimal(settings.rate_in || 0) : new Decimal(settings.rate_out || 0);
            const feeAmount = amount.mul(feeRate.div(100));

            // Accounting Value: Convert to CNY for central ledger
            let accountingNetAmount = type === 'DEPOSIT' ? amount.sub(feeAmount) : amount;

            // USDT Translation Logic: If recorded in U, convert the CNY net value
            if (currency.toUpperCase() === 'USDT') {
                const usdRate = new Decimal(settings.rate_usd || 0);
                if (usdRate.gt(0)) {
                    accountingNetAmount = accountingNetAmount.mul(usdRate);
                }
            }

            const txId = randomUUID();
            const date = getBusinessDate(meta.timezone, meta.resetHour);

            await client.query(`
                INSERT INTO transactions 
                (id, group_id, operator_id, operator_name, business_date, type, amount_raw, fee_rate, fee_amount, net_amount, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [txId, chatId, userId, username, date, type, amount.toString(), feeRate.toString(), feeAmount.toString(), accountingNetAmount.toString(), currency]);

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
                const amountRaw = new Decimal(t.amount_raw);
                const netCNY = new Decimal(t.net_amount || 0);

                if (t.type === 'DEPOSIT') {
                    totalInRaw = totalInRaw.add(amountRaw); // Note: this is raw value which might be U or CNY, but usually we sum in CNY for summary
                    totalInNet = totalInNet.add(netCNY);
                } else if (t.type === 'PAYOUT') {
                    totalOut = totalOut.add(netCNY);
                } else if (t.type === 'RETURN') {
                    totalReturn = totalReturn.add(netCNY);
                }
            });

            const balance = totalInNet.sub(totalOut).add(totalReturn);
            const format = (val: Decimal) => formatNumber(val, showDecimals ? 2 : 0);

            let msg = '';
            let reportUrl = '';
            let showMore = txs.length >= 1;

            if (showMore) {
                const securityToken = Security.generateReportToken(chatId, date);

                // Priority 1: User-Set Domain (/set_url) - 100% Reliable
                // Priority 2: Standard Railway Public Domains
                let baseUrl = meta.systemUrl ||
                    process.env.RAILWAY_PUBLIC_DOMAIN ||
                    process.env.PUBLIC_URL ||
                    process.env.RAILWAY_STATIC_URL;

                // Fallback Logic: Generic guess if all else fails
                if (!baseUrl) {
                    baseUrl = process.env.RAILWAY_SERVICE_NAME ?
                        `${process.env.RAILWAY_SERVICE_NAME}.up.railway.app` :
                        'lily-smartbot.up.railway.app';
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
                msg = `📅 **账单摘要 (Summary)**\n总入款: ${format(totalInNet)}\n总下发: -${format(totalOut)}\n应下发: ${format(balance)}`;
            } else if (displayMode === 5) {
                msg = `**计数模式 (Count Mode)**\n\n`;
                txs.forEach((t, i) => {
                    const suffix = t.currency === 'USDT' ? 'u' : '';
                    msg += `${i + 1}. ${t.type === 'DEPOSIT' ? '➕' : '➖'} ${format(new Decimal(t.amount_raw))}${suffix}\n`;
                });
                msg += `\n**总额:** ${format(balance)}`;
            } else {
                const limit = 5; // STRICT WORLD-CLASS TRUNCATION
                const [y, m, d] = date.split('-');
                msg = `📅 **${d}-${m}-${y}**\n\n`;

                if (deposits.length > 0) {
                    msg += `📥 **入款 (IN)** (${deposits.length}):\n`;
                    deposits.slice(-limit).forEach(t => {
                        const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: meta.timezone });
                        const suffix = t.currency === 'USDT' ? 'u' : '';
                        msg += `\`${time}\`    **${format(new Decimal(t.amount_raw))}${suffix}**\n`;
                    });
                }

                if (payouts.length > 0) {
                    msg += `\n📤 **下发 (OUT)** (${payouts.length}):\n`;
                    payouts.slice(-limit).forEach(t => {
                        const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: meta.timezone });
                        const suffix = t.currency === 'USDT' ? 'u' : '';
                        msg += `\`${time}\`    **-${format(new Decimal(t.amount_raw))}${suffix}**\n`;
                    });
                }

                msg += `\n━━━━━━━━━━━━━━━━\n`;

                const rateIn = new Decimal(settings.rate_in || 0);

                // 1. Exchange Rates Block (Simple Style)
                const activeRates: { rate: Decimal, code: string }[] = [];
                if (new Decimal(settings.rate_usd || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_usd), code: 'USD' });
                if (new Decimal(settings.rate_myr || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_myr), code: 'MYR' });
                if (new Decimal(settings.rate_php || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_php), code: 'PHP' });
                if (new Decimal(settings.rate_thb || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_thb), code: 'THB' });

                msg += `总入款 (IN): ${format(totalInNet)}\n`; // Show total net in CNY
                msg += `费率: ${rateIn.toString()}%\n\n`;

                if (activeRates.length > 0) {
                    activeRates.forEach(r => msg += `${r.code}汇率: ${r.rate}\n`);
                    msg += `\n`;
                }

                // Helper to convert to ALL active currencies
                const convAll = (v: Decimal) => {
                    if (activeRates.length === 0) return '';
                    return activeRates.map(fx => ` | ${formatNumber(v.div(fx.rate), showDecimals ? 2 : 0)} ${fx.code}`).join('');
                };

                msg += `应下发 (IN): ${format(totalInNet)}${convAll(totalInNet)}\n`;
                msg += `总下发 (OUT): -${format(totalOut)}${convAll(totalOut)}\n`;
                msg += `余额 (TOTAL): ${format(balance)}${convAll(balance)}\n`;
            }
            return { text: msg, showMore, url: reportUrl };
        } finally {
            client.release();
        }
    }
};
