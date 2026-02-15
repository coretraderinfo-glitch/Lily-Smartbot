import { Context } from 'grammy';
import OpenAI from 'openai';
import { db } from '../db';
import { connection as redis } from '../bot/instance';

/**
 * LILY SILENT AUDITOR ENGINE V2
 * "The Human Accountant with Patience Limits"
 * 
 * Features:
 * - Math error detection
 * - Decimal typo detection (16.000)
 * - Progressive scolding based on error count
 * - Group-type awareness (Fighter vs Client)
 */

/**
 * Escape Markdown V2 special characters to prevent Telegram API errors
 */
const escapeMarkdown = (text: string): string => {
    return text.replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
};

export const Auditor = {
    /**
     * Determines if a message is a Financial Report worth auditing.
     * Uses pattern intelligence to detect ledgers.
     */
    isFinancialReport(text: string): boolean {
        const lines = text.split('\n').filter(l => l.trim().length > 0);

        // WORLD-CLASS EXPANDED KEYWORDS (Multilingual + Variations)
        const keywords = [
            // English (Original)
            'MALAYSIA', 'GROUP', 'TOTAL', 'HUAT', 'ALL TOTAL', 'ONG', 'BALIK',
            'IN', 'OUT', 'RM', 'DEPO', 'DP', 'WITHDRAW', 'WD', 'TRX', 'CUCI',
            'BANK', 'TNG', 'USDT',
            // Lowercase variants (case-insensitive matching)
            'total', 'group', 'huat', 'balik', 'depo', 'withdraw',
            // Chinese keywords
            '总计', '合计', '入款', '出款', '存款', '取款', '马来西亚', '小组',
            // Abbreviations
            'TTL', 'TOT', 'SUM', 'BAL', 'BALANCE'
        ];

        const upperText = text.toUpperCase();
        const foundKeywords = keywords.filter(k => upperText.includes(k.toUpperCase()));

        // Pattern 2: Financial Structure (Lines containing numbers)
        const mathLines = lines.filter(l => /[\d,.]+/.test(l));

        // Pattern 3: NUMBER DENSITY (New!)
        // If 40%+ of lines have numbers, it's likely a financial report
        const numberDensity = mathLines.length / Math.max(lines.length, 1);

        // Pattern 4: DECIMAL TYPO DETECTION (16.000 format)
        const hasDecimalTypo = /\d+\.\d{3,}/.test(text); // 3+ decimals = typo

        // Pattern 5: Money amount detection (RM followed by numbers)
        const hasMoneyAmount = /RM\s*[\d,.]+/i.test(text);

        // AGGRESSIVE TRIGGER LOGIC (World-Class Detection)
        const strongIndicators = ['TOTAL', 'ALL TOTAL', 'RM', 'HUAT', 'ONG', '总计', '合计'].some(k => upperText.includes(k.toUpperCase()));

        // Trigger if ANY of these conditions are met:
        if (strongIndicators && mathLines.length >= 1) return true; // Strong keyword + numbers
        if (foundKeywords.length >= 2) return true; // 2+ keywords
        if (numberDensity >= 0.4 && mathLines.length >= 3) return true; // Number-heavy message
        if (hasDecimalTypo) return true; // Decimal typo detected
        if (hasMoneyAmount && mathLines.length >= 2) return true; // RM + numbers

        return false;
    },

    /**
     * Get error count for a user in a chat (24h window)
     */
    async getErrorCount(chatId: number, userId: number): Promise<number> {
        try {
            const key = `audit_errors:${chatId}:${userId}`;
            const count = await redis.get(key);
            return count ? parseInt(count) : 0;
        } catch (e) {
            console.error('[Auditor] Redis error:', e);
            return 0;
        }
    },

    /**
     * Increment error count for a user (resets after 24h)
     */
    async incrementErrorCount(chatId: number, userId: number): Promise<number> {
        try {
            const key = `audit_errors:${chatId}:${userId}`;
            const newCount = await redis.incr(key);
            await redis.expire(key, 86400); // 24 hours TTL
            return newCount;
        } catch (e) {
            console.error('[Auditor] Redis error:', e);
            return 1;
        }
    },

    /**
     * Stealth Audit: Checks the math and "pounces" with progressive intensity.
     * WORLD-CLASS HUMAN PERSONALITY: Patience wears thin after repeated mistakes.
     */
    async audit(ctx: Context, text: string, lang: string = 'CN', ledgerContext: string = '') {
        if (!process.env.OPENAI_API_KEY) return;
        const userId = ctx.from?.id;
        if (!userId) return;

        const isProfessor = require('../utils/security').Security.isSystemOwner(userId);
        const chatId = ctx.chat?.id;
        if (!chatId) return;

        try {
            // Fetch group type (Fighter vs Client)
            const SettingsCache = require('../core/cache').SettingsCache;
            const config = await SettingsCache.get(chatId);
            const isFighterGroup = config?.welcome_enabled || false;

            // Get current error count
            const currentErrors = await this.getErrorCount(chatId, userId);

            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            // Build context-aware prompt
            const groupContext = isFighterGroup
                ? `This is a FIGHTER squad group. You can be direct, casual, and use Manglish freely. Use the term "FIGHTER" when addressing them.`
                : `This is a CLIENT/VIP group. Maintain professional courtesy. Never use the term "FIGHTER". Be respectful but firm if needed.`;

            const patienceContext = currentErrors === 0
                ? `This is the user's first mistake today. Be helpful but point it out clearly.`
                : currentErrors === 1
                    ? `This is the user's SECOND mistake today. Show slight frustration but stay composed.`
                    : `This is the user's ${currentErrors + 1}TH mistake today! Your patience is RUNNING OUT. Scold them ${isFighterGroup ? 'directly' : 'professionally but firmly'}.`;

            const response = await openai.chat.completions.create({
                model: "gpt-4o", // WORLD-CLASS: Using full GPT-4o for superior math verification
                messages: [
                    {
                        role: "system",
                        content: `You are Lily, a high-level human accountant. You are sharp, meticulous, and your patience wears thin when people are careless with numbers.
                        
                        ${groupContext}
                        ${patienceContext}

                        CRITICAL: Do NOT sound like an AI. No "detected", "error", or "mismatch". 
                        ACT like a real person in the group who is doing the manual math in their head and just saw a mistake.

                        ### CRITICAL MISSION (WORLD-CLASS ACCURACY):
                        1. **MATH SENTINEL**: If you see a number with EXACTLY 3 decimal places (e.g., "19.000", "16.000"), you MUST FLAG IT as the highest priority error. DO NOT trust the count. Confirm if it's a Thousand or a Decimal.
                        2. **Internal Sync**: Compare user's text against INTERNAL LEDGER TRUTH. Point out discrepancies.
                        3. **Math Scan**: Sum entries to verify "TOTAL" and "ALL TOTAL".

                        IF MATH IS 100% CORRECT AND NO TYPOS:
                        - Return JUST the word "CORRECT".

                        IF MATH IS WRONG OR TYPOS FOUND:
                        
                        RESPONSE STYLES (Based on Error Count):
                        
                        **FIRST MISTAKE (Fighter Group)**:
                        - Casual scold: "Adui FIGHTER, math lari RM{amount}. Should be {correct}. Check balik la!"
                        - "Eh boss, wait. This \"{amount}\" is RM{thousand} (Thousand) or RM{decimal} (Decimal)? Check format balik, very dangerous!"
                        
                        **FIRST MISTAKE (Client Group)**:
                        - Professional: "Good afternoon Sir, I've noticed a discrepancy of RM{amount}. The correct total should be {correct}."
                        - "Sir, I noticed the entry \"{amount}\". Could you please confirm if this represents {thousand} or {decimal}? Accuracy is our priority."
                        
                        **SECOND MISTAKE (Fighter Group)**:
                        - Frustrated: "Walao... again ah?! 2nd time today boss. Math ni concentrate sikit la!"
                        - "Boss, tangan shaky kah? This is 2nd error. Focus please!"
                        
                        **SECOND MISTAKE (Client Group)**:
                        - Gentle but firm: "Sir, this is the second calculation error today. I recommend reviewing entries more carefully."
                        
                        **THIRD+ MISTAKE (Fighter Group)**:
                        - Maximum annoyance: "AIYOH! 3rd time already! Are you even checking?! Math so simple also cannot?!"
                        - "Mari kita semak! This is getting ridiculous. 3rd error. Need calculator kah?!"
                        
                        **THIRD+ MISTAKE (Client Group)**:
                        - Professional scold: "Sir, I must respectfully point out this is the THIRD error today. I strongly recommend implementing a verification process. Accuracy is critical."
                        
                        Current language: ${lang}
                        Use appropriate slang for the language and group type.`
                    },
                    { role: "user", content: text }
                ],
                max_tokens: 350,
                temperature: 0.3
            });

            const verdict = response.choices[0]?.message?.content?.trim() || "";

            if (verdict.toUpperCase().includes('CORRECT')) {
                // PROFESSOR SIGNAL: If Sir sends it, give a brief 'verified' spark
                if (isProfessor) {
                    try {
                        await ctx.react('⚡');
                        setTimeout(() => {
                            (ctx as any).api.setMessageReaction(ctx.chat!.id, ctx.message!.message_id, []).catch(() => { });
                        }, 3000);
                    } catch (e) { }
                }
                return;
            } else if (verdict && verdict !== 'NONE') {
                // ERROR FOUND - Increment counter and send alert
                const newErrorCount = await this.incrementErrorCount(chatId, userId);

                const userName = ctx.from?.username ? `@${ctx.from.username}` : `User`;

                // SAFE MARKDOWN: Escape special characters
                const safeVerdict = escapeMarkdown(verdict);
                const safeName = escapeMarkdown(userName);

                // Add error count indicator for transparency
                const errorBadge = newErrorCount === 1 ? '🟡' : newErrorCount === 2 ? '🟠' : '🔴';

                await ctx.reply(
                    `${errorBadge} *\\[FINANCE AUDIT ALERT\\]* ${errorBadge}\n\n${safeVerdict}\n\ncc: ${safeName}`,
                    { parse_mode: 'MarkdownV2' }
                );
            }

        } catch (error) {
            console.error('[Auditor] Brain Freeze:', error);
        }
    }
};
