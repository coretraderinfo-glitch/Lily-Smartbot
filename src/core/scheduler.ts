import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '../db';
import { Ledger } from './ledger';
import { DateTime } from 'luxon';
import { Bot } from 'grammy';

/**
 * THE CHRONOS ENGINE: Auto-Rollover & Scheduled Reporting
 * Handles the 4:00 AM (or configured time) closing cycle for all groups.
 */

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const schedulerQueue = new Queue('lily-scheduler', { connection });

export const Chronos = {
    /**
     * Initialize the Global Tick
     * Runs every 1 minute to check if any group has reached its reset hour
     */
    async init(bot: Bot) {
        // 1. Setup Worker
        const worker = new Worker('lily-scheduler', async (job: Job) => {
            if (job.name === 'check-rollover') {
                await Chronos.processAllRollovers(bot);
            }
        }, { connection });

        // 2. Add Repeatable Job (Every minute)
        await schedulerQueue.add('check-rollover', {}, {
            repeat: { pattern: '* * * * *' },
            removeOnComplete: true,
            removeOnFail: true
        });

        console.log('⏳ Chronos Engine: Online (1-min resolution)');
    },

    /**
     * Process all groups that need rollover
     */
    async processAllRollovers(bot: Bot) {
        const client = await db.getClient();
        try {
            // Find groups where current_time (in their timezone) has just hit the reset hour
            // and we haven't processed today's rollover yet.
            const groupsRes = await client.query('SELECT * FROM groups WHERE status = \'ACTIVE\'');

            for (const group of groupsRes.rows) {
                const tz = group.timezone || 'Asia/Shanghai';
                const now = DateTime.now().setZone(tz);

                // Configurable reset hour (default 4 AM)
                const resetHour = group.reset_hour || 4;

                // We trigger the rollover if the hour matches EXACTLY and we are in the first few minutes
                // (Worker avoids multiple triggers via a simple lock or state check)
                if (now.hour === resetHour && now.minute === 0) {

                    // 1. CHECK STATE: Has someone already closed it manually?
                    if (group.current_state === 'ENDED') continue;

                    // 2. CHECK LOCK: Avoid double-posting in the same minute
                    const lastReset = group.last_auto_reset ? DateTime.fromJSDate(group.last_auto_reset).setZone(tz) : null;
                    if (lastReset && lastReset.hasSame(now, 'day')) continue;

                    console.log(`[CHRONOS] Auto-Rollover triggering for Group ${group.id}`);

                    // 3. EXECUTE CLOSURE
                    const bill = await Ledger.generateBill(group.id);
                    const finalMsg = `🏁 **系统自动结算** (Time: ${resetHour}:00)\n\n本日记录已截止。以下是最终账单：\n\n${bill}\n\n📅 **新的一天已开始。**\n请输入 "开始" 或 "+金额" 来记录新账单。`;

                    try {
                        await bot.api.sendMessage(group.id, finalMsg, { parse_mode: 'Markdown' });

                        // 4. UPDATE STATE
                        await client.query(`
                            UPDATE groups 
                            SET current_state = 'ENDED', 
                                last_auto_reset = $1 
                            WHERE id = $2
                        `, [now.toJSDate(), group.id]);

                    } catch (err: any) {
                        console.error(`[CHRONOS] Failed to send report to group ${group.id}:`, err.message);
                    }
                }
            }
        } finally {
            client.release();
        }
    }
};
