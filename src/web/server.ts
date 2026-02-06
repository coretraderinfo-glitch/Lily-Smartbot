import express from 'express';
import { db } from '../db';
import { Security } from '../utils/security';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
import { PDFExport } from '../core/pdf';
import Decimal from 'decimal.js';
import path from 'path';

const app = express();
// Railway provides PORT automatically. If not set (local dev), default to 3000
const PORT = parseInt(process.env.PORT || '3000');

/**
 * THE LILY WEB READER: Secure Financial Platform
 */

app.get('/', (req, res) => res.status(200).send('Lily Financial Services: Online 🟢'));

app.get('/v/:token', async (req, res) => {
    const { token } = req.params;

    // 1. Decode and verify token
    // The token is group_id:business_date:hash
    try {
        // Restore standard Base64 characters (+ and /) before decoding
        const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedToken, 'base64').toString('utf-8');
        const [chatIdStr, date, hash] = decoded.split(':');
        const chatId = parseInt(chatIdStr);

        if (!Security.verifyReportToken(chatId, date, hash)) {
            return res.status(403).send('<h1>❌ 拒绝访问 (Access Denied)</h1><p>授权令牌无效或已过期。</p>');
        }

        // 2. Fetch Data
        const groupRes = await db.query('SELECT title, timezone, reset_hour FROM groups WHERE id = $1', [chatId]);
        const group = groupRes.rows[0] || { title: 'Group', timezone: 'Asia/Shanghai', reset_hour: 4 };

        const txRes = await db.query(`
            SELECT * FROM transactions 
            WHERE group_id = $1 AND business_date = $2 
            ORDER BY recorded_at ASC
        `, [chatId, date]);

        const settingsRes = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
        const settings = settingsRes.rows[0] || {};
        const showDecimals = settings.show_decimals !== false;

        // 3. Render Dashboard
        const txs = txRes.rows;
        let totalInRaw = new Decimal(0);
        let totalInNet = new Decimal(0);
        let totalOut = new Decimal(0);
        let totalReturn = new Decimal(0);

        txs.forEach(t => {
            const amount = new Decimal(t.amount_raw);
            const fee = new Decimal(t.fee_amount || 0);
            const net = new Decimal(t.net_amount || 0);

            if (t.type === 'DEPOSIT') {
                totalInRaw = totalInRaw.add(amount);
                totalInNet = totalInNet.add(net);
            } else if (t.type === 'PAYOUT') {
                totalOut = totalOut.add(amount.add(fee));
            } else if (t.type === 'RETURN') {
                totalReturn = totalReturn.add(amount);
            }
        });

        const balance = totalInNet.sub(totalOut).add(totalReturn);
        const format = (val: Decimal | number) => formatNumber(new Decimal(val), showDecimals ? 2 : 0);

        const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lily Smart Ledger - 实时对账单</title>
    <style>
        :root {
            --bg: #0f172a;
            --card: #1e293b;
            --text: #f8fafc;
            --primary: #38bdf8;
            --green: #22c55e;
            --red: #ef4444;
            --border: #334155;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 15px;
            line-height: 1.5;
        }
        .container { max-width: 600px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 25px; }
        .header h1 { margin: 0; color: var(--primary); font-size: 24px; }
        .header p { color: #94a3b8; margin: 5px 0 0; font-size: 14px; }
        
        .balance-card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px;
            text-align: center;
            margin-bottom: 20px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        .balance-card .label { color: #94a3b8; font-size: 14px; text-transform: uppercase; }
        .balance-card .amount { font-size: 36px; font-weight: bold; color: var(--green); margin: 10px 0; }
        
        .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 25px;
        }
        .summary-item {
            background: var(--card);
            padding: 12px;
            border-radius: 12px;
            text-align: center;
            border: 1px solid var(--border);
        }
        .summary-item .label { font-size: 12px; color: #94a3b8; display: block; }
        .summary-item .val { font-size: 18px; font-weight: 600; }
        
        .tx-section { margin-top: 30px; }
        .tx-section h3 { font-size: 18px; border-left: 4px solid var(--primary); padding-left: 10px; margin-bottom: 15px; }
        
        .tx-item {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .tx-info { display: flex; flex-direction: column; }
        .tx-time { font-size: 12px; color: #64748b; }
        .tx-op { font-size: 11px; color: #475569; }
        .tx-type { font-weight: 500; font-size: 14px; }
        
        .tx-amount { font-weight: bold; text-align: right; }
        .in { color: var(--green); }
        .out { color: var(--red); }
        
        .btn-download {
            display: block;
            width: 100%;
            background: var(--primary);
            color: #000;
            text-decoration: none;
            text-align: center;
            padding: 12px;
            border-radius: 10px;
            font-weight: bold;
            margin-top: 30px;
        }
        
        .footer { text-align: center; margin-top: 40px; color: #475569; font-size: 11px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>LILY LIVE</h1>
            <p>${group.title} • ${date}</p>
        </div>

        <div class="balance-card">
            <div class="label">当前余额 (Balance)</div>
            <div class="amount">${format(balance)}</div>
        </div>

        <div class="summary-grid">
            <div class="summary-item">
                <span class="label">总入款 (Deposits)</span>
                <span class="val in">${format(totalInRaw)}</span>
            </div>
            <div class="summary-item">
                <span class="label">总下发 (Payouts)</span>
                <span class="val out">-${format(totalOut)}</span>
            </div>
        </div>

        <div class="tx-section">
            <h3>交易明细 (Details)</h3>
            ${txs.length === 0 ? '<p style="text-align:center;color:#64748b;">暂无数据 (No Data)</p>' : txs.map(t => `
                <div class="tx-item">
                    <div class="tx-info">
                        <span class="tx-type">${t.type === 'DEPOSIT' ? '➕ 入款' : t.type === 'PAYOUT' ? '➖ 下发' : '↪️ 回款'}</span>
                        <span class="tx-time">${new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: group.timezone })}</span>
                        <span class="tx-op">Op: ${t.operator_name}</span>
                    </div>
                    <div class="tx-amount ${t.type === 'DEPOSIT' ? 'in' : 'out'}">
                        ${t.type === 'PAYOUT' ? '-' : ''}${format(t.amount_raw)}
                    </div>
                </div>
            `).join('')}
        </div>

        <a href="/pdf/${token}" class="btn-download">📥 导出 PDF 报表 (Export PDF)</a>
        
        <div class="footer">
            Generated by Lily Smartbot • 100% Secure Transaction Reader
        </div>
    </div>
</body>
</html>
        `;

        res.send(html);

    } catch (e) {
        console.error(e);
        res.status(500).send('System Error');
    }
});

/**
 * PDF EXPORT ON-DEMAND Route
 */
app.get('/pdf/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedToken, 'base64').toString('utf-8');
        const [chatIdStr, date, hash] = decoded.split(':');
        const chatId = parseInt(chatIdStr);

        if (!Security.verifyReportToken(chatId, date, hash)) {
            return res.status(403).send('Link Expired');
        }

        const pdf = await PDFExport.generateDailyPDF(chatId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Lily_Report_${date}.pdf`);
        res.send(pdf);

    } catch (e) {
        res.status(500).send('PDF Engine Error');
    }
});

export const startWebServer = () => {
    app.listen(PORT, () => {
        console.log(`🚀 Lily Web Reader is live at port ${PORT}`);
    });
};
