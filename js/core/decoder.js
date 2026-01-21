/**
 * Main Decoder Module
 * 
 * Orchestrates the payload decoding process by coordinating
 * multicall detection, Safe transaction parsing, and signature lookups.
 */

import { 
  log, 
  checksumAddress, 
  decodeWithSignature, 
  isEmptyPayload,
  extractSelector 
} from './abi-utils.js';
import { lookupSignature } from './signature.js';
import { processSafePayload, isExecTransaction, isMultiSend, parseMultiSendPackedBytes } from './safe.js';
import { parseMulticall, isMulticall } from './multicall.js';

/**
 * Result structure for a decoded call.
 * @typedef {Object} DecodedCall
 * @property {string} calledAddress - The target address of the call
 * @property {string} functionName - The function signature or 'unknown'
 * @property {Array<{AbiType: string, Value: string, GoType: string, name?: string, Error?: string}>} params - Decoded parameters
 * @property {string} payload - The original payload data
 * @property {string} error - Error message if decoding failed
 */

/**
 * Split a payload into individual calls.
 * Handles Safe transactions, multicall patterns, and single calls.
 * 
 * @param {string} payload - The hex-encoded payload
 * @returns {Array<{address: string, value: string, data: string}>} Array of individual calls
 */
function splitPayloadIntoCalls(payload) {
  log('debug', 'decoder', 'Splitting payload into calls', { payloadLength: payload.length });
  
  // Normalize payload
  const data = payload.startsWith('0x') ? payload : '0x' + payload;
  
  // Try Safe transaction formats first
  if (isExecTransaction(data)) {
    log('debug', 'decoder', 'Detected Safe execTransaction');
    const safeCalls = processSafePayload(data);
    if (safeCalls) {
      return safeCalls.map(call => ({
        address: call.address || '',
        value: call.value || '0',
        data: call.data
      }));
    }
  }
  
  // Try multiSend format
  if (isMultiSend(data)) {
    log('debug', 'decoder', 'Detected Safe multiSend');
    const safeCalls = processSafePayload(data);
    if (safeCalls) {
      return safeCalls.map(call => ({
        address: call.address || '',
        value: call.value || '0',
        data: call.data
      }));
    }
  }
  
  // Try generic multicall formats
  if (isMulticall(data)) {
    log('debug', 'decoder', 'Detected multicall pattern');
    const multicallResults = parseMulticall(data);
    if (multicallResults && multicallResults.length > 0) {
      return multicallResults;
    }
  }
  
  // Single call - return as-is
  log('debug', 'decoder', 'Treating as single call');
  return [{
    address: '',
    value: '0',
    data: data
  }];
}

/**
 * Decode a single call payload.
 * 
 * @param {Object} call - The call object with address, value, and data
 * @returns {Promise<DecodedCall>} The decoded call information
 */
async function decodeSingleCall(call) {
  log('debug', 'decoder', 'Decoding single call', { 
    address: call.address, 
    dataLength: call.data?.length 
  });
  
  // Handle empty call (ETH transfer)
  if (isEmptyPayload(call.data)) {
    log('debug', 'decoder', 'Empty payload - ETH transfer');
    return {
      calledAddress: call.address ? checksumAddress(call.address) : '',
      functionName: 'Call',
      params: [{
        AbiType: 'uint256',
        Value: call.value || '0',
        GoType: 'number',
        name: 'value'
      }],
      payload: call.data,
      error: ''
    };
  }
  
  let functionName = '';
  let params = [];
  let errorStr = '';
  
  try {
    // Look up the function signature
    functionName = await lookupSignature(call.data);
    
    if (functionName) {
      // Decode with the found signature
      const decoded = decodeWithSignature(functionName, call.data);
      params = decoded.params;
      if (decoded.error) {
        errorStr = decoded.error;
      }
    } else {
      log('debug', 'decoder', 'No signature found for selector', { selector: extractSelector(call.data) });
      errorStr = `Unknown function: ${extractSelector(call.data)}`;
    }
    
  } catch (e) {
    log('error', 'decoder', 'Error decoding call', { error: e.message });
    errorStr = e.message;
  }
  
  return {
    calledAddress: call.address ? checksumAddress(call.address) : '',
    functionName: functionName || '',
    params,
    payload: call.data,
    error: errorStr
  };
}

/**
 * Main entry point for decoding a payload.
 * Handles all formats and returns structured decoded data.
 * 
 * @param {string} payload - The hex-encoded payload
 * @param {string} [topLevelTo] - The top-level contract address being called (from link parsing)
 * @returns {Promise<DecodedCall[]>} Array of decoded call results
 */
