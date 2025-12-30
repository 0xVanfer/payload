/**
 * Shared Test Utilities Module
 * 
 * Provides a reusable TestRunner and assertion utilities
 * for all test suites in the project.
 */

/**
 * Test runner utility for managing test execution and reporting.
 */
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

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
      if (e.stack) {
        console.error(e.stack);
      }
    }
  }

  /**
   * Assert equality between two values.
   * @param {*} actual - The actual value
   * @param {*} expected - The expected value
   * @param {string} [message] - Optional message prefix
   * @throws {Error} If values are not equal
   */
  assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`${message} Expected ${expected}, got ${actual}`);
    }
  }

  /**
   * Assert that a value is truthy.
   * @param {*} value - The value to check
   * @param {string} [message] - Optional message prefix
   * @throws {Error} If value is not truthy
   */
  assertTrue(value, message = '') {
    if (!value) {
      throw new Error(`${message} Expected truthy value, got ${value}`);
    }
  }

  /**
   * Assert that an array has a specific length.
   * @param {Array} arr - The array to check
   * @param {number} length - The expected length
   * @param {string} [message] - Optional message prefix
   * @throws {Error} If array length doesn't match
   */
  assertLength(arr, length, message = '') {
    if (!Array.isArray(arr)) {
      throw new Error(`${message} Expected array, got ${typeof arr}`);
    }
    if (arr.length !== length) {
      throw new Error(`${message} Expected length ${length}, got ${arr.length}`);
    }
  }

  /**
   * Print test summary and return pass/fail status.
   * @returns {boolean} True if all tests passed
   */
  summary() {
    console.log('\n' + '='.repeat(50));
    console.log(`Tests: ${this.passed + this.failed}, Passed: ${this.passed}, Failed: ${this.failed}`);
    console.log('='.repeat(50));
    return this.failed === 0;
  }

  /**
   * Reset the test runner state.
   */
  reset() {
    this.passed = 0;
    this.failed = 0;
  }
}

/**
 * Create a new test runner instance.
 * @returns {TestRunner} A new test runner
 */
function createTestRunner() {
  return new TestRunner();
}

export { TestRunner, createTestRunner };
