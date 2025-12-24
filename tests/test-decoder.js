/**
 * Test Suite for Core Decoder Module
 * 
 * Tests payload splitting, signature lookup, and decoding functionality.
 */

import { 
  decodePayload, 
  splitPayloadIntoCalls,
  findAndDecodeNestedBytes,
  isDecodableBytes,
  splitTupleTypes
} from '../js/core/decoder.js';
import { 
  checksumAddress, 
  extractSelector, 
  isEmptyPayload,
  decodeWithSignature
} from '../js/core/abi-utils.js';

/**
 * Test runner utility.
 */
const TestRunner = {
  passed: 0,
  failed: 0,
  
  /**
   * Run a test case.
   * @param {string} name - Test name
   * @param {Function} testFn - Test function (returns boolean or throws)
   */
  async test(name, testFn) {
    try {
      const result = await testFn();
      if (result !== false) {
        this.passed++;
        console.log(`✓ ${name}`);
      } else {
        this.failed++;
        console.error(`✗ ${name}: returned false`);
      }
    } catch (e) {
      this.failed++;
      console.error(`✗ ${name}: ${e.message}`);
      console.error(e.stack);
    }
  },
  
  /**
   * Assert equality.
   */
  assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`${message} Expected ${expected}, got ${actual}`);
    }
  },
  
  /**
   * Assert truthy.
   */
  assertTrue(value, message = '') {
    if (!value) {
      throw new Error(`${message} Expected truthy value, got ${value}`);
    }
  },
  
  /**
   * Assert array length.
   */
  assertLength(arr, length, message = '') {
    if (!Array.isArray(arr)) {
      throw new Error(`${message} Expected array, got ${typeof arr}`);
    }
    if (arr.length !== length) {
      throw new Error(`${message} Expected length ${length}, got ${arr.length}`);
    }
  },
  
  /**
   * Print summary.
   */
  summary() {
    console.log('\n' + '='.repeat(50));
    console.log(`Tests: ${this.passed + this.failed}, Passed: ${this.passed}, Failed: ${this.failed}`);
    console.log('='.repeat(50));
    return this.failed === 0;
  }
};

/**
 * ABI Utilities Tests
 */
async function testAbiUtils() {
  console.log('\n--- ABI Utilities Tests ---\n');
  
  await TestRunner.test('checksumAddress - valid address', () => {
    const result = checksumAddress('0xdac6748cbb7cd9da1868eb7ad598273122f012db');
    TestRunner.assertEqual(result, '0xDaC6748Cbb7cd9Da1868EB7AD598273122F012Db');
  });
  
  await TestRunner.test('checksumAddress - already checksummed', () => {
    const result = checksumAddress('0xDaC6748Cbb7cd9Da1868EB7AD598273122F012Db');
    TestRunner.assertEqual(result, '0xDaC6748Cbb7cd9Da1868EB7AD598273122F012Db');
  });
  
  await TestRunner.test('extractSelector - with 0x prefix', () => {
    const result = extractSelector('0xa9059cbb0000000000000000');
    TestRunner.assertEqual(result, '0xa9059cbb');
  });
  
  await TestRunner.test('extractSelector - without 0x prefix', () => {
    const result = extractSelector('a9059cbb0000000000000000');
    TestRunner.assertEqual(result, '0xa9059cbb');
  });
  
  await TestRunner.test('extractSelector - short payload', () => {
    const result = extractSelector('0x');
    TestRunner.assertEqual(result, '');
  });
  
  await TestRunner.test('isEmptyPayload - empty 0x', () => {
    TestRunner.assertTrue(isEmptyPayload('0x'));
  });
  
  await TestRunner.test('isEmptyPayload - non-empty', () => {
    TestRunner.assertTrue(!isEmptyPayload('0xa9059cbb'));
  });
  
  await TestRunner.test('decodeWithSignature - transfer', () => {
    const signature = 'transfer(address,uint256)';
    const payload = '0xa9059cbb000000000000000000000000dac6748cbb7cd9da1868eb7ad598273122f012db0000000000000000000000000000000000000000000000000de0b6b3a7640000';
    const result = decodeWithSignature(signature, payload);
    
    TestRunner.assertTrue(!result.error, 'Should not have error');
    TestRunner.assertLength(result.params, 2, 'Should have 2 params');
    TestRunner.assertEqual(result.params[0].AbiType, 'address');
    TestRunner.assertEqual(result.params[1].AbiType, 'uint256');
  });
  
  await TestRunner.test('decodeWithSignature - sighash mismatch', () => {
    const signature = 'approve(address,uint256)'; // Wrong signature for transfer payload
    const payload = '0xa9059cbb000000000000000000000000dac6748cbb7cd9da1868eb7ad598273122f012db0000000000000000000000000000000000000000000000000de0b6b3a7640000';
    const result = decodeWithSignature(signature, payload);
    
    TestRunner.assertTrue(result.error, 'Should have error');
    TestRunner.assertTrue(result.error.includes('mismatch'), 'Should mention mismatch');
  });
}

