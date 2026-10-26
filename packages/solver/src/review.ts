import {
  PendingContributionPayload,
  ReviewEvidence,
  ReviewRecord,
  AdminReviewResult,
  AdminReviewProvider,
  ContributionStatus,
} from './types';
import { normalizeContributionWord } from './contribution';

/**
 * Parameters for validating an administrative review state transition.
 */
export interface ValidateReviewTransitionParams {
  readonly word: string;
  readonly reviewerId: string;
  readonly targetStatus: 'VERIFIED' | 'REJECTED';
  readonly currentStatus?: ContributionStatus | null;
  readonly evidence?: ReviewEvidence;
  readonly rejectionReason?: string;
  readonly allowableGuesses?: readonly string[];
}

/**
 * Result of validating a review state transition.
 */
export interface TransitionValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * Helper to validate RFC 3339 / ISO 8601 UTC timestamp format.
 * Expected by Cloud Firestore REST API for optimistic concurrency preconditions.
 */
export function isValidRfc3339Timestamp(ts: unknown): ts is string {
  if (typeof ts !== 'string' || ts.trim().length === 0) return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/i.test(ts.trim());
}

/**
 * Helper to redact sensitive bearer tokens from error messages or logs.
 * Preserves diagnostic text while removing raw credential strings.
 */
export function redactToken(text: string, token?: string): string {
  if (!token || token.trim().length < 6) return text;
  return text.split(token).join('[REDACTED_BEARER_TOKEN]');
}

/**
 * Strictly validates an administrative review state transition according to Stage 9C rules:
 * 1. Word must normalize to 5 uppercase ASCII alphabetic characters.
 * 2. Reviewer identifier must be present as an informative audit trail label.
 *    (NOTE: reviewerId is for record-keeping only; actual authorization is enforced by the transport/IAM boundary).
 * 3. If allowable guesses dictionary is provided, candidate must exist within it.
 * 4. To transition to VERIFIED, authoritative verification evidence is strictly mandatory.
 *    Client-reported wins, repeated submissions, user dates, or valid guesses are not evidence.
 *    Evidence citations (URLs, puzzle numbers, dates) provide verifiable provenance for human auditability,
 *    but do not themselves constitute automated cryptographic proof that a word was an official NYT puzzle answer;
 *    human administrators remain responsible for independently verifying the authenticity of external sources.
 * 5. If puzzle number or publication date are supplied in evidence, they must follow valid formats and calendar dates.
 * 6. To transition to REJECTED, a non-empty administrative justification is strictly mandatory.
 * 7. Contradictory terminal state transitions (VERIFIED -> REJECTED or vice versa) are disallowed.
 */
