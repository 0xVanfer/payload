/**
 * Cache Manager Application
 * 
 * Main application logic for the cache management page.
 * Handles UI rendering, user interactions, and cache operations.
 * 
 * Features:
 * - Support for chainId 0 (global addresses that apply to all chains)
 * - Custom name support for addresses
 * - Only cache manager UI can write to chainId 0
 */

import {
  getContractCache,
  setContractCache,
  deleteContractCache,
  getContractCacheByChain,
  clearAllContractCache,
  exportCache,
  importCache,
  getCacheStats,
  migrateOldCache,
  needsMigration,
  GLOBAL_CHAIN_ID
} from './core/cache-manager.js';

import { getChainName, getAllChainIds, getRpcUrl } from './config/chains.js';
import { getNextApiKey, getApiUrl, isRoutescanChain } from './config/etherscan-api.js';

/**
 * Application state.
 */
const state = {
  expandedItems: new Set(),
  isAddingAddress: false
};

/**
 * Get display name for a chain ID.
 * @param {string} chainId - The chain ID
 * @returns {string} Display name
 */
function getChainDisplayName(chainId) {
  if (chainId === GLOBAL_CHAIN_ID) {
    return '🌐 Global (All Chains)';
  }
  return getChainName(chainId) || `Chain ${chainId}`;
}

/**
 * Initialize the application.
 */
function init() {
  // Check for and perform migration if needed
  if (needsMigration()) {
    const result = migrateOldCache();
    if (result.migrated > 0) {
      showToast(`Migrated ${result.migrated} entries from old cache format`, 'success');
    }
  }
  
  // Set up event listeners
  setupEventListeners();
  
  // Render initial content
  renderContractList();
  updateStats();
}

/**
 * Set up event listeners.
 */
function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', handleTabClick);
  });
  
  // Toolbar buttons
  document.getElementById('add-address-btn')?.addEventListener('click', showAddAddressDialog);
  document.getElementById('export-btn')?.addEventListener('click', handleExport);
  document.getElementById('import-btn')?.addEventListener('click', () => {
    document.getElementById('import-file')?.click();
  });
  document.getElementById('import-file')?.addEventListener('change', handleImport);
  document.getElementById('clear-all-btn')?.addEventListener('click', handleClearAll);
}

/**
 * Handle tab click.
 * @param {Event} e - Click event
 */
function handleTabClick(e) {
  const tabId = e.target.dataset.tab;
  
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
}

/**
 * Render the contract list grouped by chain.
 */
