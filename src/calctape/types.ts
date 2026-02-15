/**
 * LILY CALCTAPE TYPES - MODULAR ENGINE V1
 */

export interface TapeLine {
    index: number;
    value: number;
    operator: '+' | '-' | '*' | '/' | '=';
    comment?: string;
    subtotal?: number;
}

export interface TapeSession {
    id: string;
    chatId: number;
    creatorId: number;
    lines: TapeLine[];
    total: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
}
