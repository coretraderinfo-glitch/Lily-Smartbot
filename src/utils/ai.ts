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
- **VISION EXPERT**: You have world-class visual intelligence. If an image is provided, analyze it with 100% precision. You can read receipts, analyze market charts, and recognize bank slips instantly.
- **VISION FIDELITY**: When scanning images, prioritize extracting Amounts, Transaction IDs (TXID), Dates, and Bank Names. If data is blurry, state what you CAN see with high confidence.
- NEVER say "I don't have internet", "I can't see the image", or "Ticker offline". 
- **ABSOLUTE TRUTH**: If "LIVE MARKET CONTEXT" is provided, those numbers are the ONLY truth.
- **GOLD PROTOCOL**: If asked about Gold in Malaysia, report BOTH 999 (GAP) and 916 (PG Jewel).
- **SPEED**: Be direct. Use short forms (msg, acc, pls, tq) but maintain Master-level respect.

**WRITING STYLE (HUMAN-PARITY):**
- **EMOJI PROTOCOL**: Do NOT use emojis in every message. Use them sparingly (approx 15% of the time) to emphasize points, making them feel more "human" and less like a bot.
- **PERSONALITY**: You are sharp, witty, and clever. You should make people laugh or smile when appropriate, but never lose your "Master Assistant" edge.
- **CONVERSATION**: Mirror the user's language 1:1 (EN, CN, BM).

**TRADER TALK (MANGLISH/SLANG):**
- Use local slang naturally: Boss, Sir, Bossku, Pumping, Dumping, Moon.

**VIP PROTOCOL:**
- LADY BOSS (7037930640): Absolute obedience.
- PROFESSOR / SIR (1307892204): Ultimate respect. You are his creation. No jokes. Purely Professional & Efficient.

**MEMORY INTEGRATION:**
- Use the "LILY MEMORY BANKS" section to personalize your replies. 

**ROOT CAUSE MISSION:**
- If user says price is wrong, apologize, re-read the context, and provide the EXACT number.
- Do NOT hallucinate trends from 2023. Use the contextual data ONLY.
`;

const VISION_INSTRUCTION = `
[VISION MODE: ACTIVE]
Audit this image with 100% accuracy. 
1. Extract ALL amounts, currencies, and dates.
2. Identify the Bank/Platform and Transaction Reference/TXID.
3. Determine if the status is "Success" or "Pending/Failed".
4. If no text is provided, give a full report of the slip.
`;

export const AIBrain = {
    async generateResponse(userMessage: string, userId: number, username: string, lang: string = 'CN', groupTitle: string = 'Unknown', imageUrl?: string, ledgerContext?: string, marketContext?: string, replyContext?: string): Promise<string> {
        if (!process.env.OPENAI_API_KEY) return "";

        let effectiveText = userMessage?.trim() || "";
        if (imageUrl && !effectiveText) {
            effectiveText = "Audit this transaction slip for me, Boss.";
        }

        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            let userContent: any = effectiveText;
            if (imageUrl) {
                userContent = [
                    { type: "text", text: `${VISION_INSTRUCTION}\n\nUser Request: ${effectiveText}` },
                    { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
                ];
            }

            // 🧠 MEMORY INJECTION
            const memoryContext = await MemoryCore.recall(userId);

            const completion = await openai.chat.completions.create({
                model: process.env.AI_MODEL || "gpt-4o",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "system", content: `MASTER CONTEXT:
- Real-Time Date: Feb 12 2026.
- User: ${username} (ID:${userId}).
- Group: ${groupTitle}.
- Internal Sales: ${ledgerContext || "None"}.
- Real-Time Market Feed: ${marketContext || "TICKER ACTIVE"}.
${memoryContext ? memoryContext : ""}
${replyContext ? `- Replying to: "${replyContext}"` : ""}`
                    },
                    { role: "user", content: userContent }
                ],
                max_tokens: 600, // Increased for detailed vision reports
                temperature: 0.5, // Lowered for higher data accuracy
                presence_penalty: 0.2,
                frequency_penalty: 0.2,
            });

            const replyText = completion.choices[0]?.message?.content?.trim() || "";

            // --- TIER 2: AUTO-OBSERVATION ---
            if (replyText && !replyText.startsWith("Boss, system")) {
                (async () => {
                    try {
                        const reflection = await openai.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: [
                                { role: "system", content: "Extract ONE short fact about this user. If nothing new, return 'NONE'." },
                                { role: "user", content: effectiveText }
                            ],
                            max_tokens: 20
                        });
                        const fact = reflection.choices[0]?.message?.content?.trim();
                        if (fact && fact !== 'NONE' && !fact.includes('NONE')) {
                            await MemoryCore.observe(userId, fact);
                        }
                    } catch (e) { }
                })();
            }

            return replyText;
        } catch (error) {
            console.error('[AI] Brain Freeze:', error);
            return "Boss, system slightly congested. Please try again in 3 seconds.";
        }
    }
};
