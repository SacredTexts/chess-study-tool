# Chess.com DOM Position Extraction

**Date:** 2026-02-04
**Status:** Approved
**Version target:** 3.6.0

## Problem

The vision API (Gemini Flash/Pro via OpenRouter) frequently returns incorrect board positions because it receives full-page screenshots containing ads, sidebars, move lists, and the Chess Study Tool's own panel. Both the FEN string and pieces array come from the same model call, so cross-validation is ineffective — they're consistently wrong together.

## Solution

Add a content script that reads chess piece positions directly from chess.com's DOM, bypassing the vision API entirely when on chess.com. Fall back to the existing vision pipeline for other sites or when DOM extraction fails.

## Architecture

```
handleAnalysis()
  ├─ Step 0: Try DOM extraction (new)
  │    ├─ Send message to content script on active tab
  │    ├─ If FEN returned → skip vision API entirely
  │    └─ If fails → continue to vision fallback
  │
  ├─ Step 1: Vision API (existing, now fallback only)
  ├─ Step 2: Stockfish (unchanged)
  └─ Step 3: Explanation (unchanged)
```

## Content Script Design

- Reads `.piece` elements with classes like `wp square-52` (white pawn on e2)
- Builds 8x8 board array and converts to FEN
- Detects turn from highlighted squares (last move indicator)
- Returns FEN, pieces array, and source metadata
- Purely passive — read-only, no DOM modification

## Edge Cases

- Not on chess.com → no content script, vision fallback
- Chess.com with no board → returns null, vision fallback
- Piece mid-drag → exclude dragging piece from drag position
- DOM structure changes → returns null, vision fallback
- Multiple boards → target primary board container

## Files

- CREATE: `src/content/chess-com.js`
- MODIFY: `manifest.json` (content_scripts, version bump)
- MODIFY: `src/background/service-worker.js` (DOM extraction step)
- MODIFY: `src/panel/panel.html` (version, source indicator)
- MODIFY: `src/panel/panel.js` (version, display source)
