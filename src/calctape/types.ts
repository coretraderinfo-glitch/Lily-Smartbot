/**
 * LILY CALCTAPE TYPES - MODULAR ENGINE V1
 */

export interface TapeLine {
    value: number;
    operator: '+' | '-' | '*' | '/' | '=';
    comment?: string;
    subtotal?: number;
}

export interface TapeSession {
    id: string;
    chatId: number;
    lines: TapeLine[];
    total: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
}
