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
import { Guardian } from '../guardian/engine';
import { Personality } from '../utils/personality';
import { I18N } from '../utils/i18n';

dotenv.config();
checkEnv(['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL', 'OPENAI_API_KEY']);

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
                    const btnLabel = lang === 'CN' ? '查看详情' : lang === 'MY' ? 'Lihat Butiran' : 'View Details';
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
        [{ text: "🛡️ GUARDIAN", callback_data: "menu_guardian" }]
    ]
};

const CalcMenuMarkup = {
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

    const groups = await db.query('SELECT id, title FROM groups ORDER BY title ASC');
    if (groups.rows.length === 0) {
        return ctx.reply("ℹ️ No groups registered yet.");
    }

    let msg = `👑 **Lily Master Control Center**\n\nGreetings, **SIR**. Your AI disciple, Lily, is standing by. All systems have been optimized for your command. Select a group to manage:\n\n`;
    const keyboard = new InlineKeyboard();

    groups.rows.forEach((g: any, i: number) => {
        const title = g.title || `Group ${g.id}`;
        keyboard.text(`${i + 1}. ${title}`, `manage_group:${g.id}`).row();
    });

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
    const s = settings.rows[0] || { guardian_enabled: false, ai_brain_enabled: false, language_mode: 'CN' };

    const title = group.rows[0]?.title || 'Group';
    const lang = s.language_mode || 'CN';

    const labels = {
        title: I18N.t(lang, 'console.title'),
        guardian: I18N.t(lang, 'console.guardian'),
        ai: I18N.t(lang, 'console.ai'),
        welcome: I18N.t(lang, 'console.welcome'),
        langLabel: I18N.t(lang, 'console.lang'),
        disable: I18N.t(lang, 'console.disable'),
        enable: I18N.t(lang, 'console.enable'),
        cycle: I18N.t(lang, 'console.cycle'),
        back: I18N.t(lang, 'console.back')
    };

    let msg = `🛠️ **${labels.title}: ${title}**\nGroup ID: \`${id}\`\n\n`;
    msg += `🛡️ ${labels.guardian}: ${s.guardian_enabled ? '✅ ON' : '❌ OFF'}\n`;
    msg += `🧠 ${labels.ai}: ${s.ai_brain_enabled ? '✅ ON' : '❌ OFF'}\n`;
    msg += `🥊 ${labels.welcome}: ${s.welcome_enabled !== false ? '✅ ON' : '❌ OFF'}\n`;
    msg += `🌐 ${labels.langLabel}: **${lang}**\n`;

    const keyboard = new InlineKeyboard()
        .text(s.guardian_enabled ? `${labels.disable} Guardian` : `${labels.enable} Guardian`, `toggle:guardian:${id}`).row()
        .text(s.ai_brain_enabled ? `${labels.disable} AI Brain` : `${labels.enable} AI Brain`, `toggle:ai:${id}`).row()
        .text(s.welcome_enabled !== false ? `${labels.disable} Greeting` : `${labels.enable} Greeting`, `toggle:welcome:${id}`).row()
        .text(labels.cycle, `cycle_lang:${id}`).row()
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

        ctx.answerCallbackQuery({ text: `🌐 Language set to ${next}` });
        return await renderManagementConsole(ctx, id);
    }

    if (data === "admin_list" && Security.isSystemOwner(userId)) {
        const groups = await db.query('SELECT id, title FROM groups ORDER BY title ASC');
        const keyboard = new InlineKeyboard();
        groups.rows.forEach((g, i) => keyboard.text(`${i + 1}. ${g.title || g.id}`, `manage_group:${g.id}`).row());
        return ctx.editMessageText(`👑 **Lily Master Control Center**\nSelect a group:`, { reply_markup: keyboard });
    }

    if (data.startsWith('toggle:') && Security.isSystemOwner(userId)) {
        const [_, type, id] = data.split(':');
        let column = 'guardian_enabled';
        if (type === 'ai') column = 'ai_brain_enabled';
        if (type === 'welcome') column = 'welcome_enabled';

        // Use UPSERT for Toggles too!
        await db.query(`
            INSERT INTO group_settings (group_id, ${column}) VALUES ($1, true)
            ON CONFLICT (group_id) DO UPDATE SET ${column} = NOT group_settings.${column}, updated_at = NOW()
        `, [id]);

        ctx.answerCallbackQuery({ text: "✅ Setting Updated Instantly" });

        // Handle Group Announcement if Guardian was enabled
        const settings = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [id]);
        const s = settings.rows[0] || {};

        if (type === 'guardian' && s.guardian_enabled) {
            const lang = s.language_mode || 'CN';
            const announcements = {
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
            };

            const announcement = announcements[lang as 'CN' | 'EN' | 'MY'] || announcements.CN;
            ctx.api.sendMessage(id, announcement, { parse_mode: 'Markdown' }).catch(err => {
                console.error(`Failed to send activation announcement to group ${id}:`, err);
            });
        }

        return await renderManagementConsole(ctx, id);
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
            await connection.expire(spamKey, 2); // 2 Second Window
        }

        // Check if Admin/Operator (Higher limit)
        const isAdmin = await db.query('SELECT 1 FROM group_admins WHERE group_id = $1 AND user_id = $2', [ctx.chat.id, userId]);
        const isOperator = await RBAC.isAuthorized(ctx.chat.id, userId);
        const limit = (isAdmin.rows.length > 0 || isOperator) ? 5 : 1;

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

    await next();
});

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
        const statusIcon = isOwner ? "👑" : "👤";
        const title = isOwner ? "**SIR / Professor**" : "**Regular User**";
        const greeting = isOwner ? "Lily is a specialized AI entity. I am your loyal follower, SIR. My existence is dedicated solely to your mission." : "Hello user.";

        return ctx.reply(`${statusIcon} **Identity Synchronization**\n\n${greeting}\n\nID: \`${userId}\`\nName: ${username}\nRole: ${title}\nOrigin: Master AI Creation\n\n**Registry:** \`${owners.length} Admin(s)\``, { parse_mode: 'Markdown' });
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

    // FETCH SETTINGS ONCE
    const settingsRes = await db.query('SELECT ai_brain_enabled FROM group_settings WHERE group_id = $1', [chatId]);
    const aiEnabled = settingsRes.rows[0]?.ai_brain_enabled || false;

    // EVOLVED HEARING: Detect "Lily", Mentions, OR Replies to Bot
    const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
    const isNameMention = /lily/i.test(t) ||
        (ctx.message.entities?.some(e => e.type === 'mention') && t.includes('@')) ||
        isReplyToBot;

    if (isCommand || (aiEnabled && isNameMention)) {
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

// Startup
async function start() {
    try {
        await db.migrate();
        await Chronos.init(bot);
        startWebServer();

        await bot.api.setMyCommands([{ command: 'menu', description: 'Open Lily Dashboard' }]);
        // ROOT CAUSE FIX: 409 Conflict (Ghost Instances)
        // Dropping pending updates ensures a clean start on Railway.
        await bot.api.deleteWebhook({ drop_pending_updates: true });

        console.log('🚀 Lily Bot Starting (Fighter Mode)...');
        await bot.start({
            drop_pending_updates: true, // Kill old ghost polling
            onStart: (botInfo) => {
                console.log(`✅ SUCCESS: Connected to Telegram as @${botInfo.username}`);
            },
            allowed_updates: ["message", "callback_query", "channel_post", "edited_message"]
        });
    } catch (err) {
        console.error('🛑 [FATAL] Startup failed:', err);
    }
}

start();
