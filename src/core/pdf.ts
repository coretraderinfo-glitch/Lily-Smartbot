import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
import Decimal from 'decimal.js';
import { DateTime } from 'luxon';
import path from 'path';
import fs from 'fs';
import { I18N } from '../utils/i18n';
const PDFDocument = require('pdfkit-table');

/**
 * PDF Export Module
 * Generates World-Class PDF reports for daily transactions
 */

export const PDFExport = {
    /**
     * Generate PDF for today's transactions
     */
    async generateDailyPDF(chatId: number, targetDate?: string): Promise<Buffer> {
        const groupRes = await db.query('SELECT title, timezone, reset_hour FROM groups WHERE id = $1', [chatId]);
        const group = groupRes.rows[0] || { title: 'Group', timezone: 'Asia/Shanghai', reset_hour: 4 };
        const date = targetDate || getBusinessDate(group.timezone, group.reset_hour);

        const txRes = await db.query(`
            SELECT * FROM transactions 
            WHERE group_id = $1 AND business_date = $2 
            ORDER BY recorded_at ASC
        `, [chatId, date]);

        const settingsRes = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
        const settings = settingsRes.rows[0] || {};

        // 1. Create PDF
        const doc = new PDFDocument({ margin: 30, size: 'A4' }) as any;
        const buffers: any[] = [];
        doc.on('data', buffers.push.bind(buffers));

        // 2. Setup Font (For Chinese support)
        const fontPath = [
            path.join(__dirname, '../../assets/fonts/ArialUnicode.ttf'),
            path.join(process.cwd(), 'assets/fonts/ArialUnicode.ttf'),
            '/System/Library/Fonts/Supplemental/Songti.ttc'
        ].find(p => fs.existsSync(p));

        if (fontPath) {
            doc.font(fontPath);
        } else {
            console.warn('[PDF] No Chinese font found. Using Helvetica.');
            doc.font('Helvetica');
        }

        const lang = settings.language_mode || 'CN';

        // 3. HEADER
        doc.fillColor('#1e293b').fontSize(22).text(I18N.t(lang, 'report.title'), { align: 'center' });
        doc.fontSize(10).fillColor('#64748b').text(`${I18N.t(lang, 'report.generated')}: ${DateTime.now().setZone(group.timezone).toFormat('yyyy-MM-dd HH:mm:ss')}`, { align: 'center' });
        doc.moveDown(2);

        doc.fillColor('#334155').fontSize(14).text(`${I18N.t(lang, 'report.group')}: ${group.title}`);
        doc.text(`${I18N.t(lang, 'report.date')}: ${date}`);
        doc.moveDown();

        // 4. TABLE
        const table = {
            title: I18N.t(lang, 'report.details'),
            headers: [
                { label: I18N.t(lang, 'col.time'), property: 'time', width: 60 },
                { label: I18N.t(lang, 'col.type'), property: 'type', width: 50 },
                { label: I18N.t(lang, 'col.raw'), property: 'amount_raw', width: 80 },
                { label: I18N.t(lang, 'col.fee'), property: 'fee_rate', width: 45 },
                { label: I18N.t(lang, 'col.fee_amt'), property: 'fee_amount', width: 75 },
                { label: I18N.t(lang, 'col.net'), property: 'net_amount', width: 85 },
                { label: I18N.t(lang, 'col.operator'), property: 'operator', width: 110 }
            ],
            rows: txRes.rows.map((t: any) => [
                new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: group.timezone }),
                t.type === 'DEPOSIT' ? I18N.t(lang, 'tx.deposit') : t.type === 'PAYOUT' ? I18N.t(lang, 'tx.payout') : I18N.t(lang, 'tx.return'),
                formatNumber(new Decimal(t.amount_raw), 2),
                `${formatNumber(new Decimal(t.fee_rate), 2)}%`,
                formatNumber(new Decimal(t.fee_amount), 2),
                formatNumber(new Decimal(t.net_amount), 2),
                t.operator_name
            ]),
        };

        await doc.table(table, {
            prepareHeader: () => doc.fontSize(10).fillColor('#1e293b'),
            prepareRow: () => doc.fontSize(9).fillColor('#334155'),
            padding: 5,
        });

        // 5. SUMMARY
        doc.addPage();
        doc.fillColor('#1e293b').fontSize(18).text(I18N.t(lang, 'report.summary'), { underline: true });
        doc.moveDown();

        const calculateSummary = () => {
            let tinRaw = new Decimal(0), tinNet = new Decimal(0), tout = new Decimal(0), tret = new Decimal(0);
            txRes.rows.forEach((t: any) => {
                const amt = new Decimal(t.amount_raw);
                if (t.type === 'DEPOSIT') { tinRaw = tinRaw.add(amt); tinNet = tinNet.add(new Decimal(t.net_amount)); }
                else if (t.type === 'PAYOUT') tout = tout.add(amt);
                else if (t.type === 'RETURN') tret = tret.add(amt);
            });
            return { tinRaw, tinNet, tout, tret, bal: tinNet.sub(tout).add(tret) };
        };

        const s = calculateSummary();
        doc.fontSize(12).fillColor('#475569');
        doc.text(`${I18N.t(lang, 'fin.total_in')}: ${formatNumber(s.tinRaw, 2)}`);
        doc.text(`${I18N.t(lang, 'fin.avg_rate')}: ${formatNumber(new Decimal(settings.rate_in || 0), 2)}%`);
        doc.text(`${I18N.t(lang, 'fin.net_in')}: ${formatNumber(s.tinNet, 2)}`);
        doc.fillColor('#b91c1c').text(`${I18N.t(lang, 'fin.total_out')}: -${formatNumber(s.tout, 2)}`);
        doc.fillColor('#475569').text(`${I18N.t(lang, 'fin.total_ret')}: ${formatNumber(s.tret, 2)}`);
        doc.moveDown();
        doc.fontSize(16).fillColor('#059669').text(`${I18N.t(lang, 'fin.balance')}: ${formatNumber(s.bal, 2)}`, { stroke: true });

        // Forex
        ['usd', 'myr', 'php', 'thb'].forEach(k => {
            const rate = new Decimal(settings[`rate_${k}`] || 0);
            if (rate.gt(0)) {
                doc.moveDown(0.5);
                doc.fontSize(11).fillColor('#475569').text(`${k.toUpperCase()} Equiv: ${formatNumber(s.bal.div(rate), 2)} ${k.toUpperCase()}`);
            }
        });

        // Footer
        doc.fontSize(8).fillColor('#94a3b8').text(I18N.t(lang, 'report.footer'), 30, doc.page.height - 40);
        doc.end();

        return new Promise((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);
        });
    }
};
