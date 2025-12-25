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
 * VNet RPC base URL template.
 * Format: https://virtual.{network}.rpc.tenderly.co/{vnetId}
 * Default to mainnet, but can be adjusted based on network_id
 */
const VNET_RPC_BASE = 'https://virtual.mainnet.rpc.tenderly.co';

/**
 * Map of chain IDs to Tenderly RPC network names.
 */
const CHAIN_TO_NETWORK = {
  '1': 'mainnet',
  '10': 'optimism',
  '56': 'bsc',
  '100': 'gnosis',
  '137': 'polygon',
  '250': 'fantom',
  '324': 'zksync',
  '5000': 'mantle',
  '8453': 'base',
  '34443': 'mode',
  '42161': 'arbitrum',
  '43114': 'avalanche',
  '59144': 'linea',
  '81457': 'blast',
  '534352': 'scroll',
  '7777777': 'zora',
  '11155111': 'sepolia',
  '11155420': 'optimism-sepolia',
  '84532': 'base-sepolia',
  '421614': 'arbitrum-sepolia'
};

/**
 * Generate VNet RPC URL from vnetId and optional chainId.
 * @param {string} vnetId - The VNet identifier
 * @param {string} [chainId] - Optional chain ID to determine network
 * @returns {string} The VNet RPC URL
 */
function generateVnetRpcUrl(vnetId, chainId = '1') {
  const network = CHAIN_TO_NETWORK[chainId] || 'mainnet';
  return `https://virtual.${network}.rpc.tenderly.co/${vnetId}`;
}

/**
 * Regex patterns for different Tenderly URL formats.
 * Order matters - more specific patterns should come first.
 */
const PATTERNS = {
  // VNet transaction: /explorer/vnet/{vnetId}/tx/{txHash}
  vnet: /\/explorer\/vnet\/([a-f0-9-]+)\/tx\/(0x[a-f0-9]+)/i,
  
  // VNet transaction list: /explorer/vnet/{vnetId}/transactions or /explorer/vnet/{vnetId}
  vnetList: /\/explorer\/vnet\/([a-f0-9-]+)(?:\/transactions)?$/i,
  
  // Public simulation: /public/{account}/{project}/simulator/{simId}
  publicSimulator: /\/public\/([^\/]+)\/([^\/]+)\/simulator\/([a-f0-9-]+)/i,
  
  // Shared simulation: /shared/simulation/{simId}
  sharedSimulation: /\/shared\/simulation\/([a-f0-9-]+)/i,
  
  // Account simulation: /{account}/{project}/simulator/{simId}
  accountSimulator: /\/([^\/]+)\/([^\/]+)\/simulator\/([a-f0-9-]+)/i,
  
  // Fork simulation: /{account}/{project}/fork/{forkId}/simulation/{simId}
  forkSimulation: /\/([^\/]+)\/([^\/]+)\/fork\/([a-f0-9-]+)\/simulation\/([a-f0-9-]+)/i,
  
  // TestNet transaction (new format): /{account}/{project}/testnet/{testnetId}/tx/{txHash}
  testnetTx: /\/([^\/]+)\/([^\/]+)\/testnet\/([a-f0-9-]+)\/tx\/(0x[a-f0-9]+)/i,
  
  // TestNet list: /{account}/{project}/testnet/{testnetId}
  testnetList: /\/([^\/]+)\/([^\/]+)\/testnet\/([a-f0-9-]+)(?:\/transactions)?$/i,
  
  // Standard transaction: /{account}/{project}/tx/{chainId}/{txHash}
  standardTx: /\/([^\/]+)\/([^\/]+)\/tx\/(\d+)\/(0x[a-f0-9]+)/i,
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
 * Fetch VNet transaction list from Tenderly API.
 * @param {string} vnetId - The VNet identifier
 * @returns {Promise<Array>} The array of transactions
 */
async function fetchVnetTransactionList(vnetId) {
  const url = `${TENDERLY_API_BASE}/testnets/public/${vnetId}/transactions?offset=0&limit=100`;
  log('debug', 'tenderly', 'Fetching VNet transaction list', { url });
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://dashboard.tenderly.co',
      'Referer': 'https://dashboard.tenderly.co/'
    }
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  const data = await response.json();
  // API returns { fork_transactions: [...] }
  return data.fork_transactions || data || [];
}

/**
 * Process VNet transaction list and filter valid transactions.
 * @param {Array} transactions - Raw transaction list from API
 * @returns {Array<{hash: string, input: string, network_id: string, to: string, from: string}>} Filtered and sorted transactions
 */
