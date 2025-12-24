/**
 * Function Signature Lookup Module
 * 
 * Provides functionality to look up function signatures from online databases
 * and manage custom registered signatures.
 * Uses local common signatures database first for fast O(1) lookups.
 */

import { log, extractSelector } from './abi-utils.js';
import { lookupCommonSignature } from '../config/signatures.js';

/**
 * Storage for custom registered signatures.
 * Maps function selector to signature string.
 * @type {Map<string, string>}
 */
const customSignatures = new Map();

/**
 * Cache for looked up signatures to reduce API calls.
 * @type {Map<string, string>}
 */
const signatureCache = new Map();

/**
 * API endpoint for signature lookups.
 * Using 4byte.sourcify.dev as primary source.
 */
const SIGNATURE_API_URL = 'https://api.4byte.sourcify.dev/signature-database/v1/lookup';

/**
 * API endpoint for registering new signatures.
 */
const SIGNATURE_IMPORT_URL = 'https://api.4byte.sourcify.dev/signature-database/v1/import';

/**
 * Look up a function signature by its 4-byte selector.
 * First checks custom signatures, then cache, then queries API.
 * 
 * @param {string} sighashOrPayload - The 4-byte selector (0x + 4 bytes) or full payload
 * @returns {Promise<string>} The function signature or empty string if not found
 */
async function lookupSignature(sighashOrPayload) {
  const sighash = extractSelector(sighashOrPayload);
  
  if (!sighash || sighash.length !== 10) {
    log('warn', 'signature', 'Invalid sighash format', { sighash });
    return '';
  }
  
  log('debug', 'signature', 'Looking up signature', { sighash });
  
  // Check custom signatures first
  if (customSignatures.has(sighash)) {
    const sig = customSignatures.get(sighash);
    log('debug', 'signature', 'Found in custom signatures', { sighash, signature: sig });
    return sig;
  }
  
  // Check local common signatures database (O(1) lookup)
  const commonSig = lookupCommonSignature(sighash);
  if (commonSig) {
    log('debug', 'signature', 'Found in common signatures', { sighash, signature: commonSig });
    return commonSig;
  }
  
  // Check cache
  if (signatureCache.has(sighash)) {
    const sig = signatureCache.get(sighash);
    log('debug', 'signature', 'Found in cache', { sighash, signature: sig });
    return sig;
  }
  
  // Query the API
  try {
    const url = `${SIGNATURE_API_URL}?function=${sighash}&filter=true`;
    log('debug', 'signature', 'Querying API', { url });
    
    const response = await fetch(url);
    if (!response.ok) {
      log('warn', 'signature', 'API request failed', { status: response.status });
      return '';
    }
    
    const data = await response.json();
    const results = data?.result?.function?.[sighash];
    
    if (results && results.length > 0) {
      const signature = results[0].name;
      signatureCache.set(sighash, signature);
      log('info', 'signature', 'Found signature from API', { sighash, signature });
      return signature;
    }
    
    log('debug', 'signature', 'No signature found', { sighash });
    return '';
    
  } catch (e) {
    log('error', 'signature', 'API lookup error', { sighash, error: e.message });
    return '';
  }
}

/**
 * Register a custom function signature.
 * 
 * @param {string} signature - The function signature (e.g., "transfer(address,uint256)")
 * @returns {string} The computed selector for the signature
 */
function registerCustomSignature(signature) {
  try {
    const abi = [`function ${signature}`];
    const iface = new window.ethers.utils.Interface(abi);
    const funcName = signature.split('(')[0];
    const sighash = iface.getSighash(funcName).toLowerCase();
    
    customSignatures.set(sighash, signature);
    log('info', 'signature', 'Registered custom signature', { signature, sighash });
    
    return sighash;
  } catch (e) {
    log('error', 'signature', 'Failed to register signature', { signature, error: e.message });
    throw e;
  }
}

/**
 * Parse a markdown table containing function signatures.
 * Extracts function signatures from tables like:
 * | Function Name | Sighash    | Function Signature |
 * | ------------- | ---------- | ------------------ |
 * | transfer      | a9059cbb   | transfer(address,uint256) |
 * 
 * @param {string} text - The text containing the markdown table
 * @returns {string[]} Array of extracted function signatures
 */
function parseSignatureTable(text) {
  const signatures = [];
  
  // Match function signatures with nested parentheses support
  const regex = /(\b\w+)\(((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*)\)/g;
  
  for (const line of text.split('\n')) {
    let match;
    while ((match = regex.exec(line)) !== null) {
      const sig = match[1] + '(' + match[2] + ')';
      signatures.push(sig);
    }
    regex.lastIndex = 0; // Reset regex state for next line
  }
  
  log('debug', 'signature', 'Parsed signatures from table', { count: signatures.length });
  return signatures;
}

/**
 * Submit signatures to the public signature database.
 * 
 * @param {string[]} signatures - Array of function signatures to submit
 * @returns {Promise<{success: boolean, error?: string}>} Result of the submission
 */
async function submitSignatures(signatures) {
  if (!signatures || signatures.length === 0) {
    return { success: false, error: 'No signatures provided' };
  }
  
  log('info', 'signature', 'Submitting signatures to database', { count: signatures.length });
  
  try {
    const body = {
      function: signatures,
      event: []
    };
    
    const response = await fetch(SIGNATURE_IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (response.ok) {
      log('info', 'signature', 'Successfully submitted signatures');
      return { success: true };
    } else {
      const errorText = await response.text();
      log('error', 'signature', 'Failed to submit signatures', { status: response.status, error: errorText });
      return { success: false, error: `API error: ${response.status}` };
    }
    
  } catch (e) {
    log('error', 'signature', 'Network error submitting signatures', { error: e.message });
    return { success: false, error: `Network error: ${e.message}` };
  }
}

/**
 * Clear the signature cache.
 * Useful for testing or when fresh lookups are needed.
 */
function clearCache() {
  signatureCache.clear();
  log('debug', 'signature', 'Signature cache cleared');
}

/**
 * Get all custom registered signatures.
 * @returns {Object} Map of sighash to signature
 */
function getCustomSignatures() {
  return Object.fromEntries(customSignatures);
}

// Export for ES modules
export {
  lookupSignature,
  registerCustomSignature,
  parseSignatureTable,
  submitSignatures,
  clearCache,
  getCustomSignatures
};
