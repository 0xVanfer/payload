/**
 * Test Suite for Multicall Parser Module
 * 
 * Tests detection and parsing of various multicall patterns.
 */

import {
  detectMulticallType,
  parseMulticall,
  isMulticall,
  parseMulticallV3,
  parseGenericMulticall,
  parseAggregate,
  MULTICALL_SELECTORS
} from '../js/core/multicall.js';

import {
  isExecTransaction,
  isMultiSend,
  decodeExecTransaction,
  parseMultiSend,
  isSafeMultisendAddress,
  SAFE_MULTISEND_ADDRESSES
} from '../js/core/safe.js';

/**
 * Test runner utility.
 */
const TestRunner = {
  passed: 0,
  failed: 0,
  
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
    }
  },
  
  assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`${message} Expected ${expected}, got ${actual}`);
    }
  },
  
  assertTrue(value, message = '') {
    if (!value) {
      throw new Error(`${message} Expected truthy, got ${value}`);
    }
  },
  
  assertLength(arr, length, message = '') {
    if (!Array.isArray(arr)) {
      throw new Error(`${message} Expected array, got ${typeof arr}`);
    }
    if (arr.length !== length) {
      throw new Error(`${message} Expected length ${length}, got ${arr.length}`);
    }
  },
  
  summary() {
    console.log('\n' + '='.repeat(50));
    console.log(`Tests: ${this.passed + this.failed}, Passed: ${this.passed}, Failed: ${this.failed}`);
    console.log('='.repeat(50));
    return this.failed === 0;
  }
};

/**
 * Multicall Detection Tests
 */
async function testMulticallDetection() {
  console.log('\n--- Multicall Detection Tests ---\n');
  
  await TestRunner.test('detectMulticallType - Uniswap V3', () => {
    const payload = '0x5ae401dc0000000000000000000000000000';
    const result = detectMulticallType(payload);
    TestRunner.assertEqual(result, '0x5ae401dc');
  });
  
  await TestRunner.test('detectMulticallType - aggregate', () => {
    const payload = '0x252dba420000000000000000000000000000';
    const result = detectMulticallType(payload);
    TestRunner.assertEqual(result, '0x252dba42');
  });
  
  await TestRunner.test('detectMulticallType - generic multicall', () => {
    const payload = '0xac9650d80000000000000000000000000000';
    const result = detectMulticallType(payload);
    TestRunner.assertEqual(result, '0xac9650d8');
  });
  
  await TestRunner.test('detectMulticallType - not multicall', () => {
    const payload = '0xa9059cbb0000000000000000000000000000'; // transfer
    const result = detectMulticallType(payload);
    TestRunner.assertEqual(result, null);
  });
  
  await TestRunner.test('isMulticall - true', () => {
    const payload = '0x5ae401dc0000000000000000000000000000';
    TestRunner.assertTrue(isMulticall(payload));
  });
  
  await TestRunner.test('isMulticall - false', () => {
    const payload = '0xa9059cbb0000000000000000000000000000';
    TestRunner.assertTrue(!isMulticall(payload));
  });
}

/**
 * Safe Transaction Tests
 */
async function testSafeTransactions() {
  console.log('\n--- Safe Transaction Tests ---\n');
  
  await TestRunner.test('isExecTransaction - true', () => {
    const payload = '0x6a7612020000000000000000000000000000';
    TestRunner.assertTrue(isExecTransaction(payload));
  });
  
  await TestRunner.test('isExecTransaction - false', () => {
    const payload = '0xa9059cbb0000000000000000000000000000';
    TestRunner.assertTrue(!isExecTransaction(payload));
  });
  
  await TestRunner.test('isMultiSend - true', () => {
    const payload = '0x8d80ff0a0000000000000000000000000000';
    TestRunner.assertTrue(isMultiSend(payload));
  });
  
  await TestRunner.test('isMultiSend - false', () => {
    const payload = '0xa9059cbb0000000000000000000000000000';
    TestRunner.assertTrue(!isMultiSend(payload));
  });
  
  await TestRunner.test('isSafeMultisendAddress - known address', () => {
    TestRunner.assertTrue(isSafeMultisendAddress('0x9641d764fc13c8b624c04430c7356c1c7c8102e2'));
  });
  
  await TestRunner.test('isSafeMultisendAddress - unknown address', () => {
    TestRunner.assertTrue(!isSafeMultisendAddress('0xdac6748cbb7cd9da1868eb7ad598273122f012db'));
  });
  
  await TestRunner.test('isSafeMultisendAddress - uppercase', () => {
    TestRunner.assertTrue(isSafeMultisendAddress('0x9641D764FC13C8B624C04430C7356C1C7C8102E2'));
  });
}

