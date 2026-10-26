import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import {
  CURRENT_MANIFEST_SCHEMA_VERSION,
  sha256,
  canonicalizeManifestPayload,
  computeManifestChecksum,
  createDictionaryManifest,
  validateManifest,
  mergeActiveAnswers,
} from '@wordle-solver/solver';

describe('Stage 9D.1 — Trusted Dictionary Manifest and Merge Logic', () => {
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

  describe('1. Pure TypeScript SHA-256 Implementation & Test Vectors', () => {
    it('Matches standard FIPS 180-4 SHA-256 test vectors and Node.js crypto', () => {
      const testCases = [
        '',
        'abc',
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        'The quick brown fox jumps over the lazy dog',
        'HOLEY,TRILL,PSHAW',
        JSON.stringify({
          dictionaryVersion: 1,
          publishedAt: '2026-10-26T14:00:00.000Z',
          schemaVersion: 1,
          words: ['HOLEY', 'TRILL'],
        }),
      ];

      for (const input of testCases) {
        const expected = crypto.createHash('sha256').update(input, 'utf8').digest('hex');
        const actual = sha256(input);
        expect(actual).toBe(expected);
      }
    });

    it('Generates 64-character lowercase hexadecimal hash strings', () => {
      const hash = sha256('WORDLE');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('2. Canonical Serialization & Checksum Computation', () => {
    it('Produces deterministic compact JSON output regardless of input property order', () => {
      const payloadA = {
        schemaVersion: 1,
        dictionaryVersion: 2,
        publishedAt: '2026-10-26T14:00:00.000Z',
        words: ['TRILL', 'HOLEY'],
      };

      const payloadB = {
        publishedAt: '2026-10-26T14:00:00.000Z',
        words: ['HOLEY', 'TRILL'],
        dictionaryVersion: 2,
        schemaVersion: 1,
      };

      const canonicalA = canonicalizeManifestPayload(payloadA);
      const canonicalB = canonicalizeManifestPayload(payloadB);

      expect(canonicalA).toBe(canonicalB);
      expect(canonicalA).toBe(
        '{"dictionaryVersion":2,"publishedAt":"2026-10-26T14:00:00.000Z","schemaVersion":1,"words":["HOLEY","TRILL"]}'
      );
    });

    it('Sorts words lexicographically and normalizes casing/whitespace during canonicalization', () => {
      const payload = {
        schemaVersion: 1,
        dictionaryVersion: 1,
        publishedAt: '2026-10-26T14:00:00.000Z',
        words: ['  trill  ', 'HOLEY', 'GUANO'],
      };

      const canonical = canonicalizeManifestPayload(payload);
      expect(canonical).toBe(
        '{"dictionaryVersion":1,"publishedAt":"2026-10-26T14:00:00.000Z","schemaVersion":1,"words":["GUANO","HOLEY","TRILL"]}'
      );
    });

    it('Deduplicates words in canonical serialization', () => {
      const payload = {
        schemaVersion: 1,
        dictionaryVersion: 1,
        publishedAt: '2026-10-26T14:00:00.000Z',
        words: ['HOLEY', 'holey', 'HOLEY'],
      };

      const canonical = canonicalizeManifestPayload(payload);
      expect(canonical).toBe(
        '{"dictionaryVersion":1,"publishedAt":"2026-10-26T14:00:00.000Z","schemaVersion":1,"words":["HOLEY"]}'
      );
    });

    it('Produces matching checksums for payloads differing only in property order or word order', () => {
      const checksum1 = computeManifestChecksum({
        schemaVersion: 1,
        dictionaryVersion: 3,
        publishedAt: '2026-10-26T12:00:00.000Z',
        words: ['TRILL', 'HOLEY', 'PSHAW'],
      });

      const checksum2 = computeManifestChecksum({
        words: ['PSHAW', 'HOLEY', 'TRILL'],
        publishedAt: '2026-10-26T12:00:00.000Z',
        dictionaryVersion: 3,
        schemaVersion: 1,
      });

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('3. Manifest Creation (createDictionaryManifest)', () => {
    it('Creates a valid, frozen DictionaryManifest with correct metadata and checksum', () => {
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        publishedAt: '2026-10-26T14:00:00.000Z',
        words: ['HOLEY', 'TRILL'],
        publisher: 'admin_audit_id',
        releaseNotes: 'Added HOLEY and TRILL after NYT editorial verification.',
        validGuesses: SYNTHETIC_GUESSES,
      });

      expect(manifest.schemaVersion).toBe(CURRENT_MANIFEST_SCHEMA_VERSION);
      expect(manifest.dictionaryVersion).toBe(1);
      expect(manifest.publishedAt).toBe('2026-10-26T14:00:00.000Z');
      expect(manifest.wordCount).toBe(2);
      expect(manifest.words).toEqual(['HOLEY', 'TRILL']);
      expect(manifest.checksumAlgorithm).toBe('sha256');
      expect(manifest.publisher).toBe('admin_audit_id');
      expect(manifest.releaseNotes).toContain('Added HOLEY and TRILL');
      expect(manifest.checksum).toHaveLength(64);
      expect(Object.isFrozen(manifest)).toBe(true);
      expect(Object.isFrozen(manifest.words)).toBe(true);
    });

    it('Rejects manifest creation if a candidate is not present in allowable validGuesses', () => {
      expect(() =>
        createDictionaryManifest({
          dictionaryVersion: 1,
          words: ['HOLEY', 'ZZZZZ'],
          validGuesses: SYNTHETIC_GUESSES,
        })
      ).toThrow(/not present in allowable valid-guesses dictionary/);
    });

    it('Rejects manifest creation for invalid word lengths or characters', () => {
      expect(() =>
        createDictionaryManifest({
          dictionaryVersion: 1,
          words: ['HOL', 'TRILL'],
        })
      ).toThrow(/must be exactly 5 uppercase alphabetic characters/);

      expect(() =>
        createDictionaryManifest({
          dictionaryVersion: 1,
          words: ['HOL3Y'],
        })
      ).toThrow(/must be exactly 5 uppercase alphabetic characters/);
    });

    it('Rejects invalid dictionary versions or unsupported schema versions', () => {
      expect(() =>
        createDictionaryManifest({
          dictionaryVersion: 0,
          words: ['HOLEY'],
        })
      ).toThrow(/Dictionary version must be a positive integer/);

      expect(() =>
        createDictionaryManifest({
          dictionaryVersion: 1,
          schemaVersion: 99,
          words: ['HOLEY'],
        })
      ).toThrow(/Unsupported schema version 99/);
    });
  });

  describe('4. Manifest Validation (validateManifest)', () => {
    it('Accepts a well-formed, authentic DictionaryManifest', () => {
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        publishedAt: '2026-10-26T14:00:00.000Z',
        words: ['HOLEY', 'TRILL'],
        validGuesses: SYNTHETIC_GUESSES,
      });

      const result = validateManifest(manifest, SYNTHETIC_GUESSES);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.manifest).toBeDefined();
      expect(result.manifest?.words).toEqual(['HOLEY', 'TRILL']);
    });

    it('Rejects non-object or null payloads', () => {
      expect(validateManifest(null).valid).toBe(false);
      expect(validateManifest('string').valid).toBe(false);
      expect(validateManifest([]).valid).toBe(false);
      expect(validateManifest(undefined).valid).toBe(false);
    });

    it('Rejects unsupported schema versions', () => {
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['HOLEY'],
      });

      const badSchema = { ...manifest, schemaVersion: 2 };
      const res = validateManifest(badSchema);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Unsupported manifest schemaVersion 2');
    });

    it('Rejects invalid dictionary versions (< 1 or non-integer)', () => {
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['HOLEY'],
      });

      const badVersion = { ...manifest, dictionaryVersion: -5 };
      expect(validateManifest(badVersion).valid).toBe(false);

      const floatVersion = { ...manifest, dictionaryVersion: 1.5 };
      expect(validateManifest(floatVersion).valid).toBe(false);
    });

    it('Rejects invalid publishedAt timestamp formats', () => {
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['HOLEY'],
      });

      const badDate = { ...manifest, publishedAt: 'October 26, 2026' };
      const res = validateManifest(badDate);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('not a valid RFC 3339 UTC timestamp');
    });

    it('Rejects unsupported checksum algorithm', () => {
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['HOLEY'],
      });

      const badAlgo = { ...manifest, checksumAlgorithm: 'md5' };
      const res = validateManifest(badAlgo);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Unsupported checksumAlgorithm 'md5'");
    });

    it('Rejects malformed checksum string format', () => {
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['HOLEY'],
      });

      const badChecksum = { ...manifest, checksum: 'not_a_valid_hex_hash' };
      const res = validateManifest(badChecksum);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('64-character lowercase hexadecimal string');
    });

    it('Detects tampered words array via SHA-256 checksum mismatch', () => {
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['HOLEY', 'TRILL'],
      });

      // Tamper: replace TRILL with PSHAW without updating checksum
      const tampered = {
        ...manifest,
        words: ['HOLEY', 'PSHAW'],
      };

      const res = validateManifest(tampered);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Manifest checksum mismatch');
    });

    it('Rejects manifest containing duplicate words', () => {
      const payload = {
        schemaVersion: 1,
        dictionaryVersion: 1,
        publishedAt: '2026-10-26T14:00:00.000Z',
        wordCount: 2,
        words: ['HOLEY', 'HOLEY'],
        checksumAlgorithm: 'sha256',
        checksum: '0'.repeat(64),
      };

      const res = validateManifest(payload);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Manifest contains duplicate word 'HOLEY'");
    });

    it('Rejects unsorted words array', () => {
      const payload = {
        schemaVersion: 1,
        dictionaryVersion: 1,
        publishedAt: '2026-10-26T14:00:00.000Z',
        wordCount: 2,
        words: ['TRILL', 'HOLEY'], // Unsorted: T comes after H
        checksumAlgorithm: 'sha256',
        checksum: '0'.repeat(64),
      };

      const res = validateManifest(payload);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Manifest words must be sorted in ascending ASCII order');
    });

    it('Rejects manifest containing words absent from allowable validGuesses', () => {
      // Create manifest with a word not in SYNTHETIC_GUESSES
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['HOLEY', 'ZZZZZ'],
      });

      const res = validateManifest(manifest, SYNTHETIC_GUESSES);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Manifest word 'ZZZZZ' is not present in allowable valid-guesses list");
    });

    it('Rejects manifest where wordCount does not match words.length', () => {
      const manifest = createDictionaryManifest({
        dictionaryVersion: 1,
        words: ['HOLEY', 'TRILL'],
      });

      const badCount = { ...manifest, wordCount: 99 };
      const res = validateManifest(badCount);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Manifest wordCount (99) does not match words array length (2)');
    });
  });

  describe('5. Pure Trusted-Answer Merge (mergeActiveAnswers)', () => {
    it('Preserves all bundled answers and deterministically combines approved additions', () => {
      const active = mergeActiveAnswers({
        bundledAnswers: SYNTHETIC_BUNDLED,
        approvedAnswers: ['HOLEY', 'TRILL'],
        validGuesses: SYNTHETIC_GUESSES,
      });

      expect(active).toEqual(['CRANE', 'HOLEY', 'SALET', 'SLATE', 'TRILL']);
      // All bundled answers exist
      expect(active).toContain('CRANE');
      expect(active).toContain('SLATE');
      expect(active).toContain('SALET');
      // Approved additions exist
      expect(active).toContain('HOLEY');
      expect(active).toContain('TRILL');
      expect(Object.isFrozen(active)).toBe(true);
    });

    it('Supports positional parameter overload cleanly', () => {
      const active = mergeActiveAnswers(
        SYNTHETIC_BUNDLED,
        ['PSHAW'],
        SYNTHETIC_GUESSES
      );

      expect(active).toEqual(['CRANE', 'PSHAW', 'SALET', 'SLATE']);
    });

    it('Returns bundled answers unchanged when approvedAnswers is empty or missing', () => {
      const activeEmpty = mergeActiveAnswers({
        bundledAnswers: SYNTHETIC_BUNDLED,
        approvedAnswers: [],
        validGuesses: SYNTHETIC_GUESSES,
      });
      expect(activeEmpty).toEqual(['CRANE', 'SALET', 'SLATE']);

      const activeUndefined = mergeActiveAnswers({
        bundledAnswers: SYNTHETIC_BUNDLED,
      });
      expect(activeUndefined).toEqual(['CRANE', 'SALET', 'SLATE']);
    });

    it('Never mutates input arrays', () => {
      const bundledCopy = ['CRANE', 'SLATE', 'SALET'];
      const approvedCopy = ['HOLEY', 'TRILL'];

      mergeActiveAnswers({
        bundledAnswers: bundledCopy,
        approvedAnswers: approvedCopy,
        validGuesses: SYNTHETIC_GUESSES,
      });

      expect(bundledCopy).toEqual(['CRANE', 'SLATE', 'SALET']);
      expect(approvedCopy).toEqual(['HOLEY', 'TRILL']);
    });

    it('Deduplicates if an approved word is already present in bundled answers', () => {
      const active = mergeActiveAnswers({
        bundledAnswers: ['CRANE', 'SLATE'],
        approvedAnswers: ['CRANE', 'HOLEY'],
        validGuesses: SYNTHETIC_GUESSES,
      });

      expect(active).toEqual(['CRANE', 'HOLEY', 'SLATE']);
      expect(active.filter((w) => w === 'CRANE')).toHaveLength(1);
    });

    it('Drops malformed or non-5-letter words without throwing', () => {
      const active = mergeActiveAnswers({
        bundledAnswers: SYNTHETIC_BUNDLED,
        approvedAnswers: ['HOLEY', 'TOOLONGWORD', '12345', 'ABC'],
        validGuesses: SYNTHETIC_GUESSES,
      });

      expect(active).toContain('HOLEY');
      expect(active).not.toContain('TOOLONGWORD');
      expect(active).not.toContain('12345');
      expect(active).not.toContain('ABC');
    });

    it('Drops approved words that are not in validGuesses when validGuesses is supplied', () => {
      const active = mergeActiveAnswers({
        bundledAnswers: SYNTHETIC_BUNDLED,
        approvedAnswers: ['HOLEY', 'ZZZZZ'], // ZZZZZ is not in SYNTHETIC_GUESSES
        validGuesses: SYNTHETIC_GUESSES,
      });

      expect(active).toContain('HOLEY');
      expect(active).not.toContain('ZZZZZ');
    });

    it('Throws TypeError if bundledAnswers is not an array', () => {
      expect(() =>
        mergeActiveAnswers({
          bundledAnswers: null as any,
        })
      ).toThrow(TypeError);
    });
  });

  describe('6. Solver Integration Invariance & Proved-Win Demonstration', () => {
    it('Allows newly approved words to be targeted in solver primary pool', () => {
      // Base pool missing HOLEY
      expect(SYNTHETIC_BUNDLED).not.toContain('HOLEY');

      // Merged pool includes HOLEY
      const active = mergeActiveAnswers({
        bundledAnswers: SYNTHETIC_BUNDLED,
        approvedAnswers: ['HOLEY'],
        validGuesses: SYNTHETIC_GUESSES,
      });

      expect(active).toContain('HOLEY');
      expect(active.length).toBe(SYNTHETIC_BUNDLED.length + 1);
    });
  });
});
