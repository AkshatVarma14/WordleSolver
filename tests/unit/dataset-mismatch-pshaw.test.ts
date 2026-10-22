import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateFeedbackRaw,
  filterByHistory,
  diagnoseContradiction,
  TurnRecord,
} from '@wordle-solver/solver';

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

describe('Dataset Mismatch & PSHAW Case Study (Requirement 3)', () => {
  it('Verifies dataset baseline: PSHAW is present in valid-guesses but absent from answers', () => {
    expect(ALL_VALID_GUESSES).toContain('PSHAW');
    expect(PRODUCTION_ANSWERS).not.toContain('PSHAW');
  });

  it('Evaluates three-observation history for PSHAW and verifies against synthetic answer set', () => {
    // Ground-truth target is PSHAW
    const target = 'PSHAW';

    // 3 distinct sequential guesses
    const guess1 = 'CRANE';
    const feedback1 = evaluateFeedbackRaw(guess1, target);
    // C:0, R:0, A:1 (pos 2 in CRANE, pos 3 in PSHAW), N:0, E:0
    expect(feedback1).toEqual([0, 0, 1, 0, 0]);

    const guess2 = 'PILOT';
    const feedback2 = evaluateFeedbackRaw(guess2, target);
    // P:2 (pos 0 matches in both), I:0, L:0, O:0, T:0
    expect(feedback2).toEqual([2, 0, 0, 0, 0]);

    const guess3 = 'SHADY';
    const feedback3 = evaluateFeedbackRaw(guess3, target);
    // S:1 (pos 0 in SHADY, pos 1 in PSHAW), H:1 (pos 1 in SHADY, pos 2 in PSHAW), A:1 (pos 2 in SHADY, pos 3 in PSHAW), D:0, Y:0
    expect(feedback3).toEqual([1, 1, 1, 0, 0]);

    const history: TurnRecord[] = [
      { guess: guess1, feedback: feedback1 },
      { guess: guess2, feedback: feedback2 },
      { guess: guess3, feedback: feedback3 },
    ];

    // 1. Synthetic answer list including PSHAW
    const syntheticAnswers = [...PRODUCTION_ANSWERS, 'PSHAW'];
    const syntheticResult = filterByHistory(syntheticAnswers, history);

    expect(syntheticResult.isContradiction).toBe(false);
    expect(syntheticResult.candidates).toContain('PSHAW');
    expect(syntheticResult.remainingCount).toBeGreaterThanOrEqual(1);

    // 2. Production answers list (which omits PSHAW)
    const productionResult = filterByHistory(PRODUCTION_ANSWERS, history);

    // 3. Diagnose contradiction
    const diagnosis = diagnoseContradiction(
      history,
      PRODUCTION_ANSWERS,
      ALL_VALID_GUESSES
    );

    // If production answers filtered to 0, it must be recognized as a vocabulary mismatch
    if (productionResult.remainingCount === 0) {
      expect(diagnosis.isContradiction).toBe(true);
      expect(diagnosis.isVocabularyMismatch).toBe(true);
      expect(diagnosis.sampleValidMatches).toContain('PSHAW');
      expect(diagnosis.explanation).toContain('configured answer list');
    }
  });

  it('Distinguishes an internal contradiction from a vocabulary mismatch', () => {
    // An internally impossible contradiction:
    // Guess 1: 'E' at index 4 is Grey (absent)
    // Guess 2: 'E' at index 4 is Green (correct position) -> impossible for ANY English word!
    const impossibleHistory: TurnRecord[] = [
      { guess: 'CRANE', feedback: [0, 0, 0, 0, 0] },
      { guess: 'SLATE', feedback: [0, 0, 0, 0, 2] },
    ];

    const diagnosis = diagnoseContradiction(
      impossibleHistory,
      PRODUCTION_ANSWERS,
      ALL_VALID_GUESSES
    );

    expect(diagnosis.isContradiction).toBe(true);
    expect(diagnosis.isVocabularyMismatch).toBe(false);
    expect(diagnosis.matchingValidGuessesCount).toBe(0);
    expect(diagnosis.earliestContradictionIndex).toBe(1);
    expect(diagnosis.explanation).toContain('internally contradictory');
  });
});
