import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CandidateScope,
  ContradictionDiagnosis,
  RecommendationResult,
  SearchBudget,
  StrategyType,
  TurnRecord,
  UnifiedRecommendation,
  filterByLayeredHistory,
  getBoundedSearchRecommendation,
  getFastRecommendation,
  getUnifiedRecommendation,
} from '@wordle-solver/solver';
import { ALL_VALID_GUESSES, INITIAL_ANSWERS } from '../data/words';
import { WorkerRequest, WorkerResponse } from '../worker/types';

export interface UseSolverWorkerReturn {
  readonly loading: boolean;
  readonly recommendation: RecommendationResult | UnifiedRecommendation | null;
  readonly remainingCandidates: readonly string[];
  readonly candidatesCount: number;
  readonly isContradiction: boolean;
  readonly contradictionDiagnosis: ContradictionDiagnosis | null;
  readonly candidateScope: CandidateScope;
  readonly isExpandedFallback: boolean;
  readonly error: string | null;
  readonly compareData: {
    readonly fastResult: RecommendationResult;
    readonly deeperResult: RecommendationResult;
  } | null;
  readonly requestSolve: (
    history: readonly TurnRecord[],
    strategy?: StrategyType | 'UNIFIED',
    budget?: Partial<SearchBudget>,
    turnsRemaining?: number
  ) => void;
  readonly requestCompare: (
    history: readonly TurnRecord[],
    budget?: Partial<SearchBudget>,
    turnsRemaining?: number
  ) => void;
  readonly cancelSolve: () => void;
  readonly resetSolve: () => void;
  readonly clearCompare: () => void;
}

// Pre-cached initial recommendation for the empty-board state (<1ms)
const INITIAL_REC: UnifiedRecommendation = getUnifiedRecommendation(
  INITIAL_ANSWERS,
  ALL_VALID_GUESSES,
  6
);

