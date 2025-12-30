/**
 * Contract Name Service Module
 * 
 * Provides contract name lookup functionality for addresses without symbols.
 * Uses Etherscan API getsourcecode to fetch verified contract names.
 * 
 * Uses unified cache manager:
 * - Found names: permanent cache (no expiration)
 * - Not found: handled at lookup time (not cached)
 * 
 * Features:
 * - Etherscan V2 API for contract name lookup
 * - Unified cache manager integration
 * - Cache key: chainId + address
 */

import { log } from './abi-utils.js';
import { getNextApiKey, getApiUrl, isRoutescanChain } from '../config/etherscan-api.js';
import { getContractCache, setContractCache } from './cache-manager.js';

/**
 * In-memory cache for "not found" entries to avoid repeated API calls.
 * @type {Map<string, number>}
 */
const notFoundCache = new Map();

/**
 * Cache expiration time for not found entries (1 hour in milliseconds).
 * @type {number}
 */
const NOT_FOUND_EXPIRY_MS = 60 * 60 * 1000;

/**
 * Get contract name from unified cache.
 * @param {string|number} chainId - The chain ID
 * @param {string} address - The contract address
 * @returns {{name: string}|null} Cache entry or null if not cached
 */
function getFromCache(chainId, address) {
  // Check in-memory "not found" cache
  const notFoundKey = `${chainId}:${address.toLowerCase()}`;
  const notFoundExpiry = notFoundCache.get(notFoundKey);
  if (notFoundExpiry && Date.now() < notFoundExpiry) {
    log('debug', 'contract-name', 'Not found (in-memory cache)', { chainId, address });
    return { name: null };
  }
  
  // Check unified cache
  const cached = getContractCache(chainId, address);
  if (cached && cached.name) {
    log('debug', 'contract-name', 'Found in cache', { chainId, address, name: cached.name });
    return { name: cached.name };
  }
  
  return null;
}

/**
 * Save contract name to unified cache.
 * @param {string|number} chainId - The chain ID
 * @param {string} address - The contract address
 * @param {string|null} name - The contract name or null if not found
 */
function saveToCache(chainId, address, name) {
  if (name) {
    // Save found name to unified cache
    setContractCache(chainId, address, { name });
    log('debug', 'contract-name', 'Saved to cache', { chainId, address, name });
  } else {
    // Save "not found" to in-memory cache (not persisted)
    const notFoundKey = `${chainId}:${address.toLowerCase()}`;
    notFoundCache.set(notFoundKey, Date.now() + NOT_FOUND_EXPIRY_MS);
    log('debug', 'contract-name', 'Marked as not found', { chainId, address });
  }
}

/**
 * Fetch contract names for addresses without symbols.
 * Filters addresses that already have symbols from contractInfoMap.
 * Uses cache first, then fetches from Etherscan API for uncached addresses.
 * 
 * @param {string[]} addresses - All addresses
 * @param {Map<string, {symbol: string|null}>} contractInfoMap - Map with symbol info
 * @param {string|number} chainId - The chain ID
 * @returns {Promise<Map<string, string>>} Map of address -> contract name
 */
async function fetchContractNames(addresses, contractInfoMap, chainId) {
  if (!addresses || addresses.length === 0) {
    return new Map();
  }

  // Filter addresses without symbols
  const addressesWithoutSymbol = addresses.filter(addr => {
    const info = contractInfoMap.get(addr);
    return !info || !info.symbol;
  });

  if (addressesWithoutSymbol.length === 0) {
    log('debug', 'contract-name', 'All addresses have symbols, skipping name lookup');
    return new Map();
  }

  log('info', 'contract-name', 'Checking contract names', {
    total: addresses.length,
    withoutSymbol: addressesWithoutSymbol.length
  });

  const nameMap = new Map();
  const uncachedAddresses = [];

  // Check cache first
  for (const address of addressesWithoutSymbol) {
    const cached = getFromCache(chainId, address);
    
    if (cached !== null) {
      // Cache hit (could be a name or null for not-found)
      if (cached.name) {
        nameMap.set(address, cached.name);
      }
      log('debug', 'contract-name', 'Cache hit', { address, name: cached.name });
    } else {
      // Cache miss, need to fetch
      uncachedAddresses.push(address);
    }
  }

  // If all addresses were cached, return early
  if (uncachedAddresses.length === 0) {
    log('info', 'contract-name', 'All names from cache', { count: nameMap.size });
    return nameMap;
  }

  log('info', 'contract-name', 'Fetching uncached names from Etherscan', { count: uncachedAddresses.length });

  // Fetch contract names from Etherscan API (in parallel with rate limiting)
  const results = await fetchNamesFromEtherscan(uncachedAddresses, chainId);

  // Process results and update cache
  for (const { address, name } of results) {
    if (name) {
      nameMap.set(address, name);
    }
    // Save to cache (both found and not-found)
    saveToCache(chainId, address, name);
  }

  log('info', 'contract-name', 'Contract name fetch complete', {
    fetched: uncachedAddresses.length,
    found: results.filter(r => r.name).length
  });

  return nameMap;
}

