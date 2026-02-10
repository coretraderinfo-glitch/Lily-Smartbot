import { LRUCache } from 'lru-cache';
import { db } from '../db';

/**
 * LILY HIGH-SPEED MEMORY LAYER
 * "Top Tier" performance requires zero-latency decision making.
 * We cache group settings to avoid DB hits on every single message.
 */

// Cache for group settings (Feature Flags: Calc, Guardian, AI)
// TTL: 60 seconds (Auto-refresh) or Manual Invalidation on Toggle
const settingsCache = new LRUCache<string, any>({
    max: 5000, // Handle up to 5000 active groups in memory
    ttl: 60 * 1000, // 1 Minute TTL (Safety net)
    fetchMethod: async (key, staleValue, { signal }) => {
        const groupId = key;
        // Fetch from DB if missing
        const res = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [groupId]);
        return res.rows[0] || { guardian_enabled: false, ai_brain_enabled: false, welcome_enabled: true, calc_enabled: true, language_mode: 'CN' };
    }
});

export const SettingsCache = {
    /**
     * Get settings with micro-latency (Memory -> DB)
     */
    async get(groupId: string | number): Promise<any> {
        return await settingsCache.fetch(String(groupId));
    },

    /**
     * Force refresh a specific group (Used after Admin Toggles)
     */
    async invalidate(groupId: string | number) {
        settingsCache.delete(String(groupId));
    },

    /**
     * Direct update (Fastest update after write)
     */
    set(groupId: string | number, data: any) {
        settingsCache.set(String(groupId), data);
    }
};