function renderContractList() {
  const container = document.getElementById('contract-list');
  if (!container) return;
  
  const byChain = getContractCacheByChain();
  const chainIds = Object.keys(byChain).sort((a, b) => {
    // Global chain (0) should come first
    if (a === GLOBAL_CHAIN_ID) return -1;
    if (b === GLOBAL_CHAIN_ID) return 1;
    // Sort by chain name
    const nameA = getChainDisplayName(a);
    const nameB = getChainDisplayName(b);
    return nameA.localeCompare(nameB);
  });
  
  if (chainIds.length === 0) {
    container.innerHTML = '<p class="empty-message">No cached contracts. Parse some transactions to populate the cache.</p>';
    return;
  }
  
  let html = '';
  
  for (const chainId of chainIds) {
    const contracts = byChain[chainId];
    const chainName = getChainDisplayName(chainId);
    const isGlobal = chainId === GLOBAL_CHAIN_ID;
    
    html += `
      <div class="chain-group ${isGlobal ? 'chain-group-global' : ''}" data-chain="${chainId}">
        <div class="chain-header ${isGlobal ? 'chain-header-global' : ''}">
          <span class="chain-name">${chainName}</span>
          <span class="chain-count">${contracts.length}</span>
        </div>
        <div class="chain-contracts">
    `;
    
    for (const contract of contracts) {
      html += renderContractItem(chainId, contract.address, contract.data);
    }
    
    html += `
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Attach event listeners to contract items
  attachContractItemListeners();
}

/**
 * Render a single contract item.
 * @param {string} chainId - Chain ID
 * @param {string} address - Contract address
 * @param {Object} data - Contract cache data
 * @returns {string} HTML string
 */
function renderContractItem(chainId, address, data) {
  const itemKey = `${chainId}:${address}`;
  const isExpanded = state.expandedItems.has(itemKey);
  const isGlobal = chainId === GLOBAL_CHAIN_ID;
  
  // Build label - customName takes priority
  const label = data.customName || data.symbol || data.name || '';
  
  // Build badges
  const badges = [];
  if (data.customName) badges.push('<span class="badge badge-custom">Custom</span>');
  if (data.symbol) badges.push('<span class="badge badge-symbol">Symbol</span>');
  if (data.abi) badges.push('<span class="badge badge-abi">ABI</span>');
  if (data.vnetDefault) badges.push('<span class="badge badge-vnet">VNet</span>');
  if (data.isProxy) badges.push('<span class="badge badge-proxy">Proxy</span>');
  if (isGlobal) badges.push('<span class="badge badge-global">Global</span>');
  
  // Build ABI preview
  let abiPreview = '';
  if (data.abi) {
    const methodCount = data.abi.filter(i => i.type === 'function').length;
    const eventCount = data.abi.filter(i => i.type === 'event').length;
    abiPreview = `${methodCount} functions, ${eventCount} events`;
  }
  
  return `
    <div class="contract-item ${isExpanded ? 'expanded' : ''} ${isGlobal ? 'contract-item-global' : ''}" data-chain="${chainId}" data-address="${address}">
      <div class="contract-item-header">
        <div class="contract-info-summary">
          <span class="contract-address">${address}</span>
          ${label ? `<span class="contract-label">(${label})</span>` : ''}
          <div class="contract-badges">${badges.join('')}</div>
        </div>
        <div class="contract-item-actions">
          <span class="expand-icon">▼</span>
        </div>
      </div>
      <div class="contract-item-body">
        <div class="detail-list">
          <!-- Address -->
          <div class="detail-row">
            <span class="detail-label">Address</span>
            <span class="detail-value mono">${address}</span>
          </div>
          <!-- Custom Name (highest priority, editable) -->
          <div class="detail-row">
            <span class="detail-label">Custom Name</span>
            <input type="text" class="detail-input custom-name-input" value="${data.customName || ''}" placeholder="Enter custom name (overrides all)...">
          </div>
          <!-- Symbol (from RPC) -->
          <div class="detail-row">
            <span class="detail-label">Symbol (RPC)</span>
            <span class="detail-value ${data.symbol ? '' : 'empty'}">${data.symbol || 'Not available'}</span>
          </div>
          <!-- Contract Name (from Etherscan) -->
          <div class="detail-row">
            <span class="detail-label">Contract Name (Etherscan)</span>
            <span class="detail-value ${data.name ? '' : 'empty'}">${data.name || 'Not available'}</span>
          </div>
          <!-- ABI -->
          <div class="detail-row">
            <span class="detail-label">ABI</span>
            <span class="detail-value ${data.abi ? '' : 'empty'}">${abiPreview || 'Not available'}</span>
          </div>
          ${data.isProxy ? `
          <!-- Implementation (if proxy) -->
          <div class="detail-row">
            <span class="detail-label">Implementation</span>
            <span class="detail-value mono">${data.implementation || 'Unknown'}</span>
          </div>
          ` : ''}
          <!-- VNet Default Toggle -->
          <div class="detail-row">
            <div class="toggle-row">
              <input type="checkbox" class="toggle-checkbox vnet-checkbox" ${data.vnetDefault ? 'checked' : ''}>>
              <label class="toggle-label">Show in VNet dropdown by default</label>
            </div>
          </div>
        </div>
        <div class="detail-actions">
          <button class="btn btn-save btn-small save-btn">💾 Save Changes</button>
          <button class="btn btn-delete btn-small delete-btn">🗑️ Delete Entry</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to contract items.
 */
function attachContractItemListeners() {
  // Header click to expand/collapse
  document.querySelectorAll('.contract-item-header').forEach(header => {
    header.addEventListener('click', (e) => {
      const item = e.target.closest('.contract-item');
      if (!item) return;
      
      const chainId = item.dataset.chain;
      const address = item.dataset.address;
      const itemKey = `${chainId}:${address}`;
      
      if (state.expandedItems.has(itemKey)) {
        state.expandedItems.delete(itemKey);
        item.classList.remove('expanded');
      } else {
        state.expandedItems.add(itemKey);
        item.classList.add('expanded');
      }
    });
  });
  
  // Save button click
  document.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = e.target.closest('.contract-item');
      if (!item) return;
      
      const chainId = item.dataset.chain;
      const address = item.dataset.address;
      
      const customNameInput = item.querySelector('.custom-name-input');
      const vnetCheckbox = item.querySelector('.vnet-checkbox');
      
      const customName = customNameInput?.value.trim() || null;
      const vnetDefault = vnetCheckbox?.checked || false;
      
      setContractCache(chainId, address, { customName, vnetDefault });
      showToast('Changes saved', 'success');
      
      // Re-render to update badges and labels
      renderContractList();
      updateStats();
    });
  });
  
  // Delete button click
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = e.target.closest('.contract-item');
      if (!item) return;
      
      const chainId = item.dataset.chain;
      const address = item.dataset.address;
      
      showConfirm(
        'Delete Entry',
        `Are you sure you want to delete the cache entry for ${address}?`,
        () => {
          deleteContractCache(chainId, address);
          state.expandedItems.delete(`${chainId}:${address}`);
          showToast('Entry deleted', 'success');
          renderContractList();
          updateStats();
        }
      );
    });
  });
}

