# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that analyzes chess positions from screenshots using AI vision and Stockfish engine. Designed as a **standalone learning tool** with zero website interaction - no content scripts, no DOM manipulation, no chess site permissions.

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
1. User clicks "Capture" → chrome.tabs.captureVisibleTab()
2. Screenshot → Claude Vision API → FEN notation
3. FEN → Chess-API.com (Stockfish) → Best moves
4. Position + Moves → Claude API → Educational explanation
5. Results displayed in panel with interactive board
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

1. **Zero website interaction** - Only captures screenshots, never injects scripts or reads DOM
2. **User-initiated only** - Captures only when user clicks button
3. **Minimal permissions** - `storage`, `activeTab`, `tabs`, `sidePanel`
4. **No tracking** - Settings in chrome.storage.sync, no analytics

## Code Conventions

- Vanilla JavaScript (no frameworks, no build tools)
- CSS-in-HTML in panel.html (single-file styling)
- Console logs prefixed with `[Chess Study]`
- FEN validation before any Stockfish API calls
- Unicode chess pieces for display: `♔♕♖♗♘♙` / `♚♛♜♝♞♟`
