import { Bot, Context, InputFile, InlineKeyboard, GrammyError, HttpError } from 'grammy';
import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
import checkEnv from 'check-env';

// Internal Logic
import { processCommand } from '../worker/processor';
import { db } from '../db';
import { Licensing } from '../core/licensing';
import { RBAC } from '../core/rbac';
import { Chronos } from '../core/scheduler';
import { startWebServer } from '../web/server';
import { BillResult } from '../core/ledger';
import { Security } from '../utils/security';

dotenv.config();
checkEnv(['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL']);

// Security Warning for Missing Owner
if (!process.env.OWNER_ID) {
    console.error('🛑 [CRITICAL WARNING] OWNER_ID is not set in environment variables!');
}

// 1. Connection Pools
const bot = new Bot(process.env.BOT_TOKEN!);

// ioredis connection with better stability
const connection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    retryStrategy(times) {
        return Math.min(times * 50, 2000);
    }
});

connection.on('error', (err) => {
    console.error('❌ Redis Connection Error:', err.message);
});

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

// 3. Worker Setup
const worker = new Worker('lily-commands', async job => {
    return await processCommand(job);
}, { connection });

worker.on('completed', async (job, returnValue) => {
    if (!returnValue || !job.data.chatId) return;

    try {
        // Handle PDF Exports
        if (typeof returnValue === 'string' && returnValue.startsWith('PDF_EXPORT:')) {
            const base64 = returnValue.replace('PDF_EXPORT:', '');
            const date = new Date().toISOString().split('T')[0];
            const filename = `Lily_Statement_${date}.pdf`;

            await bot.api.sendDocument(job.data.chatId,
                new InputFile(Buffer.from(base64, 'base64'), filename),
                {
                    caption: `📄 **Daily Statement (PDF)**\nDate: ${date}`,
                    reply_to_message_id: job.data.messageId
                }
            );
            return;
        }

        // Handle Composite Results (Object with Text + PDF)
        if (typeof returnValue === 'object' && returnValue !== null && (returnValue as any).pdf) {
            const { text, pdf } = returnValue as any;
            const date = new Date().toISOString().split('T')[0];

            await bot.api.sendMessage(job.data.chatId, text, {
                reply_to_message_id: job.data.messageId,
                parse_mode: 'Markdown'
            });

            await bot.api.sendDocument(job.data.chatId,
                new InputFile(Buffer.from(pdf, 'base64'), `Lily_Final_${date}.pdf`),
                { caption: `📄 **Final Daily Archive**` }
            );
            return;
        }

        // Handle Rich Bill Results
        if (typeof returnValue === 'object' && returnValue !== null) {
            const result = returnValue as BillResult;
            if (result.text) {
                const options: any = {
                    reply_to_message_id: job.data.messageId,
                    parse_mode: 'Markdown'
                };

                if (result.showMore && result.url) {
                    options.reply_markup = new InlineKeyboard().url("检查明细（More)", result.url);
                }

                try {
                    await bot.api.sendMessage(job.data.chatId, result.text, options);
                } catch (sendErr: any) {
                    if (options.reply_markup) {
                        console.error('Telegram rejected URL button, falling back to text only');
                        delete options.reply_markup;
                        await bot.api.sendMessage(job.data.chatId, result.text, options);
                    } else {
                        throw sendErr;
                    }
                }
                return;
            }
        }

        // Standard Text Replies
        if (typeof returnValue === 'string') {
            await bot.api.sendMessage(job.data.chatId, returnValue, {
                reply_to_message_id: job.data.messageId,
                parse_mode: 'Markdown'
            });
        }
    } catch (err) {
        console.error('Failed to send worker result response:', err);
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
        [{ text: "🛡️ GUARDIAN (Coming Soon)", callback_data: "menu_guardian" }]
    ]
};

const CalcMenuMarkup = {
    inline_keyboard: [
        [{ text: "⬅️ BACK TO MENU", callback_data: "menu_main" }]
    ]
};

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

    if (data === "menu_main") {
        return ctx.editMessageText(DASHBOARD_TEXT, { parse_mode: 'Markdown', reply_markup: MainMenuMarkup });
    }

    if (data === "menu_calc") {
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
            `• \`删除美元汇率\`: Reset/Delete a specific rate\n\n` +
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
        return ctx.answerCallbackQuery({
            text: "🛡️ GUARDIAN SYSTEM\nComing soon in the next update.",
            show_alert: true
        });
    }
});

