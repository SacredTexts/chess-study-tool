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
  CLAUDE_MODEL: 'claude-opus-4-5-20251101'
};

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
// ANALYSIS PIPELINE
// ============================================================================

async function handleAnalysis(imageData) {
  try {
    // Get settings
    const settings = await chrome.storage.sync.get({
      claudeApiKey: '',
      apiProvider: 'anthropic',
      apiModel: 'claude-opus-4-5-20251101',
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
1. Locate the chess board in the image
2. Carefully identify every piece and its exact square
3. Determine whose turn it is (look for visual cues like clocks, highlights, or turn indicators)
4. Convert the position to FEN notation

PIECE IDENTIFICATION:
- White pieces: K (King), Q (Queen), R (Rook), B (Bishop), N (Knight), P (Pawn) - usually lighter colored
- Black pieces: k, q, r, b, n, p - usually darker colored

BOARD ORIENTATION:
- Standard view: White pieces start on ranks 1-2, Black on ranks 7-8
- If viewing from Black's side, mentally flip the board
- The a1 square is always dark (from White's perspective, bottom-left)

CRITICAL RULES FOR FEN:
1. Each side starts with EXACTLY 8 pawns - if a pawn has moved, it's NO LONGER on its starting square
2. When a pawn moves from e2 to e4, rank 2 shows "PPPP1PPP" (missing the e-pawn), NOT "PPPPPPPP"
3. Count pieces carefully: White has max 8 pawns, Black has max 8 pawns
4. Pawns CANNOT be on rank 1 or rank 8 (they would promote)
5. Each rank in FEN must sum to exactly 8 squares

FEN FORMAT (exactly 6 space-separated parts):
1. Piece placement (8 ranks separated by /)
2. Active color: "w" or "b"
3. Castling: "KQkq", "Kq", "-", etc.
4. En passant: square like "e3" or "-"
5. Halfmove clock: number (use "0")
6. Fullmove: number (use "1")

VALIDATION CHECKLIST before responding:
□ Exactly 8 ranks separated by /
□ Each rank sums to 8 (pieces + numbers)
□ White pawns ≤ 8, Black pawns ≤ 8
□ No pawns on ranks 1 or 8
□ Exactly 1 white King, 1 black King
□ Moved pieces are NOT on their original squares

OUTPUT FORMAT (JSON only):
{
  "fen": "rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq f6 0 2",
  "turn": "w",
  "description": "Dutch Defense after 1.d4 f5",
  "confidence": "high"
}

If NO chess board is found:
{
  "fen": null,
  "error": "No chess board detected"
}`;

  let response;
  let data;
  
  if (provider === 'openrouter') {
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
  
  // Count pieces
  let whiteKings = 0, blackKings = 0;
  let whitePawns = 0, blackPawns = 0;
  
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
