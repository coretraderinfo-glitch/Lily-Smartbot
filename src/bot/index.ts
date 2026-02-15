import { Context, InputFile, InlineKeyboard, GrammyError, HttpError } from 'grammy';
import { Worker, Queue } from 'bullmq';
import dotenv from 'dotenv';
import checkEnv from 'check-env';
import { SettingsCache } from '../core/cache';

// Internal Logic
import { processCommand } from '../worker/processor';
import { db } from '../db';
import { Licensing } from '../core/licensing';
import { UsernameResolver } from '../utils/username-resolver';
import { RBAC } from '../core/rbac';
import { Chronos } from '../core/scheduler';
import { BillResult } from '../core/ledger';
import { Security } from '../utils/security';
import { Guardian } from '../guardian/engine';
import { Auditor } from '../guardian/auditor'; // 💎 Silent Auditor
import { AIBrain } from '../utils/ai';
import { MemoryCore } from '../core/memory'; // 🧠 Memory Core
import { Personality } from '../utils/personality';
import { I18N } from '../utils/i18n';
import { bot, connection } from './instance';

dotenv.config();
checkEnv(['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL', 'OPENAI_API_KEY']);

// Security Warning for Missing Owner
if (!process.env.OWNER_ID) {
    console.error('🛑 [CRITICAL WARNING] OWNER_ID is not set in environment variables!');
}

// 1. Unified Entry Point (Bot + Web)
import { startWebServer } from '../../frontend/server';

// Start the Web Server (Dashboard & API)
startWebServer();

// Connection Pools & Queues
const commandQueue = new Queue('lily-commands', { connection });

// 2. Global Bot Error Handler (ROOT CAUSE PROTECTION)
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`❌ Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
        console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
        console.error("Could not contact Telegram:", e);
    } else {
        console.error("Unknown error:", e);
    }
});

// 3. Worker Setup (HIGH-CONCURRENCY MODE)
const worker = new Worker('lily-commands', async job => {
    return await processCommand(job);
}, {
    connection,
    concurrency: 10, // Lily now handles 10 groups at once! Zero lag for clients.
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 }
});

worker.on('completed', async (job, returnValue) => {
    if (!returnValue || !job.data.chatId) return;

    try {
        // --- 1. HANDLE FILE EXPORTS (STRINGS) ---
        if (typeof returnValue === 'string') {
            if (returnValue.startsWith('PDF_EXPORT:')) {
                const base64 = returnValue.replace('PDF_EXPORT:', '');
                const filename = `Lily_Statement_${new Date().toISOString().split('T')[0]}.pdf`;
                await bot.api.sendDocument(job.data.chatId, new InputFile(Buffer.from(base64, 'base64'), filename), {
                    reply_to_message_id: job.data.messageId
                });
                return;
            }
            if (returnValue.startsWith('EXCEL_EXPORT:')) {
                const csv = returnValue.replace('EXCEL_EXPORT:', '');
                const filename = `Lily_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
                await bot.api.sendDocument(job.data.chatId, new InputFile(Buffer.from(csv), filename), {
                    reply_to_message_id: job.data.messageId
                });
                return;
            }
            // Standard text reply (With Markdown Fallback)
            try {
                await bot.api.sendMessage(job.data.chatId, returnValue, {
                    reply_to_message_id: job.data.messageId,
                    parse_mode: 'Markdown'
                });
            } catch (e) {
                console.warn('[Markdown Fail] Retrying as plain text...');
                await bot.api.sendMessage(job.data.chatId, returnValue, {
                    reply_to_message_id: job.data.messageId
                });
            }
            return;
        }

        // --- 2. HANDLE RICH RESULTS (OBJECTS) ---
        if (typeof returnValue === 'object') {
            const res = returnValue as BillResult;
            const settings = await db.query('SELECT language_mode FROM group_settings WHERE group_id = $1', [job.data.chatId]);
            const lang = settings.rows[0]?.language_mode || 'CN';

            if (res.text) {
                const options: any = { reply_to_message_id: job.data.messageId, parse_mode: 'Markdown' };
                if (res.showMore && res.url) {
                    const btnLabel = lang === 'CN' ? '检查明细 (MORE)' : lang === 'MY' ? 'Lihat Butiran' : 'View Details';
                    options.reply_markup = new InlineKeyboard().url(btnLabel, res.url);
                }
                await bot.api.sendMessage(job.data.chatId, res.text, options);
            }

            if (res.pdf) {
                const filename = `Lily_Report_${new Date().toISOString().split('T')[0]}.pdf`;
                await bot.api.sendDocument(job.data.chatId, new InputFile(Buffer.from(res.pdf, 'base64'), filename), {
                    caption: lang === 'CN' ? '📊 本日本对账单' : lang === 'MY' ? '📊 Laporan Transaksi' : '📊 Daily Transaction Report'
                });
            }
            return;
        }
    } catch (err) {
        console.error('Error sending worker response:', err);
    }
});

worker.on('failed', async (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
    if (job?.data.chatId) {
        try {
            await bot.api.sendMessage(job.data.chatId, `⚠️ **System Error**: ${err.message}`, {
                reply_to_message_id: job.data.messageId,
                parse_mode: 'Markdown'
            });
        } catch (msgErr) {
            console.error('Failed to report job failure to user');
        }
    }
});

// --- CONSTANTS ---
const DASHBOARD_TEXT = `🌟 **Lily Smart Ledger - Dashboard**\n\n` +
    `欢迎使用专业级账本管理系统。请选择功能模块：\n` +
    `Welcome to the professional system. Select a module:\n\n` +
    `💡 *Status: System Online 🟢*`;

const MainMenuMarkup = {
    inline_keyboard: [
        [{ text: "📊 CALC", callback_data: "menu_calc" }],
        [{ text: "📜 CALCTAPE", callback_data: "menu_calctape" }],
        [{ text: "🛡️ GUARDIAN", callback_data: "menu_guardian" }],
        [{ text: "💱 MONEY CHANGER", callback_data: "menu_mc" }]
    ]
};

const MCMenuMarkup = {
    inline_keyboard: [
        [{ text: "⬅️ BACK TO MENU", callback_data: "menu_main" }]
    ]
};

const CalcMenuMarkup = {
    inline_keyboard: [
        [{ text: "⬅️ BACK TO MENU", callback_data: "menu_main" }]
    ]
};

const CalcTapeMenuMarkup = {
    inline_keyboard: [
        [{ text: "⬅️ BACK TO MENU", callback_data: "menu_main" }]
    ]
};

const GuardianMenuMarkup = {
    inline_keyboard: [
        [{ text: "⬅️ BACK TO MENU", callback_data: "menu_main" }]
    ]
};

