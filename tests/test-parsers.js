/**
 * Test Suite for Link Parsers
 * 
 * Tests URL detection and parsing for different transaction sources.
 */

import { createTestRunner } from './test-utils.js';
import { 
  parseLink, 
  detectLinkType, 
  isParsableLink 
} from '../js/parsers/index.js';
import { 
  isEtherscanLink, 
  getChainIdFromUrl, 
  extractTxHash 
} from '../js/parsers/etherscan.js';
import { 
  isTenderlyLink, 
  detectTenderlyUrlType 
} from '../js/parsers/tenderly.js';

// Create test runner instance
const TestRunner = createTestRunner();

/**
 * Etherscan Parser Tests
 */
async function testEtherscanParser() {
  console.log('\n--- Etherscan Parser Tests ---\n');
  
  await TestRunner.test('isEtherscanLink - Etherscan mainnet', () => {
    const url = 'https://etherscan.io/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    TestRunner.assertTrue(isEtherscanLink(url));
  });
  
  await TestRunner.test('isEtherscanLink - Arbiscan', () => {
    const url = 'https://arbiscan.io/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    TestRunner.assertTrue(isEtherscanLink(url));
  });
  
  await TestRunner.test('isEtherscanLink - BSCScan', () => {
    const url = 'https://bscscan.com/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    TestRunner.assertTrue(isEtherscanLink(url));
  });
  
  await TestRunner.test('isEtherscanLink - address page', () => {
    const url = 'https://etherscan.io/address/0xdac6748cbb7cd9da1868eb7ad598273122f012db';
    TestRunner.assertTrue(isEtherscanLink(url));
  });
  
  await TestRunner.test('isEtherscanLink - not etherscan', () => {
    const url = 'https://example.com/tx/0x1234';
    TestRunner.assertTrue(!isEtherscanLink(url));
  });
  
  await TestRunner.test('getChainIdFromUrl - Ethereum mainnet', () => {
    const url = 'https://etherscan.io/tx/0x1234';
    TestRunner.assertEqual(getChainIdFromUrl(url), '1');
  });
  
  await TestRunner.test('getChainIdFromUrl - Arbitrum', () => {
    const url = 'https://arbiscan.io/tx/0x1234';
    TestRunner.assertEqual(getChainIdFromUrl(url), '42161');
  });
  
  await TestRunner.test('getChainIdFromUrl - BSC', () => {
    const url = 'https://bscscan.com/tx/0x1234';
    TestRunner.assertEqual(getChainIdFromUrl(url), '56');
  });
  
  await TestRunner.test('getChainIdFromUrl - Sepolia', () => {
    const url = 'https://sepolia.etherscan.io/tx/0x1234';
    TestRunner.assertEqual(getChainIdFromUrl(url), '11155111');
  });
  
  await TestRunner.test('extractTxHash - valid tx', () => {
    const url = 'https://etherscan.io/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    TestRunner.assertEqual(
      extractTxHash(url), 
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    );
  });
  
  await TestRunner.test('extractTxHash - no tx', () => {
    const url = 'https://etherscan.io/address/0x1234';
    TestRunner.assertEqual(extractTxHash(url), null);
  });
}

/**
 * Tenderly Parser Tests
 */
async function testTenderlyParser() {
  console.log('\n--- Tenderly Parser Tests ---\n');
  
  await TestRunner.test('isTenderlyLink - dashboard', () => {
    const url = 'https://dashboard.tenderly.co/explorer/vnet/123/tx/0x1234';
    TestRunner.assertTrue(isTenderlyLink(url));
  });
  
  await TestRunner.test('isTenderlyLink - api', () => {
    const url = 'https://api.tenderly.co/api/v1/testnets/123';
    TestRunner.assertTrue(isTenderlyLink(url));
  });
  
  await TestRunner.test('isTenderlyLink - not tenderly', () => {
    const url = 'https://etherscan.io/tx/0x1234';
    TestRunner.assertTrue(!isTenderlyLink(url));
  });
  
  await TestRunner.test('detectTenderlyUrlType - vnet', () => {
    const url = 'https://dashboard.tenderly.co/explorer/vnet/27e89141-f32c-46e8-913d-ab9803a4e861/tx/0xd58d6d7c585b5099133c2972b69e31d2f513b1f629032f31a9c3662a6a00ead6';
    const result = detectTenderlyUrlType(url);
    
    TestRunner.assertEqual(result.type, 'vnet');
    TestRunner.assertEqual(result.matches[1], '27e89141-f32c-46e8-913d-ab9803a4e861');
    TestRunner.assertTrue(result.matches[2].startsWith('0xd58d6d7c'));
  });
  
  await TestRunner.test('detectTenderlyUrlType - public simulator', () => {
    const url = 'https://dashboard.tenderly.co/public/safe/safe-apps/simulator/7f22ab63-f74b-476e-8489-4600367ee12f';
    const result = detectTenderlyUrlType(url);
    
    TestRunner.assertEqual(result.type, 'publicSimulator');
    TestRunner.assertEqual(result.matches[1], 'safe');
    TestRunner.assertEqual(result.matches[2], 'safe-apps');
    TestRunner.assertEqual(result.matches[3], '7f22ab63-f74b-476e-8489-4600367ee12f');
  });
  
  await TestRunner.test('detectTenderlyUrlType - unknown format', () => {
    const url = 'https://dashboard.tenderly.co/some/other/path';
    const result = detectTenderlyUrlType(url);
    TestRunner.assertEqual(result, null);
  });
}

/**
 * Link Parser Registry Tests
 */
async function testParserRegistry() {
  console.log('\n--- Parser Registry Tests ---\n');
  
  await TestRunner.test('detectLinkType - etherscan', () => {
    const url = 'https://etherscan.io/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    TestRunner.assertEqual(detectLinkType(url), 'etherscan');
  });
  
  await TestRunner.test('detectLinkType - tenderly', () => {
    const url = 'https://dashboard.tenderly.co/explorer/vnet/123/tx/0x1234';
    TestRunner.assertEqual(detectLinkType(url), 'tenderly');
  });
  
  await TestRunner.test('detectLinkType - unknown', () => {
    const url = 'https://example.com/something';
    TestRunner.assertEqual(detectLinkType(url), null);
  });
  
  await TestRunner.test('isParsableLink - valid', () => {
    const url = 'https://etherscan.io/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    TestRunner.assertTrue(isParsableLink(url));
  });
  
  await TestRunner.test('isParsableLink - invalid', () => {
    TestRunner.assertTrue(!isParsableLink('not a url'));
  });
  
  await TestRunner.test('isParsableLink - null', () => {
    TestRunner.assertTrue(!isParsableLink(null));
  });
  
  await TestRunner.test('isParsableLink - payload not link', () => {
    TestRunner.assertTrue(!isParsableLink('0xa9059cbb0000000000'));
  });
}

/**
 * Run all tests.
 */
async function runAllTests() {
  console.log('Starting Link Parser Tests...\n');
  
  await testEtherscanParser();
  await testTenderlyParser();
  await testParserRegistry();
  
  return TestRunner.summary();
}

// Export for module usage
export { runAllTests, TestRunner };

// Run if executed directly
if (typeof window !== 'undefined') {
  window.runParserTests = runAllTests;
}
