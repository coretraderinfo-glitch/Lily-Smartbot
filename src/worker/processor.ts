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
import { bot } from '../bot/instance';
import { Auditor } from '../guardian/auditor'; // 💎 Silent Auditor
import { AIBrain } from '../utils/ai';
import { MemoryCore } from '../core/memory'; // 🧠 Memory Core
import { MoneyChanger } from '../MC'; // 💱 Money Changer (New Module)

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

    // 1. Settings Fetch (ULTRA-FAST CACHE HIT)
    const SettingsCache = require('../core/cache').SettingsCache;
    const config = await SettingsCache.get(chatId);

    const lang = config?.language_mode || 'CN';
    const aiEnabled = config?.ai_brain_enabled || false;
    const auditorEnabled = config?.auditor_enabled || false;
    const calcEnabled = config?.calc_enabled !== false; // Default TRUE
    const mcEnabled = config?.mc_enabled || false;
    const groupTitle = config?.title || 'Lily Node';

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

        // 🚨 FEATURE FLAG: Calc (Ledger)
        if (!calcEnabled && !isNameTrigger) {
            // Unpurchased/Disabled mode: Lily ignores ledger commands
            return null;
        }

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

        // Toggle Silent Auditor
        const auditorMatch = t.match(/^(?:开启审计|关闭审计|Auditor)\s+(on|off)$/i);
        if (auditorMatch && isOwner) {
            const enabled = auditorMatch[1].toLowerCase() === 'on';
            return await Settings.toggleAuditor(chatId, enabled);
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

        // --- 4. MEMORY CORE COMMANDS (New Feature) ---
        // Syntax: "Remember @User is the Boss" or "Ingat @User ialah Bos"
        const rememberMatch = t.match(/^(?:Remember|Ingat|记住)\s+(@\w+)\s+(.+)$/i);
        if (rememberMatch) {
            // Security: Only Owner/Admin can implant memories
            if (!isOwner && !(await RBAC.isAuthorized(chatId, userId))) {
                return "⚠️ ACCESS DENIED: Only the Professor can edit my memory.";
            }

            const targetTag = rememberMatch[1];
            const memoryContent = rememberMatch[2].trim();

            // WORLD-CLASS: Use 3-tier resolver (group cache → global registry)
            const { UsernameResolver } = require('../utils/username-resolver');
            const targetId = await UsernameResolver.resolve(targetTag, chatId);

            if (!targetId) return `⚠️ I cannot find ${targetTag}. Have they ever spoken in any group I'm in?`;
            await MemoryCore.imprint(targetId, memoryContent, 'DIRECTIVE');

            return `🧠 Memory Imprinted: I will remember that ${targetTag} -> "${memoryContent}"`;
        }
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

        // --- 6. MONEY CHANGER (MC) MODULE ---
        if (mcEnabled) {
            // Feature 1: Set Rates (Client PM or specialized group cmd)
            const mcRateMatch = t.match(/^\/setrate\s+(.+)$/i);
            if (mcRateMatch) {
                if (!isOwner && !(await RBAC.isAuthorized(chatId, userId))) return I18N.t(lang, 'err.unauthorized');
                return await MoneyChanger.setRates(chatId, mcRateMatch[1]);
            }

            // Feature 1.5: Set Wallet
            const mcWalletMatch = t.match(/^\/setwallet\s+(T[A-Za-z0-9]{33})$/i);
            if (mcWalletMatch) {
                if (!isOwner && !(await RBAC.isAuthorized(chatId, userId))) return I18N.t(lang, 'err.unauthorized');
                return await MoneyChanger.setWallet(chatId, mcWalletMatch[1]);
            }

            // Feature 2: Deal Calculation (Automatic detection)
            const mcTradeRes = await MoneyChanger.handleTrade(chatId, userId, username, t);
            if (mcTradeRes) return mcTradeRes;

            // Feature 3: TXID Verification (Blockchain scanner)
            const mcVerifyRes = await MoneyChanger.verifyTXID(chatId, userId, t);
            if (mcVerifyRes) return mcVerifyRes;
        }

        // --- 7. SILENT AUDITOR TRIGGER (The Stealth Accountant) ---
        if (auditorEnabled) {
            const isReport = Auditor.isFinancialReport(text);
            console.log(`[Auditor] Detection result for ${chatId}: ${isReport ? '✅ FINANCIAL REPORT' : '❌ NOT A REPORT'}`);

            if (isReport) {
                // Construct a robust fake context for the auditor
                try {
                    const ledgerSummary = calcEnabled ? await Ledger.getDailySummary(chatId) : null;
                    const ledgerContext = ledgerSummary ? `
Current Group Sales (Lily's Internal Ledger):
- Total In (Net): ${ledgerSummary.totalIn}
- Total Out: ${ledgerSummary.totalOut}
- Balance: ${ledgerSummary.balance}
                    `.trim() : "";

                    const fakeCtx: any = {
                        from: { id: userId, username, first_name: username },
                        chat: { id: chatId },
                        message: { message_id: job.data.messageId, text },
                        api: bot.api, // Critical for reaction removal logic
                        reply: (msg: string, opt: any) => bot.api.sendMessage(chatId, msg, opt),
                        react: (emoji: string) => (bot.api as any).setMessageReaction(chatId, job.data.messageId, emoji ? [{ type: 'emoji', emoji }] : [])
                    };
                    // We await it to ensure the worker doesn't kill the process before OpenAI finishes
                    console.log(`[Auditor] ⚡ Triggering synchronized stealth audit for ${chatId}...`);
                    await Auditor.audit(fakeCtx, text, lang, ledgerContext);
                } catch (auditErr) {
                    console.error('[Auditor] Background Audit Failed:', auditErr);
                }
            }
        } else {
            console.log(`[Auditor] Disabled for group ${chatId}`);
        }

        // --- 6. AI BRAIN CHAT (GPT-4o + VISION + LEDGER + MARKET DATA) ---
        // Auto-Trigger for Images if AI Brain is active, otherwise name trigger
        const shouldTriggerAI = (aiEnabled && imageUrl) || ((aiEnabled || isOwner) && isNameTrigger);

        if (shouldTriggerAI) {
            const start = Date.now();
            console.log(`[AI Brain] ⚡ Starting world-class parallel audit for ${chatId}...`);

            // FIRE EVERYTHING IN PARALLEL (WORLD-CLASS SPEED)
            const [ledgerSummary, marketContext, txVerification] = await Promise.all([
                calcEnabled ? Ledger.getDailySummary(chatId).catch((e: any) => { console.error('Ledger Lag:', e); return null; }) : Promise.resolve(null),
                MarketData.scanAndFetch(text).catch((e: any) => { console.error('Market Lag:', e); return ""; }),
                // NEW: Blockchain Autoscan (Only if AI Brain is active)
                (async () => {
                    if (!aiEnabled) return null;

                    // 1. Scan current text
                    let txMatch = text.match(/(739[a-f0-9]{20,}|e80[a-f0-9]{20,}|0x[a-f0-9]{64}|[a-f0-9]{64})/i);

                    // 2. Scan Reply-To context (Elite Retrieval)
                    if (!txMatch && job.data.replyToMessage) {
                        const replyText = job.data.replyToMessage.text || job.data.replyToMessage.caption || "";
                        txMatch = replyText.match(/(739[a-f0-9]{20,}|e80[a-f0-9]{20,}|0x[a-f0-9]{64}|[a-f0-9]{64})/i);
                    }

                    // 3. Scan Last 3 turns of Session Memory (Deep Brain Scan)
                    if (!txMatch) {
                        const { SessionMemory } = require('../core/memory/session');
                        const history = await SessionMemory.recall(chatId, userId);
                        for (const turn of history.slice(-3)) {
                            txMatch = turn.content.match(/(739[a-f0-9]{20,}|e80[a-f0-9]{20,}|0x[a-f0-9]{64}|[a-f0-9]{64})/i);
                            if (txMatch) break;
                        }
                    }

                    if (txMatch) {
                        const { Blockchain } = require('../core/blockchain');
                        console.log(`[Blockchain] 🔍 Found TXID in context: ${txMatch[0]}`);
                        return await Blockchain.verify(txMatch[0]).catch((e: any) => { console.error('Chain Lag:', e); return null; });
                    }
                    return null;
                })()
            ]);

            const profiling = Date.now() - start;
            console.log(`[AI Brain] ✅ Context gathered in ${profiling}ms (Ledger/Market/Chain parallelized)`);

            let blockchainContext = "";
            if (txVerification && txVerification.found) {
                blockchainContext = `
[BLOCKCHAIN FORENSICS]:
Status: ${txVerification.status}
Chain: ${txVerification.currency || 'Unknown'}
Detail: ${txVerification.error || 'Confirmed on-chain'}
Amount: ${txVerification.amount || '?'}
Timestamp: ${txVerification.timestamp ? new Date(txVerification.timestamp).toLocaleString() : '?'}
                `.trim();
            }

            const ledgerContext = ledgerSummary ? `
Current Group Sales (Internal Ledger):
- Total In: ${ledgerSummary.totalIn}
- Total Out: ${ledgerSummary.totalOut}
- Balance: ${ledgerSummary.balance}
            `.trim() : "Internal Ledger: Access Restricted (Not Active).";

            const replyContext = job.data.replyToMessage?.text || job.data.replyToMessage?.caption || "";
            // MERGE CONTEXTS: Ledger + Market + Blockchain
            const fullContext = `${ledgerContext}\n\n${marketContext}\n\n${blockchainContext}`;

            const reply = await AIBrain.generateResponse(text, userId, username, lang, groupTitle, imageUrl, fullContext, replyContext, chatId);

            // SILENCE PROTOCOL: If Lily says NONE, we discard the message
            if (reply.toUpperCase() === 'NONE' || !reply) return null;
            return reply;
        }

        return null;

    } catch (e) {
        console.error(e);
        throw e;
    }
};
