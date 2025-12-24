/**
 * Multicall Parser Module
 * 
 * Handles detection and parsing of various multicall patterns used
 * in DeFi protocols (Uniswap, Compound, etc.).
 */

import { log, checksumAddress } from './abi-utils.js';

/**
 * Known multicall function selectors.
 */
const MULTICALL_SELECTORS = {
  '0x5ae401dc': 'multicall(uint256,bytes[])',        // Uniswap V3 deadline variant
  '0x252dba42': 'aggregate(tuple(address,bytes)[])', // Multicall2 aggregate
  '0xac9650d8': 'multicall(bytes[])',                // Generic multicall
  '0x1c0464c1': 'multicall(bytes32,bytes[])',        // Multicall with previous hash
  '0x8a6a1e85': 'aggregate(tuple(address,bytes)[],bool)', // Multicall with strict mode
};

/**
 * Detect if a payload uses a multicall pattern and return its type.
 * @param {string} payload - The hex-encoded payload
 * @returns {string|null} The multicall type identifier or null if not multicall
 */
function detectMulticallType(payload) {
  const selector = (payload.startsWith('0x') ? payload : '0x' + payload).slice(0, 10).toLowerCase();
  
  if (selector in MULTICALL_SELECTORS) {
    log('debug', 'multicall', 'Detected multicall type', { selector, signature: MULTICALL_SELECTORS[selector] });
    return selector;
  }
  
  return null;
}

/**
 * Parse a Uniswap V3 style multicall (0x5ae401dc).
 * Format: multicall(uint256 deadline, bytes[] data)
 * 
 * @param {string} payload - The hex-encoded multicall payload
 * @returns {Array<{address: string, value: string, data: string}>} Array of calls
 */
function parseMulticallV3(payload) {
  log('debug', 'multicall', 'Parsing Uniswap V3 multicall');
  
  try {
    const abi = ['function multicall(uint256 deadline, bytes[] data)'];
    const iface = new ethers.utils.Interface(abi);
    const data = payload.startsWith('0x') ? payload : '0x' + payload;
    const decoded = iface.decodeFunctionData('multicall', data);
    
    const calls = decoded.data || [];
    return calls.map(callData => ({
      address: '',
      value: '0',
      data: callData
    }));
    
  } catch (e) {
    log('error', 'multicall', 'Failed to parse V3 multicall', { error: e.message });
    return [];
  }
}

/**
 * Parse a generic multicall (0xac9650d8).
 * Format: multicall(bytes[] data)
 * 
 * @param {string} payload - The hex-encoded multicall payload
 * @returns {Array<{address: string, value: string, data: string}>} Array of calls
 */
function parseGenericMulticall(payload) {
  log('debug', 'multicall', 'Parsing generic multicall');
  
  try {
    const abi = ['function multicall(bytes[] data)'];
    const iface = new ethers.utils.Interface(abi);
    const data = payload.startsWith('0x') ? payload : '0x' + payload;
    const decoded = iface.decodeFunctionData('multicall', data);
    
    const calls = decoded.data || [];
    return calls.map(callData => ({
      address: '',
      value: '0',
      data: callData
    }));
    
  } catch (e) {
    log('error', 'multicall', 'Failed to parse generic multicall', { error: e.message });
    return [];
  }
}

/**
 * Parse a Multicall2/3 aggregate call (0x252dba42).
 * Format: aggregate(tuple(address target, bytes callData)[] calls)
 * 
 * @param {string} payload - The hex-encoded aggregate payload
 * @returns {Array<{address: string, value: string, data: string}>} Array of calls
 */
