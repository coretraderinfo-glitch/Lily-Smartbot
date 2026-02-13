import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '../db';
import { Ledger } from './ledger';
import { PDFExport } from './pdf';
import { DateTime } from 'luxon';
import { Bot, InputFile } from 'grammy';

/**
 * THE CHRONOS ENGINE: Auto-Rollover & Scheduled Reporting
 * Handles the 4:00 AM (or configured time) closing cycle for all groups.
 */

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const schedulerQueue = new Queue('lily-scheduler', { connection });

export const Chronos = {
    /**
     * Initialize the Global Tick
     */
    async init(bot: Bot) {
        // 1. Setup Worker
        const worker = new Worker('lily-scheduler', async (job: Job) => {
            if (job.name === 'check-rollover') {
                await Chronos.processAllRollovers(bot);
            }
            if (job.name === 'purge-old-data') {
                await Chronos.purgeOldArchives();
            }
        }, { connection });

        // 2. Add Rollover Check (Every minute)
        await schedulerQueue.add('check-rollover', {}, {
            repeat: { pattern: '* * * * *' },
            removeOnComplete: true,
            removeOnFail: true
        });

        // 3. Add Purge Task (Every Hour)
        await schedulerQueue.add('purge-old-data', {}, {
            repeat: { pattern: '0 * * * *' },
            removeOnComplete: true,
            removeOnFail: true
        });

        console.log('⏳ Chronos Engine: Online (1-min resolution)');
        console.log('🛡️  Audit Vault: Purge Cycle Scheduled (3-day retention)');
    },

    /**
     * Data Protection: Purge archives older than 3 days
     */
    async purgeOldArchives() {
        try {
            // 1. Purge Historical Archives (PDFs)
            const archivesRes = await db.query(`
                DELETE FROM historical_archives 
                WHERE archived_at < NOW() - INTERVAL '3 days'
            `);

            // 2. Purge Transactions (The main data)
            // STRICT 3-DAY RETENTION POLICY
            const txRes = await db.query(`
                DELETE FROM transactions 
                WHERE recorded_at < NOW() - INTERVAL '3 days'
            `);

            // 3. Purge Audit Logs
            const auditRes = await db.query(`
                DELETE FROM audit_logs 
                WHERE created_at < NOW() - INTERVAL '3 days'
            `);

            if ((txRes.rowCount && txRes.rowCount > 0) || (archivesRes.rowCount && archivesRes.rowCount > 0)) {
                console.log(`[CHRONOS] 3-Day Purge Complete. Cleaned ${txRes.rowCount} transactions and ${archivesRes.rowCount} archives.`);
            }
        } catch (e) {
            console.error('[CHRONOS] Purge failed:', e);
        }
    },

    /**
     * Process all groups that need rollover
     */
    async processAllRollovers(bot: Bot) {
        const client = await db.getClient();
        try {
            // WORLD-CLASS: Join with settings to check calc_enabled
            const groupsRes = await client.query(`
                SELECT g.*, gs.calc_enabled 
                FROM groups g
                LEFT JOIN group_settings gs ON g.id = gs.group_id
                WHERE g.status = 'ACTIVE'
            `);

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

                    // 🧠 SMART GREETING: Check if calc is enabled
                    const calcEnabled = group.calc_enabled !== false; // Default true

                    if (calcEnabled) {
                        // 3. EXECUTE CLOSURE (Full Report)
                        await Ledger.generateBill(group.id);
                        const pdf = await PDFExport.generateDailyPDF(group.id);
                        const lastDate = DateTime.now().setZone(tz).minus({ days: 1 }).toFormat('yyyy-MM-dd');

                        const slogans = [
                            "🌙 漫长的一天辛苦了，愿您好梦相伴，我们明天再战！",
                            "🌟 星光不问赶路人，时光不负有心人。早点休息，明天见！",
                            "✨ 万物归于沉静，愿您神采奕奕迎接崭新的一天。好梦！",
                            "🌙 忙碌了一天，也请给心灵放个假。祝您平安喜乐，晚安！",
                            "🌟 愿您在这静谧的夜里彻底放松，明天又是元气满满的一天！",
                            "✨ 每一个奋斗的明天，都始于今晚的高质量休息。祝好梦！",
                            "🌙 无论今天如何，都请温柔地对待今晚的自己。晚安，朋友！"
                        ];
                        const slogan = slogans[Math.floor(Math.random() * slogans.length)];

                        const finalMsg = `🏁 **系统自动结算 (Time: ${resetHour}:00)**\n\n` +
                            `本日记录已正式截止并存入云端。\n\n` +
                            `${slogan}\n\n` +
                            `📢 **温馨提示：** 明天上班请记得回复 **"开始"** 以激活新的账单记录副本。`;

                        try {
                            await bot.api.sendMessage(group.id, finalMsg, { parse_mode: 'Markdown' });

                            await client.query(`
                                INSERT INTO historical_archives (group_id, business_date, type, pdf_blob)
                                VALUES ($1, $2, 'DAILY_SNAPSHOT', $3)
                            `, [group.id, lastDate, pdf]);

                            await client.query(`
                                UPDATE groups 
                                SET current_state = 'ENDED', 
                                    last_auto_reset = $1 
                                WHERE id = $2
                            `, [now.toJSDate(), group.id]);

                        } catch (err: any) {
                            console.error(`[CHRONOS] Failed to send report to group ${group.id}:`, err.message);
                        }
                    } else {
                        // CALC DISABLED: Simple good night message
                        const simpleGreetings = [
                            "🌙 一天辛苦了！早点休息，祝您好梦。明天继续加油！",
                            "🌟 夜深了，祝您睡个好觉。明天会更好！",
                            "✨ 辛苦一天了，好好休息吧。祝您明天生意兴隆！"
                        ];
                        const greeting = simpleGreetings[Math.floor(Math.random() * simpleGreetings.length)];

                        try {
                            await bot.api.sendMessage(group.id, greeting);
                            await client.query(`UPDATE groups SET last_auto_reset = $1 WHERE id = $2`, [now.toJSDate(), group.id]);
                        } catch (err: any) {
                            console.error(`[CHRONOS] Failed to send greeting to group ${group.id}:`, err.message);
                        }
                    }
                }
            }
        } finally {
            client.release();
        }
    }
};
