import axios from 'axios';

/**
 * World-Class High-Speed Market Engine 3.0
 * Replaced Yahoo Finance with Lightning-Fast Public APIs.
 * Crypto: Binance (No Key)
 * Forex/Gold: Public Open Feeds
 */
export const MarketData = {
    /**
     * Get Crypto Price from Binance (Real-Time)
     */
    async getCrypto(symbol: string): Promise<string | null> {
        try {
            const res = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`, { timeout: 3000 });
            const data = res.data;
            const price = parseFloat(data.lastPrice);
            const change = parseFloat(data.priceChangePercent);
            const isUp = change >= 0;
            const icon = isUp ? '📈' : '📉';

            return `${symbol}: $${price.toLocaleString()} (${isUp ? '+' : ''}${change.toFixed(2)}%) ${icon}`;
        } catch (e) {
            console.warn(`[Market] Binance fail for ${symbol}`);
            return null;
        }
    },

    /**
     * Get Gold & Forex from Public Exchange API
     */
    async getForex(): Promise<Record<string, string>> {
        try {
            // High reliability public feed
            const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 3000 });
            const rates = res.data.rates;
            return {
                MYR: rates.MYR.toFixed(2),
                XAU: (1 / rates.XAU).toFixed(2) // Gold is often returned as USD/oz
            };
        } catch (e) {
            console.warn(`[Market] Forex fail`);
            return {};
        }
    },

    /**
     * World-Class Parallel Scan
     */
    async scanAndFetch(text: string = ''): Promise<string> {
        if (!text) return '';
        const upperText = text.toUpperCase();
        const results: string[] = [];

        // 1. Parallel Crypto Fetch (Binance)
        const cryptoTasks: Promise<string | null>[] = [];
        if (upperText.includes('BTC') || upperText.includes('BITCOIN') || upperText.includes('比特币')) cryptoTasks.push(this.getCrypto('BTC'));
        if (upperText.includes('ETH') || upperText.includes('ETHEREUM') || upperText.includes('以太坊')) cryptoTasks.push(this.getCrypto('ETH'));
        if (upperText.includes('SOL') || upperText.includes('SOLANA')) cryptoTasks.push(this.getCrypto('SOL'));

        // 2. Forex / Gold (OpenRate)
        const needsForex = upperText.includes('GOLD') || upperText.includes('XAU') || upperText.includes('黄金') || upperText.includes('EMAS') ||
            upperText.includes('MYR') || upperText.includes('马币') || upperText.includes('RINGGIT');

        try {
            const [cryptoResults, forexRates] = await Promise.all([
                Promise.all(cryptoTasks),
                needsForex ? this.getForex() : Promise.resolve({} as Record<string, string>)
            ]);

            // Format Crypto
            cryptoResults.forEach(r => { if (r) results.push(r); });

            // Format Gold
            if (forexRates.XAU && (upperText.includes('GOLD') || upperText.includes('黄金') || upperText.includes('EMAS'))) {
                results.push(`GOLD: $${forexRates.XAU} 🏆`);
            }

            // Format MYR
            if (forexRates.MYR && (upperText.includes('MYR') || upperText.includes('马币'))) {
                results.push(`USD/MYR: ${forexRates.MYR} 🇲🇾`);
            }

            if (results.length === 0) return '';

            console.info(`[Market] Scanned & Found: ${results.length} markers.`);
            return `
LIVE MARKET DATA:
${results.join('\n')}
(Use this data. If user asks in Chinese/Malay, translate these prices naturally.)
            `.trim();

        } catch (e) {
            console.error('[Market] Engine 3.0 Error:', e);
            return '';
        }
    }
};
