/**
 * VNet Reader Method Module
 * 
 * Handles method selection, parsing, and preset management.
 */

import { state } from './state.js';
import { escapeHtml, debounce, isValidAddress } from './utils.js';
import { initParamAddressSelect, sortAddressesBySymbol, formatAddressOption } from './address.js';
import { getContractMethods, hasContractABI } from './abi-fetcher.js';
import {
  PRESET_CATEGORIES,
  getAllPresetMethods,
  searchPresetMethods,
  getMethodsByCategory,
  parseMethodSignature
} from '../config/presets.js';

/**
 * Initialize the method input with fuzzy search.
 */
export function initMethodSelector() {
  const input = document.getElementById('method-input');
  const suggestions = document.getElementById('method-suggestions');
  
  if (!input || !suggestions) return;
  
  // Handle input for fuzzy search
  input.addEventListener('input', debounce((e) => {
    const query = e.target.value.trim();
    
    if (query.length >= 1) {
      showMethodSuggestions(query);
    } else {
      hideSuggestions();
    }
    
    // Try to parse the method
    parseCurrentMethod();
  }, 150));
  
  // Handle focus
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 1) {
      showMethodSuggestions(input.value.trim());
    }
  });
  
  // Handle blur - hide suggestions with delay to allow click
  input.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 200);
  });
  
  // Handle Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      hideSuggestions();
      parseCurrentMethod();
    }
  });
}

/**
 * Show method suggestions based on query.
 * Priority order: Contract ABI methods > Session methods > Preset methods
 * @param {string} query - The search query
 */
function showMethodSuggestions(query) {
  const suggestions = document.getElementById('method-suggestions');
  if (!suggestions) return;
  
  const lowerQuery = query.toLowerCase();
  
  // Get contract ABI methods for current target address (highest priority)
  let abiResults = [];
  if (state.currentTargetAddress && hasContractABI(state.currentTargetAddress)) {
    const contractMethods = getContractMethods(state.currentTargetAddress);
    abiResults = contractMethods.filter(m => 
      m.signature.toLowerCase().includes(lowerQuery) ||
      m.name.toLowerCase().includes(lowerQuery)
    );
  }
  
  // Search session methods
  const sessionResults = state.sessionMethods.filter(m => 
    m.signature.toLowerCase().includes(lowerQuery) ||
    m.name.toLowerCase().includes(lowerQuery)
  );
  
  // Search presets
  const presetResults = searchPresetMethods(query);
  
  // Combine results with priority: ABI > Session > Preset
  // Dedupe by signature
  const seen = new Set();
  const allResults = [];
  
  for (const method of [...abiResults, ...sessionResults, ...presetResults]) {
    if (!seen.has(method.signature)) {
      seen.add(method.signature);
      allResults.push(method);
    }
    if (allResults.length >= 15) break; // Show more results to accommodate ABI methods
  }
  
  if (allResults.length === 0) {
    hideSuggestions();
    return;
  }
  
  // Build suggestions HTML
  let html = '';
  for (const method of allResults) {
    const isFromABI = abiResults.includes(method);
    const isSession = sessionResults.includes(method);
    // For ABI methods, display signature with outputs for clarity
    const displaySig = method.outputs ? `${method.signature}${method.outputs}` : method.signature;
    
    html += `
      <div class="suggestion-item${isFromABI ? ' suggestion-abi' : ''}" data-signature="${escapeHtml(method.signature)}" data-outputs="${escapeHtml(method.outputs || '')}">
        <span class="suggestion-name">${escapeHtml(method.name)}</span>
        <span class="suggestion-signature">${escapeHtml(displaySig)}</span>
        ${method.categoryLabel ? `<span class="suggestion-category">${escapeHtml(method.categoryLabel)}</span>` : ''}
        ${isFromABI ? '<span class="suggestion-badge suggestion-badge-abi">ABI</span>' : ''}
        ${isSession && !isFromABI ? '<span class="suggestion-badge">Recent</span>' : ''}
      </div>
    `;
  }
  
  suggestions.innerHTML = html;
  suggestions.classList.remove('hidden');
  
  // Add click handlers
  suggestions.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const sig = item.dataset.signature;
      const outputs = item.dataset.outputs || '';
      // If method has outputs from ABI, include them in the input for parsing
      const fullSig = outputs ? `${sig}${outputs}` : sig;
      document.getElementById('method-input').value = fullSig;
      hideSuggestions();
      parseCurrentMethod();
    });
  });
}

