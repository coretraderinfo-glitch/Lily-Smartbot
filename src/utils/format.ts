import Decimal from 'decimal.js';

/**
 * Number Formatting Utilities
 * Provides thousand separators for better readability
 */

/**
 * Format a number with thousand separators (e.g., 1000.00 → 1,000.00)
 * @param value - Decimal or number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with commas
 */
export function formatNumber(value: Decimal | number | string, decimals: number = 2): string {
    const num = new Decimal(value);
    const fixed = num.toFixed(decimals);

    // Split into integer and decimal parts
    const parts = fixed.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    // Add thousand separators to integer part
    const withCommas = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // Recombine with decimal part
    return decimalPart ? `${withCommas}.${decimalPart}` : withCommas;
}

/**
 * Format currency with symbol and thousand separators
 * @param value - Amount to format
 * @param symbol - Currency symbol (e.g., 'CNY', 'USD')
 * @param decimals - Number of decimal places
 * @returns Formatted currency string
 */
export function formatCurrency(value: Decimal | number | string, symbol: string = '', decimals: number = 2): string {
    const formatted = formatNumber(value, decimals);
    return symbol ? `${formatted} ${symbol}` : formatted;
}
