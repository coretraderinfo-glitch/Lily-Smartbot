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
    static parse(input: string): TapeLine[] {
        const lines: TapeLine[] = [];
        const pattern = /([-+*/=])?\s*([\d.]+)\s*(?:\[(.*?)\]|#(.*?)|$)/gm;
        let match;

        while ((match = pattern.exec(input)) !== null) {
            const operator = (match[1] as '+' | '-' | '*' | '/' | '=') || '+';
            const value = parseFloat(match[2]);
            const comment = (match[3] || match[4] || '').trim();

            lines.push({ value, operator, comment });
        }
        return lines;
    }

    /**
     * Recalculate the entire tape
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
     * Format the tape into the 'Classic CalcTape' visual style
     */
    static format(session: TapeSession): string {
        let output = `📜 **LILY PAPER TAPE**\n`;
        output += `\`----------------------\`\n`;

        for (const line of session.lines) {
            const op = line.operator === '+' ? ' ' : line.operator;
            const val = line.value.toLocaleString(undefined, { minimumFractionDigits: 2 });
            const comment = line.comment ? ` # ${line.comment}` : '';
            output += `\`${op} ${val.padStart(10)}\` ${comment}\n`;
        }

        output += `\`----------------------\`\n`;
        output += `🔥 **TOTAL: ${session.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}**\n`;
        output += `\`----------------------\`\n`;
        output += `_Session ID: ${session.id}_`;

        return output;
    }
}
