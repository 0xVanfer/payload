/**
 * Main Renderer Module
 * 
 * Handles rendering of decoded payload results into HTML.
 * Manages the main result table and recursive bytes decoding display.
 * Integrates with address collector for post-render symbol lookup.
 */

import { log, checksumAddress } from '../core/abi-utils.js';
import { getExplorerUrl } from '../config/chains.js';
import { 
  renderTuple, 
  renderValue, 
  splitTupleTypes, 
  resetCounters 
} from './tuple-render.js';
import { 
  createUint256Display, 
  createAddressDisplay, 
  createBytesDisplay,
  hexToDecimal 
} from './value-format.js';
import { initCopyHandlers, escapeHtml } from './copy-utils.js';
import { 
  resetAddressCollector, 
  registerAddress, 
  generateAddressElementId 
} from '../core/address-collector.js';

/**
 * Storage for uint256 elements that need calculator binding.
 */
let uint256Elements = [];

/**
 * Render the main results table from decoded payload.
 * Resets all counters and collectors before rendering.
 * 
 * @param {Array} decodedResults - Array of decoded call results
 * @param {string|number} chainId - The chain ID for explorer links
 * @param {Object} [options] - Additional options
 * @param {string} [options.from] - The caller address (from)
 * @param {string} [options.to] - The called contract address (to)
 * @returns {string} HTML string for the results table
 */
