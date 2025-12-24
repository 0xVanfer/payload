/**
 * ABI Utilities Module
 * 
 * Provides utilities for working with Ethereum ABI encoding/decoding.
 * Handles type parsing, value formatting, and address checksumming.
 */

/**
 * Logger utility for consistent logging format.
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} module - Module name for context
 * @param {string} message - Log message
 * @param {*} [data] - Optional data to log
 */
function log(level, module, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;
  if (data !== null) {
    console[level](`${prefix} ${message}`, data);
  } else {
    console[level](`${prefix} ${message}`);
  }
}

/**
 * Checksum an Ethereum address using EIP-55.
 * @param {string} address - The address to checksum
 * @returns {string} The checksummed address, or original if invalid
 */
function checksumAddress(address) {
  try {
    return window.ethers.utils.getAddress(address);
  } catch (e) {
    log('warn', 'abi-utils', 'Failed to checksum address', { address, error: e.message });
    return address;
  }
}

/**
 * Recursively get the full ABI type string including tuple components.
 * @param {Object} input - The ABI input/output parameter definition
 * @returns {string} The complete type string (e.g., "tuple(address,uint256)[]")
 */
function getFullAbiType(input) {
  if (!input) {
    return '';
  }
  
  // Handle tuple types
  if (input.baseType === 'tuple') {
    const inner = input.components.map(getFullAbiType).join(',');
    const arrayPart = input.type.endsWith('[]') ? '[]' : '';
    return `tuple(${inner})${arrayPart}`;
  }
  
  // Handle array types
  if (input.baseType && input.baseType.endsWith('[]')) {
    if (input.arrayChildren) {
      return getFullAbiType(input.arrayChildren) + '[]';
    }
    return input.type;
  }
  
  return input.type;
}

/**
 * Convert a decoded value to a displayable string format.
 * @param {*} value - The decoded value
 * @param {Object} input - The ABI input definition
 * @returns {string} The formatted string representation
 */
function formatValue(value, input) {
  try {
    if (!input) {
      return String(value);
    }
    
    // Handle bytes type
    if (input.baseType === 'bytes') {
      return window.ethers.utils.hexlify(value);
    }
    
    // Handle address type
    if (input.baseType === 'address') {
      return checksumAddress(value);
    }
    
    // Handle tuple type
    if (input.baseType === 'tuple') {
      const parts = [];
      for (let i = 0; i < input.components.length; i++) {
        parts.push(formatValue(value[i], input.components[i]));
      }
      return '(' + parts.join(',') + ')';
    }
    
    // Handle array types
    if (input.baseType && input.baseType.endsWith('[]')) {
      const items = Array.from(value).map((v) => {
        return formatValue(v, input.arrayChildren);
      });
      return '[' + items.join(',') + ']';
    }
    
    // Handle numeric types
    if (input.baseType && (input.baseType.startsWith('uint') || input.baseType.startsWith('int'))) {
      return value.toString();
    }
    
    return String(value);
  } catch (e) {
    log('warn', 'abi-utils', 'Error formatting value', { error: e.message, value, type: input?.type });
    return String(value);
  }
}

/**
 * Split a comma-separated type string respecting nested parentheses.
 * @param {string} typeStr - The type string to split (e.g., "address,tuple(uint256,bytes),bool")
 * @returns {string[]} Array of individual type strings
 */
function splitTypeString(typeStr) {
  const result = [];
  let depth = 0;
  let start = 0;
  
  for (let i = 0; i < typeStr.length; i++) {
    const char = typeStr[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      result.push(typeStr.slice(start, i).trim());
      start = i + 1;
    }
  }
  
  // Add the last segment
  if (start < typeStr.length) {
    result.push(typeStr.slice(start).trim());
  }
  
  return result.filter(Boolean);
}

/**
 * Parse a function signature string into name and parameter types.
 * @param {string} signature - The function signature (e.g., "transfer(address,uint256)")
 * @returns {{name: string, params: string[]}|null} Parsed signature or null if invalid
 */
function parseSignature(signature) {
  const match = signature.match(/^(\w+)\((.*)\)$/);
  if (!match) {
    log('warn', 'abi-utils', 'Invalid signature format', { signature });
    return null;
  }
  
  return {
    name: match[1],
    params: splitTypeString(match[2])
  };
}

/**
 * Get the JavaScript type of a decoded value.
 * @param {*} value - The value to check
 * @returns {string} The type description
 */
function getValueType(value) {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value && typeof value === 'object') {
    return 'object';
  }
  return typeof value;
}

/**
 * Decode payload data using a function signature.
 * @param {string} signature - The function signature (e.g., "transfer(address,uint256)")
 * @param {string} payload - The hex-encoded payload data
 * @returns {{params: Array, error: string|null}} Decoded parameters or error
 */
function decodeWithSignature(signature, payload) {
  log('debug', 'abi-utils', 'Decoding payload with signature', { signature, payloadLength: payload.length });
  
  if (!signature) {
    return { params: [], error: 'No signature provided' };
  }
  
  try {
    const abi = [`function ${signature}`];
    const iface = new window.ethers.utils.Interface(abi);
    const data = payload.startsWith('0x') ? payload : '0x' + payload;
    
    // Verify sighash matches
    const payloadSighash = data.slice(0, 10).toLowerCase();
    const funcName = signature.split('(')[0];
    const abiSighash = iface.getSighash(funcName).toLowerCase();
    
    if (payloadSighash !== abiSighash) {
      const errorMsg = `Sighash mismatch: payload=${payloadSighash}, expected=${abiSighash}`;
      log('error', 'abi-utils', errorMsg);
      return {
        params: [{
          Value: '',
          AbiType: '',
          GoType: '',
          Error: errorMsg
        }],
        error: errorMsg
      };
    }
    
    // Decode the function data
    const args = iface.decodeFunctionData(signature, data);
    const method = iface.getFunction(signature);
    const params = [];
    
    for (let i = 0; i < method.inputs.length; i++) {
      const input = method.inputs[i];
      const abiType = getFullAbiType(input);
      const goType = getValueType(args[i]);
      const value = formatValue(args[i], input);
      
      params.push({
        Value: value,
        AbiType: abiType,
        GoType: goType,
        name: input.name || `param${i}`
      });
    }
    
    log('debug', 'abi-utils', 'Successfully decoded payload', { paramCount: params.length });
    return { params, error: null };
    
  } catch (e) {
    const errorMsg = `Decode failed: ${e.message}`;
    log('error', 'abi-utils', errorMsg, { signature, error: e });
    return {
      params: [{
        Value: '',
        AbiType: '',
        GoType: '',
        Error: errorMsg
      }],
      error: errorMsg
    };
  }
}

/**
 * Extract the 4-byte function selector from payload.
 * @param {string} payload - The hex-encoded payload
 * @returns {string} The function selector (e.g., "0xa9059cbb")
 */
function extractSelector(payload) {
  const data = payload.startsWith('0x') ? payload : '0x' + payload;
  if (data.length < 10) {
    return '';
  }
  return data.slice(0, 10).toLowerCase();
}

/**
 * Check if a payload is empty (just 0x or very short).
 * @param {string} payload - The payload to check
 * @returns {boolean} True if payload is empty
 */
function isEmptyPayload(payload) {
  const cleaned = payload.replace(/^0x/i, '');
  return cleaned.length === 0;
}

// Export for ES modules
export {
  log,
  checksumAddress,
  getFullAbiType,
  formatValue,
  splitTypeString,
  parseSignature,
  getValueType,
  decodeWithSignature,
  extractSelector,
  isEmptyPayload
};
