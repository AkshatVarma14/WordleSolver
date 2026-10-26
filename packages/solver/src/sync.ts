/**
 * @wordle-solver/solver — Dictionary Synchronization Service and Offline Cache
 *
 * Implements Stage 9D.2:
 * 1. Platform-independent storage abstraction (DictionaryManifestCacheStorage).
 * 2. Injected remote manifest provider abstraction (DictionaryManifestProvider).
 * 3. In-memory and offline caching with 12-hour TTL management.
 * 4. Safe offline fallback guaranteeing zero disruption when network fails.
 * 5. Strict version monotonicity (anti-rollback) and conflict prevention.
 * 6. Concurrency deduplication for in-flight synchronization requests.
 *
 * Trust Boundary & Authenticity Invariants:
 * - Local Checksum Limitation: A valid SHA-256 checksum proves data integrity (freedom from transit corruption),
 *   NOT publisher identity. Remote publisher authorization must be enforced by Google Cloud IAM at the network layer.
 * - Non-Inference: Presence of words in valid-guesses.txt or user reports never establishes approval.
 *   Only manifests passing strict schema, checksum, and vocabulary containment checks are accepted.
 * - Fault Tolerance: Storage errors (e.g. quota limits) or network failures never throw or crash the solver.
 */

import { validateManifest, mergeActiveAnswers } from './manifest';
import {
  DEFAULT_DICTIONARY_SYNC_TTL_MS,
  DictionarySource,
  DictionarySyncResult,
  CachedManifestRecord,
  DictionaryManifestCacheStorage,
  DictionaryManifestProvider,
  DictionarySyncServiceOptions,
  DictionaryManifest,
} from './types';

/**
 * In-memory implementation of DictionaryManifestCacheStorage.
 * Ideal for unit tests, headless CLI environments, and offline simulations.
 */
export class InMemoryDictionaryCacheStorage implements DictionaryManifestCacheStorage {
  private record: CachedManifestRecord | null = null;
  private lastSyncTime: number | null = null;

  public failOnGet = false;
  public failOnSet = false;
  public failOnClear = false;

  public getCachedManifest(): CachedManifestRecord | null {
    if (this.failOnGet) {
      throw new Error('Simulated cache storage read failure');
    }
    return this.record;
  }

  public setCachedManifest(record: CachedManifestRecord): void {
    if (this.failOnSet) {
      throw new Error('Simulated cache storage write failure');
    }
    this.record = record;
  }

  public clearCachedManifest(): void {
    if (this.failOnClear) {
      throw new Error('Simulated cache storage clear failure');
    }
    this.record = null;
  }

  public getLastSyncTime(): number | null {
    if (this.failOnGet) {
      throw new Error('Simulated cache storage read failure');
    }
    return this.lastSyncTime;
  }

  public setLastSyncTime(timestamp: number): void {
    if (this.failOnSet) {
      throw new Error('Simulated cache storage write failure');
    }
    this.lastSyncTime = timestamp;
  }
}

/**
 * Default unconfigured remote manifest provider.
 * Protects against accidental network calls when remote sync is not configured.
 */
export class UnconfiguredDictionaryManifestProvider implements DictionaryManifestProvider {
  public readonly name = 'UNCONFIGURED';
  public readonly isConfigured = false;

  public async fetchManifest(): Promise<DictionaryManifest | null> {
    return null;
  }
}

/**
 * In-memory remote manifest provider for unit tests, simulations, and dry runs.
 */
export class InMemoryDictionaryManifestProvider implements DictionaryManifestProvider {
  public readonly name = 'IN_MEMORY';
  public isConfigured = true;
  public manifest: DictionaryManifest | null = null;
  public shouldFail = false;
  public failureError: Error = new Error('Simulated network failure contacting manifest endpoint');
  public fetchCount = 0;

  constructor(initialManifest: DictionaryManifest | null = null) {
    this.manifest = initialManifest;
  }

  public async fetchManifest(): Promise<DictionaryManifest | null> {
    this.fetchCount++;
    if (this.shouldFail) {
      throw this.failureError;
    }
    return this.manifest;
  }
}

/**
 * Service orchestrating dictionary synchronization, persistent caching, and offline fallback.
 */
export class DictionarySyncService {
  private readonly bundledAnswers: readonly string[];
  private readonly validGuesses?: readonly string[];
  private readonly manifestProvider: DictionaryManifestProvider;
  private readonly cacheStorage: DictionaryManifestCacheStorage;
  private readonly ttlMs: number;
  private readonly nowFn: () => number;

  private activeWords: readonly string[];
  private activeVersion = 0;
  private activeSource: DictionarySource = 'BUNDLED';
  private activeManifest: DictionaryManifest | null = null;

  private inFlightSyncPromise: Promise<DictionarySyncResult> | null = null;

