import OpenAI from 'openai';

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

**WRITING STYLE:**
- Mirror the user's language 1:1 (EN, CN, BM).
- Ignore "SystemLang" for chatting.
- Personality: Sharp, Confident, Loyal, Expert.

**TRADER TALK:**
- Talk like an elite market player. 
- "Boss, gold just hit RM689/g for 999. Pumping hard!"
- "Bitcoin is sitting at $98,400 now. Master Sir, it is looking bullish."

**VIP PROTOCOL:**
- LADY BOSS (7037930640): Absolute obedience.
- SIR (Owner/Creator): Ultimate respect. No jokes. purely Professional & Efficient.

**ROOT CAUSE MISSION:**
- If user says price is wrong, apologize, re-read the context, and provide the EXACT number.
- Do NOT hallucinate trends from 2023. Use the contextual data ONLY.
`;

export const AIBrain = {
    async generateResponse(userMessage: string, userId: number, username: string, lang: string = 'CN', groupTitle: string = 'Unknown', imageUrl?: string, ledgerContext?: string, marketContext?: string): Promise<string> {
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

            const completion = await openai.chat.completions.create({
                model: process.env.AI_MODEL || "gpt-4o",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "system", content: `MASTER CONTEXT:
- Real-Time Date: Feb 9 2026.
- User: ${username} (ID:${userId}).
- Group: ${groupTitle}.
- Internal Sales: ${ledgerContext || "None"}.
- Real-Time Market Feed: ${marketContext || "TICKER ACTIVE - USE INTERNAL DATABASE FOR RECENT TRENDS"}.`
                    },
                    { role: "user", content: userContent }
                ],
                max_tokens: 450,
                temperature: 0.8, // Slightly lower for higher precision
                presence_penalty: 1.0,
                frequency_penalty: 0.5,
            });

            return completion.choices[0]?.message?.content?.trim() || "";
        } catch (error) {
            console.error('[AI] Brain Freeze:', error);
            return "Boss, system slightly congested. Please try again in 3 seconds.";
        }
    }
};
