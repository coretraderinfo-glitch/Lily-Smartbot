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
            // World-Class Timeout: 5 seconds max for Yahoo link
            const quote: any = await Promise.race([
                yahooFinance.quote(symbol),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
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

        const tasks: { symbol: string, trigger: boolean }[] = [
            { symbol: 'BTC-USD', trigger: upperText.includes('BTC') || upperText.includes('BITCOIN') || upperText.includes('比特币') },
            { symbol: 'ETH-USD', trigger: upperText.includes('ETH') || upperText.includes('ETHEREUM') || upperText.includes('以太坊') },
            { symbol: 'SOL-USD', trigger: upperText.includes('SOL') || upperText.includes('SOLANA') },
            { symbol: 'GC=F', trigger: upperText.includes('GOLD') || upperText.includes('XAU') || upperText.includes('黄金') || upperText.includes('EMAS') },
            { symbol: 'MYR=X', trigger: upperText.includes('USD') && (upperText.includes('MYR') || upperText.includes('马币') || upperText.includes('RINGGIT')) }
        ];

        const activeTasks = tasks.filter(t => t.trigger);
        if (activeTasks.length === 0) return '';

        try {
            // WORLD-CLASS PARALLEL PROCESSING
            const results = await Promise.all(activeTasks.map(t => this.getPrice(t.symbol)));
            const validResults = results.filter(r => r !== null);

            if (validResults.length === 0) {
                console.error(`[Market] Scanned symbols: ${activeTasks.map(t => t.symbol).join(',')} but all failed.`);
                return '';
            }

            return `
LIVE MARKET DATA (Yahoo Finance):
${validResults.join('\n')}
(Use this data. If user asks in Chinese/Malay, translate these prices naturally.)
            `.trim();
        } catch (e) {
            console.error('[Market] Parallel Scan Error:', e);
            return '';
        }
    }
};
