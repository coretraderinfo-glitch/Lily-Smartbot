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
        const sRes = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [groupId]);
        const s = sRes.rows[0];

        // 2. Fetch Title Second (Non-Breaking)
        const gRes = await db.query('SELECT title FROM groups WHERE id = $1', [groupId]);
        const title = gRes.rows[0]?.title || 'Lily Node';

        if (s) {
            return {
                ...s,
                title,
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

// 💎 AUTH CACHE: Permission hits are the #1 source of DB lag.
// We cache isAdmin/isOperator status for 5 minutes.
const authCache = new LRUCache<string, boolean>({
    max: 10000,
    ttl: 300 * 1000, // 5 minutes
    fetchMethod: async (key) => {
        const [chatId, userId, role] = key.split(':');

        if (role === 'ADMIN') {
            const res = await db.query('SELECT 1 FROM group_admins WHERE group_id = $1 AND user_id = $2', [chatId, userId]);
            return res.rows.length > 0;
        } else if (role === 'OPERATOR') {
            const res = await db.query('SELECT 1 FROM group_operators WHERE group_id = $1 AND user_id = $2', [chatId, userId]);
            return res.rows.length > 0;
        }
        return false;
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

export const AuthCache = {
    async isAdmin(chatId: string | number, userId: string | number): Promise<boolean> {
        return await authCache.fetch(`${chatId}:${userId}:ADMIN`) || false;
    },
    async isOperator(chatId: string | number, userId: string | number): Promise<boolean> {
        return await authCache.fetch(`${chatId}:${userId}:OPERATOR`) || false;
    },
    invalidate(chatId: string | number, userId: string | number) {
        authCache.delete(`${chatId}:${userId}:ADMIN`);
        authCache.delete(`${chatId}:${userId}:OPERATOR`);
    }
};
