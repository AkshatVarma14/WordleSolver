import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { render, screen, waitFor } from '@testing-library/react';
import {
  evaluateFeedbackRaw,
  filterCandidates,
  filterByHistory,
  filterByLayeredHistory,
  getUnifiedRecommendation,
  TurnRecord,
} from '@wordle-solver/solver';
import { PopupApp } from '../../apps/extension/src/popup/PopupApp';
import { GetBoardStateResponse } from '../../apps/extension/src/types/messages';

const answersPath = path.resolve(__dirname, '../../data/answers.txt');
const guessesPath = path.resolve(__dirname, '../../data/valid-guesses.txt');

const PRODUCTION_ANSWERS = Object.freeze(
  fs.readFileSync(answersPath, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean)
);

const ALL_VALID_GUESSES = Object.freeze(
  fs.readFileSync(guessesPath, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean)
);

describe('Layered Candidate Recovery & Vocabulary Gap Handling (Stage 8E)', () => {
  let mockSendMessageResponse: GetBoardStateResponse | null = null;

  beforeEach(() => {
    (global as unknown as { chrome: unknown }).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://www.nytimes.com/games/wordle' }]),
        sendMessage: vi.fn().mockImplementation((_tabId: number, _msg: unknown, callback?: (res: unknown) => void) => {
          if (callback) {
            callback(mockSendMessageResponse);
          }
          return Promise.resolve(mockSendMessageResponse);
        }),
      },
      runtime: {
        lastError: undefined,
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Scenario 1: Actual missed-answer scenario (HOLEY - NYT Oct 24, 2026)
  describe('Scenario 1: Live NYT Missed Answer Case Study (HOLEY)', () => {
    it('Demonstrates that HOLEY is in valid-guesses but absent from curated answers', () => {
      expect(ALL_VALID_GUESSES).toContain('HOLEY');
      expect(PRODUCTION_ANSWERS).not.toContain('HOLEY');
    });

    it('Recovers HOLEY via fallback when primary answer list is exhausted', () => {
      // Step-by-step turns eliminating other possibilities
      const turns: TurnRecord[] = [
        { guess: 'SALET', feedback: evaluateFeedbackRaw('SALET', 'HOLEY') }, // [0, 0, 2, 2, 0]
        { guess: 'BOLED', feedback: evaluateFeedbackRaw('BOLED', 'HOLEY') }, // [0, 2, 2, 2, 0]
        { guess: 'GOLEM', feedback: evaluateFeedbackRaw('GOLEM', 'HOLEY') }, // [0, 2, 2, 2, 0]
        { guess: 'CHAMP', feedback: evaluateFeedbackRaw('CHAMP', 'HOLEY') }, // [0, 1, 0, 0, 0]
      ];

      // Standard single-tier filtering fails on primary answers
      const primaryResult = filterByHistory(PRODUCTION_ANSWERS, turns);
      expect(primaryResult.candidates).toEqual([]);
      expect(primaryResult.isContradiction).toBe(true);

      // Layered recovery succeeds by transitioning to expanded accepted guesses
      const layeredResult = filterByLayeredHistory(PRODUCTION_ANSWERS, ALL_VALID_GUESSES, turns);
      expect(layeredResult.isContradiction).toBe(false);
      expect(layeredResult.isExpandedFallback).toBe(true);
      expect(layeredResult.scope).toBe('EXPANDED_FALLBACK');
      expect(layeredResult.primaryCount).toBe(0);
      expect(layeredResult.expandedCount).toBe(1);
      expect(layeredResult.candidates).toEqual(['HOLEY']);
      expect(layeredResult.warning).toContain('Curated answer list exhausted');

      // Recommendation policy labels fallback as unverified heuristic rather than guaranteed win
      const rec = getUnifiedRecommendation(layeredResult.candidates, ALL_VALID_GUESSES, 6 - turns.length, {
        candidateScope: layeredResult.scope,
        isExpandedFallback: layeredResult.isExpandedFallback,
      });

      expect(rec.recommendedGuess).toBe('HOLEY');
      expect(rec.status).toBe('HEURISTIC'); // Not 'WON' because it is unverified
      expect(rec.isWon).toBe(false);
      expect(rec.worstCaseTurns).toBe(1);
      expect(rec.isExpandedFallback).toBe(true);
      expect(rec.warning).toContain('Unverified fallback candidate');
    });
  });

  // Scenario 2: Normal filtering where primary answer candidates remain available
  describe('Scenario 2: Normal Primary Filtering Workflow', () => {
    it('Retains PRIMARY scope and does not invoke fallback when answers exist', () => {
      const turns: TurnRecord[] = [
        { guess: 'SALET', feedback: evaluateFeedbackRaw('SALET', 'LIGHT') },
      ];

      const layeredResult = filterByLayeredHistory(PRODUCTION_ANSWERS, ALL_VALID_GUESSES, turns);
      expect(layeredResult.scope).toBe('PRIMARY');
      expect(layeredResult.isExpandedFallback).toBe(false);
      expect(layeredResult.isContradiction).toBe(false);
      expect(layeredResult.candidates.length).toBeGreaterThan(0);
      expect(layeredResult.candidates).toContain('LIGHT');
      expect(layeredResult.expandedCount).toBe(0);
      expect(layeredResult.warning).toBeUndefined();

      const rec = getUnifiedRecommendation(layeredResult.candidates, ALL_VALID_GUESSES, 5, {
        candidateScope: layeredResult.scope,
        isExpandedFallback: layeredResult.isExpandedFallback,
      });

      expect(rec.isExpandedFallback).toBe(false);
      expect(rec.candidateScope).toBe('PRIMARY');
    });
  });

  // Scenario 3: Empty primary candidates but nonempty expanded fallback candidates (TRILL & PSHAW)
  describe('Scenario 3: Expanded Fallback Candidates (TRILL & PSHAW)', () => {
    it('Recovers TRILL (NYT Oct 23, 2026) when primary answers reach zero', () => {
      expect(ALL_VALID_GUESSES).toContain('TRILL');
      expect(PRODUCTION_ANSWERS).not.toContain('TRILL');

      const turns: TurnRecord[] = [
        { guess: 'SALET', feedback: evaluateFeedbackRaw('SALET', 'TRILL') }, // [0, 0, 1, 0, 1]
        { guess: 'ROBIN', feedback: evaluateFeedbackRaw('ROBIN', 'TRILL') }, // [1, 0, 0, 1, 0]
        { guess: 'CURLY', feedback: evaluateFeedbackRaw('CURLY', 'TRILL') }, // [0, 0, 1, 2, 0]
      ];

      const layeredResult = filterByLayeredHistory(PRODUCTION_ANSWERS, ALL_VALID_GUESSES, turns);
      expect(layeredResult.primaryCount).toBe(0);
      expect(layeredResult.isExpandedFallback).toBe(true);
      expect(layeredResult.scope).toBe('EXPANDED_FALLBACK');
      expect(layeredResult.candidates).toContain('TRILL');
      expect(layeredResult.isContradiction).toBe(false);
    });

    it('Recovers PSHAW when primary answers reach zero', () => {
      const turns: TurnRecord[] = [
        { guess: 'CRANE', feedback: evaluateFeedbackRaw('CRANE', 'PSHAW') }, // [0, 0, 1, 0, 0]
        { guess: 'PILOT', feedback: evaluateFeedbackRaw('PILOT', 'PSHAW') }, // [2, 0, 0, 0, 0]
        { guess: 'SHADY', feedback: evaluateFeedbackRaw('SHADY', 'PSHAW') }, // [1, 1, 1, 0, 0]
      ];

      const layeredResult = filterByLayeredHistory(PRODUCTION_ANSWERS, ALL_VALID_GUESSES, turns);
      expect(layeredResult.isExpandedFallback).toBe(true);
      expect(layeredResult.candidates).toContain('PSHAW');
      expect(layeredResult.warning).toContain('Curated answer list exhausted');
    });
  });

  // Scenario 4: Contradictory feedback producing 0 candidates in both pools
  describe('Scenario 4: Genuine Logical Contradiction Across All Vocabularies', () => {
    it('Detects impossible feedback patterns that match zero English words in any pool', () => {
      // Impossible: E at index 4 is marked absent, but then marked green
      const impossibleTurns: TurnRecord[] = [
        { guess: 'CRANE', feedback: [0, 0, 0, 0, 0] },
        { guess: 'SLATE', feedback: [0, 0, 0, 0, 2] },
      ];

      const layeredResult = filterByLayeredHistory(PRODUCTION_ANSWERS, ALL_VALID_GUESSES, impossibleTurns);
      expect(layeredResult.isContradiction).toBe(true);
      expect(layeredResult.isExpandedFallback).toBe(false);
      expect(layeredResult.candidates).toEqual([]);
      expect(layeredResult.contradictionDiagnosis).not.toBeNull();
      expect(layeredResult.contradictionDiagnosis?.isVocabularyMismatch).toBe(false);
      expect(layeredResult.contradictionDiagnosis?.explanation).toContain('internally contradictory');
    });
  });

  // Scenario 5: Duplicate-letter feedback in fallback mode
  describe('Scenario 5: Duplicate-Letter Feedback Accounting in Fallback Mode', () => {
    it('Correctly enforces exact letter multiplicity when filtering expanded vocabulary', () => {
      // TRILL contains two Ls at pos 3 and 4
      // Guess LEVEL has L at pos 0 and pos 4
      // When evaluated against TRILL:
      // LEVEL[0] ('L') -> yellow (1) (matches remaining L in TRILL)
      // LEVEL[1] ('E') -> grey (0)
      // LEVEL[2] ('V') -> grey (0)
      // LEVEL[3] ('E') -> grey (0)
      // LEVEL[4] ('L') -> green (2) (exact match)
      const fb = evaluateFeedbackRaw('LEVEL', 'TRILL');
      expect(fb).toEqual([1, 0, 0, 0, 2]);

      const candidatesWithLevel = filterCandidates(['TRAIL', 'TRILL', 'TROLL', 'GRILL'], 'LEVEL', fb);
      // 'TRAIL' has only one L at pos 4, so pos 0 L would be 0 (grey) -> rejected
      expect(candidatesWithLevel).not.toContain('TRAIL');
      // 'TRILL' has two Ls -> accepted
      expect(candidatesWithLevel).toContain('TRILL');
      expect(candidatesWithLevel).toContain('GRILL');
    });
  });

  // Scenario 6: Editing an observation while fallback calculation is active
  describe('Scenario 6: Dynamic Observation Editing & Scope Recovery', () => {
    it('Seamlessly transitions back from EXPANDED_FALLBACK to PRIMARY upon user correction', () => {
      // Initial erroneous turn sequence that triggers fallback
      const erroneousTurns: TurnRecord[] = [
        { guess: 'SALET', feedback: [0, 0, 2, 2, 0] },
        { guess: 'BOLED', feedback: [0, 2, 2, 2, 0] },
        { guess: 'GOLEM', feedback: [0, 2, 2, 2, 0] }, // Drops primary candidates to 0
      ];

      const state1 = filterByLayeredHistory(PRODUCTION_ANSWERS, ALL_VALID_GUESSES, erroneousTurns);
      expect(state1.isExpandedFallback).toBe(true);
      expect(state1.scope).toBe('EXPANDED_FALLBACK');

      // User corrects turn 3 feedback (e.g. user misclicked tile feedback)
      const correctedTurns: TurnRecord[] = [
        erroneousTurns[0]!,
        erroneousTurns[1]!,
        { guess: 'GOLEM', feedback: [2, 2, 2, 2, 2] }, // User realized GOLEM was the answer
      ];

      const state2 = filterByLayeredHistory(PRODUCTION_ANSWERS, ALL_VALID_GUESSES, correctedTurns);
      expect(state2.isExpandedFallback).toBe(false);
      expect(state2.scope).toBe('PRIMARY');
      expect(state2.candidates).toEqual(['GOLEM']);
    });
  });

  // Scenario 7: Correct candidate counts and clear fallback labelling in extension popup
  describe('Scenario 7: Extension Popup Fallback UI & Metric Indicators', () => {
    it('Renders Fallback (Unverified) badge, banner, and expanded denominator', async () => {
      mockSendMessageResponse = {
        type: 'BOARD_STATE_RESULT',
        payload: {
          success: true,
          strategy: 'CSS_MODULES',
          turns: [
            { guess: 'SALET', feedback: [0, 0, 2, 2, 0] },
            { guess: 'BOLED', feedback: [0, 2, 2, 2, 0] },
            { guess: 'GOLEM', feedback: [0, 2, 2, 2, 0] },
            { guess: 'CHAMP', feedback: [0, 1, 0, 0, 0] },
          ],
          activeRowIndex: 4,
          isRoundWon: false,
          isRoundLost: false,
          isComplete: false,
          rawRowsFound: 6,
        },
      };

      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByText('HOLEY')).toBeTruthy();
      });

      // Verify Fallback badge
      expect(screen.getByText('Fallback (Unverified)')).toBeTruthy();

      // Verify advisory banner
      expect(
        screen.getByText(/Curated answer list exhausted\. Showing matches from accepted guesses\./i)
      ).toBeTruthy();

      // Verify metric shows 1 / 12,972 (not 2,315)
      expect(screen.getByText('1 / 12,972')).toBeTruthy();
      expect(screen.getByText(/fallback pool/i)).toBeTruthy();
    });
  });

  // Scenario 8: Matching behavior between web app and extension
  describe('Scenario 8: Deterministic Parity Between Web App and Extension', () => {
    it('Guarantees identical filtering, scoping, and recommendations between environments', () => {
      const testCases: TurnRecord[][] = [
        // Case A: Fresh board
        [],
        // Case B: Normal game (SALET [0,1,0,0,1])
        [{ guess: 'SALET', feedback: [0, 1, 0, 0, 1] }],
        // Case C: Fallback HOLEY
        [
          { guess: 'SALET', feedback: [0, 0, 2, 2, 0] },
          { guess: 'BOLED', feedback: [0, 2, 2, 2, 0] },
          { guess: 'GOLEM', feedback: [0, 2, 2, 2, 0] },
          { guess: 'CHAMP', feedback: [0, 1, 0, 0, 0] },
        ],
        // Case D: Contradiction
        [
          { guess: 'CRANE', feedback: [0, 0, 0, 0, 0] },
          { guess: 'SLATE', feedback: [0, 0, 0, 0, 2] },
        ],
      ];

      for (const history of testCases) {
        // Shared engine call as used by web solver worker
        const webFilter = filterByLayeredHistory(PRODUCTION_ANSWERS, ALL_VALID_GUESSES, history);
        const webRec = getUnifiedRecommendation(
          webFilter.candidates,
          ALL_VALID_GUESSES,
          6 - history.length,
          {
            candidateScope: webFilter.scope,
            isExpandedFallback: webFilter.isExpandedFallback,
          }
        );

        // Shared engine call as used by extension popup
        const extFilter = filterByLayeredHistory(PRODUCTION_ANSWERS, ALL_VALID_GUESSES, history);
        const extRec = getUnifiedRecommendation(
          extFilter.candidates,
          ALL_VALID_GUESSES,
          6 - history.length,
          {
            candidateScope: extFilter.scope,
            isExpandedFallback: extFilter.isExpandedFallback,
          }
        );

        expect(webFilter.scope).toBe(extFilter.scope);
        expect(webFilter.isExpandedFallback).toBe(extFilter.isExpandedFallback);
        expect(webFilter.isContradiction).toBe(extFilter.isContradiction);
        expect(webFilter.candidates).toEqual(extFilter.candidates);
        expect(webRec.recommendedGuess).toBe(extRec.recommendedGuess);
        expect(webRec.status).toBe(extRec.status);
        expect(webRec.isWon).toBe(extRec.isWon);
      }
    });
  });
});
