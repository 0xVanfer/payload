/**
 * VNet Reader ABI Fetcher Module
 * 
 * Fetches contract ABI from Etherscan API and parses it into method definitions.
 * Used to populate available methods for a selected contract address.
 */

import { state } from './state.js';
import { getNextApiKey, getApiUrl, isRoutescanChain } from '../config/etherscan-api.js';

/**
 * Fetch contract ABI from Etherscan API.
 * Supports proxy contracts by detecting implementation address.
 * @param {string} address - The contract address
 * @param {string} chainId - The chain ID
 * @returns {Promise<{abi: Object[]|null, isProxy: boolean, implementation: string|null}>}
 */
export async function fetchContractABI(address, chainId) {
  const normalizedChainId = String(chainId);
  const apiUrl = getApiUrl(normalizedChainId);
  const isRoutescan = isRoutescanChain(normalizedChainId);
  const apiKey = getNextApiKey();
  
  console.log('[ABI Fetcher] Fetching ABI', { address, chainId: normalizedChainId });
  
  try {
    // First, check if this is a proxy contract using getsourcecode
    const sourceCodeUrl = isRoutescan
      ? `${apiUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`
      : `${apiUrl}?chainid=${normalizedChainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
    
    const sourceResponse = await fetch(sourceCodeUrl);
    if (!sourceResponse.ok) {
      throw new Error(`API request failed: ${sourceResponse.status}`);
    }
    
    const sourceData = await sourceResponse.json();
    
    if (sourceData.status === '1' && sourceData.result && sourceData.result[0]) {
      const contractInfo = sourceData.result[0];
      
      // Check if it's a proxy contract
      if (contractInfo.Implementation && contractInfo.Implementation !== '') {
        const implAddress = contractInfo.Implementation;
        console.log('[ABI Fetcher] Detected proxy contract', { 
          proxy: address, 
          implementation: implAddress 
        });
        
        // Fetch the implementation contract's ABI
        const implAbi = await fetchImplementationABI(implAddress, normalizedChainId, apiUrl, isRoutescan);
        if (implAbi) {
          return { abi: implAbi, isProxy: true, implementation: implAddress };
        }
      }
      
      // Not a proxy, or implementation ABI not found - use the contract's own ABI
      if (contractInfo.ABI && contractInfo.ABI !== 'Contract source code not verified') {
        try {
          const abi = JSON.parse(contractInfo.ABI);
          console.log('[ABI Fetcher] Successfully fetched ABI', { 
            address, 
            methodCount: abi.filter(i => i.type === 'function').length 
          });
          return { abi, isProxy: false, implementation: null };
        } catch (e) {
          console.error('[ABI Fetcher] Failed to parse ABI', { error: e.message });
        }
      }
    }
    
    console.log('[ABI Fetcher] Contract not verified or ABI not available', { address });
    return { abi: null, isProxy: false, implementation: null };
    
  } catch (e) {
    console.error('[ABI Fetcher] Failed to fetch ABI', { address, error: e.message });
    return { abi: null, isProxy: false, implementation: null };
  }
}

/**
 * Fetch ABI for an implementation contract address.
 * @param {string} address - The implementation contract address
 * @param {string} chainId - The chain ID
 * @param {string} apiUrl - The API base URL
 * @param {boolean} isRoutescan - Whether using Routescan API
 * @returns {Promise<Object[]|null>} The ABI array or null
 */
async function fetchImplementationABI(address, chainId, apiUrl, isRoutescan) {
  const apiKey = getNextApiKey();
  
  const fetchUrl = isRoutescan
    ? `${apiUrl}?module=contract&action=getabi&address=${address}&apikey=${apiKey}`
    : `${apiUrl}?chainid=${chainId}&module=contract&action=getabi&address=${address}&apikey=${apiKey}`;
  
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status !== '1' || !data.result) {
      console.log('[ABI Fetcher] Implementation ABI not available', { address });
      return null;
    }
    
    const abi = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    console.log('[ABI Fetcher] Fetched implementation ABI', { 
      address, 
      methodCount: abi.filter(i => i.type === 'function').length 
    });
    
    return abi;
  } catch (e) {
    console.error('[ABI Fetcher] Failed to fetch implementation ABI', { address, error: e.message });
    return null;
  }
}

/**
 * Parse ABI into method definitions for use in method selector.
 * Only includes view/pure functions that can be called without sending transactions.
 * @param {Object[]} abi - The contract ABI
 * @param {string} address - The contract address (for reference)
 * @returns {Object[]} Array of method objects compatible with preset format
 */
export function parseABIToMethods(abi, address) {
  if (!Array.isArray(abi)) return [];
  
  const methods = [];
  
  for (const item of abi) {
    // Only include functions
    if (item.type !== 'function') continue;
    
    // Only include view/pure (read-only) functions
    if (item.stateMutability !== 'view' && item.stateMutability !== 'pure') continue;
    
    // Build signature
    const inputTypes = (item.inputs || []).map(i => formatParamType(i)).join(',');
    const signature = `${item.name}(${inputTypes})`;
    
    // Build outputs
    const outputTypes = (item.outputs || []).map(o => formatParamType(o)).join(',');
    const outputs = outputTypes ? `(${outputTypes})` : '';
    
    methods.push({
      name: item.name,
      signature,
      outputs,
      description: 'Read-only function',
      stateMutability: item.stateMutability,
      contractAddress: address,
      isFromABI: true
    });
  }
  
  // Sort methods alphabetically
  methods.sort((a, b) => a.name.localeCompare(b.name));
  
  return methods;
}

/**
 * Format a parameter type from ABI format.
 * Handles tuple types and arrays.
 * @param {Object} param - The parameter object from ABI
 * @returns {string} The formatted type string
 */
function formatParamType(param) {
  if (param.type === 'tuple' || param.type.startsWith('tuple[')) {
    // For tuple types, we need to recursively format components
    const components = (param.components || []).map(c => formatParamType(c)).join(',');
    const tupleType = `(${components})`;
    
    // Handle tuple arrays like tuple[] or tuple[5]
    if (param.type.startsWith('tuple[')) {
      const arrayPart = param.type.slice(5); // Get the [] or [n] part
      return tupleType + arrayPart;
    }
    return tupleType;
  }
  return param.type;
}

/**
 * Load contract ABI for an address and store methods in state.
 * Supports proxy contracts by automatically fetching implementation ABI.
 * @param {string} address - The contract address
 * @returns {Promise<boolean>} True if ABI was loaded successfully
 */
export async function loadContractABI(address) {
  if (!address || !state.chainId) return false;
  
  // Check if already loaded
  const normalizedAddress = address.toLowerCase();
  if (state.contractABIs[normalizedAddress]) {
    console.log('[ABI Fetcher] ABI already cached', { address });
    return true;
  }
  
  // Fetch ABI (handles proxy detection automatically)
  const { abi, isProxy, implementation } = await fetchContractABI(address, state.chainId);
  if (!abi) return false;
  
  // Parse into methods
  const methods = parseABIToMethods(abi, address);
  if (methods.length === 0) return false;
  
  // Store in state
  state.contractABIs[normalizedAddress] = {
    abi,
    methods,
    isProxy,
    implementation,
    loadedAt: Date.now()
  };
  
  console.log('[ABI Fetcher] Loaded contract methods', { 
    address, 
    methodCount: methods.length,
    isProxy,
    implementation
  });
  
  return true;
}

/**
 * Get methods for a specific contract address.
 * @param {string} address - The contract address
 * @returns {Object[]} Array of method objects, or empty array if not loaded
 */
export function getContractMethods(address) {
  if (!address) return [];
  const normalizedAddress = address.toLowerCase();
  return state.contractABIs[normalizedAddress]?.methods || [];
}

/**
 * Check if a contract's ABI has been loaded.
 * @param {string} address - The contract address
 * @returns {boolean} True if ABI is loaded
 */
export function hasContractABI(address) {
  if (!address) return false;
  const normalizedAddress = address.toLowerCase();
  return !!state.contractABIs[normalizedAddress];
}
