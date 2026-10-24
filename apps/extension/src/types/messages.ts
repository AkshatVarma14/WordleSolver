import { TurnRecord } from '@wordle-solver/solver';

export type ReaderStrategy = 'CSS_MODULES' | 'SHADOW_DOM' | 'SEMANTIC_ARIA' | 'NONE';

/**
 * Structured result extracted from the active Wordle webpage DOM.
 */
export interface DOMBoardExtraction {
  readonly success: boolean;
  readonly strategy: ReaderStrategy;
  readonly turns: readonly TurnRecord[];
  readonly activeRowIndex: number;
  readonly isRoundWon: boolean;
  readonly isRoundLost: boolean;
  readonly isComplete: boolean;
  readonly error?: string;
  readonly rawRowsFound: number;
}

/**
 * Message sent from Popup -> Content Script to fetch current board state.
 */
export interface GetBoardStateRequest {
  readonly type: 'GET_BOARD_STATE';
}

/**
 * Message response from Content Script -> Popup.
 */
export interface GetBoardStateResponse {
  readonly type: 'BOARD_STATE_RESULT';
  readonly payload: DOMBoardExtraction;
}

/**
 * Message sent from Content Script -> Background / Popup on DOM mutation.
 */
export interface BoardMutatedNotification {
  readonly type: 'BOARD_MUTATED';
  readonly payload: DOMBoardExtraction;
}

export type ExtensionMessage =
  | GetBoardStateRequest
  | GetBoardStateResponse
  | BoardMutatedNotification;
