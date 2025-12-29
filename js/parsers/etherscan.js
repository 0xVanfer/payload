/**
 * Etherscan Link Parser Module
 * 
 * Parses transaction links from Etherscan and compatible block explorers
 * (BSCScan, Arbiscan, Polygonscan, etc.)
 */

import { log } from '../core/abi-utils.js';
import { getNextApiKey, getApiUrl, isRoutescanChain } from '../config/etherscan-api.js';

/**
 * Mapping of explorer domains to chain IDs.
 * Used for detecting chain from URL.
 * Only includes explorers that support Etherscan V2 API or Routescan API.
 */
const EXPLORER_CHAIN_MAP = {
  // Etherscan V2 API supported chains
  'etherscan.io': '1',
  'optimistic.etherscan.io': '10',
  'bscscan.com': '56',
  'gnosisscan.io': '100',
  'polygonscan.com': '137',
  'sonicscan.org': '146',
  'ftmscan.com': '250',
  'fraxscan.com': '252',
  'zkevm.polygonscan.com': '1101',
  'moonscan.io': '1284',
  'mantlescan.xyz': '5000',
  'basescan.org': '8453',
  'arbiscan.io': '42161',
  'celoscan.io': '42220',
  'snowscan.xyz': '43114',
  'lineascan.build': '59144',
  'berascan.com': '80094',
  'blastscan.io': '81457',
  'taikoscan.io': '167000',
  'sepolia.arbiscan.io': '421614',
  'scrollscan.com': '534352',
  'sepolia.etherscan.io': '11155111',
  // Routescan API supported chains
  'plasmascan.to': '9745',
};

/**
 * Check if a URL is from a supported block explorer.
 * @param {string} url - The URL to check
 * @returns {boolean} True if URL is from a supported explorer
 */
function isEtherscanLink(url) {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    
    // Check known explorers
    for (const domain of Object.keys(EXPLORER_CHAIN_MAP)) {
      if (host === domain || host.endsWith('.' + domain)) {
        return true;
      }
    }
    
    // Also match common explorer URL patterns
    return parsed.pathname.includes('/tx/0x') || 
           parsed.pathname.includes('/address/0x');
    
  } catch {
    return false;
  }
}

/**
 * Extract chain ID from explorer URL.
 * @param {string} url - The explorer URL
 * @returns {string|null} The chain ID or null if not detected
 */
function getChainIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    
    for (const [domain, chainId] of Object.entries(EXPLORER_CHAIN_MAP)) {
      if (host === domain || host.endsWith('.' + domain)) {
        return chainId;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract transaction hash from explorer URL.
 * @param {string} url - The explorer URL
 * @returns {string|null} The transaction hash or null if not found
 */
function extractTxHash(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    
    // Match /tx/0x... pattern
    const txMatch = path.match(/\/tx\/(0x[a-fA-F0-9]{64})/);
    if (txMatch) {
      return txMatch[1].toLowerCase();
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse an Etherscan-style transaction link.
 * Fetches transaction data from the explorer API.
 * 
 * @param {string} url - The explorer URL
 * @returns {Promise<{success: boolean, payload?: string, chainId?: string, txHash?: string, error?: string}>}
 */
async function parseEtherscanLink(url) {
  log('info', 'etherscan', 'Parsing explorer link', { url });
  
  const chainId = getChainIdFromUrl(url);
  const txHash = extractTxHash(url);
  
  if (!chainId) {
    return {
      success: false,
      error: 'Could not determine chain from URL'
    };
  }
  
  if (!txHash) {
    return {
      success: false,
      chainId,
      error: 'Could not extract transaction hash from URL'
    };
  }
  
  log('debug', 'etherscan', 'Extracted tx info', { chainId, txHash });
  
  const apiUrl = getApiUrl(chainId);
  const isRoutescan = isRoutescanChain(chainId);
  
  try {
    // Fetch transaction details with API key
    // Routescan API doesn't need chainid parameter (it's in the URL path)
    const apiKey = getNextApiKey();
    const fetchUrl = isRoutescan
      ? `${apiUrl}?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`
      : `${apiUrl}?chainid=${chainId}&module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`;
    log('debug', 'etherscan', 'Fetching transaction', { fetchUrl });
    
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'API returned error');
    }
    
    const result = data.result;
    if (!result) {
      throw new Error('Transaction not found');
    }
    
    const payload = result.input;
    if (!payload || payload === '0x') {
      return {
        success: true,
        chainId,
        txHash,
        payload: '0x',
        note: 'Transaction has no input data (simple ETH transfer)'
      };
    }
    
    log('info', 'etherscan', 'Successfully extracted payload', { 
      chainId, 
      txHash, 
      payloadLength: payload.length 
    });
    
    return {
      success: true,
      chainId,
      txHash,
      payload,
      to: result.to,
      from: result.from,
      value: result.value
    };
    
  } catch (e) {
    log('error', 'etherscan', 'Failed to fetch transaction', { error: e.message });
    return {
      success: false,
      chainId,
      txHash,
      error: `Failed to fetch transaction: ${e.message}`
    };
  }
}

// Export for ES modules
export {
  isEtherscanLink,
  parseEtherscanLink,
  getChainIdFromUrl,
  extractTxHash,
  EXPLORER_CHAIN_MAP
};
