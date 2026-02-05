import { Bot, Context } from 'grammy';
import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { processCommand } from '../worker/processor';
import { db } from '../db';
import { Licensing } from '../core/licensing';
import { RBAC } from '../core/rbac';
import { Chronos } from '../core/scheduler';
import dotenv from 'dotenv';
import checkEnv from 'check-env';

dotenv.config();
checkEnv(['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL']);

// Security Warning for Missing Owner
if (!process.env.OWNER_ID) {
    console.error('🛑 [CRITICAL WARNING] OWNER_ID is not set in environment variables!');
    console.error('System Owner features (License Generation) will be disabled until OWNER_ID is configured.');
}

// Init Dependencies
const bot = new Bot(process.env.BOT_TOKEN!);

// Queue Setup (Corrected Redis Connection)
const connection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null
});

const commandQueue = new Queue('lily-commands', { connection });

// Worker Setup (Running in same process for Railway simplicity)
const worker = new Worker('lily-commands', async job => {
    return await processCommand(job);
}, { connection });

worker.on('completed', async (job, returnValue) => {
    if (returnValue && job.data.chatId) {
        // Check if it's a PDF export
        if (typeof returnValue === 'string' && returnValue.startsWith('PDF_EXPORT:')) {
            const base64 = returnValue.replace('PDF_EXPORT:', '');
            const date = new Date().toISOString().split('T')[0];
            const filename = `Lily_Statement_${date}.pdf`;

            const { InputFile } = await import('grammy');
            await bot.api.sendDocument(job.data.chatId,
                new InputFile(Buffer.from(base64, 'base64'), filename),
                {
                    caption: `📄 **Daily Statement (PDF)**\nDate: ${date}\n\nHere is your world-class financial report.`,
                    reply_to_message_id: job.data.messageId
                }
            );
        }
        else if (typeof returnValue === 'string' && returnValue.startsWith('EXCEL_EXPORT:')) {
            const csv = returnValue.replace('EXCEL_EXPORT:', '');
            const date = new Date().toISOString().split('T')[0];
            const filename = `Lily_Report_${date}.csv`;

            // Send as document (using InputFile)
            const { InputFile } = await import('grammy');
            await bot.api.sendDocument(job.data.chatId,
                new InputFile(Buffer.from(csv, 'utf-8'), filename),
                {
                    caption: `📊 **Daily Report**\nDate: ${date}\n\nOpen in Excel for full details.`,
                    reply_to_message_id: job.data.messageId
                }
            );
        } else {
            // Send normal text reply
            await bot.api.sendMessage(job.data.chatId, returnValue, {
                reply_to_message_id: job.data.messageId,
                parse_mode: 'Markdown'
            });
        }
    }
});

