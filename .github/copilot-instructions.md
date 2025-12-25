# Payload Parser - Copilot Instructions

## Project Overview

Build a modular Ethereum transaction payload decoder as a static web page. The tool should recursively parse Multicall, Gnosis Safe, Uniswap, and other protocol payloads, supporting direct link input from Etherscan and Tenderly.

## Core Requirements

### 1. Architecture

-   Pure frontend static page, deployable to GitHub Pages
-   ES Modules architecture with clear separation of concerns
-   No build tools or bundlers required
-   Use ethers.js v5.7.2 via CDN (UMD build)

### 2. Module Structure

```
payload/
├── index.html
├── css/styles.css
├── js/
│   ├── app.js              # Entry point, event bindings
│   ├── config/
│   │   ├── chains.js       # Chain configurations
│   │   └── signatures.js   # Local signature database
│   ├── core/
│   │   ├── abi-utils.js    # ABI decoding utilities
│   │   ├── decoder.js      # Recursive decoder
│   │   └── signature.js    # Signature lookup
│   ├── parsers/
│   │   ├── index.js
│   │   ├── etherscan.js    # Etherscan link parser
│   │   └── tenderly.js     # Tenderly link parser
│   └── ui/
│       └── renderer.js     # UI rendering
└── tests/
    ├── test-runner.html
    └── test-*.js
```

### 3. Key Technical Specifications

#### ethers.js Usage

-   Access via `window.ethers` in ES modules (not direct `ethers`)
-   Use ethers v5 API: `ethers.utils.Interface`, `ethers.utils.keccak256`, etc.

#### Etherscan API

-   Use V2 API: `https://api.etherscan.io/v2/api?chainid={chainId}&...`
-   Implement API key rotation with multiple keys
-   Support all major chains: Ethereum, Arbitrum, Optimism, Polygon, BSC, Base, Avalanche, Mantle

#### Tenderly API

-   Handle VNet transactions: extract `fork_transaction.input` and `fork_transaction.network_id`
-   Handle simulation links with different URL patterns

#### Local Signature Database

-   Store common signatures as `{ selector: [signature1, signature2] }`
-   O(1) hash table lookup
-   Include ERC20/721/1155, Gnosis Safe, Uniswap V2/V3, Multicall, common DeFi protocols, EIP-6093 errors
-   Lookup order: Custom → Local Common → Cache → API

### 4. UI/UX Requirements

#### Column Widths

-   Function: 22%
-   Parameters: 58%
-   Payload: 20%

#### Font Sizes

-   Parameter values: 14px
-   Address/uint256 displays: 14px
-   Payload display: 11px

#### Nested Bytes Display

-   Bytes values in Parameters column: display normally without width restrictions
-   Only Payload column should be compact (20% width, overflow hidden)

#### Table Column Width Enforcement

For both main table and nested tables, use `<colgroup>` with inline styles to enforce column widths:

```html
<div class="results-table-container">
    <table class="results-table" style="width: 100%; table-layout: fixed;">
        <colgroup>
            <col style="width: 22%;" />
            <col style="width: 58%;" />
            <col style="width: 20%;" />
        </colgroup>
        ...
    </table>
</div>
```

Key points:

-   Always wrap table in `.results-table-container` for `overflow-x: auto`
-   Use `table-layout: fixed` on the table element
-   Use `<colgroup>` with inline `style="width: X%"` for reliable column widths
-   CSS class-based widths alone are unreliable for nested tables

#### Signature Registration

-   Support formats: `transfer(address,uint256)`, `function approve(...)`, `error ERC20InsufficientBalance(...)`, `event Transfer(...)`
-   Support markdown table input

### 5. Testing

-   Browser-based tests at `/tests/test-runner.html`
-   Cover all modules: abi-utils, signature, decoder, parsers, renderer

### 6. Documentation

-   Include: features, project structure, quick start, usage, test instructions, configuration guide, tech stack, API dependencies

## Development Guidelines

1. Always close HTTP servers after debugging sessions using:
    ```bash
    pkill -f "python.*http.server" 2>/dev/null; echo "Server stopped"
    ```
2. Handle CORS issues appropriately for static deployment
3. Implement proper error handling with user-friendly messages
4. Support recursive parsing depth for nested multicall/safe transactions
