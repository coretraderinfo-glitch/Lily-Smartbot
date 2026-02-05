import { Job } from 'bullmq';
import { Ledger } from '../core/ledger';
import { Settings } from '../core/settings';
import { RBAC } from '../core/rbac';

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
        const rateInMatch = text.match(/^设置费率(\d+(\.\d+)?)%?$/);
        if (rateInMatch) {
            return await Settings.setInboundRate(chatId, parseFloat(rateInMatch[1]));
        }

        // 设置下发费率X%
        const rateOutMatch = text.match(/^设置下发费率(\d+(\.\d+)?)%?$/);
        if (rateOutMatch) {
            return await Settings.setOutboundRate(chatId, parseFloat(rateOutMatch[1]));
        }

        // 设置美元汇率X or /gd X
        const usdMatch = text.match(/^(?:设置美元汇率|\/gd)\s*(\d+(\.\d+)?)$/);
        if (usdMatch) {
            return await Settings.setForexRate(chatId, 'usd', parseFloat(usdMatch[1]));
        }

        // 设置比索汇率X
        const phpMatch = text.match(/^设置比索汇率(\d+(\.\d+)?)$/);
        if (phpMatch) {
            return await Settings.setForexRate(chatId, 'php', parseFloat(phpMatch[1]));
        }

        // 设置马币汇率X
        const myrMatch = text.match(/^设置马币汇率(\d+(\.\d+)?)$/);
        if (myrMatch) {
            return await Settings.setForexRate(chatId, 'myr', parseFloat(myrMatch[1]));
        }

        // 设置泰铢汇率X
        const thbMatch = text.match(/^设置泰铢汇率(\d+(\.\d+)?)$/);
        if (thbMatch) {
            return await Settings.setForexRate(chatId, 'thb', parseFloat(thbMatch[1]));
        }

        // 设置为无小数
        if (text === '设置为无小数') {
            return await Settings.setDecimals(chatId, false);
        }

        // 设置为计数模式
        if (text === '设置为计数模式') {
            return await Settings.setDisplayMode(chatId, 5);
        }

        // 设置显示模式2/3/4
        const modeMatch = text.match(/^设置显示模式([234])$/);
        if (modeMatch) {
            return await Settings.setDisplayMode(chatId, parseInt(modeMatch[1]));
        }

        // 设置为原始模式
        if (text === '设置为原始模式') {
            await Settings.setDisplayMode(chatId, 1);
            return await Settings.setDecimals(chatId, true);
        }

        // ============================================
        // PHASE B: RBAC & TEAM MANAGEMENT
        // ============================================

        // 设置操作人 @username
        const addOpMatch = text.match(/^设置操作人\s+@(\w+)$/);
        if (addOpMatch) {
            // Note: We need the actual user_id, not just username
            // For now, we'll return a message asking to reply to the user
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
        const voidDepositMatch = text.match(/^入款-(\d+(\.\d+)?)$/);
        if (voidDepositMatch) {
            return await Ledger.addCorrection(chatId, userId, username, 'DEPOSIT', voidDepositMatch[1]);
        }

        // 下发-XXX (Void payout)
        const voidPayoutMatch = text.match(/^下发-(\d+(\.\d+)?)$/);
        if (voidPayoutMatch) {
            return await Ledger.addCorrection(chatId, userId, username, 'PAYOUT', voidPayoutMatch[1]);
        }

        // 回款XXX (Return)
        const returnMatch = text.match(/^回款(\d+(\.\d+)?)$/);
        if (returnMatch) {
            return await Ledger.addReturn(chatId, userId, username, returnMatch[1]);
        }

        // 清理今天数据 (Clear - requires confirmation)
        if (text === '清理今天数据') {
            // TODO: Add confirmation step (requires state management or inline buttons)
            // For now, execute directly with warning
            return await Ledger.clearToday(chatId);
        }

        // ============================================
        // CORE LEDGER COMMANDS (Phase 1)
        // ============================================

        // START
        if (text === '开始' || text.toLowerCase() === 'start') {
            return await Ledger.startDay(chatId);
        }

        // STOP
        if (text === '结束记录') {
            return await Ledger.stopDay(chatId);
        }

        // DEPOSIT (+100)
        const depositMatch = text.match(/^\+(\d+(\.\d+)?)$/);
        if (depositMatch) {
            return await Ledger.addTransaction(chatId, userId, username, 'DEPOSIT', depositMatch[1]);
        }

        // PAYOUT (下发100 or 下发100u)
        if (text.startsWith('下发')) {
            const valStr = text.replace('下发', '').trim();
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

        return null; // Ignore unknown

    } catch (e) {
        console.error(e);
        throw e; // Retry job
    }
};