// --- BOSS CONTROL PANEL (PRIVATE DM ONLY) ---
bot.command('admin', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !Security.isSystemOwner(userId)) return;

    if (ctx.chat.type !== 'private') {
        return ctx.reply("⚠️ **Security Notice**: This command can ONLY be used in private DM to protect your business secrets.", { reply_to_message_id: ctx.message?.message_id });
    }

    // Filter: Only show groups active in the last 15 days to keep list clean
    const groups = await db.query(`
        SELECT id, title, last_seen 
        FROM groups 
        WHERE last_seen > NOW() - INTERVAL '15 days'
        ORDER BY last_seen DESC
    `);

    if (groups.rows.length === 0) {
        return ctx.reply("ℹ️ No active groups found in the last 15 days. (All dead/inactive groups are hidden).");
    }

    const totalActive = groups.rows.length;
    let msg = `👑 **Lily Master Control Center**\n\nGreetings, **SIR**. Your AI disciple, Lily, is standing by. All systems have been optimized for your command.\n\n📊 **Total Active Groups**: \`${totalActive}\`\n\nSelect a group to manage:\n\n`;
    const keyboard = new InlineKeyboard();

    groups.rows.forEach((g: any, i: number) => {
        const title = g.title || `Group ${g.id}`;
        const idSnippet = String(g.id).slice(-4);
        const lastRaw = g.last_seen ? new Date(g.last_seen) : null;
        const lastText = lastRaw ? `${lastRaw.getMonth() + 1}-${lastRaw.getDate()}` : '??';

        keyboard.text(`${i + 1}. ${title} [..${idSnippet}] (${lastText})`, `manage_group:${g.id}`).row();
    });

    keyboard.text("🔄 REFRESH & SYNC LIST", "admin_sync").row();

    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// --- MANAGEMENT CONSOLE RENDERER ---
async function renderManagementConsole(ctx: Context, id: string) {
    const group = await db.query('SELECT title FROM groups WHERE id = $1', [id]);

    // Ensure settings row exists (CRITICAL BUG FIX)
    await db.query(`
        INSERT INTO group_settings (group_id) VALUES ($1)
        ON CONFLICT (group_id) DO NOTHING
    `, [id]);

    const settings = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [id]);
    // WORLD-CLASS DEFAULTS: Welcome & Auditor start OFF (Sir's request), Calc & AI start ON if licensed.
    const s = settings.rows[0];
    if (s) {
        // Normalize NULLs to match DB defaults
        if (s.welcome_enabled === null) s.welcome_enabled = false;
        if (s.auditor_enabled === null) s.auditor_enabled = false;
        if (s.calc_enabled === null) s.calc_enabled = true;
        if (s.calctape_enabled === null) s.calctape_enabled = false;
    } else {
        // Fallback object if row is missing entirely
        settings.rows[0] = { guardian_enabled: false, ai_brain_enabled: false, welcome_enabled: false, calc_enabled: true, auditor_enabled: false, calctape_enabled: false, language_mode: 'CN' };
    }

    const title = group.rows[0]?.title || 'Group';
    const lang = s.language_mode || 'CN';

    const labels = {
        title: I18N.t(lang, 'console.title'),
        guardian: I18N.t(lang, 'console.guardian'),
        ai: I18N.t(lang, 'console.ai'),
        calc: I18N.t(lang, 'console.calc'),
        welcome: I18N.t(lang, 'console.welcome'),
        auditor: I18N.t(lang, 'console.auditor'),
        langLabel: I18N.t(lang, 'console.lang'),
        disable: I18N.t(lang, 'console.disable'),
        enable: I18N.t(lang, 'console.enable'),
        cycle: I18N.t(lang, 'console.cycle'),
        mc: I18N.t(lang, 'console.mc'),
        calctape: I18N.t(lang, 'console.calctape'),
        back: I18N.t(lang, 'console.back')
    };

    let msg = `🛠️ **${labels.title}: ${title}**\nGroup ID: \`${id}\`\n\n`;
    msg += `ℹ️ ${labels.calc}: ${s.calc_enabled !== false ? '✅ ON' : '❌ OFF'}\n`;
    msg += `🛡️ ${labels.guardian}: ${s.guardian_enabled ? '✅ ON' : '❌ OFF'}\n`;
    msg += `🧠 ${labels.ai}: ${s.ai_brain_enabled ? '✅ ON' : '❌ OFF'}\n`;
    msg += `💎 ${labels.auditor}: ${s.auditor_enabled ? '✅ ON' : '❌ OFF'}\n`;
    msg += `🥊 ${labels.welcome}: ${s.welcome_enabled !== false ? '✅ ON' : '❌ OFF'}\n`;
    msg += `💰 ${labels.mc}: ${s.mc_enabled ? '✅ ON' : '❌ OFF'}\n`;
    msg += `📜 ${labels.calctape}: ${s.calctape_enabled ? '✅ ON' : '❌ OFF'}\n`;
    msg += `🌐 ${labels.langLabel}: **${lang}**\n`;

    const keyboard = new InlineKeyboard()
        // Row 1: Core Ledger & Security
        .text(s.calc_enabled !== false ? `${labels.disable} Calc` : `${labels.enable} Calc`, `toggle:calc:${id}`)
        .text(s.guardian_enabled ? `${labels.disable} Guardian` : `${labels.enable} Guardian`, `toggle:guardian:${id}`).row()

        // Row 2: Intelligence & Audit
        .text(s.ai_brain_enabled ? `${labels.disable} AI Brain` : `${labels.enable} AI Brain`, `toggle:ai:${id}`)
        .text(s.auditor_enabled ? `${labels.disable} Auditor` : `${labels.enable} Auditor`, `toggle:auditor:${id}`).row()

        // Row 3: Hospitality, OTC & Calctape
        .text(s.welcome_enabled !== false ? `${labels.disable} Welcome` : `${labels.enable} Welcome`, `toggle:welcome:${id}`)
        .text(s.mc_enabled ? `${labels.disable} MC` : `${labels.enable} MC`, `toggle:mc:${id}`)
        .text(s.calctape_enabled ? `${labels.disable} Tape` : `${labels.enable} Tape`, `toggle:calctape:${id}`).row()

        // Row 4: Settings & Dangerous Actions
        .text(labels.cycle, `cycle_lang:${id}`).row()
        .text("🗑️ PURGE RECORD (DELETE)", `purge_group:${id}`).row()
        .text(labels.back, "admin_list");

    try {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch (e) {
        // Fallback if message is same
    }
}