function processVnetTransactionList(transactions) {
  if (!Array.isArray(transactions)) {
    return [];
  }
  
  // Filter transactions that have both project_id and hash (excluding vnet creation)
  const validTxs = transactions.filter(tx => {
    const hasProjectId = !!tx.project_id;
    const hasHash = !!tx.hash;
    const hasInput = !!tx.input && tx.input !== '0x';
    return hasProjectId && hasHash && hasInput;
  });
  
  // Reverse to get chronological order (API returns time descending)
  const chronologicalTxs = [...validTxs].reverse();
  
  log('debug', 'tenderly', 'Processed VNet transaction list', { 
    total: transactions.length, 
    valid: chronologicalTxs.length 
  });
  
  return chronologicalTxs;
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
 * Fetch shared simulation data from Tenderly API.
 * @param {string} simId - The simulation identifier
 * @returns {Promise<Object>} The API response data
 */
async function fetchSharedSimulation(simId) {
  const url = `${TENDERLY_API_BASE}/simulations/${simId}/share`;
  log('debug', 'tenderly', 'Fetching shared simulation', { url });
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
    }
  });
  
  if (!response.ok) {
    // Try alternative endpoint
    const altUrl = `${TENDERLY_API_BASE}/public/simulations/${simId}`;
    log('debug', 'tenderly', 'Trying alternative endpoint', { url: altUrl });
    
    const altResponse = await fetch(altUrl, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
      }
    });
    
    if (!altResponse.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    return await altResponse.json();
  }
  
  return await response.json();
}

/**
 * Fetch testnet transaction data from Tenderly API.
 * @param {string} account - The Tenderly account name
 * @param {string} project - The project name
 * @param {string} testnetId - The testnet identifier
 * @param {string} txHash - The transaction hash
 * @returns {Promise<Object>} The API response data
 */
async function fetchTestnetTransaction(account, project, testnetId, txHash) {
  // Try the testnets API endpoint
  const url = `${TENDERLY_API_BASE}/account/${account}/project/${project}/testnet/${testnetId}/tx/${txHash}`;
  log('debug', 'tenderly', 'Fetching testnet transaction', { url });
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
      }
    });
    
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    log('debug', 'tenderly', 'Primary endpoint failed, trying alternative');
  }
  
  // Fallback to public testnets API
  const publicUrl = `${TENDERLY_API_BASE}/testnets/public/${testnetId}/tx/${txHash}`;
  log('debug', 'tenderly', 'Trying public testnets endpoint', { url: publicUrl });
  
  const response = await fetch(publicUrl, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
    }
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Fetch testnet transaction list from Tenderly API.
 * @param {string} account - The Tenderly account name
 * @param {string} project - The project name
 * @param {string} testnetId - The testnet identifier
 * @returns {Promise<Array>} The array of transactions
 */
