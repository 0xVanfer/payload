/**
 * Unified Cache Manager Module
 * 
 * Centralized cache management for all cached data in Payload Parser.
 * Uses browser localStorage with unified key prefix and structure.
 * 
 * Cache Structure:
 * - All keys prefixed with 'payload-parser-'
 * - Contract info: 'payload-parser-contract:{chainId}:{address}'
 *   - Stores: symbol, name, abi, isProxy, implementation, vnetDefault, customName
 * 
 * Special ChainId 0:
 * - ChainId 0 is a special "global" chain ID
 * - Addresses with chainId 0 apply to ALL chains
 * - Custom names defined with chainId 0 override all chain-specific names
 * - Only the cache manager UI can write to chainId 0
 * 
 * Features:
 * - Unified storage format for all address-related data
 * - No expiration for successfully fetched data
 * - Export/Import functionality
 * - Per-entry and bulk operations
 * - Global address definitions via chainId 0
 */

import { log } from './abi-utils.js';

/**
 * Global cache key prefix for all Payload Parser data.
 * @type {string}
 */
const CACHE_PREFIX = 'payload-parser-';

/**
 * Cache key prefix for contract/address related data.
 * @type {string}
 */
const CONTRACT_PREFIX = `${CACHE_PREFIX}contract:`;

/**
 * Contract cache entry structure.
 * @typedef {Object} ContractCacheEntry
 * @property {string|null} symbol - Token symbol (from RPC multicall)
 * @property {string|null} name - Verified contract name (from Etherscan)
 * @property {string|null} customName - User-defined custom name (highest priority)
 * @property {Object[]|null} abi - Contract ABI (from Etherscan)
 * @property {boolean} isProxy - Whether contract is a proxy
 * @property {string|null} implementation - Implementation address if proxy
 * @property {boolean} vnetDefault - Whether to show in VNet dropdown by default
 * @property {number} updatedAt - Last update timestamp
 */

/**
 * Global chain ID constant.
 * Addresses with this chainId apply to all chains.
 * @type {string}
 */
export const GLOBAL_CHAIN_ID = '0';

/**
 * Generate cache key for a contract entry.
 * @param {string|number} chainId - The chain ID
 * @param {string} address - The contract address
 * @returns {string} Cache key
 */
function getContractCacheKey(chainId, address) {
  return `${CONTRACT_PREFIX}${chainId}:${address.toLowerCase()}`;
}

/**
 * Parse a contract cache key to extract chainId and address.
 * @param {string} key - The cache key
 * @returns {{chainId: string, address: string}|null} Parsed key or null if invalid
 */
function parseContractCacheKey(key) {
  if (!key.startsWith(CONTRACT_PREFIX)) return null;
  
  const rest = key.slice(CONTRACT_PREFIX.length);
  const colonIndex = rest.indexOf(':');
  if (colonIndex === -1) return null;
  
  return {
    chainId: rest.slice(0, colonIndex),
    address: rest.slice(colonIndex + 1)
  };
}

/**
 * Get contract info from cache.
 * @param {string|number} chainId - The chain ID
 * @param {string} address - The contract address
 * @returns {ContractCacheEntry|null} Cache entry or null
 */
export function getContractCache(chainId, address) {
  try {
    const key = getContractCacheKey(chainId, address);
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    return JSON.parse(cached);
  } catch (e) {
    log('debug', 'cache-manager', 'Failed to read from cache', { error: e.message });
    return null;
  }
}

/**
 * Get the display name for an address with priority lookup.
 * Priority order:
 * 1. customName from chainId 0 (global)
 * 2. customName from specific chainId
 * 3. symbol from specific chainId cache
 * 4. name from chainId 0 (global)
 * 5. name from specific chainId cache
 * 
 * @param {string|number} chainId - The specific chain ID
 * @param {string} address - The contract address
 * @returns {{displayName: string|null, source: string|null}} Display name and its source
 */
