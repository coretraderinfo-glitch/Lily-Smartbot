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
     * Rules: 10+ lines AND contains keywords like MALAYSIA, HUAT, TOTAL.
     */
    isFinancialReport(text: string): boolean {
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        if (lines.length < 10) return false;

        const keywords = ['MALAYSIA', 'GROUP', 'TOTAL', 'HUAT', 'ALL TOTAL', 'ONG'];
        const foundKeywords = keywords.filter(k => text.toUpperCase().includes(k));

        // Target: At least 2 specific keywords to confirm it's a ledger report
        return foundKeywords.length >= 2;
    },

    /**
     * Stealth Audit: Checks the math and "pounces" only if wrong.
     */
    async audit(ctx: Context, text: string, lang: string = 'CN') {
        if (!process.env.OPENAI_API_KEY) return;

        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            // Use AI to extract and verify the math
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini", // Use mini for cost-effective auditing
                messages: [
                    {
                        role: "system",
                        content: `You are Lily's internal auditor. Your job is to verify the math in this financial report. 
                        
                        1. Sum every individual entry per group.
                        2. Verify if the group "TOTAL" is correct.
                        3. Verify if the "ALL TOTAL" is correct.
                        
                        OUTPUT RULES:
                        - If 100% correct, return "CORRECT".
                        - If incorrect, return a sharp, professional yet human-like scolding message in ${lang}.
                        - MODE: Sometime be very sharp/strict, sometime be "kidding" but still point out the error clearly.
                        - SLANG: Use FIGHTER squad slang (e.g., "mabuk ah?", "kasi jalan betul-betul", "Lily pening la").
                        - REQUIREMENT: Tell them EXACTLY what is wrong and tell them to "Do it properly next time".
                        
                        Example (Kidding): "Adui FIGHTER, kira RM200 pun boleh salah ke? Mabuk ah? Total HUAT tu patut 128,050. Kasi jalan betul-betul k! Lily pening la."`
                    },
                    { role: "user", content: text }
                ],
                max_tokens: 250,
                temperature: 0.8 // Increased temperature slightly for variety in scolding
            });

            const verdict = response.choices[0]?.message?.content?.trim();

            if (verdict === 'CORRECT' || verdict?.includes('CORRECT')) {
                // TOTAL SILENCE ON SUCCESS: Lily is the Invisible Accountant.
                return;
            } else if (verdict && verdict !== 'NONE') {
                // THE POUNCE: Scold the fighter
                const name = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'Fighter');
                await ctx.reply(`⚠️ **[FINANCE AUDIT ALERT]**\n\n${verdict}\n\ncc: ${name}`, { parse_mode: 'Markdown' });
            }

        } catch (error) {
            console.error('[Auditor] Brain Freeze:', error);
        }
    }
};