export function validateReviewTransition(
  params: ValidateReviewTransitionParams
): TransitionValidationResult {
  const normalizedWord = normalizeContributionWord(params.word);

  if (!/^[A-Z]{5}$/.test(normalizedWord)) {
    return {
      valid: false,
      error: `Invalid candidate word '${params.word}': must be exactly 5 uppercase alphabetic characters.`,
    };
  }

  if (!params.reviewerId || params.reviewerId.trim().length === 0) {
    return {
      valid: false,
      error: 'Reviewer identifier is required as an audit trail label.',
    };
  }

  if (params.allowableGuesses && !params.allowableGuesses.includes(normalizedWord)) {
    return {
      valid: false,
      error: `Word '${normalizedWord}' is not present in the allowable valid-guesses dictionary.`,
    };
  }

  const current = params.currentStatus;

  // Terminal state immutability checks
  if (current === 'VERIFIED') {
    if (params.targetStatus === 'VERIFIED') {
      return { valid: true }; // Idempotent re-verification
    }
    return {
      valid: false,
      error: `Cannot reject already VERIFIED word '${normalizedWord}'. Verified answers are immutable.`,
    };
  }

  if (current === 'REJECTED') {
    if (params.targetStatus === 'REJECTED') {
      return { valid: true }; // Idempotent re-rejection
    }
    return {
      valid: false,
      error: `Cannot verify previously REJECTED word '${normalizedWord}' without an explicit administrative override.`,
    };
  }

  // Target-specific validation
  if (params.targetStatus === 'VERIFIED') {
    if (!params.evidence || !params.evidence.source || params.evidence.source.trim().length < 5) {
      return {
        valid: false,
        error:
          'Verification requires an authoritative external source (e.g. official NYT Wordle column URL or WordleBot log reference). User wins or guess submissions are not evidence.',
      };
    }

    const lowerSource = params.evidence.source.trim().toLowerCase();
    const invalidClaims = [
      'client win',
      'player win',
      'devtools',
      'i won',
      'i guessed',
      'in-game win',
      'local test',
    ];
    if (invalidClaims.some((claim) => lowerSource.includes(claim))) {
      return {
        valid: false,
        error:
          'Client-reported wins, player statements, or DevTools inputs do not constitute authoritative verification evidence.',
      };
    }

    if (params.evidence.puzzleNumber !== undefined) {
      if (!Number.isInteger(params.evidence.puzzleNumber) || params.evidence.puzzleNumber <= 0) {
        return {
          valid: false,
          error: 'Puzzle number must be a positive integer (e.g. 1588).',
        };
      }
    }

    if (params.evidence.publicationDate !== undefined) {
      const trimmedDate = params.evidence.publicationDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        return {
          valid: false,
          error: 'Publication date must be formatted as YYYY-MM-DD.',
        };
      }
      const parts = trimmedDate.split('-').map(Number);
      const year = parts[0];
      const month = parts[1];
      const day = parts[2];
      if (year === undefined || month === undefined || day === undefined) {
        return {
          valid: false,
          error: 'Publication date must be formatted as YYYY-MM-DD.',
        };
      }
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
      ) {
        return {
          valid: false,
          error: `Publication date '${trimmedDate}' is not a valid calendar date.`,
        };
      }
    }
  } else if (params.targetStatus === 'REJECTED') {
    if (!params.rejectionReason || params.rejectionReason.trim().length < 3) {
      return {
        valid: false,
        error: 'Rejection requires a non-empty administrative justification note (at least 3 characters).',
      };
    }
  }

  return { valid: true };
}

/**
 * Safe unconfigured administrator review provider.
 * Protects against accidental network calls when admin credentials are absent.
 */
export class UnconfiguredAdminReviewProvider implements AdminReviewProvider {
  public readonly name = 'UNCONFIGURED';
  public readonly isConfigured = false;

  public async listPendingContributions(): Promise<PendingContributionPayload[]> {
    return [];
  }

  public async getPendingContribution(_word: string): Promise<PendingContributionPayload | null> {
    return null;
  }

  public async getReviewRecord(_word: string): Promise<ReviewRecord | null> {
    return null;
  }

  public async verifyCandidate(
    word: string,
    _reviewerId: string,
    _evidence: ReviewEvidence
  ): Promise<AdminReviewResult> {
    return {
      success: false,
      word: normalizeContributionWord(word),
      status: 'UNCONFIGURED',
      message: 'No administrative review provider is configured.',
    };
  }

  public async rejectCandidate(
    word: string,
    _reviewerId: string,
    _reason: string
  ): Promise<AdminReviewResult> {
    return {
      success: false,
      word: normalizeContributionWord(word),
      status: 'UNCONFIGURED',
      message: 'No administrative review provider is configured.',
    };
  }
}

/**
 * In-memory administrator review provider for unit tests, offline simulations,
 * and local demonstration without external cloud credentials.
 */
export class InMemoryAdminReviewProvider implements AdminReviewProvider {
  public readonly name = 'IN_MEMORY';
  public readonly isConfigured = true;

  public readonly pendingContributions = new Map<string, PendingContributionPayload>();
  public readonly reviewRecords = new Map<string, ReviewRecord>();

  public seedPending(contributions: readonly PendingContributionPayload[]): void {
    for (const item of contributions) {
      const normalized = normalizeContributionWord(item.word);
      this.pendingContributions.set(normalized, {
        ...item,
        word: normalized,
      });
    }
  }

  public clear(): void {
    this.pendingContributions.clear();
    this.reviewRecords.clear();
  }

  public async listPendingContributions(): Promise<PendingContributionPayload[]> {
    return Array.from(this.pendingContributions.values());
  }

  public async getPendingContribution(word: string): Promise<PendingContributionPayload | null> {
    const normalized = normalizeContributionWord(word);
    return this.pendingContributions.get(normalized) ?? null;
  }

  public async getReviewRecord(word: string): Promise<ReviewRecord | null> {
    const normalized = normalizeContributionWord(word);
    return this.reviewRecords.get(normalized) ?? null;
  }

