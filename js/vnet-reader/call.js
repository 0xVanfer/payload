/**
 * VNet Reader Contract Call Module
 * 
 * Handles contract call execution, parameter collection, and result decoding.
 */

import { state } from './state.js';
import { isValidAddress, escapeHtml } from './utils.js';
import { addToSessionMethods } from './method.js';
import { addToSessionAddresses } from './address.js';
import { addToHistory } from './history.js';
import { findPresetBySignature } from '../config/presets.js';
import { getExplorerUrl } from '../config/chains.js';
import { checksumAddress } from '../core/abi-utils.js';

/**
 * Execute the contract call.
 * Automatically attempts to decode output based on:
 * 1. User-defined output types in the method signature
 * 2. Preset method output types if signature matches
 * 3. Falls back to raw hex if decoding fails
 */
export async function executeCall() {
  if (!state.provider) {
    showResult({ error: 'Not connected to RPC' });
    return;
  }
  
  if (!state.currentMethod) {
    showResult({ error: 'Please enter a valid method signature' });
    return;
  }
  
  const targetAddress = document.getElementById('target-address')?.value.trim();
  if (!isValidAddress(targetAddress)) {
    showResult({ error: 'Please enter a valid target address' });
    return;
  }
  
  // Collect parameters
  const params = collectParameters();
  if (params.error) {
    showResult({ error: params.error });
    return;
  }
  
  // Build call data
  const method = state.currentMethod;
  const signature = `${method.name}(${method.inputs.join(',')})`;
  
  // Determine output types
  let outputTypes = method.outputs;
  let outputSource = 'user';
  
  // If no output types specified, try to find from presets
  if (!outputTypes || outputTypes.length === 0) {
    const presetMethod = findPresetBySignature(signature);
    if (presetMethod && presetMethod.outputs) {
      // Parse preset outputs (format: "(type1,type2)")
      const outputMatch = presetMethod.outputs.match(/^\((.+)\)$/);
      if (outputMatch) {
        outputTypes = outputMatch[1].split(',').map(t => t.trim());
        outputSource = 'preset';
      }
    }
  }
  
  showResult({ loading: true });
  
  try {
    // Create interface and encode call
    const ifaceAbi = outputTypes && outputTypes.length > 0
      ? `function ${signature} returns (${outputTypes.join(',')})`
      : `function ${signature}`;
    
    const iface = new window.ethers.utils.Interface([ifaceAbi]);
    
    const callData = iface.encodeFunctionData(method.name, params.values);
    
    // Execute call
    const result = await state.provider.call({
      to: targetAddress,
      data: callData
    });
    
    // Decode result
    let decoded;
    let decodeSuccess = false;
    
    if (outputTypes && outputTypes.length > 0) {
      try {
        decoded = iface.decodeFunctionResult(method.name, result);
        // Convert to regular array/values for display
        decoded = formatDecodedResult(decoded, outputTypes);
        decodeSuccess = true;
      } catch (e) {
        console.warn('[VNet Reader] Decode with specified types failed:', e.message);
        // Fall through to raw result
      }
    }
    
    // If no output types or decoding failed, try common return types
    if (!decodeSuccess && result && result !== '0x') {
      decoded = tryAutoDecode(result);
      if (decoded !== null) {
        decodeSuccess = true;
        outputSource = 'auto';
      }
    }
    
    // Final fallback: raw hex
    if (!decodeSuccess) {
      decoded = result;
      outputSource = 'raw';
    }
    
    // Build full method signature with outputs
    const fullSignature = outputTypes && outputTypes.length > 0
      ? `${method.name}(${method.inputs.join(',')})(${outputTypes.join(',')})`
      : signature;
    
    // Show result
    showResult({ 
      success: true, 
      data: decoded, 
      raw: result,
      method: fullSignature,
      target: targetAddress,
      outputSource,
      outputTypes: outputTypes || []
    });
    
    // Add to history
    addToHistory({
      method: signature,
      target: targetAddress,
      params: params.display,
      result: decoded,
      timestamp: Date.now()
    });
    
    // Add method to session if custom
    addToSessionMethods(method);
    
    // Add address to session
    addToSessionAddresses(targetAddress);
    
  } catch (e) {
    console.error('[VNet Reader] Call failed:', e);
    showResult({ 
      error: `Call failed: ${e.reason || e.message}`,
      method: signature,
      target: targetAddress
    });
  }
}

