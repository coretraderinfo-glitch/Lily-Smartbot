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

        // WORLD-CLASS CIRCUIT BREAKER: Never let DB hang the bot
        const fetchPromise = (async () => {
            try {
                // Fetch Settings + Group Meta in ONE surgical hit
                const res = await db.query(`
                    SELECT s.*, g.title, g.timezone
                    FROM group_settings s 
                    JOIN groups g ON s.group_id = g.id 
                    WHERE s.group_id = $1
                `, [groupId]);

                if (res.rows.length > 0) return res.rows[0];

                // Fallback for new groups skipping the JOIN
                const fallback = await db.query('SELECT title FROM groups WHERE id = $1', [groupId]);
                return {
                    title: fallback.rows[0]?.title || 'Lily Node',
                    guardian_enabled: false,
                    ai_brain_enabled: false,
                    welcome_enabled: false,
                    calc_enabled: true,
                    auditor_enabled: false,
                    mc_enabled: false,
                    calctape_enabled: false,
                    language_mode: 'CN'
                };
            } catch (e) {
                throw e;
            }
        })();

        // Race against a 3s timeout
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('DB_TIMEOUT')), 3000)
        );

        try {
            return await Promise.race([fetchPromise, timeoutPromise]);
        } catch (e) {
            console.error(`🛑 [Cache_Safeguard] DB too slow/broken for ${groupId}. Using Safe Defaults.`);
            return {
                title: 'Lily System (Recovery Mode)',
                guardian_enabled: false,
                ai_brain_enabled: false,
                welcome_enabled: false,
                calc_enabled: true,
                auditor_enabled: false,
                mc_enabled: false,
                calctape_enabled: false,
                language_mode: 'CN'
            };
        }
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
