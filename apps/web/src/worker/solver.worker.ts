import {
  filterByLayeredHistory,
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
    const layeredResult = filterByLayeredHistory(
      INITIAL_ANSWERS,
      ALL_VALID_GUESSES,
      req.history
    );
    const candidates = layeredResult.candidates;
    const isExpandedFallback = layeredResult.isExpandedFallback;
    const candidateScope = layeredResult.scope;

    if (req.type === 'SOLVE') {
      let result = null;

      if (layeredResult.isContradiction) {
        if (req.strategy === 'FAST_ENTROPY') {
          result = getFastRecommendation([], ALL_VALID_GUESSES);
        } else if (req.strategy === 'BOUNDED_MINIMAX') {
          result = getBoundedSearchRecommendation(
            [],
            ALL_VALID_GUESSES,
            req.budget,
            req.turnsRemaining
          );
        } else {
          result = getUnifiedRecommendation(
            [],
            ALL_VALID_GUESSES,
            req.turnsRemaining
          );
        }
      } else {
        const policyOptions = {
          candidateScope,
          isExpandedFallback,
        };

        if (!req.strategy || req.strategy === 'UNIFIED') {
          result = getUnifiedRecommendation(
            candidates,
            ALL_VALID_GUESSES,
            req.turnsRemaining,
            policyOptions
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
      }

      const response: WorkerResponse = {
        id: req.id,
        type: 'SOLVE_SUCCESS',
        result,
        remainingCandidates: candidates,
        candidatesCount: candidates.length,
        isContradiction: layeredResult.isContradiction,
        contradictionDiagnosis: layeredResult.contradictionDiagnosis,
        candidateScope,
        isExpandedFallback,
        fallbackWarning: layeredResult.warning,
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
        isContradiction: layeredResult.isContradiction,
        candidateScope,
        isExpandedFallback,
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