/**
 * Collect parameter values from inputs.
 * Applies decimals conversion for numeric types if specified.
 * @returns {{values: any[], display: string[], error?: string}}
 */
function collectParameters() {
  const method = state.currentMethod;
  if (!method || method.inputs.length === 0) {
    return { values: [], display: [] };
  }
  
  const values = [];
  const display = [];
  
  const inputs = document.querySelectorAll('.param-input');
  for (let i = 0; i < method.inputs.length; i++) {
    const type = method.inputs[i];
    const input = inputs[i];
    
    if (!input) {
      return { error: `Missing input for parameter ${i}` };
    }
    
    const rawValue = input.value.trim();
    if (!rawValue && type !== 'string') {
      return { error: `Please provide value for parameter ${i} (${type})` };
    }
    
    try {
      // Check for decimals selector
      const decimalsSelect = document.querySelector(`.param-decimals-select[data-param-index="${i}"]`);
      const decimals = decimalsSelect ? parseInt(decimalsSelect.value, 10) : 0;
      
      const parsed = parseParamValue(rawValue, type, decimals);
      values.push(parsed);
      
      // Display includes decimals info if applied
      if (decimals > 0) {
        display.push(`${rawValue} (×10^${decimals})`);
      } else {
        display.push(rawValue);
      }
    } catch (e) {
      return { error: `Invalid value for parameter ${i} (${type}): ${e.message}` };
    }
  }
  
  return { values, display };
}

/**
 * Parse a parameter value according to its type.
 * Supports decimals conversion for numeric types.
 * @param {string} value - The raw string value
 * @param {string} type - The Solidity type
 * @param {number} [decimals=0] - The decimals to multiply by (10^decimals)
 * @returns {any} The parsed value
 */
function parseParamValue(value, type, decimals = 0) {
  // Handle arrays
  if (type.includes('[]')) {
    try {
      const arr = JSON.parse(value);
      if (!Array.isArray(arr)) {
        throw new Error('Expected array');
      }
      const baseType = type.replace('[]', '');
      return arr.map(v => parseParamValue(String(v), baseType, decimals));
    } catch (e) {
      throw new Error('Invalid array format. Use JSON syntax: [value1, value2]');
    }
  }
  
  // Handle specific types
  if (type === 'bool') {
    return value.toLowerCase() === 'true';
  }
  
  if (type === 'address') {
    if (!isValidAddress(value)) {
      throw new Error('Invalid address');
    }
    return value;
  }
  
  if (type.startsWith('uint') || type.startsWith('int')) {
    // Handle hex values (no decimals conversion for hex)
    if (value.startsWith('0x')) {
      return window.ethers.BigNumber.from(value);
    }
    
    // Handle decimal/float input with decimals conversion
    if (decimals > 0) {
      // Support decimal point input (e.g., "1.5" with 18 decimals)
      if (value.includes('.')) {
        const [intPart, fracPart = ''] = value.split('.');
        // Pad or truncate fractional part to match decimals
        const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
        const fullValue = intPart + paddedFrac;
        return window.ethers.BigNumber.from(fullValue);
      } else {
        // Integer input with decimals - multiply by 10^decimals
        const bn = window.ethers.BigNumber.from(value);
        const multiplier = window.ethers.BigNumber.from(10).pow(decimals);
        return bn.mul(multiplier);
      }
    }
    
    return window.ethers.BigNumber.from(value);
  }
  
  if (type.startsWith('bytes')) {
    if (!value.startsWith('0x')) {
      // Convert string to bytes
      return window.ethers.utils.toUtf8Bytes(value);
    }
    return value;
  }
  
  // Default: return as-is for string and other types
  return value;
}

/**
 * Try to automatically decode a raw result by testing common return types.
 * @param {string} result - The raw hex result
 * @returns {any} Decoded value or null if all attempts fail
 */
