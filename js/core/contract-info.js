/**
 * Contract Info Service Module
 * 
 * Provides contract metadata lookup functionality using Multicall3.
 * Batch queries multiple addresses for symbol, decimals, and other
 * ERC20/token-related information in a single RPC call.
 * 
 * Features:
 * - Multicall3 batch queries for efficiency
 * - Supports symbol() and decimals() lookups
 * - Graceful error handling for non-contract addresses
 * - Extensible for additional contract calls
 * 
 * Note: Multicall3 is deployed at the same address on most EVM chains:
 * 0xcA11bde05977b3631167028862bE2a173976CA11
 */

import { log } from './abi-utils.js';
import { getRpcUrl } from '../config/chains.js';

/**
 * Multicall3 contract address (same on most EVM chains).
 * @type {string}
 */
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

/**
 * ERC20 function signatures for contract calls.
 * @type {Object}
 */
const ERC20_SIGNATURES = {
  symbol: '0x95d89b41',    // symbol()
  decimals: '0x313ce567',  // decimals()
  name: '0x06fdde03'       // name() - for future use
};

/**
 * ABI for Multicall3 tryAggregate function.
 * tryAggregate allows calls to fail without reverting the entire batch.
 * @type {string[]}
 */
const MULTICALL3_ABI = [
  'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[])'
];

/**
 * ABI fragments for decoding ERC20 responses.
 * @type {string[]}
 */
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)'
];

/**
 * Contract info result structure.
 * @typedef {Object} ContractInfo
 * @property {string} address - The contract address
 * @property {string|null} symbol - Token symbol or null if not available
 * @property {number|null} decimals - Token decimals or null if not available
 * @property {boolean} isContract - Whether the address is a contract with token interface
 */

/**
 * Fetch contract information (symbol, decimals) for multiple addresses.
 * Uses Multicall3 to batch all queries into a single RPC call.
 * 
 * @param {string[]} addresses - Array of addresses to query
 * @param {string|number} chainId - The chain ID to query
 * @returns {Promise<Map<string, ContractInfo>>} Map of address -> ContractInfo
 */
async function fetchContractInfo(addresses, chainId) {
  if (!addresses || addresses.length === 0) {
    log('debug', 'contract-info', 'No addresses to query');
    return new Map();
  }

  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) {
    log('warn', 'contract-info', 'No RPC URL configured for chain', { chainId });
    return new Map();
  }

  log('info', 'contract-info', 'Fetching contract info', { 
    addressCount: addresses.length, 
    chainId 
  });

  try {
    // Build multicall batch with symbol and decimals for each address
    const calls = buildMulticallBatch(addresses);
    
    // Execute multicall
    const results = await executeMulticall(rpcUrl, calls);
    
    // Parse results and build ContractInfo map
    return parseMulticallResults(addresses, results);
    
  } catch (e) {
    log('error', 'contract-info', 'Failed to fetch contract info', { error: e.message });
    return new Map();
  }
}

/**
 * Build multicall batch for symbol and decimals queries.
 * Creates 2 calls per address: symbol() and decimals().
 * 
 * @param {string[]} addresses - Array of addresses
 * @returns {Array<{target: string, callData: string}>} Array of call objects
 */
function buildMulticallBatch(addresses) {
  const calls = [];
  
  for (const address of addresses) {
    // Add symbol() call
    calls.push({
      target: address,
      callData: ERC20_SIGNATURES.symbol
    });
    
    // Add decimals() call
    calls.push({
      target: address,
      callData: ERC20_SIGNATURES.decimals
    });
  }
  
  return calls;
}

/**
 * Execute multicall via JSON-RPC.
 * Uses tryAggregate to allow individual calls to fail.
 * 
 * @param {string} rpcUrl - The RPC endpoint URL
 * @param {Array<{target: string, callData: string}>} calls - Array of call objects
 * @returns {Promise<Array<{success: boolean, returnData: string}>>} Call results
 */
async function executeMulticall(rpcUrl, calls) {
  const iface = new ethers.utils.Interface(MULTICALL3_ABI);
  
  // Encode the tryAggregate call
  // requireSuccess = false allows individual calls to fail
  const calldata = iface.encodeFunctionData('tryAggregate', [false, calls]);
  
  // Build JSON-RPC request
  const requestBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [
      {
        to: MULTICALL3_ADDRESS,
        data: calldata
      },
      'latest'
    ]
  };

  log('debug', 'contract-info', 'Executing multicall', { 
    callCount: calls.length,
    multicallAddress: MULTICALL3_ADDRESS 
  });

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  
  if (json.error) {
    throw new Error(`RPC error: ${json.error.message || JSON.stringify(json.error)}`);
  }

  // Decode the tryAggregate response
  const decoded = iface.decodeFunctionResult('tryAggregate', json.result);
  return decoded[0]; // Returns array of (success, returnData) tuples
}