async function decodePayload(payload, topLevelTo = null) {
  log('info', 'decoder', 'Starting payload decode', { payloadLength: payload?.length, topLevelTo });
  
  if (!payload || typeof payload !== 'string') {
    log('error', 'decoder', 'Invalid payload provided');
    return [];
  }
  
  // Normalize payload
  const normalizedPayload = payload.trim();
  if (!normalizedPayload.startsWith('0x')) {
    log('warn', 'decoder', 'Payload does not start with 0x, adding prefix');
  }
  
  try {
    // Split into individual calls
    const calls = splitPayloadIntoCalls(normalizedPayload);
    log('info', 'decoder', 'Split into calls', { callCount: calls.length });
    
    // Decode each call
    const results = [];
    for (let i = 0; i < calls.length; i++) {
      log('debug', 'decoder', `Decoding call ${i + 1}/${calls.length}`);
      const decoded = await decodeSingleCall(calls[i]);
      
      // For the first call (top-level), use topLevelTo if available and no address was extracted
      if (i === 0 && topLevelTo && !decoded.calledAddress) {
        decoded.calledAddress = topLevelTo;
      }
      
      results.push(decoded);
    }
    
    log('info', 'decoder', 'Finished payload decode', { resultCount: results.length });
    return results;
    
  } catch (e) {
    log('error', 'decoder', 'Fatal error during decode', { error: e.message, stack: e.stack });
    return [];
  }
}

/**
 * Recursively find and decode nested bytes fields within decoded parameters.
 * 
 * @param {Array} params - The decoded parameters to search
 * @param {string} [parentPath=''] - The current path in the structure
 * @param {string} [functionName=''] - The function name for context (e.g., to detect multiSend)
 * @returns {Promise<Array<{path: string, bytesValue: string, decoded: DecodedCall[]}>>} 
 *          Array of nested bytes with their decoded contents
 */
async function findAndDecodeNestedBytes(params, parentPath = '', functionName = '') {
  const results = [];
  
  if (!Array.isArray(params)) {
    return results;
  }
  
  // Check if parent function is multiSend(bytes)
  const isMultiSendFunction = functionName.toLowerCase().startsWith('multisend(bytes)');
  
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (!param || !param.AbiType) continue;
    
    const path = parentPath ? `${parentPath}.${param.AbiType}[${i}]` : `${param.AbiType}[${i}]`;
    
    // Handle bytes[] type
    if (param.AbiType === 'bytes[]') {
      let arr = [];
      try {
        arr = JSON.parse(param.Value);
      } catch {
        arr = String(param.Value)
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map(s => s.trim().replace(/^"|"$/g, ''));
      }
      
      for (let j = 0; j < arr.length; j++) {
        const bytesValue = arr[j];
        if (isDecodableBytes(bytesValue)) {
          try {
            log('debug', 'decoder', 'Decoding nested bytes[]', { path: `${path}[${j}]` });
            const decoded = await decodePayload(bytesValue);
            results.push({
              path: `${path}[${j}]`,
              bytesValue,
              decoded
            });
            
            // Recursively decode any nested bytes in the result
            for (const item of decoded) {
              if (item.params) {
                const nested = await findAndDecodeNestedBytes(item.params, `${path}[${j}]`, item.functionName);
                results.push(...nested);
              }
            }
          } catch (e) {
            log('warn', 'decoder', 'Failed to decode nested bytes[]', { path: `${path}[${j}]`, error: e.message });
          }
        }
      }
      continue;
    }
    
    // Handle single bytes type (not bytes32)
    if (/^bytes(?!32)/.test(param.AbiType)) {
      const bytesValue = param.Value;
      
      // Special handling for multiSend(bytes) - use packed encoding parser
      if (isMultiSendFunction && i === 0) {
        try {
          log('info', 'decoder', 'Detected multiSend bytes parameter, using packed encoding parser', { path });
          const packedTransactions = parseMultiSendPackedBytes(bytesValue);
          
          if (packedTransactions && packedTransactions.length > 0) {
            // Decode each transaction's data
            const decodedItems = [];
            for (let j = 0; j < packedTransactions.length; j++) {
              const tx = packedTransactions[j];
              
              // Create a call object for decoding
              const call = {
                address: tx.address,
                value: tx.value,
                data: tx.data
              };
              
              // Decode the inner call
              const decoded = await decodeSingleCall(call);
              
              // Add operation info to the result
              decoded.operation = tx.operation;
              decoded.operationName = tx.operationName;
              
              decodedItems.push(decoded);
              
              // Recursively decode any nested bytes in this transaction
              if (decoded.params) {
                const nestedResults = await findAndDecodeNestedBytes(decoded.params, `${path}[${j}]`, decoded.functionName);
                results.push(...nestedResults);
              }
            }
            
            results.push({
              path,
              bytesValue,
              decoded: decodedItems,
              isMultiSendPacked: true
            });
            
            continue;
          }
        } catch (e) {
          log('warn', 'decoder', 'Failed to parse multiSend packed bytes, falling back to standard decode', { 
            path, 
            error: e.message 
          });
        }
      }
      
      // Standard bytes decoding
      if (isDecodableBytes(bytesValue)) {
        try {
          log('debug', 'decoder', 'Decoding nested bytes', { path });
          const decoded = await decodePayload(bytesValue);
          results.push({
            path,
            bytesValue,
            decoded
          });
          
          // Recursively decode any nested bytes in the result
          for (const item of decoded) {
            if (item.params) {
              const nested = await findAndDecodeNestedBytes(item.params, path, item.functionName);
              results.push(...nested);
            }
          }
        } catch (e) {
          log('warn', 'decoder', 'Failed to decode nested bytes', { path, error: e.message });
        }
      }
      continue;
    }
    
    // Handle tuple[] type
    if (/^tuple.*\[\]$/.test(param.AbiType)) {
      let arr = [];
      try {
        arr = JSON.parse(param.Value);
      } catch {
        continue;
      }
      
      for (let j = 0; j < arr.length; j++) {
        // Convert tuple array item to params format for recursion
        const tupleParams = parseTupleValue(arr[j], param.AbiType.replace(/\[\]$/, ''));
        if (tupleParams) {
          const nested = await findAndDecodeNestedBytes(tupleParams, `${path}[${j}]`, functionName);
          results.push(...nested);
        }
      }
      continue;
    }
    
    // Handle single tuple type
    if (/^tuple/.test(param.AbiType)) {
      const tupleParams = parseTupleValue(param.Value, param.AbiType);
      if (tupleParams) {
        const nested = await findAndDecodeNestedBytes(tupleParams, path, functionName);
        results.push(...nested);
      }
    }
  }
  
  return results;
}

