/**
 * Main Application Entry Point
 * 
 * Initializes the payload parser application and handles
 * user interactions.
 * 
 * Post-processing features:
 * - Fetches contract info (symbol, decimals) for all discovered addresses
 * - Updates rendered addresses with token symbols
 */

import { log } from './core/abi-utils.js';
import { decodePayload, findAndDecodeNestedBytes } from './core/decoder.js';
import { 
  registerCustomSignature, 
  parseSignatureTable, 
  submitSignatures 
} from './core/signature.js';
import { parseLink, isParsableLink } from './parsers/index.js';
import { getAllChainIds, getChainName, getExplorerUrl, getRpcUrl } from './config/chains.js';
import { 
  renderResults, 
  renderRecursiveBytes,
  renderMultipleResults,
  initializeInteractivity 
} from './ui/renderer.js';
import { 
  getAllAddresses, 
  getElementIdsForAddress,
  getAddressStats 
} from './core/address-collector.js';
import { 
  fetchContractInfo, 
  updateAddressDisplays 
} from './core/contract-info.js';
import {
  fetchContractNames,
  updateAddressWithNames,
  clearNameCache
} from './core/contract-name.js';

/**
 * Application state.
 */
const state = {
  currentChainId: '1',
  lastParsedPayload: null,
  isSignatureFormVisible: false,
  lastLinkInfo: null,  // Stores from/to/chainId when parsing links
  vnetInfo: null       // Stores VNet info: { vnetId, vnetRpcUrl, chainId }
};

/**
 * Normalize payload by ensuring it has 0x prefix.
 * Validates that the input looks like hex data.
 * @param {string} input - The input string
 * @returns {{isPayload: boolean, payload: string}} Whether it's a valid payload and normalized version
 */
function normalizePayload(input) {
  // If it already has 0x prefix
  if (input.startsWith('0x') || input.startsWith('0X')) {
    return { isPayload: true, payload: input.toLowerCase() };
  }
  
  // Check if it looks like hex data (only hex characters)
  // Must be at least 8 characters (4 bytes selector) and even length
  if (/^[a-fA-F0-9]+$/.test(input) && input.length >= 8 && input.length % 2 === 0) {
    return { isPayload: true, payload: '0x' + input.toLowerCase() };
  }
  
  return { isPayload: false, payload: input };
}

/**
 * Initialize the application when DOM is ready.
 */
function init() {
  log('info', 'app', 'Initializing application');
  
  // Initialize chain selector
  initChainSelector();
  
  // Initialize event listeners
  initEventListeners();
  
  // Initialize signature registration form
  initSignatureForm();
  
  log('info', 'app', 'Application initialized');
}

/**
 * Initialize the chain selector dropdown.
 */
function initChainSelector() {
  const selector = document.getElementById('chain-select');
  if (!selector) {
    log('warn', 'app', 'Chain selector not found');
    return;
  }
  
  const chainIds = getAllChainIds();
  selector.innerHTML = '';
  
  for (const chainId of chainIds) {
    const option = document.createElement('option');
    option.value = chainId;
    option.textContent = `${chainId} - ${getChainName(chainId)}`;
    selector.appendChild(option);
  }
  
  selector.value = state.currentChainId;
  
  selector.addEventListener('change', (e) => {
    state.currentChainId = e.target.value;
    log('debug', 'app', 'Chain changed', { chainId: state.currentChainId });
  });
  
  log('debug', 'app', 'Chain selector initialized', { chainCount: chainIds.length });
}

/**
 * Initialize event listeners for buttons and inputs.
 */
