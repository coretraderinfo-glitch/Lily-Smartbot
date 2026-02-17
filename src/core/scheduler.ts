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
            // WORLD-CLASS: Join with settings to check calc_enabled and language_mode
            const groupsRes = await client.query(`
                SELECT g.*, gs.calc_enabled, gs.language_mode 
                FROM groups g
                LEFT JOIN group_settings gs ON g.id = gs.group_id
                WHERE g.status = 'ACTIVE'
            `);

            const bulkResults = await Promise.all(groupsRes.rows.map(async (group) => {
                const tz = group.timezone || 'Asia/Shanghai';
                const now = DateTime.now().setZone(tz);
                const lang = group.language_mode || 'CN';

                // Configurable reset hour (default 4 AM)
                const resetHour = group.reset_hour || 4;

                // 🌈 SMART TRIGGER: Trigger if we are in the reset hour AND haven't run today
                if (now.hour === resetHour) {

                    // 1. CHECK STATE: Has someone already closed it manually?
                    if (group.current_state === 'ENDED') return;

                    // 2. CHECK LOCK: Avoid double-posting in the same day
                    const lastReset = group.last_auto_reset ? DateTime.fromJSDate(group.last_auto_reset).setZone(tz) : null;
                    if (lastReset && lastReset.hasSame(now, 'day')) return;

                    console.log(`[CHRONOS] ⚡ Auto-Rollover triggering for Group ${group.id} (${group.title}) (Lang: ${lang})`);

                    // 🧠 SMART GREETING: Check if calc is enabled
                    const calcEnabled = group.calc_enabled !== false; // Default true

                    if (calcEnabled) {
                        try {
                            // 3. EXECUTE CLOSURE (Full Report)
                            await Ledger.generateBill(group.id);
                            const pdf = await PDFExport.generateDailyPDF(group.id);
                            const lastDate = DateTime.now().setZone(tz).minus({ days: 1 }).toFormat('yyyy-MM-dd');

                            // 🤖 DYNAMIC AI SLOGAN: Generate unique message every time
                            const sloganPrompt = lang === 'CN' ? '请生成一条温馨的晚安祝福语，祝辛苦了一天的人好梦。自然、人情味，1-2句。'
                                : lang === 'MY' ? 'Sila jana satu ucapan selamat malam yang mesra untuk ahli group yang sudah penat bekerja. Santai dan bermakna, 1-2 ayat.'
                                    : 'Generate a short, warm good night message for hardworking users. 1-2 sentences.';

                            const slogan = await AIBrain.generateSimpleGreeting(sloganPrompt, lang);
                            const fallbackSlogan = lang === 'CN' ? '🌙 辛苦了一天，早点休息吧。明天继续加油！'
                                : lang === 'MY' ? '🌙 Penat bekerja hari ni, rehat secukupnya ya. Esok kita pulun lagi!'
                                    : '🌙 Hard work pays off, get some rest! See you tomorrow.';

                            const title = lang === 'CN' ? `🏁 **系统自动结算 (Time: ${resetHour}:00)**`
                                : lang === 'MY' ? `🏁 **Sistem Automatik Tutup (Masa: ${resetHour}:00)**`
                                    : `🏁 **System Auto-Rollover (Time: ${resetHour}:00)**`;

                            const body = lang === 'CN' ? `本日记录已正式截止并存入云端。\n\n${slogan || fallbackSlogan}\n\n📢 **温馨提示：** 明天上班请记得回复 **"开始"** 以激活新的账单记录副本。`
                                : lang === 'MY' ? `Rekod hari ini telah tamat dan disimpan dalam cloud.\n\n${slogan || fallbackSlogan}\n\n📢 **Pesanan:** Esok masuk kerja, sila balas **"Mula"** atau **"Start"** untuk buka lejar baru.`
                                    : `Today's record is finalized and archived.\n\n${slogan || fallbackSlogan}\n\n📢 **Tip:** Reply **"Start"** tomorrow to activate the new record cycle.`;

                            const finalMsg = `${title}\n\n${body}`;

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
                        const greetingPrompt = lang === 'CN' ? '请生成一条简短温馨的晚安问候，祝对方休息好，明天生意兴隆。像朋友聊天，1句话。'
                            : lang === 'MY' ? 'Sila jana satu ucapan selamat malam yang ringkas dan mesra. Doakan mereka rehat cukup dan esok bisnes meletop. 1 ayat sahaja.'
                                : 'Generate a short, friendly good night greeting. Wish them good rest and business success for tomorrow. 1 sentence.';

                        const greeting = await AIBrain.generateSimpleGreeting(greetingPrompt, lang)
                            .catch(() => lang === 'CN' ? '🌙 晚安！祝您好梦，明天会更好！'
                                : lang === 'MY' ? '🌙 Selamat malam! Semoga mimpi indah dan esok bertambah rezeki!'
                                    : '🌙 Good night! Sweet dreams and may tomorrow be even better!');

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
