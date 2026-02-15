import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '../db';
import { Ledger } from './ledger';
import { PDFExport } from './pdf';
import { DateTime } from 'luxon';
import { Bot, InputFile } from 'grammy';
import { AIBrain } from '../utils/ai';

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

            const bulkResults = await Promise.all(groupsRes.rows.map(async (group) => {
                const tz = group.timezone || 'Asia/Shanghai';
                const now = DateTime.now().setZone(tz);

                // Configurable reset hour (default 4 AM)
                const resetHour = group.reset_hour || 4;

                // 🌈 SMART TRIGGER: Trigger if we are in the reset hour AND haven't run today
                // We removed now.minute === 0 to avoid missing the window due to lag
                if (now.hour === resetHour) {

                    // 1. CHECK STATE: Has someone already closed it manually?
                    if (group.current_state === 'ENDED') return;

                    // 2. CHECK LOCK: Avoid double-posting in the same day
                    const lastReset = group.last_auto_reset ? DateTime.fromJSDate(group.last_auto_reset).setZone(tz) : null;
                    if (lastReset && lastReset.hasSame(now, 'day')) return;

                    console.log(`[CHRONOS] ⚡ Auto-Rollover triggering for Group ${group.id} (${group.title})`);

                    // 🧠 SMART GREETING: Check if calc is enabled
                    const calcEnabled = group.calc_enabled !== false; // Default true

                    if (calcEnabled) {
                        try {
                            // 3. EXECUTE CLOSURE (Full Report)
                            await Ledger.generateBill(group.id);
                            const pdf = await PDFExport.generateDailyPDF(group.id);
                            const lastDate = DateTime.now().setZone(tz).minus({ days: 1 }).toFormat('yyyy-MM-dd');

                            // 🤖 DYNAMIC AI SLOGAN: Generate unique message every time
                            const slogan = await AIBrain.generateSimpleGreeting(
                                '请生成一条温馨的晚安祝福语，告诉用户辛苦了一天，祝他们好梦，明天继续加油。要自然、温暖、有人情味，不要太长，1-2句话即可。'
                            ).catch(() => '🌙 辛苦了一天，早点休息吧。明天继续加油！'); // Fallback

                            const finalMsg = `🏁 **系统自动结算 (Time: ${resetHour}:00)**\n\n` +
                                `本日记录已正式截止并存入云端。\n\n` +
                                `${slogan}\n\n` +
                                `📢 **温馨提示：** 明天上班请记得回复 **"开始"** 以激活新的账单记录副本。`;

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
                            console.error(`[CHRONOS] Failed to process closure for group ${group.id}:`, err.message);
                        }
                    } else {
                        // CALC DISABLED: AI-generated simple good night message
                        const greeting = await AIBrain.generateSimpleGreeting(
                            '请生成一条简短温馨的晚安问候，祝对方休息好，明天生意兴隆。要自然亲切，像朋友聊天，1句话即可。'
                        ).catch(() => '🌙 晚安！祝您好梦，明天会更好！');

                        try {
                            await bot.api.sendMessage(group.id, greeting);
                            await client.query(`UPDATE groups SET last_auto_reset = $1 WHERE id = $2`, [now.toJSDate(), group.id]);
                        } catch (err: any) {
                            console.error(`[CHRONOS] Failed to send greeting to group ${group.id}:`, err.message);
                        }
                    }
                }
            }));
        } finally {
            client.release();
        }
    }
};