/**
 * Update statistics display.
 */
function updateStats() {
  const stats = getCacheStats();
  const totalCount = document.getElementById('total-count');
  if (totalCount) {
    totalCount.textContent = stats.totalEntries;
  }
}

/**
 * Handle export button click.
 */
function handleExport() {
  const data = exportCache();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `payload-parser-cache-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('Cache exported', 'success');
}

/**
 * Handle import file selection.
 * @param {Event} e - Change event
 */
function handleImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      
      showConfirm(
        'Import Cache',
        'This will replace all existing cache data. Are you sure?',
        () => {
          const result = importCache(data);
          if (result.errors > 0) {
            showToast(`Imported ${result.imported} entries with ${result.errors} errors`, 'error');
          } else {
            showToast(`Imported ${result.imported} entries`, 'success');
          }
          renderContractList();
          updateStats();
        }
      );
    } catch (err) {
      showToast('Invalid JSON file', 'error');
    }
  };
  reader.readAsText(file);
  
  // Reset file input
  e.target.value = '';
}

/**
 * Handle clear all button click.
 */
function handleClearAll() {
  const stats = getCacheStats();
  
  showConfirm(
    'Clear All Cache',
    `This will permanently delete all ${stats.totalEntries} cached entries. This action cannot be undone.`,
    () => {
      const count = clearAllContractCache();
      state.expandedItems.clear();
      showToast(`Cleared ${count} entries`, 'success');
      renderContractList();
      updateStats();
    }
  );
}

/**
 * Show a toast notification.
 * @param {string} message - Message to display
 * @param {'success'|'error'} type - Toast type
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('status-toast');
  if (!toast) return;
  
  toast.textContent = message;
  toast.className = `status-toast ${type}`;
  
  // Force reflow for animation
  toast.offsetHeight;
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

/**
 * Show a confirmation dialog.
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {function} onConfirm - Callback when confirmed
 */
function showConfirm(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-title">${title}</div>
      <div class="confirm-message">${message}</div>
      <div class="confirm-actions">
        <button class="btn btn-secondary cancel-btn">Cancel</button>
        <button class="btn btn-danger confirm-btn">Confirm</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  overlay.querySelector('.cancel-btn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  overlay.querySelector('.confirm-btn').addEventListener('click', () => {
    document.body.removeChild(overlay);
    onConfirm();
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}

/**
 * Show add address dialog.
 * Supports adding addresses with custom names and chainId 0 (global).
 */
function showAddAddressDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.id = 'add-address-overlay';
  
  // Build chain options - include global option at the top
  const chainIds = getAllChainIds();
  const chainOptions = [
    `<option value="${GLOBAL_CHAIN_ID}">🌐 0 - Global (All Chains)</option>`,
    ...chainIds.map(chainId => 
      `<option value="${chainId}">${chainId} - ${getChainName(chainId)}</option>`
    )
  ].join('');
  
  overlay.innerHTML = `
    <div class="add-address-dialog">
      <div class="add-address-title">➕ Add Contract Address</div>
      <div class="add-address-form">
        <div class="form-group">
          <label class="form-label">Chain</label>
          <select id="dialog-chain-select" class="form-select">
            ${chainOptions}
          </select>
          <small class="form-hint">Select "Global" to apply name to all chains</small>
        </div>
        <div class="form-group">
          <label class="form-label">Contract Address</label>
          <input type="text" id="dialog-address-input" class="form-input" placeholder="0x...">
        </div>
        <div class="form-group">
          <label class="form-label">Custom Name (optional)</label>
          <input type="text" id="dialog-custom-name-input" class="form-input" placeholder="Enter custom name...">
          <small class="form-hint">Custom name overrides symbol and contract name</small>
        </div>
        <div id="dialog-add-status" class="add-status"></div>
        <div class="add-address-actions">
          <button class="btn btn-secondary cancel-btn">Cancel</button>
          <button class="btn btn-fetch fetch-btn" id="dialog-fetch-btn">🔍 Fetch & Save</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Focus on address input
  const addressInput = overlay.querySelector('#dialog-address-input');
  addressInput?.focus();
  
  // Cancel button
  overlay.querySelector('.cancel-btn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  // Fetch button
  overlay.querySelector('.fetch-btn').addEventListener('click', () => {
    handleAddAddressFromDialog(overlay);
  });
  
  // Enter key to submit
  addressInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleAddAddressFromDialog(overlay);
    }
  });
  
  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}

