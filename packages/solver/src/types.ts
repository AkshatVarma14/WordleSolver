/**
 * Domain types and data contracts for the Wordle Solver engine.
 */

/**
 * Tile evaluation states corresponding to standard Wordle feedback:
 * 0 = Grey (Absent or exhausted duplicate)
 * 1 = Yellow (Present elsewhere in target)
 * 2 = Green (Correct position match)
 */
export type TileFeedback = 0 | 1 | 2;

export const TileState = {
  GREY: 0 as const,
  YELLOW: 1 as const,
  GREEN: 2 as const,
} as const;

export type TileStateType = (typeof TileState)[keyof typeof TileState];

/**
 * 5-tuple feedback pattern representing the 5 tile states of a guess.
 */
export type FeedbackPattern = readonly [
  TileFeedback,
  TileFeedback,
  TileFeedback,
  TileFeedback,
  TileFeedback,
];

/**
 * Result of evaluating a guess against a target answer.
 */
export interface FeedbackEvaluation {
  readonly guess: string;
  readonly answer: string;
  readonly feedback: FeedbackPattern;
}

/**
 * A historical guess and its observed feedback pattern.
 */
export interface TurnRecord {
  readonly guess: string;
  readonly feedback: FeedbackPattern;
}

/**
 * Detailed diagnosis of a contradictory game state or vocabulary mismatch.
 */
export interface ContradictionDiagnosis {
  readonly isContradiction: boolean;
  readonly earliestContradictionIndex: number | null;
  readonly earliestContradictingTurn: TurnRecord | null;
  readonly isVocabularyMismatch: boolean;
  readonly matchingValidGuessesCount: number;
  readonly sampleValidMatches: readonly string[];
  readonly explanation: string;
}

/**
 * Result of filtering candidates through historical turns.
 */
export interface FilterHistoryResult {
  readonly candidates: readonly string[];
  readonly initialCount: number;
  readonly remainingCount: number;
  readonly isContradiction: boolean;
  readonly stepCounts: readonly number[];
  readonly earliestContradictionIndex?: number | null;
}

/**
 * Evaluation metrics for a single guess against a candidate set.
 */
export interface GuessEvaluation {
  readonly guess: string;
  readonly isCandidate: boolean;
  readonly entropyBits: number;
  readonly expectedRemaining: number;
  readonly worstCasePartitionSize: number;
  readonly distinctPatternsCount: number;
  readonly immediateWinProbability: number;
}

/**
 * Scope tier for surviving candidate words.
 * PRIMARY: Curated answer vocabulary (e.g. 2,315 words).
 * EXPANDED_FALLBACK: Accepted guess vocabulary (e.g. 12,972 words) used only when PRIMARY is exhausted.
 */
export type CandidateScope = 'PRIMARY' | 'EXPANDED_FALLBACK';

/**
 * Result of two-tier layered filtering.
 */
export interface LayeredFilterResult {
  readonly candidates: readonly string[];
  readonly scope: CandidateScope;
  readonly isExpandedFallback: boolean;
  readonly primaryCount: number;
  readonly expandedCount: number;
  readonly isContradiction: boolean;
  readonly contradictionDiagnosis: ContradictionDiagnosis | null;
  readonly stepCounts: readonly number[];
  readonly warning?: string;
}

/**
 * Strategy identification.
 */
export type StrategyType = 'FAST_ENTROPY' | 'BOUNDED_MINIMAX';

/**
 * Status categorization for search and strategy evaluations.
 */
export type GuaranteeStatus =
  | 'WON'
  | 'PROVED_WIN'
  | 'DISPROVED_WIN'
  | 'UNRESOLVED_RESOURCE_LIMIT';

/**
 * Diagnostics and performance metrics for bounded deeper search.
 */
export interface SearchMetrics {
  readonly nodesExpanded: number;
  readonly durationMs: number;
  readonly depthReached: number;
  readonly worstCaseTurns?: number;
  readonly hitResourceLimit: boolean;
  readonly status: GuaranteeStatus;
  readonly memoHits: number;
}

