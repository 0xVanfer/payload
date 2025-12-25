/**
 * Address Collector Module
 * 
 * Collects and manages all addresses discovered during payload decoding.
 * Provides centralized storage for addresses with their DOM element IDs,
 * enabling post-processing operations like symbol/decimals lookup.
 * 
 * Architecture:
 * - Singleton pattern for global address collection
 * - Stores address -> element ID mappings
 * - Supports batch retrieval for multicall queries
 * - Extensible for future contract metadata lookups
 */

import { log, checksumAddress } from './abi-utils.js';

/**
 * Internal storage for collected addresses.
 * Map structure: address (checksummed) -> Set of element IDs
 * Using Set to handle multiple occurrences of same address.
 * @type {Map<string, Set<string>>}
 */
let addressMap = new Map();

/**
 * Counter for generating unique element IDs.
 * @type {number}
 */
let elementIdCounter = 0;

/**
 * Reset the address collector.
 * Call this at the start of each new parse operation.
 */
function resetAddressCollector() {
  addressMap = new Map();
  elementIdCounter = 0;
  log('debug', 'address-collector', 'Address collector reset');
}

/**
 * Generate a unique element ID for an address element.
 * @returns {string} Unique element ID with 'addr-' prefix
 */
function generateAddressElementId() {
  return `addr-${elementIdCounter++}`;
}

/**
 * Register an address with its corresponding DOM element ID.
 * The address will be checksummed before storage.
 * 
 * @param {string} address - The Ethereum address to register
 * @param {string} elementId - The DOM element ID for this address instance
 * @returns {void}
 */
function registerAddress(address, elementId) {
  if (!address || typeof address !== 'string') {
    return;
  }

  // Validate address format (basic check for 0x + 40 hex chars)
  const cleanAddress = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/i.test(cleanAddress)) {
    log('debug', 'address-collector', 'Invalid address format, skipping', { address: cleanAddress });
    return;
  }

  try {
    const checksummed = checksumAddress(cleanAddress);
    
    if (!addressMap.has(checksummed)) {
      addressMap.set(checksummed, new Set());
    }
    
    addressMap.get(checksummed).add(elementId);
    log('debug', 'address-collector', 'Registered address', { address: checksummed, elementId });
  } catch (e) {
    log('warn', 'address-collector', 'Failed to register address', { address, error: e.message });
  }
}

/**
 * Get all unique addresses that have been collected.
 * @returns {string[]} Array of checksummed addresses
 */
function getAllAddresses() {
  return Array.from(addressMap.keys());
}

/**
 * Get all element IDs associated with a specific address.
 * @param {string} address - The address to look up (will be checksummed)
 * @returns {string[]} Array of element IDs for this address
 */
function getElementIdsForAddress(address) {
  if (!address) return [];
  
  try {
    const checksummed = checksumAddress(address);
    const elementIds = addressMap.get(checksummed);
    return elementIds ? Array.from(elementIds) : [];
  } catch {
    return [];
  }
}

/**
 * Get the total count of unique addresses collected.
 * @returns {number} Number of unique addresses
 */
function getAddressCount() {
  return addressMap.size;
}

/**
 * Get statistics about collected addresses.
 * Useful for debugging and logging.
 * @returns {{uniqueCount: number, totalElements: number}} Statistics object
 */
function getAddressStats() {
  let totalElements = 0;
  for (const elementIds of addressMap.values()) {
    totalElements += elementIds.size;
  }
  
  return {
    uniqueCount: addressMap.size,
    totalElements
  };
}

/**
 * Check if an address has been registered.
 * @param {string} address - The address to check
 * @returns {boolean} True if address is registered
 */
function hasAddress(address) {
  if (!address) return false;
  
  try {
    const checksummed = checksumAddress(address);
    return addressMap.has(checksummed);
  } catch {
    return false;
  }
}

// Export for ES modules
export {
  resetAddressCollector,
  generateAddressElementId,
  registerAddress,
  getAllAddresses,
  getElementIdsForAddress,
  getAddressCount,
  getAddressStats,
  hasAddress
};