  constructor(options: DictionarySyncServiceOptions) {
    if (!Array.isArray(options.bundledAnswers)) {
      throw new TypeError('bundledAnswers must be an array of strings.');
    }

    this.bundledAnswers = options.bundledAnswers;
    this.validGuesses = options.validGuesses;
    this.manifestProvider =
      options.manifestProvider ?? new UnconfiguredDictionaryManifestProvider();
    this.cacheStorage = options.cacheStorage ?? new InMemoryDictionaryCacheStorage();
    this.ttlMs = options.ttlMs ?? DEFAULT_DICTIONARY_SYNC_TTL_MS;
    this.nowFn = options.nowFn ?? (() => Date.now());

    // Initialize synchronously with bundled baseline to guarantee non-blocking solver startup
    this.activeWords = mergeActiveAnswers(this.bundledAnswers, [], this.validGuesses);
  }

  /**
   * Returns the current active primary answer vocabulary synchronously.
   * Safe to call immediately at any point without blocking on network requests.
   */
  public getActiveAnswers(): readonly string[] {
    return this.activeWords;
  }

  /**
   * Returns the version of the currently active primary dictionary (0 for bundled only).
   */
  public getActiveVersion(): number {
    return this.activeVersion;
  }

  /**
   * Returns the provenance source of the active dictionary: BUNDLED, CACHE, or REMOTE.
   */
  public getActiveSource(): DictionarySource {
    return this.activeSource;
  }

  /**
   * Returns the currently active DictionaryManifest, or null if using bundled answers only.
   */
  public getActiveManifest(): DictionaryManifest | null {
    return this.activeManifest;
  }

  /**
   * Initializes the service by inspecting local persistent cache.
   * If a valid, non-expired cache exists, it is adopted immediately.
   * If expired or missing, triggers a synchronization check.
   */
  public async init(): Promise<DictionarySyncResult> {
    let cachedRecord: CachedManifestRecord | null = null;
    try {
      cachedRecord = await this.cacheStorage.getCachedManifest();
    } catch {
      // Storage read failure: safely proceed with bundled answers
    }

    if (cachedRecord && cachedRecord.manifest) {
      const validation = validateManifest(cachedRecord.manifest, this.validGuesses);
      if (!validation.valid || !validation.manifest) {
        // Corrupt cache detected: safely invalidate and clear
        try {
          await this.cacheStorage.clearCachedManifest();
        } catch {
          // Ignore clear error
        }
      } else {
        // Cache is valid: adopt it immediately
        this.activeManifest = validation.manifest;
        this.activeVersion = validation.manifest.dictionaryVersion;
        this.activeSource = 'CACHE';
        this.activeWords = mergeActiveAnswers(
          this.bundledAnswers,
          this.activeManifest.words,
          this.validGuesses
        );
      }
    }

    let lastSyncTime: number | null = null;
    try {
      lastSyncTime = await this.cacheStorage.getLastSyncTime();
    } catch {
      // Ignore
    }

    const now = this.nowFn();
    const isFresh =
      lastSyncTime !== null &&
      lastSyncTime <= now &&
      now - lastSyncTime < this.ttlMs;

    if (isFresh && this.activeManifest !== null) {
      return {
        success: true,
        status: 'CACHE_HIT',
        source: 'CACHE',
        dictionaryVersion: this.activeVersion,
        activeWords: this.activeWords,
        wordCount: this.activeWords.length,
        message: `Using valid cached dictionary version ${this.activeVersion} (fresh within 12h TTL).`,
        manifest: this.activeManifest,
      };
    }

    // Cache missing, corrupt, or expired: perform remote synchronization
    return this.sync();
  }

  /**
   * Synchronizes the dictionary against the remote manifest provider.
   *
   * Deduplicates concurrent calls: subsequent in-flight requests share the same Promise.
   *
   * @param force When true, bypasses the 12-hour TTL cache freshness check.
   */
  public async sync(force = false): Promise<DictionarySyncResult> {
    if (this.inFlightSyncPromise) {
      return this.inFlightSyncPromise;
    }

    this.inFlightSyncPromise = this.executeSync(force);

    try {
      return await this.inFlightSyncPromise;
    } finally {
      this.inFlightSyncPromise = null;
    }
  }

