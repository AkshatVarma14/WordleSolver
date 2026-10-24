import { FeedbackPattern, TileFeedback, TurnRecord, isValidWord } from '@wordle-solver/solver';
import { DOMBoardExtraction, ReaderStrategy } from '../types/messages';

interface ParsedTile {
  readonly letter: string;
  readonly feedback: TileFeedback | null; // null if un-evaluated, empty, or in-progress
  readonly isEvaluating: boolean;
}

interface ParsedRow {
  readonly isSubmitted: boolean;
  readonly record: TurnRecord | null;
}

/**
 * Normalizes state attribute strings to solver feedback values.
 */
function normalizeTileState(stateAttr: string | null): TileFeedback | null {
  if (!stateAttr) return null;
  const s = stateAttr.trim().toLowerCase();
  if (s === 'correct') return 2;
  if (s === 'present') return 1;
  if (s === 'absent') return 0;
  // 'empty', 'tbd', 'edit', 'evaluating' are not evaluated states
  return null;
}

/**
 * Extracts letter character from tile element.
 */
function extractTileLetter(el: Element): string {
  // 1. Direct letter attribute (e.g. Shadow DOM <game-tile letter="A"> or data-letter="A")
  const attrLetter = el.getAttribute('data-letter') ?? el.getAttribute('letter');
  if (attrLetter && /^[a-zA-Z]$/.test(attrLetter.trim())) {
    return attrLetter.trim().toUpperCase();
  }

  // 2. Direct text content
  const text = el.textContent?.trim() ?? '';
  if (text.length === 1 && /^[a-zA-Z]$/.test(text)) {
    return text.toUpperCase();
  }

  // 3. Fallback: Parse aria-label (e.g. "1st letter, C, absent")
  const aria = el.getAttribute('aria-label') ?? '';
  const match = aria.match(/(?:letter|tile),?\s*([A-Za-z])\b/i) || aria.match(/\b([A-Za-z])\b/);
  if (match && match[1] && /^[a-zA-Z]$/.test(match[1])) {
    return match[1].toUpperCase();
  }

  return '';
}

/**
 * Parses an individual tile element.
 */
function parseTileElement(el: Element): ParsedTile {
  const letter = extractTileLetter(el);
  const stateAttr = el.getAttribute('data-state');
  const animationAttr = el.getAttribute('data-animation');
  const className = el.getAttribute('class') ?? '';

  const isEvaluating =
    stateAttr === 'evaluating' ||
    animationAttr === 'flip' ||
    className.includes('evaluating') ||
    className.includes('flipping');

  const feedback = isEvaluating ? null : normalizeTileState(stateAttr);

  return { letter, feedback, isEvaluating };
}

/**
 * Evaluates whether 5 parsed tiles constitute a fully submitted, valid turn.
 */
function evaluateRow(tiles: readonly ParsedTile[]): ParsedRow {
  if (tiles.length !== 5) {
    return { isSubmitted: false, record: null };
  }

  // If any tile is actively evaluating or flipping, the row is not ready
  if (tiles.some((t) => t.isEvaluating)) {
    return { isSubmitted: false, record: null };
  }

  // All 5 tiles must have a confirmed feedback evaluation (0, 1, or 2)
  const allEvaluated = tiles.every((t) => t.feedback !== null);
  if (!allEvaluated) {
    return { isSubmitted: false, record: null };
  }

  const guessChars = tiles.map((t) => t.letter);
  const guess = guessChars.join('');

  if (guess.length !== 5 || !isValidWord(guess)) {
    return { isSubmitted: false, record: null };
  }

  const feedback: FeedbackPattern = [
    tiles[0]!.feedback!,
    tiles[1]!.feedback!,
    tiles[2]!.feedback!,
    tiles[3]!.feedback!,
    tiles[4]!.feedback!,
  ];

  return {
    isSubmitted: true,
    record: { guess, feedback },
  };
}

/**
 * Strategy A: Modern CSS Modules & Attribute Selectors (NYT React frontend).
 */
function extractViaCssModules(root: Element | Document): { rows: readonly ParsedRow[] } | null {
  // Query rows by class prefix or board structure
  const rowElements = root.querySelectorAll('div[class*="Row-module_row"], div[class*="Row-module"]');
  if (rowElements.length === 0) {
    return null;
  }

  const parsedRows: ParsedRow[] = [];

  for (let i = 0; i < rowElements.length; i++) {
    const rowEl = rowElements[i]!;
    const tileElements = rowEl.querySelectorAll(
      'div[class*="Tile-module_tile"], div[data-state], [data-testid="tile"]'
    );

    if (tileElements.length === 5) {
      const tiles: ParsedTile[] = [];
      for (let j = 0; j < 5; j++) {
        tiles.push(parseTileElement(tileElements[j]!));
      }
      parsedRows.push(evaluateRow(tiles));
    }
  }

  return parsedRows.length > 0 ? { rows: parsedRows } : null;
}

/**
 * Strategy B: Shadow DOM Traversal (Legacy NYT Web Components).
 */