function parseAggregate(payload) {
  log('debug', 'multicall', 'Parsing aggregate multicall');
  
  try {
    const abi = ['function aggregate(tuple(address target, bytes callData)[] calls)'];
    const iface = new ethers.utils.Interface(abi);
    const data = payload.startsWith('0x') ? payload : '0x' + payload;
    const decoded = iface.decodeFunctionData('aggregate', data);
    
    const calls = decoded.calls || [];
    return calls.map(call => ({
      address: checksumAddress(call.target),
      value: '0',
      data: call.callData
    }));
    
  } catch (e) {
    log('error', 'multicall', 'Failed to parse aggregate', { error: e.message });
    return [];
  }
}

/**
 * Parse a multicall with previous hash (0x1c0464c1).
 * Format: multicall(bytes32 previousBlockhash, bytes[] data)
 * 
 * @param {string} payload - The hex-encoded multicall payload
 * @returns {Array<{address: string, value: string, data: string}>} Array of calls
 */
function parseMulticallWithHash(payload) {
  log('debug', 'multicall', 'Parsing multicall with hash');
  
  try {
    const abi = ['function multicall(bytes32 previousBlockhash, bytes[] data)'];
    const iface = new ethers.utils.Interface(abi);
    const data = payload.startsWith('0x') ? payload : '0x' + payload;
    const decoded = iface.decodeFunctionData('multicall', data);
    
    const calls = decoded.data || [];
    return calls.map(callData => ({
      address: '',
      value: '0',
      data: callData
    }));
    
  } catch (e) {
    log('error', 'multicall', 'Failed to parse multicall with hash', { error: e.message });
    return [];
  }
}

/**
 * Parse a strict aggregate call (0x8a6a1e85).
 * Format: aggregate(tuple(address target, bytes callData)[] calls, bool strictRevertOnFailure)
 * 
 * @param {string} payload - The hex-encoded aggregate payload
 * @returns {Array<{address: string, value: string, data: string}>} Array of calls
 */
function parseStrictAggregate(payload) {
  log('debug', 'multicall', 'Parsing strict aggregate');
  
  try {
    const abi = ['function aggregate(tuple(address target, bytes callData)[] calls, bool strictRevertOnFailure)'];
    const iface = new ethers.utils.Interface(abi);
    const data = payload.startsWith('0x') ? payload : '0x' + payload;
    const decoded = iface.decodeFunctionData('aggregate', data);
    
    const calls = decoded.calls || [];
    return calls.map(call => ({
      address: checksumAddress(call.target),
      value: '0',
      data: call.callData
    }));
    
  } catch (e) {
    log('error', 'multicall', 'Failed to parse strict aggregate', { error: e.message });
    return [];
  }
}

/**
 * Parse any recognized multicall format.
 * Detects the multicall type and dispatches to appropriate parser.
 * 
 * @param {string} payload - The hex-encoded multicall payload
 * @returns {Array<{address: string, value: string, data: string}>|null} Array of calls or null if not multicall
 */
function parseMulticall(payload) {
  const selector = detectMulticallType(payload);
  
  if (!selector) {
    return null;
  }
  
  log('info', 'multicall', 'Parsing multicall', { selector });
  
  switch (selector) {
    case '0x5ae401dc':
      return parseMulticallV3(payload);
    case '0xac9650d8':
      return parseGenericMulticall(payload);
    case '0x252dba42':
      return parseAggregate(payload);
    case '0x1c0464c1':
      return parseMulticallWithHash(payload);
    case '0x8a6a1e85':
      return parseStrictAggregate(payload);
    default:
      log('warn', 'multicall', 'Unknown multicall selector', { selector });
      return null;
  }
}

/**
 * Check if payload is a recognized multicall format.
 * @param {string} payload - The payload to check
 * @returns {boolean} True if payload is a multicall
 */
function isMulticall(payload) {
  return detectMulticallType(payload) !== null;
}

// Export for ES modules
export {
  MULTICALL_SELECTORS,
  detectMulticallType,
  parseMulticallV3,
  parseGenericMulticall,
  parseAggregate,
  parseMulticallWithHash,
  parseStrictAggregate,
  parseMulticall,
  isMulticall
};
