# Payload Parser

Ethereum transaction payload decoder with recursive parsing support for Multicall, Gnosis Safe, Uniswap, and more.

## ✨ Features

-   **Multi-Protocol Support** - Auto-detect and parse Multicall, Gnosis Safe, Uniswap Router, and other protocols
-   **Recursive Parsing** - Deep parsing of nested bytes parameters to reveal complete call chains
-   **Link Parsing** - Paste Etherscan, Tenderly, and other block explorer links directly
-   **Multi-Chain** - 16+ chains: Ethereum, Arbitrum, Optimism, Polygon, BSC, Base, Avalanche, Mantle, Scroll, Berachain, etc.
-   **Local Signature Database** - 100+ built-in common function signatures with O(1) hash lookup
-   **Online Signature Lookup** - Integrated with 4byte.sourcify.dev API
-   **Custom Signatures** - Register your own function/error/event signatures
-   **Pure Frontend** - No backend required, deploy directly to GitHub Pages

## 📁 Project Structure

```
payload/
├── index.html              # Main entry page
├── cache-manager.html      # Cache management page
├── vnet-reader.html        # VNet contract reader page
├── css/
│   ├── styles.css          # Main stylesheet
│   ├── cache-manager.css   # Cache manager styles
│   └── vnet-reader.css     # VNet reader styles
├── js/
│   ├── app.js              # Main application entry
│   ├── cache-manager-app.js # Cache manager entry
│   ├── config/
│   │   ├── chains.js       # Chain config (explorer URLs, RPC, names)
│   │   ├── etherscan-api.js # Etherscan API utilities
│   │   ├── presets.js      # VNet reader method presets
│   │   └── signatures.js   # Local common signatures database
│   ├── core/
│   │   ├── abi-utils.js    # ABI encoding/decoding utilities
│   │   ├── address-collector.js # Address collection from decoded results
│   │   ├── cache-manager.js # Unified cache management
│   │   ├── contract-info.js # Contract info lookup (symbol, name)
│   │   ├── contract-name.js # Contract name resolution
│   │   ├── decoder.js      # Main decoder orchestration module
│   │   ├── multicall.js    # Multicall pattern parser
│   │   ├── safe.js         # Safe transaction parser
│   │   └── signature.js    # Signature lookup & registration
│   ├── parsers/
│   │   ├── index.js        # Parser registry entry
│   │   ├── etherscan.js    # Etherscan link parser
│   │   ├── safe.js         # Safe app link parser
│   │   └── tenderly.js     # Tenderly link parser
│   ├── ui/
│   │   ├── copy-utils.js   # Copy button utilities
│   │   ├── renderer.js     # UI rendering module
│   │   ├── tuple-render.js # Tuple type renderer
│   │   └── value-format.js # Value formatting utilities
│   └── vnet-reader/
│       ├── abi-fetcher.js  # ABI fetching for VNet
│       ├── address.js      # Address management
│       ├── call.js         # Contract call execution
│       ├── connection.js   # RPC connection handling
│       ├── history.js      # Call history management
│       ├── index.js        # VNet reader entry
│       ├── method.js       # Method selector handling
│       ├── state.js        # Application state
│       └── utils.js        # Shared utilities
└── tests/
    ├── test-runner.html    # Browser test page
    ├── test-utils.js       # Shared test utilities
    ├── test-decoder.js     # Decoder tests
    ├── test-multicall.js   # Multicall tests
    ├── test-parsers.js     # Link parser tests
    ├── test-contract-info.js # Contract info tests
    ├── test-payloads.json  # Test data
    ├── quick-test.html     # Quick integration tests
    └── verify-signatures.js # Signature verification script
```

## 🚀 Quick Start

### Option 1: Local HTTP Server

```bash
# Navigate to project directory
cd payload

# Start local server with Python
python3 -m http.server 8080

# Or use Node.js
npx serve -p 8080

# Open in browser
open http://localhost:8080
```

### Option 2: GitHub Pages

Deploy directly to GitHub Pages - no build step required.

### Option 3: Direct File Open (Limited)

Due to ES Modules, opening with `file://` protocol may have CORS restrictions. Using an HTTP server is recommended.

## 📖 Usage Guide

### 1. Parse Payload

Paste any of the following formats in the input box:

-   **Raw Payload**: `0x8d80ff0a...` (hex data starting with `0x`)
-   **Etherscan Link**: `https://etherscan.io/tx/0x...`
-   **Tenderly VNet**: `https://dashboard.tenderly.co/explorer/vnet/{id}/tx/0x...`
-   **Tenderly Fork**: `https://dashboard.tenderly.co/{account}/{project}/fork/{id}/simulation/{id}`
-   **Tenderly Public**: `https://dashboard.tenderly.co/public/{account}/{project}/simulator/{id}`

