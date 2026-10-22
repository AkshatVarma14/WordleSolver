import { describe, it, expect } from 'vitest';
import {
  evaluateGuess,
  compareEvaluations,
  getFastRecommendation,
  filterCandidates,
  patternToCode,
  codeToPattern,
  GuessEvaluation,
} from '@wordle-solver/solver';

describe('Fast Strategy & Information Theory (entropy.ts)', () => {
  describe('Pattern Code Round-Trip Encoding', () => {
    it('Encodes and decodes all 243 ternary patterns losslessly', () => {
      for (let code = 0; code < 243; code++) {
        const pattern = codeToPattern(code);
        const encoded = patternToCode(pattern);
        expect(encoded).toBe(code);
      }
    });

    it('Correctly maps boundary patterns [0,0,0,0,0] and [2,2,2,2,2]', () => {
      expect(patternToCode([0, 0, 0, 0, 0])).toBe(0);
      expect(patternToCode([2, 2, 2, 2, 2])).toBe(242);
      expect(codeToPattern(0)).toEqual([0, 0, 0, 0, 0]);
      expect(codeToPattern(242)).toEqual([2, 2, 2, 2, 2]);
    });
  });

  describe('Synthetic Small-Dictionary Ground Truth', () => {
    // 3-word candidate universe: ABACK, ABASE, ABATE
    const candidates = ['ABACK', 'ABASE', 'ABATE'];

    it('Hand-calculated metrics for candidate guess ABACK', () => {
      // Partitions against ABACK:
      // ABACK -> [2, 2, 2, 2, 2] (size 1)
      // ABASE -> [2, 2, 2, 0, 0] (size 1)
      // ABATE -> [2, 2, 2, 0, 0] (size 1, same pattern as ABASE!)
      // Result: 2 partitions: { pattern_green: 1, pattern_partial: 2 }
      // H(ABACK) = - (1/3 * log2(1/3) + 2/3 * log2(2/3)) ~= 0.91829583 bits
      // E[|C'|] = 1/3 * (1^2 + 2^2) = 5/3 ~= 1.6666667
      const evaluation = evaluateGuess('ABACK', candidates);

      expect(evaluation.guess).toBe('ABACK');
      expect(evaluation.isCandidate).toBe(true);
      expect(evaluation.distinctPatternsCount).toBe(2);
      expect(evaluation.worstCasePartitionSize).toBe(2);
      expect(evaluation.entropyBits).toBeCloseTo(0.91829583, 5);
      expect(evaluation.expectedRemaining).toBeCloseTo(5 / 3, 5);
      expect(evaluation.immediateWinProbability).toBeCloseTo(1 / 3, 5);
    });

    it('Hand-calculated metrics for exploratory probe CASTE (non-candidate)', () => {
      // Partitions against CASTE:
      // ABACK -> [1, 1, 0, 0, 0] (size 1)
      // ABASE -> [0, 1, 1, 0, 2] (size 1)
      // ABATE -> [0, 1, 0, 2, 2] (size 1)
      // All 3 candidates produce distinct feedback patterns!
      // H(CASTE) = - 3 * (1/3 * log2(1/3)) = log2(3) ~= 1.5849625 bits
      // E[|C'|] = 1/3 * (1^2 + 1^2 + 1^2) = 1.0
      const evaluation = evaluateGuess('CASTE', candidates);

      expect(evaluation.guess).toBe('CASTE');
      expect(evaluation.isCandidate).toBe(false);
      expect(evaluation.distinctPatternsCount).toBe(3);
      expect(evaluation.worstCasePartitionSize).toBe(1);
      expect(evaluation.entropyBits).toBeCloseTo(Math.log2(3), 5);
      expect(evaluation.expectedRemaining).toBeCloseTo(1.0, 5);
      expect(evaluation.immediateWinProbability).toBe(0);
    });

    it('Demonstrates probing power: CASTE yields higher entropy and lower expected remaining than candidate ABACK', () => {
      const evalCandidate = evaluateGuess('ABACK', candidates);
      const evalProbe = evaluateGuess('CASTE', candidates);

      // Probe achieves higher information gain and smaller expected candidate pool
      expect(evalProbe.entropyBits).toBeGreaterThan(evalCandidate.entropyBits);
      expect(evalProbe.expectedRemaining).toBeLessThan(evalCandidate.expectedRemaining);
    });
  });

  describe('Deterministic Tie-Breaking & Comparison Policy', () => {
    it('1. Primary: Ranks higher entropy first', () => {
      const a: GuessEvaluation = {
        guess: 'WORDA',
        isCandidate: false,
        entropyBits: 4.5,
        expectedRemaining: 10,
        worstCasePartitionSize: 20,
        distinctPatternsCount: 15,
        immediateWinProbability: 0,
      };
      const b: GuessEvaluation = {
        guess: 'WORDB',
        isCandidate: true,
        entropyBits: 4.0,
        expectedRemaining: 8,
        worstCasePartitionSize: 18,
        distinctPatternsCount: 12,
        immediateWinProbability: 0.1,
      };

      expect(compareEvaluations(a, b)).toBeLessThan(0); // a ranked above b
      expect(compareEvaluations(b, a)).toBeGreaterThan(0);
    });

    it('2. Secondary: Prefers candidate in C when entropy is tied within epsilon', () => {
      const candidateEval: GuessEvaluation = {
        guess: 'CANDI',
        isCandidate: true,
        entropyBits: 3.5000001,
        expectedRemaining: 12,
        worstCasePartitionSize: 25,
        distinctPatternsCount: 10,
        immediateWinProbability: 0.05,
      };
      const probeEval: GuessEvaluation = {
        guess: 'PROBE',
        isCandidate: false,
        entropyBits: 3.5000002, // within 1e-6 epsilon
        expectedRemaining: 12,
        worstCasePartitionSize: 25,
        distinctPatternsCount: 10,
        immediateWinProbability: 0,
      };

      // Candidate must be preferred over probe due to non-zero win probability
      expect(compareEvaluations(candidateEval, probeEval)).toBeLessThan(0);
    });

    it('3. Tertiary: Prefers lower expected remaining when entropy and candidate status tie', () => {
      const a: GuessEvaluation = {
        guess: 'WORD1',
        isCandidate: true,
        entropyBits: 3.5,
        expectedRemaining: 10.0,
        worstCasePartitionSize: 20,
        distinctPatternsCount: 10,
        immediateWinProbability: 0.05,
      };
      const b: GuessEvaluation = {
        guess: 'WORD2',
        isCandidate: true,
        entropyBits: 3.5,
        expectedRemaining: 11.5,
        worstCasePartitionSize: 20,
        distinctPatternsCount: 10,
        immediateWinProbability: 0.05,
      };

      expect(compareEvaluations(a, b)).toBeLessThan(0); // a has lower expected remaining
    });

    it('4. Quaternary: Alphabetical tie-breaking for identical scores', () => {
      const a: GuessEvaluation = {
        guess: 'ALPHA',
        isCandidate: true,
        entropyBits: 3.5,
        expectedRemaining: 10.0,
        worstCasePartitionSize: 20,
        distinctPatternsCount: 10,
        immediateWinProbability: 0.05,
      };
      const b: GuessEvaluation = {
        guess: 'BRAVO',
        isCandidate: true,
        entropyBits: 3.5,
        expectedRemaining: 10.0,
        worstCasePartitionSize: 20,
        distinctPatternsCount: 10,
        immediateWinProbability: 0.05,
      };

      expect(compareEvaluations(a, b)).toBeLessThan(0); // ALPHA precedes BRAVO
    });
  });

  describe('Recommendation Generation (getFastRecommendation)', () => {
    it('Handles empty candidate set (contradiction) gracefully', () => {
      const rec = getFastRecommendation([]);
      expect(rec.isContradiction).toBe(true);
      expect(rec.recommendedGuess).toBeNull();
      expect(rec.candidatesCount).toBe(0);
      expect(rec.warning).toContain('Contradiction');
    });

    it('Handles single remaining candidate with 100% win certainty', () => {
      const rec = getFastRecommendation(['CRANE']);
      expect(rec.isContradiction).toBe(false);
      expect(rec.recommendedGuess).toBe('CRANE');
      expect(rec.candidatesCount).toBe(1);
      expect(rec.evaluation?.immediateWinProbability).toBe(1.0);
      expect(rec.explanation).toContain('100% certainty');
    });

    it('Ranks candidate ABASE over probe CASTE when both achieve identical maximum entropy (candidate preference)', () => {
      const candidates = ['ABACK', 'ABASE', 'ABATE'];
      const allowedGuesses = ['ABACK', 'ABASE', 'ABATE', 'CASTE'];

      // Both ABASE and CASTE achieve maximum entropy log2(3) ~= 1.585 bits
      // ABASE is in C (P(win) = 1/3) whereas CASTE is outside C (P(win) = 0)
      // Therefore, candidate preference tie-breaking ranks ABASE #1!
      const rec = getFastRecommendation(candidates, allowedGuesses, 3);
      expect(rec.recommendedGuess).toBe('ABASE');
      expect(rec.topRanked.length).toBe(3);
      expect(rec.topRanked[0]?.guess).toBe('ABASE');
      expect(rec.explanation).toContain("Recommended 'ABASE'");
      expect(rec.explanation).toContain('Candidate answer');
    });

    it('Ranks exploratory probe FORMS over all candidates when candidates are caught in a single-letter trap (_OUND family)', () => {
      const candidates = ['BOUND', 'FOUND', 'HOUND', 'MOUND', 'ROUND', 'SOUND', 'WOUND'];
      const allowedGuesses = [...candidates, 'FORMS'];

      // In the _OUND trap, guessing inside C yields only ~0.59 bits of entropy
      // Guessing FORMS outside C tests F, R, M, S simultaneously and yields ~2.13 bits
      const rec = getFastRecommendation(candidates, allowedGuesses, 5);
      expect(rec.recommendedGuess).toBe('FORMS');
      expect(rec.topRanked[0]?.guess).toBe('FORMS');
      expect(rec.topRanked[0]?.isCandidate).toBe(false);
      expect(rec.explanation).toContain("Recommended 'FORMS'");
      expect(rec.explanation).toContain('Exploratory probe outside candidate pool');
    });

    it('Produces deterministic results on repeated evaluations with identical inputs', () => {
      const candidates = ['CRANE', 'SLATE', 'TRACE', 'BRAKE', 'ROBOT', 'PLUMB'];
      const allowed = ['CRANE', 'SOARE', 'ROBOT'];

      const run1 = getFastRecommendation(candidates, allowed, 3);
      const run2 = getFastRecommendation(candidates, allowed, 3);

      expect(run1.recommendedGuess).toBe(run2.recommendedGuess);
      expect(run1.candidatesCount).toBe(run2.candidatesCount);
      expect(run1.explanation).toBe(run2.explanation);
      expect(run1.topRanked.map((r) => r.guess)).toEqual(
        run2.topRanked.map((r) => r.guess)
      );
    });

    it('Integrates filtering and recommendation across a simulated turn', () => {
      const initialCandidates = [
        'CRANE',
        'BRAKE',
        'FRAME',
        'GRAVE',
        'ROBOT',
        'SLATE',
        'PLUMB',
      ];
      // Suppose target is 'BRAKE' and user played 'CRANE'
      // Feedback for BRAKE against CRANE:
      // C:0 (no C in BRAKE), R:2, A:2, N:0 (no N in BRAKE), E:2
      // Result: [0, 2, 2, 0, 2] -> keeps BRAKE, FRAME, GRAVE
      const recBefore = getFastRecommendation(initialCandidates, initialCandidates, 3);
      expect(recBefore.candidatesCount).toBe(7);
      expect(recBefore.recommendedGuess).toBeTruthy();

      // Filter step
      const surviving = filterCandidates(initialCandidates, 'CRANE', [0, 2, 2, 0, 2]);
      expect(surviving).toEqual(['BRAKE', 'FRAME', 'GRAVE']);

      // Recommend step
      const recAfter = getFastRecommendation(surviving, surviving, 3);
      expect(recAfter.candidatesCount).toBe(3);
      expect(recAfter.topRanked.length).toBe(3);
      expect(recAfter.recommendedGuess).toBeTruthy();
    });
  });
});