async function fetchTestnetTransactionList(account, project, testnetId) {
  // Try the testnets API endpoint
  const url = `${TENDERLY_API_BASE}/account/${account}/project/${project}/testnet/${testnetId}/transactions?offset=0&limit=100`;
  log('debug', 'tenderly', 'Fetching testnet transaction list', { url });
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.fork_transactions || data.transactions || data || [];
    }
  } catch (e) {
    log('debug', 'tenderly', 'Primary endpoint failed, trying alternative');
  }
  
  // Fallback to public testnets API
  const publicUrl = `${TENDERLY_API_BASE}/testnets/public/${testnetId}/transactions?offset=0&limit=100`;
  log('debug', 'tenderly', 'Trying public testnets endpoint', { url: publicUrl });
  
  const response = await fetch(publicUrl, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
    }
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.fork_transactions || data.transactions || data || [];
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
      case 'vnetList': {
        const vnetId = matches[1];
        
        log('debug', 'tenderly', 'Parsing VNet transaction list', { vnetId });
        
        const data = await fetchVnetTransactionList(vnetId);
        const transactions = processVnetTransactionList(data);
        
        // Generate VNet RPC URL regardless of transaction count
        // So the "Read on VNet" button can still be shown
        const defaultChainId = transactions.length > 0 ? (transactions[0].network_id || '1') : '1';
        const vnetRpcUrl = generateVnetRpcUrl(vnetId, defaultChainId);
        
        if (transactions.length === 0) {
          return {
            success: false,
            error: 'No valid transactions found in VNet',
            vnetId,
            vnetRpcUrl,
            chainId: defaultChainId
          };
        }
        
        // If only one transaction, return as single payload
        if (transactions.length === 1) {
          const tx = transactions[0];
          return {
            success: true,
            payload: tx.input,
            txHash: tx.hash,
            chainId: tx.network_id,
            to: tx.to,
            from: tx.from,
            source: 'tenderly-vnet',
            vnetId,
            vnetRpcUrl
          };
        }
        
        // Multiple transactions - return as vnet transaction list
        const payloads = transactions.map(tx => ({
          payload: tx.input,
          txHash: tx.hash,
          chainId: tx.network_id,
          to: tx.to,
          from: tx.from
        }));
        
        return {
          success: true,
          isMultiple: true,
          payloads,
          chainId: defaultChainId,
          source: 'tenderly-vnet-list',
          label: 'VNet Transactions',
          vnetId,
          vnetRpcUrl
        };
      }
      
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
        
        const chainId = tx?.network_id || data?.network_id || '1';
        const vnetRpcUrl = generateVnetRpcUrl(vnetId, chainId);
        
        return {
          success: true,
          payload,
          txHash,
          chainId,
          to: tx?.to || data?.to,
          from: tx?.from || data?.from,
          source: 'tenderly-vnet',
          vnetId,
          vnetRpcUrl
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
      
      case 'sharedSimulation': {
        const simId = matches[1];
        
        log('debug', 'tenderly', 'Parsing shared simulation', { simId });
        
        const data = await fetchSharedSimulation(simId);
        
        const simulation = data?.simulation || data;
        const payload = simulation?.input || 
                       simulation?.transaction?.input ||
                       simulation?.transaction_info?.input;
        
        if (!payload) {
          return {
            success: false,
            error: 'Could not find input data in shared simulation response'
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
      
      case 'accountSimulator': {
        const account = matches[1];
        const project = matches[2];
        const simId = matches[3];
        
        log('debug', 'tenderly', 'Parsing account simulation', { account, project, simId });
        
        // Try public API first (works for public simulations)
        try {
          const data = await fetchPublicSimulation(account, project, simId);
          
          const simulation = data?.simulation || data;
          const payload = simulation?.input || 
                         simulation?.transaction?.input ||
                         simulation?.transaction_info?.input;
          
          if (payload) {
            return {
              success: true,
              payload,
              chainId: simulation?.network_id || simulation?.transaction?.network_id,
              to: simulation?.to || simulation?.transaction?.to,
              from: simulation?.from || simulation?.transaction?.from
            };
          }
        } catch (e) {
          log('debug', 'tenderly', 'Public API failed, simulation may require auth');
        }
        
        return {
          success: false,
          error: 'This simulation may require authentication. Please use the VNet or public simulation format, or enter payload manually.'
        };
      }
      
      case 'testnetTx': {
        const account = matches[1];
        const project = matches[2];
        const testnetId = matches[3];
        const txHash = matches[4];
        
        log('debug', 'tenderly', 'Parsing testnet transaction', { account, project, testnetId, txHash });
        
        const data = await fetchTestnetTransaction(account, project, testnetId, txHash);
        
        const tx = data?.fork_transaction || data?.transaction || data;
        const payload = tx?.input || data?.input;
        
        if (!payload) {
          return {
            success: false,
            txHash,
            error: 'Could not find input data in testnet transaction response'
          };
        }
        
        const chainId = tx?.network_id || data?.network_id || '1';
        const vnetRpcUrl = generateVnetRpcUrl(testnetId, chainId);
        
        return {
          success: true,
          payload,
          txHash,
          chainId,
          to: tx?.to || data?.to,
          from: tx?.from || data?.from,
          source: 'tenderly-testnet',
          vnetId: testnetId,
          vnetRpcUrl
        };
      }
      
      case 'testnetList': {
        const account = matches[1];
        const project = matches[2];
        const testnetId = matches[3];
        
        log('debug', 'tenderly', 'Parsing testnet transaction list', { account, project, testnetId });
        
        const data = await fetchTestnetTransactionList(account, project, testnetId);
        const transactions = processVnetTransactionList(data);
        
        if (transactions.length === 0) {
          return {
            success: false,
            error: 'No valid transactions found in testnet'
          };
        }
        
        const defaultChainId = transactions[0].network_id || '1';
        const vnetRpcUrl = generateVnetRpcUrl(testnetId, defaultChainId);
        
        if (transactions.length === 1) {
          const tx = transactions[0];
          return {
            success: true,
            payload: tx.input,
            txHash: tx.hash,
            chainId: tx.network_id,
            to: tx.to,
            from: tx.from,
            source: 'tenderly-testnet',
            vnetId: testnetId,
            vnetRpcUrl
          };
        }
        
        const payloads = transactions.map(tx => ({
          payload: tx.input,
          txHash: tx.hash,
          chainId: tx.network_id,
          to: tx.to,
          from: tx.from
        }));
        
        return {
          success: true,
          isMultiple: true,
          payloads,
          chainId: defaultChainId,
          source: 'tenderly-testnet-list',
          label: 'TestNet Transactions',
          vnetId: testnetId,
          vnetRpcUrl
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
  generateVnetRpcUrl,
  PATTERNS
};
