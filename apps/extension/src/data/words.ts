import answersRaw from '../../../../data/answers.txt?raw';
import validGuessesRaw from '../../../../data/valid-guesses.txt?raw';

/**
 * Parsed, immutable array of initial Wordle answer words (2,315 words).
 */
export const INITIAL_ANSWERS: readonly string[] = Object.freeze(
  answersRaw
    .trim()
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean)
);

/**
 * Parsed, immutable array of all legal Wordle guess words (12,953 words).
 */
export const ALL_VALID_GUESSES: readonly string[] = Object.freeze(
  validGuessesRaw
    .trim()
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean)
);