  public async verifyCandidate(
    word: string,
    reviewerId: string,
    evidence: ReviewEvidence
  ): Promise<AdminReviewResult> {
    const normalized = normalizeContributionWord(word);
    const existingReview = this.reviewRecords.get(normalized);

    const validation = validateReviewTransition({
      word: normalized,
      reviewerId,
      targetStatus: 'VERIFIED',
      currentStatus: existingReview ? existingReview.status : 'PENDING',
      evidence,
    });

    if (!validation.valid) {
      return {
        success: false,
        word: normalized,
        status: 'INVALID_TRANSITION',
        message: validation.error ?? 'Invalid review transition.',
        error: validation.error,
      };
    }

    if (existingReview && existingReview.status === 'VERIFIED') {
      return {
        success: true,
        word: normalized,
        status: 'ALREADY_VERIFIED',
        message: `'${normalized}' is already verified in the administrative audit record.`,
        record: existingReview,
      };
    }

    const record: ReviewRecord = {
      word: normalized,
      status: 'VERIFIED',
      reviewedAt: new Date().toISOString(),
      reviewerId,
      evidence,
      updateTime: new Date().toISOString(),
    };

    this.reviewRecords.set(normalized, record);
    this.pendingContributions.delete(normalized);

    return {
      success: true,
      word: normalized,
      status: 'VERIFIED',
      message: `'${normalized}' successfully verified as an official answer.`,
      record,
    };
  }

  public async rejectCandidate(
    word: string,
    reviewerId: string,
    reason: string
  ): Promise<AdminReviewResult> {
    const normalized = normalizeContributionWord(word);
    const existingReview = this.reviewRecords.get(normalized);

    const validation = validateReviewTransition({
      word: normalized,
      reviewerId,
      targetStatus: 'REJECTED',
      currentStatus: existingReview ? existingReview.status : 'PENDING',
      rejectionReason: reason,
    });

    if (!validation.valid) {
      return {
        success: false,
        word: normalized,
        status: 'INVALID_TRANSITION',
        message: validation.error ?? 'Invalid review transition.',
        error: validation.error,
      };
    }

    if (existingReview && existingReview.status === 'REJECTED') {
      return {
        success: true,
        word: normalized,
        status: 'ALREADY_REJECTED',
        message: `'${normalized}' is already rejected in the administrative audit record.`,
        record: existingReview,
      };
    }

    const record: ReviewRecord = {
      word: normalized,
      status: 'REJECTED',
      reviewedAt: new Date().toISOString(),
      reviewerId,
      rejectionReason: reason,
      updateTime: new Date().toISOString(),
    };

    this.reviewRecords.set(normalized, record);
    this.pendingContributions.delete(normalized);

    return {
      success: true,
      word: normalized,
      status: 'REJECTED',
      message: `'${normalized}' marked as rejected with reason: ${reason}`,
      record,
    };
  }
}

/**
 * Options for configuring the Firestore REST administrator review provider.
 */
export interface FirestoreRestAdminReviewOptions {
  readonly projectId: string;
  readonly adminBearerToken?: string;
  readonly fetchFn?: typeof fetch;
  readonly pendingCollection?: string;
  readonly reviewCollection?: string;
}

/**
 * Cloud Firestore REST API provider for authorized administrator workflows.
 * Requires an administrative Bearer token (OAuth2 token with Cloud Datastore permissions).
 *
 * Security Invariants:
 * - Bearer tokens must NEVER be embedded in client-side applications (web or extension).
 * - Intended exclusively for local CLI or authenticated administrator server environments.
 * - Fails safely with UNAUTHORIZED or UNCONFIGURED when credentials are missing or invalid.
 */
export class FirestoreRestAdminReviewProvider implements AdminReviewProvider {
  public readonly name = 'FIRESTORE_REST_ADMIN';
  private readonly options: FirestoreRestAdminReviewOptions;

  constructor(options: FirestoreRestAdminReviewOptions) {
    this.options = options;
  }

