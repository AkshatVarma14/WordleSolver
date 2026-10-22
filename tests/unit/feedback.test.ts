import { describe, it, expect } from 'vitest';
import {
  evaluateFeedback,
  evaluateFeedbackRaw,
  isValidWord,
  validateWord,
  TileState,
  InvalidWordError,
} from '@wordle-solver/solver';

describe('Wordle Feedback Engine (evaluateFeedback)', () => {
  describe('Documented Test Cases (TC-FB-01 to TC-FB-08)', () => {
    it('TC-FB-01: Exact match gives all-green [2, 2, 2, 2, 2]', () => {
      const feedback = evaluateFeedback('CRANE', 'CRANE');
      expect(feedback).toEqual([
        TileState.GREEN,
        TileState.GREEN,
        TileState.GREEN,
        TileState.GREEN,
        TileState.GREEN,
      ]);
      expect(feedback).toEqual([2, 2, 2, 2, 2]);
    });

    it('TC-FB-02: Completely disjoint letters give all-grey [0, 0, 0, 0, 0]', () => {
      const feedback = evaluateFeedback('PLUMB', 'FIGHT');
      expect(feedback).toEqual([
        TileState.GREY,
        TileState.GREY,
        TileState.GREY,
        TileState.GREY,
        TileState.GREY,
      ]);
      expect(feedback).toEqual([0, 0, 0, 0, 0]);
    });

    it('TC-FB-03: Mixed positions without repeated letters (ROBOT vs TORCH)', () => {
      // R: TORCH has R at pos 2 -> Yellow (1)
      // O: TORCH has O at pos 1 -> Green (2)
      // B: TORCH has no B -> Grey (0)
      // O: First O already matched Green -> Grey (0)
      // T: TORCH has T at pos 0 -> Yellow (1)
      const feedback = evaluateFeedback('ROBOT', 'TORCH');
      expect(feedback).toEqual([1, 2, 0, 0, 1]);
    });

    it('TC-FB-04: Repeated letter in guess with green resolution (SPEED vs ELAND, ABIDE, ROBED)', () => {
      // Guess SPEED vs Answer ELAND:
      // ELAND has E at pos 0 and D at pos 4.
      // Pos 2 E is Yellow (1), Pos 3 E is Grey (0), Pos 4 D is Green (2).
      const feedbackEland = evaluateFeedback('SPEED', 'ELAND');
      expect(feedbackEland).toEqual([0, 0, 1, 0, 2]);

      // Guess SPEED vs Answer ABIDE:
      // ABIDE has D at index 3, E at index 4.
      // S: 0, P: 0, E (pos 2): Yellow (1), E (pos 3): Grey (0), D (pos 4): Yellow (1).
      const feedbackAbide = evaluateFeedback('SPEED', 'ABIDE');
      expect(feedbackAbide).toEqual([0, 0, 1, 0, 1]);

      // Guess SPEED vs Answer ROBED:
      // ROBED has E at pos 3 and D at pos 4.
      // Pos 3 E is Green (2), Pos 4 D is Green (2). Pos 2 E is Grey (0) because ROBED's only E is consumed at pos 3.
      const feedbackRobed = evaluateFeedback('SPEED', 'ROBED');
      expect(feedbackRobed).toEqual([0, 0, 0, 2, 2]);
    });

    it('TC-FB-05: Duplicate letter allocation in guess (ERASE vs PLEAT and ERASE vs STEAL)', () => {
      // Guess ERASE vs Answer PLEAT:
      // PLEAT has 1 E, 1 A, no R, no S.
      // Pos 0 E: Yellow (1), Pos 1 R: Grey (0), Pos 2 A: Yellow (1), Pos 3 S: Grey (0), Pos 4 E: Grey (0)
      const feedbackPleat = evaluateFeedback('ERASE', 'PLEAT');
      expect(feedbackPleat).toEqual([1, 0, 1, 0, 0]);

      // Guess ERASE vs Answer STEAL:
      // STEAL has 1 E, 1 A, 1 S.
      // Pos 0 E: Yellow (1), Pos 1 R: Grey (0), Pos 2 A: Yellow (1), Pos 3 S: Yellow (1), Pos 4 E: Grey (0)
      const feedbackSteal = evaluateFeedback('ERASE', 'STEAL');
      expect(feedbackSteal).toEqual([1, 0, 1, 1, 0]);
    });

    it('TC-FB-06: Triple letter in guess vs single in answer, Green prioritized over earlier positions (GEESE vs CRANE)', () => {
      // Guess GEESE has E at pos 1, 2, 4. Answer CRANE has 1 E at pos 4.
      // Pass 1: Pos 4 E matches CRANE[4] E -> Green (2). E frequency in CRANE is now 0.
      // Pass 2: Pos 1 and Pos 2 find 0 available E's -> Grey (0).
      const feedback = evaluateFeedback('GEESE', 'CRANE');
      expect(feedback).toEqual([0, 0, 0, 0, 2]);
    });

    it('TC-FB-07: Duplicate letters in both guess and answer (ALLOY vs LLAMA)', () => {
      // Guess ALLOY (A at 0, L at 1, L at 2, O at 3, Y at 4)
      // Answer LLAMA (L at 0, L at 1, A at 2, M at 3, A at 4)
      // Pass 1: ALLOY[1] ('L') === LLAMA[1] ('L') -> Green (2). Remaining in LLAMA: L: 1, A: 2, M: 1.
      // Pass 2:
      // Pos 0 'A': LLAMA has available A -> Yellow (1). A count: 1.
      // Pos 1: already Green.
      // Pos 2 'L': LLAMA has remaining L at pos 0 -> Yellow (1). L count: 0.
      // Pos 3 'O': Grey (0).
      // Pos 4 'Y': Grey (0).
      const feedback = evaluateFeedback('ALLOY', 'LLAMA');
      expect(feedback).toEqual([1, 2, 1, 0, 0]);
    });

    it('TC-FB-08: Multiple duplicates with multiple Green matches (KAPPA vs PUPPY)', () => {
      // Guess KAPPA has P at pos 2 and pos 3.
      // Answer PUPPY has P at pos 0, pos 2, pos 3.
      // Pass 1: Pos 2 and Pos 3 both match exactly -> Green (2), Green (2).
      // Pass 2: Remaining letters (K, A, A) not in PUPPY -> Grey (0).
      const feedback = evaluateFeedback('KAPPA', 'PUPPY');
      expect(feedback).toEqual([0, 0, 2, 2, 0]);
    });
  });

  describe('Additional Edge Cases & Semantic Rigor', () => {
    it('Reserves Green matches appearing after Yellow candidates (BABES vs ABBEY)', () => {
      // Guess:  B (0) A (1) B (2) E (3) S (4)
      // Target: A (0) B (1) B (2) E (3) Y (4)
      // Pass 1:
      // Pos 2 'B' === 'B' -> Green (2)
      // Pos 3 'E' === 'E' -> Green (2)
      // Pass 2:
      // Pos 0 'B': ABBEY has remaining 'B' at pos 1 -> Yellow (1)
      // Pos 1 'A': ABBEY has 'A' at pos 0 -> Yellow (1)
      // Pos 4 'S': Grey (0)
      const feedback = evaluateFeedback('BABES', 'ABBEY');
      expect(feedback).toEqual([1, 1, 2, 2, 0]);
    });

    it('Handles full anagram without positional overlap (BLEAT vs TABLE)', () => {
      // All 5 letters exist in target but none in correct position -> all yellow
      const feedback = evaluateFeedback('BLEAT', 'TABLE');
      expect(feedback).toEqual([1, 1, 1, 1, 1]);
    });

    it('Handles guess with single letter when target has multiple (SLATE vs EERIE)', () => {
      // EERIE has 3 E's (indices 0, 1, 4).
      // SLATE has 1 E at index 4, which is an exact Green match.
      const feedback = evaluateFeedback('SLATE', 'EERIE');
      expect(feedback).toEqual([0, 0, 0, 0, 2]);
    });

    it('Handles target with duplicate letters when guess has non-matching duplicate (MAMMA vs APPLE)', () => {
      // Guess:  M A M M A
      // Target: A P P L E
      // Pos 1 'A' matches A in APPLE -> Yellow (1). Pos 4 'A' exhausted -> Grey (0).
      const feedback = evaluateFeedback('MAMMA', 'APPLE');
      expect(feedback).toEqual([0, 1, 0, 0, 0]);
    });

    it('Normalizes lowercase and mixed-case inputs seamlessly', () => {
      expect(evaluateFeedback('crane', 'CRANE')).toEqual([2, 2, 2, 2, 2]);
      expect(evaluateFeedback('rObOt', 'tOrCh')).toEqual([1, 2, 0, 0, 1]);
      expect(evaluateFeedback('speed', 'eland')).toEqual([0, 0, 1, 0, 2]);
    });

    it('Fast unvalidated evaluateFeedbackRaw matches evaluateFeedback', () => {
      expect(evaluateFeedbackRaw('CRANE', 'CRANE')).toEqual([2, 2, 2, 2, 2]);
      expect(evaluateFeedbackRaw('ROBOT', 'TORCH')).toEqual([1, 2, 0, 0, 1]);
      expect(evaluateFeedbackRaw('GEESE', 'CRANE')).toEqual([0, 0, 0, 0, 2]);
      expect(evaluateFeedbackRaw('ALLOY', 'LLAMA')).toEqual([1, 2, 1, 0, 0]);
    });
  });

  describe('Input Validation & Error Contract', () => {
    it('Accepts valid 5-letter alphabetic strings with isValidWord', () => {
      expect(isValidWord('CRANE')).toBe(true);
      expect(isValidWord('crane')).toBe(true);
      expect(isValidWord('Robot')).toBe(true);
    });

    it('Rejects malformed inputs with isValidWord', () => {
      expect(isValidWord('')).toBe(false);
      expect(isValidWord('FOUR')).toBe(false);
      expect(isValidWord('SIXLET')).toBe(false);
      expect(isValidWord('CRAN1')).toBe(false);
      expect(isValidWord('CR!NE')).toBe(false);
      expect(isValidWord(null)).toBe(false);
      expect(isValidWord(undefined)).toBe(false);
      expect(isValidWord(12345)).toBe(false);
    });

    it('Throws InvalidWordError when guess length is not 5', () => {
      expect(() => evaluateFeedback('FOUR', 'CRANE')).toThrow(InvalidWordError);
      try {
        evaluateFeedback('FOUR', 'CRANE');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidWordError);
        const err = e as InvalidWordError;
        expect(err.field).toBe('guess');
        expect(err.value).toBe('FOUR');
        expect(err.message).toContain('Word length must be exactly 5 letters');
      }
    });

    it('Throws InvalidWordError when answer length is not 5', () => {
      expect(() => evaluateFeedback('CRANE', 'TOOLONG')).toThrow(InvalidWordError);
      try {
        evaluateFeedback('CRANE', 'TOOLONG');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidWordError);
        const err = e as InvalidWordError;
        expect(err.field).toBe('answer');
        expect(err.value).toBe('TOOLONG');
      }
    });

    it('Throws InvalidWordError when non-alphabetic characters are provided', () => {
      expect(() => evaluateFeedback('CR4NE', 'CRANE')).toThrow(InvalidWordError);
      expect(() => evaluateFeedback('CRANE', 'CR@NE')).toThrow(InvalidWordError);
      expect(() => evaluateFeedback('CR NE', 'CRANE')).toThrow(InvalidWordError);
    });

    it('Throws InvalidWordError when input is not a string', () => {
      // @ts-expect-error Testing runtime invalid type
      expect(() => evaluateFeedback(null, 'CRANE')).toThrow(InvalidWordError);
      // @ts-expect-error Testing runtime invalid type
      expect(() => evaluateFeedback('CRANE', 12345)).toThrow(InvalidWordError);
    });

    it('validateWord normalizes casing to uppercase', () => {
      expect(validateWord('crane', 'guess')).toBe('CRANE');
      expect(validateWord('CrAnE', 'answer')).toBe('CRANE');
    });
  });
});