/**
 * Complete recommendation response returned by solver strategies.
 */
export interface RecommendationResult {
  readonly recommendedGuess: string | null;
  readonly strategy: StrategyType;
  readonly candidatesCount: number;
  readonly isContradiction: boolean;
  readonly isWon: boolean;
  readonly evaluation: GuessEvaluation | null;
  readonly topRanked: readonly GuessEvaluation[];
  readonly explanation: string;
  readonly status?: GuaranteeStatus;
  readonly searchMetrics?: SearchMetrics;
  readonly warning?: string;
  readonly candidateScope?: CandidateScope;
  readonly isExpandedFallback?: boolean;
}

/**
 * Execution and resource limits for deeper game-tree search.
 */
export interface SearchBudget {
  readonly maxDepth: number;
  readonly maxBranchCandidates: number;
  readonly timeoutMs: number;
  readonly maxNodeExpansions: number;
}

/**
 * Default safe search budget parameters for client-side and browser execution.
 */
export const DEFAULT_SEARCH_BUDGET: SearchBudget = {
  maxDepth: 3,
  maxBranchCandidates: 20,
  timeoutMs: 500,
  maxNodeExpansions: 25000,
};

/**
 * Custom error thrown when a word violates the 5-letter alphabetic contract.
 */
export class InvalidWordError extends Error {
  public readonly field: 'guess' | 'answer';
  public readonly value: unknown;

