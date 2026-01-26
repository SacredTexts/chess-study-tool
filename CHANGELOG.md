# Changelog

All notable changes to this project will be documented in this file.

## [2.8.0] - 2025-01-26

### Changed
- **Major**: Converted from popup window to Chrome Side Panel
- Panel now stays open when switching tabs
- No more multiple windows opening
- Click extension icon to toggle side panel
- Panel docks to the right side of browser

### Fixed
- Simplified screenshot capture to use active tab

## [2.7.0] - 2025-01-26

### Changed
- Move display now shows full info: "♗ Bishop f1 → b5" format
- All 5 moves shown in vertical list (not just 1)
- Best move (#1) has green background, others are normal
- Clicking any move updates the Board Position visualization
- Active/selected move is highlighted with blue border

## [2.6.1] - 2025-01-26

### Changed
- Moved "I am White/Black" toggle to below the capture button for easier access

## [2.6.0] - 2025-01-26

### Added
- "I am White/Black" toggle switch for board orientation
- Compact move display like reference image (piece icon + square)
- Click on any move to highlight it on the main board
- Better move parsing with from/to square detection

### Changed
- Move display now uses grid layout (2 columns)
- Board properly flips when toggling playing side
- Improved move highlighting with direct from/to coordinates

### Removed
- Old button-style White/Black selector
- Mini boards in move list (cleaner compact display)

### Fixed
- Move coordinates now properly parsed from Stockfish API
- Board squares correctly highlight for selected move

## [2.5.0] - 2025-01-26

### Added
- Mini chess boards for each move in the move list
- SVG arrows showing the move (from → to)
- Highlighted squares: yellow for origin, green for destination
- Each move card now shows visual representation of the move

### Changed
- Move cards now have vertical layout (header + mini board)
- More compact move notation with visual board below

## [2.4.0] - 2025-01-26

### Added
- Visual chess board showing the position with all pieces
- Best move highlighting (green squares show from→to)
- Unicode chess pieces (♔♕♖♗♘♙ / ♚♛♜♝♞♟)
- Board coordinates (a-h files, 1-8 ranks)
- Move legend showing highlight meaning

### Removed
- Mermaid.js diagram library (no longer needed)
- Move tree visualization (replaced with visual board)

### Changed
- Board is now shown even when Stockfish fails (partial results)

## [2.3.1] - 2025-01-26

### Fixed
- Claude Vision double-counting pawns (keeping original + moved position)
- Added pawn count validation (max 8 per side)
- Added pawn rank validation (no pawns on ranks 1 or 8)
- Improved Vision prompt with explicit checklist for piece counting

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
