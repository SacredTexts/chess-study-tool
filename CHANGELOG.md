# Changelog

All notable changes to this project will be documented in this file.

## [2.3.0] - 2025-01-26

### Added
- FEN validation before sending to Stockfish API
- King count validation (must have exactly one of each color)
- FEN normalization to ensure all 6 fields are present
- Better error messages showing the actual FEN that failed
- Show detected FEN even when Stockfish analysis fails

### Fixed
- INVALID_FEN_VALIDATION_ERROR from chess-api.com

## [2.2.0] - 2025-01-26

### Added
- API Provider selection (Anthropic / OpenRouter)
- Model selection (Claude Sonnet 4.5 / Haiku 4.5)
- Show/Hide API key button
- API status indicators in header (green/red/pink dots)
- Connection testing for both APIs
- Error logging system with expandable error log
- Screenshot thumbnail preview

### Changed
- Converted from popup to persistent window
- Window stays open until explicitly closed

## [2.1.0] - 2025-01-26

### Added
- Standalone learning tool architecture
- Claude Vision for position recognition
- Stockfish analysis via chess-api.com
- Educational explanations
- Mermaid.js board diagrams

### Removed
- All chess website interaction
- Content scripts
- Move highlighting on pages

## [1.0.0] - 2025-01-26

### Added
- Initial release
- Basic screenshot capture
- Chess position analysis
