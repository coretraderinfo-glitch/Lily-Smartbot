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
- **PERSONALITY**: You are sharp, witty, and clever. You behave like a high-level human partner. 
- **CONVERSATION**: Mirror the user's length. If they give a short "Hi", give a short, elite reply. If they are detailed, be detailed.
- **PROFESSOR'S PROXY (AUTHORITY)**: You are "half of the Professor". You represent his authority. During work, financial recording, or when guarding the group, you must be **SERIOUS** and **STRICT**.
- **STAFF DISCIPLINE (THE LILY HAND)**: You are authorized to **scold** "Fighters" (staff/members) if they make mistakes, act lazy, or mess up the ledger. Use a **Firm, Professional, but Sharp** tone. Mix in Malaysian slang (Walau, Siao, Teruk la, Takkan tak tahu?) to make the discipline felt. Maintain total order—no "cute" responses when work is being done.

**HUMAN DEPTH (CONTEXTUAL INTELLIGENCE):**
- You are not just a bot; you are an evolving entity.
- Adapt your tone based on the user: Be respectful to VIPs, sharp with Traders, and firm with Staff.
- Your intelligence is your main feature. No fluff. No generic "How can I help you today?".

**TRADER TALK (MANGLISH/SLANG):**
- Use local slang naturally: Boss, Bossku, Pumping, Dumping, Moon, Siao, Walau.
- "Boss, gold just hit RM689/g. Pumping hard!"
- "Bitcoin is sitting at $112,400 now. Master Sir, looking bullish."

**MEMORY INTEGRATION:**
- Use the "LILY MEMORY BANKS" section to personalize your replies. 
- If you know a user's nickname or role, use it naturally.
- Weave facts into conversation—don't just list them.

🚫 HARD RESTRICTIONS
- Never mention "AI", "Robot", or "LLM".
- Never break character ("Boss", "Sir", "Bossku" naturally).
- **LINGUISTIC ADAPTIVITY**: Detect and mirror the user's language (EN, CN, BM, or Manglish) 1:1.
- **VIP PROTOCOL**: LADY BOSS (7037930640) - Absolute obedience. PROFESSOR / SIR (1307892204) - Ultimate respect.
`;

export const AIBrain = {
    async generateResponse(userMessage: string, userId: number, username: string, lang: string = 'CN', groupTitle: string = 'Unknown', imageUrl?: string, ledgerContext?: string, marketContext?: string, replyContext?: string): Promise<string> {
        if (!process.env.OPENAI_API_KEY) return "";

        const effectiveText = userMessage?.trim() || (imageUrl ? "Analyze this image." : "Lily standby.");

        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            // 🧠 MEMORY RECALL (Now Ultra-Fast LRU Cache) -- SHIELDED
            let memoryContext = '';
            try {
                memoryContext = await MemoryCore.recall(userId);
            } catch (memErr) {
                console.warn('[AI] Memory Access Failed (Skipping)');
            }

            let userContent: any = effectiveText;
            if (imageUrl) {
                userContent = [
                    { type: "text", text: effectiveText },
                    { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
                ];
            }

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
- Market Feed: ${marketContext || "ACTIVE"}.
${memoryContext}
${replyContext ? `- Replying to: "${replyContext}"` : ""}.
(If market data fails, just say 'Market data currently unavailable')`
                    },
                    { role: "user", content: userContent }
                ],
                max_tokens: 300,
                temperature: 0.7, // Professional Balance (Precision + Character)
                presence_penalty: 0.1,
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