/**
 * Fetch contract names from Etherscan API.
 * Uses getsourcecode endpoint to get verified contract names.
 * Processes addresses in batches to avoid rate limiting.
 * 
 * @param {string[]} addresses - Addresses to fetch names for
 * @param {string|number} chainId - The chain ID
 * @returns {Promise<Array<{address: string, name: string|null}>>} Results array
 */
async function fetchNamesFromEtherscan(addresses, chainId) {
  const normalizedChainId = String(chainId);
  const apiUrl = getApiUrl(normalizedChainId);
  const isRoutescan = isRoutescanChain(normalizedChainId);
  
  const results = [];
  
  // Process in smaller batches to avoid rate limiting
  const BATCH_SIZE = 5;
  const DELAY_MS = 200; // Delay between batches
  
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    
    // Fetch batch in parallel
    const batchPromises = batch.map(address => 
      fetchSingleContractName(address, normalizedChainId, apiUrl, isRoutescan)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Add delay between batches (except for the last batch)
    if (i + BATCH_SIZE < addresses.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  
  return results;
}

/**
 * Proxy contract names that should trigger implementation lookup.
 * @type {string[]}
 */
const PROXY_CONTRACT_NAMES = [
  'Proxy',
  'TransparentUpgradeableProxy',
  'ERC1967Proxy',
  'BeaconProxy',
  'AdminUpgradeabilityProxy',
  'OwnedUpgradeabilityProxy',
  'InitializableAdminUpgradeabilityProxy'
];

/**
 * Check if a contract name indicates a proxy contract.
 * @param {string} name - The contract name
 * @returns {boolean} True if it's a proxy contract
 */
function isProxyContractName(name) {
  if (!name) return false;
  return PROXY_CONTRACT_NAMES.some(proxyName => 
    name === proxyName || name.endsWith(proxyName)
  );
}

/**
 * Fetch contract name for a single address from Etherscan.
 * If the contract is a proxy, also fetches the implementation contract name.
 * @param {string} address - The contract address
 * @param {string} chainId - The chain ID
 * @param {string} apiUrl - The API base URL
 * @param {boolean} isRoutescan - Whether using Routescan API
 * @returns {Promise<{address: string, name: string|null}>} Result object
 */
async function fetchSingleContractName(address, chainId, apiUrl, isRoutescan) {
  const apiKey = getNextApiKey();
  
  const fetchUrl = isRoutescan
    ? `${apiUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`
    : `${apiUrl}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
  
  try {
    const response = await fetch(fetchUrl);
    
    if (!response.ok) {
      log('debug', 'contract-name', 'API request failed', { address, status: response.status });
      return { address, name: null };
    }
    
    const data = await response.json();
    
    if (data.status === '1' && data.result && data.result[0]) {
      const contractInfo = data.result[0];
      const contractName = contractInfo.ContractName;
      
      // Check if contract is verified and has a name
      if (contractName && contractName !== '' && contractName !== 'Contract source code not verified') {
        
        // Check if it's a proxy contract and has implementation address
        const implAddress = contractInfo.Implementation;
        if (isProxyContractName(contractName) && implAddress && implAddress !== '') {
          log('debug', 'contract-name', 'Proxy detected, fetching implementation name', { 
            address, 
            proxyName: contractName,
            implementation: implAddress 
          });
          
          // Add delay before fetching implementation to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Fetch implementation contract name
          const implName = await fetchImplementationName(implAddress, chainId, apiUrl, isRoutescan);
          
          if (implName) {
            const combinedName = `${implName}(Proxy)`;
            log('debug', 'contract-name', 'Combined proxy name', { address, name: combinedName });
            return { address, name: combinedName };
          }
          
          // Implementation exists but couldn't get name, still mark as proxy
          log('debug', 'contract-name', 'Could not get implementation name, using proxy name', { address });
        }
        
        log('debug', 'contract-name', 'Found contract name', { address, name: contractName });
        return { address, name: contractName };
      }
    }
    
    log('debug', 'contract-name', 'Contract not verified', { address });
    return { address, name: null };
    
  } catch (e) {
    log('debug', 'contract-name', 'Failed to fetch contract name', { address, error: e.message });
    return { address, name: null };
  }
}

/**
 * Fetch contract name for an implementation address with retry logic.
 * @param {string} address - The implementation contract address
 * @param {string} chainId - The chain ID
 * @param {string} apiUrl - The API base URL
 * @param {boolean} isRoutescan - Whether using Routescan API
 * @param {number} retryCount - Current retry attempt (default 0)
 * @returns {Promise<string|null>} Contract name or null
 */
async function fetchImplementationName(address, chainId, apiUrl, isRoutescan, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 500; // Wait 500ms before retry
  
  const apiKey = getNextApiKey();
  
  const fetchUrl = isRoutescan
    ? `${apiUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`
    : `${apiUrl}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
  
  log('debug', 'contract-name', 'Fetching implementation', { address, retry: retryCount });
  
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      log('debug', 'contract-name', 'Implementation fetch failed', { address, status: response.status });
      return null;
    }
    
    const data = await response.json();
    
    // Check for rate limit (status: '0', message: 'NOTOK')
    if (data.status === '0' && data.message === 'NOTOK' && retryCount < MAX_RETRIES) {
      log('debug', 'contract-name', 'Rate limited, retrying...', { address, retry: retryCount + 1 });
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
      return fetchImplementationName(address, chainId, apiUrl, isRoutescan, retryCount + 1);
    }
    
    log('debug', 'contract-name', 'Implementation API response', { 
      address, 
      status: data.status, 
      message: data.message,
      contractName: data.result?.[0]?.ContractName
    });
    
    if (data.status === '1' && data.result && data.result[0]) {
      const contractInfo = data.result[0];
      const contractName = contractInfo.ContractName;
      
      if (contractName && contractName !== '' && contractName !== 'Contract source code not verified') {
        log('debug', 'contract-name', 'Got implementation name', { address, name: contractName });
        return contractName;
      }
    }
    
    return null;
  } catch (e) {
    log('debug', 'contract-name', 'Failed to fetch implementation name', { address, error: e.message });
    return null;
  }
}

/**
 * Update DOM elements with contract names.
 * Similar to updateAddressDisplays but for contract names.
 * Uses 'address-contract-name' class for styling.
 * 
 * @param {Map<string, string>} nameMap - Map of address -> contract name
 * @param {function(string): string[]} getElementIds - Function to get element IDs for an address
 */
function updateAddressWithNames(nameMap, getElementIds) {
  let updatedCount = 0;

  for (const [address, name] of nameMap) {
    if (!name) continue;

    const elementIds = getElementIds(address);

    for (const elementId of elementIds) {
      const element = document.getElementById(elementId);
      if (!element) {
        log('debug', 'contract-name', 'Element not found', { elementId });
        continue;
      }

      // Skip if already has symbol or contract name
      if (element.querySelector('.address-symbol') || element.querySelector('.address-contract-name')) {
        continue;
      }

      // Create contract name span element
      const nameSpan = document.createElement('span');
      nameSpan.className = 'address-contract-name';
      nameSpan.textContent = `(${name})`;
      nameSpan.title = name; // Full name on hover

      // Find the anchor element (link) within the container
      const linkElement = element.querySelector('a');

      if (linkElement) {
        // Insert name right after the link element
        const copyBtn = element.querySelector('.copy-btn');
        if (copyBtn) {
          element.insertBefore(nameSpan, copyBtn);
        } else if (linkElement.nextSibling) {
          linkElement.parentNode.insertBefore(nameSpan, linkElement.nextSibling);
        } else {
          element.appendChild(nameSpan);
        }
      } else {
        element.appendChild(nameSpan);
      }

      updatedCount++;
    }
  }

  log('info', 'contract-name', 'Updated address displays with names', { updatedCount });
}

// Export for ES modules
export {
  fetchContractNames,
  updateAddressWithNames,
  getFromCache,
  saveToCache
};
