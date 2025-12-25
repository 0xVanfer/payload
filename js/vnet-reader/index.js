/**
 * VNet Reader - Main Entry Point
 * 
 * Provides functionality to read contract state on Tenderly Virtual Networks.
 * Supports preset methods, custom method input, and address selection from
 * discovered addresses in the payload parser.
 * 
 * Features:
 * - Dynamic parameter input based on method signature
 * - Fuzzy search for preset methods
 * - Session-level storage for custom methods and addresses
 * - Call history tracking
 */

import { state } from './state.js';
import { parseUrlParams, initProvider } from './connection.js';
import { initAddressSelector } from './address.js';
import { initMethodSelector, initPresetSelectors, clearMethodForm } from './method.js';
import { executeCall } from './call.js';
import { clearHistory } from './history.js';

/**
 * Initialize the VNet Reader application.
 */
async function init() {
  console.log('[VNet Reader] Initializing...');
  
  // Parse URL parameters
  parseUrlParams();
  
  // Initialize provider
  await initProvider();
  
  // Initialize UI components (this will fetch symbols)
  await initAddressSelector();
  initMethodSelector();
  initPresetSelectors();
  initEventListeners();
  
  // Mark initialization complete
  state.initialized = true;
  
  console.log('[VNet Reader] Initialized', {
    rpc: state.rpcUrl,
    chainId: state.chainId,
    addressCount: state.addresses.length
  });
}

/**
 * Initialize event listeners for buttons.
 */
function initEventListeners() {
  // Call button
  const callBtn = document.getElementById('call-btn');
  if (callBtn) {
    callBtn.addEventListener('click', executeCall);
  }
  
  // Clear button
  const clearBtn = document.getElementById('clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearForm);
  }
  
  // Clear history button
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }
}

/**
 * Clear the form.
 */
function clearForm() {
  document.getElementById('target-address').value = '';
  clearMethodForm();
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
  state,
  executeCall
};
