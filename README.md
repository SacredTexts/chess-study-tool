# ♟️ Chess Study Tool

A Chrome extension that analyzes chess positions from any source using AI vision and Stockfish engine.

## Features

- **📸 Screenshot Analysis** - Capture any chess board from any website, app, or even a photo
- **🤖 AI Vision** - Claude Sonnet 4.5 recognizes pieces and converts to FEN notation
- **♟️ Stockfish Analysis** - Get the best moves with evaluations via chess-api.com
- **📚 Educational Explanations** - AI-generated explanations of why moves are best
- **🎯 Multiple Providers** - Support for Anthropic (direct) or OpenRouter APIs

## Installation

### From Source (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/chess-study-tool.git
   cd chess-study-tool
   ```

2. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the project folder

3. Configure API key:
   - Click the extension icon
   - Click the ⚙️ settings gear
   - Enter your Anthropic or OpenRouter API key
   - Save settings

### Getting an API Key

**Anthropic (Recommended):**
1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create an account and add credits
3. Generate an API key (starts with `sk-ant-`)

**OpenRouter (Alternative):**
1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Create an account
3. Generate an API key (starts with `sk-or-`)

## Usage

1. Open any website with a chess board (chess.com, lichess.org, etc.)
2. Click the Chess Study Tool extension icon - the **side panel** opens on the right
3. Select "I am White" or "I am Black" using the toggle
4. Click "📸 Capture & Analyze Screen"
5. View the best moves with explanations
6. Click any move to see it highlighted on the board

**Side Panel Features:**
- Stays open when you switch tabs
- Doesn't create multiple windows
- Click extension icon again to close
3. Click "📸 Capture & Analyze"
4. View the analysis:
   - Detected position (FEN)
   - Best moves with evaluations
   - Board diagram
   - Educational explanation

## Project Structure

```
chess-study-tool/
├── manifest.json           # Chrome extension manifest (v3)
├── src/
│   ├── background/
│   │   └── service-worker.js   # Main logic, API calls
│   ├── panel/
│   │   ├── panel.html          # UI
│   │   └── panel.js            # Panel logic
│   └── lib/
│       └── mermaid.min.js      # Diagram rendering
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── docs/
    └── architecture.md
```

## Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| API Provider | Anthropic or OpenRouter | Anthropic |
| Model | Claude Sonnet 4.5 or Haiku 4.5 | Sonnet 4.5 |
| Number of Moves | How many alternatives to show | 5 |
| Analysis Depth | Stockfish search depth (12-18) | 18 |

## API Costs

- **Claude Sonnet 4.5**: ~$0.01-0.03 per analysis
- **Claude Haiku 4.5**: ~$0.001-0.005 per analysis
- **Stockfish**: Free (via chess-api.com)

## Tech Stack

- Chrome Extension Manifest V3
- Claude Vision API (Anthropic / OpenRouter)
- Chess-API.com (Stockfish)
- Mermaid.js for diagrams
- Vanilla JS (no framework)

## Development

### Testing API Connections

The extension has built-in API status indicators:
- 🟢 Green = Connected
- 🔴 Red = Failed
- ⚪ Grey = Not tested

Click "Check Connections" in settings to test both APIs.

### Debugging

1. Open `chrome://extensions/`
2. Find Chess Study Tool
3. Click "Inspect views: service worker"
4. Check Console for logs prefixed with `[Chess Study]`

## Roadmap

- [ ] Support for PGN export
- [ ] Move tree visualization
- [ ] Opening book integration
- [ ] Puzzle mode
- [ ] Local Stockfish (WASM)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file

## Acknowledgments

- [Anthropic](https://anthropic.com) for Claude AI
- [Chess-API.com](https://chess-api.com) for free Stockfish API
- [OpenRouter](https://openrouter.ai) for API aggregation
