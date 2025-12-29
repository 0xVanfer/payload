/**
 * VNet Reader State Module
 * 
 * Centralized state management for the VNet Reader application.
 */

/**
 * Application state for VNet Reader.
 */
export const state = {
  rpcUrl: null,
  chainId: '1',
  provider: null,              // VNet provider
  productionProvider: null,    // Production mainnet provider for comparison
  addresses: [],           // Addresses passed from main app
  addressSymbols: {},      // Map of address -> symbol (from main app or fetched)
  addressContractNames: {}, // Map of address -> contract name (from Etherscan)
  sessionMethods: [],      // Custom methods used in this session
  sessionAddresses: [],    // Custom addresses used in this session
  callHistory: [],         // History of calls made in this session
  currentMethod: null,     // Parsed method currently selected
  initialized: false,      // Whether initialization is complete
  contractABIs: {},        // Map of address -> { abi, methods, loadedAt }
  currentTargetAddress: null  // Currently selected target address (for ABI method prioritization)
};

/**
 * Reset state to initial values.
 */
export function resetState() {
  state.rpcUrl = null;
  state.chainId = '1';
  state.provider = null;
  state.productionProvider = null;
  state.addresses = [];
  state.addressSymbols = {};
  state.addressContractNames = {};
  state.sessionMethods = [];
  state.sessionAddresses = [];
  state.callHistory = [];
  state.currentMethod = null;
  state.initialized = false;
  state.contractABIs = {};
  state.currentTargetAddress = null;
}
