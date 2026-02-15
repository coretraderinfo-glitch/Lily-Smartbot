/**
 * LILY CALCTAPE ENGINE
 * "Isolated Financial Paper-Tape Logic"
 * 
 * This module is completely independent from the Ledger.
 * It strictly handles the 'CalcTape' style calculations and formatting.
 */

import { TapeLine, TapeSession } from './types';

export class CalcTape {
    /**
     * Parse a raw input string into a structured Paper Tape
     * Format: "100 + 200 - 50" or line breaks
     */
    static parse(input: string): { lines: TapeLine[], currency?: string } {
        const lines: TapeLine[] = [];

        // 1. Detect Currency Suffix (e.g., =usdt, =myr)
        let currency: string | undefined;
        const currencyMatch = input.match(/=\s*([a-zA-Z]{2,5})\s*$/);
        if (currencyMatch) {
            currency = currencyMatch[1].toUpperCase();
            // Clean the input for mathematical parsing
            input = input.replace(/=\s*[a-zA-Z]{2,5}\s*$/, '');
        }

        // 2. Parse Lines
        const pattern = /([-+*/=])?\s*([\d,.]+)\s*([^+\-*/=]*)/g;
        let match;
        let i = 1;

        while ((match = pattern.exec(input)) !== null) {
            const operator = (match[1] as '+' | '-' | '*' | '/' | '=') || '+';
            const value = parseFloat(match[2].replace(/,/g, ''));

            // Clean up the comment (remove [], #, and leading/trailing whitespace)
            let comment = (match[3] || '').trim();
            comment = comment.replace(/^[#\[\]]+|[#\[\]]+$/g, '').trim();

            if (!isNaN(value)) {
                lines.push({ index: i++, value, operator, comment });
            }
        }
        return { lines, currency };
    }

    static smartExtract(text: string): TapeLine[] {
        const lines: TapeLine[] = [];
        let i = 1;

        // Pattern: Detects [Name/Label] [Amount][k/m/decimal]
        // This is a more greedy pattern to capture names before or after amounts
        const pattern = /([a-zA-Z\u4e00-\u9fa5]{2,})?\s*([\d,.]+)([kKmM])?\s*([a-zA-Z\u4e00-\u9fa5]{2,})?/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const rawDigits = match[2].replace(/[,]/g, '');
            let val = parseFloat(rawDigits);
            const multiplier = (match[3] || '').toLowerCase();
            const hasDecimal = match[2].includes('.');

            if (multiplier === 'k') val *= 1000;
            if (multiplier === 'm') val *= 1000000;

            // ELITE BANK ACCOUNT SHIELD:
            // Skip long numbers (9+ digits) EXCEPT if they have a decimal point or a k/m multiplier.
            if (rawDigits.length >= 9 && !multiplier && !hasDecimal) continue;
            if (isNaN(val) || val <= 0) continue;

            // Extract Name/Comment from either group 1 or group 4
            let name = (match[1] || match[4] || '').trim();

            // Scrubbing
            const cleanName = name.replace(/^(rm|usd|cny|rmb)$/i, '').trim();
            const noise = /bank|maybank|cimb|pbb|hlb|rhb|ambank|standard|nacional|simpanan|nasional|sdn|bhd|branch|enterprise|ipoh|car|battery/i;
            const finalName = noise.test(cleanName) ? "" : cleanName;

            lines.push({
                index: i++,
                value: val,
                operator: '+',
                comment: finalName
            });
        }
        return lines;
    }

    /**
     * Recalculate the entire tape with running subtotals
     */
    static recalculate(lines: TapeLine[]): number {
        let total = 0;
        for (const line of lines) {
            if (line.operator === '+') total += line.value;
            else if (line.operator === '-') total -= line.value;
            else if (line.operator === '*') total *= line.value;
            else if (line.operator === '/') total /= line.value;
            line.subtotal = total;
        }
        return total;
    }

    /**
     * Format the tape into the 'Professor's Professional' list style
     */
    static format(session: TapeSession): string {
        let output = `📜 **LILY PAPER TAPE**\n`;
        output += `\`----------------------------\`\n`;

        for (const line of session.lines) {
            const op = line.operator;
            const val = line.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
            const comment = line.comment ? `  ${line.comment}` : '';
            output += `\`${op} ${val.padStart(10)}\`${comment}\n`;
        }

        output += `\`----------------------------\`\n`;
        output += `🔥 **TOTAL: ${session.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${session.currency}**\n`;
        output += `\`----------------------------\`\n`;

        return output;
    }
}
