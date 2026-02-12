import { connection as redis } from '../../bot/instance';

/**
 * LILY SHORT-TERM SESSION MEMORY (The RAM)
 * Uses Redis to store recent conversation turns for 100% contextual awareness.
 */

interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

export const SessionMemory = {
    /**
     * PUSH: Add a new turn to the session (Max 10 turns per user/chat)
     */
    async push(chatId: number, userId: number, turn: ChatTurn): Promise<void> {
        const key = `session:${chatId}:${userId}`;
        const data = JSON.stringify(turn);

        await redis.lpush(key, data);
        await redis.ltrim(key, 0, 9); // Keep last 10 turns
        await redis.expire(key, 60 * 30); // 30-minute session TTL
    },

    /**
     * RECALL: Get the history in a format OpenAI understands
     */
    async recall(chatId: number, userId: number): Promise<any[]> {
        const key = `session:${chatId}:${userId}`;
        const raw = await redis.lrange(key, 0, -1);

        // Redis returns newest first, we need chronological for OpenAI
        return raw.reverse().map(r => JSON.parse(r));
    },

    /**
     * CLEAR: Wipe the slate clean
     */
    async clear(chatId: number, userId: number): Promise<void> {
        await redis.del(`session:${chatId}:${userId}`);
    }
};