  public get isConfigured(): boolean {
    return Boolean(
      this.options.projectId &&
        this.options.projectId.trim().length > 0 &&
        this.options.adminBearerToken &&
        this.options.adminBearerToken.trim().length > 0
    );
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.options.adminBearerToken) {
      headers['Authorization'] = `Bearer ${this.options.adminBearerToken}`;
    }
    return headers;
  }

  public async listPendingContributions(): Promise<PendingContributionPayload[]> {
    if (!this.isConfigured) return [];

    const fetchFn = this.options.fetchFn ?? globalThis.fetch;
    const collection = this.options.pendingCollection ?? 'pendingContributions';
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      this.options.projectId
    )}/databases/(default)/documents/${encodeURIComponent(collection)}`;

    const response = await fetchFn(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const redacted = redactToken(errText.slice(0, 200), this.options.adminBearerToken);
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Admin authorization failed (HTTP ${response.status}): access token expired or lacking Datastore permissions.`
        );
      }
      throw new Error(`Firestore list pending failed with HTTP ${response.status}: ${redacted}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.documents)) return [];

    return data.documents.map((doc: any) => {
      const fields = doc.fields ?? {};
      return {
        word: fields.word?.stringValue ?? '',
        solveTurns: parseInt(fields.solveTurns?.integerValue ?? '0', 10),
        clientPlatform: fields.clientPlatform?.stringValue ?? 'web',
        clientTimestamp: fields.clientTimestamp?.stringValue ?? '',
      };
    });
  }

  public async getPendingContribution(word: string): Promise<PendingContributionPayload | null> {
    if (!this.isConfigured) return null;

    const normalized = normalizeContributionWord(word);
    const fetchFn = this.options.fetchFn ?? globalThis.fetch;
    const collection = this.options.pendingCollection ?? 'pendingContributions';
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      this.options.projectId
    )}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(
      normalized
    )}`;

    const response = await fetchFn(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 404) return null;

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Admin authorization failed (HTTP ${response.status}): access token expired or lacking Datastore permissions.`
      );
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const redacted = redactToken(errText.slice(0, 200), this.options.adminBearerToken);
      throw new Error(`Firestore get pending failed with HTTP ${response.status}: ${redacted}`);
    }

    const data = await response.json();
    const fields = data.fields ?? {};
    return {
      word: fields.word?.stringValue ?? normalized,
      solveTurns: parseInt(fields.solveTurns?.integerValue ?? '0', 10),
      clientPlatform: fields.clientPlatform?.stringValue ?? 'web',
      clientTimestamp: fields.clientTimestamp?.stringValue ?? '',
    };
  }

  public async getReviewRecord(word: string): Promise<ReviewRecord | null> {
    if (!this.isConfigured) return null;

    const normalized = normalizeContributionWord(word);
    const fetchFn = this.options.fetchFn ?? globalThis.fetch;
    const collection = this.options.reviewCollection ?? 'reviewedContributions';
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      this.options.projectId
    )}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(
      normalized
    )}`;

    const response = await fetchFn(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 404) return null;

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Admin authorization failed (HTTP ${response.status}): access token expired or lacking Datastore permissions.`
      );
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const redacted = redactToken(errText.slice(0, 200), this.options.adminBearerToken);
      throw new Error(`Firestore get review failed with HTTP ${response.status}: ${redacted}`);
    }

    const data = await response.json();
    const fields = data.fields ?? {};
    const status = fields.status?.stringValue as 'VERIFIED' | 'REJECTED';

    const record: ReviewRecord = {
      word: fields.word?.stringValue ?? normalized,
      status,
      reviewedAt: fields.reviewedAt?.stringValue ?? '',
      reviewerId: fields.reviewerId?.stringValue ?? '',
      updateTime: data.updateTime,
    };

    if (fields.evidenceSource?.stringValue) {
      return {
        ...record,
        evidence: {
          source: fields.evidenceSource.stringValue,
          puzzleNumber: fields.puzzleNumber?.integerValue
            ? parseInt(fields.puzzleNumber.integerValue, 10)
            : undefined,
          publicationDate: fields.publicationDate?.stringValue,
          notes: fields.notes?.stringValue,
        },
      };
    }

    if (fields.rejectionReason?.stringValue) {
      return {
        ...record,
        rejectionReason: fields.rejectionReason.stringValue,
      };
    }

    return record;
  }

  public async verifyCandidate(
    word: string,
    reviewerId: string,
    evidence: ReviewEvidence
  ): Promise<AdminReviewResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        word: normalizeContributionWord(word),
        status: 'UNCONFIGURED',
        message: 'Firebase project ID or admin token is missing.',
      };
    }

    const normalized = normalizeContributionWord(word);
    let existingReview: ReviewRecord | null = null;
    try {
      existingReview = await this.getReviewRecord(normalized);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('authorization failed') || msg.includes('401') || msg.includes('403')) {
        return {
          success: false,
          word: normalized,
          status: 'UNAUTHORIZED',
          message: 'Admin authorization failed: access token expired or lacking Datastore permissions.',
          error: redactToken(msg, this.options.adminBearerToken),
        };
      }
      return {
        success: false,
        word: normalized,
        status: 'FAILED',
        message: 'Failed to inspect existing review record from Firestore.',
        error: redactToken(msg, this.options.adminBearerToken),
      };
    }

    const validation = validateReviewTransition({
      word: normalized,
      reviewerId,
      targetStatus: 'VERIFIED',
      currentStatus: existingReview ? existingReview.status : 'PENDING',
      evidence,
    });

    if (!validation.valid) {
      return {
        success: false,
        word: normalized,
        status: 'INVALID_TRANSITION',
        message: validation.error ?? 'Invalid review transition.',
        error: validation.error,
      };
    }

    if (existingReview && existingReview.status === 'VERIFIED') {
      return {
        success: true,
        word: normalized,
        status: 'ALREADY_VERIFIED',
        message: `'${normalized}' is already recorded as verified in Firestore.`,
        record: existingReview,
      };
    }

    const fetchFn = this.options.fetchFn ?? globalThis.fetch;
    const reviewCollection = this.options.reviewCollection ?? 'reviewedContributions';

    // Optimistic Concurrency Preconditions:
    // If record previously existed, enforce matching RFC 3339 updateTime. If new, enforce create-only (exists=false).
    const queryParams: string[] = [];
    if (existingReview !== null) {
      if (!isValidRfc3339Timestamp(existingReview.updateTime)) {
        return {
          success: false,
          word: normalized,
          status: 'FAILED',
          message:
            'Existing review record has missing or malformed updateTime; refusing unsafe concurrent update.',
        };
      }
      queryParams.push(`currentDocument.updateTime=${encodeURIComponent(existingReview.updateTime.trim())}`);
    } else {
      queryParams.push('currentDocument.exists=false');
    }

    // UpdateMask: update ONLY targeted review fields, preventing accidental erasure of unrelated fields
    queryParams.push('updateMask.fieldPaths=word');
    queryParams.push('updateMask.fieldPaths=status');
    queryParams.push('updateMask.fieldPaths=reviewedAt');
    queryParams.push('updateMask.fieldPaths=reviewerId');
    queryParams.push('updateMask.fieldPaths=evidenceSource');
    if (evidence.puzzleNumber !== undefined) queryParams.push('updateMask.fieldPaths=puzzleNumber');
    if (evidence.publicationDate) queryParams.push('updateMask.fieldPaths=publicationDate');
    if (evidence.notes) queryParams.push('updateMask.fieldPaths=notes');

    const writeUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      this.options.projectId
    )}/databases/(default)/documents/${encodeURIComponent(reviewCollection)}/${encodeURIComponent(
      normalized
    )}?${queryParams.join('&')}`;

    const reviewedAt = new Date().toISOString();
    const body: Record<string, any> = {
      fields: {
        word: { stringValue: normalized },
        status: { stringValue: 'VERIFIED' },
        reviewedAt: { stringValue: reviewedAt },
        reviewerId: { stringValue: reviewerId },
        evidenceSource: { stringValue: evidence.source },
      },
    };

    if (evidence.puzzleNumber !== undefined) {
      body.fields.puzzleNumber = { integerValue: evidence.puzzleNumber.toString() };
    }
    if (evidence.publicationDate) {
      body.fields.publicationDate = { stringValue: evidence.publicationDate };
    }
    if (evidence.notes) {
      body.fields.notes = { stringValue: evidence.notes };
    }

    try {
      const response = await fetchFn(writeUrl, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          word: normalized,
          status: 'UNAUTHORIZED',
          message: 'Admin authorization failed: access token expired or lacking Datastore permissions.',
        };
      }

      // Handle concurrent conflict (HTTP 412 Precondition Failed or HTTP 409 Conflict)
      if (response.status === 412 || response.status === 409) {
        let latestRecord: ReviewRecord | null = null;
        try {
          latestRecord = await this.getReviewRecord(normalized);
        } catch {
          // Fail closed safely if re-read fails
        }
        if (latestRecord && latestRecord.status === 'VERIFIED') {
          return {
            success: true,
            word: normalized,
            status: 'ALREADY_VERIFIED',
            message: `'${normalized}' was concurrently verified by another administrator.`,
            record: latestRecord,
          };
        }
        if (latestRecord && latestRecord.status === 'REJECTED') {
          return {
            success: false,
            word: normalized,
            status: 'INVALID_TRANSITION',
            message: `Concurrent review collision: document was rejected by another administrator while verification was pending.`,
            record: latestRecord,
          };
        }
        return {
          success: false,
          word: normalized,
          status: 'FAILED',
          message: 'Precondition conflict (HTTP 412/409): document was concurrently modified during review.',
        };
      }

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          word: normalized,
          status: 'FAILED',
          message: `Firestore returned status ${response.status}.`,
          error: redactToken(errText.slice(0, 200), this.options.adminBearerToken),
        };
      }

      const responseData = await response.json().catch(() => ({}));
      const record: ReviewRecord = {
        word: normalized,
        status: 'VERIFIED',
        reviewedAt,
        reviewerId,
        evidence,
        updateTime: responseData?.updateTime,
      };

      return {
        success: true,
        word: normalized,
        status: 'VERIFIED',
        message: `'${normalized}' successfully verified and audit record recorded.`,
        record,
      };
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        word: normalized,
        status: 'FAILED',
        message: 'Network error contacting Firestore admin endpoint.',
        error: redactToken(rawMsg, this.options.adminBearerToken),
      };
    }
  }

  public async rejectCandidate(
    word: string,
    reviewerId: string,
    reason: string
  ): Promise<AdminReviewResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        word: normalizeContributionWord(word),
        status: 'UNCONFIGURED',
        message: 'Firebase project ID or admin token is missing.',
      };
    }

    const normalized = normalizeContributionWord(word);
    let existingReview: ReviewRecord | null = null;
    try {
      existingReview = await this.getReviewRecord(normalized);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('authorization failed') || msg.includes('401') || msg.includes('403')) {
        return {
          success: false,
          word: normalized,
          status: 'UNAUTHORIZED',
          message: 'Admin authorization failed: access token expired or lacking Datastore permissions.',
          error: redactToken(msg, this.options.adminBearerToken),
        };
      }
      return {
        success: false,
        word: normalized,
        status: 'FAILED',
        message: 'Failed to inspect existing review record from Firestore.',
        error: redactToken(msg, this.options.adminBearerToken),
      };
    }

    const validation = validateReviewTransition({
      word: normalized,
      reviewerId,
      targetStatus: 'REJECTED',
      currentStatus: existingReview ? existingReview.status : 'PENDING',
      rejectionReason: reason,
    });

    if (!validation.valid) {
      return {
        success: false,
        word: normalized,
        status: 'INVALID_TRANSITION',
        message: validation.error ?? 'Invalid review transition.',
        error: validation.error,
      };
    }

    if (existingReview && existingReview.status === 'REJECTED') {
      return {
        success: true,
        word: normalized,
        status: 'ALREADY_REJECTED',
        message: `'${normalized}' is already recorded as rejected in Firestore.`,
        record: existingReview,
      };
    }

    const fetchFn = this.options.fetchFn ?? globalThis.fetch;
    const reviewCollection = this.options.reviewCollection ?? 'reviewedContributions';

    // Optimistic Concurrency Preconditions:
    const queryParams: string[] = [];
    if (existingReview !== null) {
      if (!isValidRfc3339Timestamp(existingReview.updateTime)) {
        return {
          success: false,
          word: normalized,
          status: 'FAILED',
          message:
            'Existing review record has missing or malformed updateTime; refusing unsafe concurrent update.',
        };
      }
      queryParams.push(`currentDocument.updateTime=${encodeURIComponent(existingReview.updateTime.trim())}`);
    } else {
      queryParams.push('currentDocument.exists=false');
    }

    // UpdateMask: update ONLY targeted rejection fields
    queryParams.push('updateMask.fieldPaths=word');
    queryParams.push('updateMask.fieldPaths=status');
    queryParams.push('updateMask.fieldPaths=reviewedAt');
    queryParams.push('updateMask.fieldPaths=reviewerId');
    queryParams.push('updateMask.fieldPaths=rejectionReason');

    const writeUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      this.options.projectId
    )}/databases/(default)/documents/${encodeURIComponent(reviewCollection)}/${encodeURIComponent(
      normalized
    )}?${queryParams.join('&')}`;

    const reviewedAt = new Date().toISOString();
    const body = {
      fields: {
        word: { stringValue: normalized },
        status: { stringValue: 'REJECTED' },
        reviewedAt: { stringValue: reviewedAt },
        reviewerId: { stringValue: reviewerId },
        rejectionReason: { stringValue: reason },
      },
    };

    try {
      const response = await fetchFn(writeUrl, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          word: normalized,
          status: 'UNAUTHORIZED',
          message: 'Admin authorization failed: access token expired or lacking Datastore permissions.',
        };
      }

      // Handle concurrent conflict (HTTP 412 Precondition Failed or HTTP 409 Conflict)
      if (response.status === 412 || response.status === 409) {
        let latestRecord: ReviewRecord | null = null;
        try {
          latestRecord = await this.getReviewRecord(normalized);
        } catch {
          // Fail closed safely if re-read fails
        }
        if (latestRecord && latestRecord.status === 'REJECTED') {
          return {
            success: true,
            word: normalized,
            status: 'ALREADY_REJECTED',
            message: `'${normalized}' was concurrently rejected by another administrator.`,
            record: latestRecord,
          };
        }
        if (latestRecord && latestRecord.status === 'VERIFIED') {
          return {
            success: false,
            word: normalized,
            status: 'INVALID_TRANSITION',
            message: `Concurrent review collision: document was verified by another administrator while rejection was pending.`,
            record: latestRecord,
          };
        }
        return {
          success: false,
          word: normalized,
          status: 'FAILED',
          message: 'Precondition conflict (HTTP 412/409): document was concurrently modified during review.',
        };
      }

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          word: normalized,
          status: 'FAILED',
          message: `Firestore returned status ${response.status}.`,
          error: redactToken(errText.slice(0, 200), this.options.adminBearerToken),
        };
      }

      const responseData = await response.json().catch(() => ({}));
      const record: ReviewRecord = {
        word: normalized,
        status: 'REJECTED',
        reviewedAt,
        reviewerId,
        rejectionReason: reason,
        updateTime: responseData?.updateTime,
      };

      return {
        success: true,
        word: normalized,
        status: 'REJECTED',
        message: `'${normalized}' marked as rejected with reason: ${reason}`,
        record,
      };
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        word: normalized,
        status: 'FAILED',
        message: 'Network error contacting Firestore admin endpoint.',
        error: redactToken(rawMsg, this.options.adminBearerToken),
      };
    }
  }
}

/**
 * Service orchestrating administrative review operations.
 * Validates transitions and allowable vocabulary constraints before delegating to provider.
 */
export class AdminReviewService {
  private readonly provider: AdminReviewProvider;
  private readonly allowableGuesses?: readonly string[];

  constructor(
    provider: AdminReviewProvider = new UnconfiguredAdminReviewProvider(),
    allowableGuesses?: readonly string[]
  ) {
    this.provider = provider;
    this.allowableGuesses = allowableGuesses;
  }

  public async listPending(): Promise<PendingContributionPayload[]> {
    return this.provider.listPendingContributions();
  }

  public async inspectCandidate(word: string): Promise<{
    pending: PendingContributionPayload | null;
    review: ReviewRecord | null;
  }> {
    const normalized = normalizeContributionWord(word);
    const [pending, review] = await Promise.all([
      this.provider.getPendingContribution(normalized),
      this.provider.getReviewRecord(normalized),
    ]);
    return { pending, review };
  }

  public async verifyCandidate(
    word: string,
    reviewerId: string,
    evidence: ReviewEvidence
  ): Promise<AdminReviewResult> {
    const normalized = normalizeContributionWord(word);

    // Validate allowable guesses if vocabulary is supplied
    if (this.allowableGuesses && !this.allowableGuesses.includes(normalized)) {
      return {
        success: false,
        word: normalized,
        status: 'INVALID_TRANSITION',
        message: `Word '${normalized}' is not present in the allowable valid-guesses list.`,
      };
    }

    return this.provider.verifyCandidate(normalized, reviewerId, evidence);
  }

  public async rejectCandidate(
    word: string,
    reviewerId: string,
    reason: string
  ): Promise<AdminReviewResult> {
    const normalized = normalizeContributionWord(word);
    return this.provider.rejectCandidate(normalized, reviewerId, reason);
  }
}
