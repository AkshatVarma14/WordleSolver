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
 * Evaluates feedback directly into a ternary integer code in [0, 242].
 * Code formula: p0 + 3*p1 + 9*p2 + 27*p3 + 81*p4
 * Zero heap allocations for ultra-fast inner loops.
 *
 * @internal
 */
export function evaluateFeedbackCode(guess: string, answer: string): number {
  let a0 = answer.charCodeAt(0), a1 = answer.charCodeAt(1), a2 = answer.charCodeAt(2), a3 = answer.charCodeAt(3), a4 = answer.charCodeAt(4);
  const g0 = guess.charCodeAt(0), g1 = guess.charCodeAt(1), g2 = guess.charCodeAt(2), g3 = guess.charCodeAt(3), g4 = guess.charCodeAt(4);
  let p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0;

  // Pass 1: exact matches
  if (g0 === a0) { p0 = 2; a0 = 0; }
  if (g1 === a1) { p1 = 2; a1 = 0; }
  if (g2 === a2) { p2 = 2; a2 = 0; }
  if (g3 === a3) { p3 = 2; a3 = 0; }
  if (g4 === a4) { p4 = 2; a4 = 0; }

  // Pass 2: left-to-right yellow matches
  if (p0 === 0) {
    if (g0 === a0) { p0 = 1; a0 = 0; }
    else if (g0 === a1) { p0 = 1; a1 = 0; }
    else if (g0 === a2) { p0 = 1; a2 = 0; }
    else if (g0 === a3) { p0 = 1; a3 = 0; }
    else if (g0 === a4) { p0 = 1; a4 = 0; }
  }
  if (p1 === 0) {
    if (g1 === a0) { p1 = 1; a0 = 0; }
    else if (g1 === a1) { p1 = 1; a1 = 0; }
    else if (g1 === a2) { p1 = 1; a2 = 0; }
    else if (g1 === a3) { p1 = 1; a3 = 0; }
    else if (g1 === a4) { p1 = 1; a4 = 0; }
  }
  if (p2 === 0) {
    if (g2 === a0) { p2 = 1; a0 = 0; }
    else if (g2 === a1) { p2 = 1; a1 = 0; }
    else if (g2 === a2) { p2 = 1; a2 = 0; }
    else if (g2 === a3) { p2 = 1; a3 = 0; }
    else if (g2 === a4) { p2 = 1; a4 = 0; }
  }
  if (p3 === 0) {
    if (g3 === a0) { p3 = 1; a0 = 0; }
    else if (g3 === a1) { p3 = 1; a1 = 0; }
    else if (g3 === a2) { p3 = 1; a2 = 0; }
    else if (g3 === a3) { p3 = 1; a3 = 0; }
    else if (g3 === a4) { p3 = 1; a4 = 0; }
  }
  if (p4 === 0) {
    if (g4 === a0) { p4 = 1; a0 = 0; }
    else if (g4 === a1) { p4 = 1; a1 = 0; }
    else if (g4 === a2) { p4 = 1; a2 = 0; }
    else if (g4 === a3) { p4 = 1; a3 = 0; }
    else if (g4 === a4) { p4 = 1; a4 = 0; }
  }

  return p0 + p1 * 3 + p2 * 9 + p3 * 27 + p4 * 81;
}

/**
 * Fast, unvalidated evaluation for high-throughput inner loops (simulations, entropy scoring).
 * Assumes both strings are pre-validated, uppercase 5-letter ASCII strings.
 *
 * @internal
 */
export function evaluateFeedbackRaw(guess: string, answer: string): FeedbackPattern {
  let a0 = answer.charCodeAt(0), a1 = answer.charCodeAt(1), a2 = answer.charCodeAt(2), a3 = answer.charCodeAt(3), a4 = answer.charCodeAt(4);
  const g0 = guess.charCodeAt(0), g1 = guess.charCodeAt(1), g2 = guess.charCodeAt(2), g3 = guess.charCodeAt(3), g4 = guess.charCodeAt(4);
  let p0: TileFeedback = TileState.GREY;
  let p1: TileFeedback = TileState.GREY;
  let p2: TileFeedback = TileState.GREY;
  let p3: TileFeedback = TileState.GREY;
  let p4: TileFeedback = TileState.GREY;

  // Pass 1: exact matches
  if (g0 === a0) { p0 = TileState.GREEN; a0 = 0; }
  if (g1 === a1) { p1 = TileState.GREEN; a1 = 0; }
  if (g2 === a2) { p2 = TileState.GREEN; a2 = 0; }
  if (g3 === a3) { p3 = TileState.GREEN; a3 = 0; }
  if (g4 === a4) { p4 = TileState.GREEN; a4 = 0; }

  // Pass 2: left-to-right yellow matches
  if (p0 === TileState.GREY) {
    if (g0 === a0) { p0 = TileState.YELLOW; a0 = 0; }
    else if (g0 === a1) { p0 = TileState.YELLOW; a1 = 0; }
    else if (g0 === a2) { p0 = TileState.YELLOW; a2 = 0; }
    else if (g0 === a3) { p0 = TileState.YELLOW; a3 = 0; }
    else if (g0 === a4) { p0 = TileState.YELLOW; a4 = 0; }
  }
  if (p1 === TileState.GREY) {
    if (g1 === a0) { p1 = TileState.YELLOW; a0 = 0; }
    else if (g1 === a1) { p1 = TileState.YELLOW; a1 = 0; }
    else if (g1 === a2) { p1 = TileState.YELLOW; a2 = 0; }
    else if (g1 === a3) { p1 = TileState.YELLOW; a3 = 0; }
    else if (g1 === a4) { p1 = TileState.YELLOW; a4 = 0; }
  }
  if (p2 === TileState.GREY) {
    if (g2 === a0) { p2 = TileState.YELLOW; a0 = 0; }
    else if (g2 === a1) { p2 = TileState.YELLOW; a1 = 0; }
    else if (g2 === a2) { p2 = TileState.YELLOW; a2 = 0; }
    else if (g2 === a3) { p2 = TileState.YELLOW; a3 = 0; }
    else if (g2 === a4) { p2 = TileState.YELLOW; a4 = 0; }
  }
  if (p3 === TileState.GREY) {
    if (g3 === a0) { p3 = TileState.YELLOW; a0 = 0; }
    else if (g3 === a1) { p3 = TileState.YELLOW; a1 = 0; }
    else if (g3 === a2) { p3 = TileState.YELLOW; a2 = 0; }
    else if (g3 === a3) { p3 = TileState.YELLOW; a3 = 0; }
    else if (g3 === a4) { p3 = TileState.YELLOW; a4 = 0; }
  }
  if (p4 === TileState.GREY) {
    if (g4 === a0) { p4 = TileState.YELLOW; a0 = 0; }
    else if (g4 === a1) { p4 = TileState.YELLOW; a1 = 0; }
    else if (g4 === a2) { p4 = TileState.YELLOW; a2 = 0; }
    else if (g4 === a3) { p4 = TileState.YELLOW; a3 = 0; }
    else if (g4 === a4) { p4 = TileState.YELLOW; a4 = 0; }
  }

  return [p0, p1, p2, p3, p4];
}
