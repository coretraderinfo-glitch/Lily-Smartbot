import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import Decimal from 'decimal.js';

/**
 * Excel Export Module
 * Generates CSV files for daily transaction reports
 */

export const ExcelExport = {
    /**
     * Generate CSV for today's transactions
     */
    async generateDailyCSV(chatId: number): Promise<string> {
        const groupRes = await db.query('SELECT timezone FROM groups WHERE id = $1', [chatId]);
        const timezone = groupRes.rows[0].timezone;
        const date = getBusinessDate(timezone);

        const txRes = await db.query(`
            SELECT * FROM transactions 
            WHERE group_id = $1 AND business_date = $2 
            ORDER BY recorded_at ASC
        `, [chatId, date]);

        const settingsRes = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
        const settings = settingsRes.rows[0];

        // CSV Header
        let csv = 'Time,Type,Amount,Fee Rate,Fee Amount,Net Amount,Currency,Operator\n';

        // CSV Rows
        txRes.rows.forEach(t => {
            const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false });
            const type = t.type === 'DEPOSIT' ? '入款' : t.type === 'PAYOUT' ? '下发' : '回款';
            csv += `${time},${type},${t.amount_raw},${t.fee_rate}%,${t.fee_amount},${t.net_amount},${t.currency},${t.operator_name}\n`;
        });

        // Summary
        const deposits = txRes.rows.filter(t => t.type === 'DEPOSIT');
        const payouts = txRes.rows.filter(t => t.type === 'PAYOUT');

        let totalInRaw = new Decimal(0);
        let totalInNet = new Decimal(0);
        let totalOut = new Decimal(0);

        deposits.forEach(t => {
            totalInRaw = totalInRaw.add(new Decimal(t.amount_raw));
            totalInNet = totalInNet.add(new Decimal(t.net_amount));
        });
        payouts.forEach(t => {
            totalOut = totalOut.add(new Decimal(t.amount_raw));
        });

        const totalFee = totalInRaw.sub(totalInNet);
        const balance = totalInNet.sub(totalOut);

        csv += '\n';
        csv += `Summary,,,,,,\n`;
        csv += `Total Deposits,${totalInRaw.toFixed(2)},,,,,\n`;
        csv += `Fee Rate,${settings.rate_in}%,,,,,\n`;
        csv += `Total Fee,${totalFee.toFixed(2)},,,,,\n`;
        csv += `Net Deposits,${totalInNet.toFixed(2)},,,,,\n`;
        csv += `Total Payouts,${totalOut.toFixed(2)},,,,,\n`;
        csv += `Balance,${balance.toFixed(2)},,,,,\n`;

        return csv;
    },

    /**
     * Get download link (stores CSV in memory/temp storage)
     */
    async getDownloadLink(chatId: number): Promise<string> {
        const csv = await ExcelExport.generateDailyCSV(chatId);
        const date = new Date().toISOString().split('T')[0];

        // For now, return the CSV as a data URL (Telegram can send as document)
        // In production, you'd upload to S3 or similar
        const base64 = Buffer.from(csv).toString('base64');
        return `data:text/csv;base64,${base64}`;
    }
};
