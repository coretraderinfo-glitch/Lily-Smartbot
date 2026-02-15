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
            const index = match.index;
            const afterIndex = index + match[0].length;
            const prevChar = index > 0 ? text[index - 1] : '';
            const nextChar = text[afterIndex] || '';

            // 1. ELITE BANK ACCOUNT SHIELD: Skip long numbers (9+ digits) unless decimal/k.
            if (rawDigits.length >= 9 && !multiplier && !hasDecimal) continue;

            // 2. CODE SHIELD: Ignore extremely small whole numbers (< 10) unless multiplier/decimal.
            if (val < 10 && !multiplier && !hasDecimal) continue;

            // 3. LIST INDEX SHIELD: Skip if followed by ". " or ".\n" (e.g., "1. ")
            if (nextChar === '.' && (text[afterIndex + 1] === ' ' || text[afterIndex + 1] === '\n' || !text[afterIndex + 1])) continue;

            // 4. CONTEXT SHIELD: Skip if preceded by a letter, dash, or slash (e.g., "i5-700", "Jan 13", "1/13")
            if (/[a-z\-/]/i.test(prevChar)) continue;

            // 5. TRAILING NOISE SHIELD: Skip if followed by common date markers
            if (/^(?:st|nd|rd|th|月|日|year|yr)/i.test(text.slice(afterIndex))) continue;

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
     * @param precision Number of decimal places (default 2, up to 4)
     */
    static format(session: TapeSession, precision: number = 2): string {
        let output = `📜 **LILY PAPER TAPE**\n`;
        output += `\`----------------------------\`\n`;

        for (const line of session.lines) {
            const op = line.operator;
            const val = line.value.toLocaleString(undefined, {
                minimumFractionDigits: precision,
                maximumFractionDigits: precision
            });
            const comment = line.comment ? `  ${line.comment}` : '';
            output += `\`${op} ${val.padStart(10)}\`${comment}\n`;
        }

        const currencySuffix = session.currency?.trim() ? ` ${session.currency.trim()}` : '';
        output += `\`----------------------------\`\n`;
        output += `🔥 **TOTAL: ${session.total.toLocaleString(undefined, {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision
        })}${currencySuffix}**\n`;
        output += `\`----------------------------\`\n`;

        return output;
    }
}