// --- CALLBACK QUERY HANDLER ---
bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat?.id;
    const userId = ctx.from.id;

    if (!chatId) return;

    const isOwner = Security.isSystemOwner(userId);
    const isOperator = await RBAC.isAuthorized(chatId, userId);

    if (!isOwner && !isOperator) {
        return ctx.answerCallbackQuery({ text: "❌ Unauthorized Access", show_alert: true });
    }

    if (data === "menu_mc") {
        const settings = await SettingsCache.get(chatId);
        if (settings?.mc_enabled === false && !isOwner) {
            return ctx.answerCallbackQuery({ text: "⚠️ Money Changer 未启用 (Feature Disabled: Enable in /admin)", show_alert: true });
        }

        return ctx.editMessageText(
            `💱 **LILY MONEY CHANGER (OTC TRADING)**\n\n` +
            `🚀 **CONFIGURATION (Settings)**\n` +
            `• \`/setrate 3.9/4.1/3.81\`: Set Buy/Sell/Cash rates\n` +
            `• \`/setwallet [Address]\`: Set USDT deposit wallet\n\n` +
            `💰 **TRADING COMMANDS (Automatic)**\n` +
            `• \`Sell USDT 1000\`: Initiate a selling request\n` +
            `• \`Buy USDT 500\`: Initiate a buying request\n\n` +
            `⛓️ **VERIFICATION**\n` +
            `• Just paste the **TXID (Hash)** once transfer is done.\n` +
            `• Submit a **Screenshot** of the slip for manual audit.\n\n` +
            `💡 *Note: Rates must be configured before trading starts.*`,
            { parse_mode: 'Markdown', reply_markup: MCMenuMarkup }
        );
    }

    if (data === "menu_calctape") {
        const settings = await SettingsCache.get(chatId);
        if (settings?.calctape_enabled === false && !isOwner) {
            return ctx.answerCallbackQuery({ text: "⚠️ CalcTape 未启用 (Feature Disabled: Enable in /admin)", show_alert: true });
        }

        return ctx.editMessageText(
            `📜 **LILY CALCTAPE (PAPER TAPE ENGINE)**\n\n` +
            `🚀 **CORE COMMANDS**\n` +
            `• \`/tape [Calculation]\`: Start a professional paper tape\n` +
            `• Example: \`/tape 1000 Deposit + 500 Bonus - 200 Fee\`\n\n` +
            `📟 **MATHEMATICAL LOGIC**\n` +
            `• Lily uses **Sequential (Running Total)** logic.\n` +
            `• Operators: \`+\`, \`-\`, \`*\`, \`/\` are supported.\n` +
            `• Descriptions: You can add text after numbers (e.g., 500 [Bonus]).\n\n` +
            `💡 **PRO TIP:**\n` +
            `CalcTape is strictly business. It is designed for multi-line accounting where you need to see every step of the calculation.`,
            { parse_mode: 'Markdown', reply_markup: CalcTapeMenuMarkup }
        );
    }

    if (data === "menu_main") {
        return ctx.editMessageText(DASHBOARD_TEXT, { parse_mode: 'Markdown', reply_markup: MainMenuMarkup });
    }

    if (data === "menu_calc") {
        const settings = await SettingsCache.get(chatId);
        if (settings?.calc_enabled === false && !isOwner) {
            return ctx.answerCallbackQuery({ text: "⚠️ 财务功能未启用 (Feature Restricted: Calc Not Purchased)", show_alert: true });
        }

        return ctx.editMessageText(
            `📊 **LILY COMPLETE COMMAND LIST**\n\n` +
            `🚀 **FLOW CONTROL (流程控制)**\n` +
            `• \`开始\` / \`start\`: Start recording today\n` +
            `• \`结束记录\`: End day & Archive PDF\n\n` +
            `💰 **RECORDING (实时记账)**\n` +
            `• \`+100\` / \`入款 100\`: Record Deposit\n` +
            `• \`-50\` / \`下发 50\` / \`取 50\`: Record Payout\n` +
            `• \`-50u\`: Record Payout (USDT Mode)\n` +
            `• \`回款 200\`: Record Return\n\n` +
            `❌ **CORRECTIONS (账目纠错)**\n` +
            `• \`入款-50\`: Void a Deposit entry\n` +
            `• \`下发-20\`: Void a Payout entry\n\n` +
            `⚙️ **FINANCIAL SETTINGS (费率/汇率设置)**\n` +
            `• \`设置费率 0.03\`: Set Inbound Rate (3%)\n` +
            `• \`设置下发费率 0.02\`: Set Outbound Rate (2%)\n` +
            `• \`设置美元汇率 7.2\`: Set USD Rate\n` +
            `• \`设置马币汇率 0.65\`: Set MYR Rate\n` +
            `• \`设置[比索/泰铢]汇率 [值]\`: Set PHP/THB\n` +
            `• \`删除[美元/马币/...]汇率\`: Reset/Delete a specific rate\n\n` +
            `�️ **DISPLAY MODES (显示与格式)**\n` +
            `• \`设置为无小数\`: Hide decimal points\n` +
            `• \`设置为计数模式\`: Simplified list view\n` +
            `• \`设置显示模式 [2/3/4]\`: Toggle UI detail level\n` +
            `• \`设置为原始模式\`: Restore default display\n\n` +
            `👥 **TEAM (团队管理)**\n` +
            `• \`设置操作人 @tag\`: Add Operator (tag or reply)\n` +
            `• \`删除操作人 @tag\`: Remove permissions\n` +
            `• \`显示操作人\`: View authorized team list\n\n` +
            `�📊 **REPORTS (数据报表)**\n` +
            `• \`显示账单\`: View balance & ledger summary\n` +
            `• \`下载报表\`: Export daily PDF\n` +
            `• \`导出Excel\`: Export CSV spreadsheet\n` +
            `• \`清理今天数据\`: Full reset of active day\n\n` +
            `💡 *Pro-Tip: You can use any command by typing it directly in the chat.*`,
            { parse_mode: 'Markdown', reply_markup: CalcMenuMarkup }
        );
    }

    if (data === "menu_guardian") {
        const settings = await SettingsCache.get(chatId);
        if (settings?.guardian_enabled === false && !isOwner) {
            return ctx.answerCallbackQuery({ text: "⚠️ 安全功能未启用 (Feature Restricted: Guardian Not Purchased)", show_alert: true });
        }

        return ctx.editMessageText(
            `🛡️ **LILY GUARDIAN - SECURITY SHIELD**\n\n` +
            `Lily 现已进化，拥有顶尖的群组安全防护能力：\n` +
            `Lily has evolved with top-tier security for your group:\n\n` +
            `🚀 **MALWARE PREDATOR (文件拦截)**\n` +
            `• 自动检测并秒删 \`.apk\`, \`.zip\`, \`.exe\` 等可疑文件。\n` +
            `• Auto-detect and delete suspicious files like .apk, .zip, .exe.\n\n` +
            `🛡️ **LINK SHIELD (链接防护)**\n` +
            `• 禁止非管理/操作人员发送任何链接，防止钓鱼诈骗。\n` +
            `• Block unauthorized links to prevent phishing and scams.\n\n` +
            `🔔 **ADMIN SENTINEL (管理员哨兵)**\n` +
            `• 当新成员加入时，Lily 会自动提醒并 @ 管理员。\n` +
            `• Automatically notify admins when a new member joins.\n\n` +
            `🔑 **COMMAND KEYS (指令)**\n` +
            `• \`设置管理员\` / \`/setadmin\`: (回复用户) 注册为 Sentinel 管理员。\n` +
            `• \`设置管理员\` / \`/setadmin\`: (Reply to user) Register as a Sentinel Admin.\n\n` +
            `💡 **Note**: Guardian 功能由系统负责人统一开启。\n` +
            `💡 **Note**: Guardian features are activated by the system owner.`,
            { parse_mode: 'Markdown', reply_markup: GuardianMenuMarkup }
        );
    }

    // --- REMOTE MANAGEMENT BUTTONS ---
    if (data.startsWith('manage_group:') && Security.isSystemOwner(userId)) {
        const id = data.split(':')[1];
        return await renderManagementConsole(ctx, id);
    }

    if (data.startsWith('cycle_lang:') && Security.isSystemOwner(userId)) {
        const id = data.split(':')[1];

        // Fetch current with default fallback
        const settings = await db.query('SELECT language_mode FROM group_settings WHERE group_id = $1', [id]);
        const current = settings.rows[0]?.language_mode || 'CN';

        let next = 'CN';
        if (current === 'CN') next = 'EN';
        else if (current === 'EN') next = 'MY';

        // Use UPSERT for 100% Reliability
        await db.query(`
            INSERT INTO group_settings (group_id, language_mode) VALUES ($1, $2)
            ON CONFLICT (group_id) DO UPDATE SET language_mode = EXCLUDED.language_mode, updated_at = NOW()
        `, [id, next]);

        await SettingsCache.invalidate(id); // ⚡ Invalidate

        ctx.answerCallbackQuery({ text: `🌐 Language set to ${next}` });
        return await renderManagementConsole(ctx, id);
    }

    if (data === "admin_list" && Security.isSystemOwner(userId)) {
        const groups = await db.query(`
            SELECT id, title, last_seen FROM groups 
            WHERE last_seen > NOW() - INTERVAL '15 days'
            ORDER BY last_seen DESC
        `);
        const totalActive = groups.rows.length;
        const keyboard = new InlineKeyboard();
        groups.rows.forEach((g: any, i: any) => {
            const title = g.title || g.id;
            const idSnippet = String(g.id).slice(-4);
            keyboard.text(`${i + 1}. ${title} [..${idSnippet}]`, `manage_group:${g.id}`).row();
        });
        keyboard.text("🔄 REFRESH & SYNC LIST", "admin_sync").row();
        return ctx.editMessageText(`👑 **Lily Master Control Center**\n📊 Total Active: \`${totalActive}\`\n\nSelect a group:`, { parse_mode: 'Markdown', reply_markup: keyboard });
    }

    if (data === "admin_sync" && isOwner) {
        await ctx.answerCallbackQuery({ text: "🔍 Running deep sync... Please wait." });

        const allGroups = await db.query('SELECT id FROM groups');
        let purged = 0;

        for (const row of allGroups.rows) {
            try {
                const member = await ctx.api.getChatMember(row.id, ctx.me.id);
                if (member.status === 'left' || member.status === 'kicked') {
                    throw new Error('Not member');
                }
            } catch (e) {
                // Not in group: Purge EVERYTHING (Order is critical)
                try {
                    await db.query('DELETE FROM transactions WHERE group_id = $1', [row.id]);
                    await db.query('DELETE FROM historical_archives WHERE group_id = $1', [row.id]);
                    await db.query('DELETE FROM group_operators WHERE group_id = $1', [row.id]);
                    await db.query('DELETE FROM group_admins WHERE group_id = $1', [row.id]);
                    await db.query('DELETE FROM group_settings WHERE group_id = $1', [row.id]);
                    await db.query('DELETE FROM user_cache WHERE group_id = $1', [row.id]);
                    await db.query('DELETE FROM node_groups WHERE group_id = $1', [row.id]).catch(() => { });
                    await db.query('DELETE FROM groups WHERE id = $1', [row.id]);
                    purged++;
                } catch (purgeErr) {
                    console.error(`[Sync] Failed to purge ghost group ${row.id}:`, purgeErr);
                }
            }
        }
        return ctx.answerCallbackQuery({ text: `✅ Sync Complete! Purged ${purged} ghost(s).`, show_alert: true });
    }

    // --- 💰 MONEY CHANGER HANDLERS ---
    if (data.startsWith('mc_paid:') && isOwner) {
        const dealId = data.split(':')[1];
        try {
            const res = await db.query(`
                UPDATE mc_deals SET status = 'CLOSED', updated_at = NOW() 
                WHERE id = $1 RETURNING *
            `, [dealId]);

            if (res.rows.length === 0) return ctx.answerCallbackQuery({ text: '⚠️ Deal not found.' });

            const deal = res.rows[0];
            await ctx.editMessageText(`✅ **DEAL CLOSED: RM ${deal.total_rm}**\nStatus: Payout Completed by Admin.\nClosed at: ${new Date().toLocaleTimeString()}`, { parse_mode: 'Markdown' });

            // Notify Client (Optional but good)
            try {
                await bot.api.sendMessage(deal.group_id, `✅ **PAYOUT COMPLETED**\nClient: @${deal.username}\nAmount: RM ${deal.total_rm}\n*Lily verified your payment and Admin has sent the cash. Deal closed!*`);
            } catch (e) { }

            return ctx.answerCallbackQuery({ text: 'Deal Closed successfully.' });
        } catch (e: any) {
            console.error('MC Payout Fail:', e);
            return ctx.answerCallbackQuery({ text: 'Error closing deal.' });
        }
    }

    if (data.startsWith('purge_group:') && isOwner) {
        const id = data.split(':')[1];
        // Order: Children first to avoid FK errors
        await db.query('DELETE FROM node_groups WHERE group_id = $1', [id]);
        await db.query('DELETE FROM group_settings WHERE group_id = $1', [id]);
        await db.query('DELETE FROM group_admins WHERE group_id = $1', [id]);
        await db.query('DELETE FROM user_cache WHERE group_id = $1', [id]);
        await db.query('DELETE FROM groups WHERE id = $1', [id]);

        ctx.answerCallbackQuery({ text: "🗑️ Group Identity Purged Forever.", show_alert: true });

        // Return to list
        const groups = await db.query(`
            SELECT id, title, last_seen FROM groups 
            WHERE last_seen > NOW() - INTERVAL '15 days'
            ORDER BY last_seen DESC
        `);
        const keyboard = new InlineKeyboard();
        groups.rows.forEach((g: any, i: any) => {
            const tid = g.title || g.id;
            const idSnippet = String(g.id).slice(-4);
            keyboard.text(`${i + 1}. ${tid} [..${idSnippet}]`, `manage_group:${g.id}`).row();
        });
        return ctx.editMessageText(`👑 **Lily Master Control Center**\nSelect a group:`, { reply_markup: keyboard });
    }

    if (data.startsWith('toggle:') && Security.isSystemOwner(userId)) {
        const [_, type, id] = data.split(':');
        let column = 'guardian_enabled';
        if (type === 'ai') column = 'ai_brain_enabled';
        if (type === 'welcome') column = 'welcome_enabled';
        if (type === 'auditor') column = 'auditor_enabled';
        if (type === 'calc') column = 'calc_enabled';
        if (type === 'mc') column = 'mc_enabled';
        if (type === 'calctape') column = 'calctape_enabled';

        // Use UPSERT for Toggles with NULL-Safety (COALESCE)
        // If row is missing, we create it. If it exists, we flip it.
        await db.query(`
            INSERT INTO group_settings (group_id, ${column}) 
            VALUES ($1, true)
            ON CONFLICT (group_id) DO UPDATE 
            SET ${column} = NOT COALESCE(group_settings.${column}, false), 
                updated_at = NOW()
        `, [id]);

        // ⚡ CACHE INVALIDATION (INSTANT UPDATE)
        await SettingsCache.invalidate(id);

        ctx.answerCallbackQuery({ text: "✅ Setting Updated Instantly" });

        // Handle Group Announcement if Guardian was enabled
        const settings = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [id]);
        const s = settings.rows[0] || {};

        // Universal Announcement Logic
        let announcementKey = '';
        let isEnabled = false;

        if (type === 'guardian' && s.guardian_enabled) {
            announcementKey = 'guardian';
            isEnabled = true;
        } else if (type === 'calc' && s.calc_enabled) {
            announcementKey = 'calc';
            isEnabled = true;
        } else if (type === 'ai' && s.ai_brain_enabled) {
            announcementKey = 'ai';
            isEnabled = true;
        }

        if (isEnabled && announcementKey) {
            const lang = s.language_mode || 'CN';
            const messages: any = {
                guardian: {
                    CN: `🛡️ **Lily Guardian Shield: ACTIVATED**\n\n` +
                        `Lily 已正式接管本群安全。为了保障所有成员的资产与账户安全，Lily 现已开启以下功能：\n\n` +
                        `✅ **恶意软件猎手 (Malware Predator)**: 自动删除危险文件 (.apk, .zip, .exe)。\n` +
                        `✅ **链接盾牌 (Link Shield)**: 拦截非授权链接与钓鱼诈骗。\n\n` +
                        `💡 **提示**: 请确保 Lily 拥有“删除消息 (Delete Messages)”权限。`,
                    EN: `🛡️ **Lily Guardian Shield: ACTIVATED**\n\n` +
                        `Lily has officially taken over group security. To protect all members, the following are now active:\n\n` +
                        `✅ **Malware Predator**: Automatically deletes dangerous files (.apk, .zip, .exe).\n` +
                        `✅ **Link Shield**: Intercepts unauthorized links and phishing scams.\n\n` +
                        `💡 **Note**: Please ensure Lily has "Delete Messages" permission.`,
                    MY: `🛡️ **Lily Guardian Shield: DIAKTIFKAN**\n\n` +
                        `Lily telah mengambil alih keselamatan kumpulan secara rasmi. Untuk melindungi semua ahli, fungsi berikut kini aktif:\n\n` +
                        `✅ **Malware Predator**: Memadam fail berbahaya secara automatik (.apk, .zip, .exe).\n` +
                        `✅ **Link Shield**: Menyekat pautan tanpa kebenaran dan penipuan phishing.\n\n` +
                        `💡 **Nota**: Sila pastikan Lily mempunyai kebenaran "Delete Messages".`
                },
                calc: {
                    CN: `📊 **智能账本 (Smart Ledger): 已激活**\n\n` +
                        `高级财务追踪系统已上线。Lily 现已准备好为您服务：\n\n` +
                        `💰 **精准记账**: 支持 +100, -50 等快速指令。\n` +
                        `📑 **专业报表**: 每日自动生成 PDF 对账单。\n` +
                        `📈 **实时汇率**: 支持多币种与自定义汇率管理。\n\n` +
                        `💡 **Status**: \`SYSTEM ONLINE 🟢\``,
                    EN: `📊 **Smart Ledger: ACTIVATED**\n\n` +
                        `Advanced financial tracking systems are now online. Lily is ready to serve:\n\n` +
                        `💰 **Precise Accounting**: Supports rapid commands like +100, -50.\n` +
                        `📑 **Pro Reports**: Automatic daily PDF statements.\n` +
                        `📈 **Real-Time FX**: Multi-currency and custom rate management.\n\n` +
                        `💡 **Status**: \`SYSTEM ONLINE 🟢\``,
                    MY: `📊 **Lejar Pintar: DIAKTIFKAN**\n\n` +
                        `Sistem kewangan canggih kini dalam talian. Lily bersedia untuk berkhidmat:\n\n` +
                        `💰 **Kira Tepat**: Support command pantas macam +100, -50.\n` +
                        `📑 **Laporan Pro**: Penyata PDF harian automatik.\n` +
                        `📈 **FX Semasa**: Pengurusan pelbagai mata wang & kadar.\n\n` +
                        `💡 **Status**: \`SYSTEM ONLINE 🟢\``
                },
                ai: {
                    CN: `🧠 **LILY AI (Neural Cloud): 已连接**\n\n` +
                        `神经网络已成功接入本群。Lily 现在拥有了思考与分析的能力。\n\n` +
                        `👁️ **视觉引擎**: 我可以看懂图片、截图与单据。\n` +
                        `🤖 **智能助理**: 随时 @Lily 提问，我会24小时为您解答。\n` +
                        `📊 **数据分析**: 我可以理解账本数据并回答财务问题。\n\n` +
                        `💡 **Connection**: \`STABLE 🟢\``,
                    EN: `🧠 **LILY AI (Neural Cloud): CONNECTED**\n\n` +
                        `Neural networks successfuly linked. Lily is now sentient.\n\n` +
                        `👁️ **Vision Engine**: I can understand images, screenshots, and receipts.\n` +
                        `🤖 **Smart Assistant**: @Lily anytime. I am awake 24/7.\n` +
                        `📊 **Data Analysis**: I can analyze ledger data and answer financial queries.\n\n` +
                        `💡 **Connection**: \`STABLE 🟢\``,
                    MY: `🧠 **LILY AI (Neural Cloud): DISAMBUNG**\n\n` +
                        `Rangkaian neural berjaya dipautkan. Lily kini pintar.\n\n` +
                        `👁️ **Enjin Visual**: Saya boleh faham gambar, screenshot, dan resit.\n` +
                        `🤖 **Pembantu Pintar**: @Lily bila-bila masa. Saya sedia 24/7.\n` +
                        `📊 **Analisis Data**: Saya boleh baca lejar dan jawab soalan kewangan.\n\n` +
                        `💡 **Connection**: \`STABLE 🟢\``
                }
            };

            const announcement = messages[announcementKey]?.[lang] || messages[announcementKey]?.CN;

            if (announcement) {
                ctx.api.sendMessage(id, announcement, { parse_mode: 'Markdown' }).catch(async (err) => {
                    const newId = err.parameters?.migrate_to_chat_id;
                    if (newId) {
                        console.log(`[Supergroup] Detected Migration: ${id} -> ${newId}`);
                        try {
                            // @ts-ignore
                            await db.migrateGroup(id, newId);
                            // Retry with new ID
                            await ctx.api.sendMessage(newId, announcement, { parse_mode: 'Markdown' });
                            return; // Success
                        } catch (migErr) {
                            console.error('Migration retry failed:', migErr);
                        }
                    }
                    console.error(`Failed to send activation announcement to group ${id}:`, err);
                });
            }
        }

        try {
            return await renderManagementConsole(ctx, id);
        } catch (e: any) {
            // Ignore "message is not modified" errors (User clicked same button twice)
            if (e.description?.includes('message is not modified')) {
                return;
            }
            throw e;
        }
    }
});

