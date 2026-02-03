/**
 * Chess Study Tool - Background Service Worker
 *
 * Standalone learning tool:
 * - Captures screenshots on user request only
 * - Analyzes with Claude Vision
 * - Gets Stockfish moves from Chess-API.com
 * - Returns results to panel
 *
 * NO INTERACTION with any chess website
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  LICHESS_CLOUD_EVAL_URL: 'https://lichess.org/api/cloud-eval',
  CHESS_API_URL: 'https://chess-api.com/v1', // Fallback
  CLAUDE_API_URL: 'https://api.anthropic.com/v1/messages',
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
  BIGMODEL_API_URL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  CLAUDE_MODEL: 'claude-opus-4-5-20251101',
  MAX_DEBUG_LOGS: 50 // Keep last 50 log entries
};

// Load API keys from .env file on startup (read-only, seeds chrome.storage)
async function loadEnvFile() {
  try {
    const url = chrome.runtime.getURL('.env.local');
    const response = await fetch(url);
    if (!response.ok) return; // No .env file — that's fine

    const text = await response.text();
    const env = {};
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (value) env[key] = value;
    }

    if (Object.keys(env).length === 0) return;

    // Only fill in settings that aren't already set in chrome.storage
    const current = await chrome.storage.sync.get({
      anthropicApiKey: '',
      anthropicModel: '',
      openrouterApiKey: '',
      openrouterModel: '',
      bigmodelApiKey: '',
      bigmodelModel: '',
      defaultProvider: ''
    });

    const envMap = {
      ANTHROPIC_API_KEY: 'anthropicApiKey',
      ANTHROPIC_MODEL: 'anthropicModel',
      OPENROUTER_API_KEY: 'openrouterApiKey',
      OPENROUTER_MODEL: 'openrouterModel',
      BIGMODEL_API_KEY: 'bigmodelApiKey',
      BIGMODEL_MODEL: 'bigmodelModel',
      DEFAULT_PROVIDER: 'defaultProvider'
    };

    const updates = {};
    for (const [envKey, storageKey] of Object.entries(envMap)) {
      if (env[envKey] && !current[storageKey]) {
        updates[storageKey] = env[envKey];
      }
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.sync.set(updates);
      console.log('[Chess Study] Loaded API keys from .env:', Object.keys(updates).join(', '));
    }
  } catch (e) {
    // .env not found or unreadable — silent fail
  }
}

// Run on service worker startup
loadEnvFile();

function buildVisionPrompt() {
  return `IMPORTANT: Output ONLY JSON. Do all analysis internally - do not write out your steps.

BOARD ORIENTATION:
- White is at the bottom (standard orientation for FEN).
- Read squares in standard coordinates: ranks 8→1, files a→h from White's perspective.
- Ignore coordinate labels, clocks, move lists, ads, and UI text. Only pieces inside the 8×8 grid count.
- This image may be a full screenshot or a pre-cropped chess board.

Analyze this chess screenshot to extract the position as FEN notation.

ANALYSIS CHECKLIST (do not output these steps):
1. Find the 8x8 board and apply the orientation rules above
2. Read each rank from 8 to 1, squares a-h
3. Convert to FEN (consecutive empty squares become numbers)
4. Validate: ≤8 pawns per side, exactly 1 king per side, no pawns on ranks 1/8

VALID FEN RULES (board part):
- Use ONLY digits 1-8 and piece letters PNBRQKpnbrqk, separated by '/' for 8 ranks
- Do NOT use file letters (a-h) or rank numbers in the board part
- Each rank must sum to exactly 8 squares

PIECE IDENTIFICATION:
- King: cross on top | Queen: crown with points
- Rook: castle tower | Bishop: pointed hat with slit
- Knight: horse head | Pawn: small round head

RESPOND WITH JSON ONLY - no explanation, no steps, no markdown:
- Include "pieces": an array of ALL occupied squares as {"square":"a1","piece":"P"} (piece uses FEN letter).
{"fen": "...", "turn": "w/b", "pieces": [{"square":"e4","piece":"P"}], "whitePawns": N, "blackPawns": N, "description": "brief", "confidence": "high/medium/low"}

If no board found: {"fen": null, "error": "No chess board detected"}`;
}

function buildVisionRetryPrompt(errorDetail) {
  const detail = errorDetail ? `\n- Your previous attempt produced an invalid FEN: ${errorDetail}` : '\n- Your previous attempt produced an invalid FEN.';
  const basePrompt = buildVisionPrompt();

  const err = (errorDetail || '').toLowerCase();
  let targeted = '';
  if (err.includes('pawn')) {
    targeted = `

TARGETED RECHECK (pawns):
- List all white pawn squares and black pawn squares.
- Common misses: pawns on files a/h and ranks 2/7.
- Then rebuild the FEN board part from rank 8 to 1.`;
  } else if (err.includes('king')) {
    targeted = `

TARGETED RECHECK (kings):
- Locate both kings first and confirm there is exactly one of each.
- Then rebuild the rest of the board around them.`;
  } else if (err.includes('rank') || err.includes('8 ranks') || err.includes('squares')) {
    targeted = `

TARGETED RECHECK (rank sums):
- Rebuild each rank separately; each rank must sum to exactly 8 squares.
- Use digits only for consecutive empty squares.`;
  } else if (err.includes('invalid character')) {
    targeted = `

TARGETED RECHECK (format):
- The board part must contain only PNBRQKpnbrqk, digits 1-8, and '/'.`;
  }

  return `${basePrompt}

STRICT RECHECK:${detail}${targeted}
- Re-read the board and verify pawn counts (max 8 per side) and exactly one king per side.
- Ensure the board part uses ONLY PNBRQKpnbrqk, digits 1-8, and '/'. No file letters.
- If you cannot produce a valid FEN after rechecking, respond with:
{"fen": null, "error": "Invalid FEN after recheck"}`;
}

// Provider configurations
const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    url: CONFIG.CLAUDE_API_URL,
    models: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001']
  },
  openrouter: {
    name: 'OpenRouter',
    url: CONFIG.OPENROUTER_API_URL,
    models: ['google/gemini-3-flash-preview']
  },
  bigmodel: {
    name: 'BigModel',
    url: CONFIG.BIGMODEL_API_URL,
    models: ['glm-4v', 'glm-4v-plus']
  }
};

// ============================================================================
// DEBUG LOGGING SYSTEM
// ============================================================================

async function debugLog(level, source, message, data = null) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level, // 'info', 'warn', 'error'
    source,
    message,
    data: data ? (typeof data === 'string' ? data : JSON.stringify(data, null, 2)) : null
  };

  // Also log to console
  const consoleMsg = `[Chess Study] [${level.toUpperCase()}] ${source}: ${message}`;
  if (level === 'error') {
    console.error(consoleMsg, data || '');
  } else if (level === 'warn') {
    console.warn(consoleMsg, data || '');
  } else {
    console.log(consoleMsg, data || '');
  }

  // Store in chrome.storage.local
  try {
    const { debugLogs = [] } = await chrome.storage.local.get('debugLogs');
    debugLogs.push(entry);

    // Keep only the last N entries
    while (debugLogs.length > CONFIG.MAX_DEBUG_LOGS) {
      debugLogs.shift();
    }

    await chrome.storage.local.set({ debugLogs });
  } catch (e) {
    console.error('[Chess Study] Failed to store debug log:', e);
  }
}

async function getDebugLogs() {
  const { debugLogs = [] } = await chrome.storage.local.get('debugLogs');
  return debugLogs;
}

async function clearDebugLogs() {
  await chrome.storage.local.set({ debugLogs: [] });
}

// ============================================================================
// EXTENSION ICON CLICK - Open Side Panel
// ============================================================================

chrome.action.onClicked.addListener(async (tab) => {
  // Open the side panel
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Chess Study] Message received:', message.type);

  if (message.type === 'CAPTURE_SCREENSHOT') {
    handleCapture(sendResponse);
    return true; // Keep channel open for async
  }

  if (message.type === 'ANALYZE_SCREENSHOT') {
    console.log('[Chess Study] Starting analysis...');
    handleAnalysis(message.imageData, { userColor: message.userColor })
      .then(result => {
        console.log('[Chess Study] Analysis complete:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('[Chess Study] Analysis failed:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (message.type === 'ANALYZE_FEN') {
    console.log('[Chess Study] Starting FEN-only analysis...');
    handleFenAnalysis(message.fen)
      .then(result => {
        console.log('[Chess Study] FEN analysis complete:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('[Chess Study] FEN analysis failed:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (message.type === 'TEST_ANTHROPIC_API') {
    testAnthropicAPI(message.apiKey, message.provider || 'anthropic')
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'TEST_STOCKFISH_API') {
    testStockfishAPI()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_DEBUG_LOGS') {
    getDebugLogs()
      .then(logs => sendResponse({ success: true, logs }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'CLEAR_DEBUG_LOGS') {
    clearDebugLogs()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'AUTO_CROP_BOARD') {
    handleAutoCrop(message.imageData)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});

// Keyboard shortcut: Alt+= triggers capture via panel
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-analyze') {
    console.log('[Chess Study] Keyboard shortcut triggered: capture-analyze');
    chrome.runtime.sendMessage({ type: 'TRIGGER_CAPTURE' });
  }
});

// ============================================================================
// SCREENSHOT CAPTURE
// ============================================================================

async function handleCapture(sendResponse) {
  try {
    // Get the current active tab in the current window
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab) {
      sendResponse({ success: false, error: 'No active tab found. Please open a tab with a chess position.' });
      return;
    }

    // Capture the visible area of the active tab's window
    const imageData = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
      format: 'png',
      quality: 100
    });

    console.log('[Chess Study] Screenshot captured from tab', activeTab.id);
    sendResponse({ success: true, imageData });

  } catch (error) {
    console.error('[Chess Study] Capture error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ============================================================================
// DOM EXTRACTION (chess.com)
// ============================================================================

// Self-contained function injected into chess.com pages via chrome.scripting.executeScript.
// Must have ZERO external dependencies — everything it needs is defined inside.
function extractPositionFromDOM() {
  const PIECE_MAP = {
    wp: 'P', wn: 'N', wb: 'B', wr: 'R', wq: 'Q', wk: 'K',
    bp: 'p', bn: 'n', bb: 'b', br: 'r', bq: 'q', bk: 'k'
  };

  // Find piece elements — try multiple selectors for resilience
  let pieceElements = document.querySelectorAll('.piece');

  // If no pieces found at top level, check inside web components (wc-chess-board)
  if (!pieceElements.length) {
    const wcBoard = document.querySelector('wc-chess-board');
    if (wcBoard?.shadowRoot) {
      pieceElements = wcBoard.shadowRoot.querySelectorAll('.piece');
    }
    // Also try chess-board custom element
    if (!pieceElements.length) {
      const chessBoard = document.querySelector('chess-board');
      if (chessBoard?.shadowRoot) {
        pieceElements = chessBoard.shadowRoot.querySelectorAll('.piece');
      }
    }
  }

  if (!pieceElements.length) return null;

  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const pieces = [];

  for (const el of pieceElements) {
    if (el.classList.contains('dragging')) continue;

    const classes = [...el.classList];
    const pieceClass = classes.find(c => PIECE_MAP[c]);
    if (!pieceClass) continue;

    const squareClass = classes.find(c => c.startsWith('square-'));
    if (!squareClass) continue;

    const digits = squareClass.replace('square-', '');
    if (digits.length < 2) continue;

    const fileNum = parseInt(digits[0], 10);
    const rankNum = parseInt(digits[1], 10);
    if (fileNum < 1 || fileNum > 8 || rankNum < 1 || rankNum > 8) continue;

    const fenChar = PIECE_MAP[pieceClass];
    board[8 - rankNum][fileNum - 1] = fenChar;

    const squareName = String.fromCharCode(96 + fileNum) + rankNum;
    pieces.push({ square: squareName, piece: fenChar });
  }

  // Must have both kings
  const hasWhiteKing = pieces.some(p => p.piece === 'K');
  const hasBlackKing = pieces.some(p => p.piece === 'k');
  if (!hasWhiteKing || !hasBlackKing) return null;

  // Convert board to FEN
  const fenRanks = board.map(rank => {
    let str = '';
    let empty = 0;
    for (const sq of rank) {
      if (!sq) { empty++; } else {
        if (empty > 0) { str += empty; empty = 0; }
        str += sq;
      }
    }
    if (empty > 0) str += empty;
    return str;
  });
  const boardFen = fenRanks.join('/');

  // Detect turn from highlighted squares (last move indicator)
  let turn = 'w';
  const highlights = document.querySelectorAll('.highlight');
  if (highlights.length >= 2) {
    for (const hl of highlights) {
      const hlSquare = [...hl.classList].find(c => c.startsWith('square-'));
      if (!hlSquare) continue;
      const onSquare = document.querySelectorAll(`.piece.${hlSquare}`);
      for (const p of onSquare) {
        const pc = [...p.classList].find(c => PIECE_MAP[c]);
        if (pc) { turn = pc.startsWith('w') ? 'b' : 'w'; break; }
      }
      if (turn !== 'w') break;
    }
  }

  // Infer castling
  let castling = '';
  if (board[7][4] === 'K') {
    if (board[7][7] === 'R') castling += 'K';
    if (board[7][0] === 'R') castling += 'Q';
  }
  if (board[0][4] === 'k') {
    if (board[0][7] === 'r') castling += 'k';
    if (board[0][0] === 'r') castling += 'q';
  }
  castling = castling || '-';

  const fullFen = `${boardFen} ${turn} ${castling} - 0 1`;

  return {
    fen: boardFen,
    fullFen,
    turn,
    pieces,
    castling,
    source: 'dom',
    site: 'chess.com',
    pieceCount: pieces.length,
    whitePawns: pieces.filter(p => p.piece === 'P').length,
    blackPawns: pieces.filter(p => p.piece === 'p').length
  };
}

async function tryDomExtraction(userColor) {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.url || !activeTab.url.includes('chess.com')) {
      return null;
    }

    console.log('[Chess Study] Chess.com detected, trying DOM extraction...');

    // Inject extraction function directly — fresh every time, no content script dependency
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: extractPositionFromDOM
    });

    const pos = injectionResults?.[0]?.result;
    if (!pos) {
      console.log('[Chess Study] DOM extraction returned no position');
      return null;
    }

    console.log('[Chess Study] DOM extraction successful:', pos.pieceCount, 'pieces');
    await debugLog('info', 'DOM', 'Position extracted from chess.com DOM', {
      pieceCount: pos.pieceCount,
      whitePawns: pos.whitePawns,
      blackPawns: pos.blackPawns,
      turn: pos.turn,
      fen: pos.fullFen
    });

    // Validate the extracted FEN
    const normalizeOptions = { inferCastlingWhenMissing: true };
    const normalized = normalizeFEN(pos.fullFen, normalizeOptions);
    const validation = validateFEN(normalized);

    if (!validation.valid) {
      console.log('[Chess Study] DOM FEN validation failed:', validation.error);
      await debugLog('warn', 'DOM', 'FEN validation failed', { error: validation.error, fen: pos.fullFen });
      return null;
    }

    // Adjust turn for user's color if needed
    let fenForStockfish = normalized;
    let analysisNote = null;

    if (userColor) {
      const fenTurn = fenForStockfish.split(' ')[1];
      if (fenTurn && fenTurn !== userColor) {
        const parts = fenForStockfish.split(' ');
        parts[1] = userColor;
        fenForStockfish = parts.join(' ');
        analysisNote = `Turn adjusted to ${userColor === 'w' ? 'White' : 'Black'} (your color)`;
        console.log('[Chess Study]', analysisNote);
      }
    }

    return {
      fen: pos.fen,
      fullFen: pos.fullFen,
      fenForStockfish,
      turn: pos.turn,
      pieces: pos.pieces,
      description: `Position read from chess.com (${pos.pieceCount} pieces)`,
      source: 'dom',
      analysisNote
    };

  } catch (error) {
    console.log('[Chess Study] DOM extraction failed:', error.message);
    await debugLog('info', 'DOM', 'Extraction failed, will use vision', { error: error.message });
    return null;
  }
}

// ============================================================================
// ANALYSIS PIPELINE
// ============================================================================

async function handleAnalysis(imageData, options = {}) {
  try {
    const userColor = options.userColor;
    const normalizeOptions = { inferCastlingWhenMissing: true };

    // Step 0: Try DOM extraction first (chess.com only)
    const domResult = await tryDomExtraction(userColor);

    if (domResult) {
      console.log('[Chess Study] Using DOM-extracted position, skipping vision API');

      // Go directly to Stockfish
      console.log('[Chess Study] Step 2: Getting Stockfish analysis...');
      console.log('[Chess Study] FEN to analyze:', domResult.fenForStockfish);

      let moves;
      try {
        moves = await getStockfishMoves(domResult.fenForStockfish, 18, 5, normalizeOptions);
        console.log('[Chess Study] Stockfish moves:', moves);
      } catch (stockfishError) {
        console.error('[Chess Study] Stockfish error:', stockfishError);
        return {
          error: `Stockfish analysis failed: ${stockfishError.message}\n\nFEN was: ${domResult.fen}`,
          fen: domResult.fen,
          fenNormalized: domResult.fenForStockfish,
          turn: domResult.turn,
          source: 'dom'
        };
      }

      const { targetElo } = await chrome.storage.sync.get({ targetElo: 1500 });
      const selection = selectHumanMove(moves, targetElo);

      return {
        fen: domResult.fen,
        fenNormalized: domResult.fenForStockfish,
        turn: userColor || domResult.turn,
        description: domResult.description,
        moves: selection.allMoves,
        selectedMove: selection.selected,
        engineBest: selection.engineBest,
        analysisNote: domResult.analysisNote,
        source: 'dom'
      };
    }

    // Vision fallback: no DOM extraction available
    console.log('[Chess Study] No DOM extraction, using vision API...');

    const settings = await chrome.storage.sync.get({
      anthropicApiKey: '',
      anthropicModel: 'claude-opus-4-5-20251101',
      openrouterApiKey: '',
      openrouterModel: 'google/gemini-3-flash-preview',
      bigmodelApiKey: '',
      bigmodelModel: 'glm-4v',
      defaultProvider: 'anthropic',
      // Migration support
      claudeApiKey: '',
      apiProvider: 'anthropic',
      apiModel: 'claude-opus-4-5-20251101'
    });

    // Migrate from old settings if needed
    if (settings.claudeApiKey && !settings.anthropicApiKey && !settings.openrouterApiKey) {
      if (settings.apiProvider === 'anthropic') {
        settings.anthropicApiKey = settings.claudeApiKey;
        settings.anthropicModel = settings.apiModel;
      } else if (settings.apiProvider === 'openrouter') {
        settings.openrouterApiKey = settings.claudeApiKey;
        settings.openrouterModel = settings.apiModel;
      }
      settings.defaultProvider = settings.apiProvider;
    }

    const providerConfigs = {
      anthropic: { apiKey: settings.anthropicApiKey, model: settings.anthropicModel },
      openrouter: { apiKey: settings.openrouterApiKey, model: settings.openrouterModel },
      bigmodel: { apiKey: settings.bigmodelApiKey, model: settings.bigmodelModel }
    };

    // Ensure default provider has a key
    if (!providerConfigs[settings.defaultProvider]?.apiKey) {
      const firstWithKey = ['anthropic', 'openrouter', 'bigmodel'].find(p => providerConfigs[p]?.apiKey);
      if (firstWithKey) {
        settings.defaultProvider = firstWithKey;
      } else {
        return { error: 'No API key configured for any provider' };
      }
    }

    const provider = settings.defaultProvider;
    const config = providerConfigs[provider];

    console.log('[Chess Study] Step 1: Analyzing with Vision...');
    console.log('[Chess Study] Using provider:', provider);

    const baseVisionPrompt = buildVisionPrompt();

    // Single vision call with full screenshot
    let visionResult;
    try {
      visionResult = await analyzeWithVision(imageData, config.apiKey, provider, config.model, baseVisionPrompt);
    } catch (error) {
      return { error: `Vision analysis failed: ${error.message}` };
    }

    // Evaluate result (includes pieces-array fallback)
    let evaluation = evaluateVisionResults([{ ...visionResult, provider }], normalizeOptions)[0];

    // Retry once with strict prompt if invalid
    if (!evaluation?.validation?.valid) {
      console.log('[Chess Study] Vision result invalid, retrying with strict prompt');
      await debugLog('warn', 'Vision', 'First attempt invalid, retrying', {
        provider,
        error: evaluation?.validation?.error,
        recoveryMethod: evaluation?.recoveryMethod
      });

      const retryPrompt = buildVisionRetryPrompt(evaluation?.validation?.error);
      try {
        visionResult = await analyzeWithVision(imageData, config.apiKey, provider, config.model, retryPrompt);
        evaluation = evaluateVisionResults([{ ...visionResult, provider }], normalizeOptions)[0];
      } catch (error) {
        return { error: `Vision retry failed: ${error.message}` };
      }
    }

    if (!evaluation?.validation?.valid) {
      return {
        error: `Vision returned invalid FEN: ${evaluation?.validation?.error}`,
        fen: visionResult?.fen,
        turn: visionResult?.turn
      };
    }

    // Ensure we analyze for the user's color
    let fenForStockfish = evaluation.fenForStockfish || evaluation.fen;
    let analysisNote = null;

    if (userColor && fenForStockfish) {
      const fenTurn = fenForStockfish.split(' ')[1];
      if (fenTurn && fenTurn !== userColor) {
        // Flip the turn so Stockfish suggests moves for the user's color
        const parts = fenForStockfish.split(' ');
        parts[1] = userColor;
        fenForStockfish = parts.join(' ');
        analysisNote = `Turn adjusted to ${userColor === 'w' ? 'White' : 'Black'} (your color)`;
        console.log('[Chess Study]', analysisNote);
      }
    }

    // Step 2: Stockfish - get best move
    console.log('[Chess Study] Step 2: Getting Stockfish analysis...');

    const fenNormalized = normalizeFEN(fenForStockfish, normalizeOptions);
    console.log('[Chess Study] FEN to analyze:', fenNormalized);

    let moves;
    try {
      moves = await getStockfishMoves(fenNormalized, 18, 5, normalizeOptions);
      console.log('[Chess Study] Stockfish moves:', moves);
    } catch (stockfishError) {
      console.error('[Chess Study] Stockfish error:', stockfishError);
      return {
        error: `Stockfish analysis failed: ${stockfishError.message}\n\nFEN was: ${evaluation.fen}`,
        fen: evaluation.fen,
        fenNormalized,
        turn: evaluation.turn
      };
    }

    // Elo-based move selection
    const { targetElo } = await chrome.storage.sync.get({ targetElo: 1500 });
    const selection = selectHumanMove(moves, targetElo);

    return {
      fen: evaluation.fen,
      fenNormalized,
      turn: userColor || evaluation.turn,
      description: evaluation.description,
      moves: selection.allMoves,
      selectedMove: selection.selected,
      engineBest: selection.engineBest,
      analysisNote,
      source: 'vision'
    };

  } catch (error) {
    console.error('[Chess Study] Analysis error:', error);
    return { error: error.message };
  }
}

// Analyze from user-provided FEN (no Vision)
async function handleFenAnalysis(fenInput) {
  if (!fenInput || typeof fenInput !== 'string') {
    throw new Error('No FEN provided');
  }

  const normalizeOptions = { inferCastlingWhenMissing: true };
  const normalizedFen = normalizeFEN(fenInput, normalizeOptions);
  const validation = validateFEN(normalizedFen);
  if (!validation.valid) {
    throw new Error(`Invalid FEN: ${validation.error}`);
  }

  const moves = await getStockfishMoves(normalizedFen, 18, 5, normalizeOptions);

  // Elo-based move selection
  const { targetElo } = await chrome.storage.sync.get({ targetElo: 1500 });
  const selection = selectHumanMove(moves, targetElo);

  return {
    fen: normalizedFen.split(' ')[0],
    fenNormalized: normalizedFen,
    turn: normalizedFen.split(' ')[1] || 'w',
    moves: selection.allMoves,
    selectedMove: selection.selected,
    engineBest: selection.engineBest
  };
}

// ============================================================================
// CLAUDE VISION
// ============================================================================

async function analyzeWithVision(imageDataUrl, apiKey, provider = 'anthropic', model = 'claude-sonnet-4-5-20250929', promptOverride = null) {
  const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');

  const prompt = promptOverride || buildVisionPrompt();

  let response;
  let data;

  if (provider === 'bigmodel') {
    // BigModel (Zhipu AI) API - OpenAI-compatible format
    response = await fetch(CONFIG.BIGMODEL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errorMsg = err.error?.message || `BigModel API error: ${response.status}`;
      await debugLog('error', 'Vision/BigModel', 'API request failed', { status: response.status, error: err });
      throw new Error(errorMsg);
    }

    data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Log the FULL raw response for debugging
    await debugLog('info', 'Vision/BigModel', 'Raw API response', {
      model: model,
      responseLength: text.length,
      fullResponse: text
    });

    // Parse JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        await debugLog('info', 'Vision/BigModel', 'Parsed result', result);
        if (result.fen === null) {
          await debugLog('warn', 'Vision/BigModel', 'Vision returned null FEN', { error: result.error });
        }
        return {
          fen: result.fen,
          turn: result.turn || (result.fen?.split(' ')[1]) || 'w',
          pieces: result.pieces,
          whitePawns: result.whitePawns,
          blackPawns: result.blackPawns,
          description: result.description,
          confidence: result.confidence,
          visionError: result.error
        };
      } else {
        await debugLog('error', 'Vision/BigModel', 'No JSON found in response', { rawText: text });
      }
    } catch (e) {
      await debugLog('error', 'Vision/BigModel', 'JSON parse error', {
        error: e.message,
        rawText: text
      });
    }

  } else if (provider === 'openrouter') {
    // OpenRouter API
    // Map Anthropic model IDs to OpenRouter format
    let openRouterModel = model;
    if (model.includes('claude-opus-4-5')) {
      openRouterModel = 'anthropic/claude-opus-4';
    } else if (model.includes('claude-sonnet-4-5')) {
      openRouterModel = 'anthropic/claude-sonnet-4';
    } else if (model.includes('claude-haiku-4-5')) {
      openRouterModel = 'anthropic/claude-haiku-4';
    } else if (model.startsWith('claude-')) {
      openRouterModel = `anthropic/${model}`;
    }

    response = await fetch(CONFIG.OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'chrome-extension://chess-study-tool',
        'X-Title': 'Chess Study Tool'
      },
      body: JSON.stringify({
        model: openRouterModel,
        max_tokens: 5000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Data}`
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errorMsg = err.error?.message || `OpenRouter API error: ${response.status}`;
      await debugLog('error', 'Vision/OpenRouter', 'API request failed', { status: response.status, error: err });
      throw new Error(errorMsg);
    }

    data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Log the FULL raw response for debugging
    await debugLog('info', 'Vision/OpenRouter', 'Raw API response', {
      model: openRouterModel,
      responseLength: text.length,
      fullResponse: text
    });

    // Parse JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        await debugLog('info', 'Vision/OpenRouter', 'Parsed result', result);
        if (result.fen === null) {
          await debugLog('warn', 'Vision/OpenRouter', 'Vision returned null FEN', { error: result.error });
        }
        return {
          fen: result.fen,
          turn: result.turn || (result.fen?.split(' ')[1]) || 'w',
          pieces: result.pieces,
          whitePawns: result.whitePawns,
          blackPawns: result.blackPawns,
          description: result.description,
          confidence: result.confidence,
          visionError: result.error
        };
      } else {
        await debugLog('error', 'Vision/OpenRouter', 'No JSON found in response', { rawText: text });
      }
    } catch (e) {
      await debugLog('error', 'Vision/OpenRouter', 'JSON parse error', {
        error: e.message,
        rawText: text
      });
    }

  } else {
    // Anthropic API (direct)
    response = await fetch(CONFIG.CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 5000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Data
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errorMsg = err.error?.message || `Claude API error: ${response.status}`;
      await debugLog('error', 'Vision/Anthropic', 'API request failed', { status: response.status, error: err });
      throw new Error(errorMsg);
    }

    data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Log the FULL raw response for debugging
    await debugLog('info', 'Vision/Anthropic', 'Raw API response', {
      model: model,
      responseLength: text.length,
      fullResponse: text,
      stopReason: data.stop_reason
    });

    // Parse JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        await debugLog('info', 'Vision/Anthropic', 'Parsed result', result);
        if (result.fen === null) {
          await debugLog('warn', 'Vision/Anthropic', 'Vision returned null FEN', { error: result.error });
        }
        return {
          fen: result.fen,
          turn: result.turn || (result.fen?.split(' ')[1]) || 'w',
          pieces: result.pieces,
          whitePawns: result.whitePawns,
          blackPawns: result.blackPawns,
          description: result.description,
          confidence: result.confidence,
          visionError: result.error
        };
      } else {
        await debugLog('error', 'Vision/Anthropic', 'No JSON found in response', { rawText: text });
      }
    } catch (e) {
      await debugLog('error', 'Vision/Anthropic', 'JSON parse error', {
        error: e.message,
        rawText: text
      });
    }
  }

  await debugLog('error', 'Vision', 'Failed to return a valid result - check logs above for details');
  return { fen: null, visionError: 'Failed to parse Vision response - check debug logs' };
}

// ============================================================================
// AUTO-CROP
// ============================================================================

async function handleAutoCrop(imageDataUrl) {
  try {
    await debugLog('info', 'AutoCrop', 'Starting auto-crop detection');

    const settings = await chrome.storage.sync.get({
      anthropicApiKey: '',
      anthropicModel: 'claude-opus-4-5-20251101',
      openrouterApiKey: '',
      openrouterModel: 'google/gemini-3-flash-preview',
      bigmodelApiKey: '',
      bigmodelModel: 'glm-4v',
      defaultProvider: 'anthropic'
    });

    const provider = settings.defaultProvider;
    const providerConfigs = {
      anthropic: { apiKey: settings.anthropicApiKey, model: settings.anthropicModel },
      openrouter: { apiKey: settings.openrouterApiKey, model: settings.openrouterModel },
      bigmodel: { apiKey: settings.bigmodelApiKey, model: settings.bigmodelModel }
    };

    const config = providerConfigs[provider];
    if (!config?.apiKey) {
      return { success: false, error: 'No API key configured' };
    }

    const boundaryPrompt = `Identify the chess board in this screenshot.

Return ONLY JSON with pixel coordinates of the board edges:
{"topLeft": {"x": <number>, "y": <number>}, "bottomRight": {"x": <number>, "y": <number>}}

- topLeft: top-left corner of the chessboard outer edge
- bottomRight: bottom-right corner of the chessboard outer edge
- Use actual pixel coordinates from the image (0,0 is top-left)
- Be precise - the board edges, not individual squares
- If no board found: {"error": "No chess board detected"}`;

    await debugLog('info', 'AutoCrop', 'Requesting boundary detection');

    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    let responseText = '';

    if (provider === 'bigmodel') {
      const resp = await fetch(CONFIG.BIGMODEL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: boundaryPrompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } }
            ]
          }]
        })
      });
      if (!resp.ok) throw new Error(`BigModel API error: ${resp.status}`);
      const data = await resp.json();
      responseText = data.choices?.[0]?.message?.content || '';

    } else if (provider === 'openrouter') {
      let openRouterModel = config.model;
      if (config.model.includes('claude-opus-4-5')) openRouterModel = 'anthropic/claude-opus-4';
      else if (config.model.includes('claude-sonnet-4-5')) openRouterModel = 'anthropic/claude-sonnet-4';
      else if (config.model.includes('claude-haiku-4-5')) openRouterModel = 'anthropic/claude-haiku-4';
      else if (config.model.startsWith('claude-')) openRouterModel = `anthropic/${config.model}`;

      const resp = await fetch(CONFIG.OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'chrome-extension://chess-study-tool',
          'X-Title': 'Chess Study Tool'
        },
        body: JSON.stringify({
          model: openRouterModel,
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } },
              { type: 'text', text: boundaryPrompt }
            ]
          }]
        })
      });
      if (!resp.ok) throw new Error(`OpenRouter API error: ${resp.status}`);
      const data = await resp.json();
      responseText = data.choices?.[0]?.message?.content || '';

    } else {
      // Anthropic direct
      const resp = await fetch(CONFIG.CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: base64Data }
              },
              { type: 'text', text: boundaryPrompt }
            ]
          }]
        })
      });
      if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status}`);
      const data = await resp.json();
      responseText = data.content?.[0]?.text || '';
    }

    await debugLog('info', 'AutoCrop', 'Raw boundary response', responseText);

    // Parse boundary JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: 'No JSON in boundary response' };
    }

    let boundaries;
    try {
      boundaries = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { success: false, error: 'Failed to parse boundary JSON' };
    }

    if (boundaries.error) {
      return { success: false, error: boundaries.error };
    }

    if (!boundaries.topLeft || !boundaries.bottomRight ||
        typeof boundaries.topLeft.x !== 'number' || typeof boundaries.topLeft.y !== 'number' ||
        typeof boundaries.bottomRight.x !== 'number' || typeof boundaries.bottomRight.y !== 'number') {
      await debugLog('error', 'AutoCrop', 'Invalid boundary format', boundaries);
      return { success: false, error: 'Invalid boundary coordinates' };
    }

    await debugLog('info', 'AutoCrop', 'Cropping image', boundaries);

    const croppedImage = await cropImageData(
      imageDataUrl,
      boundaries.topLeft.x,
      boundaries.topLeft.y,
      boundaries.bottomRight.x,
      boundaries.bottomRight.y
    );

    await debugLog('info', 'AutoCrop', 'Image cropped successfully');
    return { success: true, croppedImage, boundaries };

  } catch (error) {
    console.error('[Chess Study] Auto-crop error:', error);
    await debugLog('error', 'AutoCrop', 'Exception', error.message);
    return { success: false, error: error.message };
  }
}

async function cropImageData(dataUrl, x1, y1, x2, y2) {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: 'image/png' });
  const imageBitmap = await createImageBitmap(blob);

  const startX = Math.max(0, Math.min(x1, x2));
  const startY = Math.max(0, Math.min(y1, y2));
  const width = Math.min(imageBitmap.width - startX, Math.abs(x2 - x1));
  const height = Math.min(imageBitmap.height - startY, Math.abs(y2 - y1));

  if (width <= 0 || height <= 0) {
    throw new Error('Invalid crop dimensions');
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, startX, startY, width, height, 0, 0, width, height);

  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(croppedBlob);
  });
}

// ============================================================================
// STOCKFISH (Chess-API.com)
// ============================================================================

// Validate FEN string format
function validateFEN(fen) {
  if (!fen || typeof fen !== 'string') {
    return { valid: false, error: 'FEN is empty or not a string' };
  }

  const parts = fen.trim().split(' ');

  // Must have at least position and turn
  if (parts.length < 2) {
    return { valid: false, error: `FEN should have at least 2 parts, got ${parts.length}` };
  }

  // Validate board position (first part)
  const board = parts[0];
  const ranks = board.split('/');

  if (ranks.length !== 8) {
    return { valid: false, error: `Board should have 8 ranks, got ${ranks.length}` };
  }

  // Count pieces
  let whiteKings = 0, blackKings = 0;
  let whitePawns = 0, blackPawns = 0;
  let whitePieces = 0, blackPieces = 0;

  // Validate each rank
  for (let i = 0; i < 8; i++) {
    const rank = ranks[i];
    const rankNum = 8 - i; // Rank 8 is index 0, rank 1 is index 7
    let squares = 0;

    for (const char of rank) {
      if ('12345678'.includes(char)) {
        squares += parseInt(char);
      } else if ('pnbrqkPNBRQK'.includes(char)) {
        squares += 1;
        if (char === char.toUpperCase()) whitePieces++;
        else blackPieces++;
        if (char === 'K') whiteKings++;
        if (char === 'k') blackKings++;
        if (char === 'P') {
          whitePawns++;
          // Pawns can't be on rank 1 or 8
          if (rankNum === 1 || rankNum === 8) {
            return { valid: false, error: `White pawn on rank ${rankNum} is illegal` };
          }
        }
        if (char === 'p') {
          blackPawns++;
          // Pawns can't be on rank 1 or 8
          if (rankNum === 1 || rankNum === 8) {
            return { valid: false, error: `Black pawn on rank ${rankNum} is illegal` };
          }
        }
      } else {
        return { valid: false, error: `Invalid character '${char}' in rank ${rankNum}` };
      }
    }

    if (squares !== 8) {
      return { valid: false, error: `Rank ${rankNum} has ${squares} squares, should have 8` };
    }
  }

  // Must have exactly one king of each color
  if (whiteKings !== 1) {
    return { valid: false, error: `Must have exactly 1 white King, found ${whiteKings}` };
  }
  if (blackKings !== 1) {
    return { valid: false, error: `Must have exactly 1 black King, found ${blackKings}` };
  }

  // Maximum 8 pawns per side
  if (whitePawns > 8) {
    return { valid: false, error: `White has ${whitePawns} pawns, maximum is 8` };
  }
  if (blackPawns > 8) {
    return { valid: false, error: `Black has ${blackPawns} pawns, maximum is 8` };
  }

  // Maximum 16 pieces per side (promotions do not increase total piece count)
  if (whitePieces > 16) {
    return { valid: false, error: `White has ${whitePieces} pieces, maximum is 16` };
  }
  if (blackPieces > 16) {
    return { valid: false, error: `Black has ${blackPieces} pieces, maximum is 16` };
  }

  // Validate turn
  if (parts[1] && !['w', 'b'].includes(parts[1])) {
    return { valid: false, error: `Invalid turn '${parts[1]}', should be 'w' or 'b'` };
  }

  return { valid: true };
}

// Validate pieces array from Vision response
function validatePiecesArray(pieces) {
  if (!Array.isArray(pieces) || pieces.length === 0) {
    return { valid: false, error: 'Pieces array is empty or not an array' };
  }

  const validPieces = 'pnbrqkPNBRQK';
  const seen = new Set();
  let whiteKings = 0, blackKings = 0;
  let whitePawns = 0, blackPawns = 0;
  const cleaned = [];

  for (const entry of pieces) {
    if (!entry || typeof entry.square !== 'string' || typeof entry.piece !== 'string') continue;

    const sq = entry.square.toLowerCase().trim();
    const pc = entry.piece.trim();

    // Validate square format (a1-h8)
    if (sq.length !== 2 || sq[0] < 'a' || sq[0] > 'h' || sq[1] < '1' || sq[1] > '8') continue;

    // Validate piece letter
    if (pc.length !== 1 || !validPieces.includes(pc)) continue;

    // Skip duplicates
    if (seen.has(sq)) continue;
    seen.add(sq);

    const rank = parseInt(sq[1], 10);

    if (pc === 'K') whiteKings++;
    if (pc === 'k') blackKings++;
    if (pc === 'P') {
      whitePawns++;
      if (rank === 1 || rank === 8) {
        return { valid: false, error: `White pawn on rank ${rank} is illegal` };
      }
    }
    if (pc === 'p') {
      blackPawns++;
      if (rank === 1 || rank === 8) {
        return { valid: false, error: `Black pawn on rank ${rank} is illegal` };
      }
    }

    cleaned.push({ square: sq, piece: pc });
  }

  if (cleaned.length === 0) {
    return { valid: false, error: 'No valid piece entries found' };
  }
  if (whiteKings !== 1) {
    return { valid: false, error: `Must have exactly 1 white King, found ${whiteKings}` };
  }
  if (blackKings !== 1) {
    return { valid: false, error: `Must have exactly 1 black King, found ${blackKings}` };
  }
  if (whitePawns > 8) {
    return { valid: false, error: `White has ${whitePawns} pawns, maximum is 8` };
  }
  if (blackPawns > 8) {
    return { valid: false, error: `Black has ${blackPawns} pawns, maximum is 8` };
  }

  return { valid: true, pieces: cleaned };
}

// Build FEN string from validated pieces array
function buildFENFromPieces(pieces, turn = 'w') {
  // Create empty 8x8 board
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));

  // Place pieces
  for (const { square, piece } of pieces) {
    const file = square.charCodeAt(0) - 97; // a=0..h=7
    const rank = parseInt(square[1], 10) - 1; // 0..7
    board[rank][file] = piece;
  }

  // Build FEN board string (rank 8 first = index 7, down to rank 1 = index 0)
  const rankStrings = [];
  for (let r = 7; r >= 0; r--) {
    let rankStr = '';
    let emptyCount = 0;
    for (let f = 0; f < 8; f++) {
      if (board[r][f] === null) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rankStr += emptyCount;
          emptyCount = 0;
        }
        rankStr += board[r][f];
      }
    }
    if (emptyCount > 0) rankStr += emptyCount;
    rankStrings.push(rankStr);
  }

  const boardPart = rankStrings.join('/');
  const castling = inferCastlingRightsFromPosition(boardPart);
  const safeTurn = ['w', 'b'].includes(turn) ? turn : 'w';

  return `${boardPart} ${safeTurn} ${castling} - 0 1`;
}

function getFenPieceAtSquare(boardPart, square) {
  if (!boardPart || !square || square.length !== 2) return null;

  const file = square.charCodeAt(0) - 97; // a=0..h=7
  const rank = parseInt(square[1], 10); // 1..8
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;

  const ranks = boardPart.split('/');
  if (ranks.length !== 8) return null;

  const rankStr = ranks[8 - rank];
  let col = 0;
  for (const ch of rankStr) {
    if ('12345678'.includes(ch)) {
      col += parseInt(ch, 10);
    } else {
      if (col === file) return ch;
      col += 1;
    }
    if (col > file) break;
  }

  return null;
}

function inferCastlingRightsFromPosition(boardPart) {
  const rights = [];

  // White
  if (getFenPieceAtSquare(boardPart, 'e1') === 'K') {
    if (getFenPieceAtSquare(boardPart, 'h1') === 'R') rights.push('K');
    if (getFenPieceAtSquare(boardPart, 'a1') === 'R') rights.push('Q');
  }

  // Black
  if (getFenPieceAtSquare(boardPart, 'e8') === 'k') {
    if (getFenPieceAtSquare(boardPart, 'h8') === 'r') rights.push('k');
    if (getFenPieceAtSquare(boardPart, 'a8') === 'r') rights.push('q');
  }

  return rights.length ? rights.join('') : '-';
}

// Ensure FEN has all 6 fields with valid values
function normalizeFEN(fen, options = {}) {
  if (!fen || typeof fen !== 'string') return '';

  const inferCastlingWhenMissing = options.inferCastlingWhenMissing !== false;
  const parts = fen.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';

  // Default values for missing or invalid parts
  const position = parts[0];
  const turn = ['w', 'b'].includes(parts[1]) ? parts[1] : 'w';

  // Castling:
  // - If missing entirely, optionally infer from kings/rooks on starting squares
  // - If present, validate or default to '-'
  let castling = '-';
  const hasCastlingField = parts.length >= 3;
  if (hasCastlingField) {
    if (parts[2] && parts[2] !== '-') {
      const validCastling = parts[2].split('').filter(c => 'KQkq'.includes(c)).join('');
      castling = validCastling || '-';
    } else {
      castling = '-';
    }
  } else if (inferCastlingWhenMissing) {
    castling = inferCastlingRightsFromPosition(position);
  }

  // En passant - validate or default to '-'
  let enPassant = '-';
  if (parts[3] && /^[a-h][36]$/.test(parts[3])) {
    enPassant = parts[3];
  }

  // Move counters - ensure they're valid numbers
  const halfmove = /^\d+$/.test(parts[4]) ? parts[4] : '0';
  const fullmove = /^\d+$/.test(parts[5]) ? parts[5] : '1';

  return `${position} ${turn} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
}

function buildFenForAnalysis(result, normalizeOptions = {}) {
  if (!result?.fen || typeof result.fen !== 'string') {
    return null;
  }

  const raw = result.fen.trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split(' ');
  let fenWithTurn = raw;
  if (parts.length === 1) {
    const turn = ['w', 'b'].includes(result.turn) ? result.turn : 'w';
    fenWithTurn = `${raw} ${turn}`;
  }

  return {
    raw,
    fenWithTurn,
    normalized: normalizeFEN(fenWithTurn, normalizeOptions)
  };
}

function confidenceScore(confidence) {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function evaluateVisionResults(results, normalizeOptions = {}) {
  return results.map((result) => {
    const fenData = buildFenForAnalysis(result, normalizeOptions);
    const fenValidation = fenData ? validateFEN(fenData.normalized) : null;

    // Try building FEN from pieces array for comparison
    let piecesResult = null;
    if (result.pieces) {
      const piecesValidation = validatePiecesArray(result.pieces);
      if (piecesValidation.valid) {
        const rebuiltFen = buildFENFromPieces(piecesValidation.pieces, result.turn);
        const rebuiltValidation = validateFEN(rebuiltFen);
        if (rebuiltValidation.valid) {
          piecesResult = { fen: rebuiltFen, validation: rebuiltValidation };
        }
      }
    }

    // Log both for debugging
    const fenBoard = fenData?.normalized?.split(' ')[0] || '(none)';
    const piecesBoard = piecesResult?.fen?.split(' ')[0] || '(none)';
    const match = fenBoard === piecesBoard;
    console.log('[Chess Study] FEN comparison — match:', match);
    console.log('[Chess Study]   FEN string:', fenBoard);
    console.log('[Chess Study]   Pieces arr:', piecesBoard);

    // If both valid and agree, high confidence — use FEN string
    if (fenValidation?.valid && piecesResult && match) {
      console.log('[Chess Study] FEN and pieces array agree');
      return {
        ...result,
        fenForStockfish: fenData.fenWithTurn,
        normalizedFen: fenData.normalized,
        validation: fenValidation,
        recoveryMethod: null
      };
    }

    // If both valid but disagree, prefer pieces array (explicit coordinates)
    if (fenValidation?.valid && piecesResult && !match) {
      console.log('[Chess Study] FEN and pieces disagree — using pieces array');
      return {
        ...result,
        fenForStockfish: piecesResult.fen,
        normalizedFen: piecesResult.fen,
        validation: piecesResult.validation,
        recoveryMethod: 'pieces-array'
      };
    }

    // Only FEN valid
    if (fenValidation?.valid) {
      return {
        ...result,
        fenForStockfish: fenData.fenWithTurn,
        normalizedFen: fenData.normalized,
        validation: fenValidation,
        recoveryMethod: null
      };
    }

    // Only pieces array valid
    if (piecesResult) {
      console.log('[Chess Study] FEN invalid, using pieces array');
      return {
        ...result,
        fenForStockfish: piecesResult.fen,
        normalizedFen: piecesResult.fen,
        validation: piecesResult.validation,
        recoveryMethod: 'pieces-array'
      };
    }

    // Neither valid
    return {
      ...result,
      fenForStockfish: fenData?.fenWithTurn || null,
      normalizedFen: fenData?.normalized || null,
      validation: fenValidation || { valid: false, error: 'No FEN provided' },
      recoveryMethod: null
    };
  });
}

// ============================================================================
// ELO-BASED MOVE SELECTION (Anti-detection)
// ============================================================================

function selectHumanMove(moves, targetElo) {
  // Pass through if 0-1 moves available
  if (!moves || moves.length <= 1) {
    const only = moves?.[0] || null;
    return { selected: only, engineBest: only, allMoves: moves || [] };
  }

  const engineBest = moves[0];

  // Always pick mate moves — no human avoids forced mate
  if (typeof engineBest.evaluation === 'string' && engineBest.evaluation.startsWith('M')) {
    return { selected: engineBest, engineBest, allMoves: moves };
  }

  // Compute centipawn losses relative to best move
  const bestCp = typeof engineBest.evaluation === 'number' ? engineBest.evaluation * 100 : 0;
  const losses = moves.map(m => {
    const cp = typeof m.evaluation === 'number' ? m.evaluation * 100 : 0;
    return Math.max(0, bestCp - cp);
  });

  // Temperature from Elo with ±15% jitter
  const baseTemp = Math.max(5, 200 - 0.08 * targetElo);
  const tau = baseTemp * (0.85 + Math.random() * 0.30);

  // Softmax probabilities
  const weights = losses.map(l => Math.exp(-l / tau));
  const sum = weights.reduce((a, b) => a + b, 0);
  const probs = weights.map(w => w / sum);

  // Sample from cumulative distribution
  const roll = Math.random();
  let cumulative = 0;
  let selectedIndex = 0;
  for (let i = 0; i < probs.length; i++) {
    cumulative += probs[i];
    if (roll <= cumulative) {
      selectedIndex = i;
      break;
    }
  }

  const selected = moves[selectedIndex];
  console.log(`[Chess Study] Elo ${targetElo}, τ=${tau.toFixed(1)}, picked move #${selectedIndex + 1}/${moves.length} (${selected.move}, loss=${losses[selectedIndex].toFixed(0)}cp)`);

  return { selected, engineBest, allMoves: moves };
}

async function getStockfishMoves(fen, depth, numMoves, normalizeOptions = {}) {
  console.log('[Chess Study] Raw FEN from Vision:', fen);

  // Normalize FEN first to ensure all 6 fields with valid values
  // This handles cases where Vision API returns only the piece placement part
  const normalizedFEN = normalizeFEN(fen, normalizeOptions);
  console.log('[Chess Study] Normalized FEN:', normalizedFEN);

  // Validate the normalized FEN
  const validation = validateFEN(normalizedFEN);
  if (!validation.valid) {
    console.error('[Chess Study] FEN validation failed:', validation.error);
    throw new Error(`Invalid FEN: ${validation.error}`);
  }

  const targetMoves = Math.min(numMoves, 5);

  // Try Lichess Cloud Eval first (supports multiple variations)
  try {
    const moves = await getLichessCloudEval(normalizedFEN, targetMoves);
    if (moves.length > 0) {
      console.log(`[Chess Study] Got ${moves.length} moves from Lichess`);
      return moves;
    }
  } catch (lichessError) {
    console.warn('[Chess Study] Lichess API failed:', lichessError.message);

    // If position not in database or rate limited, try fallback
    if (lichessError.message.includes('not in Lichess') ||
        lichessError.message.includes('Rate limited')) {
      console.log('[Chess Study] Falling back to Chess-API.com (1 move only)');
    }
  }

  // Fallback to Chess-API.com (only returns 1 move)
  console.log('[Chess Study] Using Chess-API fallback');
  const fallbackMoves = await getChessApiMove(normalizedFEN, depth);
  if (fallbackMoves.length > 0) {
    console.log('[Chess Study] Got 1 move from Chess-API fallback');
  }
  return fallbackMoves;
}

// Rate limiting state for Lichess
let lichessLastRequest = 0;
let lichessBackoffUntil = 0;
const LICHESS_MIN_INTERVAL = 1000; // 1 second between requests
const LICHESS_BACKOFF_TIME = 60000; // 1 minute backoff on 429

// Lichess Cloud Eval API - supports multiple principal variations
async function getLichessCloudEval(fen, numMoves, retryCount = 0) {
  const now = Date.now();

  // Check if we're in backoff period
  if (now < lichessBackoffUntil) {
    const waitTime = Math.ceil((lichessBackoffUntil - now) / 1000);
    throw new Error(`Rate limited. Please wait ${waitTime}s before next analysis.`);
  }

  // Ensure minimum interval between requests
  const timeSinceLastRequest = now - lichessLastRequest;
  if (timeSinceLastRequest < LICHESS_MIN_INTERVAL) {
    const delay = LICHESS_MIN_INTERVAL - timeSinceLastRequest;
    console.log(`[Chess Study] Waiting ${delay}ms before Lichess request`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  lichessLastRequest = Date.now();
  const url = `${CONFIG.LICHESS_CLOUD_EVAL_URL}?fen=${encodeURIComponent(fen)}&multiPv=${numMoves}`;
  console.log('[Chess Study] Lichess request:', url);

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 429) {
      lichessBackoffUntil = Date.now() + LICHESS_BACKOFF_TIME;
      console.warn('[Chess Study] Rate limited by Lichess, backing off for 60s');

      // Retry once after backoff if this is the first attempt
      if (retryCount === 0) {
        throw new Error('Rate limited by Lichess. Will use fallback.');
      }
      throw new Error('Rate limited by Lichess. Please wait a minute.');
    }
    if (response.status === 404) {
      throw new Error('Position not in Lichess cloud database');
    }
    throw new Error(`Lichess API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Chess Study] Lichess response:', JSON.stringify(data, null, 2));

  if (!data.pvs || !Array.isArray(data.pvs) || data.pvs.length === 0) {
    throw new Error('No analysis available from Lichess');
  }

  const moves = data.pvs.map((pv, index) => {
    const moveList = pv.moves.split(' ');
    const firstMove = moveList[0]; // UCI format: e2e4, f1b5, etc.
    const from = firstMove.substring(0, 2);
    const to = firstMove.substring(2, 4);
    const promotion = firstMove.length > 4 ? firstMove[4] : null;

    // Convert centipawns to pawns (or handle mate)
    let evaluation;
    if (pv.mate !== undefined && pv.mate !== null) {
      evaluation = pv.mate > 0 ? `M${pv.mate}` : `M${pv.mate}`;
    } else {
      evaluation = (pv.cp || 0) / 100;
    }

    return {
      move: firstMove,
      san: firstMove, // We don't have SAN from Lichess, will show UCI
      from: from,
      to: to,
      promotion: promotion,
      evaluation: evaluation,
      depth: data.depth || 0,
      continuation: moveList,
      continuationArr: moveList,
      winChance: cpToWinChance(pv.cp || 0)
    };
  });

  console.log('[Chess Study] Parsed Lichess moves:', moves);
  return moves;
}

// Convert centipawns to win chance percentage
function cpToWinChance(cp) {
  // Using the standard formula: 50 + 50 * (2 / (1 + exp(-0.004 * cp)) - 1)
  return 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1);
}

// Fallback: Chess-API.com (only returns 1 move)
async function getChessApiMove(fen, depth) {
  console.log('[Chess Study] Using Chess-API fallback');

  const requestBody = {
    fen: fen,
    depth: Math.min(depth, 18),
    maxThinkingTime: 100
  };

  const response = await fetch(CONFIG.CHESS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Chess API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.type && data.type.includes('ERROR')) {
    throw new Error(`${data.text || data.type}`);
  }

  if (data && (data.move || data.lan || data.san)) {
    return [normalizeMove(data)];
  }

  return [];
}

function normalizeMove(d) {
  console.log('[Chess Study] Normalizing move:', JSON.stringify(d));

  // Handle string input (just the move notation)
  if (typeof d === 'string') {
    return {
      move: d,
      san: d,
      from: d.substring(0, 2),
      to: d.substring(2, 4),
      evaluation: 0,
      depth: 0,
      continuation: [],
      winChance: null
    };
  }

  // Build the move string from from/to if available
  let moveStr = d.move || d.lan || '';
  let fromSquare = d.from || '';
  let toSquare = d.to || '';

  // If we have from/to but no move string, build it
  if (!moveStr && fromSquare && toSquare) {
    moveStr = fromSquare + toSquare;
  }

  // If we have move string but no from/to, parse it
  if (moveStr && moveStr.length >= 4 && !fromSquare) {
    fromSquare = moveStr.substring(0, 2);
    toSquare = moveStr.substring(2, 4);
  }

  // Handle object input
  return {
    move: moveStr,
    san: d.san || d.move || d.lan || '',
    from: fromSquare,
    to: toSquare,
    evaluation: d.eval ?? d.score ?? d.evaluation ?? (d.centipawns ? d.centipawns / 100 : 0),
    depth: d.depth || 0,
    continuation: d.continuationArr || d.continuation || (d.pv ? d.pv.split(' ') : []),
    winChance: d.winChance ?? d.wdl ?? null
  };
}

// ============================================================================
// INIT
// ============================================================================

console.log('[Chess Study Tool] Service worker initialized - standalone learning tool');

// ============================================================================
// API TEST FUNCTIONS
// ============================================================================

async function testAnthropicAPI(apiKey, provider = 'anthropic') {
  console.log('[Chess Study] Testing API...', provider);

  try {
    if (provider === 'openrouter') {
      // OpenRouter API test
      const response = await fetch(CONFIG.OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'chrome-extension://chess-study-tool',
          'X-Title': 'Chess Study Tool'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-haiku',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }]
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[Chess Study] OpenRouter test failed:', err);
        return { success: false, error: err.error?.message || `HTTP ${response.status}` };
      }

      const data = await response.json();
      console.log('[Chess Study] OpenRouter test success:', data);
      return { success: true, response: data.choices?.[0]?.message?.content };

    } else {
      // Anthropic API test
      const response = await fetch(CONFIG.CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: CONFIG.CLAUDE_MODEL,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }]
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[Chess Study] Anthropic test failed:', err);
        return { success: false, error: err.error?.message || `HTTP ${response.status}` };
      }

      const data = await response.json();
      console.log('[Chess Study] Anthropic test success:', data);
      return { success: true, response: data.content?.[0]?.text };
    }

  } catch (error) {
    console.error('[Chess Study] API test error:', error);
    return { success: false, error: error.message };
  }
}

async function testStockfishAPI() {
  console.log('[Chess Study] Testing Stockfish APIs...');

  // Test with a common position that should be in Lichess cloud
  const testFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

  // Try Lichess first
  try {
    const lichessUrl = `${CONFIG.LICHESS_CLOUD_EVAL_URL}?fen=${encodeURIComponent(testFen)}&multiPv=3`;
    const lichessResponse = await fetch(lichessUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (lichessResponse.ok) {
      const data = await lichessResponse.json();
      console.log('[Chess Study] Lichess test success:', data);
      const moveCount = data.pvs?.length || 0;
      return { success: true, move: `Lichess OK (${moveCount} variations)` };
    }
  } catch (lichessError) {
    console.warn('[Chess Study] Lichess test failed:', lichessError.message);
  }

  // Fallback to Chess-API.com
  try {
    const response = await fetch(CONFIG.CHESS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fen: testFen,
        depth: 10,
        maxThinkingTime: 100
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Chess Study] Chess-API test failed:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    console.log('[Chess Study] Chess-API test success:', data);

    // Extract the move from response
    let move = 'Chess-API OK';
    if (data.san || data.move) {
      move = `Chess-API: ${data.san || data.move}`;
    }

    return { success: true, move };

  } catch (error) {
    console.error('[Chess Study] Stockfish test error:', error);
    return { success: false, error: error.message };
  }
}
