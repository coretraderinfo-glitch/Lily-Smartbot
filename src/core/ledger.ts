import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import { Settings } from './settings';
import { Security } from '../utils/security';
import { PDFExport } from './pdf';
import { ExcelExport } from './excel';
import { I18N } from '../utils/i18n';

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
    pdf?: string;
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
     * Quick Financial Snapshot for AI Brain
     */
    async getDailySummary(chatId: number): Promise<{ count: number, totalIn: string, totalOut: string, balance: string }> {
        const meta = await Ledger._getMeta(chatId);
        const date = getBusinessDate(meta.timezone, meta.resetHour);
        const res = await db.query(`
            SELECT type, net_amount FROM transactions 
            WHERE group_id = $1 AND business_date = $2
        `, [chatId, date]);

        let tin = new Decimal(0);
        let tout = new Decimal(0);
        let tret = new Decimal(0);

        res.rows.forEach((r: any) => {
            const val = new Decimal(r.net_amount || 0);
            if (r.type === 'DEPOSIT') tin = tin.add(val);
            if (r.type === 'PAYOUT') tout = tout.add(val);
            if (r.type === 'RETURN') tret = tret.add(val);
        });

        const balance = tin.sub(tout).add(tret);
        return {
            count: res.rows.length,
            totalIn: formatNumber(tin, 2),
            totalOut: formatNumber(tout, 2),
            balance: formatNumber(balance, 2)
        };
    },

    /**
     * Start a new day
     */
    async startDay(chatId: number): Promise<string> {
        const meta = await Ledger._getMeta(chatId);
        const date = getBusinessDate(meta.timezone, meta.resetHour);

        const settingsRes = await db.query('SELECT language_mode FROM group_settings WHERE group_id = $1', [chatId]);
        const lang = settingsRes.rows[0]?.language_mode || 'CN';

        // Update state to RECORDING
        await db.query(`UPDATE groups SET current_state = 'RECORDING' WHERE id = $1`, [chatId]);

        // Daily rotating wishes (7 different messages)
        const wishesDict = {
            CN: [
                "🗓️ 周日咯！Lily 祝您今日财源广进，Huah @ ah！🧧",
                "🌸 周一加油！愿今天的每一笔交易都顺顺利利，不操心哦！✨",
                "📈 周二大吉！Lily 看到您的生意正在蒸蒸日上咯，继续冲！🚀",
                "💎 周三稳稳哒！祝您生意兴隆，每一个账目都 Ong Ong 的！💰",
                "✨ 周四进步！Lily 会帮您盯紧账本，FIGHTER 您就专注发财哈！🎀",
                "🌈 周五来啦！愿今日充满惊喜与收获，心情美美哒！🌸",
                "💰 周六发财！祝 FIGHTER 日进斗金，到时候记得请 Lily 喝奶茶哈～ 💅"
            ],
            EN: [
                "🗓️ Its Sunday! Lily wishes you a very prosperous day and big Ong! 🧧",
                "🌸 Happy Monday! May all your trades be smooth and effortless today! ✨",
                "📈 High-five Tuesday! I see your business growing, keep it up FIGHTER! 🚀",
                "💎 Smooth Wednesday! Wishing you success and perfectly balanced books! 💰",
                "✨ Flourishing Thursday! Lily is on guard, so you can focus on winning! 🎀",
                "🌈 Fabulous Friday! May your day be filled with great vibes and results! 🌸",
                "💰 Golden Saturday! Wishing you massive growth. Don't forget Lily's tea later! 💅"
            ],
            MY: [
                "🗓️ Ahad ni FIGHTER! Lily doa moga rezeki kencang harini, Huat ah! 🧧",
                "🌸 Isnin yang Onz! Moga semua deal jalan lancar, taboley stress k? ✨",
                "📈 Selasa padu! Lily nampak bisnes FIGHTER makin kencang ni, mantap! 🚀",
                "💎 Rabu yang Chill! Moga untung berlipat kali ganda harini FIGHTER! 💰",
                "✨ Khamis Cayala! Lily jaga ledger ni, FIGHTER fokus buat profit je k? 🎀",
                "🌈 Jumaat barokah! Moga hari ni penuh tuah dan keceriaan! 🌸",
                "💰 Sabtu meletup! Rezeki melimpah ruah FIGHTER... Nanti belanja Lily k! 💅"
            ]
        };

        const list = wishesDict[lang as 'CN' | 'EN' | 'MY'] || wishesDict.CN;
        const todayWish = list[new Date().getDay()];

        return I18N.t(lang, 'sys.ready', { date, wish: todayWish });
    },

    /**
     * End the day and archive
     */
    async stopDay(chatId: number): Promise<{ text: string, pdf: string }> {
        const bill = await Ledger.generateBill(chatId);
        const pdf = await PDFExport.generateDailyPDF(chatId);

        const settingsRes = await db.query('SELECT language_mode FROM group_settings WHERE group_id = $1', [chatId]);
        const lang = settingsRes.rows[0]?.language_mode || 'CN';

        // Reset state to WAITING_FOR_START
        await db.query(`UPDATE groups SET current_state = 'WAITING_FOR_START' WHERE id = $1`, [chatId]);

        return {
            text: I18N.t(lang, 'sys.stop', { bill: bill.text }),
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

    /**
     * Propagate Settings to Today's Transactions
     * Ensures that if a fee or USD rate is changed mid-day, the entire ledger updates.
     */
    async syncNetAmounts(chatId: number): Promise<void> {
        const meta = await Ledger._getMeta(chatId);
        const date = getBusinessDate(meta.timezone, meta.resetHour);
        const settingsRes = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
        const settings = settingsRes.rows[0];
        if (!settings) return;

        const rateIn = new Decimal(settings.rate_in || 0);
        const rateOut = new Decimal(settings.rate_out || 0);
        const rateUsd = new Decimal(settings.rate_usd || 0);

        const txRes = await db.query(`
            SELECT id, type, amount_raw, currency FROM transactions 
            WHERE group_id = $1 AND business_date = $2
        `, [chatId, date]);

        for (const t of txRes.rows) {
            const amount = new Decimal(t.amount_raw);
            let feeRate = new Decimal(0);
            let feeAmount = new Decimal(0);
            let net = amount;

            if (t.type === 'DEPOSIT') {
                feeRate = rateIn;
                feeAmount = amount.mul(feeRate.div(100));
                net = amount.sub(feeAmount);
            } else if (t.type === 'PAYOUT') {
                feeRate = rateOut;
                feeAmount = amount.mul(feeRate.div(100));
                net = amount;
            }

            if (t.currency.toUpperCase() === 'USDT' && rateUsd.gt(0)) {
                net = net.mul(rateUsd);
            }

            await db.query(`
                UPDATE transactions 
                SET fee_rate = $1, fee_amount = $2, net_amount = $3 
                WHERE id = $4
            `, [feeRate.toString(), feeAmount.toString(), net.toString(), t.id]);
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
            // 1. INITIALIZE (Ensure group exists in both tables first)
            await Settings.ensureSettings(chatId);
            await db.query(`INSERT INTO groups (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [chatId]);

            // 2. FETCH DATA
            const meta = await Ledger._getMeta(chatId);
            const date = getBusinessDate(meta.timezone, meta.resetHour);

            const txRes = await client.query(`SELECT * FROM transactions WHERE group_id = $1 AND business_date = $2 ORDER BY recorded_at ASC`, [chatId, date]);
            const settingsRes = await client.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
            const settings = settingsRes.rows[0] || { display_mode: 1, show_decimals: true };

            const displayMode = mode || settings.display_mode || 1;
            const showDecimals = settings.show_decimals !== false;

            const txs = txRes.rows;
            const deposits = txs.filter((t: any) => t.type === 'DEPOSIT');
            const payouts = txs.filter((t: any) => t.type === 'PAYOUT');
            const returns = txs.filter((t: any) => t.type === 'RETURN');

            let totalInRaw = new Decimal(0);
            let totalInNet = new Decimal(0);
            let totalOut = new Decimal(0);
            let totalReturn = new Decimal(0);

            txs.forEach((t: any) => {
                const netCNY = new Decimal(t.net_amount || 0);

                if (t.type === 'DEPOSIT') {
                    totalInRaw = totalInRaw.add(t.amount_raw); // Note: this is raw value which might be U or CNY, but usually we sum in CNY for summary
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
                // Priority 2: Global Environment Override (SYSTEM_URL)
                // Priority 3: Standard Railway Public Domains
                let baseUrl = meta.systemUrl ||
                    process.env.SYSTEM_URL ||
                    process.env.RAILWAY_PUBLIC_DOMAIN ||
                    process.env.PUBLIC_URL ||
                    process.env.RAILWAY_STATIC_URL;

                // Fallback Logic: Generic guess ONLY if no environment or user setting exists
                if (!baseUrl) {
                    baseUrl = process.env.RAILWAY_SERVICE_NAME ?
                        `${process.env.RAILWAY_SERVICE_NAME}.up.railway.app` :
                        'lily-smartbot-production.up.railway.app';
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

            const lang = settings.language_mode || 'CN';

            if (displayMode === 4) {
                msg = I18N.t(lang, 'bill.summary', {
                    totalIn: format(totalInNet),
                    totalOut: format(totalOut),
                    balance: format(balance)
                });
            } else if (displayMode === 5) {
                msg = I18N.t(lang, 'bill.count_mode');
                txs.forEach((t: any, i: any) => {
                    const suffix = t.currency === 'USDT' ? 'u' : '';
                    const val = new Decimal(t.amount_raw);
                    const formatted = val.lt(0) ? `(${format(val.abs())})` : format(val);
                    msg += `${i + 1}. ${t.type === 'DEPOSIT' ? '➕' : '➖'} ${formatted}${suffix}\n`;
                });
                msg += `\n**${I18N.t(lang, 'bill.total')}:** ${format(balance)}`;
            } else {
                const limit = 5; // STRICT WORLD-CLASS TRUNCATION
                const [y, m, d] = date.split('-');
                msg = `📅 **${d}-${m}-${y}**\n\n`;

                if (deposits.length > 0) {
                    msg += `📥 **${I18N.t(lang, 'bill.in')}** (${deposits.length}):\n`;
                    deposits.slice(-limit).forEach((t: any) => {
                        const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: meta.timezone });
                        const suffix = t.currency === 'USDT' ? 'u' : '';
                        const val = new Decimal(t.amount_raw);
                        const formatted = val.lt(0) ? `(${format(val.abs())})` : format(val);
                        msg += `\`${time}\`    **${formatted}${suffix}**\n`;
                    });
                }

                if (payouts.length > 0) {
                    msg += `\n📤 **${I18N.t(lang, 'bill.out')}** (${payouts.length}):\n`;
                    payouts.slice(-limit).forEach((t: any) => {
                        const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: meta.timezone });
                        const suffix = t.currency === 'USDT' ? 'u' : '';
                        const val = new Decimal(t.amount_raw);
                        const formatted = val.lt(0) ? `(${format(val.abs())})` : `-${format(val)}`;
                        msg += `\`${time}\`    **${formatted}${suffix}**\n`;
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

                msg += `${I18N.t(lang, 'bill.due')}: ${format(totalInNet)}\n`;
                msg += `${I18N.t(lang, 'bill.fee')}: ${rateIn.toString()}%\n\n`;

                if (activeRates.length > 0) {
                    activeRates.forEach(r => msg += `${r.code}${I18N.t(lang, 'bill.fx')}: ${r.rate}\n`);
                    msg += `\n`;
                }

                // Helper to convert to ALL active currencies
                const convAll = (v: Decimal) => {
                    if (activeRates.length === 0) return '';
                    return activeRates.map(fx => ` | ${formatNumber(v.div(fx.rate), showDecimals ? 2 : 0)} ${fx.code}`).join('');
                };

                msg += `${I18N.t(lang, 'bill.due')}: ${format(totalInNet)}${convAll(totalInNet)}\n`;
                msg += `${I18N.t(lang, 'bill.payout')}: -${format(totalOut)}${convAll(totalOut)}\n`;
                msg += `${I18N.t(lang, 'bill.balance')}: ${format(balance)}${convAll(balance)}\n`;
            }
            return { text: msg, showMore, url: reportUrl };
        } finally {
            client.release();
        }
    }
};