/**
 * MultiSend Parsing Tests
 */
async function testMultiSendParsing() {
  console.log('\n--- MultiSend Parsing Tests ---\n');
  
  await TestRunner.test('parseMultiSend - single transaction', () => {
    // Minimal multiSend with one transaction
    const payload = '0x8d80ff0a' +
      '0000000000000000000000000000000000000000000000000000000000000020' + // offset
      '0000000000000000000000000000000000000000000000000000000000000055' + // length
      '00' + // operation (call)
      'dac6748cbb7cd9da1868eb7ad598273122f012db' + // address
      '0000000000000000000000000000000000000000000000000000000000000000' + // value
      '0000000000000000000000000000000000000000000000000000000000000004' + // data length
      'a9059cbb'; // data (transfer selector)
    
    const result = parseMultiSend(payload);
    TestRunner.assertLength(result, 1, 'Should parse 1 transaction');
    TestRunner.assertEqual(result[0].operation, 0);
    TestRunner.assertTrue(result[0].address.toLowerCase().includes('dac6748'));
  });
  
  await TestRunner.test('parseMultiSend - invalid selector', () => {
    const payload = '0xa9059cbb00000000'; // Not multiSend
    
    let threw = false;
    try {
      parseMultiSend(payload);
    } catch (e) {
      threw = true;
      TestRunner.assertTrue(e.message.includes('invalid'), 'Should mention invalid');
    }
    TestRunner.assertTrue(threw, 'Should throw error');
  });
}

/**
 * ExecTransaction Parsing Tests
 */
async function testExecTransactionParsing() {
  console.log('\n--- ExecTransaction Parsing Tests ---\n');
  
  await TestRunner.test('decodeExecTransaction - basic', () => {
    // Minimal execTransaction payload
    const payload = '0x6a761202' +
      '000000000000000000000000dac6748cbb7cd9da1868eb7ad598273122f012db' + // to
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // value
      '0000000000000000000000000000000000000000000000000000000000000140' + // data offset
      '0000000000000000000000000000000000000000000000000000000000000000' + // operation
      '0000000000000000000000000000000000000000000000000000000000000000' + // safeTxGas
      '0000000000000000000000000000000000000000000000000000000000000000' + // baseGas
      '0000000000000000000000000000000000000000000000000000000000000000' + // gasPrice
      '0000000000000000000000000000000000000000000000000000000000000000' + // gasToken
      '0000000000000000000000000000000000000000000000000000000000000000' + // refundReceiver
      '0000000000000000000000000000000000000000000000000000000000000160' + // signatures offset
      '0000000000000000000000000000000000000000000000000000000000000000' + // data length
      '0000000000000000000000000000000000000000000000000000000000000000'; // signatures length
    
    const result = decodeExecTransaction(payload);
    TestRunner.assertTrue(result.to.toLowerCase().includes('dac6748'));
    TestRunner.assertEqual(result.value, '1000000000000000000');
  });
}

/**
 * Run all tests.
 */
async function runAllTests() {
  console.log('Starting Multicall Tests...\n');
  
  await testMulticallDetection();
  await testSafeTransactions();
  await testMultiSendParsing();
  await testExecTransactionParsing();
  
  return TestRunner.summary();
}

// Export for module usage
export { runAllTests, TestRunner };

// Run if executed directly
if (typeof window !== 'undefined') {
  window.runMulticallTests = runAllTests;
}
