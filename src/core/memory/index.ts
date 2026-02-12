import { db } from '../../db';
import { LRUCache } from 'lru-cache';

/**
 * LILY MEMORY CORE V3 (The Hippocampus + Manual Override)
 * Handles long-term storage of user facts, personality traits, and directives.
 * 
 * NEW: Manual memory imprint for VIP recognition
 */

// Memory Cache (TTL: 5 Minutes)
const memoryCache = new LRUCache<number, string>({
    max: 1000,
    ttl: 1000 * 60 * 5,
    fetchMethod: async (userId) => {
        try {
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
        } catch (error) {
            console.error('[MemoryCore] Recall error:', error);
            return '';
        }
    }
});

export const MemoryCore = {
    /**
     * IMPRINT: Forcibly write a memory (Tier 1)
     * Used for manual overrides and critical VIP recognition
     */
    async imprint(userId: number, content: string, type: 'IDENTITY' | 'DIRECTIVE' = 'DIRECTIVE'): Promise<void> {
        try {
            await db.query(`
                INSERT INTO user_memories (user_id, type, content, confidence, created_at)
                VALUES ($1, $2, $3, 1.0, NOW())
            `, [userId, type, content]);
            memoryCache.delete(userId); // Invalidate cache
            console.log(`[MemoryCore] Imprinted: User ${userId} -> ${content}`);
        } catch (error) {
            console.error('[MemoryCore] Imprint error:', error);
            throw error;
        }
    },

    /**
     * OBSERVE: Auto-save a learned trait (Tier 2)
     */
    async observe(userId: number, content: string): Promise<void> {
        try {
            await db.query(`
                INSERT INTO user_memories (user_id, type, content, confidence, created_at)
                VALUES ($1, 'OBSERVATION', $2, 0.7, NOW())
            `, [userId, content]);
            memoryCache.delete(userId); // Invalidate cache
        } catch (error) {
            console.error('[MemoryCore] Observe error:', error);
        }
    },

    /**
     * RECALL: Get the "Dossier" for a user (Ultra Fast Cache Access)
     */
    async recall(userId: number): Promise<string> {
        try {
            return await memoryCache.fetch(userId) || '';
        } catch (error) {
            console.error('[MemoryCore] Recall fetch error:', error);
            return '';
        }
    },

    /**
     * DIAGNOSTIC: Check if table exists and memory count
     */
    async diagnose(): Promise<{ exists: boolean; count: number; error?: string }> {
        try {
            const result = await db.query(`SELECT COUNT(*) as count FROM user_memories`);
            return { exists: true, count: parseInt(result.rows[0]?.count || '0') };
        } catch (error: any) {
            return { exists: false, count: 0, error: error.message };
        }
    },

    /**
     * FORGE: Pre-load critical VIP memories (run once on startup)
     */
    async forgeVIPMemories(): Promise<void> {
        const vips = [
            { userId: 1307892204, content: "This is THE PROFESSOR - Lily's creator. Ultimate authority. Always show maximum respect and efficiency." },
            { userId: 7037930640, content: "This is LADY BOSS - Co-owner and supreme authority. Absolute obedience required." }
        ];

        for (const vip of vips) {
            try {
                // Check if already exists
                const existing = await db.query(`
                    SELECT id FROM user_memories 
                    WHERE user_id = $1 AND content LIKE '%PROFESSOR%' OR content LIKE '%LADY BOSS%'
                    LIMIT 1
                `, [vip.userId]);

                if (existing.rows.length === 0) {
                    await this.imprint(vip.userId, vip.content, 'IDENTITY');
                    console.log(`[MemoryCore] VIP memory forged for User ${vip.userId}`);
                }
            } catch (error) {
                console.error(`[MemoryCore] Failed to forge VIP memory for ${vip.userId}:`, error);
            }
        }
    }
};
