/**
 * @wordle-solver/solver - Missing-Answer Contribution Pipeline
 *
 * Provides a clean, isolated boundary for automatically detecting and queuing
 * newly discovered Wordle solution words absent from the curated answer dictionary.
 *
 * Invariants:
 * 1. Read-only to Solver: Never alters curated answers or active candidate pools.
 * 2. Absolute Fault Tolerance: Network or provider failures never throw or disrupt solving.
 * 3. Privacy Preserving: Collects zero personal data, IP addresses, or game histories.
 * 4. Idempotent: Deduplicates repeated submissions per normalized word locally and remotely.
 * 5. Quarantined: Targets only pending contribution storage; never publishes directly to trusted dictionaries.
 */

import { isValidWord } from './feedback';
import {
  TurnRecord,
  PendingContributionPayload,
  ContributionSubmitResult,
  ContributionQueueProvider,
} from './types';

/**
 * Normalizes a candidate word into standard 5-letter uppercase ASCII format.
 *
 * @param word Raw word string
 * @returns Trimmed uppercase string
 */
export function normalizeContributionWord(word: string): string {
  return typeof word === 'string' ? word.trim().toUpperCase() : '';
}

/**
 * Detects whether a submitted game history contains a confirmed winning turn
 * (a turn where the guess is a 5-letter word and all 5 tiles are confirmed Green / 2).
 *
 * Strict Invariants:
 * - Turns must be a non-empty array.
 * - Guess must be a valid 5-letter string.
 * - Feedback must be an array of length exactly 5 with every tile equal to 2.
 * - Empty feedback arrays or fewer than 5 tiles will NOT trigger a win.
 *
 * @param turns Readonly array of submitted turn records
 * @returns Winning guess word in uppercase, or null if game is not won
 */
export function detectWinningWord(turns: readonly TurnRecord[]): string | null {
  if (!Array.isArray(turns) || turns.length === 0) {
    return null;
  }

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (
      turn &&
      typeof turn.guess === 'string' &&
      turn.guess.trim().length === 5 &&
      Array.isArray(turn.feedback) &&
      turn.feedback.length === 5 &&
      turn.feedback.every((tile: unknown) => tile === 2)
    ) {
      return normalizeContributionWord(turn.guess);
    }
  }

  return null;
}

/**
 * Checks whether a candidate word constitutes a genuine answer vocabulary gap:
 * 1. Must be a well-formed 5-letter English word.
 * 2. Must exist in the allowable valid-guesses dictionary (case-insensitive check).
 * 3. Must be absent from the curated primary answer dictionary (case-insensitive check).
 *
 * @param word The winning candidate word
 * @param curatedAnswers The baseline 2,315-word curated answer list
 * @param validGuesses The comprehensive 12,972-word allowable guess list
 * @returns True if the word is absent from curated answers but present in valid guesses
 */
export function isMissingAnswer(
  word: string,
  curatedAnswers: readonly string[],
  validGuesses: readonly string[]
): boolean {
  const normalized = normalizeContributionWord(word);
  if (normalized.length !== 5 || !isValidWord(normalized)) {
    return false;
  }

  // Case-insensitive verification against allowable valid guesses
  const inValidGuesses =
    validGuesses.includes(normalized) || validGuesses.includes(normalized.toLowerCase());
  if (!inValidGuesses) {
    return false;
  }

  // Case-insensitive verification against curated primary answers
  const inCuratedAnswers =
    curatedAnswers.includes(normalized) || curatedAnswers.includes(normalized.toLowerCase());
  if (inCuratedAnswers) {
    return false;
  }

  return true;
}

/**
 * Interface for client-side contribution deduplication storage.
 */
export interface ContributionDeduplicationStore {
  has(word: string): boolean;
  add(word: string): void;
  clear?(): void;
}

/**
 * In-memory deduplication store for node environments, tests, or transient sessions.
 */
export class InMemoryDeduplicationStore implements ContributionDeduplicationStore {
  private readonly words: Set<string>;

  constructor(initialWords: Iterable<string> = []) {
    this.words = new Set(Array.from(initialWords).map(normalizeContributionWord));
  }

  public has(word: string): boolean {
    return this.words.has(normalizeContributionWord(word));
  }

