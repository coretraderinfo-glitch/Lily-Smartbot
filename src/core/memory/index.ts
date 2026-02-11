import { db } from '../../db';

/**
 * LILY MEMORY CORE (The Hippocampus)
 * Handles long-term storage of user facts, personality traits, and directives.
 * 
 * TIER 1: EXPLICIT DIRECTIVES (The "Professor's Orders")
 * TIER 2: EVOLVING CONTEXT (Auto-Learned Traits)
 */

export interface MemoryFragment {
    id: number;
    user_id: number;
    type: 'IDENTITY' | 'DIRECTIVE' | 'OBSERVATION' | 'PREFERENCE';
    content: string; // The actual memory text
    confidence: number; // 1.0 = Absolute Fact (Direct Command), <1.0 = Observed
    created_at: Date;
    context_group_id?: number; // Optional: Is this memory specific to one group?
}

export const MemoryCore = {
    /**
     * IMPRINT: forcibly write a memory (Tier 1)
     */
    async imprint(userId: number, content: string, type: 'IDENTITY' | 'DIRECTIVE' = 'DIRECTIVE'): Promise<void> {
        await db.query(`
            INSERT INTO user_memories (user_id, type, content, confidence, created_at)
            VALUES ($1, $2, $3, 1.0, NOW())
        `, [userId, type, content]);
    },

    /**
     * OBSERVE: auto-save a learned trait (Tier 2)
     */
    async observe(userId: number, content: string): Promise<void> {
        // Only keep top 10 relevant observations to save space
        await db.query(`
            INSERT INTO user_memories (user_id, type, content, confidence, created_at)
            VALUES ($1, 'OBSERVATION', $2, 0.7, NOW())
        `, [userId, content]);
    },

    /**
     * RECALL: Get the "Dossier" for a user
     */
    async recall(userId: number): Promise<string> {
        // 1. Fetch Tier 1 (Identity/Directives) - Always critical
        const critical = await db.query(`
            SELECT content FROM user_memories 
            WHERE user_id = $1 AND confidence = 1.0
            ORDER BY created_at DESC
        `, [userId]);

        // 2. Fetch Tier 2 (Observations) - Contextual
        const observations = await db.query(`
            SELECT content FROM user_memories 
            WHERE user_id = $1 AND confidence < 1.0
            ORDER BY created_at DESC LIMIT 5
        `, [userId]);

        if (critical.rows.length === 0 && observations.rows.length === 0) return '';

        let memoryBlock = "🧠 [LILY MEMORY BANKS]:\n";

        if (critical.rows.length > 0) {
            memoryBlock += "--- CONFIRMED FACTS ---\n";
            critical.rows.forEach(r => memoryBlock += `• ${r.content}\n`);
        }

        if (observations.rows.length > 0) {
            memoryBlock += "--- OBSERVATIONS ---\n";
            observations.rows.forEach(r => memoryBlock += `• ${r.content}\n`);
        }

        return memoryBlock;
    }
};
