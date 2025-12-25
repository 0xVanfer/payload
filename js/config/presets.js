/**
 * Preset Methods Configuration
 * 
 * Contains commonly used contract read methods for various standards.
 * These presets are used in the VNet Reader for quick method selection.
 * 
 * Each preset includes:
 * - signature: The function signature (input types)
 * - outputs: The return types (optional, for display)
 * - description: Human-readable description
 * 
 * Method signatures follow Solidity format:
 * - Input: functionName(type1,type2,...)
 * - Full (with output): functionName(type1,type2)(returnType1,returnType2)
 */

/**
 * ERC20 standard read methods.
 */
const ERC20_METHODS = [
  {
    name: 'name',
    signature: 'name()',
    outputs: '(string)',
    description: 'Returns the name of the token'
  },
  {
    name: 'symbol',
    signature: 'symbol()',
    outputs: '(string)',
    description: 'Returns the symbol of the token'
  },
  {
    name: 'decimals',
    signature: 'decimals()',
    outputs: '(uint8)',
    description: 'Returns the number of decimals'
  },
  {
    name: 'totalSupply',
    signature: 'totalSupply()',
    outputs: '(uint256)',
    description: 'Returns the total token supply'
  },
  {
    name: 'balanceOf',
    signature: 'balanceOf(address)',
    outputs: '(uint256)',
    description: 'Returns the balance of an account'
  },
  {
    name: 'allowance',
    signature: 'allowance(address,address)',
    outputs: '(uint256)',
    description: 'Returns the allowance (owner, spender)'
  }
];

/**
 * ERC721 (NFT) standard read methods.
 */
const ERC721_METHODS = [
  {
    name: 'name',
    signature: 'name()',
    outputs: '(string)',
    description: 'Returns the collection name'
  },
  {
    name: 'symbol',
    signature: 'symbol()',
    outputs: '(string)',
    description: 'Returns the collection symbol'
  },
  {
    name: 'tokenURI',
    signature: 'tokenURI(uint256)',
    outputs: '(string)',
    description: 'Returns the token metadata URI'
  },
  {
    name: 'ownerOf',
    signature: 'ownerOf(uint256)',
    outputs: '(address)',
    description: 'Returns the owner of a token'
  },
  {
    name: 'balanceOf',
    signature: 'balanceOf(address)',
    outputs: '(uint256)',
    description: 'Returns the number of tokens owned'
  },
  {
    name: 'getApproved',
    signature: 'getApproved(uint256)',
    outputs: '(address)',
    description: 'Returns the approved address for a token'
  },
  {
    name: 'isApprovedForAll',
    signature: 'isApprovedForAll(address,address)',
    outputs: '(bool)',
    description: 'Returns if operator is approved (owner, operator)'
  },
  {
    name: 'totalSupply',
    signature: 'totalSupply()',
    outputs: '(uint256)',
    description: 'Returns the total number of tokens (ERC721Enumerable)'
  },
  {
    name: 'tokenByIndex',
    signature: 'tokenByIndex(uint256)',
    outputs: '(uint256)',
    description: 'Returns token ID at index (ERC721Enumerable)'
  },
  {
    name: 'tokenOfOwnerByIndex',
    signature: 'tokenOfOwnerByIndex(address,uint256)',
    outputs: '(uint256)',
    description: 'Returns token ID owned by address at index'
  }
];

/**
 * ERC1155 (Multi Token) standard read methods.
 */
const ERC1155_METHODS = [
  {
    name: 'uri',
    signature: 'uri(uint256)',
    outputs: '(string)',
    description: 'Returns the URI for a token type'
  },
  {
    name: 'balanceOf',
    signature: 'balanceOf(address,uint256)',
    outputs: '(uint256)',
    description: 'Returns the balance of a token type for an account'
  },
  {
    name: 'balanceOfBatch',
    signature: 'balanceOfBatch(address[],uint256[])',
    outputs: '(uint256[])',
    description: 'Returns balances for multiple account/token pairs'
  },
  {
    name: 'isApprovedForAll',
    signature: 'isApprovedForAll(address,address)',
    outputs: '(bool)',
    description: 'Returns if operator is approved (owner, operator)'
  }
];

