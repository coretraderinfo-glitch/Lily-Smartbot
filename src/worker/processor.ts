import { Job } from 'bullmq';
import { Ledger } from '../core/ledger';
import { Settings } from '../core/settings';
import { RBAC } from '../core/rbac';
import { PDFExport } from '../core/pdf';
import { ExcelExport } from '../core/excel';
import { db } from '../db';


interface CommandJob {
    chatId: number;
    userId: number;
    username: string;
    text: string;
    messageId: number;
    replyToMessage?: any;
}


export const processCommand = async (job: Job<CommandJob>) => {
    const { chatId, userId, username, text } = job.data;

    try {
        // ============================================
        // PHASE A: SETTINGS & CONFIGURATION
        // ============================================

        // 设置费率X%
        const rateInMatch = text.match(/^设置费率\s*(\d+(\.\d+)?)%?$/);
        if (rateInMatch) {
            const res = await Settings.setInboundRate(chatId, parseFloat(rateInMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置下发费率X%
        const rateOutMatch = text.match(/^设置下发费率\s*(\d+(\.\d+)?)%?$/);
        if (rateOutMatch) {
            const res = await Settings.setOutboundRate(chatId, parseFloat(rateOutMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置美元汇率X or /gd X or 设置汇率U X
        const usdMatch = text.match(/^(?:设置美元汇率|\/gd|设置汇率U)[:\s]*(\d+(\.\d+)?)$/i);
        if (usdMatch) {
            const res = await Settings.setForexRate(chatId, 'usd', parseFloat(usdMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置比索汇率X or 设置汇率PHP X
        const phpMatch = text.match(/^(?:设置比索汇率|设置汇率PHP)[:\s]*(\d+(\.\d+)?)$/i);
        if (phpMatch) {
            const res = await Settings.setForexRate(chatId, 'php', parseFloat(phpMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置马币汇率X or 设置汇率MYR X
        const myrMatch = text.match(/^(?:设置马币汇率|设置汇率MYR)[:\s]*(\d+(\.\d+)?)$/i);
        if (myrMatch) {
            const res = await Settings.setForexRate(chatId, 'myr', parseFloat(myrMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置泰铢汇率X or 设置汇率泰Bhat X
        const thbMatch = text.match(/^(?:设置泰铢汇率|设置汇率泰Bhat|设置汇率THB)[:\s]*(\d+(\.\d+)?)$/i);
        if (thbMatch) {
            const res = await Settings.setForexRate(chatId, 'thb', parseFloat(thbMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 删除汇率 commands
        if (text === '删除美元汇率' || text.toLowerCase() === '删除汇率u') {
            const res = await Settings.setForexRate(chatId, 'usd', 0);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }
        if (text === '删除比索汇率' || text.toLowerCase() === '删除汇率php') {
            const res = await Settings.setForexRate(chatId, 'php', 0);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }
        if (text === '删除马币汇率' || text.toLowerCase() === '删除汇率myr') {
            const res = await Settings.setForexRate(chatId, 'myr', 0);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }
        if (text === '删除泰铢汇率' || text.toLowerCase() === '删除汇率thb') {
            const res = await Settings.setForexRate(chatId, 'thb', 0);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置为无小数
        if (text === '设置为无小数') {
            const res = await Settings.setDecimals(chatId, false);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置为计数模式
        if (text === '设置为计数模式') {
            const res = await Settings.setDisplayMode(chatId, 5);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置显示模式2/3/4
        const modeMatch = text.match(/^设置显示模式\s*([234])$/);
        if (modeMatch) {
            const res = await Settings.setDisplayMode(chatId, parseInt(modeMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置为原始模式
        if (text === '设置为原始模式') {
            await Settings.setDisplayMode(chatId, 1);
            const res = await Settings.setDecimals(chatId, true);
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // ============================================
        // PHASE B: RBAC & TEAM MANAGEMENT
        // ============================================

        // 设置操作人 or Set via Reply
        if (text.startsWith('设置操作人') || text.startsWith('设置为操作人')) {
            const isOperator = await RBAC.isAuthorized(chatId, userId);
            if (!isOperator) {
                const opCountRes = await db.query('SELECT count(*) FROM group_operators WHERE group_id = $1', [chatId]);
                if (parseInt(opCountRes.rows[0].count) > 0) return null; // Ignore non-ops if ops exist
            }

            const replyToMsg = job.data.replyToMessage;
            if (replyToMsg) {
                const targetId = replyToMsg.from.id;
                const targetName = replyToMsg.from.username || replyToMsg.from.first_name;
                return await RBAC.addOperator(chatId, targetId, targetName, userId);
            }
            return `ℹ️ **使用说明 (Guide):**\n\n请 **回复** 该用户的消息，并输入 "设置操作人"。\n(Please **REPLY** to the user's message with "设置操作人" to promote them.)`;
        }

        // 删除操作人
        if (text.startsWith('删除操作人')) {
            const isOperator = await RBAC.isAuthorized(chatId, userId);
            if (!isOperator) return null;

            const replyToMsg = job.data.replyToMessage;
            if (replyToMsg) {
                const targetId = replyToMsg.from.id;
                const targetName = replyToMsg.from.username || replyToMsg.from.first_name;
                return await RBAC.removeOperator(chatId, targetId, targetName);
            }
            return `ℹ️ **使用说明 (Guide):**\n\n请 **回复** 该用户的消息，并输入 "删除操作人"。\n(Please **REPLY** to the user's message with "删除操作人" to demote them.)`;
        }

        // 显示操作人
        if (text === '显示操作人' || text.toLowerCase() === '/operators') {
            return await RBAC.listOperators(chatId);
        }

        // ============================================
        // PHASE C: CORRECTIONS & RETURNS
        // ============================================

        // 入款-XXX (Void deposit)
        const voidDepositMatch = text.match(/^入款\s*-\s*(\d+(\.\d+)?)$/);
        if (voidDepositMatch) {
            return await Ledger.addCorrection(chatId, userId, username, 'DEPOSIT', voidDepositMatch[1]);
        }

        // 下发-XXX (Void payout)
        const voidPayoutMatch = text.match(/^下发\s*-\s*(\d+(\.\d+)?)$/);
        if (voidPayoutMatch) {
            return await Ledger.addCorrection(chatId, userId, username, 'PAYOUT', voidPayoutMatch[1]);
        }

        // 回款XXX (Return)
        const returnMatch = text.match(/^回款\s*(\d+(\.\d+)?)$/);
        if (returnMatch) {
            return await Ledger.addReturn(chatId, userId, username, returnMatch[1]);
        }

        // 清理今天数据 (Clear - requires confirmation)
        if (text === '清理今天数据' || text.toLowerCase() === '/cleardata') {
            return await Ledger.clearToday(chatId);
        }

        // ============================================
        // CORE LEDGER COMMANDS (Phase 1)
        // ============================================

        // START
        if (text === '开始' || text.toLowerCase() === 'start' || text.toLowerCase() === '/start') {
            return await Ledger.startDay(chatId);
        }

        // STOP (Ended Day)
        if (text === '结束记录') {
            await Ledger.stopDay(chatId);
            const pdf = await PDFExport.generateDailyPDF(chatId);
            return `PDF_EXPORT:${pdf.toString('base64')}`;
        }

        // DEPOSIT (+100)
        const depositMatch = text.match(/^\+\s*(\d+(\.\d+)?)$/);
        if (depositMatch) {
            return await Ledger.addTransaction(chatId, userId, username, 'DEPOSIT', depositMatch[1]);
        }

        // PAYOUT (下发100, 取100, -100, or with 'u' for USDT)
        const payoutMatch = text.match(/^(?:下发|取|-)\s*(\d+(\.\d+)?[uU]?)$/);
        if (payoutMatch) {
            const valStr = payoutMatch[1];
            let currency = 'CNY';
            let cleanVal = valStr;
            if (valStr.toLowerCase().endsWith('u')) {
                currency = 'USDT';
                cleanVal = valStr.slice(0, -1);
            }
            if (!isNaN(parseFloat(cleanVal))) {
                return await Ledger.addTransaction(chatId, userId, username, 'PAYOUT', cleanVal, currency);
            }
        }

        // SHOW BILL (uses display mode from settings)
        if (text === '显示账单' || text.toLowerCase() === '/bill') {
            return await Ledger.generateBillWithMode(chatId);
        }

        // DOWNLOAD REPORTS
        if (text === '下载报表' || text.toLowerCase() === '/export') {
            const pdf = await PDFExport.generateDailyPDF(chatId);
            return `PDF_EXPORT:${pdf.toString('base64')}`;
        }

        if (text === '导出Excel' || text.toLowerCase() === '/excel') {
            const csv = await ExcelExport.generateDailyCSV(chatId);
            return `EXCEL_EXPORT:${csv}`;
        }

        return null; // Ignore unknown

    } catch (e) {
        console.error(e);
        throw e; // Retry job
    }
};
