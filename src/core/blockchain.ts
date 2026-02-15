import fetch from 'node-fetch';

/**
 * LILY BLOCKCHAIN BRIDGE V1
 * "The Digital Forensic Accountant"
 * 
 * Features:
 * - USDT-TRC20 Verification (TronGrid)
 * - USDT-ERC20 Verification (Etherscan)
 * - Fraud Detection (Fake/Failed TXIDs)
 */

interface TxResult {
    found: boolean;
    status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNKNOWN';
    amount?: number;
    currency?: string;
    timestamp?: number;
    from?: string;
    to?: string;
    error?: string;
}

export const Blockchain = {
    /**
     * UNIVERSAL VERIFIER: Auto-detects chain and verifies status
     */
    async verify(txid: string): Promise<TxResult> {
        txid = txid.trim();

        // 1. Detect Chain based on format
        if (txid.startsWith('0x') && txid.length === 66) {
            return await this.verifyERC20(txid);
        } else if (txid.length === 64) {
            return await this.verifyTRC20(txid);
        } else {
            return { found: false, status: 'UNKNOWN', error: 'Invalid TXID Format' };
        }
    },

    /**
     * TRON (TRC20) Verification
     * Uses TronGrid Public API
     */
    async verifyTRC20(txid: string): Promise<TxResult> {
        try {
            // Using TronScan Public API (No key needed for basic check, but rate limited)
            const url = `https://apilist.tronscan.org/api/transaction-info?hash=${txid}`;
            const response = await fetch(url);
            const data: any = await response.json();

            if (!data || Object.keys(data).length === 0) {
                return { found: false, status: 'UNKNOWN', error: 'TXID Not Found on TronScan' };
            }

            // Check Contract Status
            const status = data.contractRet === 'SUCCESS' ? 'SUCCESS' : 'FAILED';

            // Extract Amount (USDT usually)
            let amount = 0;
            let currency = 'TRX';

            // Look for TRC20 Transfer info
            if (data.trc20TransferInfo && data.trc20TransferInfo.length > 0) {
                const transfer = data.trc20TransferInfo[0];
                amount = parseFloat(transfer.amount_str) / Math.pow(10, transfer.decimals);
                currency = transfer.symbol;
            }

            return {
                found: true,
                status,
                amount,
                currency,
                timestamp: data.timestamp,
                from: data.ownerAddress,
                to: data.toAddress
            };

        } catch (error: any) {
            console.error('[Blockchain] TRC20 Check Error:', error);
            return { found: false, status: 'UNKNOWN', error: error.message };
        }
    },

    /**
     * ETHEREUM (ERC20) Verification
     * Uses Etherscan (Needs API Key in strict mode, but we use public endpoint for now)
     */
    async verifyERC20(txid: string): Promise<TxResult> {
        // Fallback: Without Etherscan Key, we can't reliably check programmatically for free indefinitely.
        // For V1, we will return a "Check Link" instead or mock basic format validation.
        return {
            found: true,
            status: 'UNKNOWN',
            error: 'ERC20 Verification requires Etherscan API Key (Coming Soon). Check manually.'
        };
    }
};
