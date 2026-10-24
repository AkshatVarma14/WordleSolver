import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  TurnRecord,
  detectWinningWord,
  normalizeContributionWord,
  isMissingAnswer,
  UnconfiguredContributionProvider,
  InMemoryContributionProvider,
  FirestoreRestContributionProvider,
  MissingAnswerContributionService,
  SessionStorageDeduplicationStore,
  InMemoryDeduplicationStore,
  filterByHistory,
  getUnifiedRecommendation,
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

describe('Stage 9B — Automatic Missing-Answer Contribution Pipeline Audit', () => {
  let memoryProvider: InMemoryContributionProvider;
  let service: MissingAnswerContributionService;

  beforeEach(() => {
    memoryProvider = new InMemoryContributionProvider();
    service = new MissingAnswerContributionService(
      memoryProvider,
      new InMemoryDeduplicationStore()
    );
  });

  describe('1. Win State Detection Edge Cases & Robustness', () => {
    it('Detects winning turn with all 5 Green tiles [2, 2, 2, 2, 2]', () => {
      const turns: TurnRecord[] = [
        { guess: 'SALET', feedback: [0, 0, 2, 2, 0] },
        { guess: 'BOLED', feedback: [0, 2, 2, 2, 0] },
        { guess: 'HOLEY', feedback: [2, 2, 2, 2, 2] },
      ];

      const winner = detectWinningWord(turns);
      expect(winner).toBe('HOLEY');
    });

    it('Rejects malformed empty feedback array [] without falsely claiming a win', () => {
      // In JS, [].every(...) is vacuously true. detectWinningWord must strictly verify length === 5.
      const malformedTurns = [
        { guess: 'HOLEY', feedback: [] as unknown as [0, 0, 0, 0, 0] },
      ];

      expect(detectWinningWord(malformedTurns)).toBeNull();
    });

    it('Rejects 4-tile feedback [2, 2, 2, 2] without falsely claiming a win', () => {
      const shortFeedbackTurns = [
        { guess: 'HOLEY', feedback: [2, 2, 2, 2] as unknown as [0, 0, 0, 0, 0] },
      ];

      expect(detectWinningWord(shortFeedbackTurns)).toBeNull();
    });

    it('Rejects 4 greens and 1 yellow [2, 2, 2, 2, 1]', () => {
      const almostWinTurns: TurnRecord[] = [
        { guess: 'HOLEY', feedback: [2, 2, 2, 2, 1] },
      ];

      expect(detectWinningWord(almostWinTurns)).toBeNull();
    });

    it('Returns null when no turn has all 5 Green tiles (in-progress game)', () => {
      const inProgressTurns: TurnRecord[] = [
        { guess: 'SALET', feedback: [0, 1, 0, 0, 1] },
        { guess: 'TRAIN', feedback: [2, 0, 1, 0, 0] },
      ];

      expect(detectWinningWord(inProgressTurns)).toBeNull();
    });

    it('Returns null when game is lost after 6 non-winning turns', () => {
      const lostTurns: TurnRecord[] = Array.from({ length: 6 }, () => ({
        guess: 'SALET',
        feedback: [0, 1, 0, 0, 1],
      }));

      expect(detectWinningWord(lostTurns)).toBeNull();
    });

    it('Rejects turns with non-string or malformed guess words', () => {
      const invalidGuessTurns = [
        { guess: 12345 as unknown as string, feedback: [2, 2, 2, 2, 2] as const },
        { guess: 'SHORT', feedback: [2, 2, 2, 2, 2] as const },
      ];
      // SHORT is 5 letters so it wins
      expect(detectWinningWord(invalidGuessTurns)).toBe('SHORT');

      const nonStringTurns = [
        { guess: '' as string, feedback: [2, 2, 2, 2, 2] as const },
      ];
      expect(detectWinningWord(nonStringTurns)).toBeNull();
    });

    it('Picks the first winning turn if multiple winning turns exist in history', () => {
      const multipleWins: TurnRecord[] = [
        { guess: 'TRILL', feedback: [2, 2, 2, 2, 2] },
        { guess: 'HOLEY', feedback: [2, 2, 2, 2, 2] },
      ];

      expect(detectWinningWord(multipleWins)).toBe('TRILL');
    });

    it('Normalizes lowercase and padded inputs to uppercase ASCII', () => {
      expect(normalizeContributionWord('  holey  ')).toBe('HOLEY');
      expect(normalizeContributionWord('trill\n')).toBe('TRILL');
      expect(normalizeContributionWord(null as unknown as string)).toBe('');
    });
  });

  describe('2. Missing-Answer Vocabulary Gap Checking', () => {
    it('Identifies HOLEY and TRILL as missing answers (in valid-guesses, absent from answers)', () => {
      expect(isMissingAnswer('HOLEY', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(true);
      expect(isMissingAnswer('TRILL', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(true);
      // Case-insensitivity check
      expect(isMissingAnswer('holey', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(true);
    });

    it('Identifies CRANE and LIGHT as existing answers (not missing)', () => {
      expect(isMissingAnswer('CRANE', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(false);
      expect(isMissingAnswer('LIGHT', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(false);
      expect(isMissingAnswer('crane', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(false);
    });

    it('Rejects words not present in the allowable valid-guesses list', () => {
      expect(isMissingAnswer('XYZ99', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(false);
      expect(isMissingAnswer('ABCDE', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(false);
      expect(isMissingAnswer('12345', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(false);
    });
  });

  describe('3. Automated Contribution Submission Lifecycle', () => {
    it('Submits pending contribution when puzzle is won with missing answer (HOLEY)', async () => {
      const winningTurns: TurnRecord[] = [
        { guess: 'SALET', feedback: [0, 0, 2, 2, 0] },
        { guess: 'BOLED', feedback: [0, 2, 2, 2, 0] },
        { guess: 'GOLEM', feedback: [0, 2, 2, 2, 0] },
        { guess: 'HOLEY', feedback: [2, 2, 2, 2, 2] },
      ];

      const result = await service.evaluateAndSubmit(
        winningTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'web'
      );

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.status).toBe('SUBMITTED');
      expect(result?.word).toBe('HOLEY');

      // Verify payload received by provider
      expect(memoryProvider.contributions).toHaveLength(1);
      const item = memoryProvider.contributions[0]!;
      expect(item.word).toBe('HOLEY');
      expect(item.solveTurns).toBe(4);
      expect(item.clientPlatform).toBe('web');
      expect(item.clientTimestamp).toBeTruthy();
    });

    it('Does not submit contribution when winning word is already in curated answers', async () => {
      const standardWin: TurnRecord[] = [
        { guess: 'SALET', feedback: [0, 0, 0, 0, 0] },
        { guess: 'CRANE', feedback: [2, 2, 2, 2, 2] },
      ];

      const result = await service.evaluateAndSubmit(
        standardWin,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'web'
      );

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.status).toBe('ALREADY_KNOWN');
      expect(result?.word).toBe('CRANE');
      expect(memoryProvider.contributions).toHaveLength(0);
    });

    it('Returns null and takes no action when puzzle is incomplete', async () => {
      const incompleteTurns: TurnRecord[] = [
        { guess: 'SALET', feedback: [0, 0, 2, 2, 0] },
      ];

      const result = await service.evaluateAndSubmit(
        incompleteTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'extension'
      );

      expect(result).toBeNull();
      expect(memoryProvider.contributions).toHaveLength(0);
    });
  });

  describe('4. Deduplication, Idempotency, and Storage Persistence', () => {
    it('Prevents duplicate submissions for the same word within a session', async () => {
      const winningTurns: TurnRecord[] = [
        { guess: 'SALET', feedback: [0, 0, 1, 0, 1] },
        { guess: 'ROBIN', feedback: [1, 0, 0, 1, 0] },
        { guess: 'TRILL', feedback: [2, 2, 2, 2, 2] },
      ];

      // First submission
      const res1 = await service.evaluateAndSubmit(
        winningTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'extension'
      );
      expect(res1?.status).toBe('SUBMITTED');
      expect(memoryProvider.contributions).toHaveLength(1);

      // Repeated submission of the same win
      const res2 = await service.evaluateAndSubmit(
        winningTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'extension'
      );
      expect(res2?.status).toBe('ALREADY_SUBMITTED');
      expect(memoryProvider.contributions).toHaveLength(1);
    });

    it('SessionStorageDeduplicationStore persists across simulated page reloads', async () => {
      const store1 = new SessionStorageDeduplicationStore('test_dedupe_store');
      store1.clear();
      expect(store1.has('HOLEY')).toBe(false);

      store1.add('HOLEY');
      expect(store1.has('HOLEY')).toBe(true);

      // Simulate page reload by creating a new store instance with same key
      const store2 = new SessionStorageDeduplicationStore('test_dedupe_store');
      expect(store2.has('HOLEY')).toBe(true);

      store2.clear();
      expect(store2.has('HOLEY')).toBe(false);
    });
  });

  describe('5. Unconfigured Provider and Network Failure Resilience', () => {
    it('Bypasses submission cleanly without errors when provider is unconfigured', async () => {
      const unconfiguredService = new MissingAnswerContributionService(
        new UnconfiguredContributionProvider()
      );

      const winningTurns: TurnRecord[] = [
        { guess: 'HOLEY', feedback: [2, 2, 2, 2, 2] },
      ];

      const result = await unconfiguredService.evaluateAndSubmit(
        winningTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'web'
      );

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.status).toBe('UNCONFIGURED');
    });

    it('Catches provider exceptions gracefully and returns FAILED status without throwing', async () => {
      memoryProvider.simulateFailure('Simulated Network Outage / Timeout');

      const winningTurns: TurnRecord[] = [
        { guess: 'HOLEY', feedback: [2, 2, 2, 2, 2] },
      ];

      const result = await service.evaluateAndSubmit(
        winningTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'web'
      );

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.status).toBe('FAILED');
      expect(result?.error).toContain('Simulated Network Outage');
    });
  });

  describe('6. Solver Independence and Quarantined Integrity', () => {
    it('Guarantees pending contribution does not modify baseline curated answers', async () => {
      const initialAnswerCount = PRODUCTION_ANSWERS.length;
      expect(PRODUCTION_ANSWERS).not.toContain('HOLEY');

      const winningTurns: TurnRecord[] = [
        { guess: 'HOLEY', feedback: [2, 2, 2, 2, 2] },
      ];

      await service.evaluateAndSubmit(
        winningTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'web'
      );

      // Trusted dictionary remains immutable
      expect(PRODUCTION_ANSWERS.length).toBe(initialAnswerCount);
      expect(PRODUCTION_ANSWERS).not.toContain('HOLEY');
    });

    it('Guarantees solver filtering and recommendations remain unaffected by contribution state', async () => {
      const turns: TurnRecord[] = [{ guess: 'SALET', feedback: [0, 1, 0, 0, 0] }];

      // Solver evaluation
      const filterBefore = filterByHistory(PRODUCTION_ANSWERS, turns);
      const recBefore = getUnifiedRecommendation(filterBefore.candidates, ALL_VALID_GUESSES, 5);

      // Trigger failed contribution on another word
      memoryProvider.simulateFailure('DNS_PROBE_FAILED');
      await service.evaluateAndSubmit(
        [{ guess: 'HOLEY', feedback: [2, 2, 2, 2, 2] }],
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'web'
      );

      // Re-evaluate solver; output must be identical
      const filterAfter = filterByHistory(PRODUCTION_ANSWERS, turns);
      const recAfter = getUnifiedRecommendation(filterAfter.candidates, ALL_VALID_GUESSES, 5);

      expect(filterBefore.candidates).toEqual(filterAfter.candidates);
      expect(recBefore.recommendedGuess).toBe(recAfter.recommendedGuess);
      expect(recBefore.status).toBe(recAfter.status);
    });
  });

  describe('7. Firestore REST Provider Precondition & Idempotency Semantics', () => {
    it('Scenario 0: Returns UNCONFIGURED when projectId is empty', async () => {
      const restProvider = new FirestoreRestContributionProvider({ projectId: '' });
      expect(restProvider.isConfigured).toBe(false);

      const res = await restProvider.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 3,
        clientPlatform: 'web',
        clientTimestamp: new Date().toISOString(),
      });

      expect(res.status).toBe('UNCONFIGURED');
      expect(res.success).toBe(false);
    });

    it('Scenario 1: First submission creates pending contribution via create-only endpoint (returns 200 OK -> status SUBMITTED)', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedBody: any = null;

      const mockFetch = (async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? '';
        capturedBody = JSON.parse((init?.body as string) ?? '{}');
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ name: 'projects/demo/databases/(default)/documents/pendingContributions/HOLEY' }),
        } as Response;
      }) as typeof fetch;

      const restProvider = new FirestoreRestContributionProvider({
        projectId: 'wordle-solver-demo',
        apiKey: 'test-api-key',
        fetchFn: mockFetch,
      });

      const res = await restProvider.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 3,
        clientPlatform: 'web',
        clientTimestamp: '2026-10-24T18:00:00.000Z',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('SUBMITTED');
      expect(res.word).toBe('HOLEY');
      expect(capturedMethod).toBe('POST');
      expect(capturedUrl).toContain('/pendingContributions?documentId=HOLEY');
      expect(capturedUrl).toContain('key=test-api-key');
      expect(capturedBody.fields.word.stringValue).toBe('HOLEY');
      expect(capturedBody.fields.solveTurns.integerValue).toBe('3');
      expect(capturedBody.fields.clientPlatform.stringValue).toBe('web');
      expect(capturedBody.fields.status.stringValue).toBe('PENDING');
    });

    it('Scenario 2: Repeated submission for the same word returns 409 Conflict (ALREADY_EXISTS) -> returns status ALREADY_SUBMITTED without overwriting', async () => {
      const mock409Fetch = (async () => {
        return {
          ok: false,
          status: 409,
          text: async () => JSON.stringify({
            error: {
              code: 409,
              message: 'The request tried to create a document that already exists.',
              status: 'ALREADY_EXISTS',
            },
          }),
        } as Response;
      }) as typeof fetch;

      const restProvider = new FirestoreRestContributionProvider({
        projectId: 'wordle-solver-demo',
        fetchFn: mock409Fetch,
      });

      const res = await restProvider.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 4,
        clientPlatform: 'extension',
        clientTimestamp: '2026-10-24T19:00:00.000Z',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('ALREADY_SUBMITTED');
      expect(res.word).toBe('HOLEY');
      expect(res.message).toContain('already been recorded');
    });

    it('Scenario 3: Existing document original fields remain unchanged after conflicting submission', async () => {
      // 3A: Test with simulated Firestore server state
      interface StoredDoc {
        fields: Record<string, { stringValue?: string; integerValue?: string }>;
      }
      const remoteDatabase = new Map<string, StoredDoc>();

      // Pre-existing original document created by User A
      remoteDatabase.set('HOLEY', {
        fields: {
          word: { stringValue: 'HOLEY' },
          solveTurns: { integerValue: '3' },
          clientPlatform: { stringValue: 'web' },
          clientTimestamp: { stringValue: '2026-10-24T10:00:00.000Z' },
          status: { stringValue: 'PENDING' },
        },
      });

      const serverMockFetch = (async (url: string, init?: RequestInit) => {
        const parsedUrl = new URL(url);
        const docId = parsedUrl.searchParams.get('documentId');
        if (docId && remoteDatabase.has(docId)) {
          // Document already exists — reject without modifying database!
          return {
            ok: false,
            status: 409,
            text: async () => JSON.stringify({ error: { code: 409, status: 'ALREADY_EXISTS' } }),
          } as Response;
        }

        if (docId && init?.body) {
          remoteDatabase.set(docId, JSON.parse(init.body as string));
        }

        return {
          ok: true,
          status: 200,
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const provider = new FirestoreRestContributionProvider({
        projectId: 'wordle-solver-demo',
        fetchFn: serverMockFetch,
      });

      // User B attempts to submit 'HOLEY' with different solveTurns and timestamp
      const conflictingResult = await provider.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 6,
        clientPlatform: 'extension',
        clientTimestamp: '2026-10-24T22:00:00.000Z',
      });

      expect(conflictingResult.success).toBe(true);
      expect(conflictingResult.status).toBe('ALREADY_SUBMITTED');

      // Verify the remote database record is completely unmodified: original solveTurns 3, not 6
      const stored = remoteDatabase.get('HOLEY')!;
      expect(stored.fields['solveTurns']?.integerValue).toBe('3');
      expect(stored.fields['clientPlatform']?.stringValue).toBe('web');
      expect(stored.fields['clientTimestamp']?.stringValue).toBe('2026-10-24T10:00:00.000Z');

      // 3B: Also verify InMemoryContributionProvider guarantees immutability on conflict
      const inMemory = new InMemoryContributionProvider();
      await inMemory.submitPendingContribution({
        word: 'TRILL',
        solveTurns: 2,
        clientPlatform: 'web',
        clientTimestamp: '2026-10-24T08:00:00.000Z',
      });
      const repeatedResult = await inMemory.submitPendingContribution({
        word: 'TRILL',
        solveTurns: 5,
        clientPlatform: 'extension',
        clientTimestamp: '2026-10-24T20:00:00.000Z',
      });
      expect(repeatedResult.status).toBe('ALREADY_SUBMITTED');
      expect(inMemory.contributions).toHaveLength(1);
      expect(inMemory.contributions[0]?.solveTurns).toBe(2);
      expect(inMemory.contributions[0]?.clientPlatform).toBe('web');
    });

    it('Scenario 4: Precondition conflict (both HTTP 409 and HTTP 412) mapped to safe status ALREADY_SUBMITTED', async () => {
      // 4A: HTTP 409 Conflict
      const mock409 = (async () => ({
        ok: false,
        status: 409,
        text: async () => '409 Conflict (ALREADY_EXISTS)',
      })) as unknown as typeof fetch;

      const provider409 = new FirestoreRestContributionProvider({
        projectId: 'wordle-solver-demo',
        fetchFn: mock409,
      });

      const res409 = await provider409.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 4,
        clientPlatform: 'web',
        clientTimestamp: new Date().toISOString(),
      });
      expect(res409.success).toBe(true);
      expect(res409.status).toBe('ALREADY_SUBMITTED');

      // 4B: HTTP 412 Precondition Failed
      const mock412 = (async () => ({
        ok: false,
        status: 412,
        text: async () => 'FAILED_PRECONDITION: Document already exists',
      })) as unknown as typeof fetch;

      const provider412 = new FirestoreRestContributionProvider({
        projectId: 'wordle-solver-demo',
        fetchFn: mock412,
      });

      const res412 = await provider412.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 4,
        clientPlatform: 'web',
        clientTimestamp: new Date().toISOString(),
      });
      expect(res412.success).toBe(true);
      expect(res412.status).toBe('ALREADY_SUBMITTED');
    });

    it('Scenario 5: Genuine network error (fetch throws TypeError) returns status FAILED, never false positive', async () => {
      const mockNetworkError = (async () => {
        throw new TypeError('Failed to fetch (simulated network offline / DNS resolution failure)');
      }) as unknown as typeof fetch;

      const restProvider = new FirestoreRestContributionProvider({
        projectId: 'wordle-solver-demo',
        fetchFn: mockNetworkError,
      });

      const res = await restProvider.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 3,
        clientPlatform: 'web',
        clientTimestamp: new Date().toISOString(),
      });

      // Must fail cleanly and NEVER report SUBMITTED or ALREADY_SUBMITTED
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error).toContain('Failed to fetch');

      // 5B: Server 500 error also returns FAILED, never false positive
      const mock500 = (async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })) as unknown as typeof fetch;

      const provider500 = new FirestoreRestContributionProvider({
        projectId: 'wordle-solver-demo',
        fetchFn: mock500,
      });

      const res500 = await provider500.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 3,
        clientPlatform: 'web',
        clientTimestamp: new Date().toISOString(),
      });
      expect(res500.success).toBe(false);
      expect(res500.status).toBe('FAILED');
      expect(res500.message).toContain('status 500');
    });

    it('Scenario 6: No unconditional write retry occurs after precondition conflict', async () => {
      let callCount = 0;
      const mockTrackingFetch = (async () => {
        callCount++;
        return {
          ok: false,
          status: 409,
          text: async () => '409 Conflict',
        } as Response;
      }) as unknown as typeof fetch;

      const restProvider = new FirestoreRestContributionProvider({
        projectId: 'wordle-solver-demo',
        fetchFn: mockTrackingFetch,
      });

      const res = await restProvider.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 3,
        clientPlatform: 'web',
        clientTimestamp: new Date().toISOString(),
      });

      expect(res.status).toBe('ALREADY_SUBMITTED');
      // Assert exactly one network request was dispatched: no retry loop, no fallback unconditional write
      expect(callCount).toBe(1);
    });

    it('Scenario 7: Request URL, method, query parameters, and body match the intended create-only contract', async () => {
      // 7A: Default POST createDocument contract
      let postUrl = '';
      let postMethod = '';
      let postBody: any = null;

      const postFetch = (async (url: string, init?: RequestInit) => {
        postUrl = url;
        postMethod = init?.method ?? '';
        postBody = JSON.parse((init?.body as string) ?? '{}');
        return { ok: true, status: 200, text: async () => '{}' } as Response;
      }) as unknown as typeof fetch;

      const defaultProvider = new FirestoreRestContributionProvider({
        projectId: 'wordle-proj',
        apiKey: 'key123',
        fetchFn: postFetch,
      });

      await defaultProvider.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 4,
        clientPlatform: 'web',
        clientTimestamp: '2026-10-24T12:34:56.789Z',
      });

      expect(postMethod).toBe('POST');
      expect(postUrl).toBe(
        'https://firestore.googleapis.com/v1/projects/wordle-proj/databases/(default)/documents/pendingContributions?documentId=HOLEY&key=key123'
      );
      expect(postBody).toEqual({
        fields: {
          word: { stringValue: 'HOLEY' },
          solveTurns: { integerValue: '4' },
          clientPlatform: { stringValue: 'web' },
          clientTimestamp: { stringValue: '2026-10-24T12:34:56.789Z' },
          status: { stringValue: 'PENDING' },
        },
      });

      // 7B: Alternative PATCH with currentDocument.exists=false contract
      let patchUrl = '';
      let patchMethod = '';
      let patchBody: any = null;

      const patchFetch = (async (url: string, init?: RequestInit) => {
        patchUrl = url;
        patchMethod = init?.method ?? '';
        patchBody = JSON.parse((init?.body as string) ?? '{}');
        return { ok: true, status: 200, text: async () => '{}' } as Response;
      }) as unknown as typeof fetch;

      const patchProvider = new FirestoreRestContributionProvider({
        projectId: 'wordle-proj',
        apiKey: 'key123',
        fetchFn: patchFetch,
        writeMethod: 'PATCH',
      });

      await patchProvider.submitPendingContribution({
        word: 'TRILL',
        solveTurns: 2,
        clientPlatform: 'extension',
        clientTimestamp: '2026-10-24T14:00:00.000Z',
      });

      expect(patchMethod).toBe('PATCH');
      expect(patchUrl).toBe(
        'https://firestore.googleapis.com/v1/projects/wordle-proj/databases/(default)/documents/pendingContributions/TRILL?currentDocument.exists=false&key=key123'
      );
      expect(patchBody.fields.word.stringValue).toBe('TRILL');
      expect(patchBody.fields.solveTurns.integerValue).toBe('2');
      expect(patchBody.fields.clientPlatform.stringValue).toBe('extension');
    });

    it('Scenario 8: Handles non-conflict HTTP errors (403 Permission Denied) safely without throwing', async () => {
      const mock403Fetch = (async () => ({
        ok: false,
        status: 403,
        text: async () => 'PERMISSION_DENIED: Missing authorization',
      })) as unknown as typeof fetch;

      const restProvider = new FirestoreRestContributionProvider({
        projectId: 'wordle-solver-demo',
        fetchFn: mock403Fetch,
      });

      const res = await restProvider.submitPendingContribution({
        word: 'HOLEY',
        solveTurns: 3,
        clientPlatform: 'web',
        clientTimestamp: new Date().toISOString(),
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error).toContain('PERMISSION_DENIED');
    });
  });

  describe('8. Web and Extension Consistency', () => {
    it('Both web and extension pipelines share identical detection and missing-word semantics', async () => {
      const holeyTurns: TurnRecord[] = [
        { guess: 'SALET', feedback: [0, 0, 2, 2, 0] },
        { guess: 'HOLEY', feedback: [2, 2, 2, 2, 2] },
      ];

      const webService = new MissingAnswerContributionService(
        memoryProvider,
        new InMemoryDeduplicationStore()
      );
      const extService = new MissingAnswerContributionService(
        memoryProvider,
        new InMemoryDeduplicationStore()
      );

      const webResult = await webService.evaluateAndSubmit(
        holeyTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'web'
      );

      extService.resetSession();
      memoryProvider.clear();

      const extResult = await extService.evaluateAndSubmit(
        holeyTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'extension'
      );

      expect(webResult?.word).toBe(extResult?.word);
      expect(webResult?.status).toBe(extResult?.status);
      expect(webResult?.success).toBe(extResult?.success);
    });
  });
});
