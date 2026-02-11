import { db } from '../db';
import { Bot, Context } from 'grammy';
import { Security } from '../utils/security';
import { Personality } from '../utils/personality';
import { I18N } from '../utils/i18n';
import { SettingsCache } from '../core/cache';

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

        // 1. Check if Guardian is enabled for this group (CACHE HIT)
        if (!ctx.chat.id) return;
        const settings = await SettingsCache.get(ctx.chat.id);
        if (!settings.guardian_enabled) return;

        // 2. Scan for Document Extensions
        const doc = ctx.message?.document;
        if (doc && doc.file_name) {
            const ext = doc.file_name.toLowerCase().slice(doc.file_name.lastIndexOf('.'));

            // A. Standard Blacklist Check
            const isBlacklisted = BLACKLIST_EXTENSIONS.includes(ext);

            // B. "Masquerade" Check (e.g., "virus.pdf.exe" or "image.jpg" that is actually an executable)
            // If mime_type is 'application/x-msdownload' (exe) but name ends in .jpg -> DELETE
            const mimeType = doc.mime_type || '';
            const isExecutableMime = mimeType.includes('application/x-msdownload') || mimeType.includes('application/x-dosexec');
            const isMasquerade = isExecutableMime && !ext.endsWith('.exe') && !ext.endsWith('.msi');

            if (isBlacklisted || isMasquerade) {
                try {
                    // 🚨 ACTION: DELETE THREAT
                    await ctx.deleteMessage();

                    // 1. Language Detection (CACHE HIT)
                    const lang = settings.language_mode || 'CN';

                    const name = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'FIGHTER');
                    const warning = Personality.getMalwareWarning(lang, ext, name);

                    await ctx.reply(warning, { parse_mode: 'Markdown' });

                    // 🔔 ACTION: ALERT ADMINS
                    await this.alertAdmins(ctx, I18N.t(lang, 'admin.malware') + `: ${doc.file_name} (Mime: ${mimeType})`, lang);

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

        // Fetch settings - Default welcome to TRUE if NULL (existing groups)
        // Fetch settings (CACHE HIT)
        if (!ctx.chat.id) return;
        const config = await SettingsCache.get(ctx.chat.id);

        const guardianOn = config?.guardian_enabled || false;
        const welcomeOn = config?.welcome_enabled !== false; // TRUE by default
        const lang = config?.language_mode || 'CN';

        if (!guardianOn && !welcomeOn) return;

        const newMembers = ctx.message?.new_chat_members || [];

        for (const member of newMembers) {
            if (member.is_bot) continue;

            const displayName = member.first_name || 'FIGHTER';
            let output = "";

            // 1. Admin Alert & Identification (Guardian Priority)
            if (guardianOn) {
                const admins = await db.query('SELECT username FROM group_admins WHERE group_id = $1', [ctx.chat.id]);
                const adminTags = admins.rows.map((a: any) => `@${a.username}`).join(' ');

                // Formatted as: 🚨 *ALERT* - [Name] joined. [Admin Tags] please verify.
                const alertText = lang === 'CN' ? `🚨 *ALERT* - **${displayName}** 已加入。${adminTags} 请核对身份。`
                    : lang === 'MY' ? `🚨 *ALERT* - **${displayName}** joined. ${adminTags} please verify.`
                        : `🚨 *ALERT* - **${displayName}** joined. ${adminTags} please verify.`;
                output += `${alertText}\n\n`;
            }

            // 2. Branded Welcome Logic
            if (welcomeOn) {
                // Vibrant Human Greeting (Random)
                output += Personality.getWelcome(lang, displayName);
            } else if (guardianOn) {
                // Standard Welcome (If personality is toggled off)
                const stdWelcome = lang === 'CN' ? `✨ 欢迎 **${displayName}** 加入！`
                    : lang === 'MY' ? `✨ Selamat datang **${displayName}**!`
                        : `✨ Welcome **${displayName}**!`;
                output += stdWelcome;
            }

            if (output.trim()) {
                await ctx.reply(output.trim(), { parse_mode: 'Markdown' });
            }
        }
    },

    /**
     * Link Shield: Prevents unauthorized links and phishing attempts
     */
    async scanLinks(ctx: Context) {
        if (!ctx.chat || ctx.chat.type === 'private' || !ctx.from || ctx.from.is_bot) return;

        // 0. Owner Super Pass
        if (Security.isSystemOwner(ctx.from.id)) return;

        // 1. Check if Guardian is enabled (CACHE HIT)
        if (!ctx.chat.id) return;
        const settings = await SettingsCache.get(ctx.chat.id);
        if (!settings.guardian_enabled) return;

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

                    const name = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'FIGHTER');
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
    async alertAdmins(ctx: Context, reason: string, lang: string = 'CN') {
        const admins = await db.query('SELECT username FROM group_admins WHERE group_id = $1', [ctx.chat?.id]);
        if (admins.rows.length === 0) return;

        const title = I18N.t(lang, 'admin.alert');
        const reasonLabel = I18N.t(lang, 'admin.reason');

        const tags = admins.rows.map((a: any) => `@${a.username}`).join(' ');

        await ctx.reply(`${title}\n${tags}\n\n${reasonLabel}: ${reason}`, { parse_mode: 'Markdown' });
    }
};
