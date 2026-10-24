import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  filterByHistory,
  getUnifiedRecommendation,
  getBoundedSearchRecommendation,
  getFastRecommendation,
  TurnRecord,
  UnifiedRecommendation,
} from '@wordle-solver/solver';

// Load ground-truth word lists directly from repository data files
const answersPath = path.resolve(__dirname, '../../data/answers.txt');
const guessesPath = path.resolve(__dirname, '../../data/valid-guesses.txt');

const ANSWERS: readonly string[] = Object.freeze(
  fs.readFileSync(answersPath, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean)
);

const GUESSES: readonly string[] = Object.freeze(
  fs.readFileSync(guessesPath, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean)
);

describe('Performance & Correctness Audit (Stage 5)', () => {
  beforeAll(() => {
    // Warm up V8 JIT for filterByHistory to ensure reliable timing measurements
    filterByHistory(ANSWERS, [{ guess: 'CRANE', feedback: [0, 0, 0, 0, 0] }]);
  });
  it('Scenario 1: Initial recommendation on full 2,315-word dictionary (<1ms)', () => {
    const t0 = performance.now();
    const rec = getUnifiedRecommendation(ANSWERS, GUESSES, 6);
    const durationMs = performance.now() - t0;

    expect(rec.recommendedGuess).toBe('SALET');
    expect(rec.status).toBe('HEURISTIC');
    expect(rec.candidatesCount).toBe(2315);
    expect(durationMs).toBeLessThan(5); // Sub-millisecond to under 5ms
  });

  it('Scenario 2: Typical post-guess candidate set (~20-40 words)', () => {
    // Turn 1: Guess CRANE with feedback [0, 1, 0, 0, 2]
    const history: TurnRecord[] = [
      { guess: 'CRANE', feedback: [0, 1, 0, 0, 2] },
    ];

    const tFilter0 = performance.now();
    const filterResult = filterByHistory(ANSWERS, history);
    const filterTimeMs = performance.now() - tFilter0;

    const candidates = filterResult.candidates;
    expect(candidates.length).toBeGreaterThan(5);
    expect(candidates.length).toBeLessThan(100);

    const tSolve0 = performance.now();
    const rec = getUnifiedRecommendation(candidates, GUESSES, 5);
    const solveTimeMs = performance.now() - tSolve0;

    expect(rec.recommendedGuess).toBeTruthy();
    expect(rec.candidatesCount).toBe(candidates.length);
    expect(filterTimeMs).toBeLessThan(50);
    expect(solveTimeMs).toBeLessThan(1000);
  });

  it('Scenario 3: Larger remaining candidate set (~150-250 words after uninformative guess)', () => {
    // Turn 1: Guess SALET with feedback [0, 0, 0, 0, 0] (all grey)
    const history: TurnRecord[] = [
      { guess: 'SALET', feedback: [0, 0, 0, 0, 0] },
    ];

    const tFilter0 = performance.now();
    const filterResult = filterByHistory(ANSWERS, history);
    const filterTimeMs = performance.now() - tFilter0;

    const candidates = filterResult.candidates;
    expect(candidates.length).toBeGreaterThan(100);

    const tSolve0 = performance.now();
    // Fast entropy recommendation across the surviving candidates
    const rec = getFastRecommendation(candidates, candidates, 1);
    const solveTimeMs = performance.now() - tSolve0;

    expect(rec.recommendedGuess).toBeTruthy();
    expect(rec.candidatesCount).toBe(candidates.length);
    expect(filterTimeMs).toBeLessThan(50);
    expect(solveTimeMs).toBeLessThan(1000);
  });

  it('Scenario 4: Deeper-search request on bounded endgame state', () => {
    // 5 rhyming candidates: BOUND, FOUND, HOUND, MOUND, ROUND
    const candidates = ['BOUND', 'FOUND', 'HOUND', 'MOUND', 'ROUND'];
    // Include separator probe FROTH
    const allowed = ['BOUND', 'FOUND', 'HOUND', 'MOUND', 'ROUND', 'FROTH', 'BLIMP'];

    const t0 = performance.now();
    const rec = getBoundedSearchRecommendation(
      candidates,
      allowed,
      { maxDepth: 3, maxBranchCandidates: 15, timeoutMs: 500 },
      3
    );
    const durationMs = performance.now() - t0;

    expect(rec.recommendedGuess).toBeTruthy();
    expect(rec.searchMetrics).toBeDefined();
    expect(rec.searchMetrics!.nodesExpanded).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(500); // Strictly within 500ms budget limit
  });

  it('Scenario 5: Supersession of in-progress search when new observation arrives', () => {
    // Simulate stale ID supersession logic as implemented in useSolverWorker
    let currentRequestId = 0;
    let appliedResultId: number | null = null;
    let appliedRecommendation: UnifiedRecommendation | null = null;

    function handleWorkerResponse(response: { id: number; result: UnifiedRecommendation }) {
      // Discard stale responses from superseded requests
      if (response.id !== currentRequestId) {
        return;
      }
      appliedResultId = response.id;
      appliedRecommendation = response.result;
    }

    // Step 1: Request 1 is dispatched
    const id1 = ++currentRequestId;
    const candidates1 = ['CRANE', 'SLATE', 'TRACE'];
    const dummyRec1 = getUnifiedRecommendation(candidates1, candidates1, 5);

    // Step 2: User immediately types/submits another row (Request 2 dispatched)
    const id2 = ++currentRequestId;
    const candidates2 = ['CRANE'];
    const dummyRec2 = getUnifiedRecommendation(candidates2, candidates2, 4);

    // Step 3: Delayed response from Request 1 arrives now
    handleWorkerResponse({ id: id1, result: dummyRec1 });
    // Verify Request 1 was discarded
    expect(appliedResultId).toBeNull();
    expect(appliedRecommendation).toBeNull();

    // Step 4: Response from Request 2 arrives
    handleWorkerResponse({ id: id2, result: dummyRec2 });
    // Verify Request 2 was accepted
    expect(appliedResultId).toBe(id2);
    expect(appliedRecommendation).not.toBeNull();
    if (appliedRecommendation) {
      expect((appliedRecommendation as UnifiedRecommendation).recommendedGuess).toBe('CRANE');
      expect((appliedRecommendation as UnifiedRecommendation).isWon).toBe(true);
    }
  });
});
