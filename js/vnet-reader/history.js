/**
 * VNet Reader History Module
 * 
 * Manages call history and session storage.
 */

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { parseCurrentMethod } from './method.js';

/**
 * Add a call to history.
 * @param {Object} call - The call details
 */
export function addToHistory(call) {
  state.callHistory.unshift(call);
  
  // Limit history size
  if (state.callHistory.length > 20) {
    state.callHistory.pop();
  }
  
  renderHistory();
}

/**
 * Render the call history.
 */
export function renderHistory() {
  const container = document.getElementById('call-history');
  if (!container) return;
  
  if (state.callHistory.length === 0) {
    container.innerHTML = '<p class="history-placeholder">No calls made yet</p>';
    return;
  }
  
  let html = '';
  for (const call of state.callHistory) {
    const time = new Date(call.timestamp).toLocaleTimeString();
    const resultPreview = typeof call.result === 'object'
      ? JSON.stringify(call.result).slice(0, 50) + '...'
      : String(call.result).slice(0, 50);
    
    html += `
      <div class="history-item" data-timestamp="${call.timestamp}">
        <div class="history-header">
          <span class="history-method">${escapeHtml(call.method)}</span>
          <span class="history-time">${time}</span>
        </div>
        <div class="history-target">${escapeHtml(call.target)}</div>
        <div class="history-result">${escapeHtml(resultPreview)}</div>
        <button class="btn btn-small btn-rerun" onclick="window.vnetRerunCall(${call.timestamp})">Rerun</button>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

/**
 * Rerun a call from history.
 * Uses dynamic import to avoid circular dependency.
 * @param {number} timestamp - The call timestamp
 */
export async function rerunCall(timestamp) {
  const call = state.callHistory.find(c => c.timestamp === timestamp);
  if (!call) return;
  
  // Populate form
  document.getElementById('target-address').value = call.target;
  document.getElementById('method-input').value = call.method;
  
  parseCurrentMethod();
  
  // Populate params after a short delay for DOM to update
  setTimeout(async () => {
    const inputs = document.querySelectorAll('.param-input');
    call.params.forEach((param, i) => {
      if (inputs[i]) {
        inputs[i].value = param;
      }
    });
    
    // Dynamic import to avoid circular dependency
    const { executeCall } = await import('./call.js');
    executeCall();
  }, 100);
}

/**
 * Clear call history.
 */
export function clearHistory() {
  state.callHistory = [];
  renderHistory();
}

// Expose rerunCall to window for onclick handlers
window.vnetRerunCall = rerunCall;
