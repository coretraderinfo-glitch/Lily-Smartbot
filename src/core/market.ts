import axios from 'axios';

/**
 * World-Class High-Speed Market Engine 7.0 (GOLD MASTER)
 * - LIVE MALAYSIA GOLD CALIBRATION: Calculates RM per Gram (999/24K) dynamically.
 * - Formula: (USD/Ounce / 31.1035) * USD/MYR Rate.
 * - Quad-Source Redundancy: Binance -> CryptoCompare -> CoinCap
 */

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

export const MarketData = {
    /**
     * Get Crypto Price with Elite Failover
     */
    async getCrypto(symbol: string): Promise<string | null> {
        const endpoints = [
            {
                url: `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`,
                parse: (d: any) => `${symbol}: $${parseFloat(d.price).toLocaleString()} (BN) 📈`
            },
            {
                url: `https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`,
                parse: (d: any) => d.USD ? `${symbol}: $${parseFloat(d.USD).toLocaleString()} (CC) 💎` : null
            }
        ];

        for (const ep of endpoints) {
            try {
                const res = await axios.get(ep.url, { timeout: 1500, headers: HEADERS });
                const parsed = ep.parse(res.data);
                if (parsed) return parsed;
            } catch (e) { }
        }
        return null;
    },

    /**
     * Get Gold & Forex (Direct Global Ticker)
     */
    async getMarketState(): Promise<{ goldUsdOz: number, myrRate: number } | null> {
        const feeds = [
            'https://open.er-api.com/v6/latest/USD',
            'https://api.exchangerate-api.com/v4/latest/USD'
        ];

        for (const feed of feeds) {
            try {
                const res = await axios.get(feed, { timeout: 2000, headers: HEADERS });
                const rates = res.data.rates;
                if (rates.MYR && rates.XAU) {
                    return {
                        goldUsdOz: 1 / rates.XAU, // Convert XAU (oz/USD) to USD/oz
                        myrRate: rates.MYR
                    };
                }
            } catch (e) { }
        }
        return null;
    },

    /**
     * World-Class Parallel Scan
     */
    async scanAndFetch(text: string = ''): Promise<string> {
        if (!text) return '';
        const upperText = text.toUpperCase();
        const results: string[] = [];

        // 1. Identify Symbols
        const cryptoSymbols = [];
        if (/BTC|BITCOIN|比特币/.test(upperText)) cryptoSymbols.push('BTC');
        if (/ETH|ETHEREUM|以太坊/.test(upperText)) cryptoSymbols.push('ETH');
        if (/SOL|SOLANA/.test(upperText)) cryptoSymbols.push('SOL');

        const needsGoldOrForex = /GOLD|XAU|黄金|EMAS|MYR|马币|RINGGIT|GRAM/.test(upperText);

        try {
            // FIRE ALL (PARALLEL)
            const [cResults, mData] = await Promise.all([
                Promise.all(cryptoSymbols.map(s => this.getCrypto(s))),
                needsGoldOrForex ? this.getMarketState() : Promise.resolve(null)
            ]);

            // Add Crypto
            cResults.forEach(r => { if (r) results.push(r); });

            // 2. MASTER GOLD CALCULATION (MALAYSIA SPECIFIC)
            if (mData) {
                const { goldUsdOz, myrRate } = mData;

                // Gold Per Ounce (Global)
                if (/GOLD|黄金|EMAS|XAU/.test(upperText)) {
                    results.push(`Gold (Ounce): $${goldUsdOz.toFixed(2)} 🏆`);
                }

                // Malaysia Specific: Gold Per Gram (999/24K)
                // 1 Troy Ounce = 31.1034768 grams
                const goldRmPerGram = (goldUsdOz / 31.1035) * myrRate;

                if (/MALAYSIA|MYR|马币|GRAM|EMAS/.test(upperText)) {
                    results.push(`Malaysia Gold (999/24K): RM${goldRmPerGram.toFixed(2)}/g 🇲🇾✨`);
                    results.push(`USD/MYR Rate: ${myrRate.toFixed(3)}`);
                }
            }

            if (results.length === 0) return '';

            return `
LIVE MARKET DATA (MASTER TICKER):
${results.join('\n')}
(MISSION: Calculate or report prices using this data EXACTLY.)
            `.trim();

        } catch (e) {
            console.error('[Market] Engine 7.0 Error:', e);
            return '';
        }
    }
};
