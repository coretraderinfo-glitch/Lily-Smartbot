import { DateTime } from 'luxon';

export const SYSTEM_ResetHour = 4; // 4:00 AM

// Helper to get the current "Business Date" for a group
export function getBusinessDate(timezone: string = 'Asia/Shanghai'): string {
    const now = DateTime.now().setZone(timezone);

    // If before 4 AM, it belongs to Yesterday's ledger
    if (now.hour < SYSTEM_ResetHour) {
        return now.minus({ days: 1 }).toISODate()!; // Returns YYYY-MM-DD
    }
    return now.toISODate()!;
}

// Helper to format money cleanly
export function formatMoney(amount: number, currency: string = 'CNY'): string {
    return new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
}
