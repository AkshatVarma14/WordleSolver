import {
  FeedbackPattern,
  InvalidWordError,
  TileFeedback,
  TileState,
} from './types';

const WORD_LENGTH = 5;
const VALID_WORD_REGEX = /^[A-Za-z]{5}$/;

/**
 * Checks whether an input value is a valid 5-letter alphabetical word.
 *
 * @param value The candidate value to test
 * @returns True if value is a 5-letter ASCII alphabetical string
 */
export function isValidWord(value: unknown): value is string {
  return typeof value === 'string' && VALID_WORD_REGEX.test(value);
}

/**
 * Validates and normalizes a word input to uppercase.
 * Throws InvalidWordError if the input does not conform to the 5-letter alphabetic contract.
 *
 * @param word The word string to validate
 * @param field The field identity ('guess' or 'answer') for error reporting
 * @returns Normalized uppercase 5-letter string
 * @throws {InvalidWordError} If input is not a 5-letter alphabetical string
 */
export function validateWord(word: unknown, field: 'guess' | 'answer'): string {
  if (typeof word !== 'string') {
    throw new InvalidWordError(
      field,
      word,
      `Expected a string, but received ${typeof word}.`
    );
  }

  if (word.length !== WORD_LENGTH) {
    throw new InvalidWordError(
      field,
      word,
      `Word length must be exactly ${WORD_LENGTH} letters, but received length ${word.length}.`
    );
  }

  if (!VALID_WORD_REGEX.test(word)) {
    throw new InvalidWordError(
      field,
      word,
      'Word must consist exclusively of ASCII letters (A-Z).'
    );
  }

  return word.toUpperCase();
}

/**
 * Evaluates the 5-tile Wordle feedback pattern of a guess against a target answer.
 *
 * Formal Wordle Semantics:
 * 1. Mark exact-position matches Green (2) and decrement available counts in the answer.
 * 2. Count the answer's remaining unmatched letters.
 * 3. Process unmatched guess letters from left to right, assigning Yellow (1)
 *    only when an unmatched copy of that letter is available in the answer.
 * 4. Mark all other positions Grey (0).
 *
 * Both guess and answer are validated and normalized to uppercase.
 *
 * @param guess The 5-letter guess word
 * @param answer The 5-letter target answer word
 * @returns A 5-tuple feedback pattern of TileFeedback (0 = Grey, 1 = Yellow, 2 = Green)
 * @throws {InvalidWordError} If either guess or answer is malformed
 */
export function evaluateFeedback(guess: string, answer: string): FeedbackPattern {
  const g = validateWord(guess, 'guess');
  const a = validateWord(answer, 'answer');

  return evaluateFeedbackRaw(g, a);
}

/**
 * Fast, unvalidated evaluation for high-throughput inner loops (simulations, entropy scoring).
 * Assumes both strings are pre-validated, uppercase 5-letter ASCII strings.
 *
 * @internal
 */
export function evaluateFeedbackRaw(guess: string, answer: string): FeedbackPattern {
  const pattern: [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback] = [
    TileState.GREY,
    TileState.GREY,
    TileState.GREY,
    TileState.GREY,
    TileState.GREY,
  ];

  // Frequency histogram of characters in the target answer
  const answerCounts: Record<string, number> = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    const char = answer[i]!;
    answerCounts[char] = (answerCounts[char] ?? 0) + 1;
  }

  // Pass 1: Prioritize exact positional matches (Green = 2)
  for (let i = 0; i < WORD_LENGTH; i++) {
    const gChar = guess[i]!;
    if (gChar === answer[i]!) {
      pattern[i] = TileState.GREEN;
      answerCounts[gChar] = answerCounts[gChar]! - 1;
    }
  }

  // Pass 2: Left-to-right allocation of remaining characters (Yellow = 1, Grey = 0)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (pattern[i] !== TileState.GREEN) {
      const gChar = guess[i]!;
      const available = answerCounts[gChar] ?? 0;
      if (available > 0) {
        pattern[i] = TileState.YELLOW;
        answerCounts[gChar] = available - 1;
      } else {
        pattern[i] = TileState.GREY;
      }
    }
  }

  return pattern;
}