export function getAddressDisplayName(chainId, address) {
  try {
    const normalizedAddress = address.toLowerCase();
    const chainIdStr = String(chainId);
    
    // 1. Check global (chainId 0) customName
    const globalCache = getContractCache(GLOBAL_CHAIN_ID, normalizedAddress);
    if (globalCache?.customName) {
      return { displayName: globalCache.customName, source: 'global-custom' };
    }
    
    // 2. Check specific chainId customName
    const chainCache = getContractCache(chainIdStr, normalizedAddress);
    if (chainCache?.customName) {
      return { displayName: chainCache.customName, source: 'chain-custom' };
    }
    
    // 3. Check specific chainId symbol
    if (chainCache?.symbol) {
      return { displayName: chainCache.symbol, source: 'chain-symbol' };
    }
    
    // 4. Check global (chainId 0) name
    if (globalCache?.name) {
      return { displayName: globalCache.name, source: 'global-name' };
    }
    
    // 5. Check specific chainId name
    if (chainCache?.name) {
      return { displayName: chainCache.name, source: 'chain-name' };
    }
    
    return { displayName: null, source: null };
  } catch (e) {
    log('debug', 'cache-manager', 'Failed to get display name', { error: e.message });
    return { displayName: null, source: null };
  }
}

/**
 * Get cached symbol for an address.
 * Only checks the specific chainId (not global chainId 0).
 * 
 * @param {string|number} chainId - The chain ID
 * @param {string} address - The contract address
 * @returns {string|null} The symbol or null
 */
export function getCachedSymbol(chainId, address) {
  try {
    const cached = getContractCache(chainId, address);
    return cached?.symbol || null;
  } catch (e) {
    return null;
  }
}

/**
 * Get cached name for an address with fallback to global.
 * Checks chainId 0 first, then specific chainId.
 * 
 * @param {string|number} chainId - The specific chain ID
 * @param {string} address - The contract address
 * @returns {{name: string|null, source: 'global'|'chain'|null}} The name and its source
 */
export function getCachedName(chainId, address) {
  try {
    const normalizedAddress = address.toLowerCase();
    
    // Check global first
    const globalCache = getContractCache(GLOBAL_CHAIN_ID, normalizedAddress);
    if (globalCache?.customName) {
      return { name: globalCache.customName, source: 'global' };
    }
    if (globalCache?.name) {
      return { name: globalCache.name, source: 'global' };
    }
    
    // Then check specific chain
    const chainCache = getContractCache(chainId, normalizedAddress);
    if (chainCache?.customName) {
      return { name: chainCache.customName, source: 'chain' };
    }
    if (chainCache?.name) {
      return { name: chainCache.name, source: 'chain' };
    }
    
    return { name: null, source: null };
  } catch (e) {
    return { name: null, source: null };
  }
}

/**
 * Save or update contract info in cache.
 * Merges new data with existing data (doesn't overwrite unspecified fields).
 * @param {string|number} chainId - The chain ID
 * @param {string} address - The contract address
 * @param {Partial<ContractCacheEntry>} data - Data to save/merge
 */
export function setContractCache(chainId, address, data) {
  try {
    const key = getContractCacheKey(chainId, address);
    
    // Get existing entry to merge
    const existing = getContractCache(chainId, address) || {};
    
    // Merge new data with existing
    const entry = {
      ...existing,
      ...data,
      updatedAt: Date.now()
    };
    
    localStorage.setItem(key, JSON.stringify(entry));
    log('debug', 'cache-manager', 'Saved to cache', { chainId, address });
  } catch (e) {
    log('error', 'cache-manager', 'Failed to save to cache', { error: e.message });
  }
}

/**
 * Delete a single contract cache entry.
 * @param {string|number} chainId - The chain ID
 * @param {string} address - The contract address
 * @returns {boolean} True if deleted
 */
export function deleteContractCache(chainId, address) {
  try {
    const key = getContractCacheKey(chainId, address);
    localStorage.removeItem(key);
    log('debug', 'cache-manager', 'Deleted from cache', { chainId, address });
    return true;
  } catch (e) {
    log('error', 'cache-manager', 'Failed to delete from cache', { error: e.message });
    return false;
  }
}

