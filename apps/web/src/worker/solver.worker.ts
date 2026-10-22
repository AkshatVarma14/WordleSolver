import {
  filterByHistory,
  getBoundedSearchRecommendation,
  getFastRecommendation,
  getUnifiedRecommendation,
} from '@wordle-solver/solver';
import { ALL_VALID_GUESSES, INITIAL_ANSWERS } from '../data/words';
import { WorkerRequest, WorkerResponse } from './types';

// Self-contained Web Worker entry point
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  try {
    const filterResult = filterByHistory(INITIAL_ANSWERS, req.history);
    const candidates = filterResult.candidates;

    if (req.type === 'SOLVE') {
      let result;
      if (!req.strategy || req.strategy === 'UNIFIED') {
        result = getUnifiedRecommendation(
          candidates,
          ALL_VALID_GUESSES,
          req.turnsRemaining
        );
      } else if (req.strategy === 'FAST_ENTROPY') {
        result = getFastRecommendation(candidates, ALL_VALID_GUESSES);
      } else {
        result = getBoundedSearchRecommendation(
          candidates,
          ALL_VALID_GUESSES,
          req.budget,
          req.turnsRemaining
        );
      }

      const response: WorkerResponse = {
        id: req.id,
        type: 'SOLVE_SUCCESS',
        result,
        remainingCandidates: candidates,
        candidatesCount: candidates.length,
        isContradiction: filterResult.isContradiction,
      };

      self.postMessage(response);
    } else if (req.type === 'COMPARE') {
      const fastResult = getFastRecommendation(candidates, ALL_VALID_GUESSES);
      const deeperResult = getBoundedSearchRecommendation(
        candidates,
        ALL_VALID_GUESSES,
        req.budget,
        req.turnsRemaining
      );

      const response: WorkerResponse = {
        id: req.id,
        type: 'COMPARE_SUCCESS',
        fastResult,
        deeperResult,
        remainingCandidates: candidates,
        candidatesCount: candidates.length,
        isContradiction: filterResult.isContradiction,
      };

      self.postMessage(response);
    }
  } catch (error) {
    const response: WorkerResponse = {
      id: req.id,
      type: 'ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
