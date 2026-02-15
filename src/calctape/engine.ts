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

        // Pattern: [Description] [Amount][k/m]
        // Group 1 (Optional Description): Words/Chinese Chars
        // Group 2 (Amount): Numbers
        // Group 3 (Multiplier): 'k' or 'm' (optional)
        const pattern = /([a-zA-Z\u4e00-\u9fa5]{2,})?\s*([\d,.]+)([kKmM])?/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const rawDigits = match[2].replace(/[,]/g, '');
            let val = parseFloat(rawDigits);
            const multiplier = (match[3] || '').toLowerCase();

            // MULTIPLIER LOGIC
            if (multiplier === 'k') val *= 1000;
            if (multiplier === 'm') val *= 1000000;

            // BANK ACCOUNT FILTER: 
            // 1. If it's a very long string of digits (e.g. >= 9 digits) and NOT marked with 'k', it's likely an account number.
            if (rawDigits.length >= 9 && !multiplier) continue;

            const name = (match[1] || '').trim();

            // 2. Clear currency prefixes from the name (e.g. "RM1950" -> name is "RM", we clear it)
            const cleanName = name.replace(/^(rm|usd|cny|rmb)$/i, '').trim();

            // 3. Skip common bank noise & long descriptions that don't look like names
            const noise = /bank|maybank|cimb|pbb|hlb|rhb|ambank|standard|nacional|simpanan|nasional|sdn|bhd|branch|enterprise|ipoh|car|battery/i;
            const filteredName = noise.test(cleanName) ? "" : cleanName;

            if (!isNaN(val) && val > 0) {
                lines.push({
                    index: i++,
                    value: val,
                    operator: '+',
                    comment: filteredName
                });
            }
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
