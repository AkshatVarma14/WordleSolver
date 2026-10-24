import { getFastRecommendation } from './entropy';
import { getBoundedSearchRecommendation } from './search';
import { CandidateScope, GuaranteeStatus } from './types';

/**
 * Result of the unified solving policy.
 */
export interface UnifiedRecommendation {
  readonly recommendedGuess: string | null;
  readonly isCandidate: boolean;
  readonly isWon: boolean;
  readonly isContradiction: boolean;
  readonly candidatesCount: number;
  readonly reason: string;
  readonly explanation?: string;
  readonly status: GuaranteeStatus | 'HEURISTIC';
  readonly expectedRemaining?: number;
  readonly entropyBits?: number;
  readonly worstCaseTurns?: number;
  readonly nodesExpanded?: number;
  readonly durationMs: number;
  readonly warning?: string;
  readonly candidateScope?: CandidateScope;
  readonly isExpandedFallback?: boolean;
}

/**
 * Options configuring policy context and vocabulary scope.
 */
export interface UnifiedPolicyOptions {
  readonly candidateScope?: CandidateScope;
  readonly isExpandedFallback?: boolean;
}

// Pre-computed canonical opening recommendation for the standard 2,315-word answer dictionary
// to ensure instant startup (<1ms) without computing 5+ million feedback pairs on the main thread.
export const CANONICAL_OPENING_WORD = 'SALET';
export const CANONICAL_OPENING_ENTROPY = 5.836;
export const CANONICAL_OPENING_EXPECTED = 60.9;

/**
 * Single default recommendation policy combining fast information gain for routine states
 * with selective deeper search when a guaranteed win can be established.
 *
 * Policy Rules:
 * 1. |C| == 0: Contradiction state.
 * 2. |C| == 1: Immediate terminal win for primary candidates, or heuristic recommendation for fallback.
 * 3. |C| == 2315 and turnsRemaining == 6: Instant pre-computed canonical opening (<1ms).
 * 4. 2 <= |C| <= 15 and turnsRemaining >= 2: Executes bounded deeper search to verify if a
 *    winning strategy exists within remaining turns. If proved, returns PROVED_WIN.
 * 5. Routine states (|C| > 15): Fast Shannon Entropy is used to maximize expected candidate
 *    reduction with zero main-thread lag.
 *
 * @param candidates Surviving candidate answer vocabulary
 * @param allowedGuesses Legal guess vocabulary (defaults to candidates)
 * @param turnsRemaining Remaining guess turns (default: 6)
 * @param options Policy options including candidate scope and fallback status
 * @returns UnifiedRecommendation
 */
