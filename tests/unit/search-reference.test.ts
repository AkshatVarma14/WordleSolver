import { describe, it, expect } from 'vitest';
import {
  getBoundedSearchRecommendation,
  partitionCandidatesByPattern,
} from '@wordle-solver/solver';

/**
 * Pure brute-force exhaustive minimax without alpha-beta pruning or branch limits.
 * Used exclusively as a ground-truth reference for validating bounded search correctness.
 */
function exhaustiveReferenceMinimax(
  candidates: readonly string[],
  allowedGuesses: readonly string[],
  remainingBudget: number
): { worstCaseTurns: number; bestGuess: string; canWin: boolean } {
  if (candidates.length === 0) {
    return { worstCaseTurns: 0, bestGuess: '', canWin: true };
  }
  if (candidates.length === 1) {
    return { worstCaseTurns: 1, bestGuess: candidates[0]!, canWin: remainingBudget >= 1 };
  }
  if (remainingBudget <= 1) {
    return { worstCaseTurns: Infinity, bestGuess: candidates[0]!, canWin: false };
  }

  let bestWorstCase = Infinity;
  let bestGuess = allowedGuesses[0] ?? candidates[0]!;

  for (const guess of allowedGuesses) {
    const partitions = partitionCandidatesByPattern(candidates, guess);
    let guessWorstCase = 1;

    for (const [code, partition] of partitions.entries()) {
      if (code === 242) {
        // Solved immediately on this guess
        continue;
      }
      const sub = exhaustiveReferenceMinimax(partition, allowedGuesses, remainingBudget - 1);
      const branchTotal = 1 + sub.worstCaseTurns;
      if (branchTotal > guessWorstCase) {
        guessWorstCase = branchTotal;
      }
    }

    if (guessWorstCase < bestWorstCase) {
      bestWorstCase = guessWorstCase;
      bestGuess = guess;
    }
  }

  return {
    worstCaseTurns: bestWorstCase,
    bestGuess,
    canWin: bestWorstCase <= remainingBudget,
  };
}

describe('Exhaustive Reference vs Bounded Minimax Correctness', () => {
  describe('Synthetic Small-State Ground-Truth Agreement', () => {
    it('Agrees with exhaustive search on 3-word candidate-only set in 2 turns', () => {
      const candidates = ['ABACK', 'ABASE', 'ABATE'];
      const ref = exhaustiveReferenceMinimax(candidates, candidates, 2);

      const bounded = getBoundedSearchRecommendation(
        candidates,
        candidates,
        { maxDepth: 4, maxBranchCandidates: 10, timeoutMs: 5000 },
        2
      );

      expect(bounded.status).toBe('PROVED_WIN');
      expect(ref.canWin).toBe(true);
      expect(bounded.searchMetrics?.worstCaseTurns).toBe(ref.worstCaseTurns);
      expect(bounded.recommendedGuess).toBeDefined();
    });

    it('Agrees with exhaustive search when a non-candidate probe guarantees a win', () => {
      // 3 rhyming candidates: FOUND, HOUND, ROUND.
      // Candidate guesses alone cannot partition in 2 turns.
      // Non-candidate probe FROTH separates all three into unique feedback patterns:
      // - FOUND: [2, 0, 1, 0, 0] (F is Green)
      // - HOUND: [0, 0, 1, 0, 1] (H is Yellow)
      // - ROUND: [0, 1, 1, 0, 0] (R is Yellow)
      const candidates = ['FOUND', 'HOUND', 'ROUND'];
      const allowed = ['FOUND', 'HOUND', 'ROUND', 'FROTH'];

      const ref = exhaustiveReferenceMinimax(candidates, allowed, 2);
      const bounded = getBoundedSearchRecommendation(
        candidates,
        allowed,
        { maxDepth: 4, maxBranchCandidates: 10, timeoutMs: 5000 },
        2
      );

      expect(ref.canWin).toBe(true);
      expect(ref.worstCaseTurns).toBe(2);
      expect(ref.bestGuess).toBe('FROTH');

      expect(bounded.status).toBe('PROVED_WIN');
      expect(bounded.searchMetrics?.worstCaseTurns).toBe(2);
      expect(bounded.recommendedGuess).toBe('FROTH');
    });

    it('Agrees with exhaustive search on provably unwinnable states', () => {
      // 3 candidates with only 1 turn remaining
      const candidates = ['SLATE', 'CRANE', 'TRACE'];
      const ref = exhaustiveReferenceMinimax(candidates, candidates, 1);

      const bounded = getBoundedSearchRecommendation(
        candidates,
        candidates,
        { maxDepth: 3, maxBranchCandidates: 10, timeoutMs: 5000 },
        1
      );

      expect(ref.canWin).toBe(false);
      expect(bounded.status).toBe('DISPROVED_WIN');
      expect(bounded.searchMetrics?.worstCaseTurns).toBeUndefined();
    });

    it('Guarantees bounded search never reports DISPROVED_WIN when move space was truncated', () => {
      // 3 candidates, allowed guesses contains 4 words, but maxBranchCandidates is set to 1.
      // Move space is not fully explored, so even if the tested move doesn't win,
      // it must report UNRESOLVED_RESOURCE_LIMIT, never DISPROVED_WIN.
      const candidates = ['BATCH', 'CATCH', 'HATCH'];
      const allowed = ['BATCH', 'CATCH', 'HATCH', 'CHAMP'];

      const bounded = getBoundedSearchRecommendation(
        candidates,
        allowed,
        { maxDepth: 2, maxBranchCandidates: 1, timeoutMs: 5000 },
        2
      );

      expect(bounded.status).not.toBe('DISPROVED_WIN');
      expect(bounded.status).toBe('UNRESOLVED_RESOURCE_LIMIT');
    });

    it('Never claims a heuristic recommendation as a guaranteed win', () => {
      // If the search terminates with UNRESOLVED_RESOURCE_LIMIT due to timeout/depth,
      // the status is UNRESOLVED_RESOURCE_LIMIT and explanation acknowledges it as a heuristic.
      const candidates = ['CRANE', 'SLATE', 'TRACE', 'BRAKE', 'ROBOT'];
      const bounded = getBoundedSearchRecommendation(
        candidates,
        candidates,
        { maxDepth: 1, timeoutMs: 5000 },
        3
      );

      expect(bounded.status).toBe('UNRESOLVED_RESOURCE_LIMIT');
      expect(bounded.warning).toContain('limit reached');
      expect(bounded.explanation).toContain('best heuristic move');
    });
  });
});
