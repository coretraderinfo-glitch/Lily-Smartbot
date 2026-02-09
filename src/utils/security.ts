import { createHmac } from 'crypto';

export const Security = {
    /**
     * Get list of authorized Owner IDs from environment
     */
    getOwnerRegistry(): string[] {
        const rawOwnerEnv = (process.env.OWNER_ID || '').replace(/['"\[\]\s]+/g, '').trim();
        return rawOwnerEnv.split(',')
            .map(id => id.replace(/\D/g, ''))
            .filter(id => id.length > 0);
    },

    /**
     * Check if a specific user is a documented System Owner
     */
    isSystemOwner(userId: number | string): boolean {
        const owners = this.getOwnerRegistry();
        return owners.includes(userId.toString());
    },

    /**
     * Generate a secure token for the web report
     */
    generateReportToken(chatId: number, date: string): string {
        const secret = process.env.WEB_SECRET || 'lily-secret-token-2024';
        const data = `${chatId}:${date}`;
        return createHmac('sha256', secret).update(data).digest('hex').substring(0, 16);
    },

    /**
     * Verify the report token
     */
    verifyReportToken(chatId: number, date: string, token: string): boolean {
        const expected = this.generateReportToken(chatId, date);
        return expected === token;
    },

    /**
     * Generate a secure token for the Control Panel
     */
    generateAdminToken(chatId: number, userId: number): string {
        const secret = process.env.WEB_SECRET || 'lily-secret-token-2024';
        const data = `ADMIN:${chatId}:${userId}`;
        return createHmac('sha256', secret).update(data).digest('hex').substring(0, 24);
    },

    /**
     * Verify the admin token
     */
    verifyAdminToken(chatId: number, userId: number, token: string): boolean {
        const expected = this.generateAdminToken(chatId, userId);
        return expected === token;
    }
};
