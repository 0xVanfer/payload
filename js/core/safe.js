/**
 * Safe Transaction Parser Module
 * 
 * Handles parsing of Gnosis Safe transaction formats including
 * execTransaction and related patterns.
 */

import { log, checksumAddress } from './abi-utils.js';

/**
 * Known Safe MultiSend contract addresses.
 * These addresses indicate the payload should be parsed as multiSend.
 */
const SAFE_MULTISEND_ADDRESSES = [
  '0x9641d764fc13c8b624c04430c7356c1c7c8102e2', // MultiSend 1.3.0
  '0x40a2accbd92bca938b02010e17a5b8929b49130d', // MultiSend Call Only 1.3.0
  '0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761', // MultiSend 1.4.1
  '0x38869bf66a61cf6bdb996a6ae40d5853fd43b526', // MultiSend Call Only 1.4.1
];

/**
 * Function selector for execTransaction.
 */
const EXEC_TRANSACTION_SELECTOR = '0x6a761202';

/**
 * Function selector for multiSend.
 */
const MULTISEND_SELECTOR = '0x8d80ff0a';

/**
 * Check if an address is a known Safe MultiSend contract.
 * @param {string} address - The address to check
 * @returns {boolean} True if the address is a known MultiSend contract
 */
function isSafeMultisendAddress(address) {
  if (!address) return false;
  return SAFE_MULTISEND_ADDRESSES.includes(address.toLowerCase());
}

/**
 * Check if payload is a Safe execTransaction.
 * @param {string} payload - The payload to check
 * @returns {boolean} True if payload starts with execTransaction selector
 */
function isExecTransaction(payload) {
  const selector = (payload.startsWith('0x') ? payload : '0x' + payload).slice(0, 10).toLowerCase();
  return selector === EXEC_TRANSACTION_SELECTOR;
}

/**
 * Check if payload is a Safe multiSend.
 * @param {string} payload - The payload to check
 * @returns {boolean} True if payload starts with multiSend selector
 */
function isMultiSend(payload) {
  const selector = (payload.startsWith('0x') ? payload : '0x' + payload).slice(0, 10).toLowerCase();
  return selector === MULTISEND_SELECTOR;
}

/**
 * Decode a Safe execTransaction payload.
 * 
 * @param {string} payload - The hex-encoded execTransaction payload
 * @returns {{
 *   to: string,
 *   value: string,
 *   data: string,
 *   operation: number,
 *   safeTxGas: string,
 *   baseGas: string,
 *   gasPrice: string,
 *   gasToken: string,
 *   refundReceiver: string,
 *   signatures: string
 * }} Decoded transaction parameters
 * @throws {Error} If decoding fails
 */
function decodeExecTransaction(payload) {
  log('debug', 'safe', 'Decoding execTransaction', { payloadLength: payload.length });
  
  const abi = [
    'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)'
  ];
  
  try {
    const iface = new ethers.utils.Interface(abi);
    const data = payload.startsWith('0x') ? payload : '0x' + payload;
    const decoded = iface.decodeFunctionData('execTransaction', data);
    
    const result = {
      to: checksumAddress(decoded.to),
      value: decoded.value.toString(),
      data: decoded.data,
      operation: decoded.operation,
      safeTxGas: decoded.safeTxGas.toString(),
      baseGas: decoded.baseGas.toString(),
      gasPrice: decoded.gasPrice.toString(),
      gasToken: checksumAddress(decoded.gasToken),
      refundReceiver: checksumAddress(decoded.refundReceiver),
      signatures: decoded.signatures
    };
    
    log('debug', 'safe', 'Decoded execTransaction', { to: result.to, operation: result.operation });
    return result;
    
  } catch (e) {
    log('error', 'safe', 'Failed to decode execTransaction', { error: e.message });
    throw new Error(`Failed to decode execTransaction: ${e.message}`);
  }
}

/**
 * Parse a Safe multiSend payload into individual transactions.
 * 
 * The multiSend format packs transactions as:
 * - 1 byte: operation (0 = call, 1 = delegatecall)
 * - 20 bytes: to address
 * - 32 bytes: value
 * - 32 bytes: data length
 * - N bytes: data
 * 
 * @param {string} payload - The hex-encoded multiSend payload
 * @returns {Array<{
 *   operation: number,
 *   address: string,
 *   value: string,
 *   data: string
 * }>} Array of parsed transactions
 */
