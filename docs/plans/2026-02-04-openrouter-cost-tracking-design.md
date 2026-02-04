# OpenRouter API Cost Tracking

## Goal

Display per-move and cumulative session cost for OpenRouter API calls in the panel UI.

## Data Source

After each OpenRouter vision call, query the generation endpoint:

```
GET https://openrouter.ai/api/v1/generation?id={generation_id}
Authorization: Bearer {openrouter_api_key}
```

Response includes `total_cost` (float, USD). The generation `id` comes from the original chat completion response.

## Changes

### service-worker.js

In the OpenRouter branch of `analyzeWithVision()`:

1. Extract `data.id` from the OpenRouter response (the generation ID)
2. Make a GET request to `/api/v1/generation?id={id}` with the same API key
3. Extract `total_cost` from the generation response
4. Attach `openrouterCost` to the result object sent back to the panel

If the generation query fails, fall back to `0` — cost display is non-critical.

### panel.js

1. Add two in-memory variables: `lastMoveCost` and `sessionTotalCost` (both start at 0)
2. In `displayResults()`, read `openrouterCost` from the response
3. Update `lastMoveCost = openrouterCost` and `sessionTotalCost += openrouterCost`
4. Update the cost display element
5. When DOM extraction is used (no vision call), cost is $0.00

No persistence — variables reset naturally when panel closes.

### panel.html

Add a cost display element below the board/explanation area:

```html
<div id="cost-display" class="cost-display" style="display:none">
  <div class="cost-row">
    <span class="cost-label">This move</span>
    <span id="cost-move" class="cost-value">$0.0000</span>
  </div>
  <div class="cost-row">
    <span class="cost-label">Session</span>
    <span id="cost-session" class="cost-value">$0.0000</span>
  </div>
</div>
```

Styled with muted text, left-aligned labels, right-aligned values. Hidden until first analysis completes.

## Edge Cases

- **DOM extraction (chess.com)**: No OpenRouter call, cost = $0.00, session total unchanged
- **Anthropic direct / BigModel**: Not OpenRouter, cost = $0.00 (only OpenRouter has the generation endpoint)
- **Generation query fails**: Silently fall back to $0.00 for that move
- **Panel closed and reopened**: Both counters reset to $0.00
