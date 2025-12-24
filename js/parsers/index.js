/**
 * Link Parser Registry Module
 * 
 * Central registry for all link parsers. Detects link type and
 * dispatches to appropriate parser.
 */

import { log } from '../core/abi-utils.js';
import { parseEtherscanLink, isEtherscanLink } from './etherscan.js';
import { parseTenderlyLink, isTenderlyLink } from './tenderly.js';

/**
 * Result structure for parsed links.
 * @typedef {Object} ParsedLink
 * @property {boolean} success - Whether parsing succeeded
 * @property {string} [payload] - The extracted transaction payload
 * @property {string|number} [chainId] - The detected chain ID
 * @property {string} [txHash] - The transaction hash if available
 * @property {string} [source] - The source type (etherscan, tenderly, etc.)
 * @property {string} [error] - Error message if parsing failed
 */

/**
 * Registry of link parsers.
 * Each parser has a detect function and a parse function.
 */
const parsers = [
  {
    name: 'tenderly',
    detect: isTenderlyLink,
    parse: parseTenderlyLink
  },
  {
    name: 'etherscan',
    detect: isEtherscanLink,
    parse: parseEtherscanLink
  }
];

/**
 * Detect the type of link and return the parser name.
 * @param {string} url - The URL to check
 * @returns {string|null} The parser name or null if not recognized
 */
function detectLinkType(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  for (const parser of parsers) {
    if (parser.detect(url)) {
      log('debug', 'link-parser', 'Detected link type', { type: parser.name, url });
      return parser.name;
    }
  }
  
  log('debug', 'link-parser', 'Unknown link type', { url });
  return null;
}

/**
 * Parse a URL to extract payload and chain information.
 * Automatically detects the link type and dispatches to appropriate parser.
 * 
 * @param {string} url - The URL to parse
 * @returns {Promise<ParsedLink>} The parsed link result
 */
async function parseLink(url) {
  log('info', 'link-parser', 'Parsing link', { url });
  
  if (!url || typeof url !== 'string') {
    return {
      success: false,
      error: 'Invalid URL provided'
    };
  }
  
  // Find matching parser
  for (const parser of parsers) {
    if (parser.detect(url)) {
      log('info', 'link-parser', 'Using parser', { parser: parser.name });
      try {
        const result = await parser.parse(url);
        return {
          ...result,
          source: parser.name
        };
      } catch (e) {
        log('error', 'link-parser', 'Parser error', { parser: parser.name, error: e.message });
        return {
          success: false,
          source: parser.name,
          error: e.message
        };
      }
    }
  }
  
  // No parser found
  return {
    success: false,
    error: 'Unrecognized link format'
  };
}

/**
 * Check if a string looks like a URL that might contain transaction data.
 * @param {string} input - The input to check
 * @returns {boolean} True if the input appears to be a parseable link
 */
function isParsableLink(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }
  
  // Must be a URL
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    return false;
  }
  
  return detectLinkType(input) !== null;
}

/**
 * Get all registered parser names.
 * @returns {string[]} Array of parser names
 */
function getParserNames() {
  return parsers.map(p => p.name);
}

// Export for ES modules
export {
  parseLink,
  detectLinkType,
  isParsableLink,
  getParserNames
};
