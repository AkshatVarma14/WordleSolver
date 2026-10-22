import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSolverWorker } from '../src/hooks/useSolverWorker';
import { TurnRecord } from '@wordle-solver/solver';

describe('Worker Integration & Stale Result Protection', () => {
  it('Initializes with full 2,315 candidates and no contradiction', () => {
    const { result } = renderHook(() => useSolverWorker());

    expect(result.current.candidatesCount).toBe(2315);
    expect(result.current.remainingCandidates.length).toBe(2315);
    expect(result.current.isContradiction).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('Resolves solve requests and reduces candidate count on observation', () => {
    const { result } = renderHook(() => useSolverWorker());

    const history: TurnRecord[] = [
      // Guess CRANE with [0, 1, 0, 0, 2] (C:0, R:1, A:0, N:0, E:2)
      { guess: 'CRANE', feedback: [0, 1, 0, 0, 2] },
    ];

    act(() => {
      result.current.requestSolve(history, 'FAST_ENTROPY');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.candidatesCount).toBeLessThan(2315);
    expect(result.current.candidatesCount).toBeGreaterThan(0);
    expect(result.current.recommendation).not.toBeNull();
    expect(result.current.recommendation?.recommendedGuess).toBeTruthy();
    expect(result.current.isContradiction).toBe(false);
  });

  it('Detects contradiction when conflicting feedback is submitted', () => {
    const { result } = renderHook(() => useSolverWorker());

    const contradictoryHistory: TurnRecord[] = [
      // Pos 0 cannot be Green for both Z and Q simultaneously
      { guess: 'ZEBRA', feedback: [2, 0, 0, 0, 0] },
      { guess: 'QUARK', feedback: [2, 0, 0, 0, 0] },
    ];

    act(() => {
      result.current.requestSolve(contradictoryHistory, 'FAST_ENTROPY');
    });

    expect(result.current.candidatesCount).toBe(0);
    expect(result.current.isContradiction).toBe(true);
    expect(result.current.recommendation?.isContradiction).toBe(true);
  });

  it('Handles strategy comparison requests returning both fast and deeper results', () => {
    const { result } = renderHook(() => useSolverWorker());

    const history: TurnRecord[] = [
      { guess: 'CRANE', feedback: [0, 2, 2, 0, 2] },
    ];

    act(() => {
      result.current.requestCompare(history, { maxDepth: 2, timeoutMs: 2000 });
    });

    expect(result.current.compareData).not.toBeNull();
    expect(result.current.compareData?.fastResult.recommendedGuess).toBeTruthy();
    expect(result.current.compareData?.deeperResult.recommendedGuess).toBeTruthy();

    act(() => {
      result.current.clearCompare();
    });

    expect(result.current.compareData).toBeNull();
  });
});