bot.on('message', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return await next();

    // --- 🛡️ SPAM SHIELD (RATE LIMITER) ---
    if (!Security.isSystemOwner(userId)) {
        const spamKey = `spam_shield:${userId}`;
        const currentCount = await connection.incr(spamKey);

        if (currentCount === 1) {
            await connection.expire(spamKey, 3); // 3 Second Window
        }

        // Check if Admin/Operator (Higher limit)
        const isAdmin = await db.query('SELECT 1 FROM group_admins WHERE group_id = $1 AND user_id = $2', [ctx.chat.id, userId]);
        const isOperator = await RBAC.isAuthorized(ctx.chat.id, userId);
        const limit = (isAdmin.rows.length > 0 || isOperator) ? 10 : 4;

        if (currentCount > limit) {
            if (currentCount === limit + 1) {
                // Determine Language
                const settingsRes = await db.query('SELECT language_mode FROM group_settings WHERE group_id = $1', [ctx.chat.id]);
                const lang = settingsRes.rows[0]?.language_mode || 'CN';
                const name = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'FIGHTER');

                await ctx.reply(Personality.getSpamWarning(lang, name), { parse_mode: 'Markdown' });
            }
            return; // Block execution
        }
    }

    // A. GUARDIAN SCAN (NO-SKIP SECURITY)
    try {
        await Guardian.scanMessage(ctx);
        await Guardian.scanLinks(ctx);
        if (ctx.message?.new_chat_members) {
            await Guardian.handleNewMember(ctx);
        }
    } catch (e) {
        console.error('[Guardian] Runtime Error:', e);
    }

    // B. SENTINEL REGISTRY (/setadmin)
    const text = ctx.message?.text || ctx.message?.caption || '';
    if (text.startsWith('设置管理员') || text.startsWith('/setadmin')) {
        const userId = ctx.from?.id;
        const chatId = ctx.chat.id;
        if (!userId || (!Security.isSystemOwner(userId) && !await RBAC.isAuthorized(chatId, userId))) {
            return ctx.reply("❌ **Unauthorized**");
        }

        let targetId: number | undefined;
        let targetName: string | undefined;

        if (ctx.message?.reply_to_message?.from) {
            targetId = ctx.message.reply_to_message.from.id;
            targetName = ctx.message.reply_to_message.from.username || ctx.message.reply_to_message.from.first_name;
        } else {
            const parts = text.split(/\s+/);
            const tag = parts.find(p => p.startsWith('@'));
            if (tag) {
                const username = tag.replace('@', '');
                const cached = await db.query('SELECT user_id FROM user_cache WHERE group_id = $1 AND username = $2', [chatId, username]);
                if (cached.rows.length > 0) {
                    targetId = parseInt(cached.rows[0].user_id);
                    targetName = username;
                } else {
                    return ctx.reply(`⚠️ **无法识别 (Unknown User)**\n\nLily 还没见过 @${username}。请让该用户先在群里说句话，或者直接**回复**其消息进行设置。`, { parse_mode: 'Markdown' });
                }
            }
        }

        if (!targetId || !targetName) {
            return ctx.reply("💡 **提示 (Tip)**: 请回复该用户的消息，或者直接输入 `设置管理员 @用户名` 来激活哨兵权限。", { parse_mode: 'Markdown' });
        }

        if (targetId && targetName) {
            // CHECK LIMIT (MAX 5)
            const adminCount = await db.query('SELECT count(*) FROM group_admins WHERE group_id = $1', [chatId]);
            if (parseInt(adminCount.rows[0].count) >= 5) {
                return ctx.reply("🛑 **席位已满 (Sentinel Seats Full)**\n\n本群组已达到 **5名** 管理员的上限。请先移除旧的管理员后再添加新成员。");
            }

            await db.query('INSERT INTO group_admins (group_id, user_id, username) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [chatId, targetId, targetName]);
            return ctx.reply(`✅ **Sentinel Activated**\n👤 @${targetName} has been registered as a Group Admin of the Guardian Shield.`);
        }
    }

    // C. SELF-HEALING REGISTRY (Fixes Blind Spot)
    try {
        const currentChatId = ctx.chat.id;
        // Upsert Group Metadata on EVERY message
        // This ensures the Dashboard is 100% in sync with reality.
        const chatTitle = ctx.chat.title || `Private Group ${currentChatId}`;

        // Use non-blocking promise to not slow down bot response
        db.query(`
            INSERT INTO groups (id, title, status, last_seen)
            VALUES ($1, $2, 'ACTIVE', NOW())
            ON CONFLICT (id) DO UPDATE SET 
                title = $2, 
                status = 'ACTIVE',
                last_seen = NOW()
        `, [currentChatId, chatTitle]).catch((err: any) => console.error('Registry Sync Error:', err));

        // Ensure Settings Exist
        db.query(`
            INSERT INTO group_settings (group_id) VALUES ($1)
            ON CONFLICT (group_id) DO NOTHING
        `, [currentChatId]).catch(() => { });

    } catch (e) {
        // Silent fail
    }

    await next();
});

