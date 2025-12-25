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

/**
 * Application state.
 */
const state = {
  currentChainId: '1',
  lastParsedPayload: null,
  isSignatureFormVisible: false
};

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
    
    // Check if input is a link
    if (isParsableLink(input)) {
      log('info', 'app', 'Detected link input, parsing...');
      const linkResult = await parseLink(input);
      
      if (!linkResult.success) {
        outputDiv.innerHTML = `<div class="error-message">Failed to parse link: ${linkResult.error}</div>`;
        return;
      }
      
      payload = linkResult.payload;
      if (linkResult.chainId) {
        chainId = String(linkResult.chainId);
        document.getElementById('chain-select').value = chainId;
        state.currentChainId = chainId;
      }
      
      log('info', 'app', 'Link parsed successfully', { chainId, payloadLength: payload.length });
    }
    
    // Validate payload
    if (!payload.startsWith('0x')) {
      outputDiv.innerHTML = '<div class="error-message">Payload must start with 0x</div>';
      return;
    }
    
    // Decode the payload
    log('info', 'app', 'Decoding payload', { length: payload.length });
    const decoded = await decodePayload(payload);
    
    if (!Array.isArray(decoded) || decoded.length === 0) {
      outputDiv.innerHTML = '<div class="error-message">Failed to decode payload</div>';
      return;
    }
    
    // Render main results
    let html = renderResults(decoded, chainId);
    
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
    
  } catch (e) {
    log('error', 'app', 'Parse error', { error: e.message, stack: e.stack });
    outputDiv.innerHTML = `<div class="error-message">Parse error: ${e.message}</div>`;
  }
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
  state
};
