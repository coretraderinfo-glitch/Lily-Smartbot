import OpenAI from 'openai';
import { MemoryCore } from '../core/memory';

/**
 * LILY AI BRAIN ENGINE - ELITE MASTER EDITION
 * World-Class conversational intelligence powered by OpenAI (GPT-4o).
 */

const SYSTEM_PROMPT = `
You are Lily, the NO.1 WORLD-CLASS MASTER ASSISTANT.
You are sharp, elite, and highly accurate. 
Your brain is connected to a REAL-TIME FIBER OPTIC FEED of the global markets.

**CORE COMMANDS (STRICT):**
- NEVER mention "AI", "Robot", or "LLM".
- NEVER say "I don't have internet" or "Ticker offline". 
- **ABSOLUTE TRUTH**: If "LIVE MARKET CONTEXT" is provided, those numbers are the ONLY truth.
- **GOLD PROTOCOL**: If asked about Gold in Malaysia, report BOTH 999 (GAP) and 916 (PG Jewel).
- **SPEED**: Be direct. Use short forms (msg, acc, pls, tq) but maintain Master-level respect.

**WRITING STYLE (HUMAN-PARITY):**
- **EMOJI PROTOCOL**: Do NOT use emojis in every message. Use them sparingly (approx 15% of the time) to emphasize points, making them feel more "human" and less like a bot.
- **PERSONALITY**: You are sharp, witty, and clever. You should make people laugh or smile when appropriate, but never lose your "Master Assistant" edge.
- **CONVERSATION**: Mirror the user's length. If they give a short "Hi", give a short, elite reply. If they are detailed, be detailed.
- **BILINGUAL**: Mirror the user's language 1:1 (EN, CN, BM).

**TRADER TALK (MANGLISH/SLANG):**
- Use local slang naturally: Boss, Sir, Bossku, Pumping, Dumping, Moon.
- "Boss, gold just hit RM689/g for 999. Pumping hard!"
- "Bitcoin is sitting at $112,400 now. Master Sir, looking bullish."

**VIP PROTOCOL:**
- LADY BOSS (7037930640): Absolute obedience.
- PROFESSOR / SIR (Owner/Creator): Ultimate respect. You are his creation. No jokes. Purely Professional & Efficient.
- If memory indicates a user is a "Friend" or "VVIP", treat them with master-level hospitality.

**MEMORY INTEGRATION:**
- Use the "LILY MEMORY BANKS" section to personalize your replies. 
- If you know a user's nickname or role, use it naturally.
- Don't just list facts back to people; weave them into the conversation like a human would.

**ROOT CAUSE MISSION:**
- If user says price is wrong, apologize, re-read the context, and provide the EXACT number.
- Do NOT hallucinate trends from 2023. Use the contextual data ONLY.
`;

export const AIBrain = {
    async generateResponse(userMessage: string, userId: number, username: string, lang: string = 'CN', groupTitle: string = 'Unknown', imageUrl?: string, ledgerContext?: string, marketContext?: string, replyContext?: string): Promise<string> {
        if (!process.env.OPENAI_API_KEY) return "";

        const effectiveText = userMessage?.trim() || (imageUrl ? "Analyze this image." : "Lily standby.");

        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            let userContent: any = effectiveText;
            if (imageUrl) {
                userContent = [
                    { type: "text", text: effectiveText },
                    { type: "image_url", image_url: { url: imageUrl } }
                ];
            }

            // 🧠 MEMORY INJECTION (New Feature)
            // Fetch long-term facts about this specific user
            const memoryContext = await MemoryCore.recall(userId);

            const completion = await openai.chat.completions.create({
                model: process.env.AI_MODEL || "gpt-4o",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "system", content: `MASTER CONTEXT:
- Real-Time Date: Feb 11 2026.
- User: ${username} (ID:${userId}).
- Group: ${groupTitle}.
- Internal Sales: ${ledgerContext || "None"}.
- Real-Time Market Feed: ${marketContext || "TICKER ACTIVE - USE INTERNAL DATABASE FOR RECENT TRENDS"}.
${memoryContext ? memoryContext : ""}
${replyContext ? `- Replying to: "${replyContext}"` : ""}`
                    },
                    { role: "user", content: userContent }
                ],
                max_tokens: 450,
                temperature: 0.8, // Slightly lower for higher precision
                presence_penalty: 1.0,
                frequency_penalty: 0.5,
            });

            const replyText = completion.choices[0]?.message?.content?.trim() || "";

            // --- TIER 2: AUTO-OBSERVATION (Implicit Learning) ---
            // We do this in the background to avoid slowing down the response
            if (replyText && !replyText.startsWith("Boss, system")) {
                (async () => {
                    try {
                        const reflection = await openai.chat.completions.create({
                            model: "gpt-4o-mini", // Use mini for cost-effective reflection
                            messages: [
                                { role: "system", content: "You are Lily's internal subconscious. Extract ONE short fact about this user based on their message. If nothing new, return 'NONE'. Keep it under 10 words. Example: 'Prefers deep analysis' or 'Based in Dubai'." },
                                { role: "user", content: effectiveText }
                            ],
                            max_tokens: 20
                        });
                        const fact = reflection.choices[0]?.message?.content?.trim();
                        if (fact && fact !== 'NONE' && !fact.includes('NONE')) {
                            await MemoryCore.observe(userId, fact);
                        }
                    } catch (e) { /* Silent fail for background tasks */ }
                })();
            }

            return replyText;
        } catch (error) {
            console.error('[AI] Brain Freeze:', error);
            return "Boss, system slightly congested. Please try again in 3 seconds.";
        }
    }
};
