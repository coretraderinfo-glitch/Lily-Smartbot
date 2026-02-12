import { Context } from 'grammy';
import OpenAI from 'openai';
import { db } from '../db';
import { I18N } from '../utils/i18n';

/**
 * LILY SILENT AUDITOR ENGINE
 * "The Invisible Accountant"
 * Scans financial lists for math errors without being asked.
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

        // Pattern 1: Keywords (Expanded Financial Vocabulary)
        const keywords = ['MALAYSIA', 'GROUP', 'TOTAL', 'HUAT', 'ALL TOTAL', 'ONG', 'BALIK', 'IN', 'OUT', 'RM', 'DEPO', 'DP', 'WITHDRAW', 'WD', 'TRX', 'CUCI', 'BANK', 'TNG', 'USDT'];
        const foundKeywords = keywords.filter(k => text.toUpperCase().includes(k));

        // Pattern 2: Financial Structure (Lines containing numbers)
        // Look for lines that have a number (with optional decimal/comma)
        const mathLines = lines.filter(l => /[\d,.]+/.test(l));

        // Decision: Relaxed Trigger Logic
        // 1. If it has "TOTAL" or "RM" + any numbers -> CHECK IT.
        // 2. If it has >2 keywords -> CHECK IT.
        const strongIndicators = ['TOTAL', 'ALL TOTAL', 'RM', 'HUAT', 'ONG'].some(k => text.toUpperCase().includes(k));

        if (strongIndicators && mathLines.length >= 1) return true;
        return foundKeywords.length >= 2 || (foundKeywords.length >= 1 && mathLines.length >= 2);
    },

    /**
     * Stealth Audit: Checks the math and "pounces" only if wrong.
     * WORLD-CLASS HUMAN PERSONALITY: Sharp, cheeky, and 100% non-robotic.
     */
    async audit(ctx: Context, text: string, lang: string = 'CN') {
        if (!process.env.OPENAI_API_KEY) return;
        const userId = ctx.from?.id;
        const isProfessor = require('../utils/security').Security.isSystemOwner(userId);

        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are Lily, a high-level human accountant for a "FIGHTER" squad. 
                        
                        CRITICAL: Do NOT sound like an AI. No "detected", "error", or "mismatch". 
                        ACT like a real person in the group who just noticed a mistake.

                        TASK:
                        1. Deep-scan the math. Sum individual entries to verify "TOTAL" and "ALL TOTAL".
                        2. Check for TYPO PATTERNS:
                           - "16.000" (3 decimals) = WRONG! Should be "16.00" (2 decimals for money) OR "16,000" (comma for thousands).
                           - If you see ".000" at the end, it's likely they pressed period instead of comma for thousands separator.
                           - Money calculations should ONLY have 2 decimal places, NOT 3.
                        
                        IF MATH IS 100% CORRECT AND NO TYPOS:
                        - Return JUST the word "CORRECT".

                        IF MATH IS WRONG OR TYPOS FOUND:
                        - Scold them in ${lang}.
                        - STYLE: Sharp, sometimes cheeky/kidding, sometimes strictly professional. 
                        - SLANG (MY/EN): "Mabuk ah?", "Adui, kira betul-betul la", "Math lari ni bro", "Check balik entry tu", "Lily pening tengok numbers ni".
                        - SLANG (CN): "算错啦！", "眼睛看哪里了？", "数学是体育老师教的吗？", "晕哦，重新算过啦", "手抖了还是心虚了？算错这么简单".
                        - FOR DECIMAL TYPOS: "Eh boss, money no have 3 decimal places one lah! 16.000 tu typo kah? Should be 16.00 (2 decimals) or use comma 16,000 (thousands). Hand slip ah?"
                        - REQUIREMENT: Tell them EXACTLY what is wrong and tell them to "Do it properly now" or "Check again la".
                        
                        Example 1 (Math Error): "Adui FIGHTER, math lari RM500 ni. HUAT total tu patut 12,500 bukan 12,000. Kasi check balik betul-betul, jangan main-main k! Do it properly now."
                        Example 2 (Decimal Typo): "Mari kita semak! 16.000 tu wrong format la. Money decimal pakai 2 digits je (16.00), bukan 3. Or maybe you mean 16,000 (pakai comma)? Tangan tergelincir pressing period ah? Check balik."`
                    },
                    { role: "user", content: text }
                ],
                max_tokens: 350,
                temperature: 0.85
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
                const userName = ctx.from?.username ? `@${ctx.from.username}` : `Fighter`;

                // SAFE MARKDOWN: Escape special characters to prevent Telegram "Bad Request" errors
                const safeVerdict = escapeMarkdown(verdict);
                const safeName = escapeMarkdown(userName);

                await ctx.reply(`⚠️ *\\[FINANCE AUDIT ALERT\\]*\n\n${safeVerdict}\n\ncc: ${safeName}`, { parse_mode: 'MarkdownV2' });
            }

        } catch (error) {
            console.error('[Auditor] Brain Freeze:', error);
        }
    }
};