/**
 * ERC4626 (Tokenized Vault) standard read methods.
 */
const ERC4626_METHODS = [
  {
    name: 'asset',
    signature: 'asset()',
    outputs: '(address)',
    description: 'Returns the underlying asset address'
  },
  {
    name: 'totalAssets',
    signature: 'totalAssets()',
    outputs: '(uint256)',
    description: 'Returns the total amount of underlying assets'
  },
  {
    name: 'convertToShares',
    signature: 'convertToShares(uint256)',
    outputs: '(uint256)',
    description: 'Converts assets to shares'
  },
  {
    name: 'convertToAssets',
    signature: 'convertToAssets(uint256)',
    outputs: '(uint256)',
    description: 'Converts shares to assets'
  },
  {
    name: 'maxDeposit',
    signature: 'maxDeposit(address)',
    outputs: '(uint256)',
    description: 'Returns max deposit for receiver'
  },
  {
    name: 'maxMint',
    signature: 'maxMint(address)',
    outputs: '(uint256)',
    description: 'Returns max shares mintable for receiver'
  },
  {
    name: 'maxWithdraw',
    signature: 'maxWithdraw(address)',
    outputs: '(uint256)',
    description: 'Returns max assets withdrawable by owner'
  },
  {
    name: 'maxRedeem',
    signature: 'maxRedeem(address)',
    outputs: '(uint256)',
    description: 'Returns max shares redeemable by owner'
  },
  {
    name: 'previewDeposit',
    signature: 'previewDeposit(uint256)',
    outputs: '(uint256)',
    description: 'Preview shares for deposit amount'
  },
  {
    name: 'previewMint',
    signature: 'previewMint(uint256)',
    outputs: '(uint256)',
    description: 'Preview assets needed for mint amount'
  },
  {
    name: 'previewWithdraw',
    signature: 'previewWithdraw(uint256)',
    outputs: '(uint256)',
    description: 'Preview shares burned for withdraw amount'
  },
  {
    name: 'previewRedeem',
    signature: 'previewRedeem(uint256)',
    outputs: '(uint256)',
    description: 'Preview assets for redeem amount'
  }
];

/**
 * Ownership and access control read methods.
 */
const OWNERSHIP_METHODS = [
  {
    name: 'owner',
    signature: 'owner()',
    outputs: '(address)',
    description: 'Returns the contract owner (Ownable)'
  },
  {
    name: 'pendingOwner',
    signature: 'pendingOwner()',
    outputs: '(address)',
    description: 'Returns the pending owner (Ownable2Step)'
  },
  {
    name: 'hasRole',
    signature: 'hasRole(bytes32,address)',
    outputs: '(bool)',
    description: 'Returns if address has role (AccessControl)'
  },
  {
    name: 'getRoleAdmin',
    signature: 'getRoleAdmin(bytes32)',
    outputs: '(bytes32)',
    description: 'Returns admin role for a role (AccessControl)'
  },
  {
    name: 'DEFAULT_ADMIN_ROLE',
    signature: 'DEFAULT_ADMIN_ROLE()',
    outputs: '(bytes32)',
    description: 'Returns the default admin role constant'
  },
  {
    name: 'paused',
    signature: 'paused()',
    outputs: '(bool)',
    description: 'Returns if contract is paused (Pausable)'
  }
];

/**
 * Proxy contract read methods.
 */
const PROXY_METHODS = [
  {
    name: 'implementation',
    signature: 'implementation()',
    outputs: '(address)',
    description: 'Returns the implementation address'
  },
  {
    name: 'admin',
    signature: 'admin()',
    outputs: '(address)',
    description: 'Returns the proxy admin address'
  },
  {
    name: 'getImplementation',
    signature: 'getImplementation()',
    outputs: '(address)',
    description: 'Returns the implementation (ERC1967)'
  },
  {
    name: 'getAdmin',
    signature: 'getAdmin()',
    outputs: '(address)',
    description: 'Returns the admin (ERC1967)'
  }
];

/**
 * Common utility read methods.
 */
