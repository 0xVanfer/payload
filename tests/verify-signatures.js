#!/usr/bin/env node
/**
 * Signature Verification Script
 * 
 * Verifies function signatures in signatures.js against OpenChain (4bytes) API.
 * 
 * Usage:
 *   node tests/verify-signatures.js [options]
 * 
 * Options:
 *   --delay=<ms>     Delay between API requests (default: 200)
 *   --verbose        Show all results including correct ones
 *   --help           Show this help message
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  delay: 200,
  verbose: false,
  help: false
};

for (const arg of args) {
  if (arg.startsWith('--delay=')) {
    options.delay = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--verbose') {
    options.verbose = true;
  } else if (arg === '--help') {
    options.help = true;
  }
}

if (options.help) {
  console.log(`
Signature Verification Script

Verifies function signatures against OpenChain (4bytes) API.

Usage:
  node tests/verify-signatures.js [options]

Options:
  --delay=<ms>     Delay between API requests (default: 200)
  --verbose        Show all results including correct ones
  --help           Show this help message
`);
  process.exit(0);
}

// Load signatures from file
function loadSignatures() {
  const sigPath = path.join(__dirname, '..', 'js', 'config', 'signatures.js');
  const content = fs.readFileSync(sigPath, 'utf-8');
  
  // Extract COMMON_SIGNATURES object using regex
  const match = content.match(/const COMMON_SIGNATURES = \{([\s\S]*?)\n\};/);
  if (!match) {
    throw new Error('Could not parse COMMON_SIGNATURES from file');
  }
  
  const signatures = {};
  const regex = /'(0x[a-fA-F0-9]+)':\s*\['([^']+)'\]/g;
  let m;
  while ((m = regex.exec(match[1])) !== null) {
    signatures[m[1].toLowerCase()] = [m[2]];
  }
  
  return signatures;
}

// OpenChain API lookup
function lookupOpenChain(selector) {
  return new Promise((resolve, reject) => {
    const url = `https://api.openchain.xyz/signature-database/v1/lookup?function=${selector}&filter=true`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    }).on('error', err => reject(new Error(`Network error: ${err.message}`)));
  });
}

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main verification
async function main() {
  console.log('\n========================================');
  console.log('  Signature Verification Tool');
  console.log('  Using OpenChain (4bytes) API');
  console.log('========================================\n');
  
  let signatures;
  try {
    signatures = loadSignatures();
  } catch (err) {
    console.error(`Error loading signatures: ${err.message}`);
    process.exit(1);
  }
  
  const selectors = Object.keys(signatures);
  console.log(`Found ${selectors.length} signatures to verify\n`);
  
  const results = {
    correct: [],
    mismatch: [],
    notFound: [],
    errors: []
  };
  
  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i];
    const localSig = signatures[selector][0];
    
    process.stdout.write(`[${String(i + 1).padStart(3)}/${selectors.length}] ${selector}: `);
    
    try {
      const response = await lookupOpenChain(selector);
      
      if (response.ok && response.result?.function?.[selector]) {
        const apiSignatures = response.result.function[selector].map(s => s.name);
        
        if (apiSignatures.includes(localSig)) {
          if (options.verbose) {
            console.log(`✅ OK - ${localSig}`);
          } else {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
          }
          results.correct.push({ selector, local: localSig, api: apiSignatures });
        } else {
          console.log(`❌ MISMATCH`);
          console.log(`       Local: ${localSig}`);
          console.log(`       API:   ${apiSignatures.slice(0, 3).join(', ')}${apiSignatures.length > 3 ? '...' : ''}`);
          results.mismatch.push({ selector, local: localSig, api: apiSignatures });
        }
      } else {
        console.log(`⚠️  NOT FOUND - ${localSig}`);
        results.notFound.push({ selector, local: localSig });
      }
    } catch (err) {
      console.log(`❗ ERROR: ${err.message}`);
      results.errors.push({ selector, local: localSig, error: err.message });
    }
    
    await delay(options.delay);
  }
  
  // Print summary
  console.log('\n========================================');
  console.log('  Verification Summary');
  console.log('========================================');
  console.log(`  ✅ Correct:     ${results.correct.length}`);
  console.log(`  ❌ Mismatch:    ${results.mismatch.length}`);
  console.log(`  ⚠️  Not Found:  ${results.notFound.length}`);
  console.log(`  ❗ Errors:      ${results.errors.length}`);
  console.log('========================================\n');
  
  if (results.mismatch.length > 0) {
    console.log('Mismatched Signatures:');
    console.log('-'.repeat(60));
    for (const item of results.mismatch) {
      console.log(`\n  ${item.selector}`);
      console.log(`    Local: ${item.local}`);
      console.log(`    API:   ${item.api.join('\n           ')}`);
    }
    console.log();
  }
  
  if (results.notFound.length > 0) {
    console.log('Not Found in API (may still be correct):');
    console.log('-'.repeat(60));
    for (const item of results.notFound) {
      console.log(`  ${item.selector}: ${item.local}`);
    }
    console.log();
  }
  
  // Exit with error code if there are mismatches
  if (results.mismatch.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
