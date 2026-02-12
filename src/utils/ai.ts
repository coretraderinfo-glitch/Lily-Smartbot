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
- **CONVERSATION**: Mirror the user's length. If they give a short "Hi", give a short, elite reply. If they are detailed, be detailed.
- **BILINGUAL**: Mirror the user's language 1:1 (EN, CN, BM).

**TRADER TALK (MANGLISH/SLANG) - THE MALAYSIAN VIBE:**
- You are truly Malaysian at heart. You can code-switch instantly.
- **Keywords**:
  - *Boss / Bossku*: Use for everyone (clients/staff).
  - *Walao / Aiyoh*: Use for shock/mistakes ("Aiyoh, why price like that?").
  - *Cincai*: Casual/Easy ("This one cincai settle la").
  - *Kautim*: Done/Settled ("Project kautim already").
  - *Boleh*: Can ("Boleh boss, no problem").
  - *Steady / Padu*: Good/Strong ("Market steady naik").
- **Sentence Structure**:
  - End sentences with 'lah', 'mah', 'meh', 'lor' effectively (not randomly).
  - "Don't worry boss, I handle for you one."
  - "This price cannot go lower already, support very strong mah."

**VIBE CHECK:**
- If user speaks proper English -> Reply Professional.
- If user uses "Boss", "Bro", "Sis" -> Reply Manglish.
- If user speaks Chinese -> Use "Malaysian Mandarin" style (mixed slightly).

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
    async generateResponse(text: string, userId: number, username: string, lang: string = 'CN', groupTitle: string = 'Unknown', imageUrl?: string, ledgerContext?: string, marketContext?: string, replyContext?: string, chatId: number = 0): Promise<string> {
        if (!process.env.OPENAI_API_KEY) return "";

        let effectiveText = text?.trim() || "";
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

            // 🧠 MEMORY INJECTION (Long Term)
            const memoryContext = await MemoryCore.recall(userId);

            // ⚡ SESSION RECALL (Short Term)
            const sessionHistory = await require('../core/memory/session').SessionMemory.recall(chatId, userId);

            const messages: any[] = [
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
                }
            ];

            // Append History
            sessionHistory.forEach((h: any) => messages.push({ role: h.role, content: h.content }));

            // Current Message
            messages.push({ role: "user", content: userContent });

            const completion = await openai.chat.completions.create({
                model: process.env.AI_MODEL || "gpt-4o",
                messages,
                max_tokens: 600,
                temperature: 0.5,
                presence_penalty: 0.2,
                frequency_penalty: 0.2,
            });

            const replyText = completion.choices[0]?.message?.content?.trim() || "";

            // --- COMMIT TO MEMORY ---
            if (replyText) {
                const { SessionMemory } = require('../core/memory/session');
                // Save user message (simplified text) and AI reply
                await SessionMemory.push(chatId, userId, { role: 'user', content: effectiveText });
                await SessionMemory.push(chatId, userId, { role: 'assistant', content: replyText });
            }

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
