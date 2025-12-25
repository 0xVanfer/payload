/**
 * Contract Info Test Module
 * 
 * Tests for the address collector and contract info service.
 * Validates that addresses are properly tracked and symbols
 * are fetched via multicall.
 */

// Test payloads that contain known token addresses
const TEST_PAYLOADS = {
  // Simple ERC20 transfer - USDC address on Ethereum
  // transfer(address,uint256) to USDC contract
  usdcTransfer: {
    chainId: '1',
    payload: '0xa9059cbb000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000003b9aca00',
    expectedAddresses: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'], // USDC
    description: 'ERC20 transfer to USDC address'
  },
  
  // Approval with WETH address on Ethereum
  // approve(address spender, uint256 amount)
  wethApproval: {
    chainId: '1', 
    payload: '0x095ea7b3000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    expectedAddresses: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'], // WETH
    description: 'Approval to WETH address'
  }
};

/**
 * Run contract info tests in browser console.
 * Usage: Open browser console and call runContractInfoTests()
 */
async function runContractInfoTests() {
  console.log('=== Contract Info Tests ===\n');
  
  // Import required modules
  const { getAllAddresses, getAddressStats } = await import('/js/core/address-collector.js');
  const { fetchContractInfo } = await import('/js/core/contract-info.js');
  
  for (const [testName, testData] of Object.entries(TEST_PAYLOADS)) {
    console.log(`\nTest: ${testName}`);
    console.log(`Description: ${testData.description}`);
    console.log(`Chain: ${testData.chainId}`);
    
    // Set the payload in input field
    document.getElementById('payload-input').value = testData.payload;
    
    // Set chain
    document.getElementById('chain-select').value = testData.chainId;
    
    // Click parse
    document.getElementById('parse-btn').click();
    
    // Wait for parsing to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check collected addresses
    const addresses = getAllAddresses();
    const stats = getAddressStats();
    
    console.log(`Collected addresses: ${addresses.length}`);
    console.log(`Address stats:`, stats);
    console.log(`Addresses:`, addresses);
    
    // Check if expected addresses were found
    for (const expected of testData.expectedAddresses) {
      const found = addresses.some(a => a.toLowerCase() === expected.toLowerCase());
      console.log(`Expected ${expected}: ${found ? '✓' : '✗'}`);
    }
    
    // Wait for contract info fetch
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if symbols were added to DOM
    const symbolElements = document.querySelectorAll('.address-symbol');
    console.log(`Symbol elements found: ${symbolElements.length}`);
    
    if (symbolElements.length > 0) {
      console.log('Symbols:', Array.from(symbolElements).map(el => el.textContent));
    }
    
    console.log('---');
  }
  
  console.log('\n=== Tests Complete ===');
}

// Expose to global scope for console access
window.runContractInfoTests = runContractInfoTests;

console.log('Contract Info Test Module loaded.');
console.log('Run runContractInfoTests() in console to execute tests.');
