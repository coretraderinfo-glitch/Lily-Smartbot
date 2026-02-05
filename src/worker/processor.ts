import { Job } from 'bullmq';
import { Ledger } from '../core/ledger';
import { Settings } from '../core/settings';
import { RBAC } from '../core/rbac';
import { ExcelExport } from '../core/excel';


interface CommandJob {
    chatId: number;
    userId: number;
    username: string;
    text: string;
    messageId: number;
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

        // 设置美元汇率X or /gd X
        const usdMatch = text.match(/^(?:设置美元汇率|\/gd)\s*(\d+(\.\d+)?)$/);
        if (usdMatch) {
            const res = await Settings.setForexRate(chatId, 'usd', parseFloat(usdMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置比索汇率X
        const phpMatch = text.match(/^设置比索汇率\s*(\d+(\.\d+)?)$/);
        if (phpMatch) {
            const res = await Settings.setForexRate(chatId, 'php', parseFloat(phpMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置马币汇率X
        const myrMatch = text.match(/^设置马币汇率\s*(\d+(\.\d+)?)$/);
        if (myrMatch) {
            const res = await Settings.setForexRate(chatId, 'myr', parseFloat(myrMatch[1]));
            return `${res}\n\n${await Ledger.generateBillWithMode(chatId)}`;
        }

        // 设置泰铢汇率X
        const thbMatch = text.match(/^设置泰铢汇率\s*(\d+(\.\d+)?)$/);
        if (thbMatch) {
            const res = await Settings.setForexRate(chatId, 'thb', parseFloat(thbMatch[1]));
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

        // 设置操作人 @username
        const addOpMatch = text.match(/^设置操作人\s+@(\w+)$/);
        if (addOpMatch) {
            return `ℹ️ To add an operator, please **reply** to their message and send: "设置为操作人"`;
        }

        // 删除操作人 @username
        const delOpMatch = text.match(/^删除操作人\s+@(\w+)$/);
        if (delOpMatch) {
            return `ℹ️ To remove an operator, please **reply** to their message and send: "删除操作人"`;
        }

        // 显示操作人
        if (text === '显示操作人') {
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
        if (text === '清理今天数据') {
            return await Ledger.clearToday(chatId);
        }

        // ============================================
        // CORE LEDGER COMMANDS (Phase 1)
        // ============================================

        // START
        if (text === '开始' || text.toLowerCase() === 'start') {
            return await Ledger.startDay(chatId);
        }

        // STOP (Ended Day)
        if (text === '结束记录') {
            return await Ledger.stopDay(chatId);
        }

        // DEPOSIT (+100)
        const depositMatch = text.match(/^\+\s*(\d+(\.\d+)?)$/);
        if (depositMatch) {
            return await Ledger.addTransaction(chatId, userId, username, 'DEPOSIT', depositMatch[1]);
        }

        // PAYOUT (下发100 or 取100 or 下发100u)
        const payoutMatch = text.match(/^(?:下发|取)\s*(\d+(\.\d+)?[uU]?)$/);
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
        if (text === '显示账单') {
            return await Ledger.generateBillWithMode(chatId);
        }

        // DOWNLOAD EXCEL REPORT
        if (text === '下载报表' || text === '导出Excel' || text.toLowerCase() === '/export') {
            const csv = await ExcelExport.generateDailyCSV(chatId);
            return `EXCEL_EXPORT:${csv}`;
        }

        return null; // Ignore unknown

    } catch (e) {
        console.error(e);
        throw e; // Retry job
    }
};