/**
 * Payload Splitting Tests
 */
async function testPayloadSplitting() {
  console.log('\n--- Payload Splitting Tests ---\n');
  
  await TestRunner.test('splitPayloadIntoCalls - single call', () => {
    const payload = '0xa9059cbb000000000000000000000000dac6748cbb7cd9da1868eb7ad598273122f012db0000000000000000000000000000000000000000000000000de0b6b3a7640000';
    const calls = splitPayloadIntoCalls(payload);
    
    TestRunner.assertLength(calls, 1, 'Should have 1 call');
    TestRunner.assertEqual(calls[0].data, payload);
  });
  
  await TestRunner.test('splitPayloadIntoCalls - empty payload', () => {
    const calls = splitPayloadIntoCalls('0x');
    TestRunner.assertLength(calls, 1);
    TestRunner.assertEqual(calls[0].data, '0x');
  });
}

/**
 * Helper Function Tests
 */
async function testHelperFunctions() {
  console.log('\n--- Helper Function Tests ---\n');
  
  await TestRunner.test('isDecodableBytes - valid bytes', () => {
    TestRunner.assertTrue(isDecodableBytes('0xa9059cbb0000000000'));
  });
  
  await TestRunner.test('isDecodableBytes - too short', () => {
    TestRunner.assertTrue(!isDecodableBytes('0xa905'));
  });
  
  await TestRunner.test('isDecodableBytes - starts with zeros', () => {
    TestRunner.assertTrue(!isDecodableBytes('0x00000000a9059cbb'));
  });
  
  await TestRunner.test('isDecodableBytes - not a string', () => {
    TestRunner.assertTrue(!isDecodableBytes(12345));
  });
  
  await TestRunner.test('splitTupleTypes - simple', () => {
    const result = splitTupleTypes('address,uint256,bool');
    TestRunner.assertLength(result, 3);
    TestRunner.assertEqual(result[0], 'address');
    TestRunner.assertEqual(result[1], 'uint256');
    TestRunner.assertEqual(result[2], 'bool');
  });
  
  await TestRunner.test('splitTupleTypes - nested', () => {
    const result = splitTupleTypes('address,tuple(uint256,bool),bytes');
    TestRunner.assertLength(result, 3);
    TestRunner.assertEqual(result[0], 'address');
    TestRunner.assertEqual(result[1], 'tuple(uint256,bool)');
    TestRunner.assertEqual(result[2], 'bytes');
  });
  
  await TestRunner.test('splitTupleTypes - deeply nested', () => {
    const result = splitTupleTypes('address,tuple(uint256,tuple(address,bool)),bytes');
    TestRunner.assertLength(result, 3);
    TestRunner.assertEqual(result[1], 'tuple(uint256,tuple(address,bool))');
  });
}

/**
 * Integration Tests
 */
async function testIntegration() {
  console.log('\n--- Integration Tests ---\n');
  
  await TestRunner.test('decodePayload - simple transfer', async () => {
    const payload = '0xa9059cbb000000000000000000000000dac6748cbb7cd9da1868eb7ad598273122f012db0000000000000000000000000000000000000000000000000de0b6b3a7640000';
    const result = await decodePayload(payload);
    
    TestRunner.assertLength(result, 1, 'Should have 1 decoded call');
    // Note: function name depends on API availability
    TestRunner.assertTrue(result[0].payload === payload, 'Payload should match');
  });
  
  await TestRunner.test('decodePayload - empty payload', async () => {
    const result = await decodePayload('0x');
    
    TestRunner.assertLength(result, 1);
    TestRunner.assertEqual(result[0].functionName, 'Call');
  });
  
  await TestRunner.test('decodePayload - invalid input', async () => {
    const result = await decodePayload(null);
    TestRunner.assertLength(result, 0);
  });
}

/**
 * Run all tests.
 */
async function runAllTests() {
  console.log('Starting Decoder Tests...\n');
  
  await testAbiUtils();
  await testPayloadSplitting();
  await testHelperFunctions();
  await testIntegration();
  
  return TestRunner.summary();
}

// Export for module usage
export { runAllTests, TestRunner };

// Run if executed directly
if (typeof window !== 'undefined') {
  window.runDecoderTests = runAllTests;
}
