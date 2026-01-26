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
  CHESS_API_URL: 'https://chess-api.com/v1',
  CLAUDE_API_URL: 'https://api.anthropic.com/v1/messages',
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
  CLAUDE_MODEL: 'claude-sonnet-4-5-20250929'
};

// Track the panel window
let panelWindowId = null;
let targetWindowId = null; // The window to capture (where user was before opening panel)

// ============================================================================
// EXTENSION ICON CLICK - Open persistent window
// ============================================================================

chrome.action.onClicked.addListener(async (tab) => {
  // Store the window the user was on (the one with the chess board)
  targetWindowId = tab.windowId;
  
  // Check if panel window already exists
  if (panelWindowId !== null) {
    try {
      const existingWindow = await chrome.windows.get(panelWindowId);
      // Window exists, focus it
      await chrome.windows.update(panelWindowId, { focused: true });
      return;
    } catch (e) {
      // Window was closed, reset ID
      panelWindowId = null;
    }
  }
  
  // Create new panel window (positioned on right side)
  const panelWindow = await chrome.windows.create({
    url: chrome.runtime.getURL('src/panel/panel.html'),
    type: 'popup',
    width: 450,
    height: 700,
    top: 100,
    left: 1400  // Fixed position - will be on right side of most screens
  });
  
  panelWindowId = panelWindow.id;
});

// Clean up when panel window is closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === panelWindowId) {
    panelWindowId = null;
  }
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
    handleAnalysis(message.imageData)
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
  
  return false;
});

// ============================================================================
// SCREENSHOT CAPTURE
// ============================================================================

