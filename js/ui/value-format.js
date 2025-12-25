/**
 * Value Formatting Utilities Module
 * 
 * Provides functions for formatting different value types
 * for display in the UI.
 * 
 * Integrates with address-collector for tracking addresses
 * across the rendered output.
 */

import { checksumAddress } from '../core/abi-utils.js';
import { 
  registerAddress, 
  generateAddressElementId 
} from '../core/address-collector.js';

/**
 * Format a uint256 value with decimal places.
 * @param {string|number|bigint} value - The raw value
 * @param {number} decimals - Number of decimal places (0, 6, 8, 18)
 * @returns {string} Formatted value with thousand separators
 */
function formatUint256(value, decimals = 18) {
  try {
    const num = BigInt(value);
    const denom = BigInt('1' + '0'.repeat(decimals));
    const result = Number(num) / Number(denom);
    
    if (!isFinite(result)) {
      return value.toString();
    }
    
    // Format with 6 decimal places and thousand separators
    return result.toFixed(6).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  } catch {
    return String(value);
  }
}

/**
 * Format an address as a link to a block explorer.
 * @param {string} address - The Ethereum address
 * @param {string} [explorerUrl] - Base URL of the explorer
 * @returns {string} HTML string with link or just the address
 */
function formatAddressAsLink(address, explorerUrl = '') {
  const checksummed = checksumAddress(address);
  
  if (explorerUrl) {
    const baseUrl = explorerUrl.replace(/\/$/, '');
    return `<a href="${baseUrl}/address/${checksummed}" target="_blank" rel="noopener">${checksummed}</a>`;
  }
  
  return checksummed;
}

/**
 * Format bytes data for display.
 * @param {string} value - The bytes value
 * @param {number} [maxLength=0] - Maximum length to display (0 for no limit)
 * @returns {string} Formatted bytes string
 */
function formatBytes(value, maxLength = 0) {
  const str = String(value);
  
  if (maxLength > 0 && str.length > maxLength) {
    return str.slice(0, maxLength) + '...';
  }
  
  return str;
}

/**
 * Format a hex value to decimal string.
 * @param {string} hexValue - The hex value (with or without 0x prefix)
 * @returns {string} Decimal string representation
 */
function hexToDecimal(hexValue) {
  try {
    let hex = hexValue.replace(/^0x/i, '');
    // Remove leading zeros but keep at least one digit
    hex = hex.replace(/^0+/, '') || '0';
    return BigInt('0x' + hex).toString(10);
  } catch {
    return '0';
  }
}

/**
 * Format a boolean value.
 * @param {boolean|string} value - The boolean value
 * @returns {string} 'true' or 'false'
 */
function formatBool(value) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value).toLowerCase() === 'true' ? 'true' : 'false';
}

/**
 * Detect appropriate decimal places for a uint256 value.
 * @param {string} value - The value to analyze
 * @returns {number} Suggested decimal places
 */
function detectDecimals(value) {
  const str = String(value);
  // If value is very large (> 14 digits), likely needs 18 decimals
  if (str.length >= 14) {
    return 18;
  }
  return 0;
}

/**
 * Generate HTML for a uint256 value with decimal selector.
 * @param {string} value - The uint256 value
 * @param {string} id - Unique ID for the elements
 * @returns {string} HTML string with value and selector
 */
function createUint256Display(value, id) {
  const defaultDecimals = detectDecimals(value);
  
  return `
    <span class="uint256-value">${value}</span>
    <select class="decimal-select" id="${id}-select" data-value="${value}">
      <option value="0" ${defaultDecimals === 0 ? 'selected' : ''}>0</option>
      <option value="6" ${defaultDecimals === 6 ? 'selected' : ''}>6</option>
      <option value="8" ${defaultDecimals === 8 ? 'selected' : ''}>8</option>
      <option value="18" ${defaultDecimals === 18 ? 'selected' : ''}>18</option>
    </select>
    <span class="formatted-value" id="${id}-result"></span>
  `;
}

/**
 * Generate HTML for an address with copy button.
 * Automatically registers the address with the address collector
 * for post-processing (symbol lookup, etc.).
 * 
 * @param {string} address - The address
 * @param {string} explorerUrl - Explorer base URL
 * @param {string} id - Unique ID for the copy button
 * @returns {string} HTML string with address display container
 */
function createAddressDisplay(address, explorerUrl, id) {
  const checksummed = checksumAddress(address);
  const link = formatAddressAsLink(checksummed, explorerUrl);
  
  // Generate a unique ID for the address container element
  // This ID is used to locate and update the element with symbol info
  const containerId = generateAddressElementId();
  
  // Register this address with its container ID for later symbol lookup
  registerAddress(checksummed, containerId);
  
  return `
    <span class="address-display" id="${containerId}" data-address="${checksummed}">
      ${link}
      <button type="button" class="copy-btn" id="${id}" data-value="${checksummed}">copy</button>
    </span>
  `;
}

/**
 * Generate HTML for bytes with copy button.
 * @param {string} value - The bytes value
 * @param {string} id - Unique ID for the button
 * @returns {string} HTML string
 */
function createBytesDisplay(value, id) {
  return `
    <span class="bytes-display">
      <span class="bytes-value">${value}</span>
      <button type="button" class="copy-btn" id="${id}" data-value="${value}">copy</button>
    </span>
  `;
}

// Export for ES modules
export {
  formatUint256,
  formatAddressAsLink,
  formatBytes,
  hexToDecimal,
  formatBool,
  detectDecimals,
  createUint256Display,
  createAddressDisplay,
  createBytesDisplay
};
