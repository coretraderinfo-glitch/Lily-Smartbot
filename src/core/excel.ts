import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
import Decimal from 'decimal.js';
import { I18N } from '../utils/i18n';

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
        const lang = settings.language_mode || 'CN';

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
        const h = [
            I18N.t(lang, 'col.time'), I18N.t(lang, 'col.type'), I18N.t(lang, 'col.raw'),
            I18N.t(lang, 'col.fee'), I18N.t(lang, 'col.fee_amt'), I18N.t(lang, 'col.net'),
            I18N.t(lang, 'col.currency'), I18N.t(lang, 'col.operator')
        ];
        csv += h.map(safe).join(',') + '\n';

        // Aggregates
        let totalInRaw = new Decimal(0);
        let totalInNet = new Decimal(0);
        let totalOut = new Decimal(0);
        let totalReturn = new Decimal(0);

        // CSV Rows
        txRes.rows.forEach((t: any) => {
            const time = new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: timezone });
            const typeLabels: any = { DEPOSIT: I18N.t(lang, 'tx.deposit'), PAYOUT: I18N.t(lang, 'tx.payout'), RETURN: I18N.t(lang, 'tx.return') };
            const type = typeLabels[t.type as string] || t.type;
            const amount = new Decimal(t.amount_raw);

            if (t.type === 'DEPOSIT') {
                totalInRaw = totalInRaw.add(amount);
                totalInNet = totalInNet.add(new Decimal(t.net_amount));
            } else if (t.type === 'PAYOUT') {
                totalOut = totalOut.add(amount);
            } else if (t.type === 'RETURN') {
                totalReturn = totalReturn.add(amount);
            }

            csv += `${safe(time)},${safe(type)},${safe(formatNumber(t.amount_raw, 2))},${safe(formatNumber(t.fee_rate, 2))}%,${safe(formatNumber(t.fee_amount, 2))},${safe(formatNumber(t.net_amount, 2))},${safe(t.currency)},${safe(t.operator_name)}\n`;
        });

        const balance = totalInNet.sub(totalOut).add(totalReturn);

        // Summary Section
        csv += `\n${safe(I18N.t(lang, 'report.summary'))}\n`;
        csv += `${safe(I18N.t(lang, 'fin.total_in'))},${formatNumber(totalInRaw, 2)},CNY\n`;
        csv += `${safe(I18N.t(lang, 'fin.avg_rate'))},${settings.rate_in || 0},%\n`;
        csv += `${safe(I18N.t(lang, 'fin.net_in'))},${formatNumber(totalInNet, 2)},CNY\n`;
        csv += `${safe(I18N.t(lang, 'fin.total_out'))},${formatNumber(totalOut, 2)},CNY\n`;
        csv += `${safe(I18N.t(lang, 'fin.total_ret'))},${formatNumber(totalReturn, 2)},CNY\n`;
        csv += `${safe(I18N.t(lang, 'fin.balance'))},${formatNumber(balance, 2)},CNY\n`;

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
                csv += `${safe(fx.label)},${formatNumber(rate, 2)},\n`;
                const equiv = formatNumber(balance.div(rate), 2);
                csv += `${safe(I18N.t(lang, 'fin.equiv'))} (${fx.suffix} Equiv),${equiv},${fx.suffix}\n`;
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