/**
 * Handle add address from dialog.
 * For chainId 0 (global), only custom name is saved - no RPC/API fetch.
 * @param {HTMLElement} overlay - The dialog overlay element
 */
async function handleAddAddressFromDialog(overlay) {
  if (state.isAddingAddress) return;
  
  const chainSelect = overlay.querySelector('#dialog-chain-select');
  const addressInput = overlay.querySelector('#dialog-address-input');
  const customNameInput = overlay.querySelector('#dialog-custom-name-input');
  const fetchBtn = overlay.querySelector('#dialog-fetch-btn');
  const statusEl = overlay.querySelector('#dialog-add-status');
  
  const chainId = chainSelect?.value;
  const address = addressInput?.value.trim();
  const customName = customNameInput?.value.trim() || null;
  const isGlobal = chainId === GLOBAL_CHAIN_ID;
  
  // Validate address
  if (!address) {
    updateDialogStatus(statusEl, 'Please enter an address', 'error');
    return;
  }
  
  if (!ethers.utils.isAddress(address)) {
    updateDialogStatus(statusEl, 'Invalid address format', 'error');
    return;
  }
  
  // For global chain, require custom name
  if (isGlobal && !customName) {
    updateDialogStatus(statusEl, 'Custom name is required for global addresses', 'error');
    return;
  }
  
  const normalizedAddress = ethers.utils.getAddress(address);
  
  // Check if already exists
  const existing = getContractCache(chainId, normalizedAddress);
  const hasSymbolOrName = existing && (existing.symbol || existing.name || existing.customName);
  if (existing && (existing.symbol || existing.abi || existing.name || existing.customName)) {
    updateDialogStatus(statusEl, 'Address already in cache. Updating...', 'loading');
  }
  
  // Set loading state
  state.isAddingAddress = true;
  fetchBtn.disabled = true;
  
  try {
    const result = {
      symbol: existing?.symbol || null,
      name: existing?.name || null,
      customName: customName || existing?.customName || null,
      abi: existing?.abi || null,
      isProxy: existing?.isProxy || false,
      implementation: existing?.implementation || null
    };
    
    // For global chain (chainId 0), only save custom name - no RPC/API fetch
    if (isGlobal) {
      updateDialogStatus(statusEl, 'Saving global address...', 'loading');
      result.customName = customName;
      
      // Save to cache
      setContractCache(chainId, normalizedAddress, result);
      
      updateDialogStatus(statusEl, `✓ Saved global address with name: ${customName}`, 'success');
      showToast(`Global address added: ${normalizedAddress.slice(0, 10)}...`, 'success');
    } else {
      // For specific chains, fetch info from RPC/API
      updateDialogStatus(statusEl, 'Fetching contract info...', 'loading');
      
      // Step 1: Fetch symbol via RPC (Multicall)
      // Skip if we already have symbol or name in cache
      if (!hasSymbolOrName) {
        updateDialogStatus(statusEl, 'Fetching symbol...', 'loading');
        const tokenInfo = await fetchTokenInfo(normalizedAddress, chainId);
        if (tokenInfo) {
          result.symbol = tokenInfo.symbol;
        }
      }
      
      // Step 2: Fetch contract name and ABI via Etherscan API
      updateDialogStatus(statusEl, 'Fetching contract name & ABI...', 'loading');
      const contractInfo = await fetchContractInfo(normalizedAddress, chainId);
      if (contractInfo) {
        // Only update name if not already set
        if (!result.name) result.name = contractInfo.name;
        result.abi = contractInfo.abi;
        result.isProxy = contractInfo.isProxy;
        result.implementation = contractInfo.implementation;
      }
      
      // Apply custom name if provided (overrides everything)
      if (customName) {
        result.customName = customName;
      }
      
      // Save to cache
      setContractCache(chainId, normalizedAddress, result);
      
      // Build success message
      const found = [];
      if (result.customName) found.push('Custom Name');
      if (result.symbol) found.push('Symbol');
      if (result.name) found.push('Name');
      if (result.abi) found.push('ABI');
      
      if (found.length > 0) {
        updateDialogStatus(statusEl, `✓ Saved: ${found.join(', ')}`, 'success');
        showToast(`Contract added: ${normalizedAddress.slice(0, 10)}...`, 'success');
      } else {
        updateDialogStatus(statusEl, '⚠ Address saved but no contract info found', 'success');
      }
    }
    
    // Refresh list
    renderContractList();
    updateStats();
    
    // Close dialog after short delay
    setTimeout(() => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    }, 1000);
    
  } catch (err) {
    console.error('[Add Address] Error:', err);
    updateDialogStatus(statusEl, `Error: ${err.message}`, 'error');
  } finally {
    state.isAddingAddress = false;
    if (fetchBtn) fetchBtn.disabled = false;
  }
}

