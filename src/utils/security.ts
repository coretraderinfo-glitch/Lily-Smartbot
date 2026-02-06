/**
 * Security Utilities
 * Handles Owner ID verification and Registry Management
 */

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
    }
};