export function getUnifiedRecommendation(
  candidates: readonly string[],
  allowedGuesses: readonly string[] = candidates,
  turnsRemaining: number = 6,
  options?: UnifiedPolicyOptions
): UnifiedRecommendation {
  const startTime = Date.now();
  const count = candidates.length;
  const isFallback = Boolean(
    options?.isExpandedFallback || options?.candidateScope === 'EXPANDED_FALLBACK'
  );
  const scope: CandidateScope = isFallback ? 'EXPANDED_FALLBACK' : 'PRIMARY';

  // Case 1: Contradiction
  if (count === 0) {
    const reason = 'No dictionary words match the entered feedback pattern.';
    return {
      recommendedGuess: null,
      isCandidate: false,
      isWon: false,
      isContradiction: true,
      candidatesCount: 0,
      reason,
      explanation: reason,
      warning: 'Contradiction: candidate pool is empty.',
      status: 'UNRESOLVED_RESOURCE_LIMIT',
      durationMs: Date.now() - startTime,
      candidateScope: scope,
      isExpandedFallback: isFallback,
    };
  }

  // Case 2: Terminal / Solitary Candidate
  if (count === 1) {
    const singleWord = candidates[0]!.toUpperCase();
    const reason = isFallback
      ? `Unverified fallback candidate: '${singleWord}' matches all clues in the expanded dictionary, but is absent from the curated answer list.`
      : `Single matching word remaining: '${singleWord}'.`;
    return {
      recommendedGuess: singleWord,
      isCandidate: true,
      isWon: !isFallback, // Only claim 100% won certainty if in curated primary answers
      isContradiction: false,
      candidatesCount: 1,
      reason,
      explanation: reason,
      status: isFallback ? 'HEURISTIC' : 'WON',
      worstCaseTurns: 1,
      durationMs: Date.now() - startTime,
      candidateScope: scope,
      isExpandedFallback: isFallback,
      warning: isFallback
        ? 'Unverified fallback candidate: accepted by Wordle dictionary, but unconfirmed as official NYT answer.'
        : undefined,
    };
  }

  // Case 3: Instant canonical opening for standard 2,315-word answer dictionary (<1ms)
  if (count === 2315 && turnsRemaining === 6 && !isFallback) {
    const reason = `High information gain (${CANONICAL_OPENING_ENTROPY.toFixed(2)} bits), expected to reduce 2,315 candidates to ~${CANONICAL_OPENING_EXPECTED.toFixed(0)}.`;
    return {
      recommendedGuess: CANONICAL_OPENING_WORD,
      isCandidate: true,
      isWon: false,
      isContradiction: false,
      candidatesCount: 2315,
      reason,
      explanation: reason,
      status: 'HEURISTIC',
      entropyBits: CANONICAL_OPENING_ENTROPY,
      expectedRemaining: CANONICAL_OPENING_EXPECTED,
      durationMs: Date.now() - startTime,
      candidateScope: scope,
      isExpandedFallback: false,
    };
  }

  // Case 4: Selective deeper search for small candidate sets (late game, primary scope only)
  if (count <= 15 && turnsRemaining >= 2 && !isFallback) {
    const deeper = getBoundedSearchRecommendation(
      candidates,
      allowedGuesses,
      { maxDepth: 3, timeoutMs: 300, maxBranchCandidates: 25 },
      turnsRemaining
    );

    if (deeper.status === 'PROVED_WIN' && deeper.recommendedGuess) {
      const turns = deeper.searchMetrics?.worstCaseTurns ?? 2;
      const reason = `Guaranteed to solve all ${count} remaining candidates in at most ${turns} turns.`;
      return {
        recommendedGuess: deeper.recommendedGuess,
        isCandidate: deeper.evaluation?.isCandidate ?? false,
        isWon: false,
        isContradiction: false,
        candidatesCount: count,
        reason,
        explanation: reason,
        status: 'PROVED_WIN',
        worstCaseTurns: turns,
        nodesExpanded: deeper.searchMetrics?.nodesExpanded,
        entropyBits: deeper.evaluation?.entropyBits,
        expectedRemaining: deeper.evaluation?.expectedRemaining,
        durationMs: Date.now() - startTime,
        candidateScope: scope,
        isExpandedFallback: false,
      };
    }
  }

  // Case 5: Routine states or fallback states -> Fast Shannon Entropy
  const fast = getFastRecommendation(candidates, allowedGuesses, 1);
  const bestGuess = fast.recommendedGuess;
  const evalMetrics = fast.evaluation;

  const expectedStr = evalMetrics ? `~${evalMetrics.expectedRemaining.toFixed(0)}` : 'fewer';
  const entropyStr = evalMetrics ? ` (${evalMetrics.entropyBits.toFixed(2)} bits)` : '';
  const probeNote = evalMetrics && !evalMetrics.isCandidate ? ' (exploratory probe)' : '';
  const poolDescriptor = isFallback ? 'expanded fallback pool' : 'pool';
  const reason = `Expected to narrow ${poolDescriptor} from ${count} to ${expectedStr} words${entropyStr}${probeNote}.`;

  return {
    recommendedGuess: bestGuess,
    isCandidate: evalMetrics?.isCandidate ?? false,
    isWon: false,
    isContradiction: false,
    candidatesCount: count,
    reason,
    explanation: reason,
    status: 'HEURISTIC',
    entropyBits: evalMetrics?.entropyBits,
    expectedRemaining: evalMetrics?.expectedRemaining,
    durationMs: Date.now() - startTime,
    candidateScope: scope,
    isExpandedFallback: isFallback,
    warning: isFallback
      ? 'Recommendations computed from expanded accepted guesses. These words are unverified as official NYT answers.'
      : undefined,
  };
}