export function useSolverWorker(): UseSolverWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);
  const loadingRef = useRef<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [recommendation, setRecommendation] = useState<
    RecommendationResult | UnifiedRecommendation | null
  >(INITIAL_REC);
  const [remainingCandidates, setRemainingCandidates] = useState<readonly string[]>(INITIAL_ANSWERS);
  const [candidatesCount, setCandidatesCount] = useState<number>(INITIAL_ANSWERS.length);
  const [isContradiction, setIsContradiction] = useState<boolean>(false);
  const [contradictionDiagnosis, setContradictionDiagnosis] = useState<ContradictionDiagnosis | null>(null);
  const [candidateScope, setCandidateScope] = useState<CandidateScope>('PRIMARY');
  const [isExpandedFallback, setIsExpandedFallback] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<{
    readonly fastResult: RecommendationResult;
    readonly deeperResult: RecommendationResult;
  } | null>(null);

  // Instantiates a fresh Web Worker and binds message listeners
  const createWorkerInstance = useCallback((): Worker | null => {
    try {
      if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        const worker = new Worker(new URL('../worker/solver.worker.ts', import.meta.url), {
          type: 'module',
        });

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const res = event.data;
          // Discard stale responses from superseded requests
          if (res.id !== requestIdRef.current) {
            return;
          }

          loadingRef.current = false;
          setLoading(false);

          if (res.type === 'SOLVE_SUCCESS') {
            setRecommendation(res.result);
            setRemainingCandidates(res.remainingCandidates);
            setCandidatesCount(res.candidatesCount);
            setIsContradiction(res.isContradiction);
            setContradictionDiagnosis(res.contradictionDiagnosis ?? null);
            setCandidateScope(res.candidateScope ?? 'PRIMARY');
            setIsExpandedFallback(Boolean(res.isExpandedFallback));
            setError(null);
          } else if (res.type === 'COMPARE_SUCCESS') {
            setCompareData({
              fastResult: res.fastResult,
              deeperResult: res.deeperResult,
            });
            setRemainingCandidates(res.remainingCandidates);
            setCandidatesCount(res.candidatesCount);
            setIsContradiction(res.isContradiction);
            setCandidateScope(res.candidateScope ?? 'PRIMARY');
            setIsExpandedFallback(Boolean(res.isExpandedFallback));
            setError(null);
          } else if (res.type === 'ERROR') {
            setError(res.message);
          }
        };

        worker.onerror = (err) => {
          loadingRef.current = false;
          setLoading(false);
          setError(`Worker execution error: ${err.message || 'unknown error'}`);
        };

        return worker;
      }
    } catch {
      // Fallback: worker not supported (e.g. test environment)
    }
    return null;
  }, []);

  // Initialize Web Worker on mount
  useEffect(() => {
    workerRef.current = createWorkerInstance();

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [createWorkerInstance]);

  // Request solve with cooperative termination and immediate recalculation
  const requestSolve = useCallback(
    (
      history: readonly TurnRecord[],
      strategy?: StrategyType | 'UNIFIED',
      budget?: Partial<SearchBudget>,
      turnsRemaining: number = 6 - history.length
    ) => {
      const nextId = ++requestIdRef.current;
      setError(null);

      // Fast synchronous candidate filtering on main thread using layered history
      const layeredResult = filterByLayeredHistory(
        INITIAL_ANSWERS,
        ALL_VALID_GUESSES,
        history
      );
      const candidates = layeredResult.candidates;
      const isFallback = layeredResult.isExpandedFallback;
      const scope = layeredResult.scope;

      setRemainingCandidates(candidates);
      setCandidatesCount(candidates.length);
      setIsContradiction(layeredResult.isContradiction);
      setCandidateScope(scope);
      setIsExpandedFallback(isFallback);

      // 1. Contradiction State Check (zero candidates in both primary and fallback)
      if (layeredResult.isContradiction) {
        // Abort any in-flight worker immediately
        if (workerRef.current && loadingRef.current) {
          workerRef.current.terminate();
          workerRef.current = createWorkerInstance();
        }
        loadingRef.current = false;
        setLoading(false);
        setContradictionDiagnosis(layeredResult.contradictionDiagnosis);
        let contradictionRec: RecommendationResult | UnifiedRecommendation;
        if (strategy === 'FAST_ENTROPY') {
          contradictionRec = getFastRecommendation([], ALL_VALID_GUESSES);
        } else if (strategy === 'BOUNDED_MINIMAX') {
          contradictionRec = getBoundedSearchRecommendation([], ALL_VALID_GUESSES, budget, turnsRemaining);
        } else {
          contradictionRec = getUnifiedRecommendation([], ALL_VALID_GUESSES, turnsRemaining);
        }
        setRecommendation(contradictionRec);
        return;
      }

      setContradictionDiagnosis(layeredResult.contradictionDiagnosis ?? null);

      // 2. Initial Empty-Board Cache Check
      if (history.length === 0) {
        if (workerRef.current && loadingRef.current) {
          workerRef.current.terminate();
          workerRef.current = createWorkerInstance();
        }
        loadingRef.current = false;
        setLoading(false);
        setRecommendation(INITIAL_REC);
        return;
      }

      // 3. Round Completion Check (5 confirmed Green tiles on any turn)
      const isWon = history.some((turn) => turn.feedback.every((tile) => tile === 2));
      if (isWon) {
        if (workerRef.current && loadingRef.current) {
          workerRef.current.terminate();
          workerRef.current = createWorkerInstance();
        }
        loadingRef.current = false;
        setLoading(false);
        setRecommendation(null);
        return;
      }

      // 4. Invalidate old recommendation so it is never shown as current during calculation
      const wasLoading = loadingRef.current;
      setRecommendation(null);
      loadingRef.current = true;
      setLoading(true);

      // 5. Hard search cancellation: terminate running worker to stop obsolete CPU work
      if (workerRef.current) {
        if (wasLoading) {
          workerRef.current.terminate();
          workerRef.current = createWorkerInstance();
        }

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
          return;
        }
      }

      // Synchronous fallback when Web Worker is unavailable (e.g., in unit tests)
      try {
        let result: RecommendationResult | UnifiedRecommendation;
        const policyOptions = {
          candidateScope: scope,
          isExpandedFallback: isFallback,
        };

        if (!strategy || strategy === 'UNIFIED') {
          result = getUnifiedRecommendation(
            candidates,
            ALL_VALID_GUESSES,
            turnsRemaining,
            policyOptions
          );
        } else if (strategy === 'FAST_ENTROPY') {
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
          loadingRef.current = false;
          setLoading(false);
          setRecommendation(result);
          setError(null);
        }
      } catch (err) {
        if (nextId === requestIdRef.current) {
          loadingRef.current = false;
          setLoading(false);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [createWorkerInstance]
  );

  // Request strategy comparison
  const requestCompare = useCallback(
    (
      history: readonly TurnRecord[],
      budget?: Partial<SearchBudget>,
      turnsRemaining: number = 6 - history.length
    ) => {
      const nextId = ++requestIdRef.current;
      if (workerRef.current && loadingRef.current) {
        workerRef.current.terminate();
        workerRef.current = createWorkerInstance();
      }
      loadingRef.current = true;
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
          const layeredResult = filterByLayeredHistory(
            INITIAL_ANSWERS,
            ALL_VALID_GUESSES,
            history
          );
          const candidates = layeredResult.candidates;
          const fastResult = getFastRecommendation(candidates, ALL_VALID_GUESSES);
          const deeperResult = getBoundedSearchRecommendation(
            candidates,
            ALL_VALID_GUESSES,
            budget,
            turnsRemaining
          );

          if (nextId === requestIdRef.current) {
            loadingRef.current = false;
            setLoading(false);
            setCompareData({ fastResult, deeperResult });
            setRemainingCandidates(candidates);
            setCandidatesCount(candidates.length);
            setIsContradiction(layeredResult.isContradiction);
            setCandidateScope(layeredResult.scope);
            setIsExpandedFallback(layeredResult.isExpandedFallback);
            setError(null);
          }
        } catch (err) {
          if (nextId === requestIdRef.current) {
            loadingRef.current = false;
            setLoading(false);
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      }
    },
    [createWorkerInstance]
  );

  // Cancel any active solve request and terminate worker
  const cancelSolve = useCallback(() => {
    requestIdRef.current++;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = createWorkerInstance();
    }
    loadingRef.current = false;
    setLoading(false);
    setRecommendation(null);
  }, [createWorkerInstance]);

  // Reset solver to initial empty-board state
  const resetSolve = useCallback(() => {
    requestIdRef.current++;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = createWorkerInstance();
    }
    loadingRef.current = false;
    setLoading(false);
    setRecommendation(INITIAL_REC);
    setRemainingCandidates(INITIAL_ANSWERS);
    setCandidatesCount(INITIAL_ANSWERS.length);
    setIsContradiction(false);
    setContradictionDiagnosis(null);
    setCandidateScope('PRIMARY');
    setIsExpandedFallback(false);
    setError(null);
    setCompareData(null);
  }, [createWorkerInstance]);

  const clearCompare = useCallback(() => {
    setCompareData(null);
  }, []);

  return {
    loading,
    recommendation,
    remainingCandidates,
    candidatesCount,
    isContradiction,
    contradictionDiagnosis,
    candidateScope,
    isExpandedFallback,
    error,
    compareData,
    requestSolve,
    requestCompare,
    cancelSolve,
    resetSolve,
    clearCompare,
  };
}
