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

const apiKeyInput = document.getElementById('api-key');
const apiProviderSelect = document.getElementById('api-provider');
const apiModelSelect = document.getElementById('api-model');
const apiKeyHint = document.getElementById('api-key-hint');
const toggleKeyBtn = document.getElementById('toggle-key-btn');
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
  
  // Toggle API key visibility
  toggleKeyBtn.addEventListener('click', toggleApiKeyVisibility);
  
  // Provider change - update hints
  apiProviderSelect.addEventListener('change', updateProviderHints);
  
  // Side toggle switch - "I am White" / "I am Black"
  sideSwitch.addEventListener('change', () => {
    boardFlipped = sideSwitch.checked;
    sideColorLabel.textContent = boardFlipped ? 'Black' : 'White';
    updateBoardOrientation();
    if (currentFen && currentMoves) {
      renderChessBoard(currentFen, currentMoves[0]);
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