const UTILITY_METHODS = [
  {
    name: 'supportsInterface',
    signature: 'supportsInterface(bytes4)',
    outputs: '(bool)',
    description: 'Returns if interface is supported (ERC165)'
  },
  {
    name: 'nonces',
    signature: 'nonces(address)',
    outputs: '(uint256)',
    description: 'Returns current nonce for permit'
  },
  {
    name: 'DOMAIN_SEPARATOR',
    signature: 'DOMAIN_SEPARATOR()',
    outputs: '(bytes32)',
    description: 'Returns EIP-712 domain separator'
  }
];

/**
 * All preset categories with their methods.
 */
const PRESET_CATEGORIES = {
  'ERC20': {
    label: 'ERC20 Token',
    methods: ERC20_METHODS
  },
  'ERC721': {
    label: 'ERC721 NFT',
    methods: ERC721_METHODS
  },
  'ERC1155': {
    label: 'ERC1155 Multi Token',
    methods: ERC1155_METHODS
  },
  'ERC4626': {
    label: 'ERC4626 Vault',
    methods: ERC4626_METHODS
  },
  'Ownership': {
    label: 'Ownership & Access',
    methods: OWNERSHIP_METHODS
  },
  'Proxy': {
    label: 'Proxy',
    methods: PROXY_METHODS
  },
  'Utility': {
    label: 'Utility',
    methods: UTILITY_METHODS
  }
};

/**
 * Get all preset methods as a flat array.
 * @returns {Array} Array of all preset methods with category info
 */
function getAllPresetMethods() {
  const allMethods = [];
  for (const [category, data] of Object.entries(PRESET_CATEGORIES)) {
    for (const method of data.methods) {
      allMethods.push({
        ...method,
        category,
        categoryLabel: data.label
      });
    }
  }
  return allMethods;
}

/**
 * Search preset methods by name or signature (fuzzy search).
 * @param {string} query - The search query
 * @returns {Array} Matching preset methods
 */
function searchPresetMethods(query) {
  if (!query || typeof query !== 'string') {
    return getAllPresetMethods();
  }
  
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) {
    return getAllPresetMethods();
  }
  
  const allMethods = getAllPresetMethods();
  
  // Score each method based on match quality
  const scored = allMethods.map(method => {
    let score = 0;
    const lowerName = method.name.toLowerCase();
    const lowerSig = method.signature.toLowerCase();
    const lowerDesc = (method.description || '').toLowerCase();
    
    // Exact name match - highest priority
    if (lowerName === lowerQuery) {
      score = 100;
    }
    // Name starts with query
    else if (lowerName.startsWith(lowerQuery)) {
      score = 80;
    }
    // Name contains query
    else if (lowerName.includes(lowerQuery)) {
      score = 60;
    }
    // Signature contains query
    else if (lowerSig.includes(lowerQuery)) {
      score = 40;
    }
    // Description contains query
    else if (lowerDesc.includes(lowerQuery)) {
      score = 20;
    }
    
    return { method, score };
  });
  
  // Filter and sort by score
  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.method);
}

/**
 * Get methods by category.
 * @param {string} category - The category name
 * @returns {Array} Methods in the category
 */
function getMethodsByCategory(category) {
  const categoryData = PRESET_CATEGORIES[category];
  if (!categoryData) return [];
  
  return categoryData.methods.map(method => ({
    ...method,
    category,
    categoryLabel: categoryData.label
  }));
}

/**
 * Get all category names.
 * @returns {string[]} Array of category names
 */
function getCategoryNames() {
  return Object.keys(PRESET_CATEGORIES);
}

/**
 * Parse a method signature into its components.
 * Handles formats like:
 * - "balanceOf(address)" -> { name: "balanceOf", inputs: ["address"], outputs: [] }
 * - "balanceOf(address)(uint256)" -> { name: "balanceOf", inputs: ["address"], outputs: ["uint256"] }
 * - "function balanceOf(address) returns (uint256)" -> same as above
 * 
 * @param {string} signature - The method signature
 * @returns {{name: string, inputs: string[], outputs: string[]}|null} Parsed components or null
 */
