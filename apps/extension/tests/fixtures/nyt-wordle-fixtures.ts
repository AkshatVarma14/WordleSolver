/**
 * Test fixtures reproducing various NYT Wordle DOM architectures:
 * - Modern CSS Modules layout
 * - Legacy Shadow DOM / Web Components layout
 * - Incomplete & animating rows
 * - Unsupported / corrupted structures
 */

export interface TestRowSpec {
  readonly guess: string;
  readonly states: readonly ('correct' | 'present' | 'absent' | 'empty' | 'tbd' | 'evaluating')[];
  readonly animation?: 'flip' | 'idle';
}

/**
 * Creates a modern NYT Wordle CSS-modules DOM tree.
 */
export function createCssModulesBoard(specs: readonly TestRowSpec[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'Board-module_boardContainer__abc12';

  const board = document.createElement('div');
  board.className = 'Board-module_board__xyz89';
  container.appendChild(board);

  for (let r = 0; r < 6; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'Row-module_row__def45';
    rowEl.setAttribute('role', 'group');
    rowEl.setAttribute('aria-label', `Row ${r + 1}`);

    const spec = specs[r];

    for (let c = 0; c < 5; c++) {
      const tileEl = document.createElement('div');
      tileEl.className = 'Tile-module_tile__ghi67';

      if (spec) {
        const letter = spec.guess[c] ?? '';
        const state = spec.states[c] ?? 'empty';
        tileEl.textContent = letter;
        tileEl.setAttribute('data-state', state);
        tileEl.setAttribute('data-letter', letter);
        if (spec.animation) {
          tileEl.setAttribute('data-animation', spec.animation);
        }
      } else {
        tileEl.setAttribute('data-state', 'empty');
      }

      rowEl.appendChild(tileEl);
    }

    board.appendChild(rowEl);
  }

  return container;
}

/**
 * Creates a legacy NYT Shadow DOM tree using standard custom elements.
 */
export function createShadowDomBoard(specs: readonly TestRowSpec[]): HTMLElement {
  const gameApp = document.createElement('game-app');
  const appShadow = gameApp.attachShadow({ mode: 'open' });

  const gameBoard = document.createElement('game-board');
  const boardShadow = gameBoard.attachShadow({ mode: 'open' });
  appShadow.appendChild(gameBoard);

  for (let r = 0; r < 6; r++) {
    const gameRow = document.createElement('game-row');
    const rowShadow = gameRow.attachShadow({ mode: 'open' });

    const spec = specs[r];

    for (let c = 0; c < 5; c++) {
      const gameTile = document.createElement('game-tile');
      if (spec) {
        const letter = spec.guess[c] ?? '';
        const state = spec.states[c] ?? 'empty';
        gameTile.setAttribute('letter', letter);
        gameTile.setAttribute('data-state', state);
      } else {
        gameTile.setAttribute('data-state', 'empty');
      }
      rowShadow.appendChild(gameTile);
    }

    boardShadow.appendChild(gameRow);
  }

  return gameApp;
}

/**
 * Creates an unsupported generic DOM structure (e.g. blog post or landing page).
 */
export function createUnsupportedDom(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-article-wrapper';
  wrapper.innerHTML = `
    <article>
      <h1>Today's NYT Wordle Guide</h1>
      <p>Hints and answers for puzzle #1234.</p>
      <ul>
        <li>First word: SALET</li>
      </ul>
    </article>
  `;
  return wrapper;
}
