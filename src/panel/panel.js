/**
 * Chess Study Tool - Panel Script (v3.10.4)
 *
 * Standalone learning tool that:
 * 1. Captures screenshots on user request
 * 2. Sends to Claude Vision for position recognition
 * 3. Gets Stockfish analysis
 * 4. Displays results with visual boards
 *
 * NO INTERACTION with any chess website - purely a study tool
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const captureBtn = document.getElementById('capture-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const fenDisplay = document.getElementById('fen-display');
const turnDisplay = document.getElementById('turn-display');
const fenInput = document.getElementById('fen-input');
const fenToggleTurnBtn = document.getElementById('fen-toggle-turn');
const fenRotate180Btn = document.getElementById('fen-rotate-180');
const fenMirrorFilesBtn = document.getElementById('fen-mirror-files');
const fenSwapColorsBtn = document.getElementById('fen-swap-colors');
const fenRerunBtn = document.getElementById('fen-rerun');
const movesList = document.getElementById('moves-list');
const chessBoard = document.getElementById('chess-board');

const movesSection = document.getElementById('moves-section');
const boardSection = document.getElementById('board-section');
const thumbnailImg = document.getElementById('thumbnail-img');

// Popover elements
const headerStatusDot = document.getElementById('header-status-dot');
const statusPopover = document.getElementById('status-popover');
const popoverThumbnail = document.getElementById('popover-thumbnail');
const popoverPosition = document.getElementById('popover-position');

const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const mainContent = document.getElementById('main-content');
const backBtn = document.getElementById('back-btn');
const saveBtn = document.getElementById('save-btn');

// Provider section elements
const anthropicSection = document.getElementById('anthropic-section');
const anthropicModel = document.getElementById('anthropic-model');
const anthropicKey = document.getElementById('anthropic-key');
const anthropicRadio = document.getElementById('anthropic-radio');

const openrouterSection = document.getElementById('openrouter-section');
const openrouterModel = document.getElementById('openrouter-model');
const openrouterKey = document.getElementById('openrouter-key');
const openrouterRadio = document.getElementById('openrouter-radio');

const bigmodelSection = document.getElementById('bigmodel-section');
const bigmodelModel = document.getElementById('bigmodel-model');
const bigmodelKey = document.getElementById('bigmodel-key');
const bigmodelRadio = document.getElementById('bigmodel-radio');

const closeBtn = document.getElementById('close-btn');

// Board controls
const sideSwitch = document.getElementById('side-switch');
const sideColorLabel = document.getElementById('side-color-label');
const boardRanks = document.getElementById('board-ranks');
const boardFiles = document.getElementById('board-files');

const anthropicIndicator = document.getElementById('anthropic-indicator');
const stockfishIndicator = document.getElementById('stockfish-indicator');
const errorIndicator = document.getElementById('error-indicator');
const errorCount = document.getElementById('error-count');
const errorLog = document.getElementById('error-log');
const errorLogContent = document.getElementById('error-log-content');
const checkApisBtn = document.getElementById('check-apis-btn');
const clearErrorsBtn = document.getElementById('clear-errors-btn');

// Debug log elements
const viewDebugLogsBtn = document.getElementById('view-debug-logs-btn');
const downloadDebugLogsBtn = document.getElementById('download-debug-logs-btn');
const clearDebugLogsBtn = document.getElementById('clear-debug-logs-btn');
const debugLogViewer = document.getElementById('debug-log-viewer');
const debugLogContent = document.getElementById('debug-log-content');

// Elo slider
const targetEloSlider = document.getElementById('target-elo');
const eloValueDisplay = document.getElementById('elo-value');

// Error tracking
const errors = [];

// Board state
let boardFlipped = false;  // false = white on bottom, true = black on bottom
let currentFen = null;
let currentMoves = null;

// Session suspicion tracking
let sessionCaptures = 0;
let sessionEngineMatches = 0;

// Session API cost tracking
let sessionTotalCost = 0;

// Header dots
const headerAnthropicDot = document.getElementById('header-anthropic-dot');
const headerStockfishDot = document.getElementById('header-stockfish-dot');
const headerErrorDot = document.getElementById('header-error-dot');
const headerIndicators = document.querySelector('.header-indicators');

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Load saved settings
  await loadSettings();

  // Re-inject content script to refresh stale runtime connections
  chrome.runtime.sendMessage({ type: 'REINJECT_CONTENT_SCRIPT' }).catch(() => {});

  // Setup event listeners
  captureBtn.addEventListener('click', handleCapture);
  settingsToggle.addEventListener('click', showSettings);
  backBtn.addEventListener('click', hideSettings);
  saveBtn.addEventListener('click', saveSettings);

  // Close button - close the window
  closeBtn.addEventListener('click', () => {
    window.close();
  });

  // Session tracker reset
  document.getElementById('tracker-reset').addEventListener('click', () => {
    sessionCaptures = 0;
    sessionEngineMatches = 0;
    updateSuspicionTracker();
  });

  // API check button
  checkApisBtn.addEventListener('click', checkAllAPIs);

  // Header status dot - toggle popover
  headerStatusDot.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover();
  });

  // Click outside popover to close
  document.addEventListener('click', (e) => {
    if (popoverOpen && !statusPopover.contains(e.target) && e.target !== headerStatusDot) {
      closePopover();
    }
  });

  statusPopover.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Header indicators click - go to settings (removed in v3.3, guarded)
  if (headerIndicators) headerIndicators.addEventListener('click', showSettings);

  // Error indicator click - toggle error log
  errorIndicator.addEventListener('click', toggleErrorLog);

  // Clear errors button
  clearErrorsBtn.addEventListener('click', clearErrors);

  // Toggle API key visibility - all provider key buttons
  document.querySelectorAll('.toggle-key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.classList.toggle('showing', isPassword);
      }
    });
  });

  // Radio button provider selection
  anthropicRadio.addEventListener('change', () => handleProviderChange('anthropic'));
  openrouterRadio.addEventListener('change', () => handleProviderChange('openrouter'));
  bigmodelRadio.addEventListener('change', () => handleProviderChange('bigmodel'));

  // Side toggle switch - "I am White" / "I am Black"
  sideSwitch.addEventListener('change', async () => {
    boardFlipped = sideSwitch.checked;
    if (sideColorLabel) sideColorLabel.textContent = boardFlipped ? 'Black' : 'White';
    updateBoardOrientation();
    if (currentFen && currentMoves) {
      renderChessBoard(currentFen, currentMoves[0]);
    }
    try {
      await chrome.storage.sync.set({ boardFlipped });
    } catch (e) {
      console.warn('[Chess Study] Failed to save board flip state:', e);
    }
  });

  // Debug log buttons
  viewDebugLogsBtn.addEventListener('click', viewDebugLogs);
  downloadDebugLogsBtn.addEventListener('click', downloadDebugLogs);
  clearDebugLogsBtn.addEventListener('click', clearDebugLogs);

  // FEN tools (manual correction + rerun) - guarded, elements may be removed from UI
  if (fenToggleTurnBtn) fenToggleTurnBtn.addEventListener('click', () => applyFenTransform('toggleTurn'));
  if (fenRotate180Btn) fenRotate180Btn.addEventListener('click', () => applyFenTransform('rotate180'));
  if (fenMirrorFilesBtn) fenMirrorFilesBtn.addEventListener('click', () => applyFenTransform('mirrorFiles'));
  if (fenSwapColorsBtn) fenSwapColorsBtn.addEventListener('click', () => applyFenTransform('swapColors'));
  if (fenRerunBtn) fenRerunBtn.addEventListener('click', rerunFromFen);

  // Elo slider live update
  targetEloSlider.addEventListener('input', () => {
    eloValueDisplay.textContent = targetEloSlider.value;
  });

  // Listen for keyboard shortcut (Alt+=) from service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TRIGGER_CAPTURE') {
      handleCapture();
    }
  });
});

// Update board labels based on orientation
function updateBoardOrientation() {
  if (boardFlipped) {
    boardRanks.innerHTML = '<span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>';
    boardFiles.innerHTML = '<span>h</span><span>g</span><span>f</span><span>e</span><span>d</span><span>c</span><span>b</span><span>a</span>';
  } else {
    boardRanks.innerHTML = '<span>8</span><span>7</span><span>6</span><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span>';
    boardFiles.innerHTML = '<span>a</span><span>b</span><span>c</span><span>d</span><span>e</span><span>f</span><span>g</span><span>h</span>';
  }
}

function handleProviderChange(provider) {
  const keyMap = {
    anthropic: anthropicKey.value.trim(),
    openrouter: openrouterKey.value.trim(),
    bigmodel: bigmodelKey.value.trim()
  };

  if (!keyMap[provider]) {
    // Revert to previously selected provider
    const settings = chrome.storage.sync.get({ defaultProvider: 'anthropic' });
    settings.then(s => {
      const radio = document.querySelector(`input[name="active-provider"][value="${s.defaultProvider}"]`);
      if (radio) radio.checked = true;
    });
    updateStatus('Please add an API key for that provider first.', 'error');
    return;
  }

  updateProviderSectionHighlight(provider);
}

function updateProviderSectionHighlight(activeProvider) {
  document.querySelectorAll('.provider-section').forEach(section => {
    section.classList.remove('is-active');
  });
  const activeSection = document.getElementById(`${activeProvider}-section`);
  if (activeSection) activeSection.classList.add('is-active');
}

// ============================================================================
// SETTINGS
// ============================================================================

async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    anthropicApiKey: '',
    anthropicModel: 'claude-opus-4-5-20251101',
    openrouterApiKey: '',
    openrouterModel: 'google/gemini-3-flash-preview',
    bigmodelApiKey: '',
    bigmodelModel: 'glm-4v',
    defaultProvider: 'anthropic',
    boardFlipped: false,
    targetElo: 1500,
    // Migration support
    claudeApiKey: '',
    apiProvider: 'anthropic'
  });

  // Migrate from old settings format if needed
  if (settings.claudeApiKey && !settings.anthropicApiKey && !settings.openrouterApiKey) {
    if (settings.apiProvider === 'anthropic') {
      settings.anthropicApiKey = settings.claudeApiKey;
    } else if (settings.apiProvider === 'openrouter') {
      settings.openrouterApiKey = settings.claudeApiKey;
    }
  }

  // Load provider settings
  anthropicKey.value = settings.anthropicApiKey;
  anthropicModel.value = settings.anthropicModel;
  openrouterKey.value = settings.openrouterApiKey;
  openrouterModel.value = settings.openrouterModel;
  bigmodelKey.value = settings.bigmodelApiKey;
  bigmodelModel.value = settings.bigmodelModel;

  // Set radio button for active provider
  const radio = document.querySelector(`input[name="active-provider"][value="${settings.defaultProvider}"]`);
  if (radio) radio.checked = true;
  updateProviderSectionHighlight(settings.defaultProvider);

  // Board flip state (display only)
  boardFlipped = !!settings.boardFlipped;
  sideSwitch.checked = boardFlipped;
  if (sideColorLabel) sideColorLabel.textContent = boardFlipped ? 'Black' : 'White';
  updateBoardOrientation();

  // Elo slider
  targetEloSlider.value = settings.targetElo;
  eloValueDisplay.textContent = settings.targetElo;
}

async function saveSettings() {
  const anthropicApiKey = anthropicKey.value.trim();
  const openrouterApiKey = openrouterKey.value.trim();
  const bigmodelApiKey = bigmodelKey.value.trim();

  // Validate API key formats
  if (anthropicApiKey && !anthropicApiKey.startsWith('sk-ant-')) {
    alert('Invalid Anthropic API key format. Should start with sk-ant-');
    return;
  }
  if (openrouterApiKey && !openrouterApiKey.startsWith('sk-or-')) {
    alert('Invalid OpenRouter API key format. Should start with sk-or-');
    return;
  }

  // Get selected provider from radio buttons
  const selectedRadio = document.querySelector('input[name="active-provider"]:checked');
  let defaultProvider = selectedRadio?.value || 'anthropic';

  // Validate that selected provider has an API key
  const keyMap = { anthropic: anthropicApiKey, openrouter: openrouterApiKey, bigmodel: bigmodelApiKey };
  if (!keyMap[defaultProvider]) {
    // Auto-select first provider with a key
    for (const provider of ['anthropic', 'openrouter', 'bigmodel']) {
      if (keyMap[provider]) {
        defaultProvider = provider;
        const radio = document.querySelector(`input[name="active-provider"][value="${provider}"]`);
        if (radio) radio.checked = true;
        break;
      }
    }
  }

  await chrome.storage.sync.set({
    anthropicApiKey,
    anthropicModel: anthropicModel.value,
    openrouterApiKey,
    openrouterModel: openrouterModel.value,
    bigmodelApiKey,
    bigmodelModel: bigmodelModel.value,
    defaultProvider,
    boardFlipped,
    targetElo: parseInt(targetEloSlider.value)
  });

  updateProviderSectionHighlight(defaultProvider);
  hideSettings();
  updateStatus('Settings saved!', 'success');
}

// ============================================================================
// STATUS POPOVER
// ============================================================================

let popoverOpen = false;

function togglePopover() {
  popoverOpen = !popoverOpen;
  statusPopover.style.display = popoverOpen ? 'flex' : 'none';
}

function closePopover() {
  popoverOpen = false;
  statusPopover.style.display = 'none';
}

function showSettings() {
  closePopover();
  mainContent.classList.add('hidden');
  settingsPanel.classList.add('active');
}

function hideSettings() {
  mainContent.classList.remove('hidden');
  settingsPanel.classList.remove('active');
}


// ============================================================================
// API STATUS INDICATORS
// ============================================================================

async function checkAllAPIs() {
  checkApisBtn.disabled = true;
  checkApisBtn.textContent = 'Checking...';

  // Set both to checking state
  anthropicIndicator.className = 'status-indicator checking';
  stockfishIndicator.className = 'status-indicator checking';
  if (headerAnthropicDot) headerAnthropicDot.className = 'header-dot checking';
  if (headerStockfishDot) headerStockfishDot.className = 'header-dot checking';

  // Check both APIs in parallel
  const [anthropicResult, stockfishResult] = await Promise.all([
    checkAnthropicAPI(),
    checkStockfishAPI()
  ]);

  // Update indicators (settings panel)
  anthropicIndicator.className = `status-indicator ${anthropicResult.success ? 'connected' : 'disconnected'}`;
  stockfishIndicator.className = `status-indicator ${stockfishResult.success ? 'connected' : 'disconnected'}`;

  // Update header dots (removed in v3.3, guarded)
  if (headerAnthropicDot) headerAnthropicDot.className = `header-dot ${anthropicResult.success ? 'connected' : 'disconnected'}`;
  if (headerStockfishDot) headerStockfishDot.className = `header-dot ${stockfishResult.success ? 'connected' : 'disconnected'}`;

  // Log errors
  if (!anthropicResult.success) {
    addError('Claude API', anthropicResult.error);
  }
  if (!stockfishResult.success) {
    addError('Stockfish API', stockfishResult.error);
  }

  checkApisBtn.disabled = false;
  checkApisBtn.textContent = 'Check Connections';
}

async function checkAnthropicAPI() {
  // Check the default provider's API key
  const settings = await chrome.storage.sync.get(['defaultProvider', 'anthropicApiKey', 'openrouterApiKey', 'bigmodelApiKey']);
  const provider = settings.defaultProvider || 'anthropic';
  const keyMap = {
    anthropic: settings.anthropicApiKey,
    openrouter: settings.openrouterApiKey,
    bigmodel: settings.bigmodelApiKey
  };
  const apiKey = keyMap[provider];

  if (!apiKey) {
    return { success: false, error: `No API key configured for ${provider}` };
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_ANTHROPIC_API',
      apiKey,
      provider
    });
    return response;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function checkStockfishAPI() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_STOCKFISH_API'
    });
    return response;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// ERROR LOG
// ============================================================================

function addError(source, message) {
  const time = new Date().toLocaleTimeString();
  errors.push({ time, source, message });
  updateErrorIndicator();
  renderErrorLog();
}

function updateErrorIndicator() {
  if (errors.length > 0) {
    errorIndicator.className = 'status-indicator has-errors';
    if (headerErrorDot) headerErrorDot.className = 'header-dot has-errors';
    errorCount.style.display = 'inline';
    errorCount.textContent = errors.length;
  } else {
    errorIndicator.className = 'status-indicator';
    if (headerErrorDot) headerErrorDot.className = 'header-dot';
    errorCount.style.display = 'none';
  }
}

function toggleErrorLog() {
  if (errors.length === 0) return;
  errorLog.style.display = errorLog.style.display === 'none' ? 'block' : 'none';
}

function renderErrorLog() {
  errorLogContent.innerHTML = errors.map(err => `
    <div class="error-entry">
      <span class="error-time">${err.time}</span>
      <strong>${err.source}:</strong> ${err.message}
    </div>
  `).join('');
}

function clearErrors() {
  errors.length = 0;
  updateErrorIndicator();
  errorLog.style.display = 'none';
  errorLogContent.innerHTML = '';
}

// Global error handler for logging errors from capture/analysis
function logError(source, message) {
  addError(source, message);
}

// ============================================================================
// CAPTURE & ANALYZE
// ============================================================================

async function handleCapture() {
  const settings = await chrome.storage.sync.get(['anthropicApiKey', 'openrouterApiKey', 'bigmodelApiKey', 'defaultProvider']);
  const hasAnyKey = settings.anthropicApiKey || settings.openrouterApiKey || settings.bigmodelApiKey;

  if (!hasAnyKey) {
    updateStatus('Please configure at least one API key in settings', 'error');
    showSettings();
    return;
  }

  const keyMap = {
    anthropic: settings.anthropicApiKey,
    openrouter: settings.openrouterApiKey,
    bigmodel: settings.bigmodelApiKey
  };
  if (!keyMap[settings.defaultProvider]) {
    updateStatus('Default provider has no API key. Please configure it in settings.', 'error');
    showSettings();
    return;
  }

  captureBtn.classList.add('loading');
  captureBtn.disabled = true;
  closePopover();
  updateStatus('Capturing screen...', 'loading');
  clearResults();

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to capture screenshot');
    }

    popoverThumbnail.style.display = 'block';
    thumbnailImg.src = response.imageData;

    updateStatus('Analyzing position...', 'loading');

    // Show sections with loading state
    popoverPosition.style.display = 'block';
    fenDisplay.textContent = 'Analyzing...';
    if (turnDisplay) turnDisplay.textContent = '...';

    movesSection.style.display = 'block';
    movesList.innerHTML = '<div class="placeholder">Calculating best move...</div>';

    boardSection.style.display = 'block';
    chessBoard.innerHTML = '<div class="placeholder" style="grid-column: span 8; grid-row: span 8;">Loading board...</div>';

    // Send full screenshot for analysis — Vision handles the full page,
    // pieces-array fallback recovers if FEN arithmetic fails.
    // Pass the user's color so the service worker can ensure
    // moves are calculated for the correct side.
    const userColor = boardFlipped ? 'b' : 'w';
    const analysisResponse = await chrome.runtime.sendMessage({
      type: 'ANALYZE_SCREENSHOT',
      imageData: response.imageData,
      userColor
    });

    console.log('Analysis response:', analysisResponse);

    if (analysisResponse.error) {
      if (analysisResponse.fen) {
        popoverPosition.style.display = 'block';
        fenDisplay.textContent = analysisResponse.fen;
        if (turnDisplay) {
          turnDisplay.textContent = analysisResponse.turn === 'w' ? 'White' : 'Black';
          turnDisplay.className = analysisResponse.turn === 'w' ? 'turn-white' : 'turn-black';
        }
        if (fenInput) {
          fenInput.value = analysisResponse.fenNormalized || `${analysisResponse.fen} ${analysisResponse.turn || 'w'} - - 0 1`;
        }
        renderChessBoard(analysisResponse.fen, null);
      }
      throw new Error(analysisResponse.error);
    }

    analysisResponse._isNewCapture = true;
    displayResults(analysisResponse);

  } catch (error) {
    console.error('Capture error:', error);
    updateStatus('Error: ' + error.message, 'error');
    addError('Analysis', error.message);
    fenDisplay.textContent = 'Error';
    movesList.innerHTML = `<div class="placeholder" style="color: #e74c3c;">${error.message}</div>`;
  } finally {
    captureBtn.classList.remove('loading');
    captureBtn.disabled = false;
  }
}

// Clear all previous results
function clearResults() {
  fenDisplay.textContent = '-';
  if (turnDisplay) { turnDisplay.textContent = '-'; turnDisplay.className = ''; }
  if (fenInput) fenInput.value = '';
  movesList.innerHTML = '';
  chessBoard.innerHTML = '';
  popoverThumbnail.style.display = 'none';
  popoverPosition.style.display = 'none';
}

// ============================================================================
// FEN TOOLS (Manual correction + rerun)
// ============================================================================

function getFenInputText() {
  return (fenInput?.value || '').trim();
}

function setFenInputText(nextFen) {
  if (!fenInput) return;
  fenInput.value = nextFen;
}

function splitFenString(fen) {
  const parts = fen.trim().split(/\s+/).filter(Boolean);
  return {
    board: parts[0] || '',
    turn: parts[1] === 'b' ? 'b' : 'w',
    castling: parts[2] ?? '-',
    ep: parts[3] ?? '-',
    halfmove: parts[4] ?? '0',
    fullmove: parts[5] ?? '1'
  };
}

function buildFenString(p) {
  return `${p.board} ${p.turn} ${p.castling} ${p.ep} ${p.halfmove} ${p.fullmove}`.trim();
}

function fenBoardToMatrix(boardPart) {
  const ranks = boardPart.split('/');
  if (ranks.length !== 8) {
    throw new Error(`Board must have 8 ranks, got ${ranks.length}`);
  }

  const matrix = [];
  for (const rank of ranks) {
    const row = [];
    for (const ch of rank) {
      if ('12345678'.includes(ch)) {
        for (let i = 0; i < parseInt(ch, 10); i++) row.push('');
      } else if ('pnbrqkPNBRQK'.includes(ch)) {
        row.push(ch);
      } else {
        throw new Error(`Invalid board character '${ch}'`);
      }
    }
    if (row.length !== 8) {
      throw new Error(`Rank expanded to ${row.length} squares (expected 8)`);
    }
    matrix.push(row);
  }

  return matrix;
}

function matrixToFenBoard(matrix) {
  return matrix.map(row => {
    let out = '';
    let empties = 0;
    for (const cell of row) {
      if (!cell) {
        empties++;
      } else {
        if (empties) {
          out += String(empties);
          empties = 0;
        }
        out += cell;
      }
    }
    if (empties) out += String(empties);
    return out;
  }).join('/');
}

function swapPieceCase(ch) {
  if (!/[a-zA-Z]/.test(ch)) return ch;
  return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
}

function applyFenTransform(kind) {
  const fen = getFenInputText();
  if (!fen) {
    updateStatus('No FEN to edit yet. Capture a position first.', 'error');
    return;
  }

  try {
    const parts = splitFenString(fen);
    const matrix = fenBoardToMatrix(parts.board);

    let nextBoard = parts.board;
    let nextTurn = parts.turn;
    let nextCastling = parts.castling;

    if (kind === 'toggleTurn') {
      nextTurn = parts.turn === 'w' ? 'b' : 'w';
    } else if (kind === 'rotate180') {
      const rotated = matrix.slice().reverse().map(row => row.slice().reverse());
      nextBoard = matrixToFenBoard(rotated);
    } else if (kind === 'mirrorFiles') {
      const mirrored = matrix.map(row => row.slice().reverse());
      nextBoard = matrixToFenBoard(mirrored);
    } else if (kind === 'swapColors') {
      const swapped = matrix.map(row => row.map(cell => (cell ? swapPieceCase(cell) : '')));
      nextBoard = matrixToFenBoard(swapped);
      nextTurn = parts.turn === 'w' ? 'b' : 'w';
      nextCastling = (parts.castling || '-').split('').map(swapPieceCase).join('') || '-';
    } else {
      throw new Error(`Unknown transform: ${kind}`);
    }

    const nextFen = buildFenString({
      ...parts,
      board: nextBoard,
      turn: nextTurn,
      castling: nextCastling
    });

    setFenInputText(nextFen);

    // Update visible position immediately (moves become stale until rerun)
    fenDisplay.textContent = nextBoard;
    if (turnDisplay) {
      turnDisplay.textContent = nextTurn === 'w' ? 'White' : 'Black';
      turnDisplay.className = nextTurn === 'w' ? 'turn-white' : 'turn-black';
    }
    currentFen = nextBoard;
    currentMoves = null;
    movesList.innerHTML = '<div class="placeholder">Edit FEN, then click "Re-run Best Moves".</div>';
    renderChessBoard(nextFen, null);

  } catch (e) {
    updateStatus('Invalid FEN: ' + e.message, 'error');
  }
}

async function rerunFromFen() {
  const fen = getFenInputText();
  if (!fen) {
    updateStatus('Please enter a FEN to analyze.', 'error');
    return;
  }

  popoverPosition.style.display = 'block';
  movesSection.style.display = 'block';
  boardSection.style.display = 'block';

  updateStatus('Re-analyzing from FEN...', 'loading');
  movesList.innerHTML = '<div class="placeholder">Calculating best move...</div>';

  try {
    const boardPart = fen.split(/\s+/)[0];
    renderChessBoard(boardPart, null);
  } catch {
    // ignore
  }

  try {
    const analysisResponse = await chrome.runtime.sendMessage({
      type: 'ANALYZE_FEN',
      fen
    });

    if (analysisResponse.error) {
      throw new Error(analysisResponse.error);
    }

    displayResults(analysisResponse);
  } catch (error) {
    console.error('FEN rerun error:', error);
    updateStatus('Error: ' + error.message, 'error');
    addError('FEN Analysis', error.message);
    movesList.innerHTML = `<div class="placeholder" style="color: #e74c3c;">${error.message}</div>`;
  }
}

// ============================================================================
// DISPLAY RESULTS
// ============================================================================

function displayResults(data) {
  console.log('[Panel] Displaying results:', data);

  popoverPosition.style.display = 'block';
  movesSection.style.display = 'block';
  boardSection.style.display = 'block';

  const sourceLabels = {
    'dom-chesscom': 'DOM (chess.com)',
    'dom-react-chessboard': 'DOM (react-chessboard)',
    'dom-img-pieces': 'DOM (image-based)',
    'dom-generic': 'DOM (detected)',
    'dom': 'DOM read'
  };
  const sourceLabel = sourceLabels[data.source] || 'Vision AI';
  updateStatus(`Analysis complete! (${sourceLabel})`, 'success');

  // Display FEN and turn
  if (data.fen) {
    fenDisplay.textContent = data.fen;
    if (turnDisplay) {
      turnDisplay.textContent = data.turn === 'w' ? 'White' : 'Black';
      turnDisplay.className = data.turn === 'w' ? 'turn-white' : 'turn-black';
    }
    currentFen = data.fen;
    if (fenInput) {
      fenInput.value = data.fenNormalized || `${data.fen} ${data.turn || 'w'} - - 0 1`;
    }
  } else {
    fenDisplay.textContent = 'Could not detect position';
    if (turnDisplay) turnDisplay.textContent = '-';
    currentFen = null;
    if (fenInput) fenInput.value = '';
  }

  // Display selected move (Elo-based) and render board
  if (data.moves && data.moves.length > 0) {
    currentMoves = data.moves;
    const moveToShow = data.selectedMove || data.moves[0];
    displayMoves(data.moves, data.fen, moveToShow, data.engineBest);
    renderChessBoard(data.fen, moveToShow);

    // Track session suspicion (only for fresh captures, not reruns/flips)
    if (data._isNewCapture && data.engineBest) {
      const movesMatch = data.engineBest.move === moveToShow.move;
      sessionCaptures++;
      if (movesMatch) sessionEngineMatches++;
      updateSuspicionTracker();
    }
  } else {
    currentMoves = null;
    // No moves = game over. Determine win/loss from whose turn it is.
    const userColor = boardFlipped ? 'b' : 'w';
    const sideToMove = data.turn || 'w';
    if (data.fen && sideToMove !== userColor) {
      movesList.innerHTML = '<div class="game-over victory">Victory!</div>';
    } else if (data.fen && sideToMove === userColor) {
      movesList.innerHTML = '<div class="game-over defeat">You Fucking Lost!</div>';
    } else {
      movesList.innerHTML = '<div class="placeholder">No moves found</div>';
    }
    renderChessBoard(data.fen, null);
  }

  // Update API cost display
  const moveCost = data.openrouterCost || 0;
  sessionTotalCost += moveCost;
  const costDisplay = document.getElementById('cost-display');
  const costMove = document.getElementById('cost-move');
  const costSession = document.getElementById('cost-session');
  if (costDisplay && costMove && costSession) {
    costMove.textContent = `$${moveCost.toFixed(4)}`;
    costSession.textContent = `$${sessionTotalCost.toFixed(4)}`;
    costDisplay.style.display = 'block';
  }
}

// Unicode pieces
const PIECE_ICONS = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

// Get piece at square from FEN
function getPieceAtSquare(fen, square) {
  if (!fen || !square) return null;

  const file = square.charCodeAt(0) - 97; // a=0, h=7
  const rank = 8 - parseInt(square[1]);   // 8=0, 1=7

  const boardPart = fen.split(' ')[0];
  const ranks = boardPart.split('/');

  if (rank < 0 || rank > 7) return null;

  const rankStr = ranks[rank];
  let col = 0;

  for (const char of rankStr) {
    if ('12345678'.includes(char)) {
      col += parseInt(char);
    } else {
      if (col === file) {
        return char;
      }
      col++;
    }
    if (col > file) break;
  }

  return null;
}

function displayMoves(moves, fen, selectedMove, engineBest) {
  const PIECE_NAMES = {
    'K': 'King', 'Q': 'Queen', 'R': 'Rook', 'B': 'Bishop', 'N': 'Knight', 'P': 'Pawn',
    'k': 'King', 'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight', 'p': 'Pawn'
  };

  if (!moves || moves.length === 0) {
    movesList.innerHTML = '<div class="placeholder">No moves found</div>';
    return;
  }

  const move = selectedMove || moves[0];
  const fromSquare = move.from || (move.move ? move.move.substring(0, 2) : '');
  const toSquare = move.to || (move.move ? move.move.substring(2, 4) : '');

  const piece = getPieceAtSquare(fen, fromSquare);
  const pieceIcon = piece ? PIECE_ICONS[piece] : '';
  const pieceName = piece ? PIECE_NAMES[piece] : '';
  const isWhitePiece = piece && piece === piece.toUpperCase();

  // Always-visible engine note with risk signal
  let engineNoteHtml = '';
  const movesMatch = engineBest && engineBest.move === move.move;

  if (engineBest) {
    const engineFrom = engineBest.from || engineBest.move.substring(0, 2);
    const engineTo = engineBest.to || engineBest.move.substring(2, 4);

    if (movesMatch) {
      engineNoteHtml = `<div class="engine-note engine-match">
        <span class="risk-icon">&#9888;</span>
        <span>Engine best \u2014 looks suspicious</span>
      </div>`;
    } else {
      engineNoteHtml = `<div class="engine-note engine-differ">
        <span class="safe-icon">&#10003;</span>
        <span>Engine prefers ${engineFrom}\u2192${engineTo}</span>
      </div>`;
    }

  }

  // Build top engine lines (show when 2+ moves available)
  let engineLinesHtml = '';
  if (moves.length >= 2) {
    const topMoves = moves.slice(0, 5);
    const chips = topMoves.map(m => {
      const mFrom = m.from || (m.move ? m.move.substring(0, 2) : '');
      const mTo = m.to || (m.move ? m.move.substring(2, 4) : '');
      const mPiece = getPieceAtSquare(fen, mFrom);
      const mIcon = mPiece ? PIECE_ICONS[mPiece] : '';
      let evalText = '';
      if (m.evaluation !== undefined && m.evaluation !== null) {
        if (typeof m.evaluation === 'string' && m.evaluation.startsWith('M')) {
          evalText = m.evaluation;
        } else {
          const ev = parseFloat(m.evaluation);
          evalText = (ev >= 0 ? '+' : '') + ev.toFixed(1);
        }
      }
      return `<div class="engine-line-chip">
        <div class="chip-move">
          <span class="chip-piece">${mIcon}</span>
          <span>${mFrom}</span>
          <span class="chip-arrow">\u2192</span>
          <span>${mTo}</span>
        </div>
        ${evalText ? `<span class="chip-eval">${evalText}</span>` : ''}
      </div>`;
    }).join('');

    engineLinesHtml = `<div class="engine-lines">
      <div class="engine-lines-title">Top engine lines</div>
      <div class="engine-lines-row">${chips}</div>
    </div>`;
  }

  movesList.innerHTML = `
    <div class="best-move-container">
      <div class="best-move-content">
        <span class="best-move-piece ${isWhitePiece ? 'white-piece' : 'black-piece'}">${pieceIcon}</span>
        <div class="best-move-notation">
          <span class="best-move-from">${fromSquare}</span>
          <span class="best-move-arrow">\u2192</span>
          <span class="best-move-to">${toSquare}</span>
        </div>
      </div>
      ${pieceName ? `<span class="best-move-name">${pieceName}</span>` : ''}
    </div>
    ${engineNoteHtml}
    ${engineLinesHtml}
  `;
}

// ============================================================================
// SESSION SUSPICION TRACKER
// ============================================================================

function getSuspicionThreshold(elo) {
  // Linear ramp: 800 Elo -> 40% accuracy expected, 2400 -> 90%
  const clamped = Math.max(800, Math.min(2400, elo));
  return 40 + (clamped - 800) * (50 / 1600);
}

function updateSuspicionTracker() {
  const tracker = document.getElementById('session-tracker');
  const accuracyEl = document.getElementById('tracker-accuracy');
  const detailEl = document.getElementById('tracker-detail');
  const barEl = document.getElementById('tracker-bar');
  const thresholdEl = document.getElementById('tracker-threshold');

  if (sessionCaptures === 0) {
    tracker.style.display = 'none';
    return;
  }

  tracker.style.display = 'flex';

  const accuracy = Math.round((sessionEngineMatches / sessionCaptures) * 100);
  const currentElo = parseInt(targetEloSlider.value) || 1500;
  const threshold = getSuspicionThreshold(currentElo);

  accuracyEl.textContent = `${accuracy}%`;
  detailEl.textContent = `${sessionEngineMatches}/${sessionCaptures}`;

  const overThreshold = accuracy > threshold;
  const wayOver = accuracy > threshold + 15;

  accuracyEl.className = 'tracker-accuracy' +
    (wayOver ? ' danger' : overThreshold ? ' warning' : '');
  barEl.className = 'tracker-bar' +
    (wayOver ? ' danger' : overThreshold ? ' warning' : '');

  barEl.style.width = `${Math.min(accuracy, 100)}%`;
  thresholdEl.style.left = `${threshold}%`;
}

// Render a mini board with arrow showing the move
function renderMiniBoard(container, fen, move) {
  if (!fen) return;

  const MINI_PIECES = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  };

  // Parse move to get from/to squares
  let fromSquare = null;
  let toSquare = null;

  const moveStr = move.move || '';
  if (moveStr.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(moveStr)) {
    fromSquare = moveStr.substring(0, 2);
    toSquare = moveStr.substring(2, 4);
  }

  // Parse FEN
  const boardPart = fen.split(' ')[0];
  const ranks = boardPart.split('/');

  // Build mini board HTML
  let boardHtml = '<div class="mini-board">';

  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    const rank = ranks[rankIndex];
    const rankNum = 8 - rankIndex;
    let fileIndex = 0;

    for (const char of rank) {
      if ('12345678'.includes(char)) {
        const emptyCount = parseInt(char);
        for (let i = 0; i < emptyCount; i++) {
          const file = String.fromCharCode(97 + fileIndex);
          const square = file + rankNum;
          const isLight = (rankIndex + fileIndex) % 2 === 0;
          const highlight = getMiniBoardHighlight(square, fromSquare, toSquare);

          boardHtml += `<div class="mini-square ${isLight ? 'light' : 'dark'} ${highlight}"></div>`;
          fileIndex++;
        }
      } else {
        const file = String.fromCharCode(97 + fileIndex);
        const square = file + rankNum;
        const isLight = (rankIndex + fileIndex) % 2 === 0;
        const isWhite = char === char.toUpperCase();
        const pieceChar = MINI_PIECES[char] || char;
        const highlight = getMiniBoardHighlight(square, fromSquare, toSquare);

        boardHtml += `<div class="mini-square ${isLight ? 'light' : 'dark'} ${highlight}">
          <span class="mini-piece ${isWhite ? 'white' : 'black'}">${pieceChar}</span>
        </div>`;
        fileIndex++;
      }
    }
  }

  boardHtml += '</div>';

  // Add SVG arrow overlay if we have from/to squares
  if (fromSquare && toSquare) {
    const boardSize = 160;
    const from = squareToCoords(fromSquare, boardSize);
    const to = squareToCoords(toSquare, boardSize);

    // Shorten arrow slightly so it doesn't overlap with arrowhead
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const shortenBy = 8;
    const toX = to.x - (dx / length) * shortenBy;
    const toY = to.y - (dy / length) * shortenBy;

    boardHtml += `
      <svg class="move-arrow-svg" viewBox="0 0 ${boardSize} ${boardSize}">
        <defs>
          <marker id="arrowhead-${fromSquare}${toSquare}" markerWidth="10" markerHeight="7"
            refX="9" refY="3.5" orient="auto" fill="rgba(0, 150, 0, 0.9)">
            <polygon points="0 0, 10 3.5, 0 7" />
          </marker>
        </defs>
        <line class="move-arrow"
          x1="${from.x}" y1="${from.y}"
          x2="${toX}" y2="${toY}"
          marker-end="url(#arrowhead-${fromSquare}${toSquare})" />
      </svg>
    `;
  }

  container.innerHTML = boardHtml;
}

// Helper to get square coordinates for arrow drawing
function squareToCoords(square, boardSize) {
  const file = square.charCodeAt(0) - 97; // a=0, h=7
  const rank = 8 - parseInt(square[1]);   // 1=7, 8=0
  const cellSize = boardSize / 8;
  return {
    x: file * cellSize + cellSize / 2,
    y: rank * cellSize + cellSize / 2
  };
}

function getMiniBoardHighlight(square, fromSquare, toSquare) {
  if (square === fromSquare) return 'from-square';
  if (square === toSquare) return 'to-square';
  return '';
}

// ============================================================================
// MERMAID DIAGRAM
// ============================================================================

// ============================================================================
// CHESS BOARD RENDERING
// ============================================================================

// Unicode chess pieces
const PIECES = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

function renderChessBoard(fen, bestMove) {
  if (!fen) {
    chessBoard.innerHTML = '<div class="placeholder" style="grid-column: span 8; grid-row: span 8;">No position to display</div>';
    return;
  }

  // Parse FEN - get just the board part
  const boardPart = fen.split(' ')[0];
  const ranks = boardPart.split('/');

  // Parse best move to get from/to squares
  let fromSquare = null;
  let toSquare = null;

  if (bestMove) {
    // Try direct from/to first
    if (bestMove.from && bestMove.to) {
      fromSquare = bestMove.from;
      toSquare = bestMove.to;
    }
    // Then try parsing from move string
    else if (bestMove.move) {
      const move = bestMove.move;
      if (move.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(move)) {
        fromSquare = move.substring(0, 2);
        toSquare = move.substring(2, 4);
      }
    }
  }

  console.log('[Panel] Rendering board, from:', fromSquare, 'to:', toSquare, 'flipped:', boardFlipped);

  // Generate 64 squares - handle flipping
  let html = '';

  for (let visualRow = 0; visualRow < 8; visualRow++) {
    for (let visualCol = 0; visualCol < 8; visualCol++) {
      // Map visual position to actual board position
      const actualRow = boardFlipped ? (7 - visualRow) : visualRow;
      const actualCol = boardFlipped ? (7 - visualCol) : visualCol;

      const rankNum = 8 - actualRow; // 8 to 1
      const file = String.fromCharCode(97 + actualCol); // a-h
      const square = file + rankNum;

      // Get piece at this position
      const rank = ranks[actualRow];
      const piece = getPieceAtPosition(rank, actualCol);

      // Determine square color (based on actual position, not visual)
      const isLight = (actualRow + actualCol) % 2 === 0;
      const highlight = getSquareHighlight(square, fromSquare, toSquare);

      if (piece) {
        const isWhite = piece === piece.toUpperCase();
        const pieceChar = PIECES[piece] || piece;
        html += `<div class="chess-square ${isLight ? 'light' : 'dark'} ${highlight}" data-square="${square}">
          <span class="piece ${isWhite ? 'white' : 'black'}">${pieceChar}</span>
        </div>`;
      } else {
        html += `<div class="chess-square ${isLight ? 'light' : 'dark'} ${highlight}" data-square="${square}"></div>`;
      }
    }
  }

  chessBoard.innerHTML = html;
}

// Get piece at a specific column in a FEN rank string
function getPieceAtPosition(rankStr, col) {
  let currentCol = 0;
  for (const char of rankStr) {
    if ('12345678'.includes(char)) {
      currentCol += parseInt(char);
    } else {
      if (currentCol === col) {
        return char;
      }
      currentCol++;
    }
    if (currentCol > col) break;
  }
  return null;
}

function getSquareHighlight(square, fromSquare, toSquare) {
  if (square === fromSquare) return 'best-from';
  if (square === toSquare) return 'best-to';
  return '';
}

// ============================================================================
// UTILITIES
// ============================================================================

function updateStatus(text, type = 'info') {
  statusText.textContent = text;
  statusDot.className = `status-dot ${type}`;
  headerStatusDot.className = `header-status-dot ${type}`;
}

// ============================================================================
// DEBUG LOGS
// ============================================================================

async function viewDebugLogs() {
  viewDebugLogsBtn.textContent = 'Loading...';
  viewDebugLogsBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_DEBUG_LOGS' });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get logs');
    }

    const logs = response.logs || [];

    if (logs.length === 0) {
      debugLogContent.innerHTML = '<span style="color: #888;">No debug logs yet. Try capturing a screenshot first.</span>';
    } else {
      // Format logs with color coding
      const formatted = logs.map(log => {
        const levelColor = log.level === 'error' ? '#ff6b6b' :
                          log.level === 'warn' ? '#ffd93d' : '#6bcb77';
        return `<div style="margin-bottom: 12px; border-left: 3px solid ${levelColor}; padding-left: 8px;">` +
          `<div style="color: #888; font-size: 10px;">${log.timestamp}</div>` +
          `<div><span style="color: ${levelColor}; font-weight: bold;">[${log.level.toUpperCase()}]</span> ` +
          `<span style="color: #61dafb;">${log.source}</span>: ${log.message}</div>` +
          (log.data ? `<div style="color: #aaa; margin-top: 4px; background: #0d0d1a; padding: 6px; border-radius: 4px; overflow-x: auto;">${escapeHtml(log.data)}</div>` : '') +
          `</div>`;
      }).join('');

      debugLogContent.innerHTML = formatted;
    }

    debugLogViewer.style.display = 'block';

  } catch (error) {
    debugLogContent.innerHTML = `<span style="color: #ff6b6b;">Error: ${error.message}</span>`;
    debugLogViewer.style.display = 'block';
  } finally {
    viewDebugLogsBtn.textContent = 'View Logs';
    viewDebugLogsBtn.disabled = false;
  }
}

async function downloadDebugLogs() {
  downloadDebugLogsBtn.textContent = 'Downloading...';
  downloadDebugLogsBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_DEBUG_LOGS' });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get logs');
    }

    const logs = response.logs || [];
    const logText = logs.map(log => {
      return `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.source}: ${log.message}` +
        (log.data ? `\nDATA:\n${log.data}` : '') +
        '\n' + '-'.repeat(80);
    }).join('\n\n');

    // Create download
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-study-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  } catch (error) {
    alert('Failed to download logs: ' + error.message);
  } finally {
    downloadDebugLogsBtn.textContent = 'Download';
    downloadDebugLogsBtn.disabled = false;
  }
}

async function clearDebugLogs() {
  if (!confirm('Clear all debug logs?')) return;

  clearDebugLogsBtn.textContent = 'Clearing...';
  clearDebugLogsBtn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_DEBUG_LOGS' });
    debugLogViewer.style.display = 'none';
    debugLogContent.innerHTML = '';
  } catch (error) {
    alert('Failed to clear logs: ' + error.message);
  } finally {
    clearDebugLogsBtn.textContent = 'Clear';
    clearDebugLogsBtn.disabled = false;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
