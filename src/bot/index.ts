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

    // Security: Check if user is System Owner (Hyper-Resilient Multi-ID Matching)
    const rawOwnerEnv = (process.env.OWNER_ID || '').replace(/['"\[\]]+/g, '').trim();
    const masterKey = process.env.MASTER_KEY ? process.env.MASTER_KEY.trim() : null;

    // Parse OWNER_ID into a clean array of numeric strings
    const ownerList = rawOwnerEnv.split(',').map(id => id.replace(/\D/g, '')).filter(id => id.length > 0);

    let ownerReason = "ID_NOT_IN_LIST";
    let isOwner = ownerList.includes(userId.toString());

    if (isOwner) ownerReason = "LIST_MATCH";

    // Emergency Mode: Hyper-Resilient "CLAIM"
    if (!isOwner && rawOwnerEnv.toUpperCase() === 'CLAIM') {
        process.env.OWNER_ID = userId.toString();
        isOwner = true;
        ownerReason = "EMERGENCY_CLAIM_SUCCESS";
        console.log(`👑 [EMERGENCY] User ${username} (${userId}) has CLAIMED ownership of this bot.`);
    }

    // Master Secret Bypass (One-time supreme authority)
    if (!isOwner && (text.includes('#LILY-ADMIN') || (masterKey && text.includes(masterKey)))) {
        isOwner = true;
        ownerReason = "MASTER_SECRET_BYPASS";
    }

    // DEBUG LOG (Masked)
    if (isOwner) console.log(`[AUTH] 👑 Verified Owner: ${username} (${userId}) [Reason: ${ownerReason}]`);
    else if (text.startsWith('/')) console.log(`[AUTH] 👤 Standard User: ${userId} | Registry: [${ownerList.join('|')}] | Env: "${rawOwnerEnv}"`);

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
        const ownerStatus = isOwner ? `**System Owner** (via ${ownerReason})` : "**Regular User**";
        return ctx.reply(`${statusIcon} **User Diagnostics**\n\nID: \`${userId}\`\nName: ${username}\nStatus: ${ownerStatus}\n\n**Registry Status:** \`${ownerList.length} ID(s) configured\`\n**Env State:** \`${rawOwnerEnv === 'CLAIM' ? 'BOOTSTRAP_READY' : rawOwnerEnv ? 'RESTRICTED' : 'NOT_CONFIGURED'}\``, { parse_mode: 'Markdown' });
    }

    // /generate_key [days] [users] [CUSTOM_KEY] (OWNER ONLY)
    if (text.startsWith('/generate_key')) {
        if (!isOwner) {
            console.log(`[SECURITY] Unauthorized user ${username} tried to generate key.`);
            return ctx.reply(`❌ **权限错误 (Security Error)**\n\n您的 ID (\`${userId}\`) 不在系统管理员名单中。\n\n**当前授权名单 (Registry):** \`${ownerList.join(', ') || 'NONE'}\`\n\n如果您是群主，请在 Railway 设置中的 \`OWNER_ID\` 填入您的 ID 即可。`, { parse_mode: 'Markdown' });
        }
        const parts = text.split(' ');
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
        const days = parseInt(text.split(' ')[1]) || 365;
        const key = "MASTER-PASS-" + Math.random().toString(36).substring(7).toUpperCase();

        // Directly update the group without checking for a license code
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + days);

        await db.query(`
            INSERT INTO groups (id, status, license_key, license_expiry)
            VALUES ($1, 'ACTIVE', $2, $3)
            ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', license_key = $2, license_expiry = $3
        `, [chatId, key, expiry]);

        return ctx.reply(`👑 **尊享特权激活 (System Owner Activation)**\n\n✨ **服务已开启 (Service Active)**\n本群组已由系统管理员强制激活。\n\n📅 **有效期 (Validity):** ${days} 天 (Days)\n🔐 **到期日期 (Expiry):** ${expiry.toISOString().split('T')[0]}`, { parse_mode: 'Markdown' });
    }

    // /activate [key] (Bypasses License Check by nature)
    if (text.startsWith('/activate')) {
        const parts = text.split(' ');
        let key = parts[1];
        if (!key) return ctx.reply("Please provide a key: `/activate LILY-XXXX`", { parse_mode: 'Markdown' });

        key = key.trim().toUpperCase();

        const result = await Licensing.activateGroup(chatId, key);
        return ctx.reply(result.message, { parse_mode: 'Markdown' });
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
        // Owner Bypasses License Check
        if (!isOwner) {
            const isActive = await Licensing.isGroupActive(chatId);
            if (!isActive) {
                console.log(`[BLOCKED] Command "${text}" from ${username} in inactive group ${chatId}`);
                return ctx.reply("⚠️ **Group Inactive or License Expired**\nPlease contact your administrator to get a valid license key.\n\nUse `/activate [KEY]` to enable full functionality.", { parse_mode: 'Markdown' });
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
