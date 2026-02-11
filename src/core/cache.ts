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
    max: 5000,
    ttl: 30 * 1000, // 30s TTL for extreme freshness
    fetchMethod: async (key) => {
        const groupId = key;

        // 1. ATOMIC IDENTITY FETCH (Merged 4 queries into 1 for stability)
        const res = await db.query(`
            SELECT 
                g.title,
                s.*, 
                (SELECT json_agg(user_id::text) FROM group_admins WHERE group_id = $1) as admin_list,
                (SELECT json_agg(user_id::text) FROM group_operators WHERE group_id = $1) as operator_list
            FROM groups g
            LEFT JOIN group_settings s ON g.id = s.group_id
            WHERE g.id = $1
        `, [groupId]);

        const data = res.rows[0];
        const title = data?.title || 'Lily Node';

        if (data && data.group_id) {
            return {
                ...data,
                title,
                admins: data.admin_list || [],
                operators: data.operator_list || [],
                // Hard-coded defaults for the engine to ensure NO NULLs
                guardian_enabled: !!data.guardian_enabled,
                ai_brain_enabled: !!data.ai_brain_enabled,
                welcome_enabled: !!data.welcome_enabled,
                calc_enabled: !!(data.calc_enabled ?? true),
                auditor_enabled: !!data.auditor_enabled,
                mc_enabled: !!data.mc_enabled
            };
        }

        // 3. Absolute Fallback (New Groups or Settings missing)
        console.warn(`⚠️ [CACHE_MISS] No settings found for ${groupId}. Using DEFAULT profile (AI=ON).`);
        return {
            title,
            guardian_enabled: false,
            ai_brain_enabled: true, // FORCE ENABLE BRAIN
            welcome_enabled: false,
            calc_enabled: true,
            auditor_enabled: false,
            mc_enabled: false,
            language_mode: 'CN'
        };
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