function initEventListeners() {
  // Parse button
  const parseBtn = document.getElementById('parse-btn');
  if (parseBtn) {
    parseBtn.addEventListener('click', handleParse);
  }
  
  // Input field - handle paste
  const inputField = document.getElementById('payload-input');
  if (inputField) {
    inputField.addEventListener('paste', handlePaste);
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleParse();
      }
    });
  }
  
  // Signature registration toggle
  const sigToggle = document.getElementById('sig-toggle-btn');
  if (sigToggle) {
    sigToggle.addEventListener('click', toggleSignatureForm);
  }
  
  // VNet Reader button
  const vnetBtn = document.getElementById('vnet-reader-btn');
  if (vnetBtn) {
    vnetBtn.addEventListener('click', handleVnetReaderClick);
  }
  
  // Clear cache button
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', handleClearCache);
  }
}

/**
 * Initialize the signature registration form.
 */
function initSignatureForm() {
  const submitBtn = document.getElementById('sig-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleSignatureSubmit);
  }
}

/**
 * Handle the parse button click.
 */
async function handleParse() {
  const inputField = document.getElementById('payload-input');
  const outputDiv = document.getElementById('output');
  
  if (!inputField || !outputDiv) {
    log('error', 'app', 'Required elements not found');
    return;
  }
  
  const input = inputField.value.trim();
  
  if (!input) {
    outputDiv.innerHTML = '<div class="error-message">Please enter a payload or transaction link</div>';
    return;
  }
  
  outputDiv.innerHTML = '<div class="loading">Parsing...</div>';
  
  try {
    let payload = input;
    let chainId = state.currentChainId;
    let isMultiplePayloads = false;
    let payloads = null;
    let multipleLabel = '';
    let topLevelTo = null;
    let topLevelFrom = null;
    let isFromLink = false;
    
    // Reset link info and vnet info
    state.lastLinkInfo = null;
    state.vnetInfo = null;
    updateVnetButtonVisibility();
    
    // Check if input is a link
    if (isParsableLink(input)) {
      log('info', 'app', 'Detected link input, parsing...');
      isFromLink = true;
      const linkResult = await parseLink(input);
      
      // Save VNet info if available, even if parsing failed
      // This allows "Read on VNet" button to work for VNet links without valid transactions
      if (linkResult.vnetId && linkResult.vnetRpcUrl) {
        state.vnetInfo = {
          vnetId: linkResult.vnetId,
          vnetRpcUrl: linkResult.vnetRpcUrl,
          chainId: linkResult.chainId || '1'
        };
        log('info', 'app', 'VNet info detected', state.vnetInfo);
      }
      
      if (!linkResult.success) {
        outputDiv.innerHTML = `<div class="error-message">Failed to parse link: ${linkResult.error}</div>`;
        // Show VNet button even on parse failure if VNet info is available
        updateVnetButtonVisibility();
        return;
      }
      
      // Store the top-level called address and caller
      topLevelTo = linkResult.to || null;
      topLevelFrom = linkResult.from || null;
      
      // Save link info for display
      state.lastLinkInfo = {
        from: topLevelFrom,
        to: topLevelTo,
        chainId: linkResult.chainId,
        txHash: linkResult.txHash
      };
      
      // Check if result contains multiple payloads
      if (linkResult.isMultiple && linkResult.payloads) {
        isMultiplePayloads = true;
        payloads = linkResult.payloads;
        multipleLabel = linkResult.label || 'Multiple Transactions';
        if (linkResult.chainId) {
          chainId = String(linkResult.chainId);
        }
        log('info', 'app', 'Multiple payloads detected', { count: payloads.length, label: multipleLabel });
      } else {
        payload = linkResult.payload;
        if (linkResult.chainId) {
          chainId = String(linkResult.chainId);
        }
        log('info', 'app', 'Link parsed successfully', { chainId, payloadLength: payload.length, from: topLevelFrom, to: topLevelTo });
      }
      
      document.getElementById('chain-select').value = chainId;
      state.currentChainId = chainId;
    }
    
    // Handle multiple payloads
    if (isMultiplePayloads && payloads) {
      await handleMultiplePayloads(payloads, chainId, multipleLabel, outputDiv);
      return;
    }
    
    // Normalize payload - add 0x prefix if missing but looks like hex
    if (!isFromLink) {
      const normalized = normalizePayload(payload);
      if (!normalized.isPayload) {
        outputDiv.innerHTML = '<div class="error-message">Invalid payload format. Expected hex data (with or without 0x prefix).</div>';
        return;
      }
      payload = normalized.payload;
    }
    
    // Validate payload
    if (!payload.startsWith('0x')) {
      outputDiv.innerHTML = '<div class="error-message">Payload must be valid hex data</div>';
      return;
    }
    
    // Decode the payload
    log('info', 'app', 'Decoding payload', { length: payload.length });
    const decoded = await decodePayload(payload, topLevelTo);
    
    if (!Array.isArray(decoded) || decoded.length === 0) {
      outputDiv.innerHTML = '<div class="error-message">Failed to decode payload</div>';
      return;
    }
    
    // Render main results with from/to info for link inputs
    const renderOptions = isFromLink ? { from: topLevelFrom, to: topLevelTo } : {};
    let html = renderResults(decoded, chainId, renderOptions);
    
    // Find and decode nested bytes
    const nestedBytes = [];
    for (const item of decoded) {
      if (item.params) {
        const nested = await findAndDecodeNestedBytes(item.params);
        nestedBytes.push(...nested);
      }
    }
    
    // Render nested bytes if any
    if (nestedBytes.length > 0) {
      const explorerUrl = getExplorerUrl(chainId);
      html += renderRecursiveBytes(nestedBytes, explorerUrl);
    }
    
    // Update output
    outputDiv.innerHTML = html;
    
    // Initialize interactive elements
    initializeInteractivity(outputDiv);
    
    state.lastParsedPayload = payload;
    log('info', 'app', 'Parse complete', { resultCount: decoded.length, nestedCount: nestedBytes.length });
    
    // Post-processing: Fetch and display contract info for all addresses
    // This runs asynchronously after the main render is complete
    await fetchAndDisplayContractInfo(chainId);
    
    // Update VNet button visibility AFTER contract info fetch completes
    // This ensures symbols are fully loaded before showing the button
    updateVnetButtonVisibility();
    
  } catch (e) {
    log('error', 'app', 'Parse error', { error: e.message, stack: e.stack });
    outputDiv.innerHTML = `<div class="error-message">Parse error: ${e.message}</div>`;
    // Still update VNet button - if we have vnetInfo from the link, show the button
    updateVnetButtonVisibility();
  }
}

