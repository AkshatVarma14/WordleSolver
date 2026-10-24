import {
  evaluateFeedbackCode,
  isValidWord,
  validateWord,
} from './feedback';
import {
  FeedbackPattern,
  GuessEvaluation,
  RecommendationResult,
  TileFeedback,
} from './types';

/**
 * Encodes a 5-tile ternary feedback pattern into a unique integer code in [0, 242].
 * Code formula: p0 + 3*p1 + 9*p2 + 27*p3 + 81*p4
 *
 * @param p The 5-tile feedback pattern
 * @returns An integer in [0, 242]
 */
export function patternToCode(p: FeedbackPattern): number {
  return p[0] + p[1] * 3 + p[2] * 9 + p[3] * 27 + p[4] * 81;
}

/**
 * Decodes an integer code in [0, 242] back into a 5-tile feedback pattern.
 *
 * @param code An integer in [0, 242]
 * @returns The reconstructed FeedbackPattern
 */
export function codeToPattern(code: number): FeedbackPattern {
  let c = code;
  const p0 = (c % 3) as TileFeedback;
  c = Math.floor(c / 3);
  const p1 = (c % 3) as TileFeedback;
  c = Math.floor(c / 3);
  const p2 = (c % 3) as TileFeedback;
  c = Math.floor(c / 3);
  const p3 = (c % 3) as TileFeedback;
  c = Math.floor(c / 3);
  const p4 = (c % 3) as TileFeedback;
  return [p0, p1, p2, p3, p4];
}

/**
 * Evaluates the information-theoretic metrics of a candidate guess against a candidate set.
 *
 * Calculations:
 * 1. Shannon Entropy H(g): Expected information gain in bits:
 *    H(g) = - sum_{p} P(p|g) * log2(P(p|g))
 *    Measures the degree of uniformity and dispersion among the resulting candidate partitions.
 *
 * 2. Expected Remaining Candidates E[|C'|]:
 *    E[|C'|] = sum_{p} P(p|g) * |C_{g,p}| = (1 / |C|) * sum_{p} |C_{g,p}|^2
 *    Measures the arithmetic average of surviving candidate pool size after the guess.
 *
 * Note on Objectives:
 * While entropy and expected remaining candidates are inversely correlated, they are mathematically
 * distinct: entropy rewards creating many balanced partitions (maximizing information), whereas
 * expected remaining candidates directly minimizes the mean partition size.
 *
 * @param guess The 5-letter guess word to evaluate
 * @param normalizedCandidates Array of normalized uppercase 5-letter candidate words
 * @param candidateSet Optional fast Set containing normalized candidates for O(1) membership check
 * @returns Complete GuessEvaluation record
 */
export function evaluateGuess(
  guess: string,
  normalizedCandidates: readonly string[],
  candidateSet?: ReadonlySet<string>
): GuessEvaluation {
  const normalizedGuess = validateWord(guess, 'guess');
  const totalCandidates = normalizedCandidates.length;

  if (totalCandidates === 0) {
    return {
      guess: normalizedGuess,
      isCandidate: false,
      entropyBits: 0,
      expectedRemaining: 0,
      worstCasePartitionSize: 0,
      distinctPatternsCount: 0,
      immediateWinProbability: 0,
    };
  }

  const isCandidate = candidateSet
    ? candidateSet.has(normalizedGuess)
    : normalizedCandidates.includes(normalizedGuess);

  if (totalCandidates === 1) {
    const isSingleMatch = normalizedCandidates[0] === normalizedGuess;
    return {
      guess: normalizedGuess,
      isCandidate,
      entropyBits: 0,
      expectedRemaining: isSingleMatch ? 0 : 1,
      worstCasePartitionSize: 1,
      distinctPatternsCount: 1,
      immediateWinProbability: isSingleMatch ? 1 : 0,
    };
  }

  // Histogram of candidate counts per feedback pattern (243 possible ternary patterns)
  const patternCounts = new Uint16Array(243);

  for (let i = 0; i < totalCandidates; i++) {
    const candidate = normalizedCandidates[i]!;
    const code = evaluateFeedbackCode(normalizedGuess, candidate);
    patternCounts[code] = patternCounts[code]! + 1;
  }

  let distinctPatternsCount = 0;
  let worstCasePartitionSize = 0;
  let sumSquaredSizes = 0;
  let entropyBits = 0;

  for (let code = 0; code < 243; code++) {
    const count = patternCounts[code]!;
    if (count > 0) {
      distinctPatternsCount++;
      if (count > worstCasePartitionSize) {
        worstCasePartitionSize = count;
      }
      sumSquaredSizes += count * count;
      const prob = count / totalCandidates;
      entropyBits -= prob * Math.log2(prob);
    }
  }

  const expectedRemaining = sumSquaredSizes / totalCandidates;
  const immediateWinProbability = isCandidate ? 1 / totalCandidates : 0;

  return {
    guess: normalizedGuess,
    isCandidate,
    entropyBits,
    expectedRemaining,
    worstCasePartitionSize,
    distinctPatternsCount,
    immediateWinProbability,
  };
}

