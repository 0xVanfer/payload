/**
 * VNet Reader Address Module
 * 
 * Handles address selection, symbol fetching, and address validation.
 */

import { state } from './state.js';
import { isValidAddress, formatAddress, debounce } from './utils.js';
import { getAddressExplorerUrl } from './connection.js';

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
  select.addEventListener('change', (e) => {
    if (e.target.value) {
      input.value = e.target.value;
      updateExplorerButton();
    }
  });
  
  // Handle input change
  input.addEventListener('input', debounce((e) => {
    updateExplorerButton();
  }, 300));
  
  // Initialize explorer button
  if (explorerBtn) {
    explorerBtn.addEventListener('click', () => {
      const address = input.value.trim();
      if (isValidAddress(address)) {
        const url = getAddressExplorerUrl(address);
        if (url) window.open(url, '_blank');
      }
    });
    updateExplorerButton();
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
