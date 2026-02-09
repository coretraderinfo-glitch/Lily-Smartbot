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

// Serve Static Assets (Styles/Scripts)
app.use(express.static(path.join(__dirname, 'frontend')));

const PORT = parseInt(process.env.PORT || '3000');

app.get('/', (req, res) => res.status(200).send('Lily API: Online 🟢'));

/**
 * --- 🛡️ CONTROL PANEL ROUTES ---
 */
app.get('/c/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/control.html'));
});

app.get('/api/data/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedToken, 'base64').toString('utf-8');
        const [chatIdStr, userIdStr, hash] = decoded.split(':');
        const chatId = parseInt(chatIdStr);
        const userId = parseInt(userIdStr);

        if (!Security.verifyAdminToken(chatId, userId, hash)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const [groupRes, settingsRes, operatorsRes] = await Promise.all([
            db.query('SELECT title FROM groups WHERE id = $1', [chatId]),
            db.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]),
            db.query('SELECT user_id, username, role FROM group_operators WHERE group_id = $1', [chatId])
        ]);

        res.json({
            group: groupRes.rows[0] || { title: 'Unknown Group' },
            settings: settingsRes.rows[0] || {},
            operators: operatorsRes.rows
        });
    } catch (e) {
        res.status(500).json({ error: 'System Error' });
    }
});

/**
 * --- 📊 LIVE VIEW ROUTES ---
 */
app.get('/v/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/report.html'));
});

app.get('/api/view/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedToken, 'base64').toString('utf-8');
        const [chatIdStr, date, hash] = decoded.split(':');
        const chatId = parseInt(chatIdStr);

        if (!Security.verifyReportToken(chatId, date, hash)) {
            return res.status(403).json({ error: 'Expired' });
        }

        const groupRes = await db.query('SELECT title, timezone, reset_hour FROM groups WHERE id = $1', [chatId]);
        const group = groupRes.rows[0];

        const txRes = await db.query(`
            SELECT * FROM transactions 
            WHERE group_id = $1 AND business_date = $2 
            ORDER BY recorded_at ASC
        `, [chatId, date]);

        const settingsRes = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId]);
        const s = settingsRes.rows[0] || {};
        const showDecimals = s.show_decimals !== false;

        const txs = txRes.rows;
        let totalInRaw = new Decimal(0);
        let totalInNet = new Decimal(0);
        let totalOut = new Decimal(0);
        let totalReturn = new Decimal(0);

        txs.forEach(t => {
            const amount = new Decimal(t.amount_raw);
            const net = new Decimal(t.net_amount || 0);
            if (t.type === 'DEPOSIT') { totalInRaw = totalInRaw.add(amount); totalInNet = totalInNet.add(net); }
            else if (t.type === 'PAYOUT') { totalOut = totalOut.add(amount.add(t.fee_amount || 0)); }
            else if (t.type === 'RETURN') { totalReturn = totalReturn.add(amount); }
        });

        const balance = totalInNet.sub(totalOut).add(totalReturn);
        const format = (val: Decimal | number) => formatNumber(new Decimal(val), showDecimals ? 2 : 0);

        const convs = [];
        if (new Decimal(s.rate_usd || 0).gt(0)) convs.push({ val: format(balance.div(s.rate_usd)), code: 'USD' });
        if (new Decimal(s.rate_myr || 0).gt(0)) convs.push({ val: format(balance.div(s.rate_myr)), code: 'MYR' });

        res.json({
            group: { title: group.title },
            date,
            balance: format(balance),
            summary: { in: format(totalInRaw), out: format(totalOut) },
            conversions: convs,
            transactions: txs.map(t => ({
                type: t.type,
                amount: format(t.amount_raw),
                time: new Date(t.recorded_at).toLocaleTimeString('en-GB', { hour12: false, timeZone: group.timezone }),
                op: t.operator_name
            }))
        });
    } catch (e) {
        res.status(500).json({ error: 'System Error' });
    }
});

/**
 * --- 🛡️ API COMMANDS ---
 */
app.post('/api/save', async (req, res) => {
    const { token, ...settings } = req.body;
    try {
        const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedToken, 'base64').toString('utf-8');
        const [chatIdStr, userIdStr, hash] = decoded.split(':');
        const chatId = parseInt(chatIdStr);
        const userId = parseInt(userIdStr);

        if (!Security.verifyAdminToken(chatId, userId, hash)) return res.status(403).json({ error: 'Auth Failed' });

        await db.query(`
            UPDATE group_settings SET
                ai_brain_enabled = $1, guardian_enabled = $2, show_decimals = $3,
                language_mode = $4, rate_in = $5, rate_out = $6,
                rate_usd = $7, rate_myr = $8, updated_at = NOW()
            WHERE group_id = $9
        `, [
            settings.ai_brain_enabled, settings.guardian_enabled, settings.show_decimals,
            settings.language_mode, settings.rate_in, settings.rate_out,
            settings.rate_usd, settings.rate_myr, chatId
        ]);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'DB Error' });
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

        if (!Security.verifyAdminToken(chatId, userId, hash)) return res.status(403).json({ error: 'Auth Failed' });

        await db.query('DELETE FROM group_operators WHERE group_id = $1 AND user_id = $2 AND role != $3', [chatId, target_id, 'OWNER']);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'DB Error' });
    }
});

app.get('/pdf/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedToken, 'base64').toString('utf-8');
        const [chatIdStr, date, hash] = decoded.split(':');
        const chatId = parseInt(chatIdStr);
        if (!Security.verifyReportToken(chatId, date, hash)) return res.status(403).send('Link Expired');
        const pdf = await PDFExport.generateDailyPDF(chatId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Lily_Report_${date}.pdf`);
        res.send(pdf);
    } catch (e) {
        res.status(500).send('PDF Error');
    }
});

export const startWebServer = () => {
    app.listen(PORT, () => console.log(`🚀 Lily Web Server is live at port ${PORT}`));
};
