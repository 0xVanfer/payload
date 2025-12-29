/**
 * VNet Reader Utilities Module
 * 
 * Common utility functions used across the VNet Reader application.
 */

/**
 * Check if a string is a valid Ethereum address.
 * @param {string} address - The string to check
 * @returns {boolean} True if valid
 */
export function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

/**
 * Escape HTML special characters.
 * @param {string} str - The string to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Debounce a function.
 * @param {Function} func - The function to debounce
 * @param {number} wait - The wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format an address for display (abbreviated).
 * @param {string} address - The full address
 * @param {string} [symbol] - Optional symbol to prepend
 * @param {string} [contractName] - Optional contract name to prepend (used if no symbol)
 * @returns {string} Formatted string
 */
export function formatAddress(address, symbol = null, contractName = null) {
  if (symbol) {
    return `${symbol} (${address.slice(0, 6)}...${address.slice(-4)})`;
  }
  if (contractName) {
    return `${contractName} (${address.slice(0, 6)}...${address.slice(-4)})`;
  }
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}