/**
 * Handle multiple payloads (e.g., from VNet transaction list).
 * Decodes each payload and renders them as a grouped set.
 * 
 * @param {Array<{payload: string, txHash?: string, chainId?: string, to?: string, from?: string}>} payloads - Array of payload objects
 * @param {string} chainId - Default chain ID
 * @param {string} label - Label for the group (e.g., "VNet Transactions")
 * @param {HTMLElement} outputDiv - Output container element
 */
async function handleMultiplePayloads(payloads, chainId, label, outputDiv) {
  log('info', 'app', 'Handling multiple payloads', { count: payloads.length, label });
  
  const explorerUrl = getExplorerUrl(chainId);
  const allDecodedResults = [];
  const allNestedBytes = [];
  
  // Decode each payload
  for (let i = 0; i < payloads.length; i++) {
    const payloadObj = payloads[i];
    const txChainId = payloadObj.chainId || chainId;
    
    try {
      // Pass the 'to' address from the payload object to decoder
      const decoded = await decodePayload(payloadObj.payload, payloadObj.to);
      
      // Collect nested bytes for each decoded result
      for (const item of decoded) {
        if (item.params) {
          const nested = await findAndDecodeNestedBytes(item.params);
          allNestedBytes.push(...nested);
        }
      }
      
      allDecodedResults.push({
        index: i + 1,
        txHash: payloadObj.txHash,
        to: payloadObj.to,
        from: payloadObj.from,
        chainId: txChainId,
        decoded,
        payload: payloadObj.payload
      });
    } catch (e) {
      log('error', 'app', `Failed to decode payload ${i + 1}`, { error: e.message });
      allDecodedResults.push({
        index: i + 1,
        txHash: payloadObj.txHash,
        error: e.message,
        payload: payloadObj.payload
      });
    }
  }
  
  // Render grouped results
  let html = renderMultipleResults(allDecodedResults, chainId, label);
  
  // Render nested bytes if any
  if (allNestedBytes.length > 0) {
    html += renderRecursiveBytes(allNestedBytes, explorerUrl);
  }
  
  outputDiv.innerHTML = html;
  initializeInteractivity(outputDiv);
  
  log('info', 'app', 'Multiple payloads parsed', { 
    total: payloads.length, 
    successful: allDecodedResults.filter(r => !r.error).length 
  });
  
  // Post-processing: Fetch and display contract info
  await fetchAndDisplayContractInfo(chainId);
  
  // Update VNet button visibility after all processing is complete
  updateVnetButtonVisibility();
}

