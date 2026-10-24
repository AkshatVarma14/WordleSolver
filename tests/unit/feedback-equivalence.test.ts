import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateFeedbackRaw,
  evaluateFeedbackCode,
  patternToCode,
  codeToPattern,
  FeedbackPattern,
} from '@wordle-solver/solver';

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

describe('Feedback Equivalence and Correctness Verification (Stage 8D)', () => {
  describe('1. Canonical Wordle Edge Cases & Repeated Letters', () => {
    const edgeCases: Array<{
      guess: string;
      answer: string;
      expected: FeedbackPattern;
    }> = [
      // TC-FB-01: Exact match
      { guess: 'CRANE', answer: 'CRANE', expected: [2, 2, 2, 2, 2] },
      // TC-FB-02: Completely disjoint
      { guess: 'PLUMB', answer: 'FIGHT', expected: [0, 0, 0, 0, 0] },
      // TC-FB-03: Mixed positions
      { guess: 'ROBOT', answer: 'TORCH', expected: [1, 2, 0, 0, 1] },
      // TC-FB-04: Repeated letter in guess with green resolution
      { guess: 'SPEED', answer: 'ELAND', expected: [0, 0, 1, 0, 2] },
      { guess: 'SPEED', answer: 'ABIDE', expected: [0, 0, 1, 0, 1] },
      { guess: 'SPEED', answer: 'ROBED', expected: [0, 0, 0, 2, 2] },
      // TC-FB-05: Duplicate letter allocation in guess
      { guess: 'ERASE', answer: 'PLEAT', expected: [1, 0, 1, 0, 0] },
      { guess: 'ERASE', answer: 'STEAL', expected: [1, 0, 1, 1, 0] },
      // TC-FB-06: Triple letter in guess vs single in answer
      { guess: 'GEESE', answer: 'CRANE', expected: [0, 0, 0, 0, 2] },
      // TC-FB-07: Duplicate letters in both guess and answer
      { guess: 'ALLOY', answer: 'LLAMA', expected: [1, 2, 1, 0, 0] },
    ];

    it.each(edgeCases)(
      'Accurately evaluates $guess against $answer matching expected pattern',
      ({ guess, answer, expected }) => {
        const rawPattern = evaluateFeedbackRaw(guess, answer);
        const code = evaluateFeedbackCode(guess, answer);
        const decodedFromCode = codeToPattern(code);

        expect(rawPattern).toEqual(expected);
        expect(decodedFromCode).toEqual(expected);
        expect(code).toBe(patternToCode(expected));
      }
    );
  });

  describe('2. Exhaustive Equivalence Across Dictionary Sample (10,000 Pairs)', () => {
    it('Guarantees evaluateFeedbackCode and evaluateFeedbackRaw produce identical pattern codes', () => {
      // Test 10,000 representative guess-answer pairs
      const sampleSize = 10000;
      let identicalCount = 0;

      for (let i = 0; i < sampleSize; i++) {
        const guess = GUESSES[i % GUESSES.length]!;
        const answer = ANSWERS[(i * 7) % ANSWERS.length]!;

        const raw = evaluateFeedbackRaw(guess, answer);
        const code = evaluateFeedbackCode(guess, answer);
        const expectedCode = patternToCode(raw);

        if (code === expectedCode) {
          identicalCount++;
        }
      }

      expect(identicalCount).toBe(sampleSize);
    });
  });

  describe('3. Empirical Performance Measurement (Warm-Up & Repeated Runs)', () => {
    beforeAll(() => {
      // Warm up JIT compiler
      for (let i = 0; i < 1000; i++) {
        evaluateFeedbackCode('CRANE', 'SLATE');
        evaluateFeedbackRaw('CRANE', 'SLATE');
      }
    });

    it('Measures high-throughput execution speed of zero-allocation evaluateFeedbackCode', () => {
      const iterations = 50000;

      // Measure evaluateFeedbackCode
      const tCode0 = performance.now();
      let codeSum = 0;
      for (let i = 0; i < iterations; i++) {
        const guess = GUESSES[i % 500]!;
        const answer = ANSWERS[i % 100]!;
        codeSum += evaluateFeedbackCode(guess, answer);
      }
      const codeDurationMs = performance.now() - tCode0;

      // Measure evaluateFeedbackRaw
      const tRaw0 = performance.now();
      let rawSum = 0;
      for (let i = 0; i < iterations; i++) {
        const guess = GUESSES[i % 500]!;
        const answer = ANSWERS[i % 100]!;
        const pattern = evaluateFeedbackRaw(guess, answer);
        rawSum += patternToCode(pattern);
      }
      const rawDurationMs = performance.now() - tRaw0;

      expect(codeSum).toBe(rawSum);
      expect(codeDurationMs).toBeLessThan(500);

      console.log(`[Benchmark 50,000 iterations] evaluateFeedbackCode: ${codeDurationMs.toFixed(2)}ms vs evaluateFeedbackRaw + patternToCode: ${rawDurationMs.toFixed(2)}ms (Speedup: ${(rawDurationMs / codeDurationMs).toFixed(2)}x)`);
    });
  });
});
