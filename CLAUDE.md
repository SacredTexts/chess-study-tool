# CLAUDE.md - Chess Study Tool

This document provides guidance for AI assistants working with this codebase.

## Project Overview

**Chess Study Tool** is a Chrome Extension (Manifest V3) that analyzes chess positions using AI vision and Stockfish engine. It follows a **standalone architecture** - meaning it has ZERO interaction with chess websites. It only captures screenshots when explicitly requested by the user.

- **Version**: 2.2.0
- **License**: MIT
- **Type**: Chrome Extension (Manifest V3)

## Architecture

```
User clicks icon → Panel window opens → User clicks "Capture"
    → Screenshot captured → Claude Vision (FEN recognition)
    → Stockfish Analysis (best moves) → Educational explanation
    → Results displayed with Mermaid diagram
```

### Key Design Principles

1. **No Website Interaction**: The extension never injects content scripts or modifies web pages
2. **User-Initiated Only**: All actions require explicit user clicks
3. **Minimal Permissions**: Only `storage`, `activeTab`, and `tabs` permissions
4. **No Build System**: Pure vanilla JavaScript, loads directly as unpacked extension

## Directory Structure

```
chess-study-tool/
├── manifest.json              # Chrome Extension manifest (v3)
├── src/
│   ├── background/
│   │   └── service-worker.js  # Core logic (~840 lines)
│   │                          # - API orchestration
│   │                          # - Screenshot capture
│   │                          # - FEN validation
│   │                          # - Message handling
│   ├── panel/
│   │   ├── panel.html         # UI with embedded CSS (~900 lines)
│   │   └── panel.js           # Panel interaction logic (~590 lines)
│   │                          # - Settings management
│   │                          # - Result display
│   │                          # - Mermaid integration
│   └── lib/
│       └── mermaid.min.js     # Bundled for CSP compliance
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon.svg
├── docs/
│   └── architecture.md        # Detailed architecture documentation
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Key Files

| File | Purpose |
|------|---------|
| `src/background/service-worker.js` | Core logic - all API calls, screenshot capture, FEN validation |
| `src/panel/panel.html` | UI layout with inline CSS (dark theme) |
| `src/panel/panel.js` | UI event handling, settings, Mermaid rendering |
| `manifest.json` | Extension configuration and permissions |

## Technology Stack

- **Chrome Extension Manifest V3** - No content scripts
- **Vanilla JavaScript (ES6+)** - No frameworks
- **No Build Tools** - No webpack, npm, or transpilation
- **Mermaid.js** - Diagram rendering (bundled locally)

### External APIs

| API | Purpose | Auth Required |
|-----|---------|---------------|
| Claude Vision (Anthropic) | Chess position recognition | API key |
| OpenRouter | Alternative Claude provider | API key |
| chess-api.com | Stockfish engine analysis | None (free) |

## Code Conventions

### File Structure Pattern

Each JS file follows this organization:
```javascript
/**
 * File description and purpose
 */

// ============================================================================
// SECTION NAME
// ============================================================================

// Code for this section...
```

### Logging

All console logs use `[Chess Study]` prefix:
```javascript
console.log('[Chess Study] Message received:', message.type);
```

### Message Passing

Panel ↔ Service Worker communication:
```javascript
// Message types:
'CAPTURE_SCREENSHOT'    // Request screenshot from target window
'ANALYZE_SCREENSHOT'    // Full analysis pipeline
'TEST_ANTHROPIC_API'    // Test Claude API connection
'TEST_STOCKFISH_API'    // Test Stockfish API connection
```

### Async/Await Pattern

All API calls use async/await with proper error handling:
```javascript
try {
  const result = await analyzeWithVision(imageData);
  // Process result
} catch (error) {
  console.error('[Chess Study] Error:', error);
  return { error: error.message };
}
```

### Settings Storage

Settings are stored in `chrome.storage.sync`:
```javascript
{
  claudeApiKey: string,
  apiProvider: 'anthropic' | 'openrouter',
  apiModel: string,
  numMoves: number,
  depth: number
}
```

## Development Workflow

### Installation (Development Mode)

1. Clone repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → select project folder
5. Configure API key in extension settings

### Debugging

1. Open `chrome://extensions/`
2. Find "Chess Study Tool"
3. Click "Inspect views: service worker" for background script
4. Open panel window → Right-click → "Inspect" for panel scripts

### Testing

No formal test framework. Use built-in testing:
- **Settings → "Check Connections"** - Tests both APIs
- **Status indicators**: Green (connected), Red (failed), Orange (checking)
- **Error Log panel** - Tracks API failures with timestamps

## Important Implementation Details

### FEN Validation (service-worker.js)

The extension validates FEN strings before sending to Stockfish:
- Verifies 8 ranks
- Validates exactly 1 king per side
- Checks valid piece characters
- Normalizes to include all 6 FEN fields

### API Provider Handling

Supports both Anthropic direct and OpenRouter:
- Different endpoint URLs
- Different request/response formats
- Model name mapping between providers

### Panel Window Management

```javascript
let panelWindowId = null;    // Track panel window
let targetWindowId = null;   // Window to capture screenshots from
```

Panel persists until user closes it. Only one panel can be open at a time.

## Common Tasks

### Adding a New Setting

1. Add input element in `panel.html`
2. Add DOM reference in `panel.js`
3. Update `loadSettings()` and `saveSettings()` in `panel.js`
4. Access setting in `service-worker.js` via `chrome.storage.sync.get()`

### Adding a New API Endpoint

1. Add URL to `CONFIG` object in `service-worker.js`
2. Add to `host_permissions` in `manifest.json`
3. Implement handler function in `service-worker.js`
4. Add message type to `onMessage` listener

### Modifying the Analysis Pipeline

The main analysis flow is in `handleAnalysis()` in `service-worker.js`:
1. Get settings from storage
2. Call Claude Vision for position recognition
3. Validate and normalize FEN
4. Call Stockfish for best moves
5. Generate educational explanation
6. Return combined results

## Security Considerations

- **No content scripts** - Cannot read/modify web pages
- **User-initiated only** - No background monitoring
- **API keys stored locally** - In chrome.storage.sync
- **Minimal permissions** - Only what's needed

## Gotchas and Notes

1. **No npm/build step** - Changes are immediate after reload
2. **Service worker lifecycle** - May go idle; use message passing
3. **CSP compliance** - Mermaid bundled locally, inline styles in HTML
4. **Screenshot capture** - Only works on active tab of target window
5. **API rate limits** - Claude has rate limits; handle errors gracefully

## Useful Commands

```bash
# No build commands - just reload extension in Chrome

# View extension logs
# Open chrome://extensions/ → Click "service worker" link

# Check for JavaScript errors
# Use browser DevTools Console
```

## Links

- [Chrome Extension Manifest V3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Anthropic API Docs](https://docs.anthropic.com/)
- [Chess-API.com](https://chess-api.com/)
- [Mermaid.js Docs](https://mermaid.js.org/)
