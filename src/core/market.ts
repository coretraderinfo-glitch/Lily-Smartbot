import yahooFinance from 'yahoo-finance2';

/**
 * World-Class Market Data Engine
 * Fetches LIVE prices to ensure Lily never hallucinates.
 */
export const MarketData = {
    /**
     * Get live price for a symbol (Crypto, Forex, Stocks)
     * e.g. BTC-USD, GC=F (Gold), ^GSPC (S&P 500)
     */
    async getPrice(symbol: string): Promise<string | null> {
        try {
            // World-Class Timeout: 3 seconds max for Yahoo link
            const quote: any = await Promise.race([
                yahooFinance.quote(symbol),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);

            if (!quote || quote.regularMarketPrice === undefined) {
                console.warn(`[Market] No price data for ${symbol}`);
                return null;
            }

            const price = quote.regularMarketPrice;
            const change = quote.regularMarketChangePercent;
            const isUp = (change || 0) >= 0;
            const icon = isUp ? '📈' : '📉';

            console.info(`[Market] SUCCESS: ${symbol} is ${price}`);
            return `${symbol}: ${price?.toFixed(2)} (${isUp ? '+' : ''}${change?.toFixed(2)}%) ${icon}`;
        } catch (e) {
            console.error(`[Market] ERROR fetching ${symbol}:`, e instanceof Error ? e.message : 'Unknown');
            return null;
        }
    },

    /**
     * Detect symbols in text and fetch data
     */
    async scanAndFetch(text: string = ''): Promise<string> {
        if (!text) return '';
        const upperText = text.toUpperCase();
        const results: string[] = [];

        // 1. Crypto (English + Chinese)
        if (upperText.includes('BTC') || upperText.includes('BITCOIN') || upperText.includes('比特币'))
            results.push(await this.getPrice('BTC-USD') || '');
        if (upperText.includes('ETH') || upperText.includes('ETHEREUM') || upperText.includes('以太坊'))
            results.push(await this.getPrice('ETH-USD') || '');
        if (upperText.includes('SOL') || upperText.includes('SOLANA'))
            results.push(await this.getPrice('SOL-USD') || '');

        // 2. Forex / Commodities (English + Chinese + Malay)
        if (upperText.includes('GOLD') || upperText.includes('XAU') || upperText.includes('黄金') || upperText.includes('EMAS'))
            results.push(await this.getPrice('GC=F') || 'Gold: Live Data Unavailable');

        if (upperText.includes('USD') && (upperText.includes('MYR') || upperText.includes('马币') || upperText.includes('RINGGIT')))
            results.push(await this.getPrice('MYR=X') || '');

        // 3. Filter empty
        const validResults = results.filter(r => r !== '');

        if (validResults.length === 0) return '';

        return `
LIVE MARKET DATA (Yahoo Finance):
${validResults.join('\n')}
(Use this data. Do NOT hallucinate prices. If the user asks in Chinese/Malay, translate these prices naturally in your reply.)
        `.trim();
    }
};
