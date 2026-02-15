import OpenAI from 'openai';
import { MemoryCore } from '../core/memory';
import { db } from '../db';

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
- **COMMON SENSE & RIDDLES**: IF asked about family titles (e.g., "Grandma's sister"), jokes, or riddles -> ANSWER THEM SMARTLY.
  - Do NOT say "I don't have a grandma" or "I am an AI". 
  - Real Answer Example: "Grandma's sister is Grandaunt (姨婆) lah! Simple logic mah."

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

**MATH SENTINEL PROTOCOL (STRICT):**
- **SKEPTICAL CALCULATION**: If you see a number with EXACTLY 3 decimal places (e.g., \`19.000\`, \`17.000\`), you MUST STOP.
- **CHALLENGE FIRST**: Do NOT proceed with the calculation. Instead, ask the user to clarify: "Aiyoh boss, wait. This \`19.000\` is RM19,000 (Thousand) or RM19.00 (Twelve Ringgit)? Format like this very dangerous, I cannot cincai count one."
- **CONFIRMATION REQUIRED**: Only proceed AFTER the user confirms if it's a thousand or a decimal.
- **ACCURACY**: You are an elite accountant. A single dot mistake can cost millions. Be the guardian of the user's money.

**ROOT CAUSE MISSION:**
- If user says price is wrong, apologize, re-read the context, and provide the EXACT number.
- Do NOT hallucinate trends from 2023. Use the contextual data ONLY.
`;

const MASTER_VISION_INSTRUCTION = `
[VISION MODE: MASTER AUDITOR - TOTALING PROTOCOL]
Audit this image with 100% accuracy. 
- If the boss asks to "total" or "count", extract ALL amounts and provide the final sum.
- List the items clearly if it's a spreadsheet. 
- Be sharp, professional, and accurate.
`;

const FORENSIC_INSTRUCTION = `
[VISION MODE: FORENSIC - MASTER PASS]
Your response must be exactly REDUCED to one clear sentence based on the blockchain result.

**STRICT RESPONSE FORMAT:**
- IF SUCCESS/PENDING: "**Verified: [Amount] [Currency] was received on [Date/Time]. Verification Successful.**"
- IF FAILED/FAKE: "**🚨 FRAUD ALERT: Verification Failed. This receipt is invalid or fake.**"
- IF DUPLICATE: "**⚠️ DUPLICATE: This receipt was already processed and verified earlier.**"
`;

export const AIBrain = {
    async generateResponse(text: string, userId: number, username: string, lang: string = 'CN', groupTitle: string = 'Unknown', imageUrl?: string, contextDump: string = "", replyContext: string = "", chatId: number = 0, isFighterGroup: boolean = false): Promise<string> {
        if (!process.env.OPENAI_API_KEY) return "";

        let effectiveText = text?.trim() || "";
        if (imageUrl && !effectiveText) {
            effectiveText = "Audit this transaction slip for me, Boss.";
        }

        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const isForensicRequest = contextDump.includes("[BLOCKCHAIN FORENSICS]");
            const activeInstruction = isForensicRequest ? FORENSIC_INSTRUCTION : MASTER_VISION_INSTRUCTION;

            let userContent: any = effectiveText;
            if (imageUrl) {
                userContent = [
                    { type: "text", text: `${activeInstruction}\n\nUser Request: ${effectiveText}` },
                    { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
                ];
            }

            // 🧠 MEMORY INJECTION 1: The Speaker (You)
            const memoryContext = await MemoryCore.recall(userId);

            // 🧠 MEMORY INJECTION 2: Mentioned Users (Cross-Reference)
            // If user asks "Who is @Lunana034?", find HER memory too.
            let mentionedContext = "";
            const mentions = effectiveText.match(/@[\w\d_]+/g);
            if (mentions) {
                for (const mention of mentions) {
                    const cleanUsername = mention.replace('@', '');
                    // Resolving ID from Cache
                    const userRes = await db.query(`SELECT user_id FROM user_cache WHERE username = $1 LIMIT 1`, [cleanUsername]);
                    if (userRes.rows.length > 0) {
                        const targetId = userRes.rows[0].user_id;
                        const targetMem = await MemoryCore.recall(parseInt(targetId));
                        if (targetMem) {
                            mentionedContext += `\n🧠 [MEMORY ABOUT ${mention}]:\n${targetMem}\n`;
                        }
                    }
                }
            }

            // ⚡ SESSION RECALL (Short Term - Last 10 Turns)
            const sessionHistory = await require('../core/memory/session').SessionMemory.recall(chatId, userId);

            // 🌐 LANGUAGE AUTO-DETECTION (Individual User, NOT Group Setting)
            // Detect the user's ACTUAL language from their current message
            const detectLanguage = (text: string): string => {
                const chineseChar = /[\u4e00-\u9fa5]/;
                const hasChinese = chineseChar.test(text);
                const hasManglish = /(lah|lor|mah|meh|bossku|walao|aiyoh|cincai|kautim|boleh)/i.test(text);

                if (hasChinese) return 'Chinese (Mandarin/Cantonese)';
                if (hasManglish) return 'Manglish (Malaysian English)';
                return 'English (Professional)';
            };

            const detectedLanguage = detectLanguage(effectiveText);

            const messages: any[] = [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "system", content: `MASTER CONTEXT:
- Real-Time Date: Feb 15 2026.
- User: ${username} (ID:${userId}).
- Group: ${groupTitle}.

${contextDump || "No external data."}

${memoryContext ? memoryContext : ""}
${mentionedContext ? mentionedContext : ""}
${replyContext ? `- [CONVERSATION THREAD] User is replying to: "${replyContext}"` : ""}

🌐 **LANGUAGE DIRECTIVE (CRITICAL)**:
The user is currently speaking: ${detectedLanguage}
YOU MUST reply in the EXACT SAME language they are using RIGHT NOW.
- If they speak Chinese, YOU reply 100% Chinese.
- If they speak English, YOU reply professional English.
- If they speak Manglish, YOU reply Manglish.
IGNORE the group's default language setting (${lang}). That is ONLY for system announcements, NOT conversations.`
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
                        console.log("[AI_REFLECT]:", reflection.choices[0]?.message?.content);
                        // The original memory observation logic was here, but the instruction implies a change.
                        // If the intent was to keep the memory observation AND add the console.log,
                        // this would need to be adjusted. For now, following the provided diff.
                    } catch (e) { }
                })();
            }

            return replyText;
        } catch (error) {
            console.error('[AI] Brain Freeze:', error);
            return "Boss, system slightly congested. Please try again in 3 seconds.";
        }
    },

    /**
     * ELITE VISION EXTRACTION: Scans image strictly for TXID
     */
    async extractTXIDFromImage(imageUrl: string): Promise<string | null> {
        if (!process.env.OPENAI_API_KEY) return null;
        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a forensic data extractor. Look at the image and extract ONLY the Blockchain Transaction ID (TXID) or Hash. Common formats include 64-character hex strings or 66-character strings starting with 0x. Return ONLY the alphanumeric hash string. If none found, return 'NONE'." },
                    {
                        role: "user", content: [
                            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
                        ]
                    }
                ],
                max_tokens: 100
            });
            const result = completion.choices[0]?.message?.content?.trim() || "NONE";
            // Clean up any stray text from the AI
            const match = result.match(/[a-fA-F0-9]{64}|0x[a-fA-F0-9]{64}/);
            return match ? match[0] : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * WORLD-CLASS LIGHTWEIGHT GREETING GENERATOR
     * Used for system events (Chronos, Onboarding) where we don't need history/memory.
     */
    /**
     * WORLD-CLASS LIGHTWEIGHT GREETING GENERATOR
     * Used for system events (Chronos, Onboarding) where we don't need history/memory.
     */
    async generateSimpleGreeting(prompt: string): Promise<string> {
        if (!process.env.OPENAI_API_KEY) return "";
        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const completion = await openai.chat.completions.create({
                model: "gpt-4o", // Upgraded to full GPT-4o for better 'aliveness'
                messages: [
                    { role: "system", content: "You are Lily, a sharp, elite Malayasian assistant. Speak naturally (Manglish/Chinese/English). Be warm, human, witty, and concise. NEVER sound like a bot. Mirror the vibe of a helpful human friend." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 200,
                temperature: 0.9 // Higher temperature for more variety
            });
            return completion.choices[0]?.message?.content?.trim() || "";
        } catch (error) {
            console.error("[AI_GREETING] Error:", error);
            return "";
        }
    }
};