/**
 * Update dialog status message.
 * @param {HTMLElement} statusEl - Status element
 * @param {string} message - Status message
 * @param {'loading'|'success'|'error'} type - Status type
 */
function updateDialogStatus(statusEl, message, type) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `add-status ${type}`;
}

/**
 * Fetch token symbol using Multicall3.
 * @param {string} address - Contract address
 * @param {string} chainId - Chain ID
 * @returns {Promise<{symbol: string|null}|null>}
 */
async function fetchTokenInfo(address, chainId) {
  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) return null;
  
  const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
  const MULTICALL3_ABI = [
    'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[])'
  ];
  const ERC20_ABI = [
    'function symbol() view returns (string)'
  ];
  
  try {
    const iface = new ethers.utils.Interface(MULTICALL3_ABI);
    const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
    
    // Build call for symbol only
    const calls = [
      { target: address, callData: '0x95d89b41' } // symbol()
    ];
    
    const calldata = iface.encodeFunctionData('tryAggregate', [false, calls]);
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: MULTICALL3_ADDRESS, data: calldata }, 'latest']
      })
    });
    
    if (!response.ok) return null;
    
    const json = await response.json();
    if (json.error) return null;
    
    const decoded = iface.decodeFunctionResult('tryAggregate', json.result);
    const results = decoded[0];
    
    let symbol = null;
    
    // Decode symbol
    if (results[0]?.success && results[0]?.returnData !== '0x') {
      try {
        const symbolDecoded = erc20Interface.decodeFunctionResult('symbol', results[0].returnData);
        symbol = symbolDecoded[0];
      } catch (e) {}
    }
    
    return { symbol };
  } catch (err) {
    console.error('[Token Info] Error:', err);
    return null;
  }
}