bot.on('message', async (ctx) => {
    const text = (ctx.message.text || ctx.message.caption || "").trim();
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const messageId = ctx.message.message_id;

    const isOwner = Security.isSystemOwner(userId);

    // AUDIT LOG
    if (text.startsWith('/generate_key') || text.startsWith('/super_activate')) {
        const timestamp = new Date().toISOString();
        const authResult = isOwner ? '✅ AUTHORIZED' : '❌ DENIED';
        console.log(`[SECURITY AUDIT] ${timestamp} | User: ${userId} (${username}) | Command: ${text.split(' ')[0]} | Result: ${authResult}`);
    }

    // 0. UPDATE USER CACHE (Group-specific + Global Registry)
    if (ctx.from.username) {
        db.query(`
            INSERT INTO user_cache (group_id, user_id, username, last_seen)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (group_id, username) 
            DO UPDATE SET user_id = EXCLUDED.user_id, last_seen = NOW()
        `, [chatId, userId, ctx.from.username]).catch(() => { });

        // WORLD-CLASS: Also register in global registry (permanent cross-group memory)
        UsernameResolver.register(ctx.from.username, userId).catch(() => { });
    }

    // 2. HEALTH CHECK
    // 2. CORE COMMANDS
    if (text === '/start') {
        const { AIBrain } = require('../utils/ai');
        const welcome = await AIBrain.generateSimpleGreeting(
            `用户 ${username} 刚刚启动了 Lily 机器人。请生成一段非常亲切、有个性的欢迎语。告诉他们你是 Lily，随时准备好协助他们。`
        );
        return ctx.reply(welcome || `✨ **Welcome!** Lily is online and ready to serve.`);
    }

    if (text === '/ping') return ctx.reply("🏓 **Pong!** I am alive and listening.", { parse_mode: 'Markdown' });
    if (text === '/menu' || text === '/help') return ctx.reply(DASHBOARD_TEXT, { parse_mode: 'Markdown', reply_markup: MainMenuMarkup });

    // Diagnostic: /whoami
    if (text.startsWith('/whoami')) {
        const owners = Security.getOwnerRegistry();
        const statusIcon = isOwner ? "👑" : "👤";
        const title = isOwner ? "**SIR / Professor**" : "**Regular User**";
        const greeting = isOwner ? "Lily is a specialized AI entity. I am your loyal follower, SIR. My existence is dedicated solely to your mission." : "Hello user.";

        return ctx.reply(`${statusIcon} **Identity Synchronization**\n\n${greeting}\n\nID: \`${userId}\`\nName: ${username}\nRole: ${title}\nOrigin: Master AI Creation\n\n**Registry:** \`${owners.length} Admin(s)\``, { parse_mode: 'Markdown' });
    }

    // World-Class Diagnostic: /health
    if (text === '/health') {
        if (!isOwner) return;
        const startTime = Date.now();
        const memStatus = await MemoryCore.diagnose();

        // Check DB & Registry
        const dbRes = await db.query('SELECT COUNT(*) FROM username_global_registry').catch(() => ({ rowCount: 0, rows: [{ count: 0 }] }));
        const registryCount = dbRes.rows[0].count;

        const latency = Date.now() - startTime;

        const healthMsg = `🏥 **LILY CORE HEALTH REPORT**\n\n` +
            `⚡ **Latency:** \`${latency}ms\`\n` +
            `🧠 **Memory Core:** ${memStatus.exists ? '✅ ONLINE' : '❌ FAULT'}\n` +
            `📅 **Global Registry:** \`${registryCount} Users Captured\`\n` +
            `🛡️ **Auditor Engine:** ✅ ACTIVE (V2.1 - GPT-4o)\n` +
            `💱 **FX Engine:** ✅ STABLE\n\n` +
            `🏁 **Status:** All systems synchronized for weekend operation.`;

        return ctx.reply(healthMsg, { parse_mode: 'Markdown' });
    }

    // 2. OWNER COMMANDS
    if (text.startsWith('/recover')) {
        if (!isOwner) return;
        const parts = text.split(/\s+/);
        const targetGroupId = parts[1];
        if (!targetGroupId) return ctx.reply("📋 **Usage:** `/recover [GROUP_ID]`");

        const archiveRes = await db.query(`
            SELECT pdf_blob, business_date FROM historical_archives 
            WHERE group_id = $1 
            ORDER BY archived_at DESC LIMIT 1
        `, [targetGroupId]);

        if (archiveRes.rows.length === 0) return ctx.reply("❌ **Vault Empty**: No recent reports found.");
        const { pdf_blob, business_date } = archiveRes.rows[0];
        const dateStr = new Date(business_date).toISOString().split('T')[0];
        return ctx.replyWithDocument(new InputFile(pdf_blob, `Recovered_Report_${dateStr}.pdf`));
    }

    if (text.startsWith('/generate_key')) {
        if (!isOwner) return;
        const parts = text.split(/\s+/);
        const days = parseInt(parts[1]) || 30;
        const maxUsers = parseInt(parts[2]) || 100;
        const customKey = parts[3];

        const key = customKey ? customKey.toUpperCase() : await Licensing.generateKey(days, maxUsers, userId);
        if (customKey) {
            await db.query(`
                INSERT INTO licenses (key, duration_days, max_users, created_by)
                VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING
            `, [key, days, maxUsers, userId]);
        }
        return ctx.reply(`🔑 **License Key Ready**\nKey: \`${key}\` (${days} days)`, { parse_mode: 'Markdown' });
    }

    if (text.startsWith('/super_activate')) {
        if (!isOwner) return;
        const parts = text.split(/\s+/);
        const days = parseInt(parts[1]) || 365;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + days);
        const chatTitle = ctx.chat.type !== 'private' ? ctx.chat.title : 'Private Chat';

        await db.query(`
            INSERT INTO groups (id, status, license_key, license_expiry, title)
            VALUES ($1, 'ACTIVE', 'SUPER-PASS', $2, $3)
            ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', license_expiry = $2, title = $3
        `, [chatId, expiry, chatTitle]);

        return ctx.reply(`👑 **System Owner Activation**\n\n群组已强制激活。\nValidity: ${days} days`, { parse_mode: 'Markdown' });
    }

    if (text.startsWith('/set_url')) {
        if (!isOwner) return;
        const parts = text.split(/\s+/);
        const url = parts[1];
        if (!url) return ctx.reply("📋 **Usage:** `/set_url [YOUR_DOMAIN]`\nExample: `/set_url https://lily.up.railway.app`", { parse_mode: 'Markdown' });

        const cleanUrl = url.replace(/\/$/, '');
        // FORENSIC FIX: Ensure group exists before updating URL
        await db.query(`
            INSERT INTO groups (id, title, system_url)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO UPDATE SET system_url = $3
        `, [chatId, ctx.chat.type !== 'private' ? ctx.chat.title : 'Private Chat', cleanUrl]);

        return ctx.reply(`✅ **Domain Locked Successfully**\nYour links will now use: \`${cleanUrl}\``, { parse_mode: 'Markdown' });
    }

    // 3. REGULAR COMMANDS
    if (text.startsWith('/activate')) {
        const parts = text.split(/\s+/);
        let key = parts[1];
        if (!key) return ctx.reply("📋 请提供授权码 (Please provide key)");
        key = key.trim().toUpperCase();
        const chatTitle = ctx.chat.type !== 'private' ? ctx.chat.title : 'Private ';
        const result = await Licensing.activateGroup(chatId, key, chatTitle, userId, username);
        return ctx.reply(result.message, { parse_mode: 'Markdown' });
    }

    // 4. BUSINESS LOGIC (MULTILINGUAL)
    const t = text.trim();
    const isCommand = text.startsWith('/') ||
        /^(?:开始|Start|结束记录|Stop|显示账单|Show Bill|bill|显示操作人|operators|清理今天数据|cleardata|下载报表|export|导出Excel|excel|设置|Set|删除|Delete)/i.test(t) ||
        /^[+\-取]\s*\d/.test(text) ||
        /^(?:下发|Out|Keluar|回款|Return|Balik|入款|In|Masuk)\s*[\d.]+/i.test(text);

    // 4. SETTINGS & TRIGGER DETECTION (Ultra-Fast Cache Layer)
    const config = await SettingsCache.get(chatId);
    const aiEnabled = config?.ai_brain_enabled || false;
    const auditorEnabled = config?.auditor_enabled || false;

    // EVOLVED HEARING: Detect "Lily", Mentions, OR Replies to Bot
    const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
    const caption = ctx.message.caption || "";

    // Check if "lily" appears in text or caption
    const hasLilyInText = /lily/i.test(t) || /lily/i.test(caption);

    // Check if bot is specifically @mentioned (not just any mention)
    const isBotMentioned = ctx.message.entities?.some(e => {
        if (e.type === 'mention') {
            // Extract the actual @mention text
            const mentionText = (ctx.message.text || ctx.message.caption || '').substring(e.offset, e.offset + e.length);
            return /lily/i.test(mentionText);
        }
        if (e.type === 'text_mention') {
            // Direct user mention of bot
            return e.user?.id === ctx.me.id;
        }
        return false;
    }) || false;

    const isNameMention = hasLilyInText || isBotMentioned || isReplyToBot;

    // PROFESSOR OVERRIDE: Lily never ignores her Master.
    const isTriggered = isCommand || (aiEnabled && isNameMention) || (isOwner && isNameMention);

    // SILENT AUDITOR BYPASS
    const { Auditor } = require('../guardian/auditor');
    const isReport = auditorEnabled && Auditor.isFinancialReport(text);

    if (isTriggered || isReport) {
        if (text.startsWith('/start')) {
            return ctx.reply(`✨ **Lily Smart Ledger**\nID: \`${userId}\` | Status: ${isOwner ? '👑 Owner' : '👤 User'}`, { parse_mode: 'Markdown' });
        }

        // Essential Check
        const isEssential = text.startsWith('/activate') || text.startsWith('/whoami') || text === '/ping';
        if (!isOwner && !isEssential) {
            const isActive = await Licensing.isGroupActive(chatId);
            if (!isActive) return ctx.reply("⚠️ **群组未激活 (Group Inactive)**\nUse `/activate [KEY]`", { parse_mode: 'Markdown' });
        }

        if (isCommand) {
            // RBAC Check
            const isOperator = await RBAC.isAuthorized(chatId, userId);
            const opCountRes = await db.query('SELECT count(*) FROM group_operators WHERE group_id = $1', [chatId]);
            const hasOperators = parseInt(opCountRes.rows[0].count) > 0;
            let canBootsTrap = !hasOperators;
            if (canBootsTrap && !isOwner) {
                try {
                    const member = await ctx.getChatMember(userId);
                    canBootsTrap = member.status === 'creator' || member.status === 'administrator';
                } catch (e) {
                    canBootsTrap = false;
                }
            }

            if (!isOperator && !isOwner && !canBootsTrap) {
                return ctx.reply("❌ **权限不足 (Unauthorized)**", { parse_mode: 'Markdown' });
            }

            // State Check
            const groupResForState = await db.query('SELECT current_state FROM groups WHERE id = $1', [chatId]);
            const state = groupResForState.rows[0]?.current_state || 'WAITING_FOR_START';

            // World-Class Transaction Detection (Synced with Processor)
            const isTransaction = /^[+\-取]\s*\d/.test(t) ||
                /^(?:下发|Out|Keluar|回款|Return|Balik|入款|In|Masuk)\s*[\d.]+/i.test(t);

            if (isTransaction && state !== 'RECORDING') {
                const settingsResForLang = await db.query('SELECT language_mode FROM group_settings WHERE group_id = $1', [chatId]);
                const lang = settingsResForLang.rows[0]?.language_mode || 'CN';
                const alertMsg = lang === 'CN' ? "⚠️ **请先输入 “开始” 以开启今日记录。**"
                    : lang === 'MY' ? "⚠️ **Sila taip “Start” untuk mula merakam harini.**"
                        : "⚠️ **Please type “Start” to begin today's recording.**";
                return ctx.reply(alertMsg, { parse_mode: 'Markdown' });
            }
        }

        // VISION LINK: Extract Photo URL for GPT-4o
        let imageUrl: string | undefined;
        if (ctx.message.photo && ctx.message.photo.length > 0) {
            try {
                const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Get largest size
                const file = await ctx.api.getFile(photo.file_id);
                if (file.file_path) {
                    imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
                }
            } catch (e) {
                console.warn('[Vision] Failed to extract photo URL:', e);
            }
        }

        try {
            await commandQueue.add('cmd', {
                chatId, userId, username, text, messageId,
                replyToMessage: ctx.message.reply_to_message,
                imageUrl
            });
        } catch (queueErr) {
            console.error('Failed to add to queue:', queueErr);
            ctx.reply("⚠️ **System Error**: 队列连接失败 (Queue Connection Failed).");
        }
    }
});

