/**
 * Chess Study Tool - Panel Script
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
const movesList = document.getElementById('moves-list');
const chessBoard = document.getElementById('chess-board');
const explanationText = document.getElementById('explanation-text');

const positionSection = document.getElementById('position-section');
const movesSection = document.getElementById('moves-section');
const boardSection = document.getElementById('board-section');
const explanationSection = document.getElementById('explanation-section');
const thumbnailSection = document.getElementById('thumbnail-section');
const thumbnailImg = document.getElementById('thumbnail-img');

const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const mainContent = document.getElementById('main-content');
const backBtn = document.getElementById('back-btn');
const saveBtn = document.getElementById('save-btn');

// Provider section elements
const anthropicSection = document.getElementById('anthropic-section');
const anthropicStar = document.getElementById('anthropic-star');
const anthropicCompare = document.getElementById('anthropic-compare');
const anthropicModel = document.getElementById('anthropic-model');
const anthropicKey = document.getElementById('anthropic-key');

const openrouterSection = document.getElementById('openrouter-section');
const openrouterStar = document.getElementById('openrouter-star');
const openrouterCompare = document.getElementById('openrouter-compare');
const openrouterModel = document.getElementById('openrouter-model');
const openrouterKey = document.getElementById('openrouter-key');

const bigmodelSection = document.getElementById('bigmodel-section');
const bigmodelStar = document.getElementById('bigmodel-star');
const bigmodelCompare = document.getElementById('bigmodel-compare');
const bigmodelModel = document.getElementById('bigmodel-model');
const bigmodelKey = document.getElementById('bigmodel-key');

// Comparison box
const comparisonBox = document.getElementById('comparison-box');
const comparisonResults = document.getElementById('comparison-results');
const comparisonDefault = document.getElementById('comparison-default');

const numMovesSelect = document.getElementById('num-moves');
const depthSelect = document.getElementById('depth');

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

// Error tracking
const errors = [];

// Board state
let boardFlipped = false;  // false = white on bottom, true = black on bottom
let currentFen = null;
let currentMoves = null;

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
  
  // Setup event listeners
  captureBtn.addEventListener('click', handleCapture);
  settingsToggle.addEventListener('click', showSettings);
  backBtn.addEventListener('click', hideSettings);
  saveBtn.addEventListener('click', saveSettings);
  
  // Close button - close the window
  closeBtn.addEventListener('click', () => {
    window.close();
  });
  
  // API check button
  checkApisBtn.addEventListener('click', checkAllAPIs);
  
  // Header indicators click - go to settings
  headerIndicators.addEventListener('click', showSettings);
  
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

  // Provider star buttons - set default
  anthropicStar.addEventListener('click', () => setDefaultProvider('anthropic'));
  openrouterStar.addEventListener('click', () => setDefaultProvider('openrouter'));
  bigmodelStar.addEventListener('click', () => setDefaultProvider('bigmodel'));
  
  // Side toggle switch - "I am White" / "I am Black"
  sideSwitch.addEventListener('change', () => {
    boardFlipped = sideSwitch.checked;
    sideColorLabel.textContent = boardFlipped ? 'Black' : 'White';
    updateBoardOrientation();
    if (currentFen && currentMoves) {
      renderChessBoard(currentFen, currentMoves[0]);
    }
  });

  // Debug log buttons
  viewDebugLogsBtn.addEventListener('click', viewDebugLogs);
  downloadDebugLogsBtn.addEventListener('click', downloadDebugLogs);
  clearDebugLogsBtn.addEventListener('click', clearDebugLogs);

  // Compare checkbox handlers - limit to max 2 providers
  anthropicCompare.addEventListener('change', () => enforceCompareLimit('anthropic'));
  openrouterCompare.addEventListener('change', () => enforceCompareLimit('openrouter'));
  bigmodelCompare.addEventListener('change', () => enforceCompareLimit('bigmodel'));
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

// Maximum providers that can be selected for comparison
const MAX_COMPARE_PROVIDERS = 2;

// Enforce limit of 2 providers for comparison
function enforceCompareLimit(changedProvider) {
  const checkboxes = {
    anthropic: anthropicCompare,
    openrouter: openrouterCompare,
    bigmodel: bigmodelCompare
  };

  const checkedProviders = [];
  for (const [provider, checkbox] of Object.entries(checkboxes)) {
    if (checkbox.checked) {
      checkedProviders.push(provider);
    }
  }

  // If more than 2 are checked, uncheck the oldest one (not the one just changed)
  if (checkedProviders.length > MAX_COMPARE_PROVIDERS) {
    // Uncheck the first one that isn't the one just changed
    for (const provider of checkedProviders) {
      if (provider !== changedProvider) {
        checkboxes[provider].checked = false;
        break;
      }
    }
  }

  // Update disabled state - disable unchecked boxes when at limit
  updateCompareCheckboxStates();
}

// Update disabled state of compare checkboxes based on selection count
function updateCompareCheckboxStates() {
  const checkboxes = [anthropicCompare, openrouterCompare, bigmodelCompare];
  const checkedCount = checkboxes.filter(cb => cb.checked).length;

  // Disable unchecked boxes when at the limit
  checkboxes.forEach(cb => {
    if (!cb.checked && checkedCount >= MAX_COMPARE_PROVIDERS) {
      cb.disabled = true;
      cb.parentElement.style.opacity = '0.5';
      cb.parentElement.title = `Max ${MAX_COMPARE_PROVIDERS} providers can be compared`;
    } else {
      cb.disabled = false;
      cb.parentElement.style.opacity = '1';
      cb.parentElement.title = '';
    }
  });
}

// ============================================================================
// SETTINGS
// ============================================================================

async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    // Per-provider settings
    anthropicApiKey: '',
    anthropicModel: 'claude-opus-4-5-20251101',
    openrouterApiKey: '',
    openrouterModel: 'google/gemini-3-flash-preview',
    bigmodelApiKey: '',
    bigmodelModel: 'glm-4v',
    // Global settings
    defaultProvider: 'anthropic',
    compareProviders: ['anthropic'],
    numMoves: 5,
    depth: 18,
    // Migration: check old format
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

  // Load analysis settings
  numMovesSelect.value = settings.numMoves.toString();
  depthSelect.value = settings.depth.toString();

  // Update default provider stars
  updateDefaultProviderUI(settings.defaultProvider);

  // Update compare checkboxes (limit to MAX_COMPARE_PROVIDERS)
  const compareList = settings.compareProviders.slice(0, MAX_COMPARE_PROVIDERS);
  anthropicCompare.checked = compareList.includes('anthropic');
  openrouterCompare.checked = compareList.includes('openrouter');
  bigmodelCompare.checked = compareList.includes('bigmodel');

  // Update disabled states based on selection count
  updateCompareCheckboxStates();
}

function updateDefaultProviderUI(defaultProvider) {
  // Update stars
  anthropicStar.textContent = defaultProvider === 'anthropic' ? '★' : '☆';
  anthropicStar.classList.toggle('active', defaultProvider === 'anthropic');
  openrouterStar.textContent = defaultProvider === 'openrouter' ? '★' : '☆';
  openrouterStar.classList.toggle('active', defaultProvider === 'openrouter');
  bigmodelStar.textContent = defaultProvider === 'bigmodel' ? '★' : '☆';
  bigmodelStar.classList.toggle('active', defaultProvider === 'bigmodel');

  // Update section borders
  anthropicSection.classList.toggle('is-default', defaultProvider === 'anthropic');
  openrouterSection.classList.toggle('is-default', defaultProvider === 'openrouter');
  bigmodelSection.classList.toggle('is-default', defaultProvider === 'bigmodel');
}

function setDefaultProvider(provider) {
  // Check if provider has an API key
  const keyMap = {
    anthropic: anthropicKey.value.trim(),
    openrouter: openrouterKey.value.trim(),
    bigmodel: bigmodelKey.value.trim()
  };

  if (!keyMap[provider]) {
    alert(`Please add an API key for ${provider} before setting it as default.`);
    return;
  }

  updateDefaultProviderUI(provider);
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

  // Determine default provider (whichever star is active)
  let defaultProvider = 'anthropic';
  if (anthropicStar.classList.contains('active')) defaultProvider = 'anthropic';
  else if (openrouterStar.classList.contains('active')) defaultProvider = 'openrouter';
  else if (bigmodelStar.classList.contains('active')) defaultProvider = 'bigmodel';

  // Get compare providers
  const compareProviders = [];
  if (anthropicCompare.checked) compareProviders.push('anthropic');
  if (openrouterCompare.checked) compareProviders.push('openrouter');
  if (bigmodelCompare.checked) compareProviders.push('bigmodel');

  // If no providers selected for comparison, use default
  if (compareProviders.length === 0) {
    compareProviders.push(defaultProvider);
  }

  // Validate that default provider has an API key
  const keyMap = { anthropic: anthropicApiKey, openrouter: openrouterApiKey, bigmodel: bigmodelApiKey };
  if (!keyMap[defaultProvider]) {
    // Auto-select first provider with a key as default
    for (const provider of ['anthropic', 'openrouter', 'bigmodel']) {
      if (keyMap[provider]) {
        defaultProvider = provider;
        updateDefaultProviderUI(provider);
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
    compareProviders,
    numMoves: parseInt(numMovesSelect.value),
    depth: parseInt(depthSelect.value)
  });

  hideSettings();
  updateStatus('Settings saved!', 'success');
}

function showSettings() {
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
  headerAnthropicDot.className = 'header-dot checking';
  headerStockfishDot.className = 'header-dot checking';
  
  // Check both APIs in parallel
  const [anthropicResult, stockfishResult] = await Promise.all([
    checkAnthropicAPI(),
    checkStockfishAPI()
  ]);
  
  // Update indicators (settings panel)
  anthropicIndicator.className = `status-indicator ${anthropicResult.success ? 'connected' : 'disconnected'}`;
  stockfishIndicator.className = `status-indicator ${stockfishResult.success ? 'connected' : 'disconnected'}`;
  
  // Update header dots
  headerAnthropicDot.className = `header-dot ${anthropicResult.success ? 'connected' : 'disconnected'}`;
  headerStockfishDot.className = `header-dot ${stockfishResult.success ? 'connected' : 'disconnected'}`;
  
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
    headerErrorDot.className = 'header-dot has-errors';
    errorCount.style.display = 'inline';
    errorCount.textContent = errors.length;
  } else {
    errorIndicator.className = 'status-indicator';
    headerErrorDot.className = 'header-dot';
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
  // Check for API key first - at least one provider needs a key
  const settings = await chrome.storage.sync.get(['anthropicApiKey', 'openrouterApiKey', 'bigmodelApiKey', 'defaultProvider']);
  const hasAnyKey = settings.anthropicApiKey || settings.openrouterApiKey || settings.bigmodelApiKey;

  if (!hasAnyKey) {
    updateStatus('Please configure at least one API key in settings', 'error');
    showSettings();
    return;
  }

  // Check that default provider has a key
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
  
  // Set loading state
  captureBtn.classList.add('loading');
  captureBtn.disabled = true;
  updateStatus('Capturing screen...', 'loading');
  
  // Clear previous results and show loading placeholders
  clearResults();
  
  try {
    // Request screenshot from background script
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to capture screenshot');
    }
    
    // Show thumbnail of captured image
    thumbnailSection.style.display = 'block';
    thumbnailImg.src = response.imageData;
    
    updateStatus('Analyzing position with AI...', 'loading');
    
    // Show sections with loading state
    positionSection.style.display = 'block';
    fenDisplay.textContent = 'Analyzing...';
    turnDisplay.textContent = '...';
    
    movesSection.style.display = 'block';
    movesList.innerHTML = '<div class="placeholder">⏳ Calculating best moves...</div>';
    
    boardSection.style.display = 'block';
    chessBoard.innerHTML = '<div class="placeholder" style="grid-column: span 8; grid-row: span 8;">⏳ Loading board...</div>';
    
    explanationSection.style.display = 'block';
    explanationText.innerHTML = '<div class="placeholder">⏳ Generating explanation...</div>';
    
    // Send for analysis
    const analysisResponse = await chrome.runtime.sendMessage({
      type: 'ANALYZE_SCREENSHOT',
      imageData: response.imageData
    });
    
    console.log('Analysis response:', analysisResponse);
    
    if (analysisResponse.error) {
      // Even with error, we might have partial data (FEN from Vision)
      if (analysisResponse.fen) {
        // Show the FEN that was detected
        positionSection.style.display = 'block';
        fenDisplay.textContent = analysisResponse.fen;
        turnDisplay.textContent = analysisResponse.turn === 'w' ? '⚪ White' : '⚫ Black';
        turnDisplay.className = analysisResponse.turn === 'w' ? 'turn-white' : 'turn-black';
        // Render the board even if Stockfish failed
        renderChessBoard(analysisResponse.fen, null);
      }
      throw new Error(analysisResponse.error);
    }
    
    // Display results
    displayResults(analysisResponse);
    
  } catch (error) {
    console.error('Capture error:', error);
    updateStatus('Error: ' + error.message, 'error');
    
    // Log error to the error panel
    addError('Analysis', error.message);
    
    // Show error in sections
    fenDisplay.textContent = 'Error';
    movesList.innerHTML = `<div class="placeholder" style="color: #e74c3c;">❌ ${error.message}</div>`;
    explanationText.innerHTML = '<div class="placeholder">-</div>';
  } finally {
    captureBtn.classList.remove('loading');
    captureBtn.disabled = false;
  }
}

// Clear all previous results
function clearResults() {
  fenDisplay.textContent = '-';
  turnDisplay.textContent = '-';
  turnDisplay.className = '';
  movesList.innerHTML = '';
  chessBoard.innerHTML = '';
  explanationText.innerHTML = '';
}

// ============================================================================
// DISPLAY RESULTS
// ============================================================================

function displayResults(data) {
  console.log('[Panel] Displaying results:', data);

  // Show all sections
  positionSection.style.display = 'block';
  movesSection.style.display = 'block';
  boardSection.style.display = 'block';
  explanationSection.style.display = 'block';

  // Update status
  updateStatus('Analysis complete!', 'success');

  // Show comparison box if we have comparison data
  if (data.comparison && data.comparison.disagreements) {
    displayComparison(data.comparison);
  } else {
    comparisonBox.style.display = 'none';
  }
  
  // Display FEN and turn
  if (data.fen) {
    fenDisplay.textContent = data.fen;
    turnDisplay.textContent = data.turn === 'w' ? '⚪ White' : '⚫ Black';
    turnDisplay.className = data.turn === 'w' ? 'turn-white' : 'turn-black';
    currentFen = data.fen;
  } else {
    fenDisplay.textContent = 'Could not detect position';
    turnDisplay.textContent = '-';
    currentFen = null;
  }
  
  // Display moves and render board
  if (data.moves && data.moves.length > 0) {
    console.log('[Panel] Displaying', data.moves.length, 'moves');
    currentMoves = data.moves;
    displayMoves(data.moves, data.fen);
    // Render board with best move highlighted
    const bestMove = data.moves[0];
    renderChessBoard(data.fen, bestMove);
  } else {
    console.warn('[Panel] No moves to display');
    currentMoves = null;
    movesList.innerHTML = '<div class="placeholder">No moves found - check browser console for API response</div>';
    // Still render the board without move highlight
    renderChessBoard(data.fen, null);
  }
  
  // Display explanation
  if (data.explanation && data.explanation !== 'Could not generate explanation.') {
    displayExplanation(data.explanation);
  } else {
    explanationText.innerHTML = '<div class="placeholder">Unable to generate explanation.</div>';
  }
}

// Display comparison results from multi-model analysis
function displayComparison(comparison) {
  comparisonBox.style.display = 'block';

  // Build diagnostic table
  let html = '<table class="comparison-table">';
  html += '<thead><tr><th>Provider</th><th>Pawns</th><th>Conf</th><th>Status</th></tr></thead>';
  html += '<tbody>';

  const hasDisagreements = comparison.providerDetails.some(p => p.status === 'disagree' || p.status === 'error');

  comparison.providerDetails.forEach(p => {
    const providerName = getProviderDisplayName(p.provider);
    const pawns = `${p.whitePawns}W/${p.blackPawns}B`;
    const conf = p.confidence === 'high' ? '●●●' : p.confidence === 'medium' ? '●●○' : '●○○';

    let statusHtml = '';
    let rowClass = '';

    if (p.status === 'default') {
      statusHtml = '<span class="status-default">★ default</span>';
      rowClass = 'row-default';
    } else if (p.status === 'agree') {
      statusHtml = '<span class="status-agree">✓ matches</span>';
      rowClass = 'row-agree';
    } else if (p.status === 'error') {
      statusHtml = `<span class="status-error">✗ error</span>`;
      rowClass = 'row-error';
    } else {
      statusHtml = `<span class="status-disagree">⚠ ${p.diffCount} squares</span>`;
      rowClass = 'row-disagree';
    }

    html += `<tr class="${rowClass}"><td>${providerName}</td><td>${pawns}</td><td>${conf}</td><td>${statusHtml}</td></tr>`;
  });

  html += '</tbody></table>';

  // Add expandable square details if there are disagreements
  if (hasDisagreements && comparison.squareDetails && comparison.squareDetails.length > 0) {
    html += '<details class="square-details"><summary>Show square details (' + comparison.squareDetails.length + ')</summary>';
    html += '<div class="square-list">';
    comparison.squareDetails.forEach(d => {
      const providerName = getProviderDisplayName(d.provider);
      html += `<div class="square-diff">${providerName} ${d.square}: ${d.otherPiece} vs ${d.defaultPiece}</div>`;
    });
    html += '</div></details>';
  }

  comparisonResults.innerHTML = html;

  // Show which model is being used for Stockfish/explanation
  const defaultName = getProviderDisplayName(comparison.defaultProvider);
  comparisonDefault.innerHTML = `Using: ${defaultName} for analysis <span class="default-star">★</span>`;
}

function getProviderDisplayName(provider) {
  const names = {
    anthropic: 'Anthropic',
    openrouter: 'OpenRouter',
    bigmodel: 'BigModel'
  };
  return names[provider] || provider;
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

function displayMoves(moves, fen) {
  // Piece names for display
  const PIECE_NAMES = {
    'K': 'King', 'Q': 'Queen', 'R': 'Rook', 'B': 'Bishop', 'N': 'Knight', 'P': 'Pawn',
    'k': 'King', 'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight', 'p': 'Pawn'
  };
  
  // Create a vertical list of all moves
  let html = '';
  
  moves.forEach((move, i) => {
    const fromSquare = move.from || (move.move ? move.move.substring(0, 2) : '');
    const toSquare = move.to || (move.move ? move.move.substring(2, 4) : '');
    
    // Get the piece that's moving
    const piece = getPieceAtSquare(fen, fromSquare);
    const pieceIcon = piece ? PIECE_ICONS[piece] : '';
    const pieceName = piece ? PIECE_NAMES[piece] : '';
    const isWhitePiece = piece && piece === piece.toUpperCase();
    
    const isBest = i === 0;
    const rankDisplay = isBest ? '👑' : (i + 1);
    
    html += `
      <div class="move-row ${isBest ? 'best' : ''} ${isBest ? 'active' : ''}" data-move-index="${i}">
        <span class="move-rank">${rankDisplay}</span>
        <span class="move-piece-icon ${isWhitePiece ? 'white-piece' : 'black-piece'}">${pieceIcon}</span>
        <div class="move-text">
          <span class="move-piece-name">${pieceName}</span>
          <span class="move-from-square">${fromSquare}</span>
          <span class="move-arrow">→</span>
          <span class="move-to-square">${toSquare}</span>
        </div>
        <span class="move-eval ${getEvalClass(move.evaluation)}">${formatEval(move.evaluation)}</span>
      </div>
    `;
  });
  
  movesList.innerHTML = html;
  
  // Add click handlers to highlight moves on board
  document.querySelectorAll('.move-row').forEach(row => {
    row.addEventListener('click', () => {
      const index = parseInt(row.dataset.moveIndex);
      if (currentMoves && currentMoves[index]) {
        renderChessBoard(currentFen, currentMoves[index]);
        // Update active state - keep best class but toggle active
        document.querySelectorAll('.move-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
      }
    });
  });
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

function displayExplanation(text) {
  // Highlight chess terminology
  const terms = [
    'check', 'checkmate', 'stalemate', 'castling', 'en passant',
    'fork', 'pin', 'skewer', 'discovered attack', 'double attack',
    'zwischenzug', 'zugzwang', 'tempo', 'initiative', 'development',
    'center control', 'king safety', 'pawn structure', 'outpost',
    'fianchetto', 'gambit', 'sacrifice', 'exchange', 'material',
    'positional', 'tactical', 'endgame', 'middlegame', 'opening',
    'threat', 'counterplay', 'prophylaxis', 'weakness', 'pressure'
  ];
  
  let formatted = text;
  
  terms.forEach(term => {
    const regex = new RegExp(`\\b(${term})\\b`, 'gi');
    formatted = formatted.replace(regex, '<span class="chess-term">$1</span>');
  });
  
  // Highlight move notation
  const moveRegex = /\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)\b/g;
  formatted = formatted.replace(moveRegex, '<span class="move-inline">$1</span>');
  
  explanationText.innerHTML = formatted;
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
}

function formatEval(evaluation) {
  if (typeof evaluation === 'string' && (evaluation.startsWith('M') || evaluation.startsWith('#'))) {
    return evaluation;
  }
  const num = parseFloat(evaluation);
  if (isNaN(num)) return '?';
  return (num > 0 ? '+' : '') + num.toFixed(2);
}

function getEvalClass(evaluation) {
  const num = parseFloat(evaluation);
  if (isNaN(num)) return '';
  if (num > 0.3) return 'positive';
  if (num < -0.3) return 'negative';
  return '';
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