worker.on('failed', async (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
    if (job?.data.chatId) {
        await bot.api.sendMessage(job.data.chatId, `⚠️ **System Error**: ${err.message}`, {
            reply_to_message_id: job.data.messageId,
            parse_mode: 'Markdown'
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

    // 🛡️ MILITARY-GRADE SECURITY: System Owner Validation
    // ZERO-TRUST ARCHITECTURE - No bypasses, no shortcuts, no exceptions
    const rawOwnerEnv = (process.env.OWNER_ID || '').replace(/['"\[\]\s]+/g, '').trim();

    // Parse OWNER_ID into clean numeric array (supports comma-separated list)
    const ownerList = rawOwnerEnv.split(',').map(id => id.replace(/\D/g, '')).filter(id => id.length > 0);

    // STRICT VALIDATION: User must be in the authorized list
    const isOwner = ownerList.length > 0 && ownerList.includes(userId.toString());

    // AUDIT LOG: Record all authorization checks for security monitoring
    if (text.startsWith('/generate_key') || text.startsWith('/super_activate')) {
        const timestamp = new Date().toISOString();
        const authResult = isOwner ? '✅ AUTHORIZED' : '❌ DENIED';
        console.log(`[SECURITY AUDIT] ${timestamp} | User: ${userId} (${username}) | Command: ${text.split(' ')[0]} | Result: ${authResult} | Registry: [${ownerList.join('|')}]`);
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

    // 1. HEALTH CHECK & SYSTEM COMMANDS
    if (text === '/ping') {
        return ctx.reply("🏓 **Pong!** I am alive and listening.", { parse_mode: 'Markdown' });
    }

    // Diagnostic: /whoami
    if (text.startsWith('/whoami')) {
        const statusIcon = isOwner ? "✅" : "👤";
        const ownerStatus = isOwner ? "**System Owner**" : "**Regular User**";
        const configStatus = ownerList.length > 0 ? `${ownerList.length} ID(s) configured` : '⚠️ NOT CONFIGURED';
        return ctx.reply(`${statusIcon} **User Diagnostics**\n\nID: \`${userId}\`\nName: ${username}\nStatus: ${ownerStatus}\n\n**Registry:** \`${configStatus}\``, { parse_mode: 'Markdown' });
    }

    // /recover [group_id] (OWNER ONLY - Retrieve from Vault)
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

        if (archiveRes.rows.length === 0) {
            return ctx.reply("❌ **Vault Empty**: No recent reports found for this group ID.");
        }

        const { pdf_blob, business_date } = archiveRes.rows[0];
        const dateStr = new Date(business_date).toISOString().split('T')[0];
        const { InputFile } = await import('grammy');

        await ctx.reply(`🛡️ **Vault Extraction Successful**\nGroup: \`${targetGroupId}\`\nDate: ${dateStr}\n\n*Sending report...*`);
        return ctx.replyWithDocument(new InputFile(pdf_blob, `Recovered_Report_${dateStr}.pdf`));
    }
    if (text.startsWith('/generate_key')) {
        if (!isOwner) {
            console.log(`[SECURITY] Unauthorized user ${username} tried to generate key.`);
            return ctx.reply(`❌ **权限错误 (Security Error)**\n\n您的 ID (\`${userId}\`) 不在系统管理员名单中。\n\n**当前授权名单 (Registry):** \`${ownerList.join(', ') || 'NONE'}\`\n\n如果您是群主，请在 Railway 设置中的 \`OWNER_ID\` 填入您的 ID 即可。`, { parse_mode: 'Markdown' });
        }
        const parts = text.split(/\s+/);
        const days = parseInt(parts[1]) || 30;
        const maxUsers = parseInt(parts[2]) || 100;
        const customKey = parts[3]; // Optional CUSTOM Key

        // If customKey exists, use it, otherwise random
        const key = customKey ? customKey.toUpperCase() : await Licensing.generateKey(days, maxUsers, userId);

        // If it was a custom key, we need to manually insert it into DB
        if (customKey) {
            await db.query(`
                INSERT INTO licenses (key, duration_days, max_users, created_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (key) DO NOTHING
            `, [key, days, maxUsers, userId]);
        }

        return ctx.reply(`🔑 **New License Key Prepared**\nKey: \`${key}\`\nDays: ${days}\nUsers: ${maxUsers}\n\nUse \`/activate ${key}\` in the client group.`, { parse_mode: 'Markdown' });
    }

    // /super_activate [days] (OWNER ONLY - Instant Bypass)
    if (text.startsWith('/super_activate')) {
        if (!isOwner) return;
        const parts = text.split(/\s+/);
        const days = parseInt(parts[1]) || 365;
        const key = "MASTER-PASS-" + Math.random().toString(36).substring(7).toUpperCase();

        // Directly update the group without checking for a license code
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + days);

        const chatTitle = ctx.chat.type !== 'private' ? ctx.chat.title : 'Private Chat';
        await db.query(`
            INSERT INTO groups (id, status, license_key, license_expiry, title)
            VALUES ($1, 'ACTIVE', $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', license_key = $2, license_expiry = $3, title = $4
        `, [chatId, key, expiry, chatTitle]);

        return ctx.reply(`👑 **尊享特权激活 (System Owner Activation)**\n\n✨ **服务已开启 (Service Active)**\n本群组已由系统管理员强制激活。\n\n📅 **有效期 (Validity):** ${days} 天 (Days)\n🔐 **到期日期 (Expiry):** ${expiry.toISOString().split('T')[0]}`, { parse_mode: 'Markdown' });
    }

    // /activate [key] (Bypasses License Check by nature)
    if (text.startsWith('/activate')) {
        const parts = text.split(/\s+/); // Use regex for robust splitting
        let key = parts[1];
        if (!key) return ctx.reply("📋 **请提供授权码 (Please provide activation key)**\n\n格式 (Format): `/activate LILY-XXXX`", { parse_mode: 'Markdown' });

        // Normalize key: uppercase and trim
        key = key.trim().toUpperCase();

        const chatTitle = ctx.chat.type !== 'private' ? ctx.chat.title : 'Private Chat';
        const result = await Licensing.activateGroup(chatId, key, chatTitle);

        // If activation successful, send welcome + setup reminder
        if (result.success) {
            await ctx.reply(result.message, { parse_mode: 'Markdown' });

            // Prompt for rate setup
            return ctx.reply(
                `📌 **温馨提示 (Friendly Reminder)**\n\n` +
                `为了开始使用，请先设置您的费率：\n` +
                `(To begin using the system, please set your rates first)\n\n` +
                `💡 **快速设置 (Quick Setup):**\n` +
                `• 入款费率: \`设置费率 0.03\` (3%)\n` +
                `• 下发费率: \`设置下发费率 0.02\` (2%)\n` +
                `• 美元汇率: \`设置美元汇率 7.2\`\n\n` +
                `设置完成后，发送 \`开始\` 即可开始记录。`,
                { parse_mode: 'Markdown' }
            );
        } else {
            return ctx.reply(result.message, { parse_mode: 'Markdown' });
        }
    }


    // 4. BUSINESS LOGIC (Recognize Commands)
    const isCommand =
        text.startsWith('/') || // Catch-all for any slash command
        // Core commands (Bilingual)
        text === '开始' || text.toLowerCase() === 'start' ||
        text === '结束记录' || text.toLowerCase() === 'stop' ||
        text === '显示账单' || text === '显示操作人' ||
        text === '清理今天数据' ||
        text === '下载报表' || text === '导出Excel' ||

        // Settings triggers
        text.startsWith('设置费率') ||
        text.startsWith('设置下发费率') ||
        text.startsWith('设置美元汇率') ||
        text.startsWith('设置比索汇率') ||
        text.startsWith('设置马币汇率') ||
        text.startsWith('设置泰铢汇率') ||
        text.startsWith('设置汇率') ||
        text.startsWith('删除美元汇率') ||
        text.startsWith('删除比索汇率') ||
        text.startsWith('删除马币汇率') ||
        text.startsWith('删除泰铢汇率') ||
        text.startsWith('删除汇率') ||
        text === '设置为无小数' ||
        text === '设置为计数模式' ||
        text.startsWith('设置显示模式') ||
        text === '设置为原始模式' ||

        // RBAC triggers
        text.startsWith('设置操作人') ||
        text.startsWith('删除操作人') ||

        // Transaction Pattern (Strict regex)
        /^[+\-取]\s*\d/.test(text) ||
        text.startsWith('下发') ||
        text.startsWith('回款') ||
        text.startsWith('入款-');

    // 5. LICENSE CHECK (Redirect if Inactive)
    if (isCommand) {
        // Essential commands that MUST work even without a license
        const isEssential =
            text.startsWith('/activate') ||
            text.startsWith('/start') ||
            text.startsWith('/whoami') ||
            text === '/ping';

        // /start logic for onboarding
        if (text.startsWith('/start')) {
            return ctx.reply(
                `✨ **欢迎使用 Lily 智能账本系统 (Lily Smart Ledger)**\n` +
                `专业 · 高效 · 实时财务结算解决方案\n\n` +
                `📊 **核心优势 (Core Features):**\n` +
                `• 实时入款/下发记录与结算\n` +
                `• 自动汇率换算与资产汇点管理\n` +
                `• 秒级生成可视化财务报表\n` +
                `• 军工级数据安全与权限控制\n\n` +
                `🚀 **快速开始 (Quick Onboarding):**\n` +
                `1. 获取授权码 (Contact System Owner for Key)\n` +
                `2. 在群组内发送: \`/activate [您的授权码]\`\n` +
                `3. 配置费率并点击 "开始" 即可\n\n` +
                `💡 *ID: \`${userId}\` | Status: ${isOwner ? '👑 Owner' : '👤 User'}*`,
                { parse_mode: 'Markdown' }
            );
        }

        // Owner Bypasses License Check, and essential commands bypass it
        if (!isOwner && !isEssential) {
            const isActive = await Licensing.isGroupActive(chatId);
            if (!isActive) {
                console.log(`[BLOCKED] Command "${text}" from ${username} in inactive group ${chatId}`);
                return ctx.reply("⚠️ **群组未激活或授权已过期 (Group Inactive or License Expired)**\n\n请联系管理员获取授权码。\nUse `/activate [KEY]` to enable full functionality.", { parse_mode: 'Markdown' });
            }
        }

        // 6. RBAC CHECK
        const isOperator = await RBAC.isAuthorized(chatId, userId);
        const opCountRes = await db.query('SELECT count(*) FROM group_operators WHERE group_id = $1', [chatId]);
        const hasOperators = parseInt(opCountRes.rows[0].count) > 0;

        // Bootstrapping or Owner Bypass
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
            return ctx.reply("❌ **权限提示 (Unauthorized)**\n\n您不是经授权的操作人或管理员。\nOnly authorized operators can record transactions here.\n\n请联系群主或经办人为您开通权限。", { parse_mode: 'Markdown' });
        }

        // 7. Activation Check
        const groupRes = await db.query('SELECT current_state FROM groups WHERE id = $1', [chatId]);
        const state = groupRes.rows[0]?.current_state || 'WAITING_FOR_START';
        const isTransaction = text.startsWith('+') || text.startsWith('-') || text.startsWith('下发') || text.startsWith('取') || text.startsWith('回款');

        if (isTransaction && state !== 'RECORDING') {
            return ctx.reply("⚠️ **请先输入 “开始” 以开启今日记录。**\nPlease send '开始' to activate the ledger first.", { parse_mode: 'Markdown' });
        }

        console.log(`[QUEUE] Adding command from ${username} in group ${chatId}`);
        await commandQueue.add('cmd', {
            chatId, userId, username, text, messageId,
            replyToMessage: ctx.message.reply_to_message
        });
    } else {
        // Log whisper-quiet for non-commands to avoid spamming console
        if (text.length < 50) console.log(`[CHAT] ${username}: "${text}"`);
    }
});

// Startup
async function start() {
    await db.migrate();

    // Start Auto-Rollover Engine
    await Chronos.init(bot);

    // RESET WEBHOOK (Fixes "Deaf Bot" issue if webhook was ever set)
    console.log('🔄 Resetting Telegram Webhook...');
    await bot.api.deleteWebhook();

    // Start Bot
    console.log('🚀 Lily Bot Starting...');
    await bot.start({
        onStart: (botInfo) => {
            console.log(`✅ SUCCESS: Connected to Telegram as @${botInfo.username} (${botInfo.id})`);
            console.log(`✅ Waiting for messages...`);
        }
    });
}

start().catch(console.error);
