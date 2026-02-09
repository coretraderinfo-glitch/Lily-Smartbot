import express from 'express';
import { db } from '../db';
import { Security } from '../utils/security';
import { getBusinessDate } from '../utils/time';
import { formatNumber } from '../utils/format';
import { PDFExport } from '../core/pdf';
import Decimal from 'decimal.js';
import path from 'path';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Railway provides PORT automatically. If not set (local dev), default to 3000
const PORT = parseInt(process.env.PORT || '3000');

/**
 * THE LILY WEB READER: Secure Financial Platform
 */

app.get('/', (req, res) => res.status(200).send('Lily Financial Services: Online 🟢'));

/**
 * --- 🛡️ ELITE CONTROL PANEL (ADMIN DASHBOARD) ---
 * Provides world-class management for the Lily ecosystem.
 */
app.get('/c/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedToken, 'base64').toString('utf-8');
        const [chatIdStr, userIdStr, hash] = decoded.split(':');
        const chatId = parseInt(chatIdStr);
        const userId = parseInt(userIdStr);

        if (!Security.verifyAdminToken(chatId, userId, hash)) {
            return res.status(403).send('<h1>❌ 凭证无效 (Invalid Session)</h1><p>控制台令牌已过期或无效。</p>');
        }

        // Fetch Group & Settings
        const [groupRes, settingsRes, operatorsRes] = await Promise.all([
            db.query('SELECT title FROM groups WHERE id = $1', [chatId]),
            db.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]),
            db.query('SELECT user_id, username, role FROM group_operators WHERE group_id = $1', [chatId])
        ]);

        const group = groupRes.rows[0];
        const s = settingsRes.rows[0] || {};
        const operators = operatorsRes.rows;

        const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lily Control Panel - ${group?.title || 'Group'}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #030712;
            --card: rgba(17, 24, 39, 0.7);
            --border: rgba(255, 255, 255, 0.1);
            --primary: #38bdf8;
            --accent: #818cf8;
            --success: #10b981;
            --danger: #ef4444;
            --text: #f3f4f6;
            --text-dim: #9ca3af;
        }
        * { box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            background: radial-gradient(circle at top right, #1e1b4b, #030712);
            color: var(--text);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        .container { max-width: 800px; margin: 0 auto; }
        
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 700; background: linear-gradient(90deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .header .status { font-size: 13px; color: var(--success); display: flex; align-items: center; gap: 5px; }
        .header .status::before { content: ""; width: 8px; height: 8px; background: var(--success); border-radius: 50%; box-shadow: 0 0 10px var(--success); }

        .card {
            background: var(--card);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: 24px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .card h2 { font-size: 18px; margin-top: 0; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: var(--primary); }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px; }
        label { font-size: 13px; color: var(--text-dim); font-weight: 500; }
        input, select {
            background: rgba(0,0,0,0.3);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 12px 15px;
            color: white;
            font-family: inherit;
            font-size: 15px;
            transition: all 0.2s;
        }
        input:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2); }
        
        .toggle-container { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.03); margin-bottom: 15px; }
        .toggle-container span { font-size: 15px; }
        .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #334155; transition: .4s; border-radius: 24px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--primary); }
        input:checked + .slider:before { transform: translateX(20px); }

        .btn {
            width: 100%;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            color: #030712;
            border: none;
            border-radius: 14px;
            padding: 15px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            margin-top: 10px;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(56, 189, 248, 0.3); filter: brightness(1.1); }
        .btn:active { transform: translateY(0); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

        .op-list { display: flex; flex-direction: column; gap: 10px; }
        .op-item { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); padding: 10px 15px; border-radius: 12px; border: 1px solid var(--border); }
        .op-info { display: flex; flex-direction: column; }
        .op-name { font-weight: 600; font-size: 14px; }
        .op-role { font-size: 11px; color: var(--text-dim); text-transform: uppercase; }
        .btn-del { background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239,68,68,0.2); padding: 5px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: 0.2s; }
        .btn-del:hover { background: var(--danger); color: white; }

        .toast { position: fixed; bottom: 20px; right: 20px; background: var(--success); color: white; padding: 12px 25px; border-radius: 12px; font-weight: 600; transform: translateY(100px); transition: 0.3s; z-index: 1000; box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
        .toast.show { transform: translateY(0); }
        .toast.error { background: var(--danger); }

        @media (max-width: 600px) {
            .grid { grid-template-columns: 1fr; }
            .header h1 { font-size: 20px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1>${group.title} Dashboard</h1>
                <p style="color: var(--text-dim); margin-top: 5px; font-size: 14px;">Master Control Center</p>
            </div>
            <div class="status">System Syncing</div>
        </div>

        <form id="settingsForm">
            <div class="card">
                <h2>🛰️ AI & Security Controls</h2>
                <div class="toggle-container">
                    <span>AI Brain Enabled (GPT-4o)</span>
                    <label class="switch">
                        <input type="checkbox" name="ai_brain_enabled" ${s.ai_brain_enabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="toggle-container">
                    <span>Guardian Anti-Scam Shield</span>
                    <label class="switch">
                        <input type="checkbox" name="guardian_enabled" ${s.guardian_enabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="toggle-container">
                    <span>Show Decimals in Reports</span>
                    <label class="switch">
                        <input type="checkbox" name="show_decimals" ${s.show_decimals !== false ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="form-group" style="margin-top: 15px;">
                    <label>Report Language (报告语言)</label>
                    <select name="language_mode">
                        <option value="CN" ${s.language_mode === 'CN' ? 'selected' : ''}>中文 (Chinese)</option>
                        <option value="EN" ${s.language_mode === 'EN' ? 'selected' : ''}>English</option>
                        <option value="BM" ${s.language_mode === 'BM' ? 'selected' : ''}>B.Melayu</option>
                    </select>
                </div>
            </div>

            <div class="card">
                <h2>💰 Financial Ticker Rates</h2>
                <div class="grid">
                    <div class="form-group">
                        <label>Deposit Fee % (入款费率)</label>
                        <input type="number" step="0.01" name="rate_in" value="${s.rate_in || 0}">
                    </div>
                    <div class="form-group">
                        <label>Payout Fee % (下发费率)</label>
                        <input type="number" step="0.01" name="rate_out" value="${s.rate_out || 0}">
                    </div>
                </div>
                <div style="height: 15px;"></div>
                <div class="grid">
                    <div class="form-group">
                        <label>USD Exchange Rate</label>
                        <input type="number" step="0.001" name="rate_usd" value="${s.rate_usd || 0}">
                    </div>
                    <div class="form-group">
                        <label>MYR Exchange Rate</label>
                        <input type="number" step="0.001" name="rate_myr" value="${s.rate_myr || 0}">
                    </div>
                </div>
            </div>

            <button type="submit" class="btn" id="saveBtn">💾 SAVE MASTER CONFIG</button>
        </form>

        <div class="card">
            <h2>👥 Team Management</h2>
            <div class="op-list">
                ${operators.length === 0 ? '<p style="text-align:center; color: var(--text-dim);">No operators found.</p>' : operators.map(o => `
                    <div class="op-item">
                        <div class="op-info">
                            <span class="op-name">${o.username || o.user_id}</span>
                            <span class="op-role">${o.role}</span>
                        </div>
                        ${o.role !== 'OWNER' ? `<button class="btn-del" onclick="deleteOp('${o.user_id}')">REMOVE</button>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>

        <p style="text-align:center; color: var(--text-dim); font-size: 12px; margin-top: 40px;">
            World-Class Security Protocol v2.5 • Secured by TLS 1.3
        </p>
    </div>

    <div id="toast" class="toast">Changes Saved Successfully! ✅</div>

    <script>
        const saveBtn = document.getElementById('saveBtn');
        const form = document.getElementById('settingsForm');
        const toast = document.getElementById('toast');

        function showToast(msg, isError = false) {
            toast.textContent = msg;
            toast.className = 'toast' + (isError ? ' error' : '') + ' show';
            setTimeout(() => toast.className = 'toast', 3000);
        }

        form.onsubmit = async (e) => {
            e.preventDefault();
            saveBtn.disabled = true;
            saveBtn.textContent = 'SYNCING...';

            const formData = new FormData(form);
            const data = {
                token: "${token}",
                ai_brain_enabled: form.ai_brain_enabled.checked,
                guardian_enabled: form.guardian_enabled.checked,
                show_decimals: form.show_decimals.checked,
                language_mode: form.language_mode.value,
                rate_in: parseFloat(form.rate_in.value),
                rate_out: parseFloat(form.rate_out.value),
                rate_usd: parseFloat(form.rate_usd.value),
                rate_myr: parseFloat(form.rate_myr.value)
            };

            try {
                const res = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (res.ok) {
                    showToast('Settings Synced with Lily! 🚀');
                } else {
                    showToast('Authorization Failed.', true);
                }
            } catch (err) {
                showToast('Network Error.', true);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 SAVE MASTER CONFIG';
            }
        };

        async function deleteOp(id) {
            if (!confirm('Are you sure you want to remove this operator?')) return;
            
            try {
                const res = await fetch('/api/operator/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: "${token}", target_id: id })
                });
                if (res.ok) {
                    location.reload();
                } else {
                    showToast('Failed to remove.', true);
                }
            } catch (err) {}
        }
    </script>
</body>
</html>
        `;
        res.send(html);
    } catch (e) {
        console.error(e);
        res.status(500).send('Fatal Error accessing Control Panel');
    }
});

/**
 * --- 🛡️ API HANDLERS ---
 */
app.post('/api/save', async (req, res) => {
    const { token, ...settings } = req.body;
    try {
        const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedToken, 'base64').toString('utf-8');
        const [chatIdStr, userIdStr, hash] = decoded.split(':');
        const chatId = parseInt(chatIdStr);
        const userId = parseInt(userIdStr);

        if (!Security.verifyAdminToken(chatId, userId, hash)) {
            return res.status(403).json({ error: 'Auth Failed' });
        }

        await db.query(`
            UPDATE group_settings SET
                ai_brain_enabled = $1,
                guardian_enabled = $2,
                show_decimals = $3,
                language_mode = $4,
                rate_in = $5,
                rate_out = $6,
                rate_usd = $7,
                rate_myr = $8,
                updated_at = NOW()
            WHERE group_id = $9
        `, [
            settings.ai_brain_enabled,
            settings.guardian_enabled,
            settings.show_decimals,
            settings.language_mode,
            settings.rate_in,
            settings.rate_out,
            settings.rate_usd,
            settings.rate_myr,
            chatId
        ]);

        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database Error' });
    }
});

app.post('/api/operator/delete', async (req, res) => {
    const { token, target_id } = req.body;
    try {
        const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedToken, 'base64').toString('utf-8');
        const [chatIdStr, userIdStr, hash] = decoded.split(':');
        const chatId = parseInt(chatIdStr);
        const userId = parseInt(userIdStr);

        if (!Security.verifyAdminToken(chatId, userId, hash)) {
            return res.status(403).json({ error: 'Auth Failed' });
        }

        await db.query('DELETE FROM group_operators WHERE group_id = $1 AND user_id = $2 AND role != $3', [chatId, target_id, 'OWNER']);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Database Error' });
    }
});

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

        // Active Rates Logic for Web View
        const activeRates: { rate: Decimal, code: string }[] = [];
        if (new Decimal(settings.rate_usd || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_usd), code: 'USD' });
        if (new Decimal(settings.rate_myr || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_myr), code: 'MYR' });
        if (new Decimal(settings.rate_php || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_php), code: 'PHP' });
        if (new Decimal(settings.rate_thb || 0).gt(0)) activeRates.push({ rate: new Decimal(settings.rate_thb), code: 'THB' });

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
            ${activeRates.map(r => `<div style="font-size: 14px; opacity: 0.8;">${format(balance.div(r.rate))} ${r.code}</div>`).join('')}
        </div>

        <div class="summary-grid">
            <div class="summary-item">
                <span class="label">总入款 (Deposits)</span>
                <span class="val in">${format(totalInRaw)}</span>
                ${activeRates.map(r => `<div style="font-size: 11px; opacity: 0.7;">${format(totalInRaw.div(r.rate))} ${r.code}</div>`).join('')}
            </div>
            <div class="summary-item">
                <span class="label">总下发 (Payouts)</span>
                <span class="val out">-${format(totalOut)}</span>
                ${activeRates.map(r => `<div style="font-size: 11px; opacity: 0.7;">-${format(totalOut.div(r.rate))} ${r.code}</div>`).join('')}
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
                        ${new Decimal(t.amount_raw).lt(0) ? `(${format(new Decimal(t.amount_raw).abs())})` : `${t.type === 'PAYOUT' ? '-' : ''}${format(t.amount_raw)}`}
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
