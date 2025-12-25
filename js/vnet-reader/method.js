/**
 * VNet Reader Method Module
 * 
 * Handles method selection, parsing, and preset management.
 */

import { state } from './state.js';
import { escapeHtml, debounce, isValidAddress } from './utils.js';
import { initParamAddressSelect, sortAddressesBySymbol, formatAddressOption } from './address.js';
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
 * @param {string} query - The search query
 */
function showMethodSuggestions(query) {
  const suggestions = document.getElementById('method-suggestions');
  if (!suggestions) return;
  
  // Search presets and session methods
  const presetResults = searchPresetMethods(query);
  const sessionResults = state.sessionMethods.filter(m => 
    m.signature.toLowerCase().includes(query.toLowerCase()) ||
    m.name.toLowerCase().includes(query.toLowerCase())
  );
  
  // Combine and dedupe
  const allResults = [...sessionResults, ...presetResults].slice(0, 10);
  
  if (allResults.length === 0) {
    hideSuggestions();
    return;
  }
  
  // Build suggestions HTML
  let html = '';
  for (const method of allResults) {
    const isSession = sessionResults.includes(method);
    html += `
      <div class="suggestion-item" data-signature="${escapeHtml(method.signature)}">
        <span class="suggestion-name">${escapeHtml(method.name)}</span>
        <span class="suggestion-signature">${escapeHtml(method.signature)}</span>
        ${method.categoryLabel ? `<span class="suggestion-category">${escapeHtml(method.categoryLabel)}</span>` : ''}
        ${isSession ? '<span class="suggestion-badge">Recent</span>' : ''}
      </div>
    `;
  }
  
  suggestions.innerHTML = html;
  suggestions.classList.remove('hidden');
  
  // Add click handlers
  suggestions.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const sig = item.dataset.signature;
      document.getElementById('method-input').value = sig;
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
    const sig = e.target.value;
    if (sig) {
      document.getElementById('method-input').value = sig;
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
  
  const methods = getMethodsByCategory(category);
  for (const method of methods) {
    const option = document.createElement('option');
    option.value = method.signature;
    option.textContent = `${method.name} - ${method.description}`;
    methodSelect.appendChild(option);
  }
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