/**
 * Parse multicall results into ContractInfo objects.
 * Handles decoding of symbol and decimals return data.
 * 
 * @param {string[]} addresses - Original addresses array
 * @param {Array<{success: boolean, returnData: string}>} results - Multicall results
 * @returns {Map<string, ContractInfo>} Map of address -> ContractInfo
 */
function parseMulticallResults(addresses, results) {
  const infoMap = new Map();
  const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
  
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const symbolIndex = i * 2;       // symbol result index
    const decimalsIndex = i * 2 + 1; // decimals result index
    
    const symbolResult = results[symbolIndex];
    const decimalsResult = results[decimalsIndex];
    
    const info = {
      address,
      symbol: null,
      decimals: null,
      isContract: false
    };
    
    // Try to decode symbol
    if (symbolResult && symbolResult.success && symbolResult.returnData !== '0x') {
      try {
        const decoded = erc20Interface.decodeFunctionResult('symbol', symbolResult.returnData);
        info.symbol = decoded[0];
        info.isContract = true;
      } catch (e) {
        // May fail if return data is not a valid string
        log('debug', 'contract-info', 'Failed to decode symbol', { address, error: e.message });
      }
    }
    
    // Try to decode decimals
    if (decimalsResult && decimalsResult.success && decimalsResult.returnData !== '0x') {
      try {
        const decoded = erc20Interface.decodeFunctionResult('decimals', decimalsResult.returnData);
        info.decimals = decoded[0];
        info.isContract = true;
      } catch (e) {
        log('debug', 'contract-info', 'Failed to decode decimals', { address, error: e.message });
      }
    }
    
    infoMap.set(address, info);
  }
  
  log('info', 'contract-info', 'Parsed contract info', { 
    total: addresses.length,
    withSymbol: Array.from(infoMap.values()).filter(i => i.symbol).length
  });
  
  return infoMap;
}

/**
 * Update DOM elements with contract info (symbol display).
 * Finds address elements by their IDs and appends symbol in parentheses.
 * Handles both address-display (with copy button) and called-address elements.
 * 
 * @param {Map<string, ContractInfo>} contractInfoMap - Map of address -> ContractInfo
 * @param {function(string): string[]} getElementIds - Function to get element IDs for an address
 */
function updateAddressDisplays(contractInfoMap, getElementIds) {
  let updatedCount = 0;
  
  for (const [address, info] of contractInfoMap) {
    // Skip addresses without symbol
    if (!info.symbol) {
      continue;
    }
    
    const elementIds = getElementIds(address);
    
    for (const elementId of elementIds) {
      const element = document.getElementById(elementId);
      if (!element) {
        log('debug', 'contract-info', 'Element not found', { elementId });
        continue;
      }
      
      // Check if symbol is already added
      if (element.querySelector('.address-symbol')) {
        continue;
      }
      
      // Create symbol span element
      const symbolSpan = document.createElement('span');
      symbolSpan.className = 'address-symbol';
      symbolSpan.textContent = `(${info.symbol})`;
      
      // Find the anchor element (link) within the container
      const linkElement = element.querySelector('a');
      
      if (linkElement) {
        // Insert symbol right after the link element
        if (linkElement.nextSibling) {
          linkElement.parentNode.insertBefore(symbolSpan, linkElement.nextSibling);
        } else {
          // Link is the last element, check for copy button
          const copyBtn = element.querySelector('.copy-btn');
          if (copyBtn) {
            element.insertBefore(symbolSpan, copyBtn);
          } else {
            element.appendChild(symbolSpan);
          }
        }
      } else {
        // No link element, just append to the container
        element.appendChild(symbolSpan);
      }
      
      updatedCount++;
    }
  }
  
  log('info', 'contract-info', 'Updated address displays', { updatedCount });
}

// Export for ES modules
export {
  MULTICALL3_ADDRESS,
  fetchContractInfo,
  updateAddressDisplays,
  buildMulticallBatch,
  parseMulticallResults
};
