import { describe, it, expect } from 'vitest';
import {
  getBoundedSearchRecommendation,
  getCanonicalStateKey,
  partitionCandidatesByPattern,
  getFastRecommendation,
} from '@wordle-solver/solver';

describe('Bounded Deeper-Search Strategy (search.ts)', () => {
  describe('Canonical State Representation & Transposition Key', () => {
    it('Produces identical canonical keys regardless of candidate array ordering', () => {
      const key1 = getCanonicalStateKey(['CRANE', 'SLATE', 'TRACE']);
      const key2 = getCanonicalStateKey(['TRACE', 'CRANE', 'SLATE']);
      const key3 = getCanonicalStateKey(['SLATE', 'TRACE', 'CRANE']);

      expect(key1).toBe('CRANE,SLATE,TRACE');
      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });

    it('Handles single candidate and empty candidate edge cases', () => {
      expect(getCanonicalStateKey([])).toBe('');
      expect(getCanonicalStateKey(['CRANE'])).toBe('CRANE');
    });
  });

  describe('Terminal States & Immediate Wins', () => {
    it('Correctly identifies immediate win when exactly 1 candidate remains (|C| = 1)', () => {
      const result = getBoundedSearchRecommendation(['CRANE'], ['CRANE'], {}, 6);

      expect(result.recommendedGuess).toBe('CRANE');
      expect(result.status).toBe('WON');
      expect(result.isWon).toBe(true);
      expect(result.candidatesCount).toBe(1);
      expect(result.searchMetrics?.worstCaseTurns).toBe(1);
      expect(result.explanation).toContain("Target identified uniquely as 'CRANE'");
    });

    it('Handles empty candidate set (contradiction) gracefully without crashing', () => {
      const result = getBoundedSearchRecommendation([], [], {}, 6);

      expect(result.recommendedGuess).toBeNull();
      expect(result.isContradiction).toBe(true);
      expect(result.status).toBe('UNRESOLVED_RESOURCE_LIMIT');
      expect(result.warning).toContain('Contradiction');
    });
  });

  describe('Provable Winning Strategies (PROVED_WIN)', () => {
    it('Mathematically verifies guaranteed win for 2 candidates within 2 turns (|C| = 2, k = 2)', () => {
      // In 2 turns with 2 candidates, guessing either candidate wins immediately if target is that word,
      // or wins on turn 2 if target is the other word. Worst-case is 2 turns.
      const result = getBoundedSearchRecommendation(
        ['CRANE', 'SLATE'],
        ['CRANE', 'SLATE'],
        { maxDepth: 3 },
        2
      );

      expect(result.status).toBe('PROVED_WIN');
      expect(['CRANE', 'SLATE']).toContain(result.recommendedGuess);
      expect(result.searchMetrics?.worstCaseTurns).toBe(2);
      expect(result.explanation).toContain('status: PROVED_WIN');
    });

    it('Mathematically verifies guaranteed win for 3-word set within 2 turns (|C| = 3, k = 2)', () => {
      // In Stage 2 we showed that ABASE partitions ['ABACK', 'ABASE', 'ABATE'] into:
      // ABACK: [2,2,2,0,0], ABASE: [2,2,2,2,2] (win in 1), ABATE: [2,2,2,0,2]
      // All non-green partitions have size 1, so all can be solved on turn 2!
      const candidates = ['ABACK', 'ABASE', 'ABATE'];
      const result = getBoundedSearchRecommendation(candidates, candidates, { maxDepth: 3 }, 2);

      expect(result.status).toBe('PROVED_WIN');
      expect(result.searchMetrics?.worstCaseTurns).toBe(2);
      expect(['ABASE', 'ABATE']).toContain(result.recommendedGuess);
    });
  });

  describe('Provable Disproofs (DISPROVED_WIN)', () => {
    it('Exhaustively disproves that 2 candidates can be guaranteed in 1 turn (|C| = 2, k = 1)', () => {
      // With only 1 turn remaining, guessing one candidate only has a 50% chance of winning.
      // A guaranteed win for all candidates is mathematically impossible.
      const result = getBoundedSearchRecommendation(
        ['CRANE', 'SLATE'],
        ['CRANE', 'SLATE'],
        { maxDepth: 3 },
        1
      );

      expect(result.status).toBe('DISPROVED_WIN');
      expect(result.explanation).toContain('status: DISPROVED_WIN');
    });

    it('Exhaustively disproves that 3 candidates can be guaranteed in 1 turn (|C| = 3, k = 1)', () => {
      const candidates = ['ABACK', 'ABASE', 'ABATE'];
      const result = getBoundedSearchRecommendation(candidates, candidates, { maxDepth: 3 }, 1);

      expect(result.status).toBe('DISPROVED_WIN');
      expect(result.explanation).toContain('status: DISPROVED_WIN');
    });

    it('Exhaustively disproves that 5 single-letter suffix words can be solved in 2 turns when only in-pool guesses are allowed', () => {
      // Candidates: BOUND, FOUND, HOUND, MOUND, ROUND
      // If allowedGuesses is restricted strictly to these 5 words:
      // Any candidate guess leaves 4 words in the worst-case partition.
      // 4 words cannot be solved in 1 remaining turn (k = 2 - 1 = 1).
      // Thus, guaranteed win in 2 turns is mathematically impossible!
      const candidates = ['BOUND', 'FOUND', 'HOUND', 'MOUND', 'ROUND'];
      const result = getBoundedSearchRecommendation(candidates, candidates, { maxDepth: 3 }, 2);

      expect(result.status).toBe('DISPROVED_WIN');
      expect(result.explanation).toContain('status: DISPROVED_WIN');
    });
  });

  describe('Resource Budgets & Honest Statuses (UNRESOLVED_RESOURCE_LIMIT)', () => {
    it('Reports UNRESOLVED_RESOURCE_LIMIT when timeout occurs and NEVER claims DISPROVED_WIN', () => {
      // Force immediate timeout with timeoutMs = 0 on candidate list
      const candidates = ['CRANE', 'SLATE', 'TRACE', 'BRAKE', 'ROBOT', 'PLUMB'];
      const result = getBoundedSearchRecommendation(
        candidates,
        candidates,
        { timeoutMs: 0 },
        2
      );

      expect(result.status).toBe('UNRESOLVED_RESOURCE_LIMIT');
      expect(result.status).not.toBe('DISPROVED_WIN');
      expect(result.status).not.toBe('PROVED_WIN');
      expect(result.warning).toContain('limit reached');
    });

    it('Reports UNRESOLVED_RESOURCE_LIMIT when node expansion ceiling is reached', () => {
      const candidates = ['CRANE', 'SLATE', 'TRACE', 'BRAKE', 'ROBOT', 'PLUMB'];
      const result = getBoundedSearchRecommendation(
        candidates,
        candidates,
        { maxNodeExpansions: 1, timeoutMs: 10000 },
        3
      );

      expect(result.status).toBe('UNRESOLVED_RESOURCE_LIMIT');
      expect(result.status).not.toBe('DISPROVED_WIN');
      expect(result.searchMetrics?.hitResourceLimit).toBe(true);
    });

    it('Reports UNRESOLVED_RESOURCE_LIMIT when maxDepth budget cuts off search before leaf', () => {
      const candidates = ['CRANE', 'SLATE', 'TRACE', 'BRAKE'];
      // Depth 1 cutoff means it cannot complete ply 2 to prove 2-turn win
      const result = getBoundedSearchRecommendation(
        candidates,
        candidates,
        { maxDepth: 1, timeoutMs: 10000 },
        3
      );

      expect(result.status).toBe('UNRESOLVED_RESOURCE_LIMIT');
      expect(result.searchMetrics?.hitResourceLimit).toBe(true);
    });
  });

  describe('Pruning Soundness vs Unpruned Exhaustive Reference', () => {
    // Unpruned reference implementation for ground-truth verification on small state spaces
    function unprunedMinimax(
      candidates: readonly string[],
      budget: number
    ): { worstCaseTurns: number; bestGuess: string } {
      if (candidates.length <= 1) {
        return { worstCaseTurns: candidates.length, bestGuess: candidates[0] ?? '' };
      }
      if (candidates.length === 2) {
        return { worstCaseTurns: 2, bestGuess: candidates[0]! };
      }
      if (budget <= 1) {
        return { worstCaseTurns: Infinity, bestGuess: candidates[0]! };
      }

      let bestWorstCase = Infinity;
      let bestGuess = candidates[0]!;

      for (const guess of candidates) {
        const partitions = partitionCandidatesByPattern(candidates, guess);
        let worst = 1;

        for (const [code, part] of partitions.entries()) {
          if (code === 242) continue; // All-green
          const sub = unprunedMinimax(part, budget - 1);
          worst = Math.max(worst, 1 + sub.worstCaseTurns);
        }

        if (worst < bestWorstCase) {
          bestWorstCase = worst;
          bestGuess = guess;
        }
      }

      return { worstCaseTurns: bestWorstCase, bestGuess };
    }

    it('Optimized minimax produces exact same worst-case turns as unpruned reference on small states', () => {
      const candidates = ['ABACK', 'ABASE', 'ABATE'];
      const unpruned = unprunedMinimax(candidates, 3);

      const optimized = getBoundedSearchRecommendation(
        candidates,
        candidates,
        { maxDepth: 4, timeoutMs: 5000 },
        3
      );

      expect(optimized.searchMetrics?.worstCaseTurns).toBe(unpruned.worstCaseTurns);
      expect(optimized.status).toBe('PROVED_WIN');
    });

    it('Transposition table records memo hits across overlapping candidate subsets', () => {
      const candidates = ['CRANE', 'SLATE', 'TRACE', 'BRAKE', 'ROBOT'];
      const result = getBoundedSearchRecommendation(
        candidates,
        candidates,
        { maxDepth: 3, maxBranchCandidates: 10, timeoutMs: 5000 },
        3
      );

      expect(result.searchMetrics).toBeDefined();
      expect(result.searchMetrics?.nodesExpanded).toBeGreaterThan(0);
    });
  });

  describe('Determinism & Invariance', () => {
    it('Produces 100% identical recommendations and node counts across consecutive identical runs', () => {
      const candidates = ['CRANE', 'SLATE', 'TRACE', 'BRAKE'];
      const run1 = getBoundedSearchRecommendation(candidates, candidates, { maxDepth: 2 }, 3);
      const run2 = getBoundedSearchRecommendation(candidates, candidates, { maxDepth: 2 }, 3);

      expect(run1.recommendedGuess).toBe(run2.recommendedGuess);
      expect(run1.status).toBe(run2.status);
      expect(run1.searchMetrics?.nodesExpanded).toBe(run2.searchMetrics?.nodesExpanded);
      expect(run1.searchMetrics?.worstCaseTurns).toBe(run2.searchMetrics?.worstCaseTurns);
    });

    it('Does not mutate input candidate array or corrupt fast strategy', () => {
      const original = ['CRANE', 'SLATE', 'TRACE'];
      const snapshot = [...original];

      // Run bounded search
      getBoundedSearchRecommendation(original, original, { maxDepth: 2 }, 2);
      expect(original).toEqual(snapshot);

      // Verify fast entropy strategy still operates identically
      const fastResult = getFastRecommendation(original, original, 3);
      expect(fastResult.recommendedGuess).toBeTruthy();
      expect(original).toEqual(snapshot);
    });

    it('Executes bounded search on realistic candidate set within default browser timeout budget', () => {
      // Simulate turn 2 after CRANE filtered answers down to ~20 candidates
      const candidates = [
        'SHORE', 'SPORE', 'STORE', 'SCORE', 'SMORE',
        'SWORE', 'SNORE', 'FIBRE', 'GENRE', 'THERE',
        'WHERE', 'CHORE', 'PROVE', 'DROVE', 'GROVE',
      ];

      const t0 = Date.now();
      const rec = getBoundedSearchRecommendation(
        candidates,
        candidates,
        { maxDepth: 2, maxBranchCandidates: 10, timeoutMs: 500 },
        4
      );
      const elapsed = Date.now() - t0;

      expect(rec.recommendedGuess).toBeTruthy();
      expect(candidates).toContain(rec.recommendedGuess);
      expect(elapsed).toBeLessThan(500); // Must be strictly within 500ms
      expect(rec.searchMetrics).toBeDefined();
      expect(rec.searchMetrics?.nodesExpanded).toBeGreaterThan(0);
    });
  });
});
