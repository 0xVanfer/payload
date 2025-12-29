/**
 * Tuple Rendering Module
 * 
 * Handles rendering of complex tuple types with proper formatting
 * and nested structure display.
 */

import { log } from '../core/abi-utils.js';
import { 
  createUint256Display, 
  createAddressDisplay, 
  createBytesDisplay,
  formatBool 
} from './value-format.js';

/**
 * Global counters for generating unique IDs.
 */
let copyBtnCounter = 0;
let uint256Counter = 0;

/**
 * Reset the ID counters (call at start of each render).
 */
function resetCounters() {
  copyBtnCounter = 0;
  uint256Counter = 0;
}

/**
 * Get next unique ID for copy buttons.
 * @returns {string} Unique ID
 */
function nextCopyId() {
  return `copy-btn-${copyBtnCounter++}`;
}

/**
 * Get next unique ID for uint256 displays.
 * @returns {string} Unique ID
 */
function nextUint256Id() {
  return `uint256-${uint256Counter++}`;
}

/**
 * Split a tuple type string respecting nested parentheses.
 * @param {string} typeStr - The inner types string (e.g., "address,uint256,tuple(bytes,bool)")
 * @returns {string[]} Array of individual type strings
 */
function splitTupleTypes(typeStr) {
  const result = [];
  let depth = 0;
  let start = 0;
  
  for (let i = 0; i < typeStr.length; i++) {
    const char = typeStr[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      result.push(typeStr.slice(start, i).trim());
      start = i + 1;
    }
  }
  
  if (start < typeStr.length) {
    result.push(typeStr.slice(start).trim());
  }
  
  return result.filter(Boolean);
}

/**
 * Parse a tuple value into an array.
 * Handles both JSON format and legacy tuple string format.
 * @param {string|Array} value - The tuple value
 * @returns {Array} Parsed array
 */
function parseTupleValue(value) {
  if (Array.isArray(value)) {
    return value;
  }
  
  if (value === null || value === undefined) {
    return [];
  }
  
  const strValue = String(value).trim();
  
  // Try JSON parse first (preferred format)
  try {
    const parsed = JSON.parse(strValue);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // If parsed result is not array, wrap it
    return [parsed];
  } catch {
    // Not JSON, try legacy formats
  }
  
  // Handle legacy tuple format: (val1,val2,...)
  if (strValue.startsWith('(') && strValue.endsWith(')')) {
    return splitRespectingBrackets(strValue.slice(1, -1));
  }
  
  // Handle legacy array format: [val1,val2,...]
  if (strValue.startsWith('[') && strValue.endsWith(']')) {
    return splitRespectingBrackets(strValue.slice(1, -1));
  }
  
  // Simple comma-separated (for simple types only)
  return [strValue];
}

/**
 * Split a string by commas, respecting nested brackets and parentheses.
 * @param {string} str - The string to split
 * @returns {string[]} Array of split values
 */
function splitRespectingBrackets(str) {
  const result = [];
  let depth = 0;
  let start = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) {
      result.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }
  
  if (start < str.length) {
    result.push(str.slice(start).trim());
  }
  
  return result.filter(Boolean);
}

/**
 * Extract inner types from a tuple ABI type.
 * @param {string} abiType - The full ABI type (e.g., "tuple(address,uint256)[]")
 * @returns {string[]} Array of inner types
 */
function extractTupleInnerTypes(abiType) {
  // Match tuple(inner) or tuple(inner)[]
  const match = abiType.match(/^tuple\((.*)\)(?:\[\])?$/);
  if (match && match[1]) {
    return splitTupleTypes(match[1]);
  }
  return [];
}

/**
 * Render a single value based on its type.
 * @param {*} value - The value to render
 * @param {string} type - The ABI type
 * @param {string} explorerUrl - Block explorer URL
 * @returns {string} HTML string
 */
function renderValue(value, type, explorerUrl) {
  // Handle array types
  if (type.endsWith('[]')) {
    return renderArrayValue(value, type, explorerUrl);
  }
  
  // Handle tuple type
  if (type.startsWith('tuple')) {
    return renderTupleValue(value, type, explorerUrl);
  }
  
  // Handle address
  if (type === 'address') {
    return createAddressDisplay(String(value), explorerUrl, nextCopyId());
  }
  
  // Handle bytes types
  if (/^bytes\d*$/.test(type)) {
    return createBytesDisplay(String(value), nextCopyId());
  }
  
  // Handle uint types
  if (/^uint\d+$/.test(type)) {
    return createUint256Display(String(value), nextUint256Id());
  }
  
  // Handle int types
  if (/^int\d+$/.test(type)) {
    return `<span class="int-value">${value}</span>`;
  }
  
  // Handle bool
  if (type === 'bool') {
    return `<span class="bool-value">${formatBool(value)}</span>`;
  }
  
  // Handle string
  if (type === 'string') {
    return `<span class="string-value">${escapeHtml(String(value))}</span>`;
  }
  
  // Default
  return `<span class="default-value">${escapeHtml(String(value))}</span>`;
}

/**
 * Render an array value.
 * @param {*} value - The array value
 * @param {string} type - The array ABI type
 * @param {string} explorerUrl - Block explorer URL
 * @returns {string} HTML string
 */
function renderArrayValue(value, type, explorerUrl) {
  let arr = parseTupleValue(value);
  const innerType = type.replace(/\[\]$/, '');
  
  // Handle empty array
  if (!arr || arr.length === 0 || (arr.length === 1 && arr[0] === '')) {
    return '<span class="empty-array">[]</span>';
  }
  
  let html = '<div class="array-container">[</div>';
  
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const itemHtml = renderValue(item, innerType, explorerUrl);
    html += `<div class="array-item">${itemHtml}</div>`;
  }
  
  html += '<div class="array-container">]</div>';
  return html;
}

/**
 * Render a tuple value.
 * @param {*} value - The tuple value
 * @param {string} abiType - The tuple ABI type
 * @param {string} explorerUrl - Block explorer URL
 * @returns {string} HTML string
 */
function renderTupleValue(value, abiType, explorerUrl) {
  const arr = parseTupleValue(value);
  const types = extractTupleInnerTypes(abiType);
  
  // Handle empty tuple
  if (arr.length === 0 || (arr.length === 1 && arr[0] === '')) {
    return '<span class="empty-tuple">()</span>';
  }
  
  let html = '<div class="tuple-container">(</div>';
  
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const itemType = types[i] || '';
    const itemHtml = renderValue(item, itemType, explorerUrl);
    html += `<div class="tuple-item">${itemHtml}</div>`;
  }
  
  html += '<div class="tuple-container">)</div>';
  return html;
}

/**
 * Main entry point for rendering a tuple parameter.
 * @param {*} value - The tuple value
 * @param {string} abiType - The ABI type string
 * @param {string} explorerUrl - Block explorer base URL
 * @returns {string} HTML string
 */
function renderTuple(value, abiType, explorerUrl) {
  log('debug', 'tuple-render', 'Rendering tuple', { type: abiType, valueLength: String(value).length });
  
  try {
    return renderTupleValue(value, abiType, explorerUrl);
  } catch (e) {
    log('error', 'tuple-render', 'Error rendering tuple', { error: e.message });
    return `<span class="render-error">Error rendering: ${escapeHtml(String(value))}</span>`;
  }
}

/**
 * Escape HTML special characters.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Export for ES modules
export {
  renderTuple,
  renderValue,
  renderArrayValue,
  renderTupleValue,
  splitTupleTypes,
  parseTupleValue,
  extractTupleInnerTypes,
  resetCounters,
  nextCopyId,
  nextUint256Id
};
