/**
 * VNet Reader Address Module
 * 
 * Handles address selection, symbol fetching, contract name fetching, and address validation.
 */

import { state } from './state.js';
import { isValidAddress, formatAddress, debounce } from './utils.js';
import { getAddressExplorerUrl } from './connection.js';
import { loadContractABI, hasContractABI } from './abi-fetcher.js';
import { addContractABICategory } from './method.js';
import { getFromCache, saveToCache } from '../core/contract-name.js';
import { getNextApiKey, getApiUrl, isRoutescanChain } from '../config/etherscan-api.js';
import { getVnetDefaultAddresses } from '../core/cache-manager.js';

/**
 * Initialize the address selector with discovered addresses.
 * Fetches symbols for all addresses first to enable proper sorting.
 * Also includes addresses marked as VNet defaults from cache.
 * @returns {Promise<void>}
 */
export async function initAddressSelector() {
  const select = document.getElementById('target-address-select');
  const input = document.getElementById('target-address');
  const explorerBtn = document.getElementById('address-explorer-btn');
  
  if (!select || !input) return;
  
  // Clear existing options
  select.innerHTML = '<option value="">-- Select --</option>';
  
  // Get VNet default addresses from cache for the current chain
  const vnetDefaults = getVnetDefaultAddresses(state.chainId);
  const vnetDefaultAddressSet = new Set(vnetDefaults.map(v => v.address.toLowerCase()));
  
  // Combine discovered addresses with VNet defaults (avoid duplicates)
  const allAddresses = [...state.addresses];
  for (const vnetAddr of vnetDefaults) {
    if (!allAddresses.some(a => a.toLowerCase() === vnetAddr.address.toLowerCase())) {
      allAddresses.push(vnetAddr.address);
      // Pre-populate symbol/name info from cache
      if (vnetAddr.symbol) {
        state.addressSymbols[vnetAddr.address.toLowerCase()] = vnetAddr.symbol;
      }
      if (vnetAddr.name) {
        state.addressContractNames[vnetAddr.address.toLowerCase()] = vnetAddr.name;
      }
    }
  }
  
  // Fetch symbols for all discovered addresses first
  if (allAddresses.length > 0 && state.provider) {
    await fetchAllAddressSymbols(allAddresses);
    // Fetch contract names for addresses without symbols
    await fetchAllContractNames(allAddresses);
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
  
  // Add VNet default addresses that weren't in discovered addresses
  const additionalVnetAddresses = vnetDefaults.filter(
    v => !state.addresses.some(a => a.toLowerCase() === v.address.toLowerCase())
  );
  
  if (additionalVnetAddresses.length > 0) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'Saved Addresses';
    
    for (const vnetAddr of additionalVnetAddresses) {
      const option = document.createElement('option');
      option.value = vnetAddr.address;
      option.textContent = formatAddressOption(vnetAddr.address);
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
 * Fetch contract names for addresses without symbols.
 * Uses Etherscan API via cache module.
 * @param {string[]} addresses - The addresses to fetch names for
 */
export async function fetchAllContractNames(addresses) {
  // Filter addresses without symbols
  const addressesWithoutSymbol = addresses.filter(addr => 
    !state.addressSymbols[addr.toLowerCase()]
  );
  
  if (addressesWithoutSymbol.length === 0) return;
  
  console.log('[Address] Fetching contract names for', addressesWithoutSymbol.length, 'addresses');
  
  const promises = addressesWithoutSymbol.map(async (address) => {
    const normalizedAddr = address.toLowerCase();
    
    // Skip if already cached in state
    if (state.addressContractNames[normalizedAddr]) return;
    
    // Check browser cache first
    const cached = getFromCache(state.chainId, address);
    if (cached !== null) {
      if (cached.name) {
        state.addressContractNames[normalizedAddr] = cached.name;
      }
      return;
    }
    
    // Fetch from Etherscan
    try {
      const name = await fetchSingleContractName(address, state.chainId);
      if (name) {
        state.addressContractNames[normalizedAddr] = name;
      }
      // Save to browser cache
      saveToCache(state.chainId, address, name);
    } catch (e) {
      console.log('[Address] Failed to fetch contract name', { address, error: e.message });
    }
  });
  
  // Wait for all with a timeout
  await Promise.race([
    Promise.all(promises),
    new Promise(resolve => setTimeout(resolve, 10000)) // 10 second timeout
  ]);
  
  console.log('[Address] Contract names fetched', { 
    count: Object.keys(state.addressContractNames).length 
  });
}

/**
 * Proxy contract names that should trigger implementation lookup.
 * @type {string[]}
 */
const PROXY_CONTRACT_NAMES = [
  'Proxy',
  'TransparentUpgradeableProxy',
  'ERC1967Proxy',
  'BeaconProxy',
  'AdminUpgradeabilityProxy',
  'OwnedUpgradeabilityProxy',
  'InitializableAdminUpgradeabilityProxy'
];

/**
 * Check if a contract name indicates a proxy contract.
 * @param {string} name - The contract name
 * @returns {boolean} True if it's a proxy contract
 */
function isProxyContractName(name) {
  if (!name) return false;
  return PROXY_CONTRACT_NAMES.some(proxyName => 
    name === proxyName || name.endsWith(proxyName)
  );
}

/**
 * Fetch contract name for a single address from Etherscan.
 * If the contract is a proxy, also fetches the implementation contract name.
 * @param {string} address - The contract address
 * @param {string} chainId - The chain ID
 * @returns {Promise<string|null>} Contract name or null
 */
async function fetchSingleContractName(address, chainId) {
  const normalizedChainId = String(chainId);
  const apiUrl = getApiUrl(normalizedChainId);
  const isRoutescan = isRoutescanChain(normalizedChainId);
  const apiKey = getNextApiKey();
  
  const fetchUrl = isRoutescan
    ? `${apiUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`
    : `${apiUrl}?chainid=${normalizedChainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
  
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === '1' && data.result && data.result[0]) {
      const contractInfo = data.result[0];
      const contractName = contractInfo.ContractName;
      
      if (contractName && contractName !== '' && contractName !== 'Contract source code not verified') {
        // Check if it's a proxy contract and has implementation address
        const implAddress = contractInfo.Implementation;
        if (isProxyContractName(contractName) && implAddress && implAddress !== '') {
          console.log('[Address] Proxy detected, fetching implementation name', { 
            address, 
            proxyName: contractName,
            implementation: implAddress 
          });
          
          // Fetch implementation contract name
          const implName = await fetchImplementationName(implAddress, normalizedChainId);
          
          if (implName) {
            return `${implName}(Proxy)`;
          }
        }
        
        return contractName;
      }
    }
    
    return null;
  } catch (e) {
    console.log('[Address] Failed to fetch contract name', { address, error: e.message });
    return null;
  }
}

/**
 * Fetch contract name for an implementation address.
 * @param {string} address - The implementation contract address
 * @param {string} chainId - The chain ID
 * @returns {Promise<string|null>} Contract name or null
 */
async function fetchImplementationName(address, chainId) {
  const apiUrl = getApiUrl(chainId);
  const isRoutescan = isRoutescanChain(chainId);
  const apiKey = getNextApiKey();
  
  const fetchUrl = isRoutescan
    ? `${apiUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`
    : `${apiUrl}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
  
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === '1' && data.result && data.result[0]) {
      const contractInfo = data.result[0];
      const contractName = contractInfo.ContractName;
      
      if (contractName && contractName !== '' && contractName !== 'Contract source code not verified') {
        return contractName;
      }
    }
    
    return null;
  } catch (e) {
    console.log('[Address] Failed to fetch implementation name', { address, error: e.message });
    return null;
  }
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
    const nameA = state.addressContractNames[a.toLowerCase()];
    const nameB = state.addressContractNames[b.toLowerCase()];
    
    // Both have symbols - sort alphabetically by symbol
    if (symbolA && symbolB) {
      return symbolA.localeCompare(symbolB);
    }
    // Only a has symbol - a comes first
    if (symbolA && !symbolB) return -1;
    // Only b has symbol - b comes first
    if (!symbolA && symbolB) return 1;
    
    // Neither has symbol - check contract names
    if (nameA && nameB) {
      return nameA.localeCompare(nameB);
    }
    if (nameA && !nameB) return -1;
    if (!nameA && nameB) return 1;
    
    // Neither has symbol nor contract name - maintain original order
    return 0;
  });
}

/**
 * Format an address for display in the dropdown.
 * Shows symbol first if available, then contract name, for easy identification.
 * @param {string} address - The address
 * @returns {string} Formatted string
 */
export function formatAddressOption(address) {
  const symbol = state.addressSymbols[address.toLowerCase()];
  const contractName = state.addressContractNames[address.toLowerCase()];
  return formatAddress(address, symbol, contractName);
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