async function handleCapture(sendResponse) {
  try {
    // Use the stored target window (where the chess board is)
    // If no target window stored, try to find a suitable window
    let windowIdToCapture = targetWindowId;
    
    if (!windowIdToCapture) {
      // Find the most recent non-panel window
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
      const nonPanelWindows = windows.filter(w => w.id !== panelWindowId);
      if (nonPanelWindows.length > 0) {
        // Use the first (most recent) normal window
        windowIdToCapture = nonPanelWindows[0].id;
      }
    }
    
    if (!windowIdToCapture) {
      sendResponse({ success: false, error: 'No window to capture. Please open a browser window with a chess position.' });
      return;
    }
    
    // Capture the visible area of the target window
    const imageData = await chrome.tabs.captureVisibleTab(windowIdToCapture, {
      format: 'png',
      quality: 100
    });
    
    console.log('[Chess Study] Screenshot captured from window', windowIdToCapture);
    sendResponse({ success: true, imageData });
    
  } catch (error) {
    console.error('[Chess Study] Capture error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ============================================================================
// ANALYSIS PIPELINE
// ============================================================================

async function handleAnalysis(imageData) {
  try {
    // Get settings
    const settings = await chrome.storage.sync.get({
      claudeApiKey: '',
      apiProvider: 'anthropic',
      apiModel: 'claude-sonnet-4-5-20250929',
      numMoves: 5,
      depth: 18
    });
    
    if (!settings.claudeApiKey) {
      return { error: 'API key not configured' };
    }
    
    // Step 1: Claude Vision - recognize the position
    console.log('[Chess Study] Step 1: Analyzing with Vision...');
    let visionResult;
    try {
      visionResult = await analyzeWithVision(imageData, settings.claudeApiKey, settings.apiProvider, settings.apiModel);
      console.log('[Chess Study] Vision result:', visionResult);
    } catch (visionError) {
      console.error('[Chess Study] Vision error:', visionError);
      return { error: 'Vision analysis failed: ' + visionError.message };
    }
    
    if (!visionResult.fen) {
      return { 
        error: 'Could not recognize a chess position in the screenshot. Make sure a chess board is visible.',
        ...visionResult
      };
    }
    
    // Step 2: Stockfish - get best moves
    console.log('[Chess Study] Step 2: Getting Stockfish analysis...');
    console.log('[Chess Study] FEN to analyze:', visionResult.fen);
    let moves;
    try {
      moves = await getStockfishMoves(visionResult.fen, settings.depth, settings.numMoves);
      console.log('[Chess Study] Stockfish moves:', moves);
    } catch (stockfishError) {
      console.error('[Chess Study] Stockfish error:', stockfishError);
      return { 
        error: `Stockfish analysis failed: ${stockfishError.message}\n\nFEN was: ${visionResult.fen}`,
        fen: visionResult.fen,
        turn: visionResult.turn
      };
    }
    
    // Step 3: Claude - get explanation
    console.log('[Chess Study] Step 3: Getting explanation...');
    let explanation;
    try {
      explanation = await getExplanation(visionResult.fen, moves, settings.claudeApiKey, settings.apiProvider, settings.apiModel);
      console.log('[Chess Study] Explanation:', explanation);
    } catch (explainError) {
      console.error('[Chess Study] Explanation error:', explainError);
      explanation = 'Could not generate explanation.';
    }
    
    const result = {
      fen: visionResult.fen,
      turn: visionResult.turn,
      description: visionResult.description,
      moves,
      explanation
    };
    
    console.log('[Chess Study] Final result:', result);
    return result;
    
  } catch (error) {
    console.error('[Chess Study] Analysis error:', error);
    return { error: error.message };
  }
}

// ============================================================================
// CLAUDE VISION
// ============================================================================

async function analyzeWithVision(imageDataUrl, apiKey, provider = 'anthropic', model = 'claude-sonnet-4-5-20250929') {
  const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  
  const prompt = `You are a chess position analyzer. Look at this screenshot and find any chess board visible.

Your task:
1. Locate the chess board in the image (it could be from any website, app, or even a physical board)
2. Carefully identify every piece and its exact square
3. Determine whose turn it is (look for visual cues like clocks, highlights, or turn indicators)
4. Convert the position to FEN notation

PIECE IDENTIFICATION:
- White pieces: K (King), Q (Queen), R (Rook), B (Bishop), N (Knight), P (Pawn) - usually lighter colored
- Black pieces: k, q, r, b, n, p - usually darker colored
- Be careful to distinguish between Bishops and Pawns, and between Knights and other pieces

BOARD ORIENTATION:
- Standard view: White pieces start on ranks 1-2, Black on ranks 7-8
- If viewing from Black's side, mentally flip the board
- The a1 square is always dark (from White's perspective, bottom-left)

FEN FORMAT REQUIREMENTS:
The FEN string MUST have exactly 6 space-separated parts:
1. Piece placement (8 ranks separated by /, using letters for pieces and numbers 1-8 for empty squares)
2. Active color: "w" or "b"
3. Castling availability: combination of "K", "Q", "k", "q" or "-" if none
4. En passant target square: like "e3" or "-" if none
5. Halfmove clock: a number (use "0" if unknown)
6. Fullmove number: a number (use "1" if unknown)

OUTPUT FORMAT (JSON only, no other text):
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "turn": "b",
  "description": "King's Pawn Opening after 1.e4",
  "confidence": "high"
}

If NO chess board is found:
{
  "fen": null,
  "error": "No chess board detected in screenshot"
}

CRITICAL: Each rank in the FEN must sum to exactly 8 (pieces + empty squares).
Example: "rnbqkbnr" = 8 pieces, "4P3" = 4+1+3 = 8, "8" = 8 empty squares.`;

  let response;
  let data;
  
  if (provider === 'openrouter') {
    // OpenRouter API
    // Map Anthropic model IDs to OpenRouter format
    let openRouterModel = model;
    if (model.includes('claude-sonnet-4-5')) {
      openRouterModel = 'anthropic/claude-sonnet-4.5';
    } else if (model.includes('claude-haiku-4-5')) {
      openRouterModel = 'anthropic/claude-haiku-4.5';
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
        max_tokens: 1000,
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
      throw new Error(err.error?.message || `OpenRouter API error: ${response.status}`);
    }

    data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          fen: result.fen,
          turn: result.turn || (result.fen?.split(' ')[1]) || 'w',
          description: result.description,
          confidence: result.confidence
        };
      }
    } catch (e) {
      console.error('[Chess Study] Vision parse error:', e);
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
        max_tokens: 1000,
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
      throw new Error(err.error?.message || `Claude API error: ${response.status}`);
    }

    data = await response.json();
    const text = data.content?.[0]?.text || '';
    console.log('[Chess Study] Vision raw response:', text);
    
    // Parse JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log('[Chess Study] Vision parsed FEN:', result.fen);
        return {
          fen: result.fen,
          turn: result.turn || (result.fen?.split(' ')[1]) || 'w',
          description: result.description,
          confidence: result.confidence
        };
      }
    } catch (e) {
      console.error('[Chess Study] Vision parse error:', e);
    }
  }
  
  return { fen: null };
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
  
  // Count kings
  let whiteKings = 0;
  let blackKings = 0;
  
  // Validate each rank
  for (let i = 0; i < 8; i++) {
    const rank = ranks[i];
    let squares = 0;
    
    for (const char of rank) {
      if ('12345678'.includes(char)) {
        squares += parseInt(char);
      } else if ('pnbrqkPNBRQK'.includes(char)) {
        squares += 1;
        if (char === 'K') whiteKings++;
        if (char === 'k') blackKings++;
      } else {
        return { valid: false, error: `Invalid character '${char}' in rank ${8 - i}` };
      }
    }
    
    if (squares !== 8) {
      return { valid: false, error: `Rank ${8 - i} has ${squares} squares, should have 8` };
    }
  }
  
  // Must have exactly one king of each color
  if (whiteKings !== 1) {
    return { valid: false, error: `Must have exactly 1 white King, found ${whiteKings}` };
  }
  if (blackKings !== 1) {
    return { valid: false, error: `Must have exactly 1 black King, found ${blackKings}` };
  }
  
  // Validate turn
  if (parts[1] && !['w', 'b'].includes(parts[1])) {
    return { valid: false, error: `Invalid turn '${parts[1]}', should be 'w' or 'b'` };
  }
  
  return { valid: true };
}

