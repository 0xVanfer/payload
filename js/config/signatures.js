/**
 * Common Function Signatures Database
 * 
 * Pre-loaded signatures for common functions to avoid API calls.
 * Structure: { selector: [signature1, signature2, ...] }
 * Multiple signatures can map to same selector (collisions).
 * Lookup returns first match.
 */

const COMMON_SIGNATURES = {
  // ERC20 Standard
  '0x095ea7b3': ['approve(address,uint256)'],
  '0xa9059cbb': ['transfer(address,uint256)'],
  '0x23b872dd': ['transferFrom(address,address,uint256)'],
  '0x70a08231': ['balanceOf(address)'],
  '0x18160ddd': ['totalSupply()'],
  '0xdd62ed3e': ['allowance(address,address)'],
  '0x313ce567': ['decimals()'],
  '0x06fdde03': ['name()'],
  '0x95d89b41': ['symbol()'],
  
  // ERC721 Standard
  '0x42842e0e': ['safeTransferFrom(address,address,uint256)'],
  '0xb88d4fde': ['safeTransferFrom(address,address,uint256,bytes)'],
  '0x6352211e': ['ownerOf(uint256)'],
  '0xe985e9c5': ['isApprovedForAll(address,address)'],
  '0xa22cb465': ['setApprovalForAll(address,bool)'],
  '0x081812fc': ['getApproved(uint256)'],
  
  // ERC1155 Standard
  '0xf242432a': ['safeTransferFrom(address,address,uint256,uint256,bytes)'],
  '0x2eb2c2d6': ['safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)'],
  '0x00fdd58e': ['balanceOf(address,uint256)'],
  '0x4e1273f4': ['balanceOfBatch(address[],uint256[])'],
  
  // Gnosis Safe
  '0x6a761202': ['execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)'],
  '0x8d80ff0a': ['multiSend(bytes)'],
  '0xf08a0323': ['setFallbackHandler(address)'],
  '0xe19a9dd9': ['setGuard(address)'],
  '0x0d582f13': ['addOwnerWithThreshold(address,uint256)'],
  '0xf8dc5dd9': ['removeOwner(address,address,uint256)'],
  '0x694e80c3': ['changeThreshold(uint256)'],
  '0x610b5925': ['enableModule(address)'],
  
  // Multicall Patterns
  '0x5ae401dc': ['multicall(uint256,bytes[])'],
  '0xac9650d8': ['multicall(bytes[])'],
  '0xda5b4ffd': ['multiCall(address[],bytes[])'],
  '0x252dba42': ['aggregate((address,bytes)[])'],
  '0x82ad56cb': ['aggregate3((address,bool,bytes)[])'],
  '0x174dea71': ['aggregate3Value((address,bool,uint256,bytes)[])'],
  '0xc3077fa9': ['blockAndAggregate((address,bytes)[])'],
  '0x399542e9': ['tryBlockAndAggregate(bool,(address,bytes)[])'],
  
  // Uniswap V2 Router
  '0x7ff36ab5': ['swapExactETHForTokens(uint256,address[],address,uint256)'],
  '0x18cbafe5': ['swapExactTokensForETH(uint256,uint256,address[],address,uint256)'],
  '0x38ed1739': ['swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'],
  '0x8803dbee': ['swapTokensForExactTokens(uint256,uint256,address[],address,uint256)'],
  '0xfb3bdb41': ['swapETHForExactTokens(uint256,address[],address,uint256)'],
  '0x4a25d94a': ['swapTokensForExactETH(uint256,uint256,address[],address,uint256)'],
  '0xe8e33700': ['addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)'],
  '0xf305d719': ['addLiquidityETH(address,uint256,uint256,uint256,address,uint256)'],
  '0xbaa2abde': ['removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)'],
  '0x02751cec': ['removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)'],
  
  // Uniswap V3 Router
  '0x414bf389': ['exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))'],
  '0xc04b8d59': ['exactInput((bytes,address,uint256,uint256,uint256))'],
  '0xdb3e2198': ['exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))'],
  '0xf28c0498': ['exactOutput((bytes,address,uint256,uint256,uint256))'],
  '0x04e45aaf': ['exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))'],
  '0x5023b4df': ['exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))'],
  
  // Common DeFi
  '0xd0e30db0': ['deposit()'],
  '0x2e1a7d4d': ['withdraw(uint256)'],
  '0x3ccfd60b': ['withdraw()'],
  '0xb6b55f25': ['deposit(uint256)'],
  '0x6e553f65': ['deposit(uint256,address)'],
  '0xba087652': ['redeem(uint256,address,address)'],
  '0x4641257d': ['harvest()'],
  '0xa694fc3a': ['stake(uint256)'],
  '0x2e17de78': ['unstake(uint256)'],
  '0xe9fad8ee': ['exit()'],
  '0x3d18b912': ['getReward()'],
  
  // Proxy & Upgrades
  '0x3659cfe6': ['upgradeTo(address)'],
  '0x4f1ef286': ['upgradeToAndCall(address,bytes)'],
  '0x5c60da1b': ['implementation()'],
  '0xf851a440': ['admin()'],
  '0x8f283970': ['changeAdmin(address)'],
  
  // Access Control
  '0x2f2ff15d': ['grantRole(bytes32,address)'],
  '0xd547741f': ['revokeRole(bytes32,address)'],
  '0x36568abe': ['renounceRole(bytes32,address)'],
  '0x91d14854': ['hasRole(bytes32,address)'],
  '0x248a9ca3': ['getRoleAdmin(bytes32)'],
  
  // Ownable
  '0x8da5cb5b': ['owner()'],
  '0xf2fde38b': ['transferOwnership(address)'],
  '0x715018a6': ['renounceOwnership()'],
  
  // Pausable
  '0x8456cb59': ['pause()'],
  '0x3f4ba83a': ['unpause()'],
  '0x5c975abb': ['paused()'],
  
  // Common Errors (EIP-6093)
  '0xe450d38c': ['ERC20InsufficientBalance(address,uint256,uint256)'],
  '0xfb8f41b2': ['ERC20InsufficientAllowance(address,uint256,uint256)'],
  '0x96c6fd1e': ['ERC20InvalidSender(address)'],
  '0xec442f05': ['ERC20InvalidReceiver(address)'],
  '0xe602df05': ['ERC20InvalidApprover(address)'],
  '0x94280d62': ['ERC20InvalidSpender(address)'],
  
  // WETH
  '0xd0e30db0': ['deposit()'],
  '0x2e1a7d4d': ['withdraw(uint256)'],
  
  // Permit (EIP-2612)
  '0xd505accf': ['permit(address,address,uint256,uint256,uint8,bytes32,bytes32)'],
  '0x7ecebe00': ['nonces(address)'],
  '0x3644e515': ['DOMAIN_SEPARATOR()'],
  
  // Chainlink
  '0x50d25bcd': ['latestAnswer()'],
  '0xfeaf968c': ['latestRoundData()'],
  '0x9a6fc8f5': ['getRoundData(uint80)'],
  
  // ENS
  '0x3b3b57de': ['addr(bytes32)'],
  '0xf1cb7e06': ['addr(bytes32,uint256)'],
  '0x691f3431': ['name(bytes32)'],
  '0x10f13a8c': ['setText(bytes32,string,string)'],
  '0x59d1d43c': ['text(bytes32,string)'],
  
  // Compound / Aave style
  '0xa0712d68': ['mint(uint256)'],
  '0xdb006a75': ['redeem(uint256)'],
  '0x852a12e3': ['redeemUnderlying(uint256)'],
  '0xc5ebeaec': ['borrow(uint256)'],
  '0x0e752702': ['repayBorrow(uint256)'],
  
  // 1inch
  '0x12aa3caf': ['swap(address,(address,address,address,address,uint256,uint256,uint256),bytes,bytes)'],
  '0xe449022e': ['uniswapV3Swap(uint256,uint256,uint256[])'],
  '0x0502b1c5': ['unoswap(address,uint256,uint256,uint256[])'],
  
  // OpenSea / NFT Marketplaces
  '0xfb0f3ee1': ['fulfillBasicOrder((address,uint256,uint256,address,address,address,uint256,uint256,uint8,uint256,uint256,bytes32,uint256,bytes32,bytes32,uint256,(uint256,address)[],bytes))'],
  '0x87201b41': ['fulfillAvailableAdvancedOrders(((address,address,(uint8,address,uint256,uint256,uint256)[],(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256),uint120,uint120,bytes,bytes)[],(uint256,uint8,uint256,uint256,bytes32[])[],(uint256,uint256)[][],(uint256,uint256)[][],bytes32,address,uint256)'],
  
  // Misc
  '0x1249c58b': ['mint()'],
  '0x40c10f19': ['mint(address,uint256)'],
  '0x42966c68': ['burn(uint256)'],
  '0x9dc29fac': ['burn(address,uint256)'],
  '0x79cc6790': ['burnFrom(address,uint256)'],
  '0x8129fc1c': ['initialize()'],
  '0xc4d66de8': ['initialize(address)'],
  '0xfe4b84df': ['initialize(uint256)'],
  '0x485cc955': ['initialize(address,address)'],
};

/**
 * Lookup signature from common database.
 * @param {string} selector - The 4-byte selector (0x + 4 bytes)
 * @returns {string|null} The signature or null if not found
 */
function lookupCommonSignature(selector) {
  const normalized = selector.toLowerCase();
  const signatures = COMMON_SIGNATURES[normalized];
  return signatures && signatures.length > 0 ? signatures[0] : null;
}

/**
 * Check if selector exists in common database.
 * @param {string} selector - The 4-byte selector
 * @returns {boolean} True if found
 */
function hasCommonSignature(selector) {
  return selector.toLowerCase() in COMMON_SIGNATURES;
}

/**
 * Get all signatures for a selector (for collision handling).
 * @param {string} selector - The 4-byte selector
 * @returns {string[]} Array of signatures
 */
function getAllCommonSignatures(selector) {
  return COMMON_SIGNATURES[selector.toLowerCase()] || [];
}

// Export for ES modules
export {
  COMMON_SIGNATURES,
  lookupCommonSignature,
  hasCommonSignature,
  getAllCommonSignatures
};