// Bot Ingress
bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
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

    // 0. UPDATE USER CACHE
    if (ctx.from.username) {
        db.query(`
            INSERT INTO user_cache (group_id, user_id, username, last_seen)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (group_id, username) 
            DO UPDATE SET user_id = EXCLUDED.user_id, last_seen = NOW()
        `, [chatId, userId, ctx.from.username]).catch(() => { });
    }

    // 1. HEALTH CHECK
    if (text === '/ping') return ctx.reply("🏓 **Pong!** I am alive and listening.", { parse_mode: 'Markdown' });
    if (text === '/menu' || text === '/help') return ctx.reply(DASHBOARD_TEXT, { parse_mode: 'Markdown', reply_markup: MainMenuMarkup });

    // Diagnostic: /whoami
    if (text.startsWith('/whoami')) {
        const owners = Security.getOwnerRegistry();
        const statusIcon = isOwner ? "✅" : "👤";
        return ctx.reply(`${statusIcon} **User Diagnostics**\n\nID: \`${userId}\`\nName: ${username}\nStatus: ${isOwner ? '**System Owner**' : '**Regular User**'}\n\n**Registry:** \`${owners.length} Admin(s)\``, { parse_mode: 'Markdown' });
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

        await db.query('UPDATE groups SET system_url = $1 WHERE id = $2', [url.replace(/\/$/, ''), chatId]);
        return ctx.reply(`✅ **Domain Locked Successfully**\nYour links will now use: \`${url}\``, { parse_mode: 'Markdown' });
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

    // 4. BUSINESS LOGIC
    const isCommand = text.startsWith('/') || text === '开始' || text.toLowerCase() === 'start' ||
        text === '结束记录' || text.toLowerCase() === 'stop' ||
        text === '显示账单' || text === '显示操作人' || text === '清理今天数据' ||
        text === '下载报表' || text === '导出Excel' ||
        text.startsWith('设置') || text.startsWith('删除') ||
        /^[+\-取]\s*\d/.test(text) || text.startsWith('下发') || text.startsWith('回款') || text.startsWith('入款');

    if (isCommand) {
        if (text.startsWith('/start')) {
            return ctx.reply(`✨ **Lily Smart Ledger**\nID: \`${userId}\` | Status: ${isOwner ? '👑 Owner' : '👤 User'}`, { parse_mode: 'Markdown' });
        }

        // Essential Check
        const isEssential = text.startsWith('/activate') || text.startsWith('/whoami') || text === '/ping';
        if (!isOwner && !isEssential) {
            const isActive = await Licensing.isGroupActive(chatId);
            if (!isActive) return ctx.reply("⚠️ **群组未激活 (Group Inactive)**\nUse `/activate [KEY]`", { parse_mode: 'Markdown' });
        }

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
        const groupRes = await db.query('SELECT current_state FROM groups WHERE id = $1', [chatId]);
        const state = groupRes.rows[0]?.current_state || 'WAITING_FOR_START';
        const isTransaction = /^[+\-取]\s*\d/.test(text) || text.startsWith('下发') || text.startsWith('回款') || text.startsWith('入款');

        if (isTransaction && state !== 'RECORDING') {
            return ctx.reply("⚠️ **请先输入 “开始” 以开启今日记录。**", { parse_mode: 'Markdown' });
        }

        try {
            await commandQueue.add('cmd', {
                chatId, userId, username, text, messageId,
                replyToMessage: ctx.message.reply_to_message
            });
        } catch (queueErr) {
            console.error('Failed to add to queue:', queueErr);
            ctx.reply("⚠️ **System Error**: 队列连接失败 (Queue Connection Failed).");
        }
    }
});

// Startup
async function start() {
    try {
        await db.migrate();
        await Chronos.init(bot);
        startWebServer();

        await bot.api.setMyCommands([{ command: 'menu', description: 'Open Lily Dashboard' }]);
        await bot.api.deleteWebhook();

        console.log('🚀 Lily Bot Starting...');
        await bot.start({
            onStart: (botInfo) => {
                console.log(`✅ SUCCESS: Connected to Telegram as @${botInfo.username}`);
            }
        });
    } catch (err) {
        console.error('🛑 [FATAL] Startup failed:', err);
    }
}

start();
