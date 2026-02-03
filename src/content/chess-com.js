/**
 * Chess Study Tool - Chess.com Content Script
 * Listens for middle-click to trigger capture.
 */

(function () {
  'use strict';

  document.addEventListener('mousedown', (e) => {
    // Middle mouse button = button 1
    if (e.button !== 1) return;

    e.preventDefault();
    e.stopPropagation();

    chrome.runtime.sendMessage({ type: 'TRIGGER_CAPTURE' });
  });

  // Also prevent the default auto-scroll cursor from appearing
  document.addEventListener('mouseup', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  console.log('[Chess Study] Chess.com listener loaded (middle-click to capture)');
})();
