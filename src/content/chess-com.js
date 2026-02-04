/**
 * Chess Study Tool - Chess.com Content Script
 * Listens for middle-click to trigger capture.
 * Supports re-injection: replaces stale handlers on repeated injection
 * so the runtime connection stays fresh without requiring a page reload.
 */

(function () {
  'use strict';

  // Remove any stale handlers from a previous injection
  if (window.__chessStudyMouseDown) {
    document.removeEventListener('mousedown', window.__chessStudyMouseDown);
    document.removeEventListener('mouseup', window.__chessStudyMouseUp);
    console.log('[Chess Study] Replacing stale middle-click handlers');
  }

  window.__chessStudyMouseDown = (e) => {
    // Middle mouse button = button 1
    if (e.button !== 1) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      chrome.runtime.sendMessage({ type: 'TRIGGER_CAPTURE' });
    } catch (err) {
      console.warn('[Chess Study] Middle-click send failed (extension context invalidated):', err.message);
    }
  };

  window.__chessStudyMouseUp = (e) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  document.addEventListener('mousedown', window.__chessStudyMouseDown);
  document.addEventListener('mouseup', window.__chessStudyMouseUp);

  console.log('[Chess Study] Chess.com listener loaded (middle-click to capture)');
})();
