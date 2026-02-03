# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that analyzes chess positions using Stockfish. On chess.com, reads positions directly from the DOM (100% accurate). On other sites, falls back to AI vision (screenshot → FEN). Content script on chess.com enables middle-click capture.

## Development Commands

```bash
# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select project folder

# Debug service worker
# Chrome Extensions page → "Inspect views: service worker"
# Console logs prefixed with [Chess Study]

# No build step - vanilla JS loads directly
```

## Architecture

### Component Model

```
Extension Icon → Side Panel (panel.html/panel.js)
                      ↓
              Service Worker (service-worker.js)
                      ↓
              External APIs Only
```

**Panel** (`src/panel/`): UI in Chrome Side Panel. Handles user interaction, displays results, renders chess board with Unicode pieces.

**Service Worker** (`src/background/`): Orchestrates the analysis pipeline. All API calls happen here.

### Analysis Pipeline

```
Chess.com (primary):
1. User clicks Capture (or middle-click) → chrome.scripting.executeScript
2. DOM extraction → FEN (100% accurate)
3. FEN → Stockfish → Best moves
4. Results displayed in panel

Other sites (fallback):
1. User clicks Capture → chrome.tabs.captureVisibleTab()
2. Screenshot → Vision API (OpenRouter/Anthropic) → FEN
3. FEN → Stockfish → Best moves
4. Results displayed in panel
```

### Message Flow

Panel sends messages to service worker:
- `CAPTURE_SCREENSHOT` - Capture visible tab
- `ANALYZE_SCREENSHOT` - Run full analysis pipeline
- `TEST_ANTHROPIC_API` / `TEST_STOCKFISH_API` - Connection tests

### Key Functions

**service-worker.js:**
- `handleCapture()` - Screenshot capture
- `analyzeWithVision()` - Claude Vision API call
- `getStockfishMoves()` - Chess-API.com integration
- `getExplanation()` - Generate educational content
- `validateFEN()` / `normalizeFEN()` - FEN validation before Stockfish

**panel.js:**
- `handleCapture()` - Orchestrates capture → analysis → display
- `displayResults()` - Renders FEN, moves, board, explanation
- `renderChessBoard()` - Unicode board with move highlighting

## External APIs

| API | Endpoint | Purpose |
|-----|----------|---------|
| Claude Vision | `api.anthropic.com/v1/messages` | Board recognition → FEN |
| OpenRouter | `openrouter.ai/api/v1/chat/completions` | Alternative Claude provider |
| Chess-API | `chess-api.com/v1` | Stockfish analysis |

## Design Principles

1. **DOM-first on chess.com** - Reads positions from the page DOM for perfect accuracy; vision API is fallback only
2. **User-initiated only** - Captures only when user clicks button or middle-clicks
3. **Minimal permissions** - `storage`, `activeTab`, `tabs`, `sidePanel`, `scripting`
4. **No tracking** - Settings in chrome.storage.sync, no analytics

## Versioning (update at end of every session)

When bumping the version, update all 3 locations and the changelog:

1. `manifest.json` → `"version"` field
2. `src/panel/panel.html` → header badge and settings footer (search for the version string)
3. `src/panel/panel.js` → comment at top of file

Also add an entry to `CHANGELOG.md` describing what changed.

## Code Conventions

- Vanilla JavaScript (no frameworks, no build tools)
- CSS-in-HTML in panel.html (single-file styling)
- Console logs prefixed with `[Chess Study]`
- FEN validation before any Stockfish API calls
- Unicode chess pieces for display: `♔♕♖♗♘♙` / `♚♛♜♝♞♟`
