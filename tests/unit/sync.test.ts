import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_DICTIONARY_SYNC_TTL_MS,
  DictionarySyncService,
  InMemoryDictionaryCacheStorage,
  InMemoryDictionaryManifestProvider,
  UnconfiguredDictionaryManifestProvider,
  createDictionaryManifest,
  DictionaryManifest,
} from '@wordle-solver/solver';

describe('Stage 9D.2 — Dictionary Sync Service and Offline Cache', () => {
  const SYNTHETIC_GUESSES = Object.freeze([
    'CRANE',
    'SLATE',
    'SALET',
    'HOLEY',
    'TRILL',
    'PSHAW',
    'GUANO',
    'SNAFU',
    'BOLED',
    'XYLYL',
  ]);

  const SYNTHETIC_BUNDLED = Object.freeze(['CRANE', 'SLATE', 'SALET']);

  let currentTime = 1000000000000;
  const nowFn = () => currentTime;

  const sampleManifestV1: DictionaryManifest = createDictionaryManifest({
    dictionaryVersion: 1,
    words: ['HOLEY'],
    publishedAt: new Date(currentTime).toISOString(),
    validGuesses: SYNTHETIC_GUESSES,
  });

  const sampleManifestV2: DictionaryManifest = createDictionaryManifest({
    dictionaryVersion: 2,
    words: ['HOLEY', 'TRILL'],
    publishedAt: new Date(currentTime + 1000).toISOString(),
    validGuesses: SYNTHETIC_GUESSES,
  });

  beforeEach(() => {
    currentTime = 1000000000000;
  });

  describe('1. Synchronous Non-Blocking Startup', () => {
    it('initializes active answers immediately from bundled answers without blocking on network', () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      const storage = new InMemoryDictionaryCacheStorage();

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // Synchronous access before any async init() or sync()
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'SALET', 'SLATE']);
      expect(service.getActiveVersion()).toBe(0);
      expect(service.getActiveSource()).toBe('BUNDLED');
      expect(service.getActiveManifest()).toBeNull();
      expect(provider.fetchCount).toBe(0);
    });

    it('throws TypeError if bundledAnswers is not an array', () => {
      expect(() => {
        new DictionarySyncService({
          bundledAnswers: null as unknown as string[],
        });
      }).toThrow(TypeError);
    });
  });

  describe('2. First Startup with No Cache and No Network', () => {
    it('falls back to bundled answers immediately when unconfigured and no cache', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        cacheStorage: storage,
        nowFn,
      });

      const result = await service.init();

      expect(result.success).toBe(false);
      expect(result.status).toBe('UNCONFIGURED');
      expect(result.source).toBe('BUNDLED');
      expect(result.dictionaryVersion).toBe(0);
      expect(result.activeWords).toEqual(['CRANE', 'SALET', 'SLATE']);
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'SALET', 'SLATE']);
    });

    it('falls back to bundled answers when remote provider fails and no cache exists', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      provider.shouldFail = true;
      provider.failureError = new Error('ECONNREFUSED 127.0.0.1:443');

      const storage = new InMemoryDictionaryCacheStorage();
      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      const result = await service.init();

      expect(result.success).toBe(false);
      expect(result.status).toBe('OFFLINE_FALLBACK');
      expect(result.source).toBe('BUNDLED');
      expect(result.dictionaryVersion).toBe(0);
      expect(result.activeWords).toEqual(['CRANE', 'SALET', 'SLATE']);
      expect(result.error).toContain('ECONNREFUSED');
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'SALET', 'SLATE']);
      // Confirm lastSyncTime was NOT updated on failure
      expect(storage.getLastSyncTime()).toBeNull();
    });

    it('falls back to bundled answers when remote provider returns null and no cache exists', async () => {
      const provider = new InMemoryDictionaryManifestProvider(null);
      const storage = new InMemoryDictionaryCacheStorage();
      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      const result = await service.init();

      expect(result.success).toBe(false);
      expect(result.status).toBe('OFFLINE_FALLBACK');
      expect(result.source).toBe('BUNDLED');
      expect(result.dictionaryVersion).toBe(0);
      expect(result.message).toContain('No published dictionary manifest available remotely');
    });
  });

  describe('3. Successful Initial Synchronization and Remote Adoption', () => {
    it('adopts remote manifest, merges words, updates cache storage and lastSyncTime', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      const storage = new InMemoryDictionaryCacheStorage();

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      const result = await service.init();

      expect(result.success).toBe(true);
      expect(result.status).toBe('SYNCED');
      expect(result.source).toBe('REMOTE');
      expect(result.dictionaryVersion).toBe(1);
      expect(result.wordCount).toBe(4);
      expect(result.activeWords).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE']);
      expect(result.manifest).toEqual(sampleManifestV1);

      // Verify service state
      expect(service.getActiveVersion()).toBe(1);
      expect(service.getActiveSource()).toBe('REMOTE');
      expect(service.getActiveManifest()).toEqual(sampleManifestV1);
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE']);

      // Verify persistent cache storage
      const cached = storage.getCachedManifest();
      expect(cached).not.toBeNull();
      expect(cached?.manifest).toEqual(sampleManifestV1);
      expect(cached?.cachedAt).toBe(currentTime);
      expect(storage.getLastSyncTime()).toBe(currentTime);
    });
  });

  describe('4. 12-Hour TTL Cache Hit and Freshness Semantics', () => {
    it('returns CACHE_HIT within 12-hour TTL with zero network requests', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      const storage = new InMemoryDictionaryCacheStorage();

      // Populate valid cache
      storage.setCachedManifest({
        manifest: sampleManifestV1,
        cachedAt: currentTime,
        schemaVersion: 1,
      });
      storage.setLastSyncTime(currentTime);

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // Advance time by 6 hours (within 12h TTL)
      currentTime += 6 * 3600 * 1000;

      const result = await service.init();

      expect(result.success).toBe(true);
      expect(result.status).toBe('CACHE_HIT');
      expect(result.source).toBe('CACHE');
      expect(result.dictionaryVersion).toBe(1);
      expect(result.activeWords).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE']);
      expect(provider.fetchCount).toBe(0); // Zero network calls
    });

    it('sync() call within TTL returns CACHE_HIT without making network calls', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      const storage = new InMemoryDictionaryCacheStorage();

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // Initial sync
      await service.init();
      expect(provider.fetchCount).toBe(1);

      // Call sync() 2 hours later
      currentTime += 2 * 3600 * 1000;
      const syncResult = await service.sync();

      expect(syncResult.success).toBe(true);
      expect(syncResult.status).toBe('CACHE_HIT');
      expect(provider.fetchCount).toBe(1); // Network was not called again
    });

    it('triggers network sync when TTL has expired (> 12 hours)', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV2);
      const storage = new InMemoryDictionaryCacheStorage();

      storage.setCachedManifest({
        manifest: sampleManifestV1,
        cachedAt: currentTime,
        schemaVersion: 1,
      });
      storage.setLastSyncTime(currentTime);

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // Advance time beyond 12 hours (12 hours + 1 second)
      currentTime += DEFAULT_DICTIONARY_SYNC_TTL_MS + 1000;

      const result = await service.init();

      expect(result.success).toBe(true);
      expect(result.status).toBe('SYNCED');
      expect(result.dictionaryVersion).toBe(2);
      expect(result.activeWords).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE', 'TRILL']);
      expect(provider.fetchCount).toBe(1); // Network was contacted
    });
  });

  describe('5. Forced Synchronization Bypassing TTL', () => {
    it('bypasses valid TTL when sync(true) is invoked', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV2);
      const storage = new InMemoryDictionaryCacheStorage();

      storage.setCachedManifest({
        manifest: sampleManifestV1,
        cachedAt: currentTime,
        schemaVersion: 1,
      });
      storage.setLastSyncTime(currentTime);

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // Adopt cache in init()
      const initResult = await service.init();
      expect(initResult.status).toBe('CACHE_HIT');
      expect(provider.fetchCount).toBe(0);

      // Now force sync immediately (0 ms elapsed)
      const forceResult = await service.sync(true);

      expect(forceResult.success).toBe(true);
      expect(forceResult.status).toBe('SYNCED');
      expect(forceResult.dictionaryVersion).toBe(2);
      expect(provider.fetchCount).toBe(1);
      expect(service.getActiveVersion()).toBe(2);
    });
  });

  describe('6. Offline Fallback and Network Failure Handling', () => {
    it('retains valid cached words and returns OFFLINE_FALLBACK when network fails after cache expires', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV2);
      provider.shouldFail = true;
      provider.failureError = new Error('Network timeout (ETIMEDOUT)');

      const storage = new InMemoryDictionaryCacheStorage();
      storage.setCachedManifest({
        manifest: sampleManifestV1,
        cachedAt: currentTime,
        schemaVersion: 1,
      });
      const initialSyncTime = currentTime;
      storage.setLastSyncTime(initialSyncTime);

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // Advance time by 24 hours (cache expired)
      currentTime += 24 * 3600 * 1000;

      const result = await service.init();

      expect(result.success).toBe(false);
      expect(result.status).toBe('OFFLINE_FALLBACK');
      expect(result.source).toBe('CACHE');
      expect(result.dictionaryVersion).toBe(1);
      // Active words must still include the cached approved word 'HOLEY'
      expect(result.activeWords).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE']);
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE']);

      // lastSyncTime must NOT be updated on failure so it can retry next time
      expect(storage.getLastSyncTime()).toBe(initialSyncTime);
    });
  });

  describe('7. Corrupt Cache Recovery', () => {
    it('safely clears corrupt cache and falls back to remote sync or bundled answers', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      // Set corrupt manifest in storage (checksum does not match words)
      storage.setCachedManifest({
        manifest: {
          schemaVersion: 1,
          dictionaryVersion: 1,
          checksumAlgorithm: 'sha256',
          publishedAt: new Date(currentTime).toISOString(),
          wordCount: 1,
          words: ['HOLEY'],
          checksum: '0000000000000000000000000000000000000000000000000000000000000000',
        },
        cachedAt: currentTime,
        schemaVersion: 1,
      });

      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV2);

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      const result = await service.init();

      // Corrupt cache was discarded, remote sync succeeded
      expect(result.success).toBe(true);
      expect(result.status).toBe('SYNCED');
      expect(result.dictionaryVersion).toBe(2);
      expect(result.activeWords).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE', 'TRILL']);

      // Cache storage now contains clean manifest V2
      expect(storage.getCachedManifest()?.manifest.dictionaryVersion).toBe(2);
    });

    it('falls back to bundled answers if cache is corrupt and network also fails', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      storage.setCachedManifest({
        manifest: {
          schemaVersion: 99, // Unsupported schema
          dictionaryVersion: 1,
          publishedAt: 'invalid-date',
          wordCount: 0,
          words: [],
          checksum: 'abc',
        } as unknown as DictionaryManifest,
        cachedAt: currentTime,
        schemaVersion: 1,
      });

      const provider = new InMemoryDictionaryManifestProvider(null);
      provider.shouldFail = true;

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      const result = await service.init();

      expect(result.success).toBe(false);
      expect(result.status).toBe('OFFLINE_FALLBACK');
      expect(result.dictionaryVersion).toBe(0);
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'SALET', 'SLATE']);
    });
  });

  describe('8. Version Monotonicity (Anti-Rollback Enforcement)', () => {
    it('rejects a remote manifest with lower version than active/cached dictionary', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      storage.setCachedManifest({
        manifest: sampleManifestV2, // Version 2
        cachedAt: currentTime,
        schemaVersion: 1,
      });

      // Remote provider serves an older manifest V1
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      await service.init();
      expect(service.getActiveVersion()).toBe(2);

      // Force sync with the older remote version
      const rollbackResult = await service.sync(true);

      expect(rollbackResult.success).toBe(false);
      expect(rollbackResult.status).toBe('FAILED');
      expect(rollbackResult.error).toContain('Version rollback rejected');
      // Active version must stay at 2
      expect(service.getActiveVersion()).toBe(2);
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE', 'TRILL']);
    });
  });

  describe('9. Same-Version Idempotent Confirmation vs. Conflicting Checksum Rejection', () => {
    it('confirms idempotently when remote version and checksum match', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      await service.init();
      expect(service.getActiveVersion()).toBe(1);

      currentTime += 3600 * 1000;
      const secondSyncResult = await service.sync(true);

      expect(secondSyncResult.success).toBe(true);
      expect(secondSyncResult.status).toBe('SYNCED');
      expect(secondSyncResult.message).toContain('confirmed up to date');
      expect(storage.getLastSyncTime()).toBe(currentTime);
    });

    it('rejects manifest when same version has conflicting checksum', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      await service.init();

      // Remote provider now provides conflicting manifest with same version 1 but different word
      const conflictingManifest: DictionaryManifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['TRILL'], // Different word
        publishedAt: new Date(currentTime).toISOString(),
        validGuesses: SYNTHETIC_GUESSES,
      });
      provider.manifest = conflictingManifest;

      const conflictResult = await service.sync(true);

      expect(conflictResult.success).toBe(false);
      expect(conflictResult.status).toBe('FAILED');
      expect(conflictResult.error).toContain('Conflicting checksum');
      // Active dictionary state is preserved intact
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE']);
    });
  });

  describe('10. Storage Failure Tolerance', () => {
    it('handles getCachedManifest failure gracefully and continues with bundled answers', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      storage.failOnGet = true; // Simulates QuotaExceeded or Storage corrupted

      const provider = new InMemoryDictionaryManifestProvider(null);
      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      const result = await service.init();

      expect(result.status).toBe('OFFLINE_FALLBACK');
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'SALET', 'SLATE']);
    });

    it('handles setCachedManifest failure gracefully without crashing the solver', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      storage.failOnSet = true; // Simulates localStorage write failure

      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // sync should succeed in memory despite storage write exception
      const result = await service.init();

      expect(result.success).toBe(true);
      expect(result.status).toBe('SYNCED');
      expect(result.dictionaryVersion).toBe(1);
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE']);
    });

    it('handles clearCachedManifest failure gracefully on corrupt cache', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      storage.setCachedManifest({
        manifest: {
          schemaVersion: 1,
          dictionaryVersion: 1,
          publishedAt: 'invalid',
          wordCount: 1,
          words: ['HOLEY'],
          checksum: 'wrong',
        } as unknown as DictionaryManifest,
        cachedAt: currentTime,
        schemaVersion: 1,
      });
      storage.failOnClear = true;

      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // Clear throws, but init() catches and recovers
      const result = await service.init();
      expect(result.success).toBe(true);
      expect(result.status).toBe('SYNCED');
    });
  });

  describe('11. Concurrent Sync Deduplication', () => {
    it('shares a single in-flight Promise among multiple simultaneous sync() calls', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      const storage = new InMemoryDictionaryCacheStorage();

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // Launch 5 concurrent sync requests
      const promises = [
        service.sync(true),
        service.sync(true),
        service.sync(true),
        service.sync(true),
        service.sync(true),
      ];

      const results = await Promise.all(promises);

      // Verify only 1 network fetch occurred
      expect(provider.fetchCount).toBe(1);

      // All 5 callers receive the identical result
      for (const res of results) {
        expect(res.success).toBe(true);
        expect(res.status).toBe('SYNCED');
        expect(res.dictionaryVersion).toBe(1);
        expect(res.activeWords).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE']);
      }
    });
  });

  describe('12. Invariance & Security Boundaries', () => {
    it('never removes or alters bundled answers when merging approved answers', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      const storage = new InMemoryDictionaryCacheStorage();

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      await service.init();

      for (const bundledWord of SYNTHETIC_BUNDLED) {
        expect(service.getActiveAnswers()).toContain(bundledWord);
      }
    });

    it('rejects remote manifest containing unauthorized words not in validGuesses vocabulary', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      // Manifest created without validGuesses check, containing a word 'ZZZZZ' not in SYNTHETIC_GUESSES
      const invalidManifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['ZZZZZ'],
        publishedAt: new Date(currentTime).toISOString(),
      });

      const provider = new InMemoryDictionaryManifestProvider(invalidManifest);
      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      const result = await service.init();

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('not present in allowable valid-guesses list');
      // Active answers remain only the bundled words
      expect(service.getActiveAnswers()).toEqual(['CRANE', 'SALET', 'SLATE']);
    });

    it('UnconfiguredDictionaryManifestProvider behaves safely', async () => {
      const unconfigured = new UnconfiguredDictionaryManifestProvider();
      expect(unconfigured.isConfigured).toBe(false);
      expect(unconfigured.name).toBe('UNCONFIGURED');
      const fetchRes = await unconfigured.fetchManifest();
      expect(fetchRes).toBeNull();
    });

    it('works when validGuesses is omitted (schema validation only)', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);
      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        manifestProvider: provider,
        nowFn,
      });

      const result = await service.init();
      expect(result.success).toBe(true);
      expect(result.activeWords).toContain('HOLEY');
    });

    it('respects a custom ttlMs setting', async () => {
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV2);
      const storage = new InMemoryDictionaryCacheStorage();
      storage.setCachedManifest({
        manifest: sampleManifestV1,
        cachedAt: currentTime,
        schemaVersion: 1,
      });
      storage.setLastSyncTime(currentTime);

      const oneHourMs = 3600 * 1000;
      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        ttlMs: oneHourMs,
        nowFn,
      });

      // 30 mins later: still fresh
      currentTime += 30 * 60 * 1000;
      const res1 = await service.init();
      expect(res1.status).toBe('CACHE_HIT');
      expect(provider.fetchCount).toBe(0);

      // 70 mins later: expired under custom 1h TTL
      currentTime += 40 * 60 * 1000;
      const res2 = await service.init();
      expect(res2.status).toBe('SYNCED');
      expect(provider.fetchCount).toBe(1);
    });

    it('shares in-flight promise even when network sync fails', async () => {
      const provider = new InMemoryDictionaryManifestProvider(null);
      provider.shouldFail = true;
      provider.failureError = new Error('DNS resolution failure');

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        manifestProvider: provider,
        nowFn,
      });

      const [res1, res2] = await Promise.all([
        service.sync(true),
        service.sync(true),
      ]);

      expect(provider.fetchCount).toBe(1);
      expect(res1.status).toBe('OFFLINE_FALLBACK');
      expect(res2.status).toBe('OFFLINE_FALLBACK');
      expect(res1.error).toBe(res2.error);
    });

    it('falls through gracefully to network sync if storage.getLastSyncTime throws in sync()', async () => {
      const storage = new InMemoryDictionaryCacheStorage();
      const provider = new InMemoryDictionaryManifestProvider(sampleManifestV1);

      const service = new DictionarySyncService({
        bundledAnswers: SYNTHETIC_BUNDLED,
        validGuesses: SYNTHETIC_GUESSES,
        manifestProvider: provider,
        cacheStorage: storage,
        nowFn,
      });

      // Make storage throw on read
      storage.failOnGet = true;

      const result = await service.sync(false);
      // Because storage read failed, isFresh evaluates to false, and it contacts remote provider
      expect(result.success).toBe(true);
      expect(result.status).toBe('SYNCED');
      expect(provider.fetchCount).toBe(1);
    });
  });
});