/**
 * Hide method suggestions.
 */
function hideSuggestions() {
  const suggestions = document.getElementById('method-suggestions');
  if (suggestions) {
    suggestions.classList.add('hidden');
  }
}

/**
 * Initialize preset category and method selectors.
 */
export function initPresetSelectors() {
  const categorySelect = document.getElementById('preset-category');
  const methodSelect = document.getElementById('preset-method');
  
  if (!categorySelect || !methodSelect) return;
  
  // Populate categories
  categorySelect.innerHTML = '<option value="">-- Category --</option>';
  for (const [key, data] of Object.entries(PRESET_CATEGORIES)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = data.label;
    categorySelect.appendChild(option);
  }
  
  // Handle category change
  categorySelect.addEventListener('change', (e) => {
    const category = e.target.value;
    populateMethodSelect(category);
  });
  
  // Handle method select
  methodSelect.addEventListener('change', (e) => {
    const option = e.target.selectedOptions[0];
    if (option && option.value) {
      const sig = option.value;
      const outputs = option.dataset.outputs || '';
      // Include outputs in the input for parsing
      const fullSig = outputs ? `${sig}${outputs}` : sig;
      document.getElementById('method-input').value = fullSig;
      parseCurrentMethod();
    }
  });
}

/**
 * Populate method select based on category.
 * @param {string} category - The category name
 */
function populateMethodSelect(category) {
  const methodSelect = document.getElementById('preset-method');
  if (!methodSelect) return;
  
  methodSelect.innerHTML = '<option value="">-- Method --</option>';
  
  if (!category) return;
  
  // Check if this is a contract ABI category
  if (category.startsWith('contract-')) {
    const address = category.replace('contract-', '');
    const methods = getContractMethods(address);
    for (const method of methods) {
      const option = document.createElement('option');
      option.value = method.signature;
      option.dataset.outputs = method.outputs || '';
      // Display signature with outputs for clarity
      const displaySig = method.outputs ? `${method.signature}${method.outputs}` : method.signature;
      option.textContent = `${method.name} - ${displaySig}`;
      methodSelect.appendChild(option);
    }
    return;
  }
  
  const methods = getMethodsByCategory(category);
  for (const method of methods) {
    const option = document.createElement('option');
    option.value = method.signature;
    option.dataset.outputs = method.outputs || '';
    // Display signature with outputs for clarity  
    const displaySig = method.outputs ? `${method.signature}${method.outputs}` : method.signature;
    option.textContent = `${method.name} - ${displaySig}`;
    methodSelect.appendChild(option);
  }
}

/**
 * Add or update a contract ABI category in the preset selector.
 * Automatically switches to show the contract's methods.
 * @param {string} address - The contract address
 * @param {string} [label] - Optional label for the category
 */
export function addContractABICategory(address, label) {
  const categorySelect = document.getElementById('preset-category');
  if (!categorySelect) return;
  
  const normalizedAddress = address.toLowerCase();
  const categoryKey = `contract-${normalizedAddress}`;
  
  // Check if category already exists
  let option = categorySelect.querySelector(`option[value="${categoryKey}"]`);
  
  if (!option) {
    // Create new option
    option = document.createElement('option');
    option.value = categoryKey;
    
    // Build label: use symbol if available, otherwise truncated address
    const symbol = state.addressSymbols[normalizedAddress];
    const displayLabel = label || (symbol ? `📄 ${symbol} Contract` : `📄 ${address.slice(0, 8)}...${address.slice(-6)}`);
    option.textContent = displayLabel;
    
    // Insert at the top (after the default option)
    const firstOption = categorySelect.querySelector('option');
    if (firstOption && firstOption.nextSibling) {
      categorySelect.insertBefore(option, firstOption.nextSibling);
    } else {
      categorySelect.appendChild(option);
    }
  }
  
  // Select the category
  categorySelect.value = categoryKey;
  
  // Populate methods
  populateMethodSelect(categoryKey);
}

/**
 * Parse the current method input and update parameters.
 */
export function parseCurrentMethod() {
  const input = document.getElementById('method-input');
  if (!input) return;
  
  const value = input.value.trim();
  const parsed = parseMethodSignature(value);
  
  state.currentMethod = parsed;
  updateParameterInputs(parsed);
}

/**
 * Update parameter inputs based on parsed method.
 * @param {Object|null} method - The parsed method object
 */