function renderResults(decodedResults, chainId, options = {}) {
  log('info', 'renderer', 'Rendering results', { count: decodedResults.length, chainId });
  
  // Reset counters for fresh IDs
  resetCounters();
  
  // Reset address collector for fresh address tracking
  resetAddressCollector();
  
  uint256Elements = [];
  
  const explorerUrl = getExplorerUrl(chainId);
  const { from: callerAddress, to: topLevelTo } = options;
  
  let html = `
    <div class="results-table-container">
      <table class="results-table">
        <colgroup>
          <col style="width: 22%;">
          <col style="width: 58%;">
          <col style="width: 20%;">
        </colgroup>
        <thead>
          <tr>
            <th class="col-function">Function & Addresses</th>
            <th class="col-params">Parameters</th>
            <th class="col-payload">Payload</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  for (let i = 0; i < decodedResults.length; i++) {
    const item = decodedResults[i];
    // Pass caller address only for the first (top-level) call
    const rowOptions = i === 0 ? { callerAddress, topLevelTo } : {};
    html += renderResultRow(item, explorerUrl, i, rowOptions);
  }
  
  html += `
        </tbody>
      </table>
    </div>
  `;
  
  return html;
}

/**
 * Render a single result row.
 * @param {Object} item - The decoded call item
 * @param {string} explorerUrl - Block explorer base URL
 * @param {number} index - Row index
 * @param {Object} [options] - Additional options
 * @param {string} [options.callerAddress] - The caller address (from)
 * @param {string} [options.topLevelTo] - The top-level called address
 * @returns {string} HTML string for the row
 */
function renderResultRow(item, explorerUrl, index, options = {}) {
  const { callerAddress, topLevelTo } = options;
  let html = `<tr class="result-row" data-index="${index}">`;
  
  // Function name and address column
  html += '<td class="col-function">';
  html += `<div class="function-name">${escapeHtml(item.functionName || 'unknown')}</div>`;
  
  // Show caller address (from) if available - only for top-level call
  if (callerAddress) {
    const fromAddr = checksumAddress(callerAddress);
    const fromElementId = generateAddressElementId();
    registerAddress(fromAddr, fromElementId);
    
    const fromLink = explorerUrl 
      ? `<a href="${explorerUrl}/address/${fromAddr}" target="_blank" rel="noopener">${fromAddr}</a>`
      : fromAddr;
    html += `<div class="caller-address" id="${fromElementId}" data-address="${fromAddr}"><span class="address-label">From:</span> ${fromLink}</div>`;
  }
  
  // Show called address (to)
  // Use item.calledAddress if available, otherwise fallback to topLevelTo for top-level call
  const calledAddr = item.calledAddress || topLevelTo;
  if (calledAddr) {
    const address = checksumAddress(calledAddr);
    
    // Generate unique ID for address tracking
    const addrElementId = generateAddressElementId();
    registerAddress(address, addrElementId);
    
    const link = explorerUrl 
      ? `<a href="${explorerUrl}/address/${address}" target="_blank" rel="noopener">${address}</a>`
      : address;
    html += `<div class="called-address" id="${addrElementId}" data-address="${address}"><span class="address-label">To:</span> ${link}</div>`;
  }
  
  if (item.error) {
    html += `<div class="decode-error">${escapeHtml(item.error)}</div>`;
  }
  
  html += '</td>';
  
  // Parameters column
  html += '<td class="col-params">';
  
  if (item.functionName === 'Call' && item.params && item.params.length > 0) {
    // Special handling for ETH transfer
    html += renderCallValue(item.params[0]);
  } else if (item.params && Array.isArray(item.params)) {
    html += renderParameters(item.params, explorerUrl);
  } else {
    html += '<span class="no-params">-</span>';
  }
  
  html += '</td>';
  
  // Payload column
  html += '<td class="col-payload">';
  html += `<div class="payload-value">${escapeHtml(item.payload || '')}</div>`;
  html += '</td>';
  
  html += '</tr>';
  return html;
}

/**
 * Render ETH call value with calculator.
 * @param {Object} param - The value parameter
 * @returns {string} HTML string
 */
function renderCallValue(param) {
  const hexValue = String(param.Value).replace(/^0x/i, '').replace(/^0+/, '') || '0';
  const decValue = hexToDecimal('0x' + hexValue);
  const calcId = `call-value-${Date.now()}`;
  
  uint256Elements.push({ value: decValue, calcId });
  
  return `
    <div class="call-value">
      <div class="param-label">Value:</div>
      <div class="value-hex">0x${hexValue}</div>
      <div class="value-decimal">${decValue}</div>
      <select class="decimal-select" id="${calcId}-select" data-value="${decValue}">
        <option value="0">0</option>
        <option value="6">6</option>
        <option value="8">8</option>
        <option value="18" selected>18</option>
      </select>
      <span class="formatted-value" id="${calcId}-result"></span>
    </div>
  `;
}

/**
 * Render all parameters for a decoded call.
 * @param {Array} params - Array of parameter objects
 * @param {string} explorerUrl - Block explorer base URL
 * @returns {string} HTML string
 */
function renderParameters(params, explorerUrl) {
  let html = '<div class="params-container">';
  
  for (const param of params) {
    html += renderParameter(param, explorerUrl);
  }
  
  html += '</div>';
  return html;
}

/**
 * Render a single parameter.
 * @param {Object} param - The parameter object with AbiType and Value
 * @param {string} explorerUrl - Block explorer base URL
 * @returns {string} HTML string
 */
function renderParameter(param, explorerUrl) {
  const { AbiType: type, Value: value, name, Error: error } = param;
  
  let html = '<div class="param-item">';
  
  // Parameter label
  html += `<div class="param-label"><strong>${escapeHtml(type)}</strong>`;
  if (name) {
    html += ` <span class="param-name">(${escapeHtml(name)})</span>`;
  }
  html += ':</div>';
  
  // Error display
  if (error) {
    html += `<div class="param-error">${escapeHtml(error)}</div>`;
    html += '</div>';
    return html;
  }
  
  // Parameter value
  html += '<div class="param-value">';
  html += renderValue(value, type, explorerUrl);
  html += '</div>';
  
  html += '</div>';
  return html;
}

/**
 * Render recursive bytes decoding results.
 * @param {Array} recursiveResults - Array of nested bytes decode results
 * @param {string} explorerUrl - Block explorer base URL
 * @returns {string} HTML string
 */
function renderRecursiveBytes(recursiveResults, explorerUrl) {
  if (!recursiveResults || recursiveResults.length === 0) {
    return '';
  }
  
  log('debug', 'renderer', 'Rendering recursive bytes', { count: recursiveResults.length });
  
  let html = `
    <div class="recursive-bytes-section">
      <h3 class="section-title">Nested Bytes Decoding</h3>
  `;
  
  for (const entry of recursiveResults) {
    html += `
      <div class="recursive-entry">
        <div class="recursive-path">Path: <code>${escapeHtml(entry.path)}</code></div>
        <div class="recursive-bytes">Original: <code class="bytes-preview">${escapeHtml(entry.bytesValue)}</code></div>
        <div class="recursive-decoded">
    `;
    
    if (Array.isArray(entry.decoded)) {
      html += renderRecursiveTable(entry.decoded, explorerUrl);
    }
    
    html += `
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

/**
 * Render a table for recursive decode results.
 * @param {Array} decoded - Decoded results array
 * @param {string} explorerUrl - Block explorer URL
 * @returns {string} HTML string
 */
function renderRecursiveTable(decoded, explorerUrl) {
  let html = `
    <div class="results-table-container">
      <table class="results-table nested-table" style="width: 100%; table-layout: fixed;">
        <colgroup>
          <col style="width: 22%;">
          <col style="width: 58%;">
          <col style="width: 20%;">
        </colgroup>
        <thead>
          <tr>
            <th class="col-function">Function & Address</th>
            <th class="col-params">Parameters</th>
            <th class="col-payload">Payload</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  for (const item of decoded) {
    // Build called address HTML with tracking
    let calledAddressHtml = '';
    if (item.calledAddress) {
      const address = checksumAddress(item.calledAddress);
      const addrElementId = generateAddressElementId();
      registerAddress(address, addrElementId);
      
      const link = explorerUrl 
        ? `<a href="${explorerUrl}/address/${address}" target="_blank" rel="noopener">${address}</a>`
        : address;
      calledAddressHtml = `<div class="called-address" id="${addrElementId}" data-address="${address}"><span class="address-label">To:</span> ${link}</div>`;
    }
    
    html += `
      <tr>
        <td class="col-function">
          <div class="function-name">${escapeHtml(item.functionName || 'unknown')}</div>
          ${calledAddressHtml}
        </td>
        <td class="col-params">
    `;
    
    if (item.params && Array.isArray(item.params)) {
      html += renderParameters(item.params, explorerUrl);
    } else {
      html += '-';
    }
    
    html += `
        </td>
        <td class="col-payload"><div class="payload-value">${escapeHtml(item.payload || '')}</div></td>
      </tr>
    `;
  }
  
  html += '</tbody></table></div>';
  return html;
}

/**
 * Render multiple decoded results as a grouped set.
 * Used for VNet transaction lists and similar multi-payload scenarios.
 * 
 * @param {Array<{index: number, txHash?: string, to?: string, from?: string, chainId?: string, decoded: Array, error?: string, payload: string}>} results - Array of decoded results
 * @param {string|number} chainId - The chain ID for explorer links
 * @param {string} label - Label for the group
 * @returns {string} HTML string for the grouped results
 */
function renderMultipleResults(results, chainId, label) {
  log('info', 'renderer', 'Rendering multiple results', { count: results.length, label });
  
  // Reset counters for fresh IDs
  resetCounters();
  
  // Reset address collector for fresh address tracking
  resetAddressCollector();
  
  uint256Elements = [];
  
  const explorerUrl = getExplorerUrl(chainId);
  
  let html = `
    <div class="multiple-results-container">
      <div class="multiple-results-header">
        <h2 class="multiple-results-title">${escapeHtml(label)}</h2>
        <span class="transaction-count">${results.length} transaction${results.length > 1 ? 's' : ''}</span>
      </div>
  `;
  
  for (const result of results) {
    html += renderSingleTransactionGroup(result, explorerUrl);
  }
  
  html += '</div>';
  
  return html;
}

/**
 * Render a single transaction group within multiple results.
 * @param {Object} result - The result object with decoded data
 * @param {string} explorerUrl - Block explorer base URL
 * @returns {string} HTML string
 */
function renderSingleTransactionGroup(result, explorerUrl) {
  let html = `
    <div class="transaction-group">
      <div class="transaction-header">
        <span class="transaction-index">Transaction #${result.index}</span>
  `;
  
  if (result.txHash) {
    html += `<span class="transaction-hash" title="${escapeHtml(result.txHash)}">${escapeHtml(result.txHash.slice(0, 10))}...${escapeHtml(result.txHash.slice(-8))}</span>`;
  }
  
  if (result.to) {
    const toAddress = checksumAddress(result.to);
    const addrElementId = generateAddressElementId();
    registerAddress(toAddress, addrElementId);
    
    const link = explorerUrl 
      ? `<a href="${explorerUrl}/address/${toAddress}" target="_blank" rel="noopener">${toAddress.slice(0, 10)}...${toAddress.slice(-8)}</a>`
      : `${toAddress.slice(0, 10)}...${toAddress.slice(-8)}`;
    html += `<span class="transaction-to" id="${addrElementId}" data-address="${toAddress}">To: ${link}</span>`;
  }
  
  html += '</div>';
  
  if (result.error) {
    html += `<div class="error-message">Error: ${escapeHtml(result.error)}</div>`;
  } else if (result.decoded && Array.isArray(result.decoded) && result.decoded.length > 0) {
    // Render the decoded results as a table
    html += `
      <div class="results-table-container">
        <table class="results-table" style="width: 100%; table-layout: fixed;">
          <colgroup>
            <col style="width: 22%;">
            <col style="width: 58%;">
            <col style="width: 20%;">
          </colgroup>
          <thead>
            <tr>
              <th class="col-function">Function & Addresses</th>
              <th class="col-params">Parameters</th>
              <th class="col-payload">Payload</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    for (let i = 0; i < result.decoded.length; i++) {
      const item = result.decoded[i];
      // Pass from/to for the first (top-level) call
      const rowOptions = i === 0 ? { callerAddress: result.from, topLevelTo: result.to } : {};
      html += renderResultRow(item, explorerUrl, i, rowOptions);
    }
    
    html += '</tbody></table></div>';
  } else {
    html += '<div class="no-data">No decoded data available</div>';
  }
  
  html += '</div>';
  return html;
}

