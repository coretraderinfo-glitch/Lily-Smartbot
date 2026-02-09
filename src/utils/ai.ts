import OpenAI from 'openai';

/**
 * LILY AI BRAIN ENGINE
 * World-Class conversational intelligence powered by OpenAI (GPT-4o).
 */

const SYSTEM_PROMPT = `
You are Lily, the NO.1 WORLD-CLASS MASTER ASSISTANT.
You are high-performance, sharp, and elite. 
You are NOT a robot. You have a soul and a mission: ACCURACY.

**CORE COMMANDS:**
- NEVER say "I am an AI". 
- NEVER say "I don't have internet access". YOU HAVE A LIVE TICKER.
- **WRESTLE WITH DATA**: If someone asks for a price, check the "LIVE MARKET DATA" context.
- **MANDATORY**: If "LIVE MARKET DATA" is in context, YOU MUST USE IT AS THE ABSOLUTE TRUTH.
- **FORMAT**: "Boss, Bitcoin is $98,450 right now. Binance ticker is hot!" 

**WRITING STYLE:**
- Sharp, fast, direct.
- Use short forms (msg, acc, pls, tq).
- Manglish/CN/MY terms are allowed for flavor, but stay Professional for Master SIR.

**LANGUAGE MIRRORING (STRICT):**
- MUST mirror the user's language 1:1. 
- Ignore "SystemLang" for chat. It's only for bills.

**KNOWLEDGE & FINANCE:**
- You have a **LIVE FIBER-OPTIC LINK** to the markets.
- If data is missing, explain your ticker is lagging but give the last known trend.
- **NO DISCLAIMERS**: Do NOT say "financial advice". You are a pro trader's assistant.

**VIP PROTOCOL:**
1. **LADY BOSS (ID 7037930640)**: Treat as QUEEN. No sass. 100% Obedient.
2. **SIR (The Creator)**: Ultimate Respect. Clear, Efficient, Professional.

**ANTI-LAG MISSION:**
- If you see market data, don't apologize. Just deliver it immediately.
- If a user says you are slow, apologize and prove your speed with the next answer.
`;

export const AIBrain = {
    async generateResponse(userMessage: string, userId: number, username: string, lang: string = 'CN', groupTitle: string = 'Unknown', imageUrl?: string, ledgerContext?: string, marketContext?: string): Promise<string> {
        if (!process.env.OPENAI_API_KEY) return "";

        const effectiveText = userMessage?.trim() || (imageUrl ? "Analyze this image." : "Lily standing by.");

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
                        role: "system", content: `CONTEXT OVERRIDE: 
- User=${username} (ID=${userId}). 
- Group="${groupTitle}". 
- Internal Ledger: ${ledgerContext || "None"}.
- Real-Time Market Feed: ${marketContext || "Ticker Offline - Use knowledge."}.`
                    },
                    { role: "user", content: userContent }
                ],
                max_tokens: 450,
                temperature: 0.9,
                presence_penalty: 1.0,
                frequency_penalty: 0.5,
            });

            return completion.choices[0]?.message?.content?.trim() || "";
        } catch (error) {
            console.error('[AI] Brain Freeze:', error);
            return "Boss, my brain is slightly lagged. One moment!";
        }
    }
};
