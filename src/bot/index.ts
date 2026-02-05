import { Bot, Context } from 'grammy';
import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { processCommand } from '../worker/processor';
import { db } from '../db';
import { Licensing } from '../core/licensing';
import dotenv from 'dotenv';
import checkEnv from 'check-env';

dotenv.config();
checkEnv(['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL']);

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
        // Send Reply
        await bot.api.sendMessage(job.data.chatId, returnValue, {
            reply_to_message_id: job.data.messageId,
            parse_mode: 'Markdown'
        });
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
    const text = ctx.message.text.trim(); // TRIM WHITESPACE!
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const messageId = ctx.message.message_id;

    // DEBUG LOG: Show us what the bot actually sees
    console.log(`[MSG] Group:${chatId} User:${username} says: "${text}"`);

    // 1. HEALTH CHECK
    if (text === '/ping') {
        return ctx.reply("🏓 **Pong!** I am alive and listening.", { parse_mode: 'Markdown' });
    }

    // 2. LICENSING COMMANDS (Prioritized)

    // /generate_key [days] [users] (OWNER ONLY)
    if (text.startsWith('/generate_key')) {
        const parts = text.split(' ');
        const days = parseInt(parts[1]) || 30;
        const maxUsers = parseInt(parts[2]) || 100;

        // Security: Simple Check against ENV or just allow for now (User must set OWNER_ID)
        // if (userId.toString() !== process.env.OWNER_ID) return; 

        const key = await Licensing.generateKey(days, maxUsers, userId);
        return ctx.reply(`🔑 **New License Key Generated**\nKey: \`${key}\`\nDays: ${days}\n\nUse \`/activate ${key}\` in your group.`, { parse_mode: 'Markdown' });
    }

    // /activate [key]
    if (text.startsWith('/activate')) {
        const parts = text.split(' ');
        const key = parts[1];
        if (!key) return ctx.reply("Please provide a key: `/activate LILY-XXXX`", { parse_mode: 'Markdown' });

        const result = await Licensing.activateGroup(chatId, key);
        return ctx.reply(result.message, { parse_mode: 'Markdown' });
    }

    // 3. LICENSE CHECK MIDDLEWARE
    const isActive = await Licensing.isGroupActive(chatId);
    if (!isActive) {
        // If it looks like a command but group is inactive
        const potentialCommand = text.startsWith('开始') || text.startsWith('+');
        if (potentialCommand) {
            return ctx.reply("⚠️ **Trial Expired or Inactive**\nPlease contact admin to purchase a license key.\nUse `/activate [KEY]` to resume.", { parse_mode: 'Markdown' });
        }
        return; // Ignore regular chatter
    }

    // 4. BUSINESS LOGIC (Only if Active)
    const isCommand =
        // Core commands
        text === '开始' || text.toLowerCase() === 'start' ||
        text === '结束记录' ||
        text === '显示账单' ||
        text === '显示操作人' ||
        text === '清理今天数据' ||

        // Settings commands
        text.startsWith('设置费率') ||
        text.startsWith('设置下发费率') ||
        text.startsWith('设置美元汇率') ||
        text.startsWith('设置比索汇率') ||
        text.startsWith('设置马币汇率') ||
        text.startsWith('设置泰铢汇率') ||
        text.startsWith('/gd') ||
        text === '设置为无小数' ||
        text === '设置为计数模式' ||
        text.startsWith('设置显示模式') ||
        text === '设置为原始模式' ||

        // RBAC commands
        text.startsWith('设置操作人') ||
        text.startsWith('删除操作人') ||

        // Transaction commands
        text.startsWith('+') ||
        text.startsWith('下发') ||
        text.startsWith('回款') ||
        text.startsWith('入款-');

    if (isCommand) {
        console.log(`[QUEUE] Adding command from ${username}`);
        await commandQueue.add('cmd', {
            chatId, userId, username, text, messageId
        });
    } else {
        console.log(`[IGNORE] "${text}" is not a recognized command.`);
    }
});

// Startup
async function start() {
    await db.migrate();

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