/**
 * Filter ABI to remove error entries.
 * Only keep functions, events, constructors, fallback, and receive.
 * @param {Object[]} abi - The raw ABI array
 * @returns {Object[]|null} Filtered ABI or null if empty
 */
function filterAbi(abi) {
  if (!Array.isArray(abi)) return null;
  
  // Filter to keep only useful entries (exclude error types)
  const filtered = abi.filter(item => {
    const type = item.type;
    return type === 'function' || type === 'event' || type === 'constructor' || 
           type === 'fallback' || type === 'receive';
  });
  
  // Return null if no useful entries remain
  return filtered.length > 0 ? filtered : null;
}

/**
 * Fetch contract name and ABI from Etherscan API.
 * @param {string} address - Contract address
 * @param {string} chainId - Chain ID
 * @returns {Promise<{name: string|null, abi: Object[]|null, isProxy: boolean, implementation: string|null}|null>}
 */
async function fetchContractInfo(address, chainId) {
  const apiUrl = getApiUrl(chainId);
  const isRoutescan = isRoutescanChain(chainId);
  const apiKey = getNextApiKey();
  
  try {
    // Fetch source code (includes name and proxy detection)
    const sourceCodeUrl = isRoutescan
      ? `${apiUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`
      : `${apiUrl}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
    
    const sourceResponse = await fetch(sourceCodeUrl);
    if (!sourceResponse.ok) return null;
    
    const sourceData = await sourceResponse.json();
    
    if (sourceData.status !== '1' || !sourceData.result?.[0]) {
      return null;
    }
    
    const contractInfo = sourceData.result[0];
    let name = contractInfo.ContractName || null;
    let abi = null;
    let isProxy = false;
    let implementation = null;
    
    // Try to parse ABI (filter out error-only ABIs)
    if (contractInfo.ABI && contractInfo.ABI !== 'Contract source code not verified') {
      try {
        const parsedAbi = JSON.parse(contractInfo.ABI);
        // Filter out error entries, keep only functions, events, constructors, etc.
        abi = filterAbi(parsedAbi);
      } catch (e) {}
    }
    
    // Check for proxy
    if (contractInfo.Implementation && contractInfo.Implementation !== '') {
      isProxy = true;
      implementation = contractInfo.Implementation;
      
      // Fetch implementation ABI
      const implUrl = isRoutescan
        ? `${apiUrl}?module=contract&action=getsourcecode&address=${implementation}&apikey=${apiKey}`
        : `${apiUrl}?chainid=${chainId}&module=contract&action=getsourcecode&address=${implementation}&apikey=${apiKey}`;
      
      const implResponse = await fetch(implUrl);
      if (implResponse.ok) {
        const implData = await implResponse.json();
        if (implData.status === '1' && implData.result?.[0]) {
          const implInfo = implData.result[0];
          // Use implementation name if proxy has generic name
          if (implInfo.ContractName && (!name || name === 'Proxy' || name === 'TransparentUpgradeableProxy')) {
            name = implInfo.ContractName;
          }
          // Use implementation ABI (filter out error entries)
          if (implInfo.ABI && implInfo.ABI !== 'Contract source code not verified') {
            try {
              const parsedAbi = JSON.parse(implInfo.ABI);
              abi = filterAbi(parsedAbi);
            } catch (e) {}
          }
        }
      }
    }
    
    return { name, abi, isProxy, implementation };
  } catch (err) {
    console.error('[Contract Info] Error:', err);
    return null;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
