/**
 * Copy Utilities Module
 * 
 * Provides functions for copy-to-clipboard functionality
 * and managing copy button states.
 */

import { log } from '../core/abi-utils.js';

/**
 * Copy text to clipboard.
 * @param {string} text - The text to copy
 * @returns {Promise<boolean>} True if copy succeeded
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    log('debug', 'copy', 'Copied to clipboard', { length: text.length });
    return true;
  } catch (e) {
    log('error', 'copy', 'Failed to copy', { error: e.message });
    
    // Fallback for older browsers
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (e2) {
      log('error', 'copy', 'Fallback copy failed', { error: e2.message });
      return false;
    }
  }
}

/**
 * Show temporary feedback on a copy button.
 * @param {HTMLElement} button - The button element
 * @param {string} [successText='copied'] - Text to show on success
 * @param {number} [duration=1000] - Duration in ms to show feedback
 */
function showCopyFeedback(button, successText = 'copied', duration = 1000) {
  const originalText = button.textContent;
  button.textContent = successText;
  button.classList.add('copy-success');
  
  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('copy-success');
  }, duration);
}

/**
 * Initialize copy handlers for all copy buttons in a container.
 * @param {HTMLElement} [container=document] - Container to search in
 */
function initCopyHandlers(container = document) {
  const buttons = container.querySelectorAll('.copy-btn');
  
  buttons.forEach(button => {
    // Skip if already initialized
    if (button.dataset.copyInit) return;
    button.dataset.copyInit = 'true';
    
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const value = button.dataset.value || button.dataset.addr;
      if (!value) {
        log('warn', 'copy', 'No value to copy');
        return;
      }
      
      const success = await copyToClipboard(value);
      if (success) {
        showCopyFeedback(button);
      }
    });
  });
  
  log('debug', 'copy', 'Initialized copy handlers', { count: buttons.length });
}

/**
 * Create a copy button element.
 * @param {string} value - The value to copy when clicked
 * @param {string} [id] - Optional ID for the button
 * @returns {HTMLButtonElement} The button element
 */
function createCopyButton(value, id = null) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-btn';
  button.textContent = 'copy';
  button.dataset.value = value;
  
  if (id) {
    button.id = id;
  }
  
  // Add click handler directly
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const success = await copyToClipboard(value);
    if (success) {
      showCopyFeedback(button);
    }
  });
  
  return button;
}

/**
 * Create HTML string for a copy button.
 * @param {string} value - The value to copy
 * @param {string} id - ID for the button
 * @returns {string} HTML string
 */
function createCopyButtonHtml(value, id) {
  return `<button type="button" class="copy-btn" id="${id}" data-value="${escapeHtml(value)}">copy</button>`;
}

/**
 * Escape HTML special characters.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Export for ES modules
export {
  copyToClipboard,
  showCopyFeedback,
  initCopyHandlers,
  createCopyButton,
  createCopyButtonHtml,
  escapeHtml
};