function tryAutoDecode(result) {
  if (!result || result === '0x') return null;
  
  const ethers = window.ethers;
  
  // Common return type patterns to try, in order of likelihood
  const typesToTry = [
    // Single values
    'uint256',
    'bool',
    'address',
    'string',
    'bytes32',
    'bytes',
    // Tuples/arrays
    '(uint256,uint256)',
    '(address,uint256)',
    'uint256[]',
    'address[]'
  ];
  
  for (const type of typesToTry) {
    try {
      const abiCoder = ethers.utils.defaultAbiCoder;
      const decoded = abiCoder.decode([type], result);
      
      // Validate the decoded result makes sense
      const value = decoded[0];
      
      // For bool, check it's actually 0 or 1
      if (type === 'bool' && result.length === 66) {
        const numValue = ethers.BigNumber.from(result);
        if (!numValue.eq(0) && !numValue.eq(1)) {
          continue; // Not a valid bool
        }
      }
      
      // For address, validate format
      if (type === 'address') {
        if (!ethers.utils.isAddress(value)) {
          continue;
        }
      }
      
      // For string, check it decoded cleanly
      if (type === 'string') {
        if (typeof value !== 'string' || value.length === 0) {
          continue;
        }
        // Check for garbage characters (likely wrong decode)
        if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
          continue;
        }
      }
      
      // Format and return successful decode
      return {
        value: formatValue(value, type),
        detectedType: type
      };
      
    } catch (e) {
      // Try next type
      continue;
    }
  }
  
  return null;
}

/**
 * Format decoded result for display.
 * @param {any} decoded - The decoded result from ethers
 * @param {string[]} outputs - The output types
 * @returns {any} Formatted result
 */
function formatDecodedResult(decoded, outputs) {
  if (!decoded || outputs.length === 0) {
    return decoded;
  }
  
  // Single return value
  if (outputs.length === 1) {
    const value = decoded[0];
    return formatValue(value, outputs[0]);
  }
  
  // Multiple return values
  const result = {};
  for (let i = 0; i < outputs.length; i++) {
    result[`value${i}`] = formatValue(decoded[i], outputs[i]);
  }
  return result;
}

/**
 * Format a single value for display.
 * @param {any} value - The value
 * @param {string} type - The type
 * @returns {any} Formatted value
 */
function formatValue(value, type) {
  if (value === null || value === undefined) {
    return value;
  }
  
  // BigNumber to string
  if (window.ethers.BigNumber.isBigNumber(value)) {
    return value.toString();
  }
  
  // Array
  if (Array.isArray(value)) {
    return value.map((v, i) => {
      const baseType = type.replace('[]', '');
      return formatValue(v, baseType);
    });
  }
  
  return value;
}

/**
 * Format a value for rich HTML display based on its type.
 * @param {any} value - The value to format
 * @param {string} type - The Solidity type
 * @param {string} id - Unique ID prefix for interactive elements
 * @returns {string} HTML string
 */
function formatValueForDisplay(value, type, id) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return `<span class="result-value-null">null</span>`;
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    const baseType = type.replace(/\[\d*\]$/, '').replace('[]', '');
    const items = value.map((v, i) => formatValueForDisplay(v, baseType, `${id}-${i}`));
    return `<div class="result-array">[${items.join(', ')}]</div>`;
  }
  
  // Handle address type
  if (type === 'address' || (typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value))) {
    const checksummed = checksumAddress(value);
    const explorerUrl = getExplorerUrl(state.chainId);
    const link = explorerUrl 
      ? `<a href="${explorerUrl}/address/${checksummed}" target="_blank" rel="noopener">${checksummed}</a>`
      : checksummed;
    return `<span class="result-value-address">${link}</span>`;
  }
  
  // Handle uint/int types - add decimal selector
  if (type && (type.startsWith('uint') || type.startsWith('int'))) {
    const strValue = String(value);
    return `
      <span class="result-value-number">
        <span class="uint256-value">${escapeHtml(strValue)}</span>
        <select class="decimal-select" data-value="${escapeHtml(strValue)}" data-id="${id}">
          <option value="0">0</option>
          <option value="6">6</option>
          <option value="8">8</option>
          <option value="18">18</option>
        </select>
        <span class="formatted-value" id="${id}-result"></span>
      </span>
    `;
  }
  
  // Handle bool
  if (type === 'bool') {
    return `<span class="result-value-bool">${value ? 'true' : 'false'}</span>`;
  }
  
  // Handle bytes32 and other bytes types
  if (type && type.startsWith('bytes')) {
    return `<span class="result-value-bytes">${escapeHtml(String(value))}</span>`;
  }
  
  // Default: escape and display as string
  return `<span class="result-value-string">${escapeHtml(String(value))}</span>`;
}

/**
 * Format decoded result data for rich HTML display.
 * @param {any} data - The decoded data
 * @param {string[]} outputTypes - The output types
 * @param {string} idPrefix - ID prefix for interactive elements
 * @returns {string} HTML string
 */
