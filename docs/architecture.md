# Chess Study Tool - Architecture

## Design Principle: Zero Website Interaction

This extension is designed as a **completely standalone learning tool** that does NOT interact with any chess website.

## What We DON'T Do

```
❌ NO content scripts (nothing injected into webpages)
❌ NO host_permissions for chess.com, lichess, etc.
❌ NO DOM reading or manipulation
❌ NO automatic monitoring or background captures
❌ NO WebSocket interception
❌ NO page modification of any kind
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      CHROME BROWSER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────┐         ┌──────────────────────────────┐ │
│   │  Extension Icon  │────────►│     Panel (Popup Window)     │ │
│   │   (Toolbar)      │  click  │                              │ │
│   └──────────────────┘         │  • Capture button            │ │
│                                │  • Results display           │ │
│                                │  • Mermaid diagram           │ │
│                                │  • Settings                  │ │
│                                └──────────────┬───────────────┘ │
│                                               │                  │
│   ┌──────────────────────────────────────────┼──────────────────┤
│   │           Service Worker                  │                  │
│   │                                           ▼                  │
│   │   handleCapture() ◄── User clicks "Capture"                 │
│   │         │                                                    │
│   │         ▼                                                    │
│   │   chrome.tabs.captureVisibleTab()                           │
│   │         │                                                    │
│   │         ▼                                                    │
│   │   Screenshot (base64 PNG)                                    │
│   │                                                              │
│   └──────────────────────────────────────────────────────────────┤
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                      EXTERNAL APIs ONLY                           │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────────┐        ┌─────────────────┐                 │
│   │  Claude Vision  │        │  Chess-API.com  │                 │
│   │  (Anthropic)    │        │  (Stockfish)    │                 │
│   │                 │        │                 │                 │
│   │  Recognizes     │        │  Calculates     │                 │
│   │  board from     │        │  best moves     │                 │
│   │  screenshot     │        │                 │                 │
│   └────────┬────────┘        └────────┬────────┘                 │
│            │                          │                          │
│            └──────────┬───────────────┘                          │
│                       ▼                                          │
│               ┌───────────────┐                                  │
│               │ Claude API    │                                  │
│               │ (Explanation) │                                  │
│               └───────────────┘                                  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Panel (src/panel/)

The popup UI that appears when you click the extension icon.

**Files:**
- `panel.html` - UI structure and styling
- `panel.js` - User interaction handling

**Key Functions:**
```javascript
handleCapture()     // User clicks button → request screenshot
displayResults()    // Show analysis in UI
renderDiagram()     // Generate Mermaid chart
displayExplanation() // Format AI explanation
```

### 2. Service Worker (src/background/)

Handles API communication. No content script injection.

**Key Functions:**
```javascript
handleCapture()      // chrome.tabs.captureVisibleTab()
analyzeWithVision()  // Send to Claude Vision API
getStockfishMoves()  // Send FEN to Chess-API.com
getExplanation()     // Get Claude explanation
```

## Data Flow

```
1. User clicks "Capture & Analyze" button
                    │
                    ▼
2. panel.js sends message: { type: 'CAPTURE_SCREENSHOT' }
                    │
                    ▼
3. service-worker.js calls chrome.tabs.captureVisibleTab()
   (This is the ONLY interaction with any tab - just a screenshot)
                    │
                    ▼
4. Screenshot (base64 PNG) returned
                    │
                    ▼
5. service-worker.js sends to Claude Vision API
   Request: { image: base64, prompt: "recognize chess position" }
   Response: { fen: "rnbqkbnr/...", turn: "w" }
                    │
                    ▼
6. service-worker.js sends FEN to Chess-API.com
   Request: { fen: "...", depth: 18, variants: 5 }
   Response: [{ san: "Nf3", eval: 0.32, continuation: [...] }, ...]
                    │
                    ▼
7. service-worker.js sends to Claude API for explanation
   Request: { position, moves, "explain in chess terms" }
   Response: "Nf3 develops the knight while controlling..."
                    │
                    ▼
8. All results sent back to panel.js
                    │
                    ▼
9. panel.js displays:
   - FEN notation
   - Best moves list
   - Mermaid diagram
   - AI explanation
```

## Manifest Permissions

```json
{
  "permissions": [
    "storage",     // Save user settings locally
    "activeTab",   // Capture current tab when user clicks
    "tabs"         // Get window ID for screenshot
  ],
  
  "host_permissions": [
    "https://chess-api.com/*",      // Stockfish API
    "https://api.anthropic.com/*"   // Claude API
  ]
  
  // NOTE: NO chess.com, lichess.org, or other chess sites!
  // NOTE: NO content_scripts at all!
}
```

## Security & Privacy

1. **No website access**: Cannot read or modify any webpage content
2. **User-initiated only**: Only captures when user clicks button
3. **Local storage only**: Settings stored in chrome.storage.sync
4. **No tracking**: No analytics, no telemetry
5. **Minimal permissions**: Only what's needed for screenshots and APIs

## Why This Design?

This tool is designed for **learning** chess, not for playing.

By having zero interaction with chess websites:
- It cannot be used for real-time cheating during games
- It's clearly a study tool, like a chess book
- Users must consciously decide to use it
- There's no automation or background monitoring

The tool treats chess websites the same as a chess book photo or a YouTube video - it just analyzes whatever is on your screen when you ask it to.
