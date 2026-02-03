# Elo-Based Move Selection & Keyboard Shortcut

**Date:** 2026-02-04
**Status:** Design approved

## Problem

Showing the engine's #1 move every time creates a detectable pattern. Anti-cheat systems (CUSUM, change-point detection) flag players whose move accuracy suddenly jumps to engine-level. The tool should suggest strong but human-plausible moves for a given skill level.

## Design

### 1. Softmax Selection Over Lichess Top 5

Request `multiPv=5` from Lichess Cloud Eval (already supported). Apply a softmax probability distribution over the moves, weighted by centipawn loss relative to the best move.

**Formula:**

```
Temperature:   τ(Elo) = max(5, 200 - 0.08 * Elo)
Jitter:        τ_actual = τ * (0.85 + Math.random() * 0.30)
Probability:   P(move_i) = exp(-loss_i / τ_actual) / Σ exp(-loss_j / τ_actual)
               where loss_i = centipawns(move_0) - centipawns(move_i)
```

**Selection profiles:**

| Elo  | τ   | Move 1 (0cp) | Move 2 (25cp) | Move 3 (50cp) | Move 4 (80cp) |
|------|-----|--------------|---------------|---------------|---------------|
| 2400 | 8   | ~96%         | ~4%           | <1%           | <1%           |
| 2000 | 40  | ~50%         | ~27%          | ~14%          | ~7%           |
| 1600 | 72  | ~38%         | ~27%          | ~19%          | ~13%          |
| 1200 | 104 | ~31%         | ~25%          | ~19%          | ~15%          |

The ±15% jitter on τ prevents the softmax distribution itself from being a detectable pattern.

### 2. Edge Cases

- **Mate scores:** Always pick the mating move. No human avoids forced mate.
- **Single move returned:** Use it directly (Chess-API fallback or sparse Lichess result).
- **Large eval gaps (>200cp between moves):** Softmax naturally concentrates on the best move. Even weak players don't hang pieces when a simple recapture exists.
- **All moves equal (<5cp spread):** Effectively uniform random. Fine — all moves are equivalent.
- **Lichess returns <5 moves:** Softmax works on any array size.

### 3. UI: Elo Slider in Settings

- Range: 800-2400, step 100
- Default: 1500
- Stored in `chrome.storage.sync` as `targetElo`
- Located in the existing settings section of panel.html

### 4. Display: Selected vs Engine Best

The panel shows the selected move (not always the engine's #1). When they differ, a subtle line shows what the engine preferred:

```
Best Move: Knight g1 -> f3
(Engine prefers e2->e4, +0.25 better)
```

### 5. Keyboard Shortcut: Alt+=

Registered via Chrome Commands API. No content scripts.

**manifest.json:**

```json
"commands": {
  "capture-analyze": {
    "suggested_key": {
      "default": "Alt+Equal",
      "mac": "Alt+Equal"
    },
    "description": "Capture and analyze chess position"
  }
}
```

**service-worker.js:** Listens for `chrome.commands.onCommand` and triggers the existing capture-analyze pipeline. Requires the side panel to already be open — does not auto-open it.

## Code Changes

### service-worker.js

**New function — `selectHumanMove(moves, targetElo)`** (~25 lines)

Placed alongside existing Stockfish functions. Takes the moves array from `getStockfishMoves()` and the Elo from settings. Returns `{ selected, engineBest, allMoves }`.

**Modified — `getStockfishMoves()` call site**

Change `numMoves` from 1 to 5 so Lichess always returns multiple principal variations.

**Modified — `handleAnalysis()`**

After getting Stockfish moves, call `selectHumanMove()` before returning results to the panel.

**New — `chrome.commands.onCommand` listener**

Triggers capture-analyze when `Alt+=` is pressed. Sends message to panel to start the pipeline (same path as the Capture button).

### panel.html

- Elo slider in settings section (label, range input, value display)

### panel.js

- Read/save `targetElo` from `chrome.storage.sync`
- Pass `targetElo` to service worker in analyze message
- `displayMoves()` updated to show selected move + engine-best comparison line
- Listen for keyboard shortcut message from service worker to trigger capture

### manifest.json

- Add `commands` entry for `capture-analyze` shortcut

## What This Does NOT Change

- Vision API pipeline (screenshot -> FEN) unchanged
- FEN validation unchanged
- Stockfish API calls unchanged (just requesting 5 PVs instead of 1)
- Board rendering unchanged (highlights selected move's from/to squares)
- Debug logging unchanged
- Provider settings unchanged
