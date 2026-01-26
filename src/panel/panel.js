/**
 * Chess Study Tool - Panel Script
 * 
 * Standalone learning tool that:
 * 1. Captures screenshots on user request
 * 2. Sends to Claude Vision for position recognition
 * 3. Gets Stockfish analysis
 * 4. Displays results with Mermaid diagrams
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
const diagramContainer = document.getElementById('diagram-container');
const explanationText = document.getElementById('explanation-text');

const positionSection = document.getElementById('position-section');
const movesSection = document.getElementById('moves-section');
const diagramSection = document.getElementById('diagram-section');
const explanationSection = document.getElementById('explanation-section');
const thumbnailSection = document.getElementById('thumbnail-section');
const thumbnailImg = document.getElementById('thumbnail-img');

const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const mainContent = document.getElementById('main-content');
const backBtn = document.getElementById('back-btn');
const saveBtn = document.getElementById('save-btn');

const apiKeyInput = document.getElementById('api-key');
const apiProviderSelect = document.getElementById('api-provider');
const apiModelSelect = document.getElementById('api-model');
const apiKeyHint = document.getElementById('api-key-hint');
const toggleKeyBtn = document.getElementById('toggle-key-btn');
const numMovesSelect = document.getElementById('num-moves');
const depthSelect = document.getElementById('depth');

const closeBtn = document.getElementById('close-btn');

const anthropicIndicator = document.getElementById('anthropic-indicator');
const stockfishIndicator = document.getElementById('stockfish-indicator');
const errorIndicator = document.getElementById('error-indicator');
const errorCount = document.getElementById('error-count');
const errorLog = document.getElementById('error-log');
const errorLogContent = document.getElementById('error-log-content');
const checkApisBtn = document.getElementById('check-apis-btn');
const clearErrorsBtn = document.getElementById('clear-errors-btn');

// Error tracking
const errors = [];

// Header dots
const headerAnthropicDot = document.getElementById('header-anthropic-dot');
const headerStockfishDot = document.getElementById('header-stockfish-dot');
const headerErrorDot = document.getElementById('header-error-dot');
const headerIndicators = document.querySelector('.header-indicators');

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Mermaid
  if (window.mermaid) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#3498db',
        primaryTextColor: '#fff',
        primaryBorderColor: '#2980b9',
        lineColor: '#666',
        secondaryColor: '#2ecc71',
        tertiaryColor: '#1a1a2e'
      }
    });
  }
  
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
  
  // Toggle API key visibility
  toggleKeyBtn.addEventListener('click', toggleApiKeyVisibility);
  
  // Provider change - update hints
  apiProviderSelect.addEventListener('change', updateProviderHints);
});

// ============================================================================
// SETTINGS
// ============================================================================

async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    claudeApiKey: '',
    apiProvider: 'anthropic',
    apiModel: 'claude-sonnet-4-5-20250929',
    numMoves: 5,
    depth: 18
  });
  
  apiKeyInput.value = settings.claudeApiKey;
  apiProviderSelect.value = settings.apiProvider;
  apiModelSelect.value = settings.apiModel;
  numMovesSelect.value = settings.numMoves.toString();
  depthSelect.value = settings.depth.toString();
  
  // Update hints based on provider
  updateProviderHints();
}

async function saveSettings() {
  const apiKey = apiKeyInput.value.trim();
  const provider = apiProviderSelect.value;
  
  // Validate API key format based on provider
  if (apiKey) {
    if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
      alert('Invalid Anthropic API key format. Should start with sk-ant-');
      return;
    }
    if (provider === 'openrouter' && !apiKey.startsWith('sk-or-')) {
      alert('Invalid OpenRouter API key format. Should start with sk-or-');
      return;
    }
  }
  
  await chrome.storage.sync.set({
    claudeApiKey: apiKey,
    apiProvider: provider,
    apiModel: apiModelSelect.value,
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

function toggleApiKeyVisibility() {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyBtn.classList.toggle('showing', isPassword);
}

function updateProviderHints() {
  const provider = apiProviderSelect.value;
  
  if (provider === 'anthropic') {
    apiKeyInput.placeholder = 'sk-ant-api03-...';
    apiKeyHint.innerHTML = 'Get your key at <a href="https://console.anthropic.com/" target="_blank" style="color: #3498db;">console.anthropic.com</a>';
  } else if (provider === 'openrouter') {
    apiKeyInput.placeholder = 'sk-or-v1-...';
    apiKeyHint.innerHTML = 'Get your key at <a href="https://openrouter.ai/keys" target="_blank" style="color: #3498db;">openrouter.ai/keys</a>';
  }
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
  const apiKey = apiKeyInput.value.trim();
  const provider = apiProviderSelect.value;
  
  if (!apiKey) {
    return { success: false, error: 'No API key configured' };
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
  // Check for API key first
  const { claudeApiKey } = await chrome.storage.sync.get('claudeApiKey');
  
  if (!claudeApiKey) {
    updateStatus('Please configure your Claude API key in settings', 'error');
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
    
    diagramSection.style.display = 'block';
    diagramContainer.innerHTML = '<div class="placeholder">⏳ Generating diagram...</div>';
    
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
    diagramContainer.innerHTML = '<div class="placeholder">-</div>';
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
  diagramContainer.innerHTML = '';
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
  diagramSection.style.display = 'block';
  explanationSection.style.display = 'block';
  
  // Update status
  updateStatus('Analysis complete!', 'success');
  
  // Display FEN and turn
  if (data.fen) {
    fenDisplay.textContent = data.fen;
    turnDisplay.textContent = data.turn === 'w' ? '⚪ White' : '⚫ Black';
    turnDisplay.className = data.turn === 'w' ? 'turn-white' : 'turn-black';
  } else {
    fenDisplay.textContent = 'Could not detect position';
    turnDisplay.textContent = '-';
  }
  
  // Display moves
  if (data.moves && data.moves.length > 0) {
    console.log('[Panel] Displaying', data.moves.length, 'moves');
    displayMoves(data.moves);
    renderDiagram(data.moves, data.turn);
  } else {
    console.warn('[Panel] No moves to display');
    movesList.innerHTML = '<div class="placeholder">No moves found - check browser console for API response</div>';
    diagramContainer.innerHTML = '<div class="placeholder">No diagram available</div>';
  }
  
  // Display explanation
  if (data.explanation && data.explanation !== 'Could not generate explanation.') {
    displayExplanation(data.explanation);
  } else {
    explanationText.innerHTML = '<div class="placeholder">Unable to generate explanation.</div>';
  }
}

function displayMoves(moves) {
  movesList.innerHTML = moves.map((move, i) => `
    <div class="move-card">
      <span class="move-rank">${i === 0 ? '👑' : i + 1}</span>
      <div style="flex: 1;">
        <div class="move-notation">${move.san || move.move}</div>
        ${move.continuation && move.continuation.length > 0 ? 
          `<div class="move-continuation">${move.continuation.slice(0, 4).join(' → ')}</div>` : ''}
      </div>
      <span class="move-eval ${getEvalClass(move.evaluation)}">${formatEval(move.evaluation)}</span>
    </div>
  `).join('');
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

async function renderDiagram(moves, turn) {
  if (!window.mermaid || moves.length === 0) {
    diagramContainer.innerHTML = '<div class="placeholder">Diagram unavailable</div>';
    return;
  }
  
  const mermaidCode = generateMermaidCode(moves, turn);
  const diagramId = `diagram-${Date.now()}`;
  
  try {
    const { svg } = await mermaid.render(diagramId, mermaidCode);
    diagramContainer.innerHTML = svg;
  } catch (error) {
    console.error('Mermaid error:', error);
    diagramContainer.innerHTML = '<div class="placeholder">Could not render diagram</div>';
  }
}

function generateMermaidCode(moves, turn) {
  const turnLabel = turn === 'w' ? 'White' : 'Black';
  
  let code = `flowchart TD\n`;
  code += `    START(["${turnLabel} to move"])\n`;
  code += `    style START fill:#3498db,stroke:#2980b9,color:#fff\n\n`;
  
  moves.forEach((move, i) => {
    const moveId = `M${i}`;
    const moveSan = move.san || move.move;
    const evalStr = formatEval(move.evaluation);
    
    code += `    START --> ${moveId}["${moveSan}<br/>${evalStr}"]\n`;
    
    // Style based on ranking
    if (i === 0) {
      code += `    style ${moveId} fill:#2ecc71,stroke:#27ae60,color:#fff\n`;
    } else if (parseFloat(move.evaluation) >= 0) {
      code += `    style ${moveId} fill:#3498db,stroke:#2980b9,color:#fff\n`;
    } else {
      code += `    style ${moveId} fill:#e74c3c,stroke:#c0392b,color:#fff\n`;
    }
    
    // Add continuation if available
    if (move.continuation && move.continuation.length >= 1) {
      const respId = `${moveId}R`;
      code += `    ${moveId} --> ${respId}["${move.continuation[0]}"]\n`;
      code += `    style ${respId} fill:#34495e,stroke:#2c3e50,color:#fff\n`;
      
      if (move.continuation.length >= 2) {
        const followId = `${moveId}F`;
        code += `    ${respId} --> ${followId}["${move.continuation[1]}"]\n`;
        code += `    style ${followId} fill:#16a085,stroke:#1abc9c,color:#fff\n`;
      }
    }
  });
  
  return code;
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