/**
 * Get all contract cache entries.
 * @returns {Map<string, {chainId: string, address: string, data: ContractCacheEntry}>}
 */
export function getAllContractCache() {
  const result = new Map();
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(CONTRACT_PREFIX)) continue;
      
      const parsed = parseContractCacheKey(key);
      if (!parsed) continue;
      
      const cached = localStorage.getItem(key);
      if (!cached) continue;
      
      try {
        const data = JSON.parse(cached);
        result.set(key, {
          chainId: parsed.chainId,
          address: parsed.address,
          data
        });
      } catch (e) {
        // Skip invalid entries
      }
    }
  } catch (e) {
    log('error', 'cache-manager', 'Failed to get all cache', { error: e.message });
  }
  
  return result;
}

/**
 * Get all contract cache entries grouped by chain ID.
 * @returns {Object.<string, Array<{address: string, data: ContractCacheEntry}>>}
 */
export function getContractCacheByChain() {
  const allCache = getAllContractCache();
  const byChain = {};
  
  for (const [, entry] of allCache) {
    if (!byChain[entry.chainId]) {
      byChain[entry.chainId] = [];
    }
    byChain[entry.chainId].push({
      address: entry.address,
      data: entry.data
    });
  }
  
  // Sort each chain's entries by address
  for (const chainId in byChain) {
    byChain[chainId].sort((a, b) => a.address.localeCompare(b.address));
  }
  
  return byChain;
}

/**
 * Get addresses marked as VNet default for a specific chain.
 * @param {string|number} chainId - The chain ID
 * @returns {Array<{address: string, symbol: string|null, name: string|null}>}
 */
export function getVnetDefaultAddresses(chainId) {
  const chainIdStr = String(chainId);
  const result = [];
  
  const allCache = getAllContractCache();
  for (const [, entry] of allCache) {
    if (entry.chainId === chainIdStr && entry.data.vnetDefault) {
      result.push({
        address: entry.address,
        symbol: entry.data.symbol || null,
        name: entry.data.name || null
      });
    }
  }
  
  // Sort by symbol/name/address
  result.sort((a, b) => {
    const aLabel = a.symbol || a.name || a.address;
    const bLabel = b.symbol || b.name || b.address;
    return aLabel.localeCompare(bLabel);
  });
  
  return result;
}

/**
 * Clear all contract cache entries.
 * @returns {number} Number of entries removed
 */
export function clearAllContractCache() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CONTRACT_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    
    log('info', 'cache-manager', 'Cleared all contract cache', { entriesRemoved: keysToRemove.length });
    return keysToRemove.length;
  } catch (e) {
    log('error', 'cache-manager', 'Failed to clear cache', { error: e.message });
    return 0;
  }
}

/**
 * Clear all Payload Parser cache (includes future cache types).
 * @returns {number} Number of entries removed
 */
export function clearAllCache() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    
    log('info', 'cache-manager', 'Cleared all cache', { entriesRemoved: keysToRemove.length });
    return keysToRemove.length;
  } catch (e) {
    log('error', 'cache-manager', 'Failed to clear all cache', { error: e.message });
    return 0;
  }
}

/**
 * Export all cache data as JSON.
 * @returns {Object} Exportable cache data
 */
export function exportCache() {
  const contracts = {};
  const allCache = getAllContractCache();
  
  for (const [, entry] of allCache) {
    const chainKey = entry.chainId;
    if (!contracts[chainKey]) {
      contracts[chainKey] = {};
    }
    contracts[chainKey][entry.address] = entry.data;
  }
  
  return {
    version: 1,
    exportedAt: Date.now(),
    contracts
  };
}

/**
 * Import cache data from JSON (overwrites existing).
 * @param {Object} data - Exported cache data
 * @returns {{imported: number, errors: number}} Import result
 */
