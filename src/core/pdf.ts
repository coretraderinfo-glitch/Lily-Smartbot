import { db } from '../db';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
import Decimal from 'decimal.js';
import { DateTime } from 'luxon';
import path from 'path';
import fs from 'fs';
const PDFDocument = require('pdfkit-table');

/**
 * PDF Export Module
 * Generates World-Class PDF reports for daily transactions
 */

export const PDFExport = {
    /**
     * Generate PDF for today's transactions
     */
    async generateDailyPDF(chatId: number): Promise<Buffer> {
        const groupRes = await db.query('SELECT title, timezone, reset_hour FROM groups WHERE id = $1', [chatId]);
        const group = groupRes.rows[0] || { title: 'Group', timezone: 'Asia/Shanghai', reset_hour: 4 };
        const date = getBusinessDate(group.timezone, group.reset_hour);

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
        // We check several paths to ensure compatibility across macOS and Linux/Cloud
        const possibleFonts = [
            path.join(process.cwd(), 'assets/fonts/ArialUnicode.ttf'),
            path.join(process.cwd(), 'assets/fonts/NotoSansSC-Regular.otf'),
            '/System/Library/Fonts/Supplemental/Songti.ttc',
            '/System/Library/Fonts/STHeiti Light.ttc',
            '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
            '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc'
        ];

        let fontPath = '';
        for (const p of possibleFonts) {
            if (fs.existsSync(p)) {
                fontPath = p;
                break;
            }
        }

        if (fontPath) {
            doc.font(fontPath);
        } else {
            console.warn('[PDF] No Chinese-compatible font found. Falling back to Helvetica (Chinese text may be missing).');
            doc.font('Helvetica');
        }

        // 3. HEADER
        doc.fillColor('#2c3e50').fontSize(20).text('Lily Smartbot - 财务报表', { align: 'center' });
        doc.fontSize(10).text(`生成时间: ${DateTime.now().setZone(group.timezone).toFormat('yyyy-MM-dd HH:mm:ss')}`, { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).fillColor('#34495e');
        doc.text(`群组: ${group.title}`);
        doc.text(`业务日期: ${date}`);
        doc.moveDown();

        // 4. TABLE
        const table = {
            title: "交易详情 (Transaction Details)",
            headers: [
                { label: "时间", property: 'time', width: 65, align: 'left' },
                { label: "类型", property: 'type', width: 55, align: 'left' },
                { label: "原始金额", property: 'amount_raw', width: 95, align: 'right' },
                { label: "费率", property: 'fee_rate', width: 50, align: 'right' },
                { label: "手续费", property: 'fee_amount', width: 85, align: 'right' },
                { label: "净额", property: 'net_amount', width: 95, align: 'right' },
                { label: "操作人", property: 'operator', width: 115, align: 'left' }
            ],
            rows: txRes.rows.map(t => [
                new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: group.timezone }),
                t.type === 'DEPOSIT' ? '入款' : t.type === 'PAYOUT' ? '下发' : '回款',
                formatNumber(new Decimal(t.amount_raw), 2),
                `${formatNumber(new Decimal(t.fee_rate), 2)}%`,
                formatNumber(new Decimal(t.fee_amount), 2),
                formatNumber(new Decimal(t.net_amount), 2),
                t.operator_name
            ]),
        };

        // Create the table with proper spacing
        await doc.table(table, {
            prepareHeader: () => doc.font(fontPath || 'Helvetica').fontSize(10).fillColor('#2c3e50'),
            prepareRow: (row: any, index: any, column: any, rect: any, fontWeight: any) => doc.font(fontPath || 'Helvetica').fontSize(9).fillColor('#2c3e50'),
            padding: 5, // Add padding between cells
            columnsSize: [65, 55, 95, 50, 85, 95, 115], // Explicit column sizes
        });

        doc.moveDown();

        // 5. SUMMARY
        let totalInRaw = new Decimal(0);
        let totalInNet = new Decimal(0);
        let totalOut = new Decimal(0);
        let totalReturn = new Decimal(0);

        txRes.rows.forEach(t => {
            const amount = new Decimal(t.amount_raw);
            if (t.type === 'DEPOSIT') {
                totalInRaw = totalInRaw.add(amount);
                totalInNet = totalInNet.add(new Decimal(t.net_amount));
            } else if (t.type === 'PAYOUT') {
                totalOut = totalOut.add(amount);
            } else if (t.type === 'RETURN') {
                totalReturn = totalReturn.add(amount);
            }
        });

        const balance = totalInNet.sub(totalOut).add(totalReturn);

        doc.addPage();
        doc.fillColor('#2c3e50').fontSize(16).text('财务摘要 (Financial Summary)', { underline: true });
        doc.moveDown(0.5);

        doc.fontSize(12);
        doc.text(`总入款 (Total Deposits): ${formatNumber(totalInRaw, 2)}`);
        doc.text(`平均费率 (Base Fee Rate): ${formatNumber(new Decimal(settings.rate_in || 0), 2)} %`);
        doc.text(`应下发 (Net Deposits): ${formatNumber(totalInNet, 2)}`);
        doc.fillColor('#e74c3c').text(`总下发 (Total Payouts): -${formatNumber(totalOut, 2)}`);
        doc.fillColor('#2c3e50').text(`回款 (Total Returns): ${formatNumber(totalReturn, 2)}`);
        doc.fontSize(14).fillColor('#27ae60').text(`余 (Final Balance): ${formatNumber(balance, 2)}`, { stroke: true });

        // Forex info (Only show active rates)
        const fxRates = [
            { key: 'usd', label: '美元汇率 (USD Rate)', suffix: 'USD' },
            { key: 'myr', label: '马币汇率 (MYR Rate)', suffix: 'MYR' },
            { key: 'php', label: '比索汇率 (PHP Rate)', suffix: 'PHP' },
            { key: 'thb', label: '泰铢汇率 (THB Rate)', suffix: 'THB' }
        ];

        fxRates.forEach(fx => {
            const rate = new Decimal(settings[`rate_${fx.key}`] || 0);
            if (rate.gt(0)) {
                doc.moveDown(0.5);
                doc.fontSize(12).fillColor('#2c3e50').text(`${fx.label}: ${formatNumber(rate, 2)}`);
                const equiv = formatNumber(balance.div(rate), 2);
                doc.text(`余额换算 (${fx.suffix} Equivalent): ${equiv} ${fx.suffix}`);
            }
        });

        // Footer
        doc.fontSize(8).fillColor('#bdc3c7').text('Generated by Lily Smartbot', doc.page.width - 150, doc.page.height - 30);

        doc.end();

        return new Promise((resolve) => {
            doc.on('end', () => {
                resolve(Buffer.concat(buffers));
            });
        });
    }
};
