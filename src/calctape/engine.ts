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

        // Pattern: Only extract [Amount][k/m/decimal]
        // We look for numbers that aren't parts of a code (like J1, J5)
        const pattern = /([\d,.]+)([kKmM])?/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const rawDigits = match[1].replace(/[,]/g, '');
            let val = parseFloat(rawDigits);
            const multiplier = (match[2] || '').toLowerCase();
            const hasDecimal = match[1].includes('.');

            if (multiplier === 'k') val *= 1000;
            if (multiplier === 'm') val *= 1000000;

            // --- NOISE SHIELD (Surgical Data Purity) ---

            // 1. ELITE BANK ACCOUNT SHIELD: Skip long numbers (9+ digits) unless decimal/k.
            if (rawDigits.length >= 9 && !multiplier && !hasDecimal) continue;

            // 2. CODE SHIELD: Ignore small whole numbers (< 100) if no multiplier and no decimal.
            // These are almost always worker codes (J1, J5, J20) or inventory counts.
            if (val < 100 && !multiplier && !hasDecimal) continue;

            // 3. CONTEXT SHIELD: If the number is immediately preceded by a letter (like J, K, A) skip it.
            // Check the character right before the match in the original text.
            const index = match.index;
            if (index > 0) {
                const prevChar = text[index - 1];
                // If preceded by a letter that isn't part of 'RM' or 'USD' symbols
                if (/[a-gi-ln-qst-vw-xz]/i.test(prevChar)) continue;
            }

            if (isNaN(val) || val <= 0) continue;

            lines.push({
                index: i++,
                value: val,
                operator: '+',
                comment: "" // Professor requested raw amounts only
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
