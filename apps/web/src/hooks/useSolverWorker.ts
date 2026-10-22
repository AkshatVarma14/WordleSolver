import { useEffect, useRef, useState, useCallback } from 'react';
import {
  RecommendationResult,
  SearchBudget,
  StrategyType,
  TurnRecord,
  filterByHistory,
  getBoundedSearchRecommendation,
  getFastRecommendation,
} from '@wordle-solver/solver';
import { ALL_VALID_GUESSES, INITIAL_ANSWERS } from '../data/words';
import { WorkerRequest, WorkerResponse } from '../worker/types';

export interface UseSolverWorkerReturn {
  readonly loading: boolean;
  readonly recommendation: RecommendationResult | null;
  readonly remainingCandidates: readonly string[];
  readonly candidatesCount: number;
  readonly isContradiction: boolean;
  readonly error: string | null;
  readonly compareData: {
    readonly fastResult: RecommendationResult;
    readonly deeperResult: RecommendationResult;
  } | null;
  readonly requestSolve: (
    history: readonly TurnRecord[],
    strategy: StrategyType,
    budget?: Partial<SearchBudget>,
    turnsRemaining?: number
  ) => void;
  readonly requestCompare: (
    history: readonly TurnRecord[],
    budget?: Partial<SearchBudget>,
    turnsRemaining?: number
  ) => void;
  readonly clearCompare: () => void;
}

export function useSolverWorker(): UseSolverWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);

  const [loading, setLoading] = useState<boolean>(false);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [remainingCandidates, setRemainingCandidates] = useState<readonly string[]>(INITIAL_ANSWERS);
  const [candidatesCount, setCandidatesCount] = useState<number>(INITIAL_ANSWERS.length);
  const [isContradiction, setIsContradiction] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<{
    readonly fastResult: RecommendationResult;
    readonly deeperResult: RecommendationResult;
  } | null>(null);

  // Initialize Web Worker with graceful fallback
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        worker = new Worker(new URL('../worker/solver.worker.ts', import.meta.url), {
          type: 'module',
        });

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const res = event.data;
          // Discard stale responses from superseded requests
          if (res.id !== requestIdRef.current) {
            return;
          }

          setLoading(false);

          if (res.type === 'SOLVE_SUCCESS') {
            setRecommendation(res.result);
            setRemainingCandidates(res.remainingCandidates);
            setCandidatesCount(res.candidatesCount);
            setIsContradiction(res.isContradiction);
            setError(null);
          } else if (res.type === 'COMPARE_SUCCESS') {
            setCompareData({
              fastResult: res.fastResult,
              deeperResult: res.deeperResult,
            });
            setRemainingCandidates(res.remainingCandidates);
            setCandidatesCount(res.candidatesCount);
            setIsContradiction(res.isContradiction);
            setError(null);
          } else if (res.type === 'ERROR') {
            setError(res.message);
          }
        };

        worker.onerror = (err) => {
          setLoading(false);
          setError(`Worker execution error: ${err.message || 'unknown error'}`);
        };

        workerRef.current = worker;
      }
    } catch {
      // Fallback: worker not supported (e.g. test environment or file:// protocol)
      workerRef.current = null;
    }

    return () => {
      if (worker) {
        worker.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Request solve with stale-state supersession
  const requestSolve = useCallback(
    (
      history: readonly TurnRecord[],
      strategy: StrategyType,
      budget?: Partial<SearchBudget>,
      turnsRemaining: number = 6 - history.length
    ) => {
      const nextId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      const worker = workerRef.current;
      if (worker) {
        const req: WorkerRequest = {
          id: nextId,
          type: 'SOLVE',
          history,
          strategy,
          budget,
          turnsRemaining,
        };
        worker.postMessage(req);
      } else {
        // Synchronous fallback when Web Worker is unavailable (e.g., in unit tests)
        try {
          const filterResult = filterByHistory(INITIAL_ANSWERS, history);
          const candidates = filterResult.candidates;
          let result: RecommendationResult;

          if (strategy === 'FAST_ENTROPY') {
            result = getFastRecommendation(candidates, ALL_VALID_GUESSES);
          } else {
            result = getBoundedSearchRecommendation(
              candidates,
              ALL_VALID_GUESSES,
              budget,
              turnsRemaining
            );
          }

          if (nextId === requestIdRef.current) {
            setLoading(false);
            setRecommendation(result);
            setRemainingCandidates(candidates);
            setCandidatesCount(candidates.length);
            setIsContradiction(filterResult.isContradiction);
            setError(null);
          }
        } catch (err) {
          if (nextId === requestIdRef.current) {
            setLoading(false);
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      }
    },
    []
  );

  // Request strategy comparison
  const requestCompare = useCallback(
    (
      history: readonly TurnRecord[],
      budget?: Partial<SearchBudget>,
      turnsRemaining: number = 6 - history.length
    ) => {
      const nextId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      const worker = workerRef.current;
      if (worker) {
        const req: WorkerRequest = {
          id: nextId,
          type: 'COMPARE',
          history,
          budget,
          turnsRemaining,
        };
        worker.postMessage(req);
      } else {
        // Synchronous fallback
        try {
          const filterResult = filterByHistory(INITIAL_ANSWERS, history);
          const candidates = filterResult.candidates;
          const fastResult = getFastRecommendation(candidates, ALL_VALID_GUESSES);
          const deeperResult = getBoundedSearchRecommendation(
            candidates,
            ALL_VALID_GUESSES,
            budget,
            turnsRemaining
          );

          if (nextId === requestIdRef.current) {
            setLoading(false);
            setCompareData({ fastResult, deeperResult });
            setRemainingCandidates(candidates);
            setCandidatesCount(candidates.length);
            setIsContradiction(filterResult.isContradiction);
            setError(null);
          }
        } catch (err) {
          if (nextId === requestIdRef.current) {
            setLoading(false);
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      }
    },
    []
  );

  const clearCompare = useCallback(() => {
    setCompareData(null);
  }, []);

  return {
    loading,
    recommendation,
    remainingCandidates,
    candidatesCount,
    isContradiction,
    error,
    compareData,
    requestSolve,
    requestCompare,
    clearCompare,
  };
}
