import { describe, it, expect } from 'vitest';
import {
  filterCandidates,
  filterByHistory,
  isValidFeedbackPattern,
  validateFeedbackPattern,
  patternsMatch,
  InvalidFeedbackError,
  InvalidWordError,
  TurnRecord,
} from '@wordle-solver/solver';

describe('Candidate Filtering Engine (filterCandidates & filterByHistory)', () => {
  const sampleCandidates = [
    'CRANE',
    'SLATE',
    'PLEAT',
    'PLATE',
    'TRACE',
    'BRAKE',
    'SHINE',
    'ROBOT',
    'PLUMB',
  ];

  describe('Basic Filtering Semantics', () => {
    it('Filters candidate set to exact matches when all-green is observed', () => {
      // Guess CRANE with all-green [2, 2, 2, 2, 2] should keep only CRANE
      const filtered = filterCandidates(sampleCandidates, 'CRANE', [2, 2, 2, 2, 2]);
      expect(filtered).toEqual(['CRANE']);
    });

    it('Eliminates candidate if feedback does not match', () => {
      // Guess CRANE with all-grey [0, 0, 0, 0, 0] must eliminate any word containing C, R, A, N, or E.
      // ROBOT contains 'R' (producing [0, 1, 0, 0, 0]), so it is eliminated.
      // PLUMB contains no C, R, A, N, or E: PLUMB against CRANE produces [0, 0, 0, 0, 0]!
      const filtered = filterCandidates(sampleCandidates, 'CRANE', [0, 0, 0, 0, 0]);
      expect(filtered).toEqual(['PLUMB']);
    });

    it('Correctly filters with repeated letter feedback patterns', () => {
      const candidates = ['SPEED', 'ABIDE', 'ROBED', 'ELAND', 'CREED'];
      // Guess SPEED with feedback [0, 0, 1, 0, 2]
      // In Stage 1 we proved that only ELAND produces [0, 0, 1, 0, 2] against SPEED
      const filtered = filterCandidates(candidates, 'SPEED', [0, 0, 1, 0, 2]);
      expect(filtered).toEqual(['ELAND']);
    });

    it('Preserves deterministic ordering of input candidates', () => {
      const candidates = ['TRACE', 'PLATE', 'BRAKE', 'SLATE'];
      // Filter candidates where letter at pos 4 is 'E' (Green) and has 'A' at pos 2 (Green)
      // Guess SHAKE -> feedback:
      // TRACE against SHAKE: S:0, H:0, A:2, K:0, E:2 -> [0, 0, 2, 0, 2]
      // PLATE against SHAKE: P:0, L:0, A:2, K:0, E:2 -> [0, 0, 2, 0, 2]
      // BRAKE against SHAKE: B:0, R:0, A:2, K:2, E:2 -> [0, 0, 2, 2, 2]
      // SLATE against SHAKE: S:2, L:0, A:2, K:0, E:2 -> [2, 0, 2, 0, 2]
      const filtered = filterCandidates(candidates, 'SHAKE', [0, 0, 2, 0, 2]);
      expect(filtered).toEqual(['TRACE', 'PLATE']);
    });

    it('Invariant: Filtered candidate set is strictly a subset of input (never introduces new words)', () => {
      const candidates = ['CRANE', 'SLATE'];
      const filtered = filterCandidates(candidates, 'ROBOT', [0, 0, 0, 0, 0]);
      for (const word of filtered) {
        expect(candidates).toContain(word);
      }
      expect(filtered.length).toBeLessThanOrEqual(candidates.length);
    });

    it('Returns empty array when candidates pool is empty', () => {
      const filtered = filterCandidates([], 'CRANE', [2, 2, 2, 2, 2]);
      expect(filtered).toEqual([]);
    });
  });

  describe('Turn History & Contradiction Detection (filterByHistory)', () => {
    it('Filters sequentially across multiple turns', () => {
      const initialPool = ['CRANE', 'TRACE', 'GRACE', 'BRACE', 'SLATE'];
      const history: TurnRecord[] = [
        // Turn 1: Guess STARE -> feedback for CRANE:
        // S:0, T:0, A:2, R:1, E:2 -> [0, 0, 2, 1, 2]
        { guess: 'STARE', feedback: [0, 0, 2, 1, 2] },
      ];

      const result = filterByHistory(initialPool, history);
      expect(result.initialCount).toBe(5);
      expect(result.isContradiction).toBe(false);
      // STARE vs TRACE: T at pos 1 is Yellow ([0, 1, 2, 1, 2]), so TRACE is excluded
      // Words with no S and no T, A at pos 2, R elsewhere, and E at pos 4 are retained:
      expect(result.candidates).toEqual(['CRANE', 'GRACE', 'BRACE']);
    });

    it('Detects contradiction when history eliminates all candidates without fabricating answers', () => {
      const initialPool = ['CRANE', 'SLATE'];
      const history: TurnRecord[] = [
        // Claiming pos 0 is 'Z' (Green) when none of the candidates start with Z
        { guess: 'ZEBRA', feedback: [2, 0, 0, 0, 0] },
      ];

      const result = filterByHistory(initialPool, history);
      expect(result.initialCount).toBe(2);
      expect(result.remainingCount).toBe(0);
      expect(result.candidates).toEqual([]);
      expect(result.isContradiction).toBe(true);
      expect(result.stepCounts).toEqual([0]);
    });

    it('Reports no contradiction when starting with empty candidates', () => {
      const result = filterByHistory([], []);
      expect(result.initialCount).toBe(0);
      expect(result.remainingCount).toBe(0);
      expect(result.isContradiction).toBe(false);
    });

    it('Tracks step counts across each historical turn', () => {
      const initialPool = ['CRANE', 'TRACE', 'ROBOT'];
      const history: TurnRecord[] = [
        // Turn 1: eliminates ROBOT
        { guess: 'PLUMB', feedback: [0, 0, 0, 0, 0] },
        // Turn 2: guess CRANE with all-green keeps only CRANE
        { guess: 'CRANE', feedback: [2, 2, 2, 2, 2] },
      ];

      const result = filterByHistory(initialPool, history);
      expect(result.stepCounts).toEqual([2, 1]);
      expect(result.candidates).toEqual(['CRANE']);
      expect(result.isContradiction).toBe(false);
    });
  });

  describe('Validation & Pattern Helpers', () => {
    it('isValidFeedbackPattern correctly validates patterns', () => {
      expect(isValidFeedbackPattern([0, 1, 2, 0, 1])).toBe(true);
      expect(isValidFeedbackPattern([2, 2, 2, 2, 2])).toBe(true);
      expect(isValidFeedbackPattern([0, 0, 0, 0, 0])).toBe(true);
      expect(isValidFeedbackPattern([0, 1, 2, 0])).toBe(false); // length 4
      expect(isValidFeedbackPattern([0, 1, 2, 0, 3])).toBe(false); // value 3
      expect(isValidFeedbackPattern('not an array')).toBe(false);
      expect(isValidFeedbackPattern(null)).toBe(false);
    });

    it('validateFeedbackPattern throws InvalidFeedbackError on bad input', () => {
      expect(() => validateFeedbackPattern([0, 1, 2, 3, 0])).toThrow(InvalidFeedbackError);
      expect(() => validateFeedbackPattern([0, 1, 2])).toThrow(InvalidFeedbackError);
      expect(() => validateFeedbackPattern('invalid')).toThrow(InvalidFeedbackError);
    });

    it('patternsMatch correctly compares feedback tuples', () => {
      expect(patternsMatch([0, 1, 2, 0, 1], [0, 1, 2, 0, 1])).toBe(true);
      expect(patternsMatch([0, 1, 2, 0, 1], [0, 1, 2, 0, 2])).toBe(false);
    });

    it('Throws InvalidWordError when invalid guess is supplied to filterCandidates', () => {
      expect(() => filterCandidates(sampleCandidates, 'SHORT', [0, 0, 0, 0, 0])).not.toThrow();
      expect(() => filterCandidates(sampleCandidates, 'BAD', [0, 0, 0, 0, 0])).toThrow(InvalidWordError);
    });
  });
});