export function importCache(data) {
  let imported = 0;
  let errors = 0;
  
  try {
    if (!data || data.version !== 1 || !data.contracts) {
      throw new Error('Invalid cache data format');
    }
    
    // Clear existing cache first
    clearAllContractCache();
    
    // Import new data
    for (const chainId in data.contracts) {
      const chainData = data.contracts[chainId];
      for (const address in chainData) {
        try {
          const key = getContractCacheKey(chainId, address);
          localStorage.setItem(key, JSON.stringify(chainData[address]));
          imported++;
        } catch (e) {
          errors++;
        }
      }
    }
    
    log('info', 'cache-manager', 'Imported cache', { imported, errors });
  } catch (e) {
    log('error', 'cache-manager', 'Failed to import cache', { error: e.message });
    errors++;
  }
  
  return { imported, errors };
}

/**
 * Get cache statistics.
 * @returns {{totalEntries: number, byChain: Object.<string, number>}}
 */
export function getCacheStats() {
  const byChain = {};
  let totalEntries = 0;
  
  const allCache = getAllContractCache();
  for (const [, entry] of allCache) {
    totalEntries++;
    byChain[entry.chainId] = (byChain[entry.chainId] || 0) + 1;
  }
  
  return { totalEntries, byChain };
}

// ============================================================================
// Migration utilities for old cache format
// ============================================================================

/**
 * Migrate old cache format to new unified format.
 * Reads from old prefixes and writes to new format.
 * @returns {{migrated: number, errors: number}} Migration result
 */
export function migrateOldCache() {
  let migrated = 0;
  let errors = 0;
  
  const oldPrefixes = [
    'contract-info:',
    'contract-name:',
    'contract-abi:'
  ];
  
  try {
    // Collect all old entries
    const oldEntries = new Map();
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      for (const prefix of oldPrefixes) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const colonIndex = rest.indexOf(':');
          if (colonIndex === -1) continue;
          
          const chainId = rest.slice(0, colonIndex);
          const address = rest.slice(colonIndex + 1).toLowerCase();
          const mapKey = `${chainId}:${address}`;
          
          if (!oldEntries.has(mapKey)) {
            oldEntries.set(mapKey, { chainId, address, data: {} });
          }
          
          try {
            const parsed = JSON.parse(localStorage.getItem(key));
            const entry = oldEntries.get(mapKey);
            
            if (prefix === 'contract-info:') {
              // Old format: { symbol, decimals, isContract }
              entry.data.symbol = parsed.symbol || entry.data.symbol;
              entry.data.decimals = parsed.decimals ?? entry.data.decimals;
            } else if (prefix === 'contract-name:') {
              // Old format: { name, expiry }
              if (parsed.name) {
                entry.data.name = parsed.name;
              }
            } else if (prefix === 'contract-abi:') {
              // Old format: { abi, isProxy, implementation }
              entry.data.abi = parsed.abi || entry.data.abi;
              entry.data.isProxy = parsed.isProxy || entry.data.isProxy;
              entry.data.implementation = parsed.implementation || entry.data.implementation;
            }
          } catch (e) {
            // Skip invalid entries
          }
          
          break;
        }
      }
    }
    
    // Write to new format
    for (const [, entry] of oldEntries) {
      try {
        // Only migrate if there's meaningful data
        if (entry.data.symbol || entry.data.name || entry.data.abi) {
          setContractCache(entry.chainId, entry.address, {
            ...entry.data,
            vnetDefault: false
          });
          migrated++;
        }
      } catch (e) {
        errors++;
      }
    }
    
    // Remove old entries after successful migration
    if (migrated > 0) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        for (const prefix of oldPrefixes) {
          if (key.startsWith(prefix)) {
            localStorage.removeItem(key);
            break;
          }
        }
      }
    }
    
    log('info', 'cache-manager', 'Migration complete', { migrated, errors });
  } catch (e) {
    log('error', 'cache-manager', 'Migration failed', { error: e.message });
    errors++;
  }
  
  return { migrated, errors };
}

/**
 * Check if old cache format exists and needs migration.
 * @returns {boolean} True if migration is needed
 */
export function needsMigration() {
  const oldPrefixes = ['contract-info:', 'contract-name:', 'contract-abi:'];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    for (const prefix of oldPrefixes) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
  }
  
  return false;
}