  public add(word: string): void {
    const normalized = normalizeContributionWord(word);
    if (normalized.length > 0) {
      this.words.add(normalized);
    }
  }

  public clear(): void {
    this.words.clear();
  }
}

/**
 * Browser sessionStorage-backed deduplication store that persists across
 * page reloads and popup re-openings within the same browser session.
 * Falls back silently to an in-memory set when sessionStorage is unavailable.
 */
export class SessionStorageDeduplicationStore implements ContributionDeduplicationStore {
  private readonly key: string;
  private readonly fallback: InMemoryDeduplicationStore;

  constructor(key = 'wordle_solver_submitted_contributions') {
    this.key = key;
    this.fallback = new InMemoryDeduplicationStore();
  }

  public has(word: string): boolean {
    const normalized = normalizeContributionWord(word);
    if (this.fallback.has(normalized)) {
      return true;
    }

    if (typeof globalThis !== 'undefined' && 'sessionStorage' in globalThis) {
      try {
        const item = globalThis.sessionStorage.getItem(this.key);
        if (item) {
          const list = JSON.parse(item);
          if (Array.isArray(list) && list.includes(normalized)) {
            return true;
          }
        }
      } catch {
        // Storage access blocked or restricted
      }
    }

    return false;
  }

  public add(word: string): void {
    const normalized = normalizeContributionWord(word);
    if (normalized.length === 0) return;

    this.fallback.add(normalized);

    if (typeof globalThis !== 'undefined' && 'sessionStorage' in globalThis) {
      try {
        const item = globalThis.sessionStorage.getItem(this.key);
        const list: string[] = item ? JSON.parse(item) : [];
        if (Array.isArray(list) && !list.includes(normalized)) {
          list.push(normalized);
          globalThis.sessionStorage.setItem(this.key, JSON.stringify(list));
        }
      } catch {
        // Storage access blocked or restricted
      }
    }
  }

  public clear(): void {
    this.fallback.clear();

    if (typeof globalThis !== 'undefined' && 'sessionStorage' in globalThis) {
      try {
        globalThis.sessionStorage.removeItem(this.key);
      } catch {
        // Storage access blocked or restricted
      }
    }
  }
}

/**
 * Safe default provider when cloud contribution is unconfigured or disabled.
 * Never performs network requests; always returns a safe UNCONFIGURED status.
 */
export class UnconfiguredContributionProvider implements ContributionQueueProvider {
  public readonly name = 'UNCONFIGURED';
  public readonly isConfigured = false;

  public async submitPendingContribution(
    contribution: PendingContributionPayload
  ): Promise<ContributionSubmitResult> {
    return {
      success: false,
      word: contribution.word,
      status: 'UNCONFIGURED',
      message: 'No contribution queue provider is configured; submission safely bypassed.',
    };
  }
}

/**
 * In-memory provider for unit tests, offline simulations, and local verification.
 */
export class InMemoryContributionProvider implements ContributionQueueProvider {
  public readonly name = 'IN_MEMORY';
  public readonly isConfigured = true;

  public readonly contributions: PendingContributionPayload[] = [];
  public readonly submissionCountsByWord: Map<string, number> = new Map();
  public failureError: string | null = null;

  public simulateFailure(error: string | null): void {
    this.failureError = error;
  }

  public clear(): void {
    this.contributions.length = 0;
    this.submissionCountsByWord.clear();
    this.failureError = null;
  }

  public async submitPendingContribution(
    contribution: PendingContributionPayload
  ): Promise<ContributionSubmitResult> {
    if (this.failureError) {
      throw new Error(this.failureError);
    }

    const word = contribution.word;
    const currentCount = this.submissionCountsByWord.get(word) ?? 0;
    this.submissionCountsByWord.set(word, currentCount + 1);

    if (currentCount > 0) {
      return {
        success: true,
        word,
        status: 'ALREADY_SUBMITTED',
        message: `'${word}' is already registered in the pending contribution queue.`,
      };
    }

    this.contributions.push(contribution);
    return {
      success: true,
      word,
      status: 'SUBMITTED',
      message: `'${word}' successfully queued for administrator verification.`,
    };
  }
}

/**
 * Options for configuring the zero-dependency Firestore REST API provider.
 */
