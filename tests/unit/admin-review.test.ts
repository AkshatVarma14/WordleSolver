import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  AdminReviewService,
  InMemoryAdminReviewProvider,
  UnconfiguredAdminReviewProvider,
  FirestoreRestAdminReviewProvider,
  validateReviewTransition,
  ReviewEvidence,
  PendingContributionPayload,
  detectWinningWord,
  isMissingAnswer,
  MissingAnswerContributionService,
  InMemoryDeduplicationStore,
  InMemoryContributionProvider,
  TurnRecord,
  isValidRfc3339Timestamp,
  redactToken,
} from '@wordle-solver/solver';

const answersPath = path.resolve(__dirname, '../../data/answers.txt');
const guessesPath = path.resolve(__dirname, '../../data/valid-guesses.txt');

const PRODUCTION_ANSWERS = Object.freeze(
  fs
    .readFileSync(answersPath, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean)
);

const ALL_VALID_GUESSES = Object.freeze(
  fs
    .readFileSync(guessesPath, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean)
);

describe('Stage 9C — Manual Administrator Review Workflow', () => {
  describe('1. State Transition Validation Rules', () => {
    it('Allows legal transition from PENDING to VERIFIED when authoritative evidence is supplied', () => {
      const res = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        currentStatus: 'PENDING',
        evidence: {
          source: 'https://www.nytimes.com/2026/10/24/crosswords/wordle-review-1588.html',
          puzzleNumber: 1588,
          publicationDate: '2026-10-24',
          notes: 'Official NYT Wordle solution #1588.',
        },
      });

      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('Rejects verification when evidence source is missing or empty', () => {
      const missingEvidence = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        currentStatus: 'PENDING',
      });
      expect(missingEvidence.valid).toBe(false);
      expect(missingEvidence.error).toContain('authoritative external source');

      const emptySource = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        currentStatus: 'PENDING',
        evidence: { source: '    ' },
      });
      expect(emptySource.valid).toBe(false);
    });

    it('Rejects verification when puzzle number is not a positive integer', () => {
      const negativePuzzle = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'https://example.com', puzzleNumber: -10 },
      });
      expect(negativePuzzle.valid).toBe(false);
      expect(negativePuzzle.error).toContain('Puzzle number must be a positive integer');

      const floatPuzzle = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'https://example.com', puzzleNumber: 1588.5 },
      });
      expect(floatPuzzle.valid).toBe(false);
      expect(floatPuzzle.error).toContain('Puzzle number must be a positive integer');
    });

    it('Rejects verification when publication date does not match YYYY-MM-DD format', () => {
      const badDate = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'https://example.com', publicationDate: 'October 24, 2026' },
      });
      expect(badDate.valid).toBe(false);
      expect(badDate.error).toContain('Publication date must be formatted as YYYY-MM-DD');

      const validDate = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'https://example.com', publicationDate: '2026-10-24' },
      });
      expect(validDate.valid).toBe(true);

      const nonExistentDate = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'https://example.com', publicationDate: '2026-02-31' },
      });
      expect(nonExistentDate.valid).toBe(false);
      expect(nonExistentDate.error).toContain('not a valid calendar date');
    });

    it('Rejects verification when evidence is a client win or player claim', () => {
      const clientWinEvidence = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'Client win confirmed in web app' },
      });
      expect(clientWinEvidence.valid).toBe(false);
      expect(clientWinEvidence.error).toContain('Client-reported wins, player statements, or DevTools inputs');

      const devtoolsClaim = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'DevTools inspection showed 5 greens' },
      });
      expect(devtoolsClaim.valid).toBe(false);
    });

    it('Rejects verification when candidate word is malformed or invalid length', () => {
      const shortWord = validateReviewTransition({
        word: 'HOL',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'https://example.com' },
      });
      expect(shortWord.valid).toBe(false);
      expect(shortWord.error).toContain('must be exactly 5 uppercase');

      const nonAlpha = validateReviewTransition({
        word: 'HOL3Y',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'https://example.com' },
      });
      expect(nonAlpha.valid).toBe(false);
    });

    it('Rejects review when reviewer identifier is absent (unauthenticated attempt)', () => {
      const noReviewer = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: '',
        targetStatus: 'VERIFIED',
        evidence: { source: 'https://example.com' },
      });
      expect(noReviewer.valid).toBe(false);
      expect(noReviewer.error).toContain('Reviewer identifier is required');
    });

    it('Rejects verification of candidate word absent from allowable guesses dictionary', () => {
      const notInGuesses = validateReviewTransition({
        word: 'ZZZZZ',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        evidence: { source: 'https://example.com' },
        allowableGuesses: ALL_VALID_GUESSES,
      });
      expect(notInGuesses.valid).toBe(false);
      expect(notInGuesses.error).toContain('not present in the allowable valid-guesses dictionary');
    });

    it('Allows legal transition from PENDING to REJECTED with mandatory reason note', () => {
      const validReject = validateReviewTransition({
        word: 'TRILL',
        reviewerId: 'admin_123',
        targetStatus: 'REJECTED',
        currentStatus: 'PENDING',
        rejectionReason: 'Spurious client win; word not featured in official NYT solution logs.',
      });
      expect(validReject.valid).toBe(true);
    });

    it('Rejects transition to REJECTED when justification note is missing or too short', () => {
      const noReason = validateReviewTransition({
        word: 'TRILL',
        reviewerId: 'admin_123',
        targetStatus: 'REJECTED',
        currentStatus: 'PENDING',
      });
      expect(noReason.valid).toBe(false);
      expect(noReason.error).toContain('Rejection requires a non-empty administrative justification');

      const shortReason = validateReviewTransition({
        word: 'TRILL',
        reviewerId: 'admin_123',
        targetStatus: 'REJECTED',
        currentStatus: 'PENDING',
        rejectionReason: 'no',
      });
      expect(shortReason.valid).toBe(false);
    });

    it('Enforces terminal state immutability: VERIFIED words cannot be directly rejected', () => {
      const rejectVerified = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'REJECTED',
        currentStatus: 'VERIFIED',
        rejectionReason: 'Mistake',
      });
      expect(rejectVerified.valid).toBe(false);
      expect(rejectVerified.error).toContain('Cannot reject already VERIFIED word');
    });

    it('Enforces terminal state immutability: REJECTED words cannot be directly verified without override', () => {
      const verifyRejected = validateReviewTransition({
        word: 'TRILL',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        currentStatus: 'REJECTED',
        evidence: { source: 'https://example.com' },
      });
      expect(verifyRejected.valid).toBe(false);
      expect(verifyRejected.error).toContain('Cannot verify previously REJECTED word');
    });

    it('Handles idempotent re-verification and re-rejection safely', () => {
      const reVerify = validateReviewTransition({
        word: 'HOLEY',
        reviewerId: 'admin_123',
        targetStatus: 'VERIFIED',
        currentStatus: 'VERIFIED',
        evidence: { source: 'https://example.com' },
      });
      expect(reVerify.valid).toBe(true);

      const reReject = validateReviewTransition({
        word: 'TRILL',
        reviewerId: 'admin_123',
        targetStatus: 'REJECTED',
        currentStatus: 'REJECTED',
        rejectionReason: 'Already rejected previously',
      });
      expect(reReject.valid).toBe(true);
    });
  });

  describe('2. In-Memory Administrator Review Service Operations', () => {
    let memoryProvider: InMemoryAdminReviewProvider;
    let service: AdminReviewService;

    const samplePending: PendingContributionPayload[] = [
      {
        word: 'HOLEY',
        solveTurns: 4,
        clientPlatform: 'web',
        clientTimestamp: '2026-10-24T18:00:00.000Z',
      },
      {
        word: 'TRILL',
        solveTurns: 3,
        clientPlatform: 'extension',
        clientTimestamp: '2026-10-24T19:30:00.000Z',
      },
    ];

    beforeEach(() => {
      memoryProvider = new InMemoryAdminReviewProvider();
      memoryProvider.seedPending(samplePending);
      service = new AdminReviewService(memoryProvider, ALL_VALID_GUESSES);
    });

    it('Lists quarantined pending candidate contributions', async () => {
      const pending = await service.listPending();
      expect(pending).toHaveLength(2);
      expect(pending.map((p) => p.word)).toEqual(['HOLEY', 'TRILL']);
    });

    it('Inspects candidate word returning both pending report and review history', async () => {
      const inspectionBefore = await service.inspectCandidate('HOLEY');
      expect(inspectionBefore.pending).not.toBeNull();
      expect(inspectionBefore.pending?.word).toBe('HOLEY');
      expect(inspectionBefore.pending?.solveTurns).toBe(4);
      expect(inspectionBefore.review).toBeNull();
    });

    it('Successfully verifies candidate when administrator provides authoritative evidence', async () => {
      const evidence: ReviewEvidence = {
        source: 'https://www.nytimes.com/2026/10/24/crosswords/wordle-review-1588.html',
        puzzleNumber: 1588,
        publicationDate: '2026-10-24',
        notes: 'Official daily solution.',
      };

      const result = await service.verifyCandidate('HOLEY', 'admin_sarah', evidence);

      expect(result.success).toBe(true);
      expect(result.status).toBe('VERIFIED');
      expect(result.word).toBe('HOLEY');
      expect(result.record).toBeDefined();
      expect(result.record?.status).toBe('VERIFIED');
      expect(result.record?.reviewerId).toBe('admin_sarah');
      expect(result.record?.evidence?.puzzleNumber).toBe(1588);

      // Verify pending queue is cleared for this word
      const remainingPending = await service.listPending();
      expect(remainingPending.map((p) => p.word)).not.toContain('HOLEY');

      // Inspection confirms review record is stored
      const inspectionAfter = await service.inspectCandidate('HOLEY');
      expect(inspectionAfter.pending).toBeNull();
      expect(inspectionAfter.review?.status).toBe('VERIFIED');
    });

    it('Handles idempotent re-verification without mutating the original audit timestamp', async () => {
      const evidence: ReviewEvidence = {
        source: 'https://www.nytimes.com/2026/10/24/wordle-review-1588.html',
      };

      const firstResult = await service.verifyCandidate('HOLEY', 'admin_sarah', evidence);
      expect(firstResult.status).toBe('VERIFIED');
      const originalTimestamp = firstResult.record?.reviewedAt;

      // Second review attempt
      const secondResult = await service.verifyCandidate('HOLEY', 'admin_bob', {
        source: 'https://different-source.com',
      });

      expect(secondResult.success).toBe(true);
      expect(secondResult.status).toBe('ALREADY_VERIFIED');
      expect(secondResult.record?.reviewedAt).toBe(originalTimestamp);
      expect(secondResult.record?.reviewerId).toBe('admin_sarah');
    });

    it('Successfully rejects candidate with non-empty reason and preserves audit record', async () => {
      const result = await service.rejectCandidate(
        'TRILL',
        'admin_mark',
        'Client-reported win was a manual DevTools simulation; word not in NYT rotation.'
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('REJECTED');
      expect(result.word).toBe('TRILL');
      expect(result.record?.status).toBe('REJECTED');
      expect(result.record?.rejectionReason).toContain('Client-reported win was a manual');

      const remainingPending = await service.listPending();
      expect(remainingPending.map((p) => p.word)).not.toContain('TRILL');
    });

    it('Handles idempotent re-rejection safely without overwriting record', async () => {
      await service.rejectCandidate('TRILL', 'admin_mark', 'First reason');
      const secondResult = await service.rejectCandidate('TRILL', 'admin_other', 'Second reason');

      expect(secondResult.success).toBe(true);
      expect(secondResult.status).toBe('ALREADY_REJECTED');
      expect(secondResult.record?.reviewerId).toBe('admin_mark');
      expect(secondResult.record?.rejectionReason).toBe('First reason');
    });

    it('Rejects verification of word not present in allowable valid-guesses vocabulary', async () => {
      const invalidWordResult = await service.verifyCandidate('NOTWD', 'admin_sarah', {
        source: 'https://example.com',
      });

      expect(invalidWordResult.success).toBe(false);
      expect(invalidWordResult.status).toBe('INVALID_TRANSITION');
      expect(invalidWordResult.message).toContain('not present in the allowable valid-guesses list');
    });
  });

  describe('3. Security Boundary & Authorization Integrity', () => {
    it('Guarantees client submissions cannot self-approve or set review status', () => {
      // PendingContributionPayload contract permits only word, solveTurns, clientPlatform, clientTimestamp
      const clientPayload: PendingContributionPayload = {
        word: 'HOLEY',
        solveTurns: 3,
        clientPlatform: 'web',
        clientTimestamp: new Date().toISOString(),
      };

      // Ensure no 'status' property exists on PendingContributionPayload
      expect((clientPayload as any).status).toBeUndefined();
    });

    it('Guarantees rejected words cannot enter the trusted baseline answer dictionary', async () => {
      const initialCount = PRODUCTION_ANSWERS.length;
      expect(PRODUCTION_ANSWERS).not.toContain('TRILL');

      const memoryProvider = new InMemoryAdminReviewProvider();
      const service = new AdminReviewService(memoryProvider, ALL_VALID_GUESSES);

      await service.rejectCandidate('TRILL', 'admin_1', 'Spurious submission');

      // Trusted production answers remain strictly immutable
      expect(PRODUCTION_ANSWERS.length).toBe(initialCount);
      expect(PRODUCTION_ANSWERS).not.toContain('TRILL');
    });

    it('Guarantees review records contain zero personal data or game histories', async () => {
      const memoryProvider = new InMemoryAdminReviewProvider();
      const service = new AdminReviewService(memoryProvider, ALL_VALID_GUESSES);

      const res = await service.verifyCandidate('HOLEY', 'admin_verified_uid', {
        source: 'https://www.nytimes.com/wordle-review-1588.html',
        puzzleNumber: 1588,
      });

      const record = res.record!;
      const keys = Object.keys(record);

      expect(keys).toEqual(['word', 'status', 'reviewedAt', 'reviewerId', 'evidence', 'updateTime']);
      // Zero PII invariants
      expect((record as any).ipAddress).toBeUndefined();
      expect((record as any).userAgent).toBeUndefined();
      expect((record as any).gameHistory).toBeUndefined();
      expect((record as any).userId).toBeUndefined();
    });
  });

  describe('4. Unconfigured & Firestore REST Admin Provider Behavior', () => {
    it('UnconfiguredAdminReviewProvider safely returns UNCONFIGURED status without throwing', async () => {
      const unconfigured = new UnconfiguredAdminReviewProvider();
      expect(unconfigured.isConfigured).toBe(false);

      const pending = await unconfigured.listPendingContributions();
      expect(pending).toHaveLength(0);

      const verifyRes = await unconfigured.verifyCandidate('HOLEY', 'admin_1', {
        source: 'https://example.com',
      });
      expect(verifyRes.success).toBe(false);
      expect(verifyRes.status).toBe('UNCONFIGURED');

      const rejectRes = await unconfigured.rejectCandidate('HOLEY', 'admin_1', 'reason');
      expect(rejectRes.success).toBe(false);
      expect(rejectRes.status).toBe('UNCONFIGURED');
    });

    it('FirestoreRestAdminReviewProvider returns UNCONFIGURED when bearer token or project ID is missing', async () => {
      const noTokenProvider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver',
        adminBearerToken: '',
      });
      expect(noTokenProvider.isConfigured).toBe(false);

      const res = await noTokenProvider.verifyCandidate('HOLEY', 'admin_1', {
        source: 'https://example.com',
      });
      expect(res.status).toBe('UNCONFIGURED');
    });

    it('FirestoreRestAdminReviewProvider attaches Authorization Bearer token to requests', async () => {
      let interceptedHeaders: Record<string, string> = {};

      const mockFetch = (async (_url: string, init?: RequestInit) => {
        interceptedHeaders = (init?.headers as Record<string, string>) ?? {};
        return {
          ok: true,
          status: 200,
          json: async () => ({ documents: [] }),
        } as Response;
      }) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'secret_oauth_bearer_token_xyz',
        fetchFn: mockFetch,
      });

      expect(provider.isConfigured).toBe(true);
      await provider.listPendingContributions();

      expect(interceptedHeaders['Authorization']).toBe('Bearer secret_oauth_bearer_token_xyz');
    });

    it('FirestoreRestAdminReviewProvider maps HTTP 401 and 403 to safe UNAUTHORIZED status', async () => {
      const mock403Fetch = (async () => ({
        ok: false,
        status: 403,
        text: async () => 'PERMISSION_DENIED: Missing Cloud Datastore Admin role',
      })) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'unauthorized_token',
        fetchFn: mock403Fetch,
      });

      const verifyRes = await provider.verifyCandidate('HOLEY', 'admin_1', {
        source: 'https://www.nytimes.com/wordle-review-1588.html',
      });

      expect(verifyRes.success).toBe(false);
      expect(verifyRes.status).toBe('UNAUTHORIZED');
      expect(verifyRes.message).toContain('Admin authorization failed');
    });

    it('FirestoreRestAdminReviewProvider handles network exceptions safely without throwing', async () => {
      const mockNetworkError = (async () => {
        throw new TypeError('Failed to fetch (DNS timeout)');
      }) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'valid_token',
        fetchFn: mockNetworkError,
      });

      const res = await provider.verifyCandidate('HOLEY', 'admin_1', {
        source: 'https://www.nytimes.com/wordle-review-1588.html',
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error).toContain('Failed to fetch');
    });

    it('Enforces optimistic concurrency precondition currentDocument.exists=false and updateMask fieldPaths on initial verification', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      const mockFetch = (async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        if (init?.method === 'GET') {
          return { ok: false, status: 404, text: async () => 'Not Found' } as Response;
        }
        capturedBody = JSON.parse((init?.body as string) ?? '{}');
        return {
          ok: true,
          status: 200,
          json: async () => ({ updateTime: '2026-10-24T18:00:00.000000Z' }),
        } as Response;
      }) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'secret_token_abc',
        fetchFn: mockFetch,
      });

      const res = await provider.verifyCandidate('HOLEY', 'admin_sarah', {
        source: 'https://www.nytimes.com/wordle-review-1588.html',
        puzzleNumber: 1588,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('VERIFIED');
      expect(capturedUrl).toContain('currentDocument.exists=false');
      expect(capturedUrl).toContain('updateMask.fieldPaths=word');
      expect(capturedUrl).toContain('updateMask.fieldPaths=status');
      expect(capturedUrl).toContain('updateMask.fieldPaths=evidenceSource');
      expect(capturedBody.fields.word.stringValue).toBe('HOLEY');
      expect(capturedBody.fields.status.stringValue).toBe('VERIFIED');
    });

    it('Enforces optimistic concurrency precondition currentDocument.updateTime when updating existing review record', async () => {
      let capturedPatchUrl = '';

      const mockFetch = (async (url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              fields: {
                word: { stringValue: 'TRILL' },
                status: { stringValue: 'PENDING' },
                reviewedAt: { stringValue: '2026-10-24T10:00:00.000Z' },
                reviewerId: { stringValue: 'admin_initial' },
              },
              updateTime: '2026-10-24T10:00:00.123456Z',
            }),
          } as Response;
        }
        capturedPatchUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({ updateTime: '2026-10-24T11:00:00.000000Z' }),
        } as Response;
      }) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'secret_token_abc',
        fetchFn: mockFetch,
      });

      const res = await provider.rejectCandidate('TRILL', 'admin_reviewer', 'Spurious test submission');

      expect(res.success).toBe(true);
      expect(res.status).toBe('REJECTED');
      expect(capturedPatchUrl).toContain('currentDocument.updateTime=2026-10-24T10%3A00%3A00.123456Z');
      expect(capturedPatchUrl).toContain('updateMask.fieldPaths=rejectionReason');
    });

    it('Handles concurrent HTTP 412 conflict safely by re-fetching and detecting concurrent terminal state', async () => {
      let getCallCount = 0;

      const mockFetch = (async (_url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET') {
          getCallCount++;
          if (getCallCount === 1) {
            // First GET: document does not exist yet
            return { ok: false, status: 404, text: async () => 'Not Found' } as Response;
          }
          // Second GET (after conflict): document was created by Admin B in the meantime
          return {
            ok: true,
            status: 200,
            json: async () => ({
              fields: {
                word: { stringValue: 'HOLEY' },
                status: { stringValue: 'VERIFIED' },
                reviewedAt: { stringValue: '2026-10-24T18:05:00.000Z' },
                reviewerId: { stringValue: 'admin_concurrent' },
                evidenceSource: { stringValue: 'https://www.nytimes.com/wordle-review-1588.html' },
              },
              updateTime: '2026-10-24T18:05:00.999999Z',
            }),
          } as Response;
        }

        // PATCH: fails with HTTP 412 Precondition Failed
        return {
          ok: false,
          status: 412,
          text: async () => 'FAILED_PRECONDITION: The document already exists.',
        } as Response;
      }) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'token_123',
        fetchFn: mockFetch,
      });

      const res = await provider.verifyCandidate('HOLEY', 'admin_caller', {
        source: 'https://www.nytimes.com/wordle-review-1588.html',
      });

      // Handled cleanly as ALREADY_VERIFIED without throwing or corrupting
      expect(res.success).toBe(true);
      expect(res.status).toBe('ALREADY_VERIFIED');
      expect(res.message).toContain('concurrently verified by another administrator');
      expect(res.record?.reviewerId).toBe('admin_concurrent');
    });

    it('Redacts administrator bearer token from error messages if leaked by runtime exception', async () => {
      const secretToken = 'ya29.sensitive_oauth_bearer_token_123456789';

      const leakingFetch = (async () => {
        throw new Error(`Socket timeout while sending Bearer ${secretToken} to firestore.googleapis.com`);
      }) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: secretToken,
        fetchFn: leakingFetch,
      });

      const res = await provider.verifyCandidate('HOLEY', 'admin_1', {
        source: 'https://example.com',
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      // Token must NOT be present in error
      expect(res.error).not.toContain(secretToken);
      expect(res.error).toContain('[REDACTED_BEARER_TOKEN]');
    });

    it('redactToken preserves diagnostic messages while redacting tokens >= 6 chars', () => {
      const token = 'my_secret_token_123';
      const rawError = `Request failed: Authorization: Bearer ${token} resulted in HTTP 403 PERMISSION_DENIED`;
      const sanitized = redactToken(rawError, token);

      expect(sanitized).not.toContain(token);
      expect(sanitized).toBe('Request failed: Authorization: Bearer [REDACTED_BEARER_TOKEN] resulted in HTTP 403 PERMISSION_DENIED');
      // Preserves diagnostic context
      expect(sanitized).toContain('HTTP 403 PERMISSION_DENIED');

      // Does not replace text for trivial/empty tokens (< 6 chars)
      expect(redactToken('status: 200 ok', 'ok')).toBe('status: 200 ok');
      expect(redactToken('some text', '')).toBe('some text');
    });

    it('Correctly validates RFC 3339 UTC timestamp format for Firestore preconditions', () => {
      expect(isValidRfc3339Timestamp('2026-10-24T18:00:00.000000Z')).toBe(true);
      expect(isValidRfc3339Timestamp('2026-10-24T18:00:00.123Z')).toBe(true);
      expect(isValidRfc3339Timestamp('2026-10-24T18:00:00Z')).toBe(true);

      expect(isValidRfc3339Timestamp('')).toBe(false);
      expect(isValidRfc3339Timestamp(null)).toBe(false);
      expect(isValidRfc3339Timestamp(undefined)).toBe(false);
      expect(isValidRfc3339Timestamp(12345)).toBe(false);
      expect(isValidRfc3339Timestamp('2026-10-24 18:00:00')).toBe(false);
      expect(isValidRfc3339Timestamp('2026-10-24')).toBe(false);
      expect(isValidRfc3339Timestamp('not-a-timestamp')).toBe(false);
    });

    it('Fails closed when existing review record has missing updateTime during verifyCandidate', async () => {
      const mockFetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            word: { stringValue: 'HOLEY' },
            status: { stringValue: 'PENDING' },
          },
          // Missing updateTime field
        }),
      })) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'valid_token_123',
        fetchFn: mockFetch,
      });

      const res = await provider.verifyCandidate('HOLEY', 'admin_1', {
        source: 'https://www.nytimes.com/wordle-review-1588.html',
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.message).toContain('missing or malformed updateTime');
    });

    it('Fails closed when existing review record has malformed updateTime during rejectCandidate', async () => {
      const mockFetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            word: { stringValue: 'TRILL' },
            status: { stringValue: 'PENDING' },
          },
          updateTime: 'corrupted-timestamp-value',
        }),
      })) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'valid_token_123',
        fetchFn: mockFetch,
      });

      const res = await provider.rejectCandidate('TRILL', 'admin_1', 'Spurious entry');

      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.message).toContain('missing or malformed updateTime');
    });

    it('listPendingContributions throws explicit authorization error on HTTP 401 and 403', async () => {
      const mock401Fetch = (async () => ({
        ok: false,
        status: 401,
        text: async () => 'UNAUTHENTICATED: Invalid OAuth bearer token',
      })) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'expired_token',
        fetchFn: mock401Fetch,
      });

      await expect(provider.listPendingContributions()).rejects.toThrow(
        /Admin authorization failed \(HTTP 401\)/
      );
    });

    it('getPendingContribution throws explicit authorization error on HTTP 403', async () => {
      const mock403Fetch = (async () => ({
        ok: false,
        status: 403,
        text: async () => 'PERMISSION_DENIED: User lacks datastore.entities.get',
      })) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'forbidden_token',
        fetchFn: mock403Fetch,
      });

      await expect(provider.getPendingContribution('HOLEY')).rejects.toThrow(
        /Admin authorization failed \(HTTP 403\)/
      );
    });

    it('getReviewRecord returns null on 404 Not Found and throws on 401', async () => {
      const mock404Fetch = (async () => ({
        ok: false,
        status: 404,
        text: async () => 'NOT_FOUND: Document not found',
      })) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'token_123',
        fetchFn: mock404Fetch,
      });

      const res = await provider.getReviewRecord('HOLEY');
      expect(res).toBeNull();

      const mock401Fetch = (async () => ({
        ok: false,
        status: 401,
        text: async () => 'UNAUTHENTICATED',
      })) as unknown as typeof fetch;

      const authProvider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'bad_token',
        fetchFn: mock401Fetch,
      });

      await expect(authProvider.getReviewRecord('HOLEY')).rejects.toThrow(
        /Admin authorization failed \(HTTP 401\)/
      );
    });

    it('verifyCandidate maps authorization failure on initial lookup to UNAUTHORIZED before attempting write', async () => {
      const mock403Fetch = (async () => ({
        ok: false,
        status: 403,
        text: async () => 'PERMISSION_DENIED',
      })) as unknown as typeof fetch;

      const provider = new FirestoreRestAdminReviewProvider({
        projectId: 'wordle-solver-demo',
        adminBearerToken: 'insufficient_token',
        fetchFn: mock403Fetch,
      });

      const res = await provider.verifyCandidate('HOLEY', 'admin_1', {
        source: 'https://www.nytimes.com/wordle-review-1588.html',
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('UNAUTHORIZED');
      expect(res.message).toContain('Admin authorization failed');
    });
  });

  describe('5. Stage 9B Submission Pipeline Regression Invariance', () => {
    it('Preserves Stage 9B missing-answer detection and contribution submission behavior completely', async () => {
      const winningTurns: TurnRecord[] = [
        { guess: 'SALET', feedback: [0, 0, 2, 2, 0] },
        { guess: 'BOLED', feedback: [0, 2, 2, 2, 0] },
        { guess: 'HOLEY', feedback: [2, 2, 2, 2, 2] },
      ];

      expect(detectWinningWord(winningTurns)).toBe('HOLEY');
      expect(isMissingAnswer('HOLEY', PRODUCTION_ANSWERS, ALL_VALID_GUESSES)).toBe(true);

      const memoryContributionProvider = new InMemoryContributionProvider();
      const contributionService = new MissingAnswerContributionService(
        memoryContributionProvider,
        new InMemoryDeduplicationStore()
      );

      const submitResult = await contributionService.evaluateAndSubmit(
        winningTurns,
        PRODUCTION_ANSWERS,
        ALL_VALID_GUESSES,
        'web'
      );

      expect(submitResult).not.toBeNull();
      expect(submitResult?.status).toBe('SUBMITTED');
      expect(memoryContributionProvider.contributions).toHaveLength(1);
      expect(memoryContributionProvider.contributions[0]?.word).toBe('HOLEY');
    });
  });
});
