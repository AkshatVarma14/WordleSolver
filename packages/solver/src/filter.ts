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
  ContradictionDiagnosis,
  LayeredFilterResult,
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
  const earliestContradictionIndex = isContradiction
    ? stepCounts.findIndex((count) => count === 0)
    : null;

  return {
    candidates: currentCandidates,
    initialCount,
    remainingCount,
    isContradiction,
    stepCounts,
    earliestContradictionIndex,
  };
}

/**
 * Diagnoses a contradiction state, establishing whether the history is:
 * 1. A vocabulary mismatch: matches exist in the comprehensive dictionary (valid-guesses), but not in the answer list.
 * 2. An internal logical contradiction: no English word in any dictionary matches the feedback combination.
 *
 * @param history Array of submitted turn records
 * @param answerVocabulary Curated answer words (e.g. 2,315 words)
 * @param validGuessesVocabulary Comprehensive allowable vocabulary (e.g. 12,953 words)
 * @returns ContradictionDiagnosis
 */
export function diagnoseContradiction(
  history: readonly TurnRecord[],
  answerVocabulary: readonly string[],
  validGuessesVocabulary: readonly string[] = answerVocabulary
): ContradictionDiagnosis {
  const answerFilter = filterByHistory(answerVocabulary, history);
  if (!answerFilter.isContradiction) {
    return {
      isContradiction: false,
      earliestContradictionIndex: null,
      earliestContradictingTurn: null,
      isVocabularyMismatch: false,
      matchingValidGuessesCount: answerFilter.remainingCount,
      sampleValidMatches: [],
      explanation: 'No contradiction detected.',
    };
  }

  const earliestIdx = answerFilter.earliestContradictionIndex ?? 0;
  const earliestTurn = history[earliestIdx] ?? null;

  // Check if valid-guesses vocabulary still has matching words
  const validFilter = filterByHistory(validGuessesVocabulary, history);
  const matchingValidCount = validFilter.remainingCount;
  const isVocabularyMismatch = matchingValidCount > 0;
  const sampleValidMatches = isVocabularyMismatch
    ? validFilter.candidates.slice(0, 3)
    : [];

  let explanation: string;
  if (isVocabularyMismatch) {
    const samplesStr = sampleValidMatches.map((w) => `'${w}'`).join(', ');
    explanation = `The recorded feedback eliminates all ${answerVocabulary.length.toLocaleString()} words in the configured answer list. However, ${matchingValidCount} matching words exist in the comprehensive dictionary (${samplesStr}). The secret answer may be missing from the configured answer list, or an earlier row was marked incorrectly.`;
  } else {
    explanation = `The recorded feedback is internally contradictory. No known English word matches this feedback pattern. Row ${earliestIdx + 1} ('${earliestTurn?.guess ?? ''}') was the earliest observation to eliminate all candidate words.`;
  }

  return {
    isContradiction: true,
    earliestContradictionIndex: earliestIdx,
    earliestContradictingTurn: earliestTurn,
    isVocabularyMismatch,
    matchingValidGuessesCount: matchingValidCount,
    sampleValidMatches,
    explanation,
  };
}

/**
 * Sequentially filters candidates through a two-tier layered vocabulary:
 * Tier 1: Curated primary answers list (e.g. 2,315 words).
 * Tier 2 (Fallback): Comprehensive accepted guesses dictionary (e.g. 12,972 words).
 *
 * Operational Rules:
 * 1. If Tier 1 produces >= 1 candidate: Returns primary candidates immediately without searching Tier 2.
 * 2. If Tier 1 produces 0 candidates after valid observations:
 *    - Evaluates Tier 2 against the complete feedback history.
 *    - If Tier 2 produces >= 1 candidate: Returns them as EXPANDED_FALLBACK candidates,
 *      flagging isExpandedFallback: true and providing an honest, unverified advisory warning.
 *    - If Tier 2 also produces 0 candidates: Flags isContradiction: true and provides
 *      full contradiction diagnosis (internal logical impossibility).
 *
 * @param primaryAnswers Curated answer vocabulary
 * @param validGuesses Comprehensive allowable guesses vocabulary
 * @param history Turn history
 * @returns LayeredFilterResult
 */
export function filterByLayeredHistory(
  primaryAnswers: readonly string[],
  validGuesses: readonly string[],
  history: readonly TurnRecord[]
): LayeredFilterResult {
  // Step 1: Filter against primary answer list
  const primaryResult = filterByHistory(primaryAnswers, history);

  if (primaryResult.candidates.length > 0) {
    return {
      candidates: primaryResult.candidates,
      scope: 'PRIMARY',
      isExpandedFallback: false,
      primaryCount: primaryResult.candidates.length,
      expandedCount: 0,
      isContradiction: false,
      contradictionDiagnosis: null,
      stepCounts: primaryResult.stepCounts,
    };
  }

  // If history is empty and primary answers was empty (edge case)
  if (history.length === 0) {
    return {
      candidates: [],
      scope: 'PRIMARY',
      isExpandedFallback: false,
      primaryCount: 0,
      expandedCount: 0,
      isContradiction: false,
      contradictionDiagnosis: null,
      stepCounts: [],
    };
  }

  // Step 2: Primary answers exhausted. Search expanded accepted-guess vocabulary.
  const expandedResult = filterByHistory(validGuesses, history);

  if (expandedResult.candidates.length > 0) {
    const count = expandedResult.candidates.length;
    const sampleWords = expandedResult.candidates.slice(0, 3).map((w) => `'${w}'`).join(', ');
    const warning = `Curated answer list exhausted (0 matches). Recovered ${count.toLocaleString()} candidate${count === 1 ? '' : 's'} from expanded dictionary (${sampleWords}). Note: these words are accepted guesses by Wordle, but unverified as official answers.`;

    const earliestIdx = primaryResult.earliestContradictionIndex ?? 0;
    const earliestTurn = history[earliestIdx] ?? null;

    return {
      candidates: expandedResult.candidates,
      scope: 'EXPANDED_FALLBACK',
      isExpandedFallback: true,
      primaryCount: 0,
      expandedCount: count,
      isContradiction: false,
      contradictionDiagnosis: {
        isContradiction: true, // indicates failure in curated answers
        earliestContradictionIndex: earliestIdx,
        earliestContradictingTurn: earliestTurn,
        isVocabularyMismatch: true,
        matchingValidGuessesCount: count,
        sampleValidMatches: expandedResult.candidates.slice(0, 5),
        explanation: warning,
      },
      stepCounts: expandedResult.stepCounts,
      warning,
    };
  }

  // Step 3: Expanded vocabulary also yields 0 candidates -> Genuine contradiction!
  const diagnosis = diagnoseContradiction(history, primaryAnswers, validGuesses);

  return {
    candidates: [],
    scope: 'PRIMARY',
    isExpandedFallback: false,
    primaryCount: 0,
    expandedCount: 0,
    isContradiction: true,
    contradictionDiagnosis: diagnosis,
    stepCounts: primaryResult.stepCounts,
    warning: diagnosis.explanation,
  };
}
