# FEN Recovery from Pieces Array + Auto-Crop Integration

**Date:** 2026-02-04
**Status:** Approved
**Problem:** Vision model returns invalid FEN strings (e.g., "Rank 8 has 4 squares") because full-page screenshots include ads, navigation, and UI clutter alongside the chess board. The model struggles with FEN arithmetic (counting consecutive empty squares) even when it correctly identifies individual pieces.

## Part B: FEN Recovery from Pieces Array

The Vision prompt already requests a `pieces` array (`[{"square":"a1","piece":"P"}, ...]`) alongside the FEN string. This array is returned from `analyzeWithVision()` but never used by `evaluateVisionResults()` or `validateFEN()`.

### New Functions

**`validatePiecesArray(pieces)`** — Validates the pieces array:
- Each entry has a valid square (a1-h8) and valid piece letter (pnbrqkPNBRQK)
- No duplicate squares
- Exactly 1 white king and 1 black king
- Max 8 pawns per side, no pawns on ranks 1/8
- Returns `{ valid, error, pieces }` (cleaned/normalized)

**`buildFENFromPieces(pieces, turn)`** — Constructs a FEN string from a validated pieces array:
- Creates an empty 8x8 board (2D array)
- Places each piece on its square
- Builds FEN board string rank by rank (rank 8 first, guaranteed 8 squares per rank)
- Infers castling rights from king/rook positions
- Appends turn, castling, en passant (-), halfmove (0), fullmove (1)

### Integration Point

In `evaluateVisionResults()`, after `validateFEN()` fails:
1. Check if `result.pieces` exists and is an array
2. Run `validatePiecesArray(result.pieces)`
3. If valid, call `buildFENFromPieces(result.pieces, result.turn)`
4. Run `validateFEN()` on the rebuilt FEN
5. If valid, use it (set `recoveryMethod: 'pieces-array'` for logging)

## Part A: Auto-Crop Cache Integration

### Existing Infrastructure

`handleAutoCrop()` and `cropImageData()` already exist in the service worker but are only exposed as a standalone message handler (`AUTO_CROP_BOARD`). They are not called during `handleAnalysis()`.

### Crop Boundary Cache

In-memory cache keyed by tab URL origin:
```js
const cropCache = {};  // { "https://chess.com": { x1, y1, x2, y2, timestamp } }
```

### Integration into handleAnalysis()

Before the Vision call in `handleAnalysis()`:
1. Get the active tab URL origin
2. Check `cropCache[origin]`
3. If cache hit, crop the screenshot using cached boundaries before sending to Vision
4. If cache miss, send full screenshot (first capture behavior unchanged)

### Cache Population

After a successful auto-crop (either triggered by retry or explicit `AUTO_CROP_BOARD` message):
- Store boundaries in `cropCache[origin]`
- Subsequent captures on the same site reuse cached boundaries

### Cache Invalidation

Clear cached boundaries when:
- Tab URL origin changes
- Cache entry older than 30 minutes
- User could manually trigger re-detection (future UI option)

### Retry with Crop

In `handleAnalysis()`, after FEN validation fails AND pieces-array recovery fails:
1. If no crop was applied yet, call `handleAutoCrop()` to detect + crop
2. Cache the boundaries
3. Retry Vision with the cropped image
4. Apply FEN validation + pieces-array recovery on retry result

## Updated Analysis Pipeline

```
1. Check crop cache for current tab origin
   +-- Cache hit -> crop screenshot
   +-- Cache miss -> use full screenshot

2. Vision API call
   +-- Returns: { fen, pieces, turn, ... }

3. Validate FEN
   +-- Valid -> continue to Stockfish
   +-- Invalid ->
       4. Try building FEN from pieces array
          +-- Valid -> continue (0 extra API calls)
          +-- Invalid ->
              5. If not yet cropped, auto-crop + cache
                 +-- Retry Vision with cropped image
                     6. Validate FEN
                        +-- Valid -> continue
                        +-- Invalid -> try pieces array
                            +-- Valid -> continue
                            +-- Fail -> surface error
```

## API Call Cost

| Scenario | API Calls | Notes |
|----------|-----------|-------|
| Cached crop, valid FEN | 1 | Same as today |
| Cached crop, bad FEN, good pieces array | 1 | Free recovery |
| First capture, valid FEN | 1 | No crop needed |
| First capture, bad FEN, good pieces array | 1 | Free recovery |
| Bad FEN + bad pieces, no cache | 3 | Analysis + crop detect + retry |

## Files Modified

| File | Change |
|------|--------|
| `src/background/service-worker.js` | Add `buildFENFromPieces()`, `validatePiecesArray()` |
| `src/background/service-worker.js` | Modify `evaluateVisionResults()` for pieces-array fallback |
| `src/background/service-worker.js` | Modify `handleAnalysis()` for crop cache + retry |
| `src/background/service-worker.js` | Add `cropCache` object and lookup/store helpers |
