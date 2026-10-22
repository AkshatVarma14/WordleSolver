import { describe, it, expect } from 'vitest';
import { getUnifiedRecommendation } from '@wordle-solver/solver';

describe('Unified Solving Policy (policy.ts)', () => {
  describe('Contradiction & Terminal States', () => {
    it('returns contradiction state when candidates pool is empty', () => {
      const result = getUnifiedRecommendation([], []);
      expect(result.isContradiction).toBe(true);
      expect(result.recommendedGuess).toBeNull();
      expect(result.candidatesCount).toBe(0);
      expect(result.status).toBe('UNRESOLVED_RESOURCE_LIMIT');
      expect(result.reason).toContain('No dictionary words match');
    });

    it('returns instant terminal win when exactly 1 candidate remains', () => {
      const result = getUnifiedRecommendation(['SLATE'], ['SLATE']);
      expect(result.isWon).toBe(true);
      expect(result.recommendedGuess).toBe('SLATE');
      expect(result.status).toBe('WON');
      expect(result.worstCaseTurns).toBe(1);
      expect(result.reason).toContain("Single matching word remaining: 'SLATE'");
    });
  });

  describe('Selective Deeper Search for Small Candidate Sets', () => {
    it('proves a guaranteed win for 2 candidates with 2 turns remaining', () => {
      const candidates = ['SLATE', 'CRANE'];
      const allowed = ['SLATE', 'CRANE'];
      const result = getUnifiedRecommendation(candidates, allowed, 2);

      expect(result.status).toBe('PROVED_WIN');
      expect(result.isWon).toBe(false);
      expect(result.candidatesCount).toBe(2);
      expect(result.worstCaseTurns).toBeLessThanOrEqual(2);
      expect(result.recommendedGuess).toBeDefined();
      expect(result.reason).toContain('Guaranteed to solve all 2 remaining candidates');
    });

    it('proves a guaranteed win for 3 candidates when a partitioning probe is available', () => {
      // WORDS: BATCH, CATCH, HATCH. If allowed guess is 'CHAMP', it separates them.
      const candidates = ['BATCH', 'CATCH', 'HATCH'];
      const allowed = ['BATCH', 'CATCH', 'HATCH', 'CHAMP'];
      const result = getUnifiedRecommendation(candidates, allowed, 3);

      expect(result.status).toBe('PROVED_WIN');
      expect(result.worstCaseTurns).toBeLessThanOrEqual(3);
    });
  });

  describe('Routine Candidate Sets (Fast Shannon Entropy)', () => {
    it('uses fast entropy for pools larger than 15 candidates', () => {
      // 16 candidates
      const candidates = [
        'ABACK', 'ABASE', 'ABATE', 'ABBEY', 'ABBOT',
        'ABIDE', 'ABLED', 'ABODE', 'ABORT', 'ABOUT',
        'ABOVE', 'ABUSE', 'ABYSS', 'ACORN', 'ACRID',
        'ACTOR'
      ];
      const result = getUnifiedRecommendation(candidates, candidates, 6);

      expect(result.status).toBe('HEURISTIC');
      expect(result.recommendedGuess).toBeDefined();
      expect(result.entropyBits).toBeGreaterThan(0);
      expect(result.expectedRemaining).toBeDefined();
      expect(result.reason).toContain('Expected to narrow pool');
    });
  });

  describe('Opening Word Cache', () => {
    it('returns pre-computed canonical opening recommendation for standard 2,315-word opening state instantly', () => {
      // Mock array of 2,315 items
      const mockAnswers = new Array(2315).fill('CRANE');

      const result = getUnifiedRecommendation(mockAnswers, mockAnswers, 6);
      expect(result.recommendedGuess).toBe('SALET');
      expect(result.status).toBe('HEURISTIC');
      expect(result.candidatesCount).toBe(2315);
      expect(result.entropyBits).toBeCloseTo(5.836, 2);
      expect(result.durationMs).toBeLessThanOrEqual(5);
    });
  });
});
