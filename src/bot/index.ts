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
    const text = ctx.message.text;
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const messageId = ctx.message.message_id;

    // Filter: Only Group/Supergroup?
    // if (ctx.chat.type === 'private') return ctx.reply("Groups only.");

    // Simple Command Filter (Bot Optimization)
    // Only send to queue if it looks like a command we care about
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
        await commandQueue.add('cmd', {
            chatId, userId, username, text, messageId
        });
    }
});

// Startup
async function start() {
    await db.migrate();

    // Start Bot (Long Polling for Dev/Small Scale, Webhook for Prod)
    // For Railway, simple Long Polling is easiest to start with no domain config
    console.log('🚀 Lily Bot Starting...');
    await bot.start();
}

start().catch(console.error);
