import { Bot } from 'grammy';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// SINGLETON BOT INSTANCE
export const bot = new Bot(process.env.BOT_TOKEN!);

// SINGLETON REDIS CONNECTION
export const connection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    retryStrategy(times) {
        return Math.min(times * 50, 2000);
    }
});

connection.on('error', (err) => {
    console.error('❌ Redis Connection Error:', err.message);
});
