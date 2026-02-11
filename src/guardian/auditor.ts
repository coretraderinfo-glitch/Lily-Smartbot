import { Context } from 'grammy';
import OpenAI from 'openai';
import { db } from '../db';
import { I18N } from '../utils/i18n';

/**
 * LILY SILENT AUDITOR ENGINE
 * "The Invisible Accountant"
 * Scans financial lists for math errors without being asked.
 */

export const Auditor = {
    /**
     * Determines if a message is a Financial Report worth auditing.
     * Uses pattern intelligence to detect ledgers.
     */
    isFinancialReport(text: string): boolean {
        const lines = text.split('\n').filter(l => l.trim().length > 0);

        // Pattern 1: Keywords
        const keywords = ['MALAYSIA', 'GROUP', 'TOTAL', 'HUAT', 'ALL TOTAL', 'ONG', 'BALIK', 'IN', 'OUT'];
        const foundKeywords = keywords.filter(k => text.toUpperCase().includes(k));

        // Pattern 2: Financial Structure (Lines ending in numbers)
        const mathLines = lines.filter(l => /[\d,.]+$/.test(l.trim()));

        // Decision: Must have keywords AND at least 3 lines that look like entries
        return foundKeywords.length >= 2 && mathLines.length >= 3;
    },

    /**
     * Stealth Audit: Checks the math and "pounces" only if wrong.
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
                        content: `You are Lily's internal auditor. Verify the math in this ledger.
                        
                        TASK:
                        1. Extract all numbers.
                        2. Sum individual entries.
                        3. Compare with "TOTAL" and "ALL TOTAL" lines.
                        
                        OUTPUT:
                        - If 100% correct, return "CORRECT".
                        - If wrong, return a scolding message in ${lang} using FIGHTER slang. Point out the exact math error.
                        
                        PERSONALITY:
                        - Sometime sharp, sometime kidding. 
                        - Slang: "mabuk ah?", "kasi jalan betul-betul", "pening la".
                        - Tell them: "Do it properly next time!"`
                    },
                    { role: "user", content: text }
                ],
                max_tokens: 300,
                temperature: 0.7
            });

            const verdict = response.choices[0]?.message?.content?.trim();

            if (verdict?.toUpperCase().includes('CORRECT')) {
                // PROFESSOR SIGNAL: If Sir sends it, give a brief 'verified' spark
                if (isProfessor) {
                    try {
                        await ctx.react('⚡');
                        // Remove after 3 seconds so it stays "Silent"
                        setTimeout(() => {
                            (ctx as any).api.setMessageReaction(ctx.chat!.id, ctx.message!.message_id, []);
                        }, 3000);
                    } catch (e) { }
                }
                return;
            } else if (verdict && verdict !== 'NONE') {
                const name = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'Fighter');
                await ctx.reply(`⚠️ **[FINANCE AUDIT ALERT]**\n\n${verdict}\n\ncc: ${name}`, { parse_mode: 'Markdown' });
            }

        } catch (error) {
            console.error('[Auditor] Brain Freeze:', error);
        }
    }
};
