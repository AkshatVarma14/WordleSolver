# docs/EXTENSION_GUIDE.md — Chrome Extension Installation & User Manual

This guide describes how to build, install, and operate the **Wordle Solver Chrome Extension** (Manifest V3) locally as an unpacked developer extension.

> [!IMPORTANT]
> **Advisory Nature & Fair-Play Statement:**
> This extension functions purely as an **academic AI decision support assistant**. It **never** simulates keystrokes, clicks tiles, or plays turns on the user's behalf. All moves must be entered manually by the player on the NYT Wordle page.
>
> This extension is distributed as open-source source code and is **not published on the Chrome Web Store**.

---

## 1. Prerequisites

Before installing the extension, ensure your system meets the following requirements:
- **Google Chrome** (version 109 or newer, supporting Manifest V3 service workers).
- **Node.js** (v20+ recommended, v24 tested) and **npm** installed on the development machine.
- Local clone of the repository:
  ```text
  C:\Users\aksha\OneDrive\Documents\WordleSolver
  ```

---

## 2. Building the Extension

To build the extension for production:

1. Open your terminal in the repository root:
   ```bash
   cd C:\Users\aksha\OneDrive\Documents\WordleSolver
   ```
2. Run the dedicated extension build script:
   ```bash
   npm run build:extension
   ```
   *(Alternatively: `npm run build --workspace=extension`)*

3. **Verify the build output:**
   The output directory is `apps/extension/dist/`. Confirm that the following files are present:
   ```text
   apps/extension/dist/
   ├── manifest.json                   # Verified Manifest V3 definition
   ├── popup/
   │   └── index.html                  # Popup HTML host
   ├── background/
   │   └── service-worker.js           # MV3 ES module service worker
   ├── content/
   │   └── content.js                  # Self-contained IIFE content script
   ├── icons/
   │   ├── icon-16.png
   │   ├── icon-48.png
   │   └── icon-128.png
   └── assets/
       ├── popup-[hash].js             # Compact React popup bundle
       └── popup-[hash].css            # Dark neutral styling
   ```

---

## 3. Loading the Unpacked Extension in Chrome

1. Open Google Chrome.
2. In the Chrome address bar, navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** using the toggle switch located in the top-right corner of the page.
4. Click the **Load unpacked** button in the top-left toolbar.
5. In the file-selection dialog, navigate to and select the build directory:
   ```text
   C:\Users\aksha\OneDrive\Documents\WordleSolver\apps\extension\dist
   ```
6. The extension card **Wordle Solver — AISC Decision Support** will now appear in your list of active extensions with ID and version `0.1.0`.

---

## 4. Pinning and Opening the Extension

1. In the Chrome toolbar (to the right of the address bar), click the **Extensions icon** (puzzle piece shape).
2. Locate **Wordle Solver — AISC Decision Support** in the dropdown list.
3. Click the **Pin icon** (pushpin) next to it so the green "W" badge remains permanently visible in your toolbar.
4. Click the pinned "W" icon at any time to open the solver popup.

---

## 5. Usage Modes

### 5.1 Live Sync Mode (Official NYT Wordle)

1. Navigate to the official Wordle page:
   ```text
   https://www.nytimes.com/games/wordle
   ```
2. Dismiss the initial NYT splash/welcome modal if present by clicking **Play**.
3. Open the extension popup by clicking the toolbar icon.
4. The header badge will indicate **`● Synced`** with status:
   - Fresh board: `"Live Synced (Empty board) · Strategy: CSS_MODULES"`
   - Optimal opening recommendation: **`SALET`** (expected entropy: 5.84 bits).
5. When you submit a guess on the NYT page and press `Enter`:
   - NYT flips the tiles over ~1.5 seconds.
   - The extension's debounced observer detects the evaluation once animations finish.
   - The popup updates automatically, displaying the new turn, the reduced candidate count, and the next optimal recommendation.
6. When the target word is identified (5 green tiles), the popup displays the **Puzzle Solved / Round Complete** banner.

### 5.2 Manual Entry Fallback Mode

If you are playing on an unsupported mirror, disconnected tab, or when live extraction is temporarily unavailable:

1. Click **`Manual Mode`** in the popup header (or the extension will activate it automatically if on an unsupported tab).
2. The header badge indicates **`○ Manual`**.
3. Type any valid 5-letter word in the input box and click **`Add ↵`**.
4. In the board row, click individual tiles to cycle their feedback:
   - 1st click: **Grey** (Absent, 0)
   - 2nd click: **Yellow** (Present, 1)
   - 3rd click: **Green** (Correct, 2)
5. The recommendation and candidate pool update synchronously based on your input.
6. Click **`Reset`** to clear manual rows back to the opening state.
7. Click **`Use Live Sync`** or the **Refresh (`↻`)** button at any time to re-connect to the active NYT tab.

---

## 6. Known Limitations & Edge Cases

1. **Answer List Divergence:**
   The solver uses the canonical 2,315-word Wordle answer dictionary. The NYT editorial team occasionally removes or substitutes specific words. If a played word eliminates all 2,315 canonical words, the extension activates its built-in **Contradiction Diagnosis** (`diagnoseContradiction`), explaining whether a vocabulary mismatch occurred (e.g. `PSHAW` scenario) or whether an earlier row had conflicting feedback.
2. **First-Time Welcome Modal:**
   If NYT displays a splash modal ("Play", "Log In", or CMP cookie consent), the board elements are not yet mounted in the DOM. The extension cleanly reports `"Manual Mode (Wordle board not found or splash screen active)"`. Once you click "Play" on the site, click **`↻` (Refresh)** to establish live sync.
3. **Pre-Existing Tabs Upon Installation:**
   Content scripts declared in Manifest V3 are injected into newly opened or refreshed tabs. If a Wordle tab was already open before loading the extension, refresh that Wordle tab once (`F5` or `Ctrl+R`) to inject the observer.

---

## 7. Troubleshooting Guide

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **"Could not reach Wordle board — refresh NYT tab to sync"** | Tab was open before extension was installed or reloaded | Press `F5` / `Ctrl+R` on the Wordle page, then reopen popup or click `↻`. |
| **"Active tab is not NYT Wordle"** | Popup opened while focused on Google, blank tab, or other website | Navigate to `https://www.nytimes.com/games/wordle`, then click the extension icon. |
| **Recommendation does not update after typing** | Tiles are actively flipping, or Enter was not pressed | Press `Enter` on the Wordle page to submit the row. The extension waits for the ~1.5s flip animation to finish before reading. |
| **Extension shows stale code after rebuilding** | Chrome caches unpacked extensions in memory | Go to `chrome://extensions` and click the **Reload icon** (circular arrow) on the Wordle Solver card. |
| **Popup UI seems blank or grey** | Manifest build path mismatch | Confirm `npm run build:extension` completed with exit code 0 and inspect the directory structure in `apps/extension/dist/`. |

---

## 8. How to Reload After Code Changes

When you modify solver logic or extension UI code:

1. Rebuild the extension:
   ```bash
   npm run build:extension
   ```
2. Navigate to `chrome://extensions`.
3. Locate **Wordle Solver — AISC Decision Support**.
4. Click the **Reload button** (circular arrow icon) on the extension card.
5. If testing on an already-open NYT Wordle page, refresh the NYT page (`Ctrl+R`) to re-initialize the updated content script.
