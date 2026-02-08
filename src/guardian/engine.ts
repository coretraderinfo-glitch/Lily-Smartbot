import { db } from '../db';
import { Bot, Context } from 'grammy';

/**
 * LILY GUARDIAN ENGINE
 * World-Class group security, malware protection, and admin sentinel logic.
 */

const BLACKLIST_EXTENSIONS = ['.apk', '.zip', '.exe', '.scr', '.bat', '.cmd', '.sh', '.msi'];

export const Guardian = {
    /**
     * Malware Predator: Scans messages for suspicious files
     */
    async scanMessage(ctx: Context) {
        if (!ctx.chat || ctx.chat.type === 'private') return;

        // 1. Check if Guardian is enabled for this group
        const settings = await db.query('SELECT guardian_enabled FROM group_settings WHERE group_id = $1', [ctx.chat.id]);
        if (!settings.rows[0]?.guardian_enabled) return;

        // 2. Scan for Document Extensions
        const doc = ctx.message?.document;
        if (doc && doc.file_name) {
            const ext = doc.file_name.toLowerCase().slice(doc.file_name.lastIndexOf('.'));

            if (BLACKLIST_EXTENSIONS.includes(ext)) {
                try {
                    // 🚨 ACTION: DELETE THREAT
                    await ctx.deleteMessage();

                    // 📢 ACTION: WARNING
                    const warning = `⚠️ **安全警示 (Security Alert)**\n\n` +
                        `👤 用户 (User): @${ctx.from?.username || ctx.from?.first_name || 'Unknown'}\n` +
                        `🚫 **自动拦截 (Auto-Blocked):** 系统检测到可疑文件类型 (\`${ext}\`)。\n` +
                        `为了所有成员的资产安全，该文件已从群组中永久删除。\n\n` +
                        `*(Unauthorized file detected and purged for group security.)*`;

                    await ctx.reply(warning, { parse_mode: 'Markdown' });

                    // 🔔 ACTION: ALERT ADMINS
                    await this.alertAdmins(ctx, `探测到潜在恶意软件攻击 (Potential Malware Detected: ${doc.file_name})`);

                } catch (e) {
                    console.error('[Guardian] Failed to delete malicious file:', e);
                }
            }
        }
    },

    /**
     * Admin Sentinel: Notify admins of new arrivals
     */
    async handleNewMember(ctx: Context) {
        if (!ctx.chat || ctx.chat.type === 'private') return;

        const settings = await db.query('SELECT guardian_enabled, language_mode FROM group_settings WHERE group_id = $1', [ctx.chat.id]);
        if (!settings.rows[0]?.guardian_enabled) return;

        const lang = settings.rows[0]?.language_mode || 'CN';
        const newMembers = ctx.message?.new_chat_members || [];

        for (const member of newMembers) {
            if (member.is_bot) continue;

            const name = member.username ? `@${member.username}` : (member.first_name || 'New Member');

            // 1. Tag Admins
            const admins = await db.query('SELECT username FROM group_admins WHERE group_id = $1', [ctx.chat.id]);
            const adminTags = admins.rows.map(a => `@${a.username}`).join(' ');

            const alertMsg = adminTags ? `🔔 ${adminTags} - **新成员加入 (New Member Arrival)**` : '';

            // 2. Vibrant Welcome
            const slogans = {
                CN: [
                    "✨ 欢迎加入！祝您在这里生意兴隆，财源广进！",
                    "🌟 欢迎新朋友！Lily 将全程为您保障账目安全。",
                    "✨ 每一份信任都值得被温柔对待，欢迎您的到来！"
                ],
                EN: [
                    "✨ Welcome! Wishing you prosperous business and great wealth!",
                    "🌟 Welcome abroad! Lily is here to secure your financial records.",
                    "✨ Every partnership begins with trust, welcome to the group!"
                ],
                MY: [
                    "✨ Selamat datang! Semoga perniagaan anda bertambah maju dan murah rezeki.",
                    "🌟 Selamat datang! Lily di sini untuk menjaga keselamatan rekod anda.",
                    "✨ Setiap kepercayaan amat dihargai, selamat datang ke kumpulan kami!"
                ]
            };

            const list = slogans[lang as keyof typeof slogans] || slogans.CN;
            const welcome = list[Math.floor(Math.random() * list.length)];

            await ctx.reply(`${alertMsg}\n\n👤 **${name}**\n${welcome}`, { parse_mode: 'Markdown' });
        }
    },

    /**
     * Helper: Tag all registered group admins
     */
    async alertAdmins(ctx: Context, reason: string) {
        const admins = await db.query('SELECT username FROM group_admins WHERE group_id = $1', [ctx.chat?.id]);
        if (admins.rows.length === 0) return;

        const tags = admins.rows.map(a => `@${a.username}`).join(' ');
        await ctx.reply(`🔔 **Admin Notification**\n${tags}\n\nReason: ${reason}`, { parse_mode: 'Markdown' });
    }
};