/**
 * Initialize interactive elements after rendering.
 * Call this after inserting the rendered HTML into the DOM.
 * @param {HTMLElement} container - The container element
 */
function initializeInteractivity(container) {
  log('debug', 'renderer', 'Initializing interactivity');
  
  // Initialize copy buttons
  initCopyHandlers(container);
  
  // Initialize uint256 calculators
  initUint256Calculators(container);
}

/**
 * Initialize decimal calculators for uint256 values.
 * @param {HTMLElement} container - The container element
 */
function initUint256Calculators(container) {
  const selects = container.querySelectorAll('.decimal-select');
  
  selects.forEach(select => {
    const value = select.dataset.value;
    const resultId = select.id.replace('-select', '-result');
    const resultEl = container.querySelector(`#${resultId}`);
    
    if (!resultEl) return;
    
    const calculate = () => {
      const decimals = parseInt(select.value, 10) || 0;
      try {
        const num = BigInt(value);
        const denom = BigInt('1' + '0'.repeat(decimals));
        const result = Number(num) / Number(denom);
        
        if (isFinite(result)) {
          resultEl.textContent = result.toFixed(6).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        } else {
          resultEl.textContent = '';
        }
      } catch {
        resultEl.textContent = '';
      }
    };
    
    select.addEventListener('change', calculate);
    calculate(); // Initial calculation
  });
  
  log('debug', 'renderer', 'Initialized calculators', { count: selects.length });
}

// Export for ES modules
export {
  renderResults,
  renderRecursiveBytes,
  renderMultipleResults,
  initializeInteractivity,
  renderParameter,
  renderParameters
};
