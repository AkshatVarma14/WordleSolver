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
 * Status categorization for search and strategy evaluations.
 */
export type GuaranteeStatus =
  | 'WON'
  | 'PROVED_WIN'
  | 'DISPROVED_WIN'
  | 'UNRESOLVED_RESOURCE_LIMIT';

/**
 * Available solver strategies.
 */
export type StrategyType = 'FAST_ENTROPY' | 'BOUNDED_MINIMAX';

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
