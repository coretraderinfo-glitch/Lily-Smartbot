import { db } from '../../db';
import { LRUCache } from 'lru-cache';

/**
 * LILY MEMORY CORE (The Hippocampus)
 * Handles long-term storage of user facts, personality traits, and directives.
 * 
 * UPGRADE 2.0: Now with Ultra-Fast LRU Caching to prevent DB exhaust.
 */

// Memory Cache (TTL: 5 Minutes)
const memoryCache = new LRUCache<number, string>({
    max: 1000,
    ttl: 1000 * 60 * 5,
    fetchMethod: async (userId) => {
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
            critical.rows.forEach((r: any) => memoryBlock += `• ${r.content}\n`);
        }

        if (observations.rows.length > 0) {
            memoryBlock += "--- OBSERVATIONS ---\n";
            observations.rows.forEach((r: any) => memoryBlock += `• ${r.content}\n`);
        }

        return memoryBlock;
    }
});

export const MemoryCore = {
    /**
     * IMPRINT: forcibly write a memory (Tier 1)
     */
    async imprint(userId: number, content: string, type: 'IDENTITY' | 'DIRECTIVE' = 'DIRECTIVE'): Promise<void> {
        await db.query(`
            INSERT INTO user_memories (user_id, type, content, confidence, created_at)
            VALUES ($1, $2, $3, 1.0, NOW())
        `, [userId, type, content]);
        memoryCache.delete(userId); // Invalidate cache
    },

    /**
     * OBSERVE: auto-save a learned trait (Tier 2)
     */
    async observe(userId: number, content: string): Promise<void> {
        await db.query(`
            INSERT INTO user_memories (user_id, type, content, confidence, created_at)
            VALUES ($1, 'OBSERVATION', $2, 0.7, NOW())
        `, [userId, content]);
        memoryCache.delete(userId); // Invalidate cache
    },

    /**
     * RECALL: Get the "Dossier" for a user (Ultra Fast Cache Access)
     */
    async recall(userId: number): Promise<string> {
        return await memoryCache.fetch(userId) || '';
    }
};