  constructor(field: 'guess' | 'answer', value: unknown, reason: string) {
    super(`Invalid ${field}: '${String(value)}'. ${reason}`);
    this.name = 'InvalidWordError';
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Custom error thrown when a feedback pattern is malformed.
 */
export class InvalidFeedbackError extends Error {
  public readonly value: unknown;

  constructor(value: unknown, reason: string) {
    super(`Invalid feedback pattern: '${String(value)}'. ${reason}`);
    this.name = 'InvalidFeedbackError';
    this.value = value;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Review status of a contributed answer candidate in the quarantine queue.
 */
export type ReviewStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

/**
 * Extended contribution review status preserving backwards-compatible states.
 */
export type ContributionStatus = ReviewStatus | 'APPROVED' | 'SPAM';

/**
 * Outcome status of attempting to submit a missing answer contribution.
 */
export type ContributionSubmitStatus =
  | 'SUBMITTED'
  | 'ALREADY_SUBMITTED'
  | 'ALREADY_KNOWN'
  | 'INVALID_WORD'
  | 'UNCONFIGURED'
  | 'FAILED';

/**
 * Minimal payload submitted to the quarantined pending contributions queue.
 * Contains zero personal information, user tracking identifiers, or game histories.
 */
export interface PendingContributionPayload {
  /** 5-letter uppercase ASCII word */
  readonly word: string;
  /** Number of turns taken to win (1-6) */
  readonly solveTurns: number;
  /** Source client environment */
  readonly clientPlatform: 'web' | 'extension';
  /** Client timestamp in ISO format (informative metadata only, not authoritative proof) */
  readonly clientTimestamp: string;
}

/**
 * Result of submitting a contribution to the pending queue.
 */
export interface ContributionSubmitResult {
  readonly success: boolean;
  readonly word: string;
  readonly status: ContributionSubmitStatus;
  readonly message: string;
  readonly error?: string;
}

/**
 * Provider boundary contract for submitting pending contributions to a backend queue.
 */
export interface ContributionQueueProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  submitPendingContribution(
    contribution: PendingContributionPayload
  ): Promise<ContributionSubmitResult>;
}

/**
 * Authoritative verification evidence required to promote a pending contribution to VERIFIED.
 * A client-reported win, repeated submission, user-reported date, or valid guess is NOT evidence.
 */
export interface ReviewEvidence {
  /** Authoritative verification source (e.g. NYT Wordle Review column URL, WordleBot post-game log) */
  readonly source: string;
  /** Approximate official NYT puzzle number if known (e.g. 1588) */
  readonly puzzleNumber?: number;
  /** Official publication date (YYYY-MM-DD in UTC) */
  readonly publicationDate?: string;
  /** Concise verification notes or editorial rationale */
  readonly notes?: string;
}

/**
 * Audit record created by an authorized administrator when reviewing a candidate word.
 * Records only minimal necessary metadata with zero PII or player game histories.
 */
export interface ReviewRecord {
  /** 5-letter uppercase ASCII word */
  readonly word: string;
  /** Resulting review status */
  readonly status: 'VERIFIED' | 'REJECTED';
  /** Timestamp when the review action occurred (ISO 8601) */
  readonly reviewedAt: string;
  /**
   * Informative audit trail label identifying the operator (e.g. admin email or CLI handle).
   * NOTE: This label is for human auditing only and does NOT constitute cryptographic proof of identity.
   * Real authorization is enforced by Google Cloud IAM evaluating the administrator's OAuth2 bearer token.
   */
  readonly reviewerId: string;
  /** Mandatory evidence reference when status is VERIFIED */
  readonly evidence?: ReviewEvidence;
  /** Mandatory rejection note / reason when status is REJECTED */
  readonly rejectionReason?: string;
  /** Server document version timestamp for optimistic concurrency control */
  readonly updateTime?: string;
}

/**
 * Result status codes for administrator review operations.
 */
export type AdminReviewResultStatus =
  | 'VERIFIED'
  | 'REJECTED'
  | 'ALREADY_VERIFIED'
  | 'ALREADY_REJECTED'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'UNAUTHORIZED'
  | 'UNCONFIGURED'
  | 'FAILED';

/**
 * Result of an administrative review operation.
 */
export interface AdminReviewResult {
  readonly success: boolean;
  readonly word: string;
  readonly status: AdminReviewResultStatus;
  readonly message: string;
  readonly record?: ReviewRecord;
  readonly error?: string;
}

/**
 * Provider interface for administrative review operations.
 * Must run strictly within an authorized boundary (never in public browser clients).
 */
export interface AdminReviewProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  listPendingContributions(): Promise<PendingContributionPayload[]>;
  getPendingContribution(word: string): Promise<PendingContributionPayload | null>;
  getReviewRecord(word: string): Promise<ReviewRecord | null>;
  verifyCandidate(
    word: string,
    reviewerId: string,
    evidence: ReviewEvidence
  ): Promise<AdminReviewResult>;
  rejectCandidate(
    word: string,
    reviewerId: string,
    reason: string
  ): Promise<AdminReviewResult>;
}

/**
 * Current supported schema version for the trusted dictionary manifest.
 */
export const CURRENT_MANIFEST_SCHEMA_VERSION = 1;

/**
 * Canonical payload fields covered by the manifest integrity checksum.
 * Used for deterministic canonical serialization.
 */
export interface CanonicalManifestPayload {
  /** Schema specification version (must be CURRENT_MANIFEST_SCHEMA_VERSION) */
  readonly schemaVersion: number;
  /** Monotonically increasing dataset version (>= 1) */
  readonly dictionaryVersion: number;
  /** RFC 3339 UTC publication timestamp (e.g. 2026-10-26T14:00:00.000Z) */
  readonly publishedAt: string;
  /** Canonical, deduplicated, lexicographically sorted array of 5-letter uppercase words */
  readonly words: readonly string[];
}

/**
 * Complete published trusted dictionary manifest contract.
 * Represents an aggregated, immutable snapshot of administrator-approved answer additions.
 *
 * Trust Boundary Invariant:
 * - The manifest checksum verifies payload data integrity, NOT publisher authenticity.
 * - Authenticity of publication is governed at the transport/IAM boundary (Stage 9D.4).
 * - Clients validate checksum and vocabulary constraints before merging into active solver pools.
 */
export interface DictionaryManifest extends CanonicalManifestPayload {
  /** Checksum algorithm identifier (strictly 'sha256') */
  readonly checksumAlgorithm: 'sha256';
  /** Hexadecimal SHA-256 digest of the canonical payload */
  readonly checksum: string;
  /** Total count of approved words in this manifest (must equal words.length) */
  readonly wordCount: number;
  /** Optional human-readable operator/publisher audit label (for audit trail only) */
  readonly publisher?: string;
  /** Optional editorial release notes */
  readonly releaseNotes?: string;
}

/**
 * Result of validating a dictionary manifest.
 */
export interface ManifestValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly manifest?: DictionaryManifest;
}

/**
 * Parameters for creating a dictionary manifest.
 */
export interface CreateManifestParams {
  readonly dictionaryVersion: number;
  readonly words: readonly string[];
  readonly schemaVersion?: number;
  readonly publishedAt?: string;
  readonly publisher?: string;
  readonly releaseNotes?: string;
  readonly validGuesses?: readonly string[];
}

/**
 * Parameters for merging bundled answers with approved additions.
 */
export interface MergeActiveAnswersParams {
  readonly bundledAnswers: readonly string[];
  readonly approvedAnswers?: readonly string[];
  readonly validGuesses?: readonly string[];
}

/**
 * Default synchronization time-to-live: 12 hours in milliseconds.
 * Normal operations check for remote dictionary updates at most once every 12 hours.
 */
export const DEFAULT_DICTIONARY_SYNC_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Provenance source of the solver's currently active primary answer pool.
 */
export type DictionarySource = 'BUNDLED' | 'CACHE' | 'REMOTE';

/**
 * Status of a dictionary synchronization operation.
 */
export type DictionarySyncStatus =
  | 'SYNCED'
  | 'CACHE_HIT'
  | 'OFFLINE_FALLBACK'
  | 'UNCONFIGURED'
  | 'FAILED';

/**
 * Result of a dictionary synchronization operation.
 */
export interface DictionarySyncResult {
  readonly success: boolean;
  readonly status: DictionarySyncStatus;
  readonly source: DictionarySource;
  readonly dictionaryVersion: number;
  readonly activeWords: readonly string[];
  readonly wordCount: number;
  readonly message: string;
  readonly error?: string;
  readonly manifest?: DictionaryManifest;
}

/**
 * Cached manifest container stored in client persistent storage.
 */
export interface CachedManifestRecord {
  readonly manifest: DictionaryManifest;
  /** Client local timestamp when the manifest was accepted and cached (epoch ms) */
  readonly cachedAt: number;
  /** Schema version of the cache envelope */
  readonly schemaVersion: 1;
}

/**
 * Platform-independent abstraction for reading, writing, and clearing cached manifests.
 * Keeps browser/extension APIs (localStorage, chrome.storage.local) outside the core solver package.
 */
export interface DictionaryManifestCacheStorage {
  getCachedManifest(): Promise<CachedManifestRecord | null> | CachedManifestRecord | null;
  setCachedManifest(record: CachedManifestRecord): Promise<void> | void;
  clearCachedManifest(): Promise<void> | void;
  getLastSyncTime(): Promise<number | null> | number | null;
  setLastSyncTime(timestamp: number): Promise<void> | void;
}

/**
 * Platform-independent provider for fetching published dictionary manifests from remote storage.
 */
export interface DictionaryManifestProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  fetchManifest(): Promise<DictionaryManifest | null>;
}

/**
 * Configuration options for the DictionarySyncService.
 */
export interface DictionarySyncServiceOptions {
  /** Static bundled answer dictionary (immutable baseline, e.g. 2,315 words) */
  readonly bundledAnswers: readonly string[];
  /** Allowable valid guesses dictionary for defense-in-depth vocabulary validation */
  readonly validGuesses?: readonly string[];
  /** Remote manifest fetch provider */
  readonly manifestProvider?: DictionaryManifestProvider;
  /** Persistent client cache storage */
  readonly cacheStorage?: DictionaryManifestCacheStorage;
  /** Synchronization cache time-to-live in milliseconds (default: 12 hours) */
  readonly ttlMs?: number;
  /** Custom clock function for deterministic testing (defaults to Date.now) */
  readonly nowFn?: () => number;
}