/**
 * Fetch contract info (symbol, decimals) for all collected addresses
 * and update the rendered display with token symbols.
 * 
 * This function runs after the main render is complete. It:
 * 1. Gets all unique addresses from the address collector
 * 2. Fetches symbol/decimals via multicall
 * 3. Updates the DOM elements with symbol information
 * 
 * @param {string|number} chainId - The chain ID to query
 * @returns {Promise<void>}
 */
async function fetchAndDisplayContractInfo(chainId) {
  // Get all collected addresses
  const addresses = getAllAddresses();
  const stats = getAddressStats();
  
  if (addresses.length === 0) {
    log('debug', 'app', 'No addresses to fetch contract info for');
    return;
  }
  
  log('info', 'app', 'Fetching contract info', { 
    uniqueAddresses: stats.uniqueCount, 
    totalElements: stats.totalElements,
    chainId 
  });
  
  // Check if RPC is available for this chain
  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) {
    log('warn', 'app', 'No RPC URL configured for chain, skipping contract info fetch', { chainId });
    return;
  }
  
  try {
    // Fetch contract info using multicall
    const contractInfoMap = await fetchContractInfo(addresses, chainId);
    
    // Update the DOM with symbol information
    updateAddressDisplays(contractInfoMap, getElementIdsForAddress);
    
    // Log results
    const withSymbol = Array.from(contractInfoMap.values()).filter(info => info.symbol).length;
    log('info', 'app', 'Contract info fetch complete', { 
      total: addresses.length, 
      withSymbol 
    });
    
    // Fetch contract names for addresses without symbols
    try {
      const nameMap = await fetchContractNames(addresses, contractInfoMap, chainId);
      
      // Update the DOM with contract name information
      updateAddressWithNames(nameMap, getElementIdsForAddress);
      
      log('info', 'app', 'Contract name fetch complete', {
        total: addresses.length,
        withName: nameMap.size
      });
    } catch (e) {
      log('error', 'app', 'Failed to fetch contract names', { error: e.message });
    }
    
  } catch (e) {
    // Non-fatal error - the main parsing result is still displayed
    log('error', 'app', 'Failed to fetch contract info', { error: e.message });
  }
}

/**
 * Handle paste events to auto-detect links.
 * @param {ClipboardEvent} e - The paste event
 */
async function handlePaste(e) {
  const text = e.clipboardData?.getData('text');
  
  if (text && isParsableLink(text)) {
    log('debug', 'app', 'Detected link paste');
    // Let the paste complete, then auto-parse after a short delay
    setTimeout(() => {
      handleParse();
    }, 100);
  }
}

/**
 * Toggle visibility of the signature registration form.
 */
