# docs/NYT_LIVE_DOM_AUDIT.md — Live NYT Wordle DOM Inspection & Architectural Validation

This audit documents verified facts versus common assumptions regarding the official New York Times (NYT) Wordle production web application (`https://www.nytimes.com/games/wordle`), based on direct live DOM and production stylesheet inspection executed in Stage 8C.

---

## 1. Verified Live Facts vs. Common Assumptions

| Area | Common Assumption | Verified Live Reality (NYT Wordle) | Engine Adaptation |
| :--- | :--- | :--- | :--- |
| **Component Architecture** | Wordle is built with Custom Elements / Shadow DOM (`<game-app>`, `<game-board>`). | Modern NYT Wordle is a standard React SPA utilizing CSS modules. Shadow DOM was deprecated after NYT's 2022 platform migration. | Strategy A targets modern CSS modules (`div[class*="Board-module"]`). Strategy B retains Shadow DOM traversal as an active fallback. |
| **Row Containers** | Static IDs (`#row-0`, `#row-1`). | CSS-hashed classes: `.Row-module_row__pwpBq`. Sequential rows are children of the board container. | Reader matches `div[class*="Row-module_row"], div[class*="Row-module"]`. |
| **Tile Containers** | Custom `<game-tile>` elements. | Standard `<div>` elements with hashed classes: `.Tile-module_tile__UWEHN`. | Reader queries `div[class*="Tile-module_tile"], div[data-state]`. |
| **Evaluation States** | Color classes (`.green`, `.yellow`, `.grey`). | Explicit `data-state` attribute on tiles. Exactly 5 values verified from NYT stylesheet `9424.213802106162e481cd93.css`: `empty`, `tbd`, `correct`, `present`, `absent`. | Normalizer maps `correct` $\to$ 2, `present` $\to$ 1, `absent` $\to$ 0. `empty` and `tbd` are treated as unsubmitted. |
| **In-Progress Letters** | Letters typed before pressing Enter are submitted. | Typed but unsubmitted letters have `data-state="tbd"`. | Evaluator rejects rows where any tile has `feedback === null` (including `tbd`), strictly reading only confirmed submitted turns. |
| **Tile Flip Animations** | DOM updates immediately upon pressing Enter. | Tiles flip sequentially over ~1.5s with `data-animation="flip"` and temporary `evaluating` states. | 250ms debounced `MutationObserver` + explicit check: any tile with `data-animation="flip"` or `evaluating` suppresses reading until animation concludes. |
| **Initial Page Load / Splash** | Board is always immediately visible upon page load. | Unauthenticated or first-time sessions present a Welcome modal (`Welcome-module_buttonContainer`) and CMP consent overlay before the board mounts. | If board is not mounted or covered by modal, reader gracefully returns `UNSUPPORTED_DOM_STRUCTURE`. Popup activates Manual Entry fallback with informative guidance. |

---

## 2. Production Stylesheet Proof

Direct inspection of NYT's production stylesheet (`https://www.nytimes.com/games-assets/v2/9424.213802106162e481cd93.css` and `4964.721a7860347a637db336.css`) revealed the following verified production class names and selector rules:

```css
/* Board container */
.Board-module_boardContainer__TBHNL
.Board-module_board__jeoPS

/* Row wrappers */
.Row-module_row__pwpBq
.Row-module_win__U9cQp
.Row-module_invalid__RNDXZ

/* Tile elements and explicit data-state selectors */
.Tile-module_tile__UWEHN
.Tile-module_tile__UWEHN[data-state=empty]
.Tile-module_tile__UWEHN[data-state=tbd]
.Tile-module_tile__UWEHN[data-state=correct]
.Tile-module_tile__UWEHN[data-state=present]
.Tile-module_tile__UWEHN[data-state=absent]

/* Virtual keyboard */
.Keyboard-module_keyboard__uYuqf
.Keyboard-module_row__ilOKU
```

---

## 3. Communication Lifecycle & Integration Protocol

1. **Popup Mount (`PopupApp.tsx`):**
   - Popup calls `requestLiveBoard()`.
   - Queries active tab via `chrome.tabs.query({ active: true, currentWindow: true })`.
   - If active tab is not `https://www.nytimes.com/games/wordle*`, activates Manual Mode with:
     > *"Manual Mode (Active tab is not NYT Wordle)"*
   - Sends `{ type: 'GET_BOARD_STATE' }` to content script.
2. **Content Script (`content/index.ts`):**
   - Calls `extractBoardState(document)`.
   - Tries Strategy A (CSS Modules) $\to$ Strategy B (Shadow DOM) $\to$ Strategy C (Semantic ARIA).
   - If board is not visible/ready, returns `{ success: false, error: 'UNSUPPORTED_DOM_STRUCTURE' }`.
   - Replies synchronously or via message channel: `{ type: 'BOARD_STATE_RESULT', payload: extraction }`.
3. **Live Mutation Observation (`content/observer.ts`):**
   - Debounced `MutationObserver` (250ms) watches `document.body` for `data-state`, `data-animation`, `class`, and `letter` changes.
   - Emits `{ type: 'BOARD_MUTATED', payload: extraction }` across runtime whenever user completes a turn.
4. **Stale Race Condition Protection:**
   - Monotonic request counter (`latestRequestIdRef`) discards older `GET_BOARD_STATE` responses if a newer mutation or manual change has already been processed.
5. **Shared Solver Computation:**
   - Extracted `TurnRecord[]` passes into pure `@wordle-solver/solver`:
     - Initial empty board: Instant canonical recommendation `SALET` (<1ms).
     - Non-empty board: `filterByHistory()` reduces candidate pool; `getUnifiedRecommendation()` selects optimal next guess.
     - Contradiction (0 candidates): `diagnoseContradiction()` diagnoses vocabulary mismatch vs. internal feedback contradiction.
     - 5 green tiles: Sets solved state, reports turns taken, and suppresses input controls.
