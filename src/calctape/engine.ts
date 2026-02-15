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