function toggleSignatureForm() {
  const form = document.getElementById('sig-form-container');
  const btn = document.getElementById('sig-toggle-btn');
  
  if (!form || !btn) return;
  
  state.isSignatureFormVisible = !state.isSignatureFormVisible;
  
  if (state.isSignatureFormVisible) {
    form.classList.remove('hidden');
    btn.textContent = 'Hide Signature Form';
  } else {
    form.classList.add('hidden');
    btn.textContent = 'Unknown Function? Register Signature';
  }
}

/**
 * Handle signature submission.
 */
async function handleSignatureSubmit() {
  const textarea = document.getElementById('sig-input');
  const status = document.getElementById('sig-status');
  
  if (!textarea || !status) return;
  
  const input = textarea.value.trim();
  
  if (!input) {
    status.textContent = 'Please enter signatures';
    status.className = 'status-error';
    return;
  }
  
  status.textContent = 'Processing...';
  status.className = 'status-pending';
  
  try {
    // Parse signatures from input
    const signatures = parseSignatureTable(input);
    
    if (signatures.length === 0) {
      status.textContent = 'No valid signatures found';
      status.className = 'status-error';
      return;
    }
    
    // Register locally
    for (const sig of signatures) {
      try {
        registerCustomSignature(sig);
      } catch (e) {
        log('warn', 'app', 'Failed to register signature locally', { sig, error: e.message });
      }
    }
    
    // Submit to database
    const result = await submitSignatures(signatures);
    
    if (result.success) {
      status.textContent = `Submitted ${signatures.length} signature(s). Click Parse again to retry.`;
      status.className = 'status-success';
    } else {
      status.textContent = `Registered locally. Database submission failed: ${result.error}`;
      status.className = 'status-warning';
    }
    
    log('info', 'app', 'Signatures processed', { count: signatures.length, success: result.success });
    
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
    status.className = 'status-error';
    log('error', 'app', 'Signature submission error', { error: e.message });
  }
}

/**
 * Update the visibility of the VNet Reader button.
 * Shows the button only when vnetInfo is available.
 */
function updateVnetButtonVisibility() {
  const btn = document.getElementById('vnet-reader-btn');
  if (!btn) return;
  
  if (state.vnetInfo && state.vnetInfo.vnetRpcUrl) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

/**
 * Handle click on the VNet Reader button.
 * Opens the VNet Reader page with RPC URL and collected addresses.
 */
function handleVnetReaderClick() {
  if (!state.vnetInfo || !state.vnetInfo.vnetRpcUrl) {
    log('warn', 'app', 'VNet Reader clicked but no VNet info available');
    return;
  }
  
  // Collect all addresses from the address collector
  const addresses = getAllAddresses();
  
  // Build URL parameters
  const params = new URLSearchParams();
  params.set('rpc', state.vnetInfo.vnetRpcUrl);
  params.set('chainId', state.vnetInfo.chainId || '1');
  
  // Pass addresses as JSON array (will be decoded on the other side)
  if (addresses.length > 0) {
    params.set('addresses', JSON.stringify(addresses));
  }
  
  // Open the VNet Reader page
  const readerUrl = `vnet-reader.html?${params.toString()}`;
  window.open(readerUrl, '_blank');
  
  log('info', 'app', 'Opening VNet Reader', { 
    rpc: state.vnetInfo.vnetRpcUrl, 
    addressCount: addresses.length 
  });
}

/**
 * Handle click on the Clear Cache button.
 * Clears all contract name cache from localStorage.
 */
function handleClearCache() {
  const count = clearNameCache();
  
  // Show feedback to user
  const btn = document.getElementById('clear-cache-btn');
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = `✓ Cleared ${count} entries`;
    btn.disabled = true;
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
  
  log('info', 'app', 'Cache cleared', { entriesRemoved: count });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for testing
export {
  init,
  handleParse,
  toggleSignatureForm,
  handleSignatureSubmit,
  handleVnetReaderClick,
  state
};
