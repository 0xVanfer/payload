/**
 * Safe Global Link Parser Module
 * 
 * Parses transaction links from Safe Global (app.safe.global).
 * Supports multisig transaction URLs.
 */

import { log } from '../core/abi-utils.js';

/**
 * Safe Transaction Service API base URL template.
 * Format: https://safe-transaction-{network}.safe.global/api/v1/
 */
const SAFE_API_BASE = 'https://safe-transaction-{network}.safe.global/api/v1';

/**
 * Map of chain prefixes to chain IDs and network names.
 */
const CHAIN_PREFIX_MAP = {
  'eth': { chainId: '1', network: 'mainnet' },
  'oeth': { chainId: '10', network: 'optimism' },
  'bnb': { chainId: '56', network: 'bsc' },
  'gno': { chainId: '100', network: 'gnosis' },
  'matic': { chainId: '137', network: 'polygon' },
  'zkevm': { chainId: '1101', network: 'zkevm' },
  'arb1': { chainId: '42161', network: 'arbitrum' },
  'avax': { chainId: '43114', network: 'avalanche' },
  'base': { chainId: '8453', network: 'base' },
  'blast': { chainId: '81457', network: 'blast' },
  'linea': { chainId: '59144', network: 'linea' },
  'mnt': { chainId: '5000', network: 'mantle' },
  'scr': { chainId: '534352', network: 'scroll' },
  'sep': { chainId: '11155111', network: 'sepolia' },
  'zksync': { chainId: '324', network: 'zksync' },
  'xlayer': { chainId: '196', network: 'xlayer' },
  'celo': { chainId: '42220', network: 'celo' },
  'aurora': { chainId: '1313161554', network: 'aurora' },
  'sonic': { chainId: '146', network: 'sonic' },
  'unichain': { chainId: '130', network: 'unichain' },
  'ink': { chainId: '57073', network: 'ink' },
  'worldchain': { chainId: '480', network: 'worldchain' },
};

/**
 * Regex patterns for Safe Global URL formats.
 */
const PATTERNS = {
  // Transaction: /transactions/tx?safe={chainPrefix}:{safeAddress}&id=multisig_{safeAddress}_{safeTxHash}
  transaction: /\/transactions\/tx\?.*safe=([a-z0-9]+):([a-fx0-9]+).*id=multisig_([a-fx0-9]+)_([a-fx0-9]+)/i,
  
  // Transaction queue or history: /transactions/queue?safe={chainPrefix}:{safeAddress}
  // or /transactions/history?safe={chainPrefix}:{safeAddress}
  transactionList: /\/transactions\/(queue|history)\?.*safe=([a-z0-9]+):([a-fx0-9]+)/i,
};

/**
 * Check if a URL is from Safe Global.
 * @param {string} url - The URL to check
 * @returns {boolean} True if URL is from Safe Global
 */
function isSafeLink(url) {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    return parsed.host === 'app.safe.global' || parsed.host.endsWith('.safe.global');
  } catch {
    return false;
  }
}

/**
 * Detect the type of Safe Global URL.
 * @param {string} url - The URL to analyze
 * @returns {{type: string, matches: RegExpMatchArray}|null} The detected type and matches
 */
function detectSafeUrlType(url) {
  try {
    const parsed = new URL(url);
    const fullUrl = parsed.pathname + parsed.search;
    
    for (const [type, pattern] of Object.entries(PATTERNS)) {
      const matches = fullUrl.match(pattern);
      if (matches) {
        log('debug', 'safe', 'Detected URL type', { type, fullUrl });
        return { type, matches };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the API URL for a given chain prefix.
 * @param {string} chainPrefix - The chain prefix (e.g., 'eth', 'arb1')
 * @returns {{apiUrl: string, chainId: string}|null} The API URL and chain ID
 */
function getApiUrlForChain(chainPrefix) {
  const chainInfo = CHAIN_PREFIX_MAP[chainPrefix.toLowerCase()];
  if (!chainInfo) {
    log('warn', 'safe', 'Unknown chain prefix', { chainPrefix });
    return null;
  }
  
  const apiUrl = SAFE_API_BASE.replace('{network}', chainInfo.network);
  return { apiUrl, chainId: chainInfo.chainId };
}

/**
 * Fetch multisig transaction data from Safe Transaction Service API.
 * @param {string} apiUrl - The API base URL
 * @param {string} safeTxHash - The Safe transaction hash
 * @returns {Promise<Object>} The API response data
 */
async function fetchMultisigTransaction(apiUrl, safeTxHash) {
  const url = `${apiUrl}/multisig-transactions/${safeTxHash}/`;
  log('debug', 'safe', 'Fetching multisig transaction', { url });
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Parse a Safe Global link to extract transaction payload.
 * 
 * @param {string} url - The Safe Global URL
 * @returns {Promise<{success: boolean, payload?: string, chainId?: string, error?: string}>}
 */
async function parseSafeLink(url) {
  log('info', 'safe', 'Parsing Safe Global link', { url });
  
  const detected = detectSafeUrlType(url);
  
  if (!detected) {
    return {
      success: false,
      error: 'Unrecognized Safe Global URL format'
    };
  }
  
  const { type, matches } = detected;
  
  try {
    switch (type) {
      case 'transaction': {
        const chainPrefix = matches[1];
        const safeAddress = matches[2];
        const safeTxHash = matches[4];
        
        log('debug', 'safe', 'Parsing Safe transaction', { chainPrefix, safeAddress, safeTxHash });
        
        const chainInfo = getApiUrlForChain(chainPrefix);
        if (!chainInfo) {
          return {
            success: false,
            error: `Unknown chain prefix: ${chainPrefix}`
          };
        }
        
        const { apiUrl, chainId } = chainInfo;
        const txData = await fetchMultisigTransaction(apiUrl, safeTxHash);
        
        // Extract payload from transaction data
        const payload = txData.data;
        if (!payload) {
          return {
            success: false,
            error: 'Transaction has no data payload'
          };
        }
        
        return {
          success: true,
          payload,
          chainId,
          to: txData.to,
          from: txData.safe,
          txHash: safeTxHash,
          source: 'safe-global'
        };
      }
      
      case 'transactionList': {
        const listType = matches[1]; // 'queue' or 'history'
        const chainPrefix = matches[2];
        const safeAddress = matches[3];
        
        log('debug', 'safe', 'Safe transaction list detected', { listType, chainPrefix, safeAddress });
        
        return {
          success: false,
          error: `Please open a specific transaction from the ${listType} to parse`
        };
      }
      
      default:
        return {
          success: false,
          error: `Unsupported Safe Global URL type: ${type}`
        };
    }
    
  } catch (e) {
    log('error', 'safe', 'Failed to parse Safe Global link', { error: e.message });
    return {
      success: false,
      error: `Failed to fetch from Safe Global: ${e.message}`
    };
  }
}

// Export for ES modules
export {
  isSafeLink,
  parseSafeLink,
  detectSafeUrlType,
  PATTERNS
};
