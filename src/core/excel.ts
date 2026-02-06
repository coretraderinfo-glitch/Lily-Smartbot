import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
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
        const groupRes = await db.query('SELECT timezone, reset_hour FROM groups WHERE id = $1', [chatId]);
        const timezone = groupRes.rows[0]?.timezone || 'Asia/Shanghai';
        const resetHour = groupRes.rows[0]?.reset_hour || 4;
        const date = getBusinessDate(timezone, resetHour);

        const txRes = await db.query(`
            SELECT * FROM transactions 
            WHERE group_id = $1 AND business_date = $2 
            ORDER BY recorded_at ASC
        `, [chatId, date]);

        const settingsRes = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
        const settings = settingsRes.rows[0] || {};

        // Helper to safe-quote CSV fields
        const safe = (str: any) => {
            if (str === null || str === undefined) return '';
            const s = String(str);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        // EXCEL COMPATIBILITY: Add UTF-8 BOM
        let csv = '\ufeff';

        // Header
        csv += '时间 (Time),类型 (Type),原始金额 (Raw),费率 (Rate),手续费 (Fee),净额 (Net),币种 (Ccy),操作人 (Operator)\n';

        // Aggregates
        let totalInRaw = new Decimal(0);
        let totalInNet = new Decimal(0);
        let totalOut = new Decimal(0);
        let totalReturn = new Decimal(0);

        // CSV Rows
        txRes.rows.forEach(t => {
            const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: timezone });
            const type = t.type === 'DEPOSIT' ? '入款' : t.type === 'PAYOUT' ? '下发' : '回款';
            const amount = new Decimal(t.amount_raw);

            if (t.type === 'DEPOSIT') {
                totalInRaw = totalInRaw.add(amount);
                totalInNet = totalInNet.add(new Decimal(t.net_amount));
            } else if (t.type === 'PAYOUT') {
                totalOut = totalOut.add(amount);
            } else if (t.type === 'RETURN') {
                totalReturn = totalReturn.add(amount);
            }

            csv += `${safe(time)},${safe(type)},${safe(t.amount_raw)},${safe(t.fee_rate)}%,${safe(t.fee_amount)},${safe(t.net_amount)},${safe(t.currency)},${safe(t.operator_name)}\n`;
        });

        const balance = totalInNet.sub(totalOut).add(totalReturn);

        // Summary Section
        csv += '\n财务摘要 (Financial Summary)\n';
        csv += `总入款 (Total Deposits),${formatNumber(totalInRaw, 2)},CNY\n`;
        csv += `费率 (Fee Rate),${settings.rate_in || 0},%\n`;
        csv += `应下发 (Net Deposits),${formatNumber(totalInNet, 2)},CNY\n`;
        csv += `总下发 (Total Payouts),${formatNumber(totalOut, 2)},CNY\n`;
        csv += `回款 (Total Returns),${formatNumber(totalReturn, 2)},CNY\n`;
        csv += `余 (Balance),${formatNumber(balance, 2)},CNY\n`;

        // Forex info if set (Multiple)
        const fxRates = [
            { key: 'usd', label: '美元汇率 (USD Rate)', suffix: 'USD' },
            { key: 'myr', label: '马币汇率 (MYR Rate)', suffix: 'MYR' },
            { key: 'php', label: '比索汇率 (PHP Rate)', suffix: 'PHP' },
            { key: 'thb', label: '泰铢汇率 (THB Rate)', suffix: 'THB' }
        ];

        fxRates.forEach(fx => {
            const rate = new Decimal(settings[`rate_${fx.key}`] || 0);
            if (rate.gt(0)) {
                csv += `${fx.label},${formatNumber(rate, 2)},\n`;
                const equiv = formatNumber(balance.div(rate), 2);
                csv += `余额 (${fx.suffix} Equivalent),${equiv},${fx.suffix}\n`;
            }
        });

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