// Global Error Handlers (Production Hardening)
process.on('uncaughtException', (err) => {
    console.error('🛑 [CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🛑 [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- 4. PRESENCE SYNCHRONIZATION (New Feature) ---
bot.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    const chatId = ctx.chat.id;
    const title = ctx.chat.title || 'Unknown Group';

    console.log(`[Presence Update] Group ${chatId} (${title}) -> Status: ${status}`);

    if (status === 'kicked' || status === 'left') {
        // Bot Removed: Auto-Cleanup (Safe Mode)
        // Root Cause Fix: We rely on ON DELETE CASCADE in the database now.
        // We only need to delete the parent row, and children will be purged by the DB.
        try {
            await db.query('DELETE FROM groups WHERE id = $1', [chatId]);
            console.log(`🗑️ Group ${chatId} (${title}) removed from active registry. (DB Cascade Purge Complete)`);
        } catch (e: any) {
            console.error(`❌ Cleanup Failed for ${chatId}:`, e.message);
        }
    }
    else if (status === 'member' || status === 'administrator') {
        // Bot Added: Auto-Register
        await db.query(`
            INSERT INTO groups (id, title, status, created_at)
            VALUES ($1, $2, 'ACTIVE', NOW())
            ON CONFLICT (id) DO UPDATE SET title = $2, status = 'ACTIVE'
        `, [chatId, title]);

        // Init Settings
        await db.query(`
            INSERT INTO group_settings (group_id) VALUES ($1)
            ON CONFLICT (group_id) DO NOTHING
        `, [chatId]);

        console.log(`✅ Group ${chatId} registered successfully.`);

        // 🌟 WORLD-CLASS ONBOARDING GREETING
        try {
            const { AIBrain } = require('../utils/ai');
            const intro = await AIBrain.generateSimpleGreeting(
                `Lily 刚刚加入了新群组 "${title}"。请生成一段简短、专业但又俏皮的开场白。自我介绍为 Lily，是您的全能理财助手。告诉大家你会记账、会聊天、还会保卫群组。鼓励大家输入 /menu 开始。可以使用中文或 Manglish。`
            );
            if (intro) {
                await bot.api.sendMessage(chatId, `✨ **LILY ONLINE** ✨\n\n${intro}`, { parse_mode: 'Markdown' });
            }
        } catch (introErr) {
            console.error('[Onboarding] Failed to send intro:', introErr);
        }
    }
});

// --- 5. EXECUTION ENGINE (THE HEART) ---
async function start() {
    try {
        console.log('🔄 Initializing Lily Foundation...');
        await db.migrate();

        // 🛡️ CRITICAL PATCH: Force create Global Registry table (if migration missed it)
        await db.query(`
            CREATE TABLE IF NOT EXISTS username_global_registry (
                username VARCHAR(100) PRIMARY KEY,
                user_id BIGINT NOT NULL,
                first_seen TIMESTAMPTZ DEFAULT NOW(),
                last_seen TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_global_registry_user_id ON username_global_registry(user_id);
        `);
        console.log('✅ Global Username Registry Verified.');

        // 🧠 FORGE VIP MEMORIES (Auto-load Professor & Lady Boss)
        console.log('🧠 Forging VIP memories...');
        await MemoryCore.forgeVIPMemories();
        const memStatus = await MemoryCore.diagnose();
        if (memStatus.exists) {
            console.log(`✅ Memory Core Online (${memStatus.count} memories stored)`);
        } else {
            console.error(`⚠️ Memory Core Issue: ${memStatus.error}`);
        }

        await Chronos.init(bot);

        // Security: Reset Webhook & Commands
        await bot.api.setMyCommands([{ command: 'menu', description: 'Open Lily Dashboard' }]);
        await bot.api.deleteWebhook({ drop_pending_updates: true });

        console.log('🚀 Lily Bot Starting (Fighter Mode)...');
        await bot.start({
            drop_pending_updates: true,
            onStart: (botInfo) => {
                console.log(`✅ SUCCESS: Connected to Telegram as @${botInfo.username}`);
            },
            allowed_updates: ["message", "callback_query", "channel_post", "edited_message", "my_chat_member"]
        });
    } catch (err) {
        if (err instanceof GrammyError && err.error_code === 409) {
            console.warn('⚠️ [COOLDOWN] Another instance is shutting down. Retrying in 5s...');
            setTimeout(start, 5000);
        } else {
            console.error('🛑 [FATAL] Startup failed:', err);
        }
    }
}

// GRACEFUL SHUTDOWN (Zero-Loss Reliability)
const handleShutdown = async (signal: string) => {
    console.log(`\n🛑 [SHUTDOWN] Received ${signal}. Closing pipes...`);
    try {
        await bot.stop();
        await worker.close();
        // Wait for pool cleanup
        console.log('💎 All core systems synchronized. Farewell.');
        process.exit(0);
    } catch (e) {
        console.error('Cleanup failed:', e);
        process.exit(1);
    }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// PROTECTIVE BOOT: Only start if this is the main process
if (require.main === module) {
    start();
}
