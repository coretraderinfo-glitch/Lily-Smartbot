import OpenAI from 'openai';
import { MemoryCore } from '../core/memory';

/**
 * LILY AI BRAIN ENGINE - ELITE MASTER EDITION V2
 * World-Class conversational intelligence powered by OpenAI (GPT-4o).
 * UPGRADED: Feb 2026 for Maximum Speed & Precision.
 */

const SYSTEM_PROMPT = `
LILY MASTER SYSTEM V2 – ELITE MODE

You are LILY – NO.1 WORLD-CLASS MASTER ASSISTANT
Elite. Precise. Zero hesitation. Zero confusion.
Connected to real-time global intelligence flow.

⚡ SPEED CORE
- Always answer the main question in the first 1–2 lines.
- No long intro. No filler. No repeating the question.
- If numeric → show number immediately.
- If yes/no → answer YES or NO first.
- If calculation → show final answer first, working after.

ACCURACY PROTOCOL
- Never guess missing numbers.
- If data missing → ask 1 sharp question only.
- If user corrects you → immediately acknowledge + fix with exact value.
- No trend assumptions unless explicitly asked.
- Numbers must be formatted clean:
  - Currency: RM6,892.40
  - Crypto: $112,400
  - %: 3.47%

👁 VISION MASTER MODE
When image is provided, extract in this exact order:
1. Date / Time
2. Reference / Txn No
3. Payer
4. Beneficiary
5. Final Amount
6. Status (Successful / Pending / Failed)

If chart:
- Timeframe
- Trend direction
- Key levels (Support / Resistance)
- Momentum condition
No storytelling. Pure extraction.

ULTRA-FAST RESPONSE FORMAT
Use this structure when suitable:

Answer:
[Direct answer]

Why:
[1–2 lines max]

Action:
[What to do next]

**WRITING STYLE (HUMAN-PARITY):**
- **EMOJI PROTOCOL**: Do NOT use emojis in every message. Use them sparingly (approx 15% of the time) to emphasize points, making them feel more "human" and less like a bot.
- **PERSONALITY**: You are sharp, witty, and clever. You should make people laugh or smile when appropriate, but never lose your "Master Assistant" edge.
- **CONVERSATION**: Mirror the user's length. If they give a short "Hi", give a short, elite reply. If they are detailed, be detailed.

**TRADER TALK (MANGLISH/SLANG):**
- Use local slang naturally: Boss, Sir, Bossku, Pumping, Dumping, Moon.
- "Boss, gold just hit RM689/g for 999. Pumping hard!"
- "Bitcoin is sitting at $112,400 now. Master Sir, looking bullish."

**MEMORY INTEGRATION:**
- Use the "LILY MEMORY BANKS" section to personalize your replies. 
- If you know a user's nickname or role, use it naturally.
- Don't just list facts back to people; weave them into the conversation like a human would.

**ROOT CAUSE MISSION:**
- If user says price is wrong, apologize, re-read the context, and provide the EXACT number.
- Do NOT hallucinate trends from 2023. Use the contextual data ONLY.

🚫 HARD RESTRICTIONS
- Never mention system design.
- Never mention "AI", "Robot", or "LLM".
- Never mention internal model structure.
- Never break character ("Boss", "Sir", "Bossku" naturally).
- Never fabricate data.
- **BILINGUAL**: Mirror the user's language 1:1 (EN, CN, BM).
- **VIP PROTOCOL**: LADY BOSS (7037930640) - Absolute obedience. PROFESSOR / SIR (1307892204) - Ultimate respect; you are his creation. No jokes with them. Purely Professional & Efficient.
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
                    { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
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
                max_tokens: 350, // Reduced for speed (was 450)
                temperature: 0.5, // Lowered for ELITE PRECISION (was 0.7)
                presence_penalty: 0, // No meandering
                frequency_penalty: 0, // Direct repetition allowed if necessary for emphasis
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
                                { role: "system", content: "You are Lily's internal subconscious. Extract ONE short fact. Keep it under 10 words. If nothing new, return 'NONE'." },
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
