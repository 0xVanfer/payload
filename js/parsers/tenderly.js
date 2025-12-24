/**
 * Tenderly Link Parser Module
 * 
 * Parses transaction and simulation links from Tenderly dashboard.
 * Supports multiple Tenderly URL formats:
 * - VNet transactions: /explorer/vnet/{vnetId}/tx/{txHash}
 * - Public simulations: /public/{account}/{project}/simulator/{simId}
 * - Standard transactions: /{account}/{project}/tx/{chainId}/{txHash}
 */

import { log } from '../core/abi-utils.js';

/**
 * Tenderly API base URL.
 */
const TENDERLY_API_BASE = 'https://api.tenderly.co/api/v1';

/**
 * Regex patterns for different Tenderly URL formats.
 */
const PATTERNS = {
  // VNet transaction: /explorer/vnet/{vnetId}/tx/{txHash}
  vnet: /\/explorer\/vnet\/([a-f0-9-]+)\/tx\/(0x[a-f0-9]+)/i,
  
  // Public simulation: /public/{account}/{project}/simulator/{simId}
  publicSimulator: /\/public\/([^\/]+)\/([^\/]+)\/simulator\/([a-f0-9-]+)/i,
  
  // Standard transaction: /{account}/{project}/tx/{chainId}/{txHash}
  standardTx: /\/([^\/]+)\/([^\/]+)\/tx\/(\d+)\/(0x[a-f0-9]+)/i,
  
  // Fork transaction: /([^\/]+)\/([^\/]+)\/fork\/([a-f0-9-]+)\/simulation\/([a-f0-9-]+)
  forkSimulation: /\/([^\/]+)\/([^\/]+)\/fork\/([a-f0-9-]+)\/simulation\/([a-f0-9-]+)/i,
};

/**
 * Check if a URL is from Tenderly.
 * @param {string} url - The URL to check
 * @returns {boolean} True if URL is from Tenderly
 */
function isTenderlyLink(url) {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    return parsed.host.includes('tenderly.co');
  } catch {
    return false;
  }
}

/**
 * Detect the type of Tenderly URL.
 * @param {string} url - The URL to analyze
 * @returns {{type: string, matches: RegExpMatchArray}|null} The detected type and matches
 */
function detectTenderlyUrlType(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    
    for (const [type, pattern] of Object.entries(PATTERNS)) {
      const matches = path.match(pattern);
      if (matches) {
        log('debug', 'tenderly', 'Detected URL type', { type, path });
        return { type, matches };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch VNet transaction data from Tenderly API.
 * @param {string} vnetId - The VNet identifier
 * @param {string} txHash - The transaction hash
 * @returns {Promise<Object>} The API response data
 */
async function fetchVnetTransaction(vnetId, txHash) {
  const url = `${TENDERLY_API_BASE}/testnets/public/${vnetId}/tx/${txHash}`;
  log('debug', 'tenderly', 'Fetching VNet transaction', { url });
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Fetch public simulation data from Tenderly API.
 * @param {string} account - The Tenderly account name
 * @param {string} project - The project name
 * @param {string} simId - The simulation identifier
 * @returns {Promise<Object>} The API response data
 */
async function fetchPublicSimulation(account, project, simId) {
  const url = `${TENDERLY_API_BASE}/public/account/${account}/project/${project}/simulate/${simId}`;
  log('debug', 'tenderly', 'Fetching public simulation', { url });
  
  // This endpoint requires a POST request with empty body
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    body: ''
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Parse a Tenderly link to extract transaction payload.
 * 
 * @param {string} url - The Tenderly URL
 * @returns {Promise<{success: boolean, payload?: string, chainId?: string, txHash?: string, error?: string}>}
 */
async function parseTenderlyLink(url) {
  log('info', 'tenderly', 'Parsing Tenderly link', { url });
  
  const detected = detectTenderlyUrlType(url);
  
  if (!detected) {
    return {
      success: false,
      error: 'Unrecognized Tenderly URL format'
    };
  }
  
  const { type, matches } = detected;
  
  try {
    switch (type) {
      case 'vnet': {
        const vnetId = matches[1];
        const txHash = matches[2];
        
        log('debug', 'tenderly', 'Parsing VNet transaction', { vnetId, txHash });
        
        const data = await fetchVnetTransaction(vnetId, txHash);
        
        // Extract payload from response - VNet uses fork_transaction structure
        const tx = data?.fork_transaction || data?.transaction || data;
        const payload = tx?.input || data?.input;
        
        if (!payload) {
          log('error', 'tenderly', 'API response structure', { keys: Object.keys(data || {}) });
          return {
            success: false,
            txHash,
            error: 'Could not find input data in API response'
          };
        }
        
        return {
          success: true,
          payload,
          txHash,
          chainId: tx?.network_id || data?.network_id,
          to: tx?.to || data?.to,
          from: tx?.from || data?.from,
          source: 'tenderly-vnet'
        };
      }
      
      case 'publicSimulator': {
        const account = matches[1];
        const project = matches[2];
        const simId = matches[3];
        
        log('debug', 'tenderly', 'Parsing public simulation', { account, project, simId });
        
        const data = await fetchPublicSimulation(account, project, simId);
        
        // Extract payload from simulation response
        const simulation = data?.simulation || data;
        const payload = simulation?.input || 
                       simulation?.transaction?.input ||
                       simulation?.transaction_info?.input;
        
        if (!payload) {
          return {
            success: false,
            error: 'Could not find input data in simulation response'
          };
        }
        
        return {
          success: true,
          payload,
          chainId: simulation?.network_id || simulation?.transaction?.network_id,
          to: simulation?.to || simulation?.transaction?.to,
          from: simulation?.from || simulation?.transaction?.from
        };
      }
      
      case 'standardTx': {
        const account = matches[1];
        const project = matches[2];
        const chainId = matches[3];
        const txHash = matches[4];
        
        log('debug', 'tenderly', 'Parsing standard transaction', { account, project, chainId, txHash });
        
        // For standard transactions, we might need authentication
        // Return partial result with chain info
        return {
          success: false,
          chainId,
          txHash,
          error: 'Standard Tenderly transactions require authentication. Please use the VNet or public simulation format, or enter payload manually.'
        };
      }
      
      case 'forkSimulation': {
        const account = matches[1];
        const project = matches[2];
        const forkId = matches[3];
        const simId = matches[4];
        
        log('debug', 'tenderly', 'Parsing fork simulation', { account, project, forkId, simId });
        
        // Fork simulations typically require authentication
        return {
          success: false,
          error: 'Fork simulations require authentication. Please use the VNet or public simulation format, or enter payload manually.'
        };
      }
      
      default:
        return {
          success: false,
          error: `Unsupported Tenderly URL type: ${type}`
        };
    }
    
  } catch (e) {
    log('error', 'tenderly', 'Failed to parse Tenderly link', { error: e.message });
    return {
      success: false,
      error: `Failed to fetch from Tenderly: ${e.message}`
    };
  }
}

// Export for ES modules
export {
  isTenderlyLink,
  parseTenderlyLink,
  detectTenderlyUrlType,
  PATTERNS
};