function updateParameterInputs(method) {
  const container = document.getElementById('params-list');
  if (!container) return;
  
  if (!method || method.inputs.length === 0) {
    container.innerHTML = '<p class="no-params-hint">No parameters required</p>';
    return;
  }
  
  let html = '';
  for (let i = 0; i < method.inputs.length; i++) {
    const type = method.inputs[i];
    const isAddress = type === 'address' || type.startsWith('address[');
    
    html += `
      <div class="param-input-row" data-index="${i}" data-type="${escapeHtml(type)}">
        <span class="param-type">${escapeHtml(type)}</span>
        <div class="param-input-wrapper">
          ${isAddress ? createAddressParamInput(i) : createParamInput(i, type)}
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Initialize address selects if any
  container.querySelectorAll('.param-address-select').forEach(select => {
    initParamAddressSelect(select);
  });
}

/**
 * Create an address parameter input with dropdown.
 * @param {number} index - The parameter index
 * @returns {string} HTML string
 */
function createAddressParamInput(index) {
  return `
    <input 
      type="text" 
      class="input-field param-input param-address-input" 
      data-param-index="${index}"
      placeholder="0x..."
      autocomplete="off"
    >
    <select class="param-address-select" data-param-index="${index}">
      <option value="">-- Select --</option>
    </select>
  `;
}

/**
 * Create a regular parameter input.
 * For numeric types, includes a decimals selector for easy conversion.
 * @param {number} index - The parameter index
 * @param {string} type - The parameter type
 * @returns {string} HTML string
 */
function createParamInput(index, type) {
  let placeholder = getPlaceholderForType(type);
  
  // Check if this is a numeric type that could benefit from decimals conversion
  const isNumeric = type.startsWith('uint') || type.startsWith('int');
  
  if (isNumeric) {
    return `
      <input 
        type="text" 
        class="input-field param-input" 
        data-param-index="${index}"
        placeholder="${placeholder}"
        autocomplete="off"
      >
      <select class="param-decimals-select" data-param-index="${index}" title="Multiply by 10^n">
        <option value="0" selected>×1</option>
        <option value="6">×10⁶</option>
        <option value="8">×10⁸</option>
        <option value="18">×10¹⁸</option>
      </select>
    `;
  }
  
  return `
    <input 
      type="text" 
      class="input-field param-input" 
      data-param-index="${index}"
      placeholder="${placeholder}"
      autocomplete="off"
    >
  `;
}

/**
 * Get placeholder text for a parameter type.
 * @param {string} type - The Solidity type
 * @returns {string} Placeholder text
 */
function getPlaceholderForType(type) {
  if (type.startsWith('uint') || type.startsWith('int')) {
    return 'Enter number...';
  }
  if (type === 'bool') {
    return 'true or false';
  }
  if (type.startsWith('bytes32')) {
    return '0x... (32 bytes)';
  }
  if (type.startsWith('bytes')) {
    return '0x...';
  }
  if (type === 'string') {
    return 'Enter string...';
  }
  if (type.includes('[]')) {
    return 'Enter array as JSON, e.g., [1, 2, 3]';
  }
  return `Enter ${type}...`;
}

/**
 * Add a method to session methods.
 * @param {Object} method - The method object
 */
export function addToSessionMethods(method) {
  // Check if already in presets
  const allPresets = getAllPresetMethods();
  const isPreset = allPresets.some(p => p.signature === `${method.name}(${method.inputs.join(',')})`);
  
  if (isPreset) return;
  
  // Check if already in session
  const signature = `${method.name}(${method.inputs.join(',')})`;
  const exists = state.sessionMethods.some(m => m.signature === signature);
  
  if (!exists) {
    state.sessionMethods.unshift({
      name: method.name,
      signature,
      outputs: method.outputs.length > 0 ? `(${method.outputs.join(',')})` : '',
      description: 'Custom method (this session)',
      isSession: true
    });
    
    // Limit session methods
    if (state.sessionMethods.length > 20) {
      state.sessionMethods.pop();
    }
  }
}

/**
 * Clear the method form.
 */
export function clearMethodForm() {
  document.getElementById('method-input').value = '';
  document.getElementById('preset-category').value = '';
  document.getElementById('preset-method').value = '';
  
  const paramsContainer = document.getElementById('params-list');
  if (paramsContainer) {
    paramsContainer.innerHTML = '<p class="no-params-hint">Enter a method signature to see required parameters</p>';
  }
  
  state.currentMethod = null;
}
