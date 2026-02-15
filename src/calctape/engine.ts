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
        // Humanized regex: Captures operator, value, and anything after it as a comment
        const pattern = /([-+*/=])?\s*([\d.]+)\s*(?:\[(.*?)\]|#(.*?)|(?:\s+([a-zA-Z\u4e00-\u9fa5].*?))|$)/gm;
        let match;
        let i = 1;

        while ((match = pattern.exec(input)) !== null) {
            const operator = (match[1] as '+' | '-' | '*' | '/' | '=') || '+';
            const value = parseFloat(match[2]);
            const comment = (match[3] || match[4] || match[5] || '').trim();

            lines.push({ index: i++, value, operator, comment });
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
     * Format the tape into the 'Classic CalcTape' visual style with indices
     */
    static format(session: TapeSession): string {
        let output = `📜 **LILY PAPER TAPE**\n`;
        output += `\`----------------------------\`\n`;

        for (const line of session.lines) {
            const op = line.operator === '+' ? ' ' : line.operator;
            const val = line.value.toLocaleString(undefined, { minimumFractionDigits: 2 });
            const idx = `[${line.index}]`.padEnd(4);
            const comment = line.comment ? ` # ${line.comment}` : '';
            output += `\`${idx} ${op} ${val.padStart(10)}\` ${comment}\n`;
        }

        output += `\`----------------------------\`\n`;
        output += `🔥 **TOTAL: ${session.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}**\n`;
        output += `\`----------------------------\`\n`;
        output += `_Session ID: ${session.id}_  |  _Use /tape edit [ID] [Line] [NewContent]_`;

        return output;
    }
}
