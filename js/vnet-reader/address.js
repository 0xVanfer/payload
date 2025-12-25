/**
 * VNet Reader Address Module
 * 
 * Handles address selection, symbol fetching, and address validation.
 */

import { state } from './state.js';
import { isValidAddress, formatAddress, debounce } from './utils.js';
import { getAddressExplorerUrl } from './connection.js';
import { loadContractABI, hasContractABI } from './abi-fetcher.js';
import { addContractABICategory } from './method.js';

/**
 * Initialize the address selector with discovered addresses.
 * Fetches symbols for all addresses first to enable proper sorting.
 * @returns {Promise<void>}
 */
export async function initAddressSelector() {
  const select = document.getElementById('target-address-select');
  const input = document.getElementById('target-address');
  const explorerBtn = document.getElementById('address-explorer-btn');
  
  if (!select || !input) return;
  
  // Clear existing options
  select.innerHTML = '<option value="">-- Select --</option>';
  
  // Fetch symbols for all discovered addresses first
  if (state.addresses.length > 0 && state.provider) {
    await fetchAllAddressSymbols(state.addresses);
  }
  
  // Add discovered addresses, sorted by symbol presence
  if (state.addresses.length > 0) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'Discovered Addresses';
    
    // Sort addresses: those with symbols first
    const sortedAddresses = sortAddressesBySymbol(state.addresses);
    
    for (const addr of sortedAddresses) {
      const option = document.createElement('option');
      option.value = addr;
      option.textContent = formatAddressOption(addr);
      optgroup.appendChild(option);
    }
    
    select.appendChild(optgroup);
  }
  
  // Handle select change
  select.onchange = async (e) => {
    if (e.target.value) {
      input.value = e.target.value;
      updateExplorerButton();
      // Load contract ABI for selected address
      await onTargetAddressChanged(e.target.value);
    }
  };
  
  // Handle input change with ABI loading
  const debouncedInputHandler = debounce(async (e) => {
    updateExplorerButton();
    const address = e.target.value.trim();
    
    // Sync select dropdown with input value
    syncSelectWithInput(select, address);
    
    if (isValidAddress(address)) {
      await onTargetAddressChanged(address);
    }
  }, 300);
  
  input.oninput = debouncedInputHandler;
  
  // Initialize explorer button
  if (explorerBtn) {
    explorerBtn.onclick = () => {
      const address = input.value.trim();
      if (isValidAddress(address)) {
        const url = getAddressExplorerUrl(address);
        if (url) window.open(url, '_blank');
      }
    };
    updateExplorerButton();
  }
}

/**
 * Sync the select dropdown value with the input value.
 * @param {HTMLSelectElement} select - The select element
 * @param {string} address - The address value
 */
function syncSelectWithInput(select, address) {
  if (!select || !address) {
    if (select) select.value = '';
    return;
  }
  
  const normalizedAddress = address.toLowerCase();
  
  // Find matching option
  const options = select.querySelectorAll('option');
  let found = false;
  
  for (const option of options) {
    if (option.value.toLowerCase() === normalizedAddress) {
      select.value = option.value;
      found = true;
      break;
    }
  }
  
  // If not found, reset to default
  if (!found) {
    select.value = '';
  }
}

/**
 * Update the explorer button state based on address validity.
 */
export function updateExplorerButton() {
  const input = document.getElementById('target-address');
  const btn = document.getElementById('address-explorer-btn');
  if (!btn || !input) return;
  
  const address = input.value.trim();
  if (isValidAddress(address)) {
    btn.classList.remove('disabled');
    btn.disabled = false;
  } else {
    btn.classList.add('disabled');
    btn.disabled = true;
  }
}

/**
 * Fetch symbols for multiple addresses in parallel.
 * @param {string[]} addresses - The addresses to fetch symbols for
 */
export async function fetchAllAddressSymbols(addresses) {
  if (!state.provider) return;
  
  const promises = addresses.map(async (address) => {
    // Skip if already cached
    if (state.addressSymbols[address.toLowerCase()]) return;
    
    try {
      const contract = new window.ethers.Contract(
        address,
        ['function symbol() view returns (string)'],
        state.provider
      );
      
      const symbol = await contract.symbol();
      state.addressSymbols[address.toLowerCase()] = symbol;
    } catch (e) {
      // Not a token contract, ignore
    }
  });
  
  // Wait for all with a timeout
  await Promise.race([
    Promise.all(promises),
    new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
  ]);
}

/**
 * Sort addresses by symbol presence (addresses with symbols first).
 * @param {string[]} addresses - The addresses to sort
 * @returns {string[]} Sorted addresses
 */
export function sortAddressesBySymbol(addresses) {
  return [...addresses].sort((a, b) => {
    const symbolA = state.addressSymbols[a.toLowerCase()];
    const symbolB = state.addressSymbols[b.toLowerCase()];
    
    // Both have symbols - sort alphabetically by symbol
    if (symbolA && symbolB) {
      return symbolA.localeCompare(symbolB);
    }
    // Only a has symbol - a comes first
    if (symbolA && !symbolB) return -1;
    // Only b has symbol - b comes first
    if (!symbolA && symbolB) return 1;
    // Neither has symbol - maintain original order
    return 0;
  });
}

