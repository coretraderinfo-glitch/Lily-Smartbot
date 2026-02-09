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
            const quote: any = await yahooFinance.quote(symbol);
            if (!quote) return null;

            const price = quote.regularMarketPrice;
            const change = quote.regularMarketChangePercent;
            const isUp = (change || 0) >= 0;
            const icon = isUp ? '📈' : '📉';

            return `${symbol}: ${price?.toFixed(2)} (${isUp ? '+' : ''}${change?.toFixed(2)}%) ${icon}`;
        } catch (e) {
            console.error(`[Market] Failed to fetch ${symbol}:`, e);
            return null;
        }
    },

    /**
     * Detect symbols in text and fetch data
     */
    async scanAndFetch(text: string): Promise<string> {
        const upperText = text.toUpperCase();
        const results: string[] = [];

        // 1. Crypto
        if (upperText.includes('BTC') || upperText.includes('BITCOIN')) results.push(await this.getPrice('BTC-USD') || '');
        if (upperText.includes('ETH') || upperText.includes('ETHEREUM')) results.push(await this.getPrice('ETH-USD') || '');
        if (upperText.includes('SOL') || upperText.includes('SOLANA')) results.push(await this.getPrice('SOL-USD') || '');

        // 2. Forex / Commodities
        if (upperText.includes('GOLD') || upperText.includes('XAU')) results.push(await this.getPrice('GC=F') || 'Gold: Live Data Unavailable');
        if (upperText.includes('USD') && upperText.includes('MYR')) results.push(await this.getPrice('MYR=X') || '');

        // 3. Filter empty
        const validResults = results.filter(r => r !== '');

        if (validResults.length === 0) return '';

        return `
LIVE MARKET DATA (Yahoo Finance):
${validResults.join('\n')}
(Use this data. Do NOT hallucinate prices.)
        `.trim();
    }
};
