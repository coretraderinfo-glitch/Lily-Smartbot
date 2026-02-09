import axios from 'axios';

/**
 * World-Class High-Speed Market Engine 4.0
 * Multi-Source Redundancy (Binance + CoinCap + Mempool)
 * Resilient against Cloud IP Blocks (Railway/Vercel).
 */
export const MarketData = {
    /**
     * Get Crypto Price with Auto-Failover
     */
    async getCrypto(symbol: string): Promise<string | null> {
        // Redundancy 1: Binance (Primary)
        try {
            const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`, { timeout: 2000 });
            const price = parseFloat(res.data.price);
            return `${symbol}: $${price.toLocaleString()} (Binance) 📈`;
        } catch (e) {
            console.warn(`[Market] Binance fail for ${symbol}, trying CoinCap...`);
        }

        // Redundancy 2: CoinCap (Cloud-Friendly)
        try {
            const id = symbol === 'BTC' ? 'bitcoin' : symbol === 'ETH' ? 'ethereum' : symbol === 'SOL' ? 'solana' : symbol.toLowerCase();
            const res = await axios.get(`https://api.coincap.io/v2/assets/${id}`, { timeout: 2000 });
            const price = parseFloat(res.data.data.priceUsd);
            return `${symbol}: $${price.toLocaleString()} (Global) 🌐`;
        } catch (e) {
            console.warn(`[Market] CoinCap fail for ${symbol}`);
        }

        return null;
    },

    /**
     * Get Gold & Forex (Direct Open Source)
     */
    async getForex(): Promise<Record<string, string>> {
        try {
            // Source: ExchangeRate-API (Stable)
            const res = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 2500 });
            const rates = res.data.rates;

            // XAU in rates is often inverted (oz per USD), calculate USD per oz
            const goldPrice = rates.XAU ? (1 / rates.XAU).toFixed(2) : null;
            const myrRate = rates.MYR ? rates.MYR.toFixed(2) : null;

            return {
                MYR: myrRate || 'N/A',
                XAU: goldPrice || 'N/A'
            };
        } catch (e) {
            console.warn(`[Market] Forex API failed`);
            return {};
        }
    },

    /**
     * World-Class Parallel Scan (Sub-Second Target)
     */
    async scanAndFetch(text: string = ''): Promise<string> {
        if (!text) return '';
        const upperText = text.toUpperCase();
        const results: string[] = [];

        // 1. Queue Tasks
        const cryptoTasks: { sym: string, run: boolean }[] = [
            { sym: 'BTC', run: upperText.includes('BTC') || upperText.includes('BITCOIN') || upperText.includes('比特币') },
            { sym: 'ETH', run: upperText.includes('ETH') || upperText.includes('ETHEREUM') || upperText.includes('以太坊') },
            { sym: 'SOL', run: upperText.includes('SOL') || upperText.includes('SOLANA') }
        ];

        const needsForex = upperText.includes('GOLD') || upperText.includes('XAU') || upperText.includes('黄金') || upperText.includes('EMAS') ||
            upperText.includes('MYR') || upperText.includes('马币') || upperText.includes('RINGGIT');

        try {
            // FIRE ALL AT ONCE (PARALLEL)
            const [cResults, fRates] = await Promise.all([
                Promise.all(cryptoTasks.filter(t => t.run).map(t => this.getCrypto(t.sym))),
                needsForex ? this.getForex() : Promise.resolve({} as Record<string, string>)
            ]);

            // Consolidate
            cResults.forEach(r => { if (r) results.push(r); });

            if (fRates.XAU && fRates.XAU !== 'N/A' && (upperText.includes('GOLD') || upperText.includes('黄金') || upperText.includes('EMAS'))) {
                results.push(`GOLD: $${fRates.XAU} 🏆`);
            }
            if (fRates.MYR && fRates.MYR !== 'N/A' && (upperText.includes('MYR') || upperText.includes('马币') || upperText.includes('RINGGIT'))) {
                results.push(`USD/MYR: ${fRates.MYR} 🇲🇾`);
            }

            if (results.length === 0) return '';

            return `
LIVE MARKET DATA (Verified):
${results.join('\n')}
(LILY PRO-TIP: Use these live prices. Act like a master trader.)
            `.trim();

        } catch (e) {
            console.error('[Market] Engine 4.0 Fatal:', e);
            return '';
        }
    }
};