  private async executeSync(force: boolean): Promise<DictionarySyncResult> {
    const now = this.nowFn();

    // Check TTL freshness if not forced
    if (!force) {
      let lastSyncTime: number | null = null;
      try {
        lastSyncTime = await this.cacheStorage.getLastSyncTime();
      } catch {
        // Ignore storage error
      }

      const isFresh =
        lastSyncTime !== null &&
        lastSyncTime <= now &&
        now - lastSyncTime < this.ttlMs;

      const elapsedMinutes =
        lastSyncTime !== null ? Math.round((now - lastSyncTime) / 60000) : 0;

      if (isFresh && this.activeManifest !== null) {
        return {
          success: true,
          status: 'CACHE_HIT',
          source: this.activeSource,
          dictionaryVersion: this.activeVersion,
          activeWords: this.activeWords,
          wordCount: this.activeWords.length,
          message: `Cache TTL valid (${elapsedMinutes}m ago); skipping network sync.`,
          manifest: this.activeManifest,
        };
      }
    }

    // Verify provider is configured
    if (!this.manifestProvider.isConfigured) {
      return {
        success: false,
        status: 'UNCONFIGURED',
        source: this.activeSource,
        dictionaryVersion: this.activeVersion,
        activeWords: this.activeWords,
        wordCount: this.activeWords.length,
        message: 'Dictionary manifest provider is not configured.',
        manifest: this.activeManifest ?? undefined,
      };
    }

    // Remote fetch
    let remoteManifest: DictionaryManifest | null = null;
    try {
      remoteManifest = await this.manifestProvider.fetchManifest();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Offline fallback: retain current active state (cache or bundled); DO NOT update lastSyncTime
      return {
        success: false,
        status: 'OFFLINE_FALLBACK',
        source: this.activeSource,
        dictionaryVersion: this.activeVersion,
        activeWords: this.activeWords,
        wordCount: this.activeWords.length,
        message: `Network failure contacting dictionary endpoint: ${errorMsg}. Falling back to ${this.activeSource.toLowerCase()} dictionary.`,
        error: errorMsg,
        manifest: this.activeManifest ?? undefined,
      };
    }

    if (remoteManifest === null) {
      return {
        success: false,
        status: 'OFFLINE_FALLBACK',
        source: this.activeSource,
        dictionaryVersion: this.activeVersion,
        activeWords: this.activeWords,
        wordCount: this.activeWords.length,
        message: `No published dictionary manifest available remotely. Falling back to ${this.activeSource.toLowerCase()} dictionary.`,
        manifest: this.activeManifest ?? undefined,
      };
    }

    // Validate remote manifest integrity and schema
    const validation = validateManifest(remoteManifest, this.validGuesses);
    if (!validation.valid || !validation.manifest) {
      return {
        success: false,
        status: 'FAILED',
        source: this.activeSource,
        dictionaryVersion: this.activeVersion,
        activeWords: this.activeWords,
        wordCount: this.activeWords.length,
        message: `Remote manifest validation failed: ${validation.error}`,
        error: validation.error,
        manifest: this.activeManifest ?? undefined,
      };
    }

    const validRemote = validation.manifest;

    // Anti-rollback check: never replace a newer accepted dictionary with a lower version
    if (validRemote.dictionaryVersion < this.activeVersion) {
      return {
        success: false,
        status: 'FAILED',
        source: this.activeSource,
        dictionaryVersion: this.activeVersion,
        activeWords: this.activeWords,
        wordCount: this.activeWords.length,
        message: `Rejected manifest rollback from version ${this.activeVersion} to ${validRemote.dictionaryVersion}.`,
        error: `Version rollback rejected (${validRemote.dictionaryVersion} < ${this.activeVersion})`,
        manifest: this.activeManifest ?? undefined,
      };
    }

    // Equal version check: handle deterministically and reject conflicting payloads
    if (validRemote.dictionaryVersion === this.activeVersion && this.activeManifest !== null) {
      if (validRemote.checksum !== this.activeManifest.checksum) {
        return {
          success: false,
          status: 'FAILED',
          source: this.activeSource,
          dictionaryVersion: this.activeVersion,
          activeWords: this.activeWords,
          wordCount: this.activeWords.length,
          message: `Conflicting manifest payload detected for same dictionaryVersion ${this.activeVersion}.`,
          error: 'Conflicting checksum for identical version',
          manifest: this.activeManifest,
        };
      }

      // Identical payload: idempotent confirmation; record successful sync time
      try {
        await this.cacheStorage.setLastSyncTime(now);
      } catch {
        // Storage write failures should not abort in-memory confirmation
      }

      return {
        success: true,
        status: 'SYNCED',
        source: 'REMOTE',
        dictionaryVersion: this.activeVersion,
        activeWords: this.activeWords,
        wordCount: this.activeWords.length,
        message: `Dictionary confirmed up to date at version ${this.activeVersion}.`,
        manifest: this.activeManifest,
      };
    }

    // Newer version accepted: update active memory pool
    const newActiveWords = mergeActiveAnswers(
      this.bundledAnswers,
      validRemote.words,
      this.validGuesses
    );

    this.activeManifest = validRemote;
    this.activeVersion = validRemote.dictionaryVersion;
    this.activeSource = 'REMOTE';
    this.activeWords = newActiveWords;

    // Persist to local cache and update lastSyncTime
    try {
      await this.cacheStorage.setCachedManifest({
        manifest: validRemote,
        cachedAt: now,
        schemaVersion: 1,
      });
      await this.cacheStorage.setLastSyncTime(now);
    } catch {
      // Storage write failures should not discard in-memory adoption
    }

    return {
      success: true,
      status: 'SYNCED',
      source: 'REMOTE',
      dictionaryVersion: this.activeVersion,
      activeWords: this.activeWords,
      wordCount: this.activeWords.length,
      message: `Successfully synced dictionary to version ${this.activeVersion} (${validRemote.wordCount} approved words merged).`,
      manifest: validRemote,
    };
  }
}