Click "Parse Data" button to decode.

### 2. Select Chain

Chain is auto-detected when parsing Etherscan links. You can also manually select a chain for correct address links.

### 3. Register Custom Signatures

If you see "Unknown Function", click "Unknown Function? Register Signature" to expand the registration form.

Supported formats:

```
// Function signatures
transfer(address,uint256)
function approve(address,uint256)

// Error signatures (EIP-6093)
error ERC20InsufficientBalance(address,uint256,uint256)

// Event signatures
event Transfer(address indexed,address indexed,uint256)

// Markdown table
| Function Name | Sighash | Signature |
| transfer | a9059cbb | transfer(address,uint256) |
```

## 🔗 Supported Chains

| Chain ID | Name              | Explorer                |
| -------- | ----------------- | ----------------------- |
| 1        | Ethereum Mainnet  | etherscan.io            |
| 10       | Optimism          | optimistic.etherscan.io |
| 56       | BNB Smart Chain   | bscscan.com             |
| 137      | Polygon           | polygonscan.com         |
| 5000     | Mantle            | mantlescan.xyz          |
| 8453     | Base              | basescan.org            |
| 42161    | Arbitrum One      | arbiscan.io             |
| 43114    | Avalanche C-Chain | snowscan.xyz            |
| 80094    | Berachain         | berascan.com            |
| 81457    | Blast             | blastscan.io            |
| 534352   | Scroll            | scrollscan.com          |
| 11155111 | Sepolia Testnet   | sepolia.etherscan.io    |
| ...      | More chains       | See chains.js           |

## 🧪 Running Tests

```bash
# Start server
python3 -m http.server 8080

# Open test page
open http://localhost:8080/tests/test-runner.html
```

### Test Coverage

| Module      | Test File            | Coverage                           |
| ----------- | -------------------- | ---------------------------------- |
| Decoder     | test-decoder.js      | ABI utils, payload splitting       |
| Multicall   | test-multicall.js    | Multicall & Safe pattern detection |
| Parsers     | test-parsers.js      | Etherscan, Tenderly link parsing   |
| Integration | quick-test.html      | Quick integration smoke tests      |
| Signatures  | verify-signatures.js | Signature verification (Node.js)   |

## 🔧 Configuration

### Adding New Chains

Edit [js/config/chains.js](js/config/chains.js):

```javascript
const CHAIN_CONFIG = {
    // ... existing chains
    12345: {
        explorer: "https://explorer.newchain.io",
        name: "New Chain",
        rpc: "https://rpc.newchain.io",
    },
};
```

### Adding Local Signatures

Edit [js/config/signatures.js](js/config/signatures.js):

```javascript
const COMMON_SIGNATURES = {
    // ... existing signatures
    "0x12345678": ["myFunction(address,uint256)"],
};
```

### Adding New Link Parsers

Create a new parser file in [js/parsers/](js/parsers/) and register it in [js/parsers/index.js](js/parsers/index.js):

```javascript
// 1. Create js/parsers/myexplorer.js
export function isMyExplorerLink(url) {
    /* detection logic */
}
export async function parseMyExplorerLink(url) {
    /* parsing logic */
}

// 2. Register in js/parsers/index.js
import { isMyExplorerLink, parseMyExplorerLink } from "./myexplorer.js";
const parsers = [
    // ... existing parsers
    { name: "myexplorer", detect: isMyExplorerLink, parse: parseMyExplorerLink },
];
```

## 📚 Tech Stack

-   **ethers.js v5.7.2** - ABI encoding/decoding
-   **Pure ES Modules** - No bundler required
-   **Vanilla JavaScript** - No framework dependencies
-   **CSS Variables** - Theme support

## 🔗 API Dependencies

| API                | Purpose                    | Notes            |
| ------------------ | -------------------------- | ---------------- |
| Etherscan API      | Fetch transaction data     | Via link parsing |
| Tenderly API       | Fetch simulation/VNet data | Public API       |
| 4byte.sourcify.dev | Signature lookup           | Public API       |

## 📝 Development Notes

1. **ES Modules** - All JS files use `import/export`, requires HTTP server
2. **ethers.js Reference** - Use `window.ethers` in modules to access global ethers object
3. **Signature Lookup Order** - Custom → Local DB → Cache → API query
4. **CORS** - Some APIs may have CORS restrictions

## 📄 License

MIT License