/**
 * Format an address for display in the dropdown.
 * Shows symbol first if available for easy identification.
 * @param {string} address - The address
 * @returns {string} Formatted string
 */
export function formatAddressOption(address) {
  const symbol = state.addressSymbols[address.toLowerCase()];
  return formatAddress(address, symbol);
}

/**
 * Initialize a parameter address select dropdown.
 * Sorts addresses with symbols first for easy selection.
 * @param {HTMLSelectElement} select - The select element
 */
export function initParamAddressSelect(select) {
  const input = select.parentElement.querySelector('.param-address-input');
  
  // Populate with discovered addresses, sorted by symbol
  select.innerHTML = '<option value="">-- Select --</option>';
  
  const sortedAddresses = sortAddressesBySymbol(state.addresses);
  
  for (const addr of sortedAddresses) {
    const option = document.createElement('option');
    option.value = addr;
    option.textContent = formatAddressOption(addr);
    select.appendChild(option);
  }
  
  // Handle select change
  select.addEventListener('change', () => {
    if (select.value && input) {
      input.value = select.value;
    }
  });
}

/**
 * Update all address dropdowns with session addresses.
 */
export function updateAddressDropdowns() {
  const selects = document.querySelectorAll('.param-address-select, #target-address-select');
  
  for (const select of selects) {
    // Check if session optgroup exists
    let sessionGroup = select.querySelector('optgroup[label="Recent Addresses"]');
    
    if (!sessionGroup && state.sessionAddresses.length > 0) {
      sessionGroup = document.createElement('optgroup');
      sessionGroup.label = 'Recent Addresses';
      select.insertBefore(sessionGroup, select.firstChild.nextSibling);
    }
    
    if (sessionGroup) {
      sessionGroup.innerHTML = '';
      for (const addr of state.sessionAddresses) {
        const option = document.createElement('option');
        option.value = addr;
        option.textContent = formatAddressOption(addr);
        sessionGroup.appendChild(option);
      }
    }
  }
}

/**
 * Add an address to session addresses.
 * @param {string} address - The address
 */
export function addToSessionAddresses(address) {
  if (!address || !isValidAddress(address)) return;
  
  const normalized = address.toLowerCase();
  
  // Check if already in discovered or session
  const inDiscovered = state.addresses.some(a => a.toLowerCase() === normalized);
  const inSession = state.sessionAddresses.some(a => a.toLowerCase() === normalized);
  
  if (!inDiscovered && !inSession) {
    state.sessionAddresses.unshift(address);
    
    // Limit session addresses
    if (state.sessionAddresses.length > 20) {
      state.sessionAddresses.pop();
    }
    
    // Update address dropdowns
    updateAddressDropdowns();
  }
}

/**
 * Handle target address change - update state and load contract ABI.
 * Shows a loading indicator while fetching ABI.
 * @param {string} address - The new target address
 */
export async function onTargetAddressChanged(address) {
  if (!address || !isValidAddress(address)) return;
  
  // Update current target address in state
  state.currentTargetAddress = address.toLowerCase();
  
  // Check if ABI already loaded
  if (hasContractABI(address)) {
    console.log('[Address] ABI already loaded for', address);
    showABIStatus(address, 'loaded');
    // Switch to the contract's category
    addContractABICategory(address);
    return;
  }
  
  // Show loading status
  showABIStatus(address, 'loading');
  
  // Try to load ABI
  const success = await loadContractABI(address);
  
  if (success) {
    showABIStatus(address, 'loaded');
    // Add contract to category selector and switch to it
    addContractABICategory(address);
  } else {
    showABIStatus(address, 'not-found');
  }
}

/**
 * Show ABI loading status near the address input.
 * @param {string} address - The contract address
 * @param {'loading'|'loaded'|'not-found'} status - The status to show
 */
function showABIStatus(address, status) {
  const container = document.querySelector('.address-input-wrapper');
  if (!container) return;
  
  // Remove existing status
  const existing = container.querySelector('.abi-status');
  if (existing) existing.remove();
  
  // Create status element
  const statusEl = document.createElement('span');
  statusEl.className = 'abi-status';
  
  switch (status) {
    case 'loading':
      statusEl.textContent = '⏳';
      statusEl.title = 'Loading contract ABI...';
      statusEl.classList.add('abi-status-loading');
      break;
    case 'loaded':
      statusEl.textContent = '✓';
      statusEl.title = 'Contract ABI loaded - methods available in search';
      statusEl.classList.add('abi-status-loaded');
      break;
    case 'not-found':
      statusEl.textContent = '';
      statusEl.title = 'Contract not verified or ABI not available';
      statusEl.classList.add('abi-status-not-found');
      break;
  }
  
  container.appendChild(statusEl);
  
  // Auto-hide after a few seconds for non-loading states
  if (status !== 'loading') {
    setTimeout(() => {
      if (statusEl.parentNode) {
        statusEl.classList.add('abi-status-fade');
      }
    }, 3000);
  }
}
