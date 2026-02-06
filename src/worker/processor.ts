import { Job } from 'bullmq';
import { Ledger } from '../core/ledger';
import { Settings } from '../core/settings';
import { RBAC } from '../core/rbac';
import { PDFExport } from '../core/pdf';
import { ExcelExport } from '../core/excel';
import { db } from '../db';
import { Security } from '../utils/security';

interface CommandJob {
    chatId: number;
    userId: number;
    username: string;
    text: string;
    messageId: number;
    replyToMessage?: any;
}

/**
 * COMMAND PROCESSOR
 * World-class bilingual command engine
 */
export const processCommand = async (job: Job<CommandJob>) => {
    const { chatId, userId, username, text } = job.data;

    // Security Check
    const isOwner = Security.isSystemOwner(userId);

    try {
        // ============================================
        // PHASE A: SETTINGS & CONFIGURATION
        // ============================================

        // Inbound Fee
        const rateInMatch = text.match(/^设置费率\s*(\d+(\.\d+)?)%?$/);
        if (rateInMatch) {
            const res = await Settings.setInboundRate(chatId, parseFloat(rateInMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // Outbound Fee
        const rateOutMatch = text.match(/^设置下发费率\s*(\d+(\.\d+)?)%?$/);
        if (rateOutMatch) {
            const res = await Settings.setOutboundRate(chatId, parseFloat(rateOutMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // Forex Rates (USD/PHP/MYR/THB)
        const usdMatch = text.match(/^(?:设置美元汇率|\/gd|设置汇率U)[:\s]*(\d+(\.\d+)?)$/i);
        if (usdMatch) {
            const res = await Settings.setForexRate(chatId, 'usd', parseFloat(usdMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }
        const phpMatch = text.match(/^(?:设置比索汇率|设置汇率PHP)[:\s]*(\d+(\.\d+)?)$/i);
        if (phpMatch) {
            const res = await Settings.setForexRate(chatId, 'php', parseFloat(phpMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }
        const myrMatch = text.match(/^(?:设置马币汇率|设置汇率MYR)[:\s]*(\d+(\.\d+)?)$/i);
        if (myrMatch) {
            const res = await Settings.setForexRate(chatId, 'myr', parseFloat(myrMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }
        const thbMatch = text.match(/^(?:设置泰铢汇率|设置汇率泰Bhat|设置汇率THB)[:\s]*(\d+(\.\d+)?)$/i);
        if (thbMatch) {
            const res = await Settings.setForexRate(chatId, 'thb', parseFloat(thbMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // Deletion
        if (/^(?:删除美元汇率|删除汇率U)$/i.test(text)) {
            const res = await Settings.setForexRate(chatId, 'usd', 0);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // Display Modes
        if (text === '设置为无小数') {
            const res = await Settings.setDecimals(chatId, false);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }
        if (text === '设置为计数模式') {
            const res = await Settings.setDisplayMode(chatId, 5);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }
        const modeMatch = text.match(/^设置显示模式\s*([234])$/);
        if (modeMatch) {
            const res = await Settings.setDisplayMode(chatId, parseInt(modeMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }
        if (text === '设置为原始模式') {
            await Settings.setDisplayMode(chatId, 1);
            const res = await Settings.setDecimals(chatId, true);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // ============================================
        // PHASE B: RBAC & TEAM MANAGEMENT
        // ============================================

        if (text.startsWith('设置操作人') || text.startsWith('设置为操作人')) {
            const opCountRes = await db.query('SELECT count(*) FROM group_operators WHERE group_id = $1', [chatId]);
            const hasOperators = parseInt(opCountRes.rows[0].count) > 0;

            if (hasOperators && !isOwner) {
                const isOperator = await RBAC.isAuthorized(chatId, userId);
                if (!isOperator) return `❌ **权限不足 (Unauthorized)**`;
            }

            let targetId: number | null = null;
            let targetName: string | null = null;

            const replyToMsg = job.data.replyToMessage;
            if (replyToMsg) {
                targetId = replyToMsg.from.id;
                targetName = replyToMsg.from.username || replyToMsg.from.first_name;
            } else {
                const tagMatch = text.match(/@(\w+)/);
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

        if (text.startsWith('删除操作人')) {
            if (!isOwner && !(await RBAC.isAuthorized(chatId, userId))) return null;
            let targetId: number | null = null;
            let targetName: string | null = null;

            const replyToMsg = job.data.replyToMessage;
            if (replyToMsg) {
                targetId = replyToMsg.from.id;
                targetName = replyToMsg.from.username || replyToMsg.from.first_name;
            } else {
                const tagMatch = text.match(/@(\w+)/);
                if (tagMatch) {
                    const usernameTag = tagMatch[1];
                    const opRes = await db.query(`SELECT user_id FROM group_operators WHERE group_id = $1 AND username = $2`, [chatId, usernameTag]);
                    if (opRes.rows.length > 0) {
                        targetId = parseInt(opRes.rows[0].user_id);
                        targetName = usernameTag;
                    }
                }
            }
            if (targetId && targetName) return await RBAC.removeOperator(chatId, targetId, targetName);
        }

        if (text === '显示操作人' || /^\/operators$/i.test(text)) return await RBAC.listOperators(chatId);

        // ============================================
        // PHASE C: CORRECTIONS & FLOW
        // ============================================

        const voidDepositMatch = text.match(/^入款\s*-\s*(\d+(\.\d+)?)$/);
        if (voidDepositMatch) return await Ledger.addCorrection(chatId, userId, username, 'DEPOSIT', voidDepositMatch[1]);

        const voidPayoutMatch = text.match(/^下发\s*-\s*(\d+(\.\d+)?)$/);
        if (voidPayoutMatch) return await Ledger.addCorrection(chatId, userId, username, 'PAYOUT', voidPayoutMatch[1]);

        const returnMatch = text.match(/^回款\s*(\d+(\.\d+)?)$/);
        if (returnMatch) return await Ledger.addReturn(chatId, userId, username, returnMatch[1]);

        if (text === '清理今天数据' || /^\/cleardata$/i.test(text)) return await Ledger.clearToday(chatId);

        // FLOW
        if (text === '开始' || /^(?:\/start|start)$/i.test(text)) return await Ledger.startDay(chatId);

        if (text === '结束记录' || /^(?:\/stop|stop)$/i.test(text)) {
            await Ledger.stopDay(chatId);
            const pdf = await PDFExport.generateDailyPDF(chatId);
            const groupRes = await db.query('SELECT timezone, reset_hour FROM groups WHERE id = $1', [chatId]);
            const tz = groupRes.rows[0]?.timezone || 'Asia/Shanghai';
            const rh = groupRes.rows[0]?.reset_hour || 4;
            const { getBusinessDate } = await import('../utils/time');
            const date = getBusinessDate(tz, rh);

            await db.query(`
                INSERT INTO historical_archives (group_id, business_date, type, pdf_blob)
                VALUES ($1, $2, 'MANUAL_STOP', $3)
            `, [chatId, date, pdf]);

            return `PDF_EXPORT:${pdf.toString('base64')}`;
        }

        // ============================================
        // PHASE D: REAL-TIME LEDGER
        // ============================================

        // DEPOSIT (+100 or +100u)
        const depositMatch = text.match(/^\+\s*(\d+(\.\d+)?[uU]?)$/);
        if (depositMatch) {
            const valStr = depositMatch[1];
            let currency = 'CNY';
            let cleanVal = valStr;
            if (valStr.toLowerCase().endsWith('u')) {
                currency = 'USDT';
                cleanVal = valStr.slice(0, -1);
            }
            return await Ledger.addTransaction(chatId, userId, username, 'DEPOSIT', cleanVal, currency);
        }

        // PAYOUT
        const payoutMatch = text.match(/^(?:下发|取|-)\s*(\d+(\.\d+)?[uU]?)$/);
        if (payoutMatch) {
            const valStr = payoutMatch[1];
            let currency = 'CNY';
            let cleanVal = valStr;
            if (valStr.toLowerCase().endsWith('u')) {
                currency = 'USDT';
                cleanVal = valStr.slice(0, -1);
            }
            return await Ledger.addTransaction(chatId, userId, username, 'PAYOUT', cleanVal, currency);
        }

        if (text === '显示账单' || /^(?:\/bill|bill)$/i.test(text)) return await Ledger.generateBillWithMode(chatId);
        if (text === '下载报表' || /^\/export$/i.test(text)) {
            const pdf = await PDFExport.generateDailyPDF(chatId);
            return `PDF_EXPORT:${pdf.toString('base64')}`;
        }
        if (text === '导出Excel' || /^\/excel$/i.test(text)) {
            const csv = await ExcelExport.generateDailyCSV(chatId);
            return `EXCEL_EXPORT:${csv}`;
        }

        return null;

    } catch (e) {
        console.error(e);
        throw e;
    }
};
