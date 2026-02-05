import { Job } from 'bullmq';
import { Ledger } from '../core/ledger';

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

        // PAYOUT (下发100)
        if (text.startsWith('下发')) {
            const valStr = text.replace('下发', '').trim();
            // TODO: Handle 'u' suffix inside Ledger.addTransaction if needed, currently passing raw
            // Phase 2 Blueprint says we handle 'u' in the command parser or core.
            // Let's pass 'CNY' or 'USDT' based on suffix here for simplicity.
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

        // RETURN (回款100) -> Treated as Negative Payout or Special Type?
        // User Blueprint: "回款xxx". Let's map it to 'RETURN' type in Ledger (Need to add support in Ledger if not there, or treat as Deposit).
        // For now, let's skip RETURN until Ledger supports it specifically, or map to Deposit.

        // SHOW BILL
        if (text === '显示账单') {
            return await Ledger.generateBill(chatId);
        }

        return null; // Ignore unknown

    } catch (e) {
        console.error(e);
        throw e; // Retry job
    }
};
