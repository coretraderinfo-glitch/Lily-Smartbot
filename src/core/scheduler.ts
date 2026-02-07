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
                    await Ledger.generateBill(group.id); // Triggers internal checks
                    const pdf = await PDFExport.generateDailyPDF(group.id);
                    const date = DateTime.now().setZone(tz).minus({ days: 1 }).toFormat('yyyy-MM-dd');
                    const filename = `Lily_Final_Statement_${date}.pdf`;

                    const finalMsg = `🏁 **系统自动结算** (Time: ${resetHour}:00)\n\n本日记录已截止。最终 PDF 已存档至系统后台。`;

                    try {
                        // Send Text
                        await bot.api.sendMessage(group.id, finalMsg, { parse_mode: 'Markdown' });

                        // 4. Archive Snapshot in Vault (DB)
                        await client.query(`
                            INSERT INTO historical_archives (group_id, business_date, type, pdf_blob)
                            VALUES ($1, $2, 'DAILY_SNAPSHOT', $3)
                        `, [group.id, date, pdf]);

                        // 5. UPDATE STATE
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