/**
 * Deterministic comparison function for ranking guess evaluations.
 *
 * Ranking Hierarchy:
 * 1. Primary: Maximum Shannon Entropy (highest information gain, epsilon = 1e-6).
 * 2. Secondary: Candidate Preference. If entropy scores are equivalent within epsilon,
 *    prefer a candidate word in C over an exploratory probe in G \ C, because playing
 *    in C offers a non-zero immediate win probability (1 / |C| > 0).
 * 3. Tertiary: Minimum Expected Remaining Candidates (lower is better).
 * 4. Quaternary: Lexicographical order (alphabetical) for deterministic stability.
 *
 * @param a First evaluation record
 * @param b Second evaluation record
 * @returns Negative if a should be ranked higher than b, positive if b should be higher, 0 if identical
 */
export function compareEvaluations(
  a: GuessEvaluation,
  b: GuessEvaluation
): number {
  const EPSILON = 1e-6;

  // 1. Primary: Higher entropy is better
  const entropyDiff = b.entropyBits - a.entropyBits;
  if (Math.abs(entropyDiff) > EPSILON) {
    return entropyDiff;
  }

  // 2. Secondary: Prefer candidate answer over non-candidate probe
  if (a.isCandidate !== b.isCandidate) {
    return a.isCandidate ? -1 : 1;
  }

  // 3. Tertiary: Lower expected remaining is better
  const expectedDiff = a.expectedRemaining - b.expectedRemaining;
  if (Math.abs(expectedDiff) > EPSILON) {
    return expectedDiff;
  }

  // 4. Quaternary: Alphabetical tie-breaking for 100% determinism
  return a.guess.localeCompare(b.guess);
}

/**
 * Computes recommendations for the current candidate set using the Fast Strategy.
 *
 * Explanations & Probing:
 * When |C| is large, or when remaining candidates share a common suffix/pattern (e.g., _OUND),
 * evaluating allowed guesses outside C (G \ C) frequently reveals exploratory probes that partition
 * the candidate space much more effectively than guessing a candidate word directly.
 *
 * @param candidates Surviving candidate answer vocabulary
 * @param allowedGuesses Complete legal guess vocabulary (defaults to candidates if omitted or empty)
 * @param topCount Number of top-ranked moves to return in topRanked (default: 10)
 * @returns RecommendationResult with recommended move, metrics, and explanation
 */
export function getFastRecommendation(
  candidates: readonly string[],
  allowedGuesses: readonly string[] = candidates,
  topCount: number = 10
): RecommendationResult {
  const candidatesCount = candidates.length;

  // Edge Case 1: Contradiction / Empty Candidate Pool
  if (candidatesCount === 0) {
    return {
      recommendedGuess: null,
      strategy: 'FAST_ENTROPY',
      candidatesCount: 0,
      isContradiction: true,
      isWon: false,
      evaluation: null,
      topRanked: [],
      explanation:
        'No candidate words remain matching the entered feedback. Please verify previous turns for input contradictions.',
      warning: 'Contradiction: candidate pool is empty.',
    };
  }

  // Normalize candidate pool
  const normalizedCandidates = candidates.map((c) =>
    isValidWord(c) ? c.toUpperCase() : validateWord(c, 'answer')
  );
  const candidateSet = new Set(normalizedCandidates);

  // Edge Case 2: Exactly 1 candidate remains -> Immediate Win
  if (candidatesCount === 1) {
    const singleWord = normalizedCandidates[0]!;
    const singleEval: GuessEvaluation = {
      guess: singleWord,
      isCandidate: true,
      entropyBits: 0,
      expectedRemaining: 0,
      worstCasePartitionSize: 1,
      distinctPatternsCount: 1,
      immediateWinProbability: 1.0,
    };

    return {
      recommendedGuess: singleWord,
      strategy: 'FAST_ENTROPY',
      candidatesCount: 1,
      isContradiction: false,
      isWon: false,
      evaluation: singleEval,
      topRanked: [singleEval],
      explanation: `Only 1 candidate remains (${singleWord}). Guessing it guarantees an immediate win with 100% certainty.`,
    };
  }

  // Evaluate candidate guess pool
  const guessesToEvaluate =
    allowedGuesses.length > 0 ? allowedGuesses : normalizedCandidates;
  const evaluations: GuessEvaluation[] = [];

  for (let i = 0; i < guessesToEvaluate.length; i++) {
    const rawGuess = guessesToEvaluate[i]!;
    const normalizedGuess = isValidWord(rawGuess)
      ? rawGuess.toUpperCase()
      : validateWord(rawGuess, 'guess');

    const evaluation = evaluateGuess(
      normalizedGuess,
      normalizedCandidates,
      candidateSet
    );
    evaluations.push(evaluation);
  }

  // Deterministic sort
  evaluations.sort(compareEvaluations);

  const topRanked = evaluations.slice(0, Math.max(1, topCount));
  const best = topRanked[0]!;

  const candidateStatus = best.isCandidate
    ? `Candidate answer (${(best.immediateWinProbability * 100).toFixed(1)}% immediate win probability)`
    : `Exploratory probe outside candidate pool`;

  const explanation = `Recommended '${best.guess}': Provides ${best.entropyBits.toFixed(2)} bits of Shannon entropy, reducing ${candidatesCount} candidates to an expected ${best.expectedRemaining.toFixed(1)} across ${best.distinctPatternsCount} distinct feedback partitions (worst-case partition: ${best.worstCasePartitionSize}). ${candidateStatus}.`;

  return {
    recommendedGuess: best.guess,
    strategy: 'FAST_ENTROPY',
    candidatesCount,
    isContradiction: false,
    isWon: false,
    evaluation: best,
    topRanked,
    explanation,
  };
}
