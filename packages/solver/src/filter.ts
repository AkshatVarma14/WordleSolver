import {
  evaluateFeedbackRaw,
  isValidWord,
  validateWord,
} from './feedback';
import {
  FeedbackPattern,
  FilterHistoryResult,
  InvalidFeedbackError,
  TurnRecord,
} from './types';

/**
 * Validates whether an unknown value is a well-formed 5-tile FeedbackPattern.
 *
 * @param value The value to inspect
 * @returns True if value is an array of length 5 with elements in {0, 1, 2}
 */
export function isValidFeedbackPattern(value: unknown): value is FeedbackPattern {
  if (!Array.isArray(value) || value.length !== 5) {
    return false;
  }
  return value.every((tile) => tile === 0 || tile === 1 || tile === 2);
}

/**
 * Validates a feedback pattern, throwing an InvalidFeedbackError if malformed.
 *
 * @param pattern The pattern to validate
 * @returns The validated FeedbackPattern
 * @throws {InvalidFeedbackError} If the pattern is not an array of 5 valid tile states
 */
export function validateFeedbackPattern(pattern: unknown): FeedbackPattern {
  if (!Array.isArray(pattern)) {
    throw new InvalidFeedbackError(
      pattern,
      `Expected an array of 5 tile states, received ${typeof pattern}.`
    );
  }

  if (pattern.length !== 5) {
    throw new InvalidFeedbackError(
      pattern,
      `Expected array length 5, received length ${pattern.length}.`
    );
  }

  for (let i = 0; i < 5; i++) {
    const tile = pattern[i];
    if (tile !== 0 && tile !== 1 && tile !== 2) {
      throw new InvalidFeedbackError(
        pattern,
        `Tile at index ${i} has invalid state '${String(tile)}'. Expected 0 (Grey), 1 (Yellow), or 2 (Green).`
      );
    }
  }

  return pattern as unknown as FeedbackPattern;
}

/**
 * Checks whether two feedback patterns are strictly identical position-by-position.
 *
 * @param a First feedback pattern
 * @param b Second feedback pattern
 * @returns True if all 5 positions match
 */
export function patternsMatch(a: FeedbackPattern, b: FeedbackPattern): boolean {
  return (
    a[0] === b[0] &&
    a[1] === b[1] &&
    a[2] === b[2] &&
    a[3] === b[3] &&
    a[4] === b[4]
  );
}

/**
 * Filters a candidate answer set based on a played guess and the observed feedback pattern.
 *
 * Reuses the deterministic feedback engine to guarantee that candidate answers
 * are retained if and only if their computed feedback matches the observation.
 *
 * Invariants:
 * 1. Monotonicity: The output candidate set is strictly a subset of the input candidate set (C_{k+1} ⊆ C_k).
 * 2. Determinism: Preserves the original ordering of words from the input set.
 * 3. Never introduces new words not in the input candidate list.
 *
 * @param candidates The current active candidate set
 * @param guess The 5-letter guess word played
 * @param feedback The 5-tile feedback pattern observed
 * @returns Filtered array of surviving candidate words
 * @throws {InvalidWordError} If the guess word is invalid
 * @throws {InvalidFeedbackError} If the feedback pattern is malformed
 */
export function filterCandidates(
  candidates: readonly string[],
  guess: string,
  feedback: FeedbackPattern
): string[] {
  if (candidates.length === 0) {
    return [];
  }

  const normalizedGuess = validateWord(guess, 'guess');
  const validFeedback = validateFeedbackPattern(feedback);

  const matchingCandidates: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    // Fast path: if already valid 5-letter, uppercase directly; otherwise validate
    const normalizedCandidate = isValidWord(candidate)
      ? candidate.toUpperCase()
      : validateWord(candidate, 'answer');

    const computed = evaluateFeedbackRaw(normalizedGuess, normalizedCandidate);
    if (patternsMatch(computed, validFeedback)) {
      matchingCandidates.push(candidate);
    }
  }

  return matchingCandidates;
}

/**
 * Sequentially filters an initial candidate set through a complete turn history.
 *
 * Detects contradictory game states: when an initially non-empty candidate list
 * shrinks to 0 remaining words after valid observations, it flags isContradiction: true.
 * Candidates are never fabricated to make an invalid state appear solvable.
 *
 * @param initialCandidates The starting candidate vocabulary (e.g., all 2,315 answers)
 * @param history Array of historical turns played (guess and feedback)
 * @returns FilterHistoryResult containing remaining candidates, step counts, and contradiction flag
 */
export function filterByHistory(
  initialCandidates: readonly string[],
  history: readonly TurnRecord[]
): FilterHistoryResult {
  const initialCount = initialCandidates.length;
  const stepCounts: number[] = [];
  let currentCandidates = [...initialCandidates];

  for (let t = 0; t < history.length; t++) {
    const turn = history[t]!;
    currentCandidates = filterCandidates(
      currentCandidates,
      turn.guess,
      turn.feedback
    );
    stepCounts.push(currentCandidates.length);
  }

  const remainingCount = currentCandidates.length;
  const isContradiction = initialCount > 0 && history.length > 0 && remainingCount === 0;

  return {
    candidates: currentCandidates,
    initialCount,
    remainingCount,
    isContradiction,
    stepCounts,
  };
}
