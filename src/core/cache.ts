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

        // 1. Fetch Actual Settings First (Priority: Feature Accuracy)
        const [sRes, gRes, aRes, oRes] = await Promise.all([
            db.query('SELECT * FROM group_settings WHERE group_id = $1', [groupId]),
            db.query('SELECT title FROM groups WHERE id = $1', [groupId]),
            db.query('SELECT user_id FROM group_admins WHERE group_id = $1', [groupId]),
            db.query('SELECT user_id FROM group_operators WHERE group_id = $1', [groupId])
        ]);

        const s = sRes.rows[0];
        const title = gRes.rows[0]?.title || 'Lily Node';
        const admins = aRes.rows.map((r: any) => String(r.user_id));
        const operators = oRes.rows.map((r: any) => String(r.user_id));

        if (s) {
            return {
                ...s,
                title,
                admins,
                operators,
                // Hard-coded defaults for the engine to ensure NO NULLs
                guardian_enabled: !!s.guardian_enabled,
                ai_brain_enabled: !!s.ai_brain_enabled,
                welcome_enabled: !!s.welcome_enabled,
                calc_enabled: !!(s.calc_enabled ?? true),
                auditor_enabled: !!s.auditor_enabled,
                mc_enabled: !!s.mc_enabled
            };
        }

        // 3. Absolute Fallback (New Groups)
        return {
            title,
            guardian_enabled: false,
            ai_brain_enabled: false,
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
