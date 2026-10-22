import {
  RecommendationResult,
  SearchBudget,
  StrategyType,
  TurnRecord,
  UnifiedRecommendation,
} from '@wordle-solver/solver';

/**
 * Action request dispatched from the React main thread to the Solver Web Worker.
 */
export type WorkerRequest =
  | {
      /** Monotonically increasing sequence ID to identify and discard stale responses */
      readonly id: number;
      readonly type: 'SOLVE';
      readonly history: readonly TurnRecord[];
      readonly strategy?: StrategyType | 'UNIFIED';
      readonly budget?: Partial<SearchBudget>;
      readonly turnsRemaining: number;
    }
  | {
      readonly id: number;
      readonly type: 'COMPARE';
      readonly history: readonly TurnRecord[];
      readonly budget?: Partial<SearchBudget>;
      readonly turnsRemaining: number;
    };

/**
 * Response message posted from the Solver Web Worker back to the React UI thread.
 */
export type WorkerResponse =
  | {
      readonly id: number;
      readonly type: 'SOLVE_SUCCESS';
      readonly result: RecommendationResult | UnifiedRecommendation;
      readonly remainingCandidates: readonly string[];
      readonly candidatesCount: number;
      readonly isContradiction: boolean;
    }
  | {
      readonly id: number;
      readonly type: 'COMPARE_SUCCESS';
      readonly fastResult: RecommendationResult;
      readonly deeperResult: RecommendationResult;
      readonly remainingCandidates: readonly string[];
      readonly candidatesCount: number;
      readonly isContradiction: boolean;
    }
  | {
      readonly id: number;
      readonly type: 'ERROR';
      readonly message: string;
    };
