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
    
    // Execute calls in parallel: VNet and Production
    const callParams = { to: targetAddress, data: callData };
    
    const [vnetResult, productionResult] = await Promise.allSettled([
      state.provider.call(callParams),
      state.productionProvider 
        ? state.productionProvider.call(callParams).catch(e => {
            // Return error info instead of throwing
            return { __error: true, message: e.reason || e.message || 'Call failed' };
          })
        : Promise.resolve({ __error: true, message: 'No production provider' })
    ]);
    
    // Process VNet result
    const vnetData = processCallResult(vnetResult, iface, method, outputTypes);
    
    // Process Production result
    const prodData = processCallResult(productionResult, iface, method, outputTypes);
    
    // Determine final output source
    if (vnetData.decodeSuccess && vnetData.outputSource !== 'raw') {
      outputSource = vnetData.outputSource;
    } else if (!vnetData.decodeSuccess && outputTypes && outputTypes.length > 0) {
      outputSource = 'auto';
    } else if (!vnetData.decodeSuccess) {
      outputSource = 'raw';
    }
    
    // Build full method signature with outputs
    const fullSignature = outputTypes && outputTypes.length > 0
      ? `${method.name}(${method.inputs.join(',')})(${outputTypes.join(',')})`
      : signature;
    
    // Show result with comparison
    showResult({ 
      success: true,
      comparison: true,
      vnet: vnetData,
      production: prodData,
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
      result: vnetData.decoded,
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
 * Process the result of a contract call (from Promise.allSettled).
 * @param {PromiseSettledResult} settledResult - The settled promise result
 * @param {ethers.utils.Interface} iface - The ethers interface
 * @param {Object} method - The method object
 * @param {string[]} outputTypes - The output types
 * @returns {Object} Processed result with decoded data
 */
function processCallResult(settledResult, iface, method, outputTypes) {
  // Handle promise rejection
  if (settledResult.status === 'rejected') {
    return {
      error: true,
      message: settledResult.reason?.reason || settledResult.reason?.message || 'Call rejected',
      raw: null,
      decoded: null,
      decodeSuccess: false
    };
  }
  
  const result = settledResult.value;
  
  // Handle error object returned from catch
  if (result && result.__error) {
    return {
      error: true,
      message: result.message,
      raw: null,
      decoded: null,
      decodeSuccess: false
    };
  }
  
  // Decode result
  let decoded;
  let decodeSuccess = false;
  let currentOutputSource = 'user';
  
  if (outputTypes && outputTypes.length > 0) {
    try {
      decoded = iface.decodeFunctionResult(method.name, result);
      decoded = formatDecodedResult(decoded, outputTypes);
      decodeSuccess = true;
    } catch (e) {
      console.warn('[VNet Reader] Decode with specified types failed:', e.message);
    }
  }
  
  // Try auto-decode if needed
  if (!decodeSuccess) {
    if (outputTypes && outputTypes.length > 0 && result && result !== '0x') {
      decoded = tryAutoDecode(result);
      if (decoded !== null) {
        decodeSuccess = true;
        currentOutputSource = 'auto';
      }
    }
    
    if (!decodeSuccess) {
      decoded = result;
      currentOutputSource = 'raw';
    }
  }
  
  return {
    error: false,
    raw: result,
    decoded,
    decodeSuccess,
    outputSource: currentOutputSource
  };
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
 * @param {Object} [context] - Optional context for numeric index tracking
 * @param {number} [context.numericIndex] - The numeric field index for linking vnet/prod values
 * @param {string} [context.env] - The environment ('vnet' or 'prod')
 * @returns {string} HTML string
 */
function formatValueForDisplay(value, type, id, context = {}) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return `<span class="result-value-null">null</span>`;
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    const baseType = type.replace(/\[\d*\]$/, '').replace('[]', '');
    const items = value.map((v, i) => {
      // For arrays of numbers, each element gets its own numeric index
      const itemContext = { ...context };
      if (baseType.startsWith('uint') || baseType.startsWith('int')) {
        itemContext.numericIndex = (context.numericIndex ?? 0) + i;
      }
      return formatValueForDisplay(v, baseType, `${id}-${i}`, itemContext);
    });
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
  
  // Handle uint/int types - add decimal selector with numeric index for vnet/prod linking
  if (type && (type.startsWith('uint') || type.startsWith('int'))) {
    const strValue = String(value);
    const numericIndex = context.numericIndex ?? 0;
    const env = context.env || '';
    return `
      <span class="result-value-number" data-numeric-index="${numericIndex}" data-env="${env}">
        <span class="uint256-value">${escapeHtml(strValue)}</span>
        <select class="decimal-select" data-value="${escapeHtml(strValue)}" data-id="${id}" data-numeric-index="${numericIndex}" data-env="${env}">
          <option value="0">0</option>
          <option value="6">6</option>
          <option value="8">8</option>
          <option value="18">18</option>
        </select>
        <span class="formatted-value" id="${id}-result"></span>
        <span class="diff-value" id="${id}-diff"></span>
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
 * @param {string} [env] - The environment ('vnet' or 'prod') for linking numeric values
 * @returns {string} HTML string
 */
function formatResultDataHtml(data, outputTypes, idPrefix, env = '') {
  if (data === null || data === undefined) {
    return '<span class="result-value-null">null</span>';
  }
  
  // Track numeric field index for linking vnet/prod values
  let numericIndex = 0;
  
  /**
   * Helper to get context for a type.
   * For numeric types, assigns the current numericIndex.
   * For array types containing numerics, assigns the starting numericIndex.
   * @param {string} type - The Solidity type
   * @param {any} value - The value (needed for arrays to count elements)
   * @returns {Object} Context object with env and optionally numericIndex
   */
  function getContextForType(type, value) {
    const context = { env };
    const baseType = type ? type.replace(/\[\d*\]$/, '').replace('[]', '') : '';
    
    if (type && (type.startsWith('uint') || type.startsWith('int'))) {
      // Single numeric value
      context.numericIndex = numericIndex++;
    } else if (type && type.includes('[]') && (baseType.startsWith('uint') || baseType.startsWith('int'))) {
      // Array of numerics - assign starting index and reserve indices for all elements
      context.numericIndex = numericIndex;
      if (Array.isArray(value)) {
        numericIndex += value.length;
      } else {
        numericIndex++;
      }
    }
    return context;
  }
  
  // Handle auto-detected result
  if (data && data.detectedType !== undefined) {
    const context = getContextForType(data.detectedType, data.value);
    return formatValueForDisplay(data.value, data.detectedType, `${idPrefix}-0`, context);
  }
  
  // Single value
  if (!outputTypes || outputTypes.length === 0) {
    return `<span class="result-value-raw">${escapeHtml(String(data))}</span>`;
  }
  
  if (outputTypes.length === 1) {
    const context = getContextForType(outputTypes[0], data);
    return formatValueForDisplay(data, outputTypes[0], `${idPrefix}-0`, context);
  }
  
  // Multiple values (object with value0, value1, etc.)
  if (typeof data === 'object' && !Array.isArray(data)) {
    const entries = [];
    for (let i = 0; i < outputTypes.length; i++) {
      const key = `value${i}`;
      const val = data[key];
      const type = outputTypes[i];
      const context = getContextForType(type, val);
      entries.push(`<div class="result-multi-value"><span class="result-key">${key} (${escapeHtml(type)}):</span> ${formatValueForDisplay(val, type, `${idPrefix}-${i}`, context)}</div>`);
    }
    return entries.join('');
  }
  
  return `<span class="result-value-raw">${escapeHtml(String(data))}</span>`;
}

/**
 * Format a number value with decimals.
 * @param {string} rawValue - The raw numeric string
 * @param {number} decimals - The decimals to apply
 * @returns {string|null} The formatted value or null if invalid
 */
function formatNumberWithDecimals(rawValue, decimals) {
  if (decimals <= 0) return null;
  try {
    const num = BigInt(rawValue);
    const denom = BigInt('1' + '0'.repeat(decimals));
    const result = Number(num) / Number(denom);
    if (isFinite(result)) {
      return result.toFixed(6).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Calculate the difference between two numeric values and format it.
 * @param {string} vnetValue - VNet raw value
 * @param {string} prodValue - Production raw value
 * @param {number} decimals - The decimals to apply
 * @returns {{diff: string, isPositive: boolean, isZero: boolean}|null} The formatted difference or null
 */
function calculateDifference(vnetValue, prodValue, decimals) {
  try {
    const vnet = BigInt(vnetValue);
    const prod = BigInt(prodValue);
    const diff = vnet - prod;
    
    if (diff === 0n) {
      return { diff: '0', isPositive: true, isZero: true };
    }
    
    const isPositive = diff > 0n;
    const absDiff = isPositive ? diff : -diff;
    
    let diffStr;
    if (decimals > 0) {
      const denom = BigInt('1' + '0'.repeat(decimals));
      const result = Number(absDiff) / Number(denom);
      if (isFinite(result)) {
        diffStr = result.toFixed(6).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      } else {
        diffStr = absDiff.toString();
      }
    } else {
      diffStr = absDiff.toString();
    }
    
    return { diff: diffStr, isPositive, isZero: false };
  } catch {
    return null;
  }
}

/**
 * Update the difference display for a numeric field.
 * @param {HTMLElement} container - The container element
 * @param {number} numericIndex - The numeric field index
 * @param {number} decimals - The current decimals value
 */
function updateDiffDisplay(container, numericIndex, decimals) {
  const vnetSelect = container.querySelector(`.decimal-select[data-numeric-index="${numericIndex}"][data-env="vnet"]`);
  const prodSelect = container.querySelector(`.decimal-select[data-numeric-index="${numericIndex}"][data-env="prod"]`);
  
  if (!vnetSelect || !prodSelect) return;
  
  const vnetValue = vnetSelect.dataset.value;
  const prodValue = prodSelect.dataset.value;
  
  // Update diff display on vnet side
  const vnetDiffId = vnetSelect.dataset.id + '-diff';
  const vnetDiffSpan = document.getElementById(vnetDiffId);
  
  if (vnetDiffSpan) {
    // Check if values are different
    if (vnetValue !== prodValue) {
      const diffResult = calculateDifference(vnetValue, prodValue, decimals);
      if (diffResult && !diffResult.isZero) {
        const sign = diffResult.isPositive ? '+' : '-';
        const colorClass = diffResult.isPositive ? 'diff-positive' : 'diff-negative';
        vnetDiffSpan.innerHTML = `<span class="${colorClass}">(${sign}${diffResult.diff})</span>`;
      } else {
        vnetDiffSpan.textContent = '';
      }
    } else {
      vnetDiffSpan.textContent = '';
    }
  }
}

/**
 * Initialize decimal selector event handlers after rendering.
 * Implements linked decimals between vnet and prod values with the same numeric index.
 * @param {HTMLElement} container - The container element
 */
function initDecimalSelectors(container) {
  container.querySelectorAll('.decimal-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const decimals = parseInt(e.target.value, 10);
      const rawValue = e.target.dataset.value;
      const resultId = e.target.dataset.id + '-result';
      const resultSpan = document.getElementById(resultId);
      const numericIndex = e.target.dataset.numericIndex;
      const env = e.target.dataset.env;
      
      // Update formatted value for this selector
      if (resultSpan) {
        const formatted = formatNumberWithDecimals(rawValue, decimals);
        resultSpan.textContent = formatted ? `= ${formatted}` : '';
      }
      
      // Link decimals: update the corresponding selector in the other environment
      if (numericIndex !== undefined && env) {
        const otherEnv = env === 'vnet' ? 'prod' : 'vnet';
        const otherSelect = container.querySelector(
          `.decimal-select[data-numeric-index="${numericIndex}"][data-env="${otherEnv}"]`
        );
        
        if (otherSelect && otherSelect.value !== e.target.value) {
          // Update the other selector's value
          otherSelect.value = e.target.value;
          
          // Update the other selector's formatted result
          const otherResultId = otherSelect.dataset.id + '-result';
          const otherResultSpan = document.getElementById(otherResultId);
          if (otherResultSpan) {
            const otherFormatted = formatNumberWithDecimals(otherSelect.dataset.value, decimals);
            otherResultSpan.textContent = otherFormatted ? `= ${otherFormatted}` : '';
          }
        }
        
        // Update difference display
        updateDiffDisplay(container, numericIndex, decimals);
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
    container.innerHTML = '<div class="result-loading">Calling VNet and Production...</div>';
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
  
  if (result.success && result.comparison) {
    // Comparison mode: show VNet and Production side by side
    const outputTypes = result.outputTypes || [];
    const idPrefix = `result-${Date.now()}`;
    
    // Format source label
    let sourceLabel = '';
    if (result.outputSource === 'auto') {
      sourceLabel = `<span class="result-source auto">Auto-detected</span>`;
    } else if (result.outputSource === 'preset') {
      sourceLabel = '<span class="result-source preset">Decoded from preset</span>';
    } else if (result.outputSource === 'raw') {
      sourceLabel = '<span class="result-source raw">Raw hex</span>';
    } else {
      sourceLabel = '<span class="result-source user">User-defined output</span>';
    }
    
    // Build VNet result HTML with env tag for decimal linking
    const vnetHtml = buildEnvResultHtml(result.vnet, outputTypes, `${idPrefix}-vnet`, 'vnet');
    
    // Build Production result HTML with env tag for decimal linking
    const prodHtml = buildEnvResultHtml(result.production, outputTypes, `${idPrefix}-prod`, 'prod');
    
    // Check if values are different
    const isDifferent = checkValuesDifferent(result.vnet, result.production);
    const diffClass = isDifferent ? 'values-different' : 'values-same';
    
    container.innerHTML = `
      <div class="result-success result-comparison ${diffClass}">
        <div class="result-meta">
          <span>Method: ${escapeHtml(result.method)}</span>
          <span>Target: ${escapeHtml(result.target)}</span>
          ${sourceLabel}
        </div>
        <div class="comparison-container">
          <div class="comparison-column vnet-column">
            <div class="comparison-header">
              <span class="env-badge vnet">🔮 VNet</span>
              ${result.vnet.error ? '<span class="status-badge error">Failed</span>' : '<span class="status-badge success">OK</span>'}
            </div>
            <div class="comparison-content">
              ${vnetHtml}
            </div>
          </div>
          <div class="comparison-divider ${diffClass}">
            ${isDifferent ? '<span class="diff-indicator" title="Values differ">≠</span>' : '<span class="same-indicator" title="Values match">=</span>'}
          </div>
          <div class="comparison-column prod-column">
            <div class="comparison-header">
              <span class="env-badge prod">🌐 Production</span>
              ${result.production.error ? '<span class="status-badge error">Failed</span>' : '<span class="status-badge success">OK</span>'}
            </div>
            <div class="comparison-content">
              ${prodHtml}
            </div>
          </div>
        </div>
        <div class="result-raw">
          <details>
            <summary>Raw Results</summary>
            <div class="raw-comparison">
              <div class="raw-item">
                <strong>VNet:</strong>
                <code>${result.vnet.raw ? escapeHtml(result.vnet.raw) : 'N/A'}</code>
              </div>
              <div class="raw-item">
                <strong>Production:</strong>
                <code>${result.production.raw ? escapeHtml(result.production.raw) : 'N/A'}</code>
              </div>
            </div>
          </details>
        </div>
      </div>
    `;
    
    // Initialize decimal selectors
    initDecimalSelectors(container);
    return;
  }
  
  // Legacy single result mode (fallback)
  if (result.success) {
    const outputTypes = result.outputTypes || [];
    const idPrefix = `result-${Date.now()}`;
    
    let sourceLabel = '';
    if (result.outputSource === 'auto' && result.data && result.data.detectedType) {
      sourceLabel = `<span class="result-source auto">Auto-detected: ${escapeHtml(result.data.detectedType)}</span>`;
    } else if (result.outputSource === 'preset') {
      sourceLabel = '<span class="result-source preset">Decoded from preset</span>';
    } else if (result.outputSource === 'raw') {
      sourceLabel = '<span class="result-source raw">Raw hex (decode failed)</span>';
    } else {
      sourceLabel = '<span class="result-source user">User-defined output</span>';
    }
    
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
    
    initDecimalSelectors(container);
    return;
  }
  
  container.innerHTML = '<p class="result-placeholder">Call result will appear here</p>';
}

/**
 * Build HTML for a single environment result in comparison mode.
 * @param {Object} envResult - The environment result object
 * @param {string[]} outputTypes - The output types
 * @param {string} idPrefix - ID prefix for interactive elements
 * @param {string} [env] - The environment ('vnet' or 'prod') for linking numeric values
 * @returns {string} HTML string
 */
function buildEnvResultHtml(envResult, outputTypes, idPrefix, env = '') {
  if (envResult.error) {
    return `<div class="env-error">${escapeHtml(envResult.message)}</div>`;
  }
  
  if (envResult.outputSource === 'raw') {
    return `<span class="result-value-raw">${escapeHtml(String(envResult.decoded))}</span>`;
  }
  
  return formatResultDataHtml(envResult.decoded, outputTypes, idPrefix, env);
}

/**
 * Check if VNet and Production values are different.
 * @param {Object} vnetResult - VNet result object
 * @param {Object} prodResult - Production result object
 * @returns {boolean} True if values differ
 */
function checkValuesDifferent(vnetResult, prodResult) {
  // If either has error, consider them different
  if (vnetResult.error || prodResult.error) {
    // If both have errors, consider same (both failed)
    if (vnetResult.error && prodResult.error) {
      return false;
    }
    return true;
  }
  
  // Compare raw values if available
  if (vnetResult.raw && prodResult.raw) {
    return vnetResult.raw.toLowerCase() !== prodResult.raw.toLowerCase();
  }
  
  // Compare decoded values
  try {
    const vnetStr = JSON.stringify(vnetResult.decoded);
    const prodStr = JSON.stringify(prodResult.decoded);
    return vnetStr !== prodStr;
  } catch {
    return String(vnetResult.decoded) !== String(prodResult.decoded);
  }
}
