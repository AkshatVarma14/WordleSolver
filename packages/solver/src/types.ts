/**
 * Domain types and data contracts for the Wordle Solver engine.
 */

/**
 * Tile evaluation states corresponding to standard Wordle feedback:
 * 0 = Grey (Absent or exhausted duplicate)
 * 1 = Yellow (Present elsewhere in target)
 * 2 = Green (Correct position match)
 */
export type TileFeedback = 0 | 1 | 2;

export const TileState = {
  GREY: 0 as const,
  YELLOW: 1 as const,
  GREEN: 2 as const,
} as const;

export type TileStateType = (typeof TileState)[keyof typeof TileState];

/**
 * 5-tuple feedback pattern representing the 5 tile states of a guess.
 */
export type FeedbackPattern = readonly [
  TileFeedback,
  TileFeedback,
  TileFeedback,
  TileFeedback,
  TileFeedback,
];

/**
 * Result of evaluating a guess against a target answer.
 */
export interface FeedbackEvaluation {
  readonly guess: string;
  readonly answer: string;
  readonly feedback: FeedbackPattern;
}

/**
 * A historical guess and its observed feedback pattern.
 */
export interface TurnRecord {
  readonly guess: string;
  readonly feedback: FeedbackPattern;
}

/**
 * Detailed diagnosis of a contradictory game state or vocabulary mismatch.
 */
export interface ContradictionDiagnosis {
  readonly isContradiction: boolean;
  readonly earliestContradictionIndex: number | null;
  readonly earliestContradictingTurn: TurnRecord | null;
  readonly isVocabularyMismatch: boolean;
  readonly matchingValidGuessesCount: number;
  readonly sampleValidMatches: readonly string[];
  readonly explanation: string;
}

/**
 * Result of filtering candidates through historical turns.
 */
export interface FilterHistoryResult {
  readonly candidates: readonly string[];
  readonly initialCount: number;
  readonly remainingCount: number;
  readonly isContradiction: boolean;
  readonly stepCounts: readonly number[];
  readonly earliestContradictionIndex?: number | null;
}

/**
 * Evaluation metrics for a single guess against a candidate set.
 */
export interface GuessEvaluation {
  readonly guess: string;
  readonly isCandidate: boolean;
  readonly entropyBits: number;
  readonly expectedRemaining: number;
  readonly worstCasePartitionSize: number;
  readonly distinctPatternsCount: number;
  readonly immediateWinProbability: number;
}

/**
 * Scope tier for surviving candidate words.
 * PRIMARY: Curated answer vocabulary (e.g. 2,315 words).
 * EXPANDED_FALLBACK: Accepted guess vocabulary (e.g. 12,972 words) used only when PRIMARY is exhausted.
 */
export type CandidateScope = 'PRIMARY' | 'EXPANDED_FALLBACK';

/**
 * Result of two-tier layered filtering.
 */
export interface LayeredFilterResult {
  readonly candidates: readonly string[];
  readonly scope: CandidateScope;
  readonly isExpandedFallback: boolean;
  readonly primaryCount: number;
  readonly expandedCount: number;
  readonly isContradiction: boolean;
  readonly contradictionDiagnosis: ContradictionDiagnosis | null;
  readonly stepCounts: readonly number[];
  readonly warning?: string;
}

/**
 * Strategy identification.
 */
export type StrategyType = 'FAST_ENTROPY' | 'BOUNDED_MINIMAX';

/**
 * Status categorization for search and strategy evaluations.
 */
export type GuaranteeStatus =
  | 'WON'
  | 'PROVED_WIN'
  | 'DISPROVED_WIN'
  | 'UNRESOLVED_RESOURCE_LIMIT';

/**
 * Diagnostics and performance metrics for bounded deeper search.
 */
export interface SearchMetrics {
  readonly nodesExpanded: number;
  readonly durationMs: number;
  readonly depthReached: number;
  readonly worstCaseTurns?: number;
  readonly hitResourceLimit: boolean;
  readonly status: GuaranteeStatus;
  readonly memoHits: number;
}

/**
 * Complete recommendation response returned by solver strategies.
 */
export interface RecommendationResult {
  readonly recommendedGuess: string | null;
  readonly strategy: StrategyType;
  readonly candidatesCount: number;
  readonly isContradiction: boolean;
  readonly isWon: boolean;
  readonly evaluation: GuessEvaluation | null;
  readonly topRanked: readonly GuessEvaluation[];
  readonly explanation: string;
  readonly status?: GuaranteeStatus;
  readonly searchMetrics?: SearchMetrics;
  readonly warning?: string;
  readonly candidateScope?: CandidateScope;
  readonly isExpandedFallback?: boolean;
}

/**
 * Execution and resource limits for deeper game-tree search.
 */
export interface SearchBudget {
  readonly maxDepth: number;
  readonly maxBranchCandidates: number;
  readonly timeoutMs: number;
  readonly maxNodeExpansions: number;
}

/**
 * Default safe search budget parameters for client-side and browser execution.
 */
export const DEFAULT_SEARCH_BUDGET: SearchBudget = {
  maxDepth: 3,
  maxBranchCandidates: 20,
  timeoutMs: 500,
  maxNodeExpansions: 25000,
};

/**
 * Custom error thrown when a word violates the 5-letter alphabetic contract.
 */
export class InvalidWordError extends Error {
  public readonly field: 'guess' | 'answer';
  public readonly value: unknown;

  constructor(field: 'guess' | 'answer', value: unknown, reason: string) {
    super(`Invalid ${field}: '${String(value)}'. ${reason}`);
    this.name = 'InvalidWordError';
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Custom error thrown when a feedback pattern is malformed.
 */
export class InvalidFeedbackError extends Error {
  public readonly value: unknown;

  constructor(value: unknown, reason: string) {
    super(`Invalid feedback pattern: '${String(value)}'. ${reason}`);
    this.name = 'InvalidFeedbackError';
    this.value = value;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Review status of a contributed answer candidate in the quarantine queue.
 */
export type ContributionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SPAM';

/**
 * Outcome status of attempting to submit a missing answer contribution.
 */
export type ContributionSubmitStatus =
  | 'SUBMITTED'
  | 'ALREADY_SUBMITTED'
  | 'ALREADY_KNOWN'
  | 'INVALID_WORD'
  | 'UNCONFIGURED'
  | 'FAILED';

/**
 * Minimal payload submitted to the quarantined pending contributions queue.
 * Contains zero personal information, user tracking identifiers, or game histories.
 */
export interface PendingContributionPayload {
  /** 5-letter uppercase ASCII word */
  readonly word: string;
  /** Number of turns taken to win (1-6) */
  readonly solveTurns: number;
  /** Source client environment */
  readonly clientPlatform: 'web' | 'extension';
  /** Client timestamp in ISO format (informative metadata only, not authoritative proof) */
  readonly clientTimestamp: string;
}

/**
 * Result of submitting a contribution to the pending queue.
 */
export interface ContributionSubmitResult {
  readonly success: boolean;
  readonly word: string;
  readonly status: ContributionSubmitStatus;
  readonly message: string;
  readonly error?: string;
}

/**
 * Provider boundary contract for submitting pending contributions to a backend queue.
 */
export interface ContributionQueueProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  submitPendingContribution(
    contribution: PendingContributionPayload
  ): Promise<ContributionSubmitResult>;
}
