import { Job } from 'bullmq';
import { Ledger, BillResult } from '../core/ledger';
import { Settings } from '../core/settings';
import { RBAC } from '../core/rbac';
import { PDFExport } from '../core/pdf';
import { ExcelExport } from '../core/excel';
import { db } from '../db';
import { Security } from '../utils/security';
import { I18N } from '../utils/i18n';
import { MarketData } from '../core/market';
import { AIBrain } from '../utils/ai';

interface CommandJob {
    chatId: number;
    userId: number;
    username: string;
    text: string;
    messageId: number;
    replyToMessage?: any;
    imageUrl?: string; // Vision Support
}

/**
 * Helper to combine a simple message with a BillResult
 */
const combine = (prefix: string, bill: BillResult): BillResult => ({
    ...bill,
    text: `${prefix}\n\n${bill.text}`
});

/**
 * COMMAND PROCESSOR
 * World-class bilingual command engine
 */
export const processCommand = async (job: Job<CommandJob>): Promise<BillResult | string | null> => {
    const { chatId, userId, username, text, imageUrl } = job.data;

    // 1. Settings Fetch (SAFE ACCESS + CONTEXT AWARENESS)
    const settingsRes = await db.query(`
        SELECT s.language_mode, s.ai_brain_enabled, g.title 
        FROM group_settings s 
        JOIN groups g ON s.group_id = g.id 
        WHERE s.group_id = $1
    `, [chatId]);
    const config = settingsRes.rows[0];
    const lang = config?.language_mode || 'CN';
    const aiEnabled = config?.ai_brain_enabled || false;
    const groupTitle = config?.title || 'Unknown Group';

    // 2. Dynamic Mention Check (Evolved Hearing)
    // Detects: "Lily", "@LilyBot", or REPLY to a bot message
    const isNameTrigger = /lily/i.test(text) ||
        (job.data.replyToMessage && job.data.replyToMessage.from?.is_bot);

    // Security Check
    const isOwner = Security.isSystemOwner(userId);

    try {
        // --- 1. COMMAND NORMALIZATION & MULTILINGUAL ALIASES ---
        const t = text.trim();
        const isShowBill = /^(?:显示账单|Show Bill|Papar Bil|Laporan|bill)$/i.test(t);
        const isClearDay = /^(?:清理今天数据|Clear Today|Cuci Hari|Reset Hari|cleardata)$/i.test(t);
        const isDownloadReport = /^(?:下载报表|Download Report|Muat Turun Laporan|export)$/i.test(t);
        const isExportExcel = /^(?:导出Excel|Export Excel|Eksport Excel|excel)$/i.test(t);
        const isStartDay = /^(?:开始|Start)$/i.test(t);
        const isStopDay = /^(?:结束记录|Stop|Finalize)$/i.test(t);
        const isShowOps = /^(?:显示操作人|Show Operators|Senarai Operator|operators)$/i.test(t);

        // --- 2. THE FEATURE CONFIGURATION (PHASE A) ---

        // Fee Settings
        const rateInMatch = t.match(/^(?:设置费率|Set Rate|Kadar Fee Masuk)\s*([\d.]+)%?$/i);
        if (rateInMatch) {
            const res = await Settings.setInboundRate(chatId, parseFloat(rateInMatch[1]));
            await Ledger.syncNetAmounts(chatId);
            return combine(res, await Ledger.generateBillWithMode(chatId));
        }

        const rateOutMatch = t.match(/^(?:设置下发费率|Set Outbound Rate|Kadar Fee Keluar)\s*([\d.]+)%?$/i);
        if (rateOutMatch) {
            const res = await Settings.setOutboundRate(chatId, parseFloat(rateOutMatch[1]));
            await Ledger.syncNetAmounts(chatId);
            return combine(res, await Ledger.generateBillWithMode(chatId));
        }

        // Forex Settings
        const usdMatch = t.match(/^(?:设置美元汇率|Set USD Rate|Kadar USD)\s+([\d.]+)$/i);
        if (usdMatch) {
            const res = await Settings.setForexRate(chatId, 'usd', parseFloat(usdMatch[1]));
            await Ledger.syncNetAmounts(chatId);
            return combine(res, await Ledger.generateBillWithMode(chatId));
        }
        const myrMatch = t.match(/^(?:设置马币汇率|Set MYR Rate|Kadar MYR)\s+([\d.]+)$/i);
        if (myrMatch) {
            const res = await Settings.setForexRate(chatId, 'myr', parseFloat(myrMatch[1]));
            await Ledger.syncNetAmounts(chatId);
            return combine(res, await Ledger.generateBillWithMode(chatId));
        }

        // Display Modes
        if (/^(?:设置为无小数|No Decimals|Tanpa Perpuluhan)$/i.test(t)) {
            const res = await Settings.setDecimals(chatId, false);
            return combine(res, await Ledger.generateBillWithMode(chatId));
        }
        if (/^(?:设置为计数模式|Count Mode|Mod Kiraan)$/i.test(t)) {
            const res = await Settings.setDisplayMode(chatId, 5);
            return combine(res, await Ledger.generateBillWithMode(chatId));
        }
        if (/^(?:设置为原始模式|Original Mode|Mod Asal)$/i.test(t)) {
            await Settings.setDisplayMode(chatId, 1);
            const res = await Settings.setDecimals(chatId, true);
            return combine(res, await Ledger.generateBillWithMode(chatId));
        }

        // --- 3. TEAM & SECURITY (PHASE B) ---
        if (t.startsWith('设置操作人') || t.startsWith('Set Operator') || t.startsWith('Tambah Operator')) {
            const opCountRes = await db.query('SELECT count(*) FROM group_operators WHERE group_id = $1', [chatId]);
            const hasOperators = parseInt(opCountRes.rows[0].count) > 0;
            if (hasOperators && !isOwner) {
                const authorized = await RBAC.isAuthorized(chatId, userId);
                if (!authorized) return I18N.t(lang, 'err.unauthorized');
            }
            let targetId: number | null = null;
            let targetName: string | null = null;
            const replyToMsg = job.data.replyToMessage;
            if (replyToMsg) {
                targetId = replyToMsg.from.id;
                targetName = replyToMsg.from.username || replyToMsg.from.first_name;
            } else {
                const tagMatch = t.match(/@(\w+)/);
                if (tagMatch) {
                    const usernameTag = tagMatch[1];
                    const cacheRes = await db.query(`SELECT user_id FROM user_cache WHERE group_id = $1 AND username = $2`, [chatId, usernameTag]);
                    if (cacheRes.rows.length > 0) {
                        targetId = parseInt(cacheRes.rows[0].user_id);
                        targetName = usernameTag;
                    }
                }
            }
            if (targetId && targetName) return await RBAC.addOperator(chatId, targetId, targetName, userId);
            return `ℹ️ **Reply** to someone or **@Tag** them to add as operator.`;
        }

        if (isShowOps) return await RBAC.listOperators(chatId);

        // --- 4. DATA FLOW & LIFECYCLE (PHASE C) ---
        if (isStartDay) return await Ledger.startDay(chatId);
        if (isClearDay) {
            if (!isOwner) return I18N.t(lang, 'err.unauthorized');
            await db.query(`DELETE FROM transactions WHERE group_id = $1 AND business_date = (SELECT business_date FROM transactions WHERE group_id = $1 ORDER BY recorded_at DESC LIMIT 1)`, [chatId]);
            return await Ledger.generateBillWithMode(chatId);
        }

        if (isStopDay) {
            const result = await Ledger.stopDay(chatId);
            return result;
        }

        // --- 5. REAL-TIME ACCOUNTING (PHASE D) ---

        // Deposits: +100, In 100, Masuk 100
        const depositMatch = t.match(/^(?:\+|入款|In|Masuk)\s*([\d.]+[uU]?)$/i);
        if (depositMatch) {
            const valStr = depositMatch[1];
            let currency = 'CNY';
            let cleanVal = valStr;
            if (valStr.toLowerCase().endsWith('u')) {
                currency = 'USDT';
                cleanVal = valStr.slice(0, -1);
            }
            if (parseFloat(cleanVal) <= 0) return I18N.t(lang, 'err.invalid_amount');
            return await Ledger.addTransaction(chatId, userId, username, 'DEPOSIT', cleanVal, currency);
        }

        // Payouts: -100, Out 100, Keluar 100
        const payoutMatch = t.match(/^(?:\-|下发|取|Out|Keluar)\s*([\d.]+[uU]?)$/i);
        if (payoutMatch) {
            const valStr = payoutMatch[1];
            let currency = 'CNY';
            let cleanVal = valStr;
            if (valStr.toLowerCase().endsWith('u')) {
                currency = 'USDT';
                cleanVal = valStr.slice(0, -1);
            }
            if (parseFloat(cleanVal) <= 0) return I18N.t(lang, 'err.invalid_amount');
            return await Ledger.addTransaction(chatId, userId, username, 'PAYOUT', cleanVal, currency);
        }

        // Returns
        const returnMatch = t.match(/^(?:回款|Return|Balik)\s*([\d.]+)$/i);
        if (returnMatch) return await Ledger.addReturn(chatId, userId, username, returnMatch[1]);

        // Corrections (Void)
        const voidDepMatch = t.match(/^(?:入款|In|Masuk)\s*-\s*([\d.]+)$/i);
        if (voidDepMatch) return await Ledger.addCorrection(chatId, userId, username, 'DEPOSIT', voidDepMatch[1]);

        const voidPayMatch = t.match(/^(?:下发|Out|Keluar)\s*-\s*([\d.]+)$/i);
        if (voidPayMatch) return await Ledger.addCorrection(chatId, userId, username, 'PAYOUT', voidPayMatch[1]);

        // Misc Reports
        if (isShowBill) return await Ledger.generateBillWithMode(chatId);

        if (isDownloadReport) {
            const pdf = await PDFExport.generateDailyPDF(chatId);
            return `PDF_EXPORT:${pdf.toString('base64')}`;
        }

        if (isExportExcel) {
            const csv = await ExcelExport.generateDailyCSV(chatId);
            return `EXCEL_EXPORT:${csv}`;
        }

        // --- 6. AI BRAIN CHAT (GPT-4o + VISION + LEDGER + MARKET DATA) ---
        if (aiEnabled && isNameTrigger) {
            // FIRE EVERYTHING IN PARALLEL (WORLD-CLASS SPEED)
            const [ledgerSummary, marketContext] = await Promise.all([
                Ledger.getDailySummary(chatId),
                MarketData.scanAndFetch(text)
            ]);

            const ledgerContext = `
Current Group Sales (Internal Ledger):
- Total In: ${ledgerSummary.totalIn}
- Total Out: ${ledgerSummary.totalOut}
- Balance: ${ledgerSummary.balance}
            `.trim();

            return await AIBrain.generateResponse(text, userId, username, lang, groupTitle, imageUrl, ledgerContext, marketContext);
        }

        return null;

    } catch (e) {
        console.error(e);
        throw e;
    }
};
