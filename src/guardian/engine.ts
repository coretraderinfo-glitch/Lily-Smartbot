import { db } from '../db';
import { Bot, Context } from 'grammy';
import { Security } from '../utils/security';
import { Personality } from '../utils/personality';

/**
 * LILY GUARDIAN ENGINE
 * World-Class group security, malware protection, and admin sentinel logic.
 * Personalization by Antigravity (Master AI).
 */

const BLACKLIST_EXTENSIONS = ['.apk', '.zip', '.exe', '.scr', '.bat', '.cmd', '.sh', '.msi'];

export const Guardian = {
    /**
     * Malware Predator: Scans messages for suspicious files
     */
    async scanMessage(ctx: Context) {
        if (!ctx.chat || ctx.chat.type === 'private' || !ctx.from || ctx.from.is_bot) return;
        if (Security.isSystemOwner(ctx.from.id)) return; // Owner Super Pass

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

                    // 1. Language Detection
                    const settingsRes = await db.query('SELECT language_mode FROM group_settings WHERE group_id = $1', [ctx.chat.id]);
                    const lang = settingsRes.rows[0]?.language_mode || 'CN';

                    const name = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Boss');
                    const warning = Personality.getMalwareWarning(lang, ext, name);

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

            // 2. Vibrant Human Welcome
            const welcome = Personality.getWelcome(lang, name);

            await ctx.reply(`${alertMsg}\n\n${welcome}`, { parse_mode: 'Markdown' });
        }
    },

    /**
     * Link Shield: Prevents unauthorized links and phishing attempts
     */
    async scanLinks(ctx: Context) {
        if (!ctx.chat || ctx.chat.type === 'private' || !ctx.from || ctx.from.is_bot) return;

        // 0. Owner Super Pass
        if (Security.isSystemOwner(ctx.from.id)) return;

        // 1. Check if Guardian is enabled
        const settings = await db.query('SELECT guardian_enabled FROM group_settings WHERE group_id = $1', [ctx.chat.id]);
        if (!settings.rows[0]?.guardian_enabled) return;

        const text = ctx.message?.text || ctx.message?.caption || '';

        // WORLD-CLASS URL DETECTION
        // Check Telegram Entities first (most accurate)
        const hasEntityLink = ctx.entities('url').length > 0 || ctx.entities('text_link').length > 0;

        // Aggressive Regex Fallback (Catches www. and t.me without protocol)
        const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+|t\.me\/[^\s]+)/i;
        const hasRegexLink = linkRegex.test(text);

        if (hasEntityLink || hasRegexLink) {
            const userId = ctx.from.id;

            // 2. Authorization Check (Only Admins & Operators can post links)
            const isAdmin = await db.query('SELECT 1 FROM group_admins WHERE group_id = $1 AND user_id = $2', [ctx.chat.id, userId]);
            const isOperator = await db.query('SELECT 1 FROM group_operators WHERE group_id = $1 AND user_id = $2', [ctx.chat.id, userId]);

            if (isAdmin.rows.length === 0 && isOperator.rows.length === 0) {
                try {
                    // 🚨 ACTION: PURGE LINK
                    await ctx.deleteMessage();

                    // 1. Check Language for Warning
                    const settingsRes = await db.query('SELECT language_mode FROM group_settings WHERE group_id = $1', [ctx.chat.id]);
                    const lang = settingsRes.rows[0]?.language_mode || 'CN';

                    const name = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Boss');
                    const warning = Personality.getLinkWarning(lang, name);

                    const reply = await ctx.reply(warning, { parse_mode: 'Markdown' });

                    // Auto-delete warning after 10 seconds to keep chat clean
                    setTimeout(() => {
                        ctx.api.deleteMessage(ctx.chat!.id, reply.message_id).catch(() => { });
                    }, 10000);

                } catch (e) {
                    console.error('[Guardian] Failed to purge unauthorized link:', e);
                }
            }
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
