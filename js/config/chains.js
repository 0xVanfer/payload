/**
 * Chain Configuration Module
 * 
 * Provides chain ID to explorer URL mapping and chain metadata.
 * Used for generating links to block explorers and identifying networks.
 * Also provides RPC URLs for on-chain queries (e.g., contract info lookup).
 */

/**
 * Chain configuration object mapping chain IDs to their metadata.
 * Each entry contains:
 * - explorer: Block explorer base URL
 * - name: Human-readable chain name
 * - rpc: Public RPC endpoint URL for on-chain queries
 * 
 * RPC URLs are public endpoints. For production use, consider using
 * private RPC providers or rate-limited endpoints.
 * 
 * @type {Object.<string, {explorer: string, name: string, rpc: string}>}
 */
const CHAIN_CONFIG = {
  '1': {
    explorer: 'https://etherscan.io',
    name: 'Ethereum Mainnet',
    rpc: 'https://eth.drpc.org'
  },
  '10': {
    explorer: 'https://optimistic.etherscan.io',
    name: 'Optimism',
    rpc: 'https://optimism.drpc.org'
  },
  '56': {
    explorer: 'https://bscscan.com',
    name: 'BNB Smart Chain',
    rpc: 'https://bsc.drpc.org'
  },
  '137': {
    explorer: 'https://polygonscan.com',
    name: 'Polygon',
    rpc: 'https://polygon.drpc.org'
  },
  '239': {
    explorer: 'https://explorer.tac.build',
    name: 'TAC',
    rpc: 'https://turin.rpc.tac.build'
  },
  '1329': {
    explorer: 'https://seitrace.com',
    name: 'Sei',
    rpc: 'https://evm-rpc.sei-apis.com'
  },
  '4200': {
    explorer: 'https://scan.merlinchain.io',
    name: 'Merlin Chain',
    rpc: 'https://rpc.merlinchain.io'
  },
  '5000': {
    explorer: 'https://mantlescan.xyz',
    name: 'Mantle',
    rpc: 'https://mantle.drpc.org'
  },
  '8453': {
    explorer: 'https://basescan.org',
    name: 'Base',
    rpc: 'https://base.drpc.org'
  },
  '9745': {
    explorer: 'https://plasmascan.to',
    name: 'Plasma',
    rpc: 'https://rpc.plasma.nexus'
  },
  '42161': {
    explorer: 'https://arbiscan.io',
    name: 'Arbitrum One',
    rpc: 'https://arbitrum.drpc.org'
  },
  '43114': {
    explorer: 'https://snowscan.xyz',
    name: 'Avalanche C-Chain',
    rpc: 'https://avalanche.drpc.org'
  },
  '80094': {
    explorer: 'https://berascan.com',
    name: 'Berachain',
    rpc: 'https://rpc.berachain.com'
  },
  '81457': {
    explorer: 'https://blastscan.io',
    name: 'Blast',
    rpc: 'https://blast.drpc.org'
  },
  '534352': {
    explorer: 'https://scrollscan.com',
    name: 'Scroll',
    rpc: 'https://scroll.drpc.org'
  },
  '11155111': {
    explorer: 'https://sepolia.etherscan.io',
    name: 'Sepolia Testnet',
    rpc: 'https://sepolia.drpc.org'
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

/**
 * Get the RPC URL for a given chain ID.
 * Used for on-chain queries like contract info lookup.
 * @param {string|number} chainId - The chain ID
 * @returns {string} The RPC URL, or empty string if not configured
 */
function getRpcUrl(chainId) {
  const config = CHAIN_CONFIG[String(chainId)];
  return config ? config.rpc : '';
}

// Export for ES modules
export {
  CHAIN_CONFIG,
  getExplorerUrl,
  getChainName,
  getAllChainIds,
  isChainSupported,
  getRpcUrl
};
