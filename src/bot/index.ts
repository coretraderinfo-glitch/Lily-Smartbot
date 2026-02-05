import { Bot, Context } from 'grammy';
import { Worker, Queue } from 'bullmq';
import { processCommand } from '../worker/processor';
import { db } from '../db';
import dotenv from 'dotenv';
import checkEnv from 'check-env';

dotenv.config();
checkEnv(['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL']);

// Init Dependencies
const bot = new Bot(process.env.BOT_TOKEN!);

// Queue Setup
const connection = { url: process.env.REDIS_URL }; // IORedis format
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

    // HEALTH CHECK
    if (text === '/ping') {
        return ctx.reply("🏓 **Pong!** I am alive and listening.", { parse_mode: 'Markdown' });
    }

    // Filter: Only Group/Supergroup?
    // if (ctx.chat.type === 'private') return ctx.reply("Groups only.");

    // Simple Command Filter (Bot Optimization)
    const isCommand =
        text === '开始' || text.toLowerCase() === 'start' ||
        text === '结束记录' ||
        text === '显示账单' ||
        text.startsWith('设置') ||
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

    // Start Bot (Long Polling for Dev/Small Scale, Webhook for Prod)
    // For Railway, simple Long Polling is easiest to start with no domain config
    console.log('🚀 Lily Bot Starting...');
    await bot.start();
}

start().catch(console.error);
