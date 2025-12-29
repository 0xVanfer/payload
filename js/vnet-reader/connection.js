/**
 * VNet Reader Connection Module
 * 
 * Handles provider initialization and connection status.
 */

import { state } from './state.js';
import { getExplorerUrl, getChainName, getRpcUrl } from '../config/chains.js';

/**
 * Parse URL parameters to get RPC URL and addresses.
 */
export function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  
  state.rpcUrl = params.get('rpc');
  state.chainId = params.get('chainId') || '1';
  
  // Parse addresses JSON array
  const addressesJson = params.get('addresses');
  if (addressesJson) {
    try {
      state.addresses = JSON.parse(addressesJson);
    } catch (e) {
      console.warn('[VNet Reader] Failed to parse addresses:', e);
      state.addresses = [];
    }
  }
  
  // Update connection info display
  updateConnectionDisplay();
}

/**
 * Update the connection info display (RPC, chain ID, explorer link).
 */
export function updateConnectionDisplay() {
  // Update RPC display
  const rpcDisplay = document.getElementById('rpc-url');
  if (rpcDisplay) {
    rpcDisplay.textContent = state.rpcUrl || 'Not provided';
  }
  
  // Update chain ID display
  const chainIdDisplay = document.getElementById('chain-id');
  if (chainIdDisplay) {
    const chainName = getChainName(state.chainId);
    chainIdDisplay.textContent = `${chainName} (${state.chainId})`;
  }
  
  // Update explorer link
  const explorerLink = document.getElementById('explorer-link');
  if (explorerLink) {
    const explorerUrl = getExplorerUrl(state.chainId);
    if (explorerUrl) {
      explorerLink.href = explorerUrl;
      explorerLink.classList.remove('disabled');
    } else {
      explorerLink.href = '#';
      explorerLink.classList.add('disabled');
    }
  }
}

/**
 * Initialize the ethers provider with the VNet RPC URL.
 * Also initializes a production provider for comparison.
 */
export async function initProvider() {
  if (!state.rpcUrl) {
    updateConnectionStatus(false, 'No RPC URL provided');
    return;
  }
  
  try {
    state.provider = new window.ethers.providers.JsonRpcProvider(state.rpcUrl);
    
    // Test connection
    const network = await state.provider.getNetwork();
    console.log('[VNet Reader] Connected to VNet:', network);
    
    updateConnectionStatus(true, `Connected (Chain ${network.chainId})`);
    
    // Initialize production provider for comparison
    const productionRpcUrl = getRpcUrl(state.chainId);
    if (productionRpcUrl) {
      try {
        state.productionProvider = new window.ethers.providers.JsonRpcProvider(productionRpcUrl);
        // Test production connection
        await state.productionProvider.getNetwork();
        console.log('[VNet Reader] Production provider ready:', productionRpcUrl);
      } catch (e) {
        console.warn('[VNet Reader] Failed to connect production provider:', e.message);
        state.productionProvider = null;
      }
    } else {
      console.warn('[VNet Reader] No production RPC URL for chain:', state.chainId);
      state.productionProvider = null;
    }
    
  } catch (e) {
    console.error('[VNet Reader] Failed to connect:', e);
    updateConnectionStatus(false, `Failed: ${e.message}`);
  }
}

/**
 * Update the connection status indicator.
 * @param {boolean} connected - Whether connected successfully
 * @param {string} message - Status message
 */
export function updateConnectionStatus(connected, message) {
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.classList.remove('connected', 'disconnected');
    statusEl.classList.add(connected ? 'connected' : 'disconnected');
    statusEl.title = message;
  }
}

/**
 * Get the block explorer URL for an address.
 * @param {string} address - The address
 * @returns {string} The explorer URL for the address
 */
export function getAddressExplorerUrl(address) {
  const explorerUrl = getExplorerUrl(state.chainId);
  if (!explorerUrl) return '';
  return `${explorerUrl}/address/${address}`;
}