function extractViaShadowDom(root: Element | Document): { rows: readonly ParsedRow[] } | null {
  const gameApp =
    root instanceof Element && root.tagName.toLowerCase() === 'game-app'
      ? root
      : root.querySelector('game-app');
  if (!gameApp || !gameApp.shadowRoot) {
    return null;
  }

  const gameBoard = gameApp.shadowRoot.querySelector('game-board');
  if (!gameBoard || !gameBoard.shadowRoot) {
    return null;
  }

  const gameRows = gameBoard.shadowRoot.querySelectorAll('game-row');
  if (gameRows.length === 0) {
    return null;
  }

  const parsedRows: ParsedRow[] = [];

  for (let i = 0; i < gameRows.length; i++) {
    const rowEl = gameRows[i]!;
    const tilesEl = rowEl.shadowRoot
      ? rowEl.shadowRoot.querySelectorAll('game-tile')
      : rowEl.querySelectorAll('game-tile');

    if (tilesEl.length === 5) {
      const tiles: ParsedTile[] = [];
      for (let j = 0; j < 5; j++) {
        tiles.push(parseTileElement(tilesEl[j]!));
      }
      parsedRows.push(evaluateRow(tiles));
    }
  }

  return parsedRows.length > 0 ? { rows: parsedRows } : null;
}

/**
 * Strategy C: Semantic ARIA & Grid Fallback.
 */
function extractViaSemanticAria(root: Element | Document): { rows: readonly ParsedRow[] } | null {
  const rowElements = root.querySelectorAll('[role="group"], [aria-label*="Row"], [aria-label*="row"]');
  if (rowElements.length === 0) {
    return null;
  }

  const parsedRows: ParsedRow[] = [];

  for (let i = 0; i < rowElements.length; i++) {
    const rowEl = rowElements[i]!;
    // Find child tiles with data-state or button/tile role
    const tileElements = rowEl.querySelectorAll('[data-state], [role="button"], [role="cell"], button, div');
    // Filter to immediate tile candidates (5 elements per row)
    const directTiles = Array.from(tileElements).filter((el) => {
      const state = el.getAttribute('data-state');
      return state !== null || el.getAttribute('aria-label') !== null;
    });

    if (directTiles.length === 5) {
      const tiles: ParsedTile[] = [];
      for (let j = 0; j < 5; j++) {
        tiles.push(parseTileElement(directTiles[j]!));
      }
      parsedRows.push(evaluateRow(tiles));
    }
  }

  return parsedRows.length > 0 ? { rows: parsedRows } : null;
}

/**
 * Main entry point: Extracts submitted observations and game state from the active Wordle DOM.
 * Read-only: never modifies the DOM, simulates inputs, or triggers synthetic clicks.
 *
 * @param root Document or Element representing the page root (defaults to global document)
 * @returns DOMBoardExtraction
 */
export function extractBoardState(root: Element | Document = document): DOMBoardExtraction {
  try {
    if (!root) {
      return {
        success: false,
        strategy: 'NONE',
        turns: [],
        activeRowIndex: 0,
        isRoundWon: false,
        isRoundLost: false,
        isComplete: false,
        error: 'ROOT_NODE_UNAVAILABLE',
        rawRowsFound: 0,
      };
    }

    let strategy: ReaderStrategy = 'NONE';
    let extraction: { rows: readonly ParsedRow[] } | null = null;

    // Try Strategy A: CSS Modules
    extraction = extractViaCssModules(root);
    if (extraction && extraction.rows.length > 0) {
      strategy = 'CSS_MODULES';
    }

    // Try Strategy B: Shadow DOM if Strategy A yielded nothing
    if (!extraction || extraction.rows.length === 0) {
      extraction = extractViaShadowDom(root);
      if (extraction && extraction.rows.length > 0) {
        strategy = 'SHADOW_DOM';
      }
    }

    // Try Strategy C: Semantic ARIA if Strategies A and B failed
    if (!extraction || extraction.rows.length === 0) {
      extraction = extractViaSemanticAria(root);
      if (extraction && extraction.rows.length > 0) {
        strategy = 'SEMANTIC_ARIA';
      }
    }

    // If no strategy succeeded in discovering rows
    if (!extraction || extraction.rows.length === 0) {
      return {
        success: false,
        strategy: 'NONE',
        turns: [],
        activeRowIndex: 0,
        isRoundWon: false,
        isRoundLost: false,
        isComplete: false,
        error: 'UNSUPPORTED_DOM_STRUCTURE',
        rawRowsFound: 0,
      };
    }

    const rawRows = extraction.rows;
    const submittedTurns: TurnRecord[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]!;
      if (row.isSubmitted && row.record) {
        submittedTurns.push(row.record);
      } else {
        // Wordle rows are strictly played sequentially.
        // Once an unsubmitted row is encountered, subsequent rows cannot be submitted.
        break;
      }
    }

    const isRoundWon = submittedTurns.some((t) => t.feedback.every((tile) => tile === 2));
    const isRoundLost = !isRoundWon && submittedTurns.length >= 6;
    const isComplete = isRoundWon || isRoundLost;

    return {
      success: true,
      strategy,
      turns: submittedTurns,
      activeRowIndex: submittedTurns.length,
      isRoundWon,
      isRoundLost,
      isComplete,
      rawRowsFound: rawRows.length,
    };
  } catch (err: unknown) {
    return {
      success: false,
      strategy: 'NONE',
      turns: [],
      activeRowIndex: 0,
      isRoundWon: false,
      isRoundLost: false,
      isComplete: false,
      error: err instanceof Error ? err.message : 'UNEXPECTED_EXTRACTION_ERROR',
      rawRowsFound: 0,
    };
  }
}