function parseMethodSignature(signature) {
  if (!signature || typeof signature !== 'string') {
    return null;
  }
  
  let cleaned = signature.trim();
  
  // Remove "function " prefix if present
  if (cleaned.toLowerCase().startsWith('function ')) {
    cleaned = cleaned.slice(9).trim();
  }
  
  // Handle Solidity-style return syntax: "name(inputs) returns (outputs)"
  // Also handle: "name(inputs) view returns (outputs)" etc
  const solidityMatch = cleaned.match(
    /^(\w+)\s*\(([^)]*)\)\s*(?:(?:external|public|view|pure|virtual|override|\s)+)?\s*(?:returns\s*\(([^)]*)\))?$/i
  );
  
  if (solidityMatch) {
    const name = solidityMatch[1];
    const inputStr = solidityMatch[2].trim();
    const outputStr = (solidityMatch[3] || '').trim();
    
    const inputs = inputStr ? parseTypeList(inputStr) : [];
    const outputs = outputStr ? parseTypeList(outputStr) : [];
    
    return { name, inputs, outputs };
  }
  
  // Handle compact format: "name(inputs)(outputs)" or "name(inputs)"
  const compactMatch = cleaned.match(/^(\w+)\s*\(([^)]*)\)(?:\s*\(([^)]*)\))?$/);
  
  if (compactMatch) {
    const name = compactMatch[1];
    const inputStr = compactMatch[2].trim();
    const outputStr = (compactMatch[3] || '').trim();
    
    const inputs = inputStr ? parseTypeList(inputStr) : [];
    const outputs = outputStr ? parseTypeList(outputStr) : [];
    
    return { name, inputs, outputs };
  }
  
  return null;
}

/**
 * Parse a comma-separated type list, handling nested tuples.
 * @param {string} typeStr - The type string like "address,uint256" or "(address,uint256),bool"
 * @returns {string[]} Array of types
 */
function parseTypeList(typeStr) {
  if (!typeStr) return [];
  
  const types = [];
  let current = '';
  let depth = 0;
  
  for (const char of typeStr) {
    if (char === '(' || char === '[') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        // Remove parameter names, keep only types
        const typeOnly = trimmed.split(/\s+/)[0];
        types.push(typeOnly);
      }
      current = '';
    } else {
      current += char;
    }
  }
  
  const trimmed = current.trim();
  if (trimmed) {
    const typeOnly = trimmed.split(/\s+/)[0];
    types.push(typeOnly);
  }
  
  return types;
}

/**
 * Build a function selector from name and input types.
 * @param {string} name - Function name
 * @param {string[]} inputs - Input types array
 * @returns {string} The 4-byte function selector (0x prefixed)
 */
function buildSelector(name, inputs) {
  const sig = `${name}(${inputs.join(',')})`;
  const hash = window.ethers.utils.keccak256(window.ethers.utils.toUtf8Bytes(sig));
  return hash.slice(0, 10); // 0x + 4 bytes
}

// Export for ES modules
/**
 * Find a preset method by its signature.
 * Useful for looking up output types when parsing user input.
 * @param {string} signature - The method signature (e.g., "balanceOf(address)")
 * @returns {Object|null} The preset method or null if not found
 */
function findPresetBySignature(signature) {
  if (!signature || typeof signature !== 'string') return null;
  
  const normalizedSig = signature.toLowerCase().replace(/\s+/g, '');
  const allMethods = getAllPresetMethods();
  
  return allMethods.find(method => {
    const presetSig = method.signature.toLowerCase().replace(/\s+/g, '');
    return presetSig === normalizedSig;
  }) || null;
}

export {
  PRESET_CATEGORIES,
  ERC20_METHODS,
  ERC721_METHODS,
  ERC1155_METHODS,
  ERC4626_METHODS,
  OWNERSHIP_METHODS,
  PROXY_METHODS,
  UTILITY_METHODS,
  getAllPresetMethods,
  searchPresetMethods,
  getMethodsByCategory,
  getCategoryNames,
  parseMethodSignature,
  parseTypeList,
  buildSelector,
  findPresetBySignature
};
