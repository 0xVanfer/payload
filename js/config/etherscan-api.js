/**
 * Etherscan API Utilities Module
 * 
 * Provides shared Etherscan API functionality used across multiple modules:
 * - etherscan.js (link parser)
 * - contract-name.js (contract name lookup)
 * - abi-fetcher.js (ABI fetching)
 * 
 * Features:
 * - API key rotation
 * - Routescan support for specific chains
 * - Unified API URL generation
 */

/**
 * Etherscan API keys for rate limiting bypass.
 * Rotates through keys on each request.
 * @type {string[]}
 */
const API_KEYS = [
  'B74HQUR15VESEHDE1HWQSFF6HGDDJ8C9RH',
  '69TECUX4UTVCG19HPW6SRTUW5YHT1J8JZX',
  '6JEUZGXV6NCGQEMKSWEGI46MJRK1QDWJ8C'
];

let apiKeyIndex = 0;

/**
 * Get next API key in rotation.
 * @returns {string} API key
 */
export function getNextApiKey() {
  const key = API_KEYS[apiKeyIndex];
  apiKeyIndex = (apiKeyIndex + 1) % API_KEYS.length;
  return key;
}

/**
 * Chain IDs that use Routescan API instead of Etherscan V2 API.
 * @type {string[]}
 */
export const ROUTESCAN_CHAINS = ['9745'];

/**
 * Check if a chain uses Routescan API.
 * @param {string|number} chainId - The chain ID
 * @returns {boolean} True if chain uses Routescan
 */
export function isRoutescanChain(chainId) {
  return ROUTESCAN_CHAINS.includes(String(chainId));
}

/**
 * Get the API URL for a given chain.
 * Uses Etherscan V2 API for most chains, Routescan API for specific chains.
 * @param {string|number} chainId - The chain ID
 * @returns {string} The API base URL
 */
export function getApiUrl(chainId) {
  const normalizedChainId = String(chainId);
  if (isRoutescanChain(normalizedChainId)) {
    return `https://api.routescan.io/v2/network/mainnet/evm/${normalizedChainId}/etherscan/api`;
  }
  return 'https://api.etherscan.io/v2/api';
}

/**
 * Build a full API URL with parameters.
 * @param {string|number} chainId - The chain ID
 * @param {Object} params - Query parameters (module, action, address, etc.)
 * @returns {string} Full API URL with query string
 */
export function buildApiUrl(chainId, params) {
  const normalizedChainId = String(chainId);
  const baseUrl = getApiUrl(normalizedChainId);
  const isRoutescan = isRoutescanChain(normalizedChainId);
  const apiKey = getNextApiKey();
  
  const queryParams = new URLSearchParams({
    ...params,
    apikey: apiKey
  });
  
  // Etherscan V2 API requires chainid parameter, Routescan doesn't
  if (!isRoutescan) {
    queryParams.set('chainid', normalizedChainId);
  }
  
  return `${baseUrl}?${queryParams.toString()}`;
}