// Ensure FEN has all 6 fields with valid values
function normalizeFEN(fen) {
  const parts = fen.trim().split(' ');
  
  // Default values for missing or invalid parts
  const position = parts[0];
  const turn = ['w', 'b'].includes(parts[1]) ? parts[1] : 'w';
  
  // Castling - validate or default to '-'
  let castling = '-';
  if (parts[2] && parts[2] !== '-') {
    const validCastling = parts[2].split('').filter(c => 'KQkq'.includes(c)).join('');
    castling = validCastling || '-';
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

async function getStockfishMoves(fen, depth, numMoves) {
  console.log('[Chess Study] Raw FEN from Vision:', fen);
  
  // Validate FEN
  const validation = validateFEN(fen);
  if (!validation.valid) {
    console.error('[Chess Study] FEN validation failed:', validation.error);
    throw new Error(`Invalid FEN: ${validation.error}`);
  }
  
  // Normalize FEN to ensure all 6 fields with valid values
  const normalizedFEN = normalizeFEN(fen);
  console.log('[Chess Study] Normalized FEN:', normalizedFEN);
  
  const requestBody = {
    fen: normalizedFEN,
    depth: Math.min(depth, 18),
    variants: Math.min(numMoves, 5),
    maxThinkingTime: 100
  };
  console.log('[Chess Study] Request body:', JSON.stringify(requestBody));
  
  const response = await fetch(CONFIG.CHESS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Chess Study] Stockfish API error:', response.status, errorText);
    throw new Error(`Stockfish API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Chess Study] Raw Stockfish response:', JSON.stringify(data));
  
  // Check for error response from chess-api.com
  if (data.type && data.type.includes('ERROR')) {
    console.error('[Chess Study] Chess API returned error:', data.type, data.text);
    console.error('[Chess Study] FEN that caused error:', normalizedFEN);
    throw new Error(`${data.text || data.type}\nFEN: ${normalizedFEN}`);
  }
  
  // Handle various response formats from Chess-API.com
  const moves = [];
  
  // Format 1: Array of moves
  if (Array.isArray(data)) {
    console.log('[Chess Study] Response is array with', data.length, 'items');
    data.forEach(d => moves.push(normalizeMove(d)));
  } 
  // Format 2: Single move object with 'move' or 'lan' property
  else if (data && (data.move || data.lan || data.san)) {
    console.log('[Chess Study] Response is single move object');
    moves.push(normalizeMove(data));
  }
  // Format 3: Object with nested data
  else if (data && data.data) {
    console.log('[Chess Study] Response has nested data property');
    if (Array.isArray(data.data)) {
      data.data.forEach(d => moves.push(normalizeMove(d)));
    } else {
      moves.push(normalizeMove(data.data));
    }
  }
  // Format 4: Object with 'bestmove' property
  else if (data && data.bestmove) {
    console.log('[Chess Study] Response has bestmove property');
    moves.push({
      move: data.bestmove,
      san: data.san || data.bestmove,
      evaluation: data.eval || data.score || 0,
      depth: data.depth,
      continuation: data.pv ? data.pv.split(' ') : [],
      winChance: data.winChance
    });
  }
  // Format 5: Check for error in response
  else if (data && data.error) {
    console.error('[Chess Study] API returned error:', data.error);
    throw new Error('Chess API error: ' + data.error);
  }
  else {
    console.warn('[Chess Study] Unknown response format:', data);
    // Try to extract any useful info
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      console.log('[Chess Study] Response keys:', keys);
    }
  }
  
  console.log('[Chess Study] Parsed moves:', moves);
  
  if (moves.length === 0) {
    console.warn('[Chess Study] No moves parsed from response');
  }
  
  return moves;
}

function normalizeMove(d) {
  console.log('[Chess Study] Normalizing move:', d);
  
  // Handle string input (just the move notation)
  if (typeof d === 'string') {
    return {
      move: d,
      san: d,
      evaluation: 0,
      depth: 0,
      continuation: [],
      winChance: null
    };
  }
  
  // Handle object input
  return {
    move: d.move || d.lan || d.from + d.to || '',
    san: d.san || d.move || d.lan || '',
    evaluation: d.eval ?? d.score ?? d.evaluation ?? (d.centipawns ? d.centipawns / 100 : 0),
    depth: d.depth || 0,
    continuation: d.continuationArr || d.continuation || (d.pv ? d.pv.split(' ') : []),
    winChance: d.winChance ?? d.wdl ?? null
  };
}

// ============================================================================
// EXPLANATION
// ============================================================================

async function getExplanation(fen, moves, apiKey, provider = 'anthropic', model = 'claude-sonnet-4-5-20250929') {
  if (!moves || moves.length === 0) {
    return 'Unable to generate explanation.';
  }

  const best = moves[0];
  const others = moves.slice(1, 4);
  const turn = fen.split(' ')[1] === 'w' ? 'White' : 'Black';

  const prompt = `You are an expert chess instructor. Analyze this position and explain the best moves using proper chess terminology.

Position (FEN): ${fen}
${turn} to move

**Best Move:** ${best.san} (eval: ${best.evaluation > 0 ? '+' : ''}${best.evaluation})
${best.continuation?.length > 0 ? `Main line: ${best.continuation.slice(0, 5).join(' ')}` : ''}

${others.length > 0 ? `**Alternatives:**\n${others.map((m, i) => `${i + 2}. ${m.san} (${m.evaluation > 0 ? '+' : ''}${m.evaluation})`).join('\n')}` : ''}

Provide a concise but educational analysis covering:

1. **Position Type**: Opening/middlegame/endgame, key features
2. **Why ${best.san} is Best**: Explain the tactical and/or strategic reasons
3. **Key Ideas**: What threats does it create? What does it prevent?
4. **Main Continuation**: What happens next?
5. **Why Alternatives Are Weaker**: Brief note on other moves

Use proper chess terminology: development, center control, king safety, initiative, tempo, piece activity, pawn structure, outposts, weak squares, open files, etc.

Keep it under 150 words. Be instructive and clear.`;

  let response;
  
  if (provider === 'openrouter') {
    // Map Anthropic model IDs to OpenRouter format
    let openRouterModel = model;
    if (model.includes('claude-sonnet-4-5')) {
      openRouterModel = 'anthropic/claude-sonnet-4.5';
    } else if (model.includes('claude-haiku-4-5')) {
      openRouterModel = 'anthropic/claude-haiku-4.5';
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
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      return 'Could not generate explanation.';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No explanation available.';
    
  } else {
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
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      return 'Could not generate explanation.';
    }

    const data = await response.json();
    return data.content?.[0]?.text || 'No explanation available.';
  }
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
  console.log('[Chess Study] Testing Stockfish API...');
  
  // Test with starting position
  const testFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  
  try {
    const response = await fetch(CONFIG.CHESS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fen: testFen,
        depth: 10,
        variants: 1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Chess Study] Stockfish test failed:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    console.log('[Chess Study] Stockfish test success:', data);
    
    // Extract the move from response
    let move = 'Unknown';
    if (Array.isArray(data) && data.length > 0) {
      move = data[0].san || data[0].move || 'OK';
    } else if (data.san || data.move) {
      move = data.san || data.move;
    }
    
    return { success: true, move };
    
  } catch (error) {
    console.error('[Chess Study] Stockfish test error:', error);
    return { success: false, error: error.message };
  }
}