export interface FirestoreRestContributionOptions {
  readonly projectId: string;
  readonly apiKey?: string;
  readonly fetchFn?: typeof fetch;
  readonly collectionName?: string;
  /**
   * The Firestore REST HTTP method to use for create-only submissions:
   * - 'POST' (default): Uses canonical projects.databases.documents.createDocument with documentId={word}.
   * - 'PATCH': Uses projects.databases.documents.patch with currentDocument.exists=false.
   */
  readonly writeMethod?: 'POST' | 'PATCH';
}

/**
 * Zero-dependency Cloud Firestore REST API provider compatible with Firebase Spark plan.
 * Connects directly to Firestore v1 REST endpoints without requiring the heavy Firebase SDK.
 *
 * Security & Idempotency Design:
 * - Uses document ID = normalized word (`/pendingContributions/{WORD}`).
 * - Uses canonical `createDocument` (POST ?documentId={word}) or precondition `currentDocument.exists=false`.
 * - If a document already exists, Firestore returns HTTP 409 Conflict (ALREADY_EXISTS) or HTTP 412
 *   (FAILED_PRECONDITION), preventing any client from overwriting existing data, modifying
 *   timestamps, or forging report counts.
 * - Never performs an unconditional write or update retry upon conflict.
 */
export class FirestoreRestContributionProvider implements ContributionQueueProvider {
  public readonly name = 'FIRESTORE_REST';
  private readonly options: FirestoreRestContributionOptions;

  constructor(options: FirestoreRestContributionOptions) {
    this.options = options;
  }

  public get isConfigured(): boolean {
    return Boolean(this.options.projectId && this.options.projectId.trim().length > 0);
  }

