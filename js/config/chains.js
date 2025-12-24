/**
 * Chain Configuration Module
 * 
 * Provides chain ID to explorer URL mapping and chain metadata.
 * Used for generating links to block explorers and identifying networks.
 */

/**
 * Chain configuration object mapping chain IDs to their metadata.
 * Each entry contains the explorer URL and human-readable name.
 * @type {Object.<string, {explorer: string, name: string}>}
 */
const CHAIN_CONFIG = {
  '1': {
    explorer: 'https://etherscan.io',
    name: 'Ethereum Mainnet'
  },
  '10': {
    explorer: 'https://optimistic.etherscan.io',
    name: 'Optimism'
  },
  '56': {
    explorer: 'https://bscscan.com',
    name: 'BNB Smart Chain'
  },
  '137': {
    explorer: 'https://polygonscan.com',
    name: 'Polygon'
  },
  '239': {
    explorer: 'https://explorer.tac.build',
    name: 'TAC'
  },
  '1329': {
    explorer: 'https://seitrace.com',
    name: 'Sei'
  },
  '4200': {
    explorer: 'https://scan.merlinchain.io',
    name: 'Merlin Chain'
  },
  '5000': {
    explorer: 'https://mantlescan.xyz',
    name: 'Mantle'
  },
  '8453': {
    explorer: 'https://basescan.org',
    name: 'Base'
  },
  '9745': {
    explorer: 'https://plasmascan.to',
    name: 'Plasma'
  },
  '42161': {
    explorer: 'https://arbiscan.io',
    name: 'Arbitrum One'
  },
  '43114': {
    explorer: 'https://snowscan.xyz',
    name: 'Avalanche C-Chain'
  },
  '80094': {
    explorer: 'https://berascan.com',
    name: 'Berachain'
  },
  '81457': {
    explorer: 'https://blastscan.io',
    name: 'Blast'
  },
  '534352': {
    explorer: 'https://scrollscan.com',
    name: 'Scroll'
  },
  '11155111': {
    explorer: 'https://sepolia.etherscan.io',
    name: 'Sepolia Testnet'
  }
};

/**
 * Get the block explorer URL for a given chain ID.
 * @param {string|number} chainId - The chain ID
 * @returns {string} The explorer base URL, or empty string if not found
 */
function getExplorerUrl(chainId) {
  const config = CHAIN_CONFIG[String(chainId)];
  return config ? config.explorer : '';
}

/**
 * Get the human-readable chain name for a given chain ID.
 * @param {string|number} chainId - The chain ID
 * @returns {string} The chain name, or 'Unknown Chain' if not found
 */
function getChainName(chainId) {
  const config = CHAIN_CONFIG[String(chainId)];
  return config ? config.name : 'Unknown Chain';
}

/**
 * Get all available chain IDs sorted numerically.
 * @returns {string[]} Array of chain IDs
 */
function getAllChainIds() {
  return Object.keys(CHAIN_CONFIG).sort((a, b) => Number(a) - Number(b));
}

/**
 * Check if a chain ID is supported.
 * @param {string|number} chainId - The chain ID to check
 * @returns {boolean} True if the chain is supported
 */
function isChainSupported(chainId) {
  return String(chainId) in CHAIN_CONFIG;
}

// Export for ES modules
export {
  CHAIN_CONFIG,
  getExplorerUrl,
  getChainName,
  getAllChainIds,
  isChainSupported
};
