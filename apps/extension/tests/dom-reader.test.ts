import { describe, it, expect } from 'vitest';
import { extractBoardState } from '../src/content/dom-reader';
import {
  createCssModulesBoard,
  createShadowDomBoard,
  createUnsupportedDom,
} from './fixtures/nyt-wordle-fixtures';

describe('Chrome Extension DOM Reader Foundation (Stage 8B)', () => {
  describe('1. Fresh Empty Board', () => {
    it('Extracts zero submitted turns on a newly initialized board', () => {
      const board = createCssModulesBoard([]);
      const result = extractBoardState(board);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('CSS_MODULES');
      expect(result.turns).toEqual([]);
      expect(result.activeRowIndex).toBe(0);
      expect(result.isRoundWon).toBe(false);
      expect(result.isRoundLost).toBe(false);
      expect(result.isComplete).toBe(false);
      expect(result.rawRowsFound).toBe(6);
    });
  });

  describe('2. One and Multiple Submitted Rows', () => {
    it('Extracts a single submitted row with normalized feedback', () => {
      const board = createCssModulesBoard([
        {
          guess: 'SLATE',
          states: ['absent', 'absent', 'present', 'absent', 'correct'],
        },
      ]);

      const result = extractBoardState(board);

      expect(result.success).toBe(true);
      expect(result.turns.length).toBe(1);
      expect(result.turns[0]?.guess).toBe('SLATE');
      // S:0 (absent), L:0 (absent), A:1 (present), T:0 (absent), E:2 (correct)
      expect(result.turns[0]?.feedback).toEqual([0, 0, 1, 0, 2]);
      expect(result.activeRowIndex).toBe(1);
      expect(result.isRoundWon).toBe(false);
    });

    it('Extracts multiple sequentially submitted rows', () => {
      const board = createCssModulesBoard([
        {
          guess: 'CRANE',
          states: ['absent', 'present', 'absent', 'absent', 'correct'],
        },
        {
          guess: 'TOILS',
          states: ['correct', 'absent', 'absent', 'absent', 'absent'],
        },
      ]);

      const result = extractBoardState(board);

      expect(result.success).toBe(true);
      expect(result.turns.length).toBe(2);
      expect(result.turns[0]?.guess).toBe('CRANE');
      expect(result.turns[0]?.feedback).toEqual([0, 1, 0, 0, 2]);
      expect(result.turns[1]?.guess).toBe('TOILS');
      expect(result.turns[1]?.feedback).toEqual([2, 0, 0, 0, 0]);
      expect(result.activeRowIndex).toBe(2);
    });
  });

  describe('3. Green, Yellow, and Grey Tile Normalization', () => {
    it('Maps correct -> 2 (Green), present -> 1 (Yellow), absent -> 0 (Grey)', () => {
      const board = createCssModulesBoard([
        {
          guess: 'AUDIO',
          states: ['correct', 'present', 'absent', 'present', 'correct'],
        },
      ]);

      const result = extractBoardState(board);

      expect(result.turns[0]?.feedback).toEqual([2, 1, 0, 1, 2]);
    });
  });

  describe('4. Duplicate Letter Feedback Extraction', () => {
    it('Accurately preserves letter positions for repeated letters (e.g. SPEED with distinct tile evaluations)', () => {
      // In SPEED, first E is correct (green), second E is present (yellow)
      const board = createCssModulesBoard([
        {
          guess: 'SPEED',
          states: ['absent', 'absent', 'correct', 'present', 'absent'],
        },
      ]);

      const result = extractBoardState(board);

      expect(result.turns.length).toBe(1);
      expect(result.turns[0]?.guess).toBe('SPEED');
      expect(result.turns[0]?.feedback).toEqual([0, 0, 2, 1, 0]);
    });
  });

  describe('5. Incomplete and Currently Animating Rows', () => {
    it('Ignores in-progress rows with partially typed letters (tbd / empty)', () => {
      const board = createCssModulesBoard([
        {
          guess: 'CRANE',
          states: ['absent', 'absent', 'absent', 'absent', 'absent'],
        },
        // Active Row 2: user typed 'SL' but hasn't submitted yet
        {
          guess: 'SL',
          states: ['tbd', 'tbd', 'empty', 'empty', 'empty'],
        },
      ]);

      const result = extractBoardState(board);

      // Only the first row is submitted
      expect(result.turns.length).toBe(1);
      expect(result.turns[0]?.guess).toBe('CRANE');
      expect(result.activeRowIndex).toBe(1);
    });

    it('Ignores rows currently animating (flip animation in progress)', () => {
      const board = createCssModulesBoard([
        {
          guess: 'CRANE',
          states: ['absent', 'absent', 'absent', 'absent', 'absent'],
        },
        // Row 2 is actively flipping (evaluating)
        {
          guess: 'PLUMB',
          states: ['correct', 'evaluating', 'empty', 'empty', 'empty'],
          animation: 'flip',
        },
      ]);

      const result = extractBoardState(board);

      expect(result.turns.length).toBe(1);
      expect(result.turns[0]?.guess).toBe('CRANE');
      expect(result.activeRowIndex).toBe(1);
    });
  });

  describe('6. Unsupported DOM Structure & Graceful Failure', () => {
    it('Returns failure status without crashing when presented with arbitrary DOM markup', () => {
      const unsupported = createUnsupportedDom();
      const result = extractBoardState(unsupported);

      expect(result.success).toBe(false);
      expect(result.strategy).toBe('NONE');
      expect(result.turns).toEqual([]);
      expect(result.error).toBe('UNSUPPORTED_DOM_STRUCTURE');
      expect(result.rawRowsFound).toBe(0);
    });
  });

  describe('7. Legacy Shadow DOM Traversal', () => {
    it('Successfully traverses custom elements with open shadow roots (<game-app>)', () => {
      const shadowBoard = createShadowDomBoard([
        {
          guess: 'ROBOT',
          states: ['present', 'absent', 'absent', 'correct', 'absent'],
        },
      ]);

      const result = extractBoardState(shadowBoard);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('SHADOW_DOM');
      expect(result.turns.length).toBe(1);
      expect(result.turns[0]?.guess).toBe('ROBOT');
      expect(result.turns[0]?.feedback).toEqual([1, 0, 0, 2, 0]);
      expect(result.activeRowIndex).toBe(1);
    });
  });

  describe('8. Round Completion Detection', () => {
    it('Flags isRoundWon: true and isComplete: true when 5 confirmed Green tiles appear', () => {
      const board = createCssModulesBoard([
        {
          guess: 'SALET',
          states: ['absent', 'present', 'absent', 'absent', 'absent'],
        },
        {
          guess: 'CRANE',
          states: ['correct', 'correct', 'correct', 'correct', 'correct'],
        },
      ]);

      const result = extractBoardState(board);

      expect(result.success).toBe(true);
      expect(result.turns.length).toBe(2);
      expect(result.isRoundWon).toBe(true);
      expect(result.isRoundLost).toBe(false);
      expect(result.isComplete).toBe(true);
    });

    it('Flags isRoundLost: true when 6 rows are played without solving', () => {
      const board = createCssModulesBoard([
        { guess: 'SLATE', states: ['absent', 'absent', 'absent', 'absent', 'absent'] },
        { guess: 'CRONY', states: ['absent', 'absent', 'absent', 'absent', 'absent'] },
        { guess: 'HUMPH', states: ['absent', 'absent', 'absent', 'absent', 'absent'] },
        { guess: 'GUIDE', states: ['absent', 'absent', 'absent', 'absent', 'absent'] },
        { guess: 'BAZAR', states: ['absent', 'absent', 'absent', 'absent', 'absent'] },
        { guess: 'FJORD', states: ['absent', 'absent', 'absent', 'absent', 'absent'] },
      ]);

      const result = extractBoardState(board);

      expect(result.success).toBe(true);
      expect(result.turns.length).toBe(6);
      expect(result.isRoundWon).toBe(false);
      expect(result.isRoundLost).toBe(true);
      expect(result.isComplete).toBe(true);
    });
  });

  describe('9. Read-Only Integrity', () => {
    it('Leaves the underlying DOM completely unmutated after extraction', () => {
      const board = createCssModulesBoard([
        { guess: 'TRACE', states: ['present', 'absent', 'correct', 'absent', 'absent'] },
      ]);

      const htmlBefore = board.innerHTML;
      extractBoardState(board);
      const htmlAfter = board.innerHTML;

      expect(htmlBefore).toBe(htmlAfter);
    });
  });
});