function parseMultiSend(payload) {
  log('debug', 'safe', 'Parsing multiSend', { payloadLength: payload.length });
  
  // Remove 0x prefix and normalize
  let hexStr = payload.replace(/^0x/i, '').toLowerCase();
  
  // Verify selector
  if (!hexStr.startsWith('8d80ff0a')) {
    throw new Error('Invalid multiSend payload: does not start with 0x8d80ff0a');
  }
  
  // Skip selector (4 bytes = 8 chars) and offset/length (64 chars each)
  // The format is: selector + offset + length + packed data
  hexStr = hexStr.slice(8 + 64 + 64);
  
  const transactions = [];
  let position = 0;
  
  while (hexStr.length > 0) {
    // Need at least operation (2) + address (40) + value (64) + length (64) = 170 chars
    if (hexStr.length < 170) {
      log('debug', 'safe', 'Remaining data too short, stopping parse', { remaining: hexStr.length });
      break;
    }
    
    // Parse operation type (1 byte = 2 chars)
    const operationHex = hexStr.slice(0, 2);
    const operation = parseInt(operationHex, 16);
    hexStr = hexStr.slice(2);
    
    // Parse address (20 bytes = 40 chars)
    const address = '0x' + hexStr.slice(0, 40);
    hexStr = hexStr.slice(40);
    
    // Parse value (32 bytes = 64 chars)
    const valueHex = hexStr.slice(0, 64);
    const value = BigInt('0x' + valueHex).toString();
    hexStr = hexStr.slice(64);
    
    // Parse data length (32 bytes = 64 chars)
    const dataLengthHex = hexStr.slice(0, 64);
    const dataLength = parseInt(dataLengthHex, 16);
    hexStr = hexStr.slice(64);
    
    // Validate data length
    if (isNaN(dataLength) || hexStr.length < dataLength * 2) {
      log('warn', 'safe', 'Invalid data length or insufficient data', { 
        dataLength, 
        remaining: hexStr.length,
        position 
      });
      break;
    }
    
    // Parse data
    const data = dataLength > 0 ? '0x' + hexStr.slice(0, dataLength * 2) : '0x';
    hexStr = hexStr.slice(dataLength * 2);
    
    transactions.push({
      operation,
      address: checksumAddress(address),
      value,
      data
    });
    
    position++;
    log('debug', 'safe', 'Parsed transaction', { position, address, operation, dataLength });
  }
  
  log('info', 'safe', 'Finished parsing multiSend', { transactionCount: transactions.length });
  return transactions;
}

/**
 * Process a Safe transaction payload.
 * Handles both execTransaction and direct multiSend formats.
 * 
 * @param {string} payload - The hex-encoded payload
 * @returns {Array<{
 *   address: string,
 *   value: string,
 *   data: string,
 *   operation?: number
 * }>} Array of individual calls extracted from the payload
 */
function processSafePayload(payload) {
  log('debug', 'safe', 'Processing Safe payload', { payloadLength: payload.length });
  
  // Check if it's an execTransaction
  if (isExecTransaction(payload)) {
    try {
      const decoded = decodeExecTransaction(payload);
      const targetAddress = decoded.to.toLowerCase();
      
      // If target is a known multiSend address, parse the inner data
      if (isSafeMultisendAddress(targetAddress)) {
        log('debug', 'safe', 'execTransaction targets multiSend, parsing inner data');
        return parseMultiSend(decoded.data);
      }
      
      // Otherwise return as single transaction
      return [{
        address: decoded.to,
        value: decoded.value,
        data: decoded.data,
        operation: decoded.operation
      }];
      
    } catch (e) {
      log('error', 'safe', 'Error processing execTransaction', { error: e.message });
      return [{ address: '', value: '0', data: payload }];
    }
  }
  
  // Check if it's a direct multiSend
  if (isMultiSend(payload)) {
    try {
      return parseMultiSend(payload);
    } catch (e) {
      log('error', 'safe', 'Error processing multiSend', { error: e.message });
      return [{ address: '', value: '0', data: payload }];
    }
  }
  
  // Not a Safe format, return as-is
  return null;
}

// Export for ES modules
export {
  SAFE_MULTISEND_ADDRESSES,
  isSafeMultisendAddress,
  isExecTransaction,
  isMultiSend,
  decodeExecTransaction,
  parseMultiSend,
  processSafePayload
};