  public async submitPendingContribution(
    contribution: PendingContributionPayload
  ): Promise<ContributionSubmitResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        word: contribution.word,
        status: 'UNCONFIGURED',
        message: 'Firebase project ID is not configured.',
      };
    }

    const { projectId, apiKey, fetchFn = globalThis.fetch, writeMethod = 'POST' } = this.options;
    const collection = this.options.collectionName ?? 'pendingContributions';

    let url: string;
    let method: 'POST' | 'PATCH';

    if (writeMethod === 'PATCH') {
      method = 'PATCH';
      const queryParams: string[] = ['currentDocument.exists=false'];
      if (apiKey) {
        queryParams.push(`key=${encodeURIComponent(apiKey)}`);
      }
      url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(
        contribution.word
      )}?${queryParams.join('&')}`;
    } else {
      // Default: projects.databases.documents.createDocument (POST)
      // Canonical Firestore create-only endpoint. Rejects existing documents with HTTP 409 (ALREADY_EXISTS).
      method = 'POST';
      const queryParams: string[] = [`documentId=${encodeURIComponent(contribution.word)}`];
      if (apiKey) {
        queryParams.push(`key=${encodeURIComponent(apiKey)}`);
      }
      url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/(default)/documents/${encodeURIComponent(collection)}?${queryParams.join('&')}`;
    }

    const body = {
      fields: {
        word: { stringValue: contribution.word },
        solveTurns: { integerValue: contribution.solveTurns.toString() },
        clientPlatform: { stringValue: contribution.clientPlatform },
        clientTimestamp: { stringValue: contribution.clientTimestamp },
        status: { stringValue: 'PENDING' },
      },
    };

    try {
      if (typeof fetchFn !== 'function') {
        throw new Error('fetch is not available in the current runtime environment.');
      }

      // Execute create-only request
      const response = await fetchFn(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      // HTTP 409 Conflict (ALREADY_EXISTS) or HTTP 412 Precondition Failed
      // indicates the document already exists in Firestore!
      if (response.status === 409 || response.status === 412) {
        return {
          success: true,
          word: contribution.word,
          status: 'ALREADY_SUBMITTED',
          message: `'${contribution.word}' has already been recorded in pending contributions by another user.`,
        };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          word: contribution.word,
          status: 'FAILED',
          message: `Firestore REST API responded with status ${response.status}.`,
          error: errorText.slice(0, 200),
        };
      }

      return {
        success: true,
        word: contribution.word,
        status: 'SUBMITTED',
        message: `'${contribution.word}' successfully recorded in Firestore pending contributions.`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        word: contribution.word,
        status: 'FAILED',
        message: 'Network or connectivity error while contacting Firestore.',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Service orchestrating missing-answer detection, validation, deduplication,
 * and dispatch to the configured contribution queue provider.
 */
export class MissingAnswerContributionService {
  private provider: ContributionQueueProvider;
  private readonly store: ContributionDeduplicationStore;

  constructor(
    provider: ContributionQueueProvider = new UnconfiguredContributionProvider(),
    store: ContributionDeduplicationStore = new SessionStorageDeduplicationStore()
  ) {
    this.provider = provider;
    this.store = store;
  }

  public getProvider(): ContributionQueueProvider {
    return this.provider;
  }

  public setProvider(provider: ContributionQueueProvider): void {
    this.provider = provider;
  }

  public getStore(): ContributionDeduplicationStore {
    return this.store;
  }

  public hasSubmitted(word: string): boolean {
    return this.store.has(normalizeContributionWord(word));
  }

  public resetSession(): void {
    if (this.store.clear) {
      this.store.clear();
    }
  }

  /**
   * Evaluates a game history upon turn completion.
   * If a win state is detected with a word missing from the curated answer dictionary,
   * automatically dispatches a pending contribution to the configured queue provider.
   *
   * @param turns Submitted turn records
   * @param curatedAnswers Baseline 2,315-word answer dictionary
   * @param validGuesses Comprehensive 12,972-word allowable guess dictionary
   * @param clientPlatform Client platform ('web' or 'extension')
   * @returns ContributionSubmitResult, or null if the puzzle is not in a winning state
   */
  public async evaluateAndSubmit(
    turns: readonly TurnRecord[],
    curatedAnswers: readonly string[],
    validGuesses: readonly string[],
    clientPlatform: 'web' | 'extension'
  ): Promise<ContributionSubmitResult | null> {
    // 1. Detect winning word from submitted feedback
    const winningWord = detectWinningWord(turns);
    if (!winningWord) {
      return null;
    }

    // 2. Normalize and check basic syntax
    const normalized = normalizeContributionWord(winningWord);
    if (normalized.length !== 5 || !isValidWord(normalized)) {
      return {
        success: false,
        word: normalized,
        status: 'INVALID_WORD',
        message: 'Winning word is malformed or violates 5-letter alphabetic rules.',
      };
    }

    // 3. Must be a recognized valid Wordle guess
    const inValidGuesses =
      validGuesses.includes(normalized) || validGuesses.includes(normalized.toLowerCase());
    if (!inValidGuesses) {
      return {
        success: false,
        word: normalized,
        status: 'INVALID_WORD',
        message: `'${normalized}' is not in the recognized valid-guesses dictionary.`,
      };
    }

    // 4. If already present in curated answers, no contribution is required
    const inCuratedAnswers =
      curatedAnswers.includes(normalized) || curatedAnswers.includes(normalized.toLowerCase());
    if (inCuratedAnswers) {
      return {
        success: false,
        word: normalized,
        status: 'ALREADY_KNOWN',
        message: `'${normalized}' already exists in the curated answer dictionary.`,
      };
    }

    // 5. Deduplicate within client session store
    if (this.store.has(normalized)) {
      return {
        success: true,
        word: normalized,
        status: 'ALREADY_SUBMITTED',
        message: `'${normalized}' has already been submitted in this session.`,
      };
    }

    // 6. Record in local session cache immediately to prevent concurrent duplicate submissions
    this.store.add(normalized);

    // 7. Calculate the turn count on which the win occurred (1-6)
    const winIndex = turns.findIndex(
      (t) =>
        t &&
        typeof t.guess === 'string' &&
        t.guess.trim().length === 5 &&
        Array.isArray(t.feedback) &&
        t.feedback.length === 5 &&
        t.feedback.every((tile: unknown) => tile === 2)
    );
    const solveTurns = winIndex >= 0 ? winIndex + 1 : turns.length;

    const payload: PendingContributionPayload = {
      word: normalized,
      solveTurns: Math.max(1, Math.min(6, solveTurns)),
      clientPlatform,
      clientTimestamp: new Date().toISOString(),
    };

    // 8. Safely dispatch to provider
    try {
      return await this.provider.submitPendingContribution(payload);
    } catch (err: unknown) {
      return {
        success: false,
        word: normalized,
        status: 'FAILED',
        message: 'Failed to submit pending contribution due to an unexpected provider error.',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