function formatResultDataHtml(data, outputTypes, idPrefix) {
  if (data === null || data === undefined) {
    return '<span class="result-value-null">null</span>';
  }
  
  // Handle auto-detected result
  if (data && data.detectedType !== undefined) {
    return formatValueForDisplay(data.value, data.detectedType, `${idPrefix}-0`);
  }
  
  // Single value
  if (!outputTypes || outputTypes.length === 0) {
    return `<span class="result-value-raw">${escapeHtml(String(data))}</span>`;
  }
  
  if (outputTypes.length === 1) {
    return formatValueForDisplay(data, outputTypes[0], `${idPrefix}-0`);
  }
  
  // Multiple values (object with value0, value1, etc.)
  if (typeof data === 'object' && !Array.isArray(data)) {
    const entries = [];
    for (let i = 0; i < outputTypes.length; i++) {
      const key = `value${i}`;
      const val = data[key];
      const type = outputTypes[i];
      entries.push(`<div class="result-multi-value"><span class="result-key">${key} (${escapeHtml(type)}):</span> ${formatValueForDisplay(val, type, `${idPrefix}-${i}`)}</div>`);
    }
    return entries.join('');
  }
  
  return `<span class="result-value-raw">${escapeHtml(String(data))}</span>`;
}

/**
 * Initialize decimal selector event handlers after rendering.
 * @param {HTMLElement} container - The container element
 */
function initDecimalSelectors(container) {
  container.querySelectorAll('.decimal-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const decimals = parseInt(e.target.value, 10);
      const rawValue = e.target.dataset.value;
      const resultId = e.target.dataset.id + '-result';
      const resultSpan = document.getElementById(resultId);
      
      if (resultSpan && decimals > 0) {
        try {
          const num = BigInt(rawValue);
          const denom = BigInt('1' + '0'.repeat(decimals));
          const result = Number(num) / Number(denom);
          if (isFinite(result)) {
            resultSpan.textContent = '= ' + result.toFixed(6).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          } else {
            resultSpan.textContent = '';
          }
        } catch {
          resultSpan.textContent = '';
        }
      } else if (resultSpan) {
        resultSpan.textContent = '';
      }
    });
  });
}

/**
 * Show the call result.
 * @param {Object} result - The result object
 */
export function showResult(result) {
  const container = document.getElementById('call-result');
  if (!container) return;
  
  if (result.loading) {
    container.innerHTML = '<div class="result-loading">Calling...</div>';
    return;
  }
  
  if (result.error) {
    container.innerHTML = `
      <div class="result-error">
        <div class="result-error-title">Error</div>
        <div class="result-error-message">${escapeHtml(result.error)}</div>
        ${result.method ? `<div class="result-meta">Method: ${escapeHtml(result.method)}</div>` : ''}
        ${result.target ? `<div class="result-meta">Target: ${escapeHtml(result.target)}</div>` : ''}
      </div>
    `;
    return;
  }
  
  if (result.success) {
    // Format data based on source
    let sourceLabel = '';
    const outputTypes = result.outputTypes || [];
    const idPrefix = `result-${Date.now()}`;
    
    if (result.outputSource === 'auto' && result.data && result.data.detectedType) {
      sourceLabel = `<span class="result-source auto">Auto-detected: ${escapeHtml(result.data.detectedType)}</span>`;
    } else if (result.outputSource === 'preset') {
      sourceLabel = '<span class="result-source preset">Decoded from preset</span>';
    } else if (result.outputSource === 'raw') {
      sourceLabel = '<span class="result-source raw">Raw hex (decode failed)</span>';
    } else {
      sourceLabel = '<span class="result-source user">User-defined output</span>';
    }
    
    // Format result data with rich HTML
    const formattedDataHtml = result.outputSource === 'raw'
      ? `<span class="result-value-raw">${escapeHtml(String(result.data))}</span>`
      : formatResultDataHtml(result.data, outputTypes, idPrefix);
    
    container.innerHTML = `
      <div class="result-success">
        <div class="result-meta">
          <span>Method: ${escapeHtml(result.method)}</span>
          <span>Target: ${escapeHtml(result.target)}</span>
          ${sourceLabel}
        </div>
        <div class="result-data">
          ${formattedDataHtml}
        </div>
        <div class="result-raw">
          <details>
            <summary>Raw Result</summary>
            <code>${escapeHtml(result.raw)}</code>
          </details>
        </div>
      </div>
    `;
    
    // Initialize decimal selectors
    initDecimalSelectors(container);
    return;
  }
  
  container.innerHTML = '<p class="result-placeholder">Call result will appear here</p>';
}