/**
 * Check if a bytes value is likely decodable (contains function data).
 * @param {string} value - The bytes value to check
 * @returns {boolean} True if the value appears to be decodable function data
 */
function isDecodableBytes(value) {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('0x')) return false;
  if (value.length < 10) return false; // Must be at least 4 bytes (selector only, no params)
  if (value.startsWith('0x00000000')) return false; // Likely just data, not a call
  return true;
}

/**
 * Parse a tuple value string into a params-like array structure.
 * @param {string|Array} value - The tuple value
 * @param {string} abiType - The ABI type string
 * @returns {Array|null} Array of param-like objects or null if parsing fails
 */
function parseTupleValue(value, abiType) {
  let arr;
  try {
    if (typeof value === 'string') {
      arr = JSON.parse(value);
    } else {
      arr = value;
    }
  } catch {
    return null;
  }
  
  if (!Array.isArray(arr)) return null;
  
  // Extract inner types from tuple(type1,type2,...)
  const match = abiType.match(/^tuple\((.*)\)$/);
  if (!match) return null;
  
  const types = splitTupleTypes(match[1]);
  
  return arr.map((val, i) => ({
    AbiType: types[i] || 'unknown',
    Value: typeof val === 'object' ? JSON.stringify(val) : String(val),
    GoType: typeof val
  }));
}

/**
 * Split tuple type string respecting nested parentheses.
 * @param {string} typeStr - The type string to split
 * @returns {string[]} Array of type strings
 */
function splitTupleTypes(typeStr) {
  const result = [];
  let depth = 0;
  let start = 0;
  
  for (let i = 0; i < typeStr.length; i++) {
    const char = typeStr[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      result.push(typeStr.slice(start, i).trim());
      start = i + 1;
    }
  }
  
  if (start < typeStr.length) {
    result.push(typeStr.slice(start).trim());
  }
  
  return result.filter(Boolean);
}

// Export for ES modules
export {
  decodePayload,
  splitPayloadIntoCalls,
  decodeSingleCall,
  findAndDecodeNestedBytes,
  isDecodableBytes,
  splitTupleTypes
};
