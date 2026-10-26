/**
 * @wordle-solver/solver — Trusted Dictionary Manifest and Merge Logic
 *
 * Implements Stage 9D.1:
 * 1. Typed, versioned dictionary manifest contract.
 * 2. Deterministic canonical serialization and pure TypeScript SHA-256 checksum integrity verification.
 * 3. Strict schema, lexical, and vocabulary validation for published manifests.
 * 4. Pure, immutable merge logic combining bundled answers with approved additions.
 *
 * Trust Boundary Invariants:
 * - Integrity vs. Authenticity: A SHA-256 checksum verifies data integrity (tamper detection),
 *   NOT publisher identity. Remote publisher authenticity is governed at the transport/IAM boundary.
 * - Non-Inference: Client discovery or presence in valid-guesses.txt never establishes official status.
 *   Only explicit, human-reviewed administrative decisions are eligible for manifest publication.
 * - Defense-in-Depth: Even if a remote manifest is compromised, clients validate that every approved
 *   word exists within the bundled allowable valid-guesses list (12,972 words) before merging.
 * - Fault Tolerance: If a manifest is missing, malformed, or corrupt, the solver operates 100% locally
 *   using bundled answers.txt with zero disruption.
 */

import { isValidWord } from './feedback';
import { normalizeContributionWord } from './contribution';
import { isValidRfc3339Timestamp } from './review';
import {
  CURRENT_MANIFEST_SCHEMA_VERSION,
  CanonicalManifestPayload,
  DictionaryManifest,
  ManifestValidationResult,
  CreateManifestParams,
  MergeActiveAnswersParams,
} from './types';

/**
 * 32-bit right-rotation helper for SHA-256 bitwise compression.
 */
function rotr(n: number, b: number): number {
  return (n >>> b) | (n << (32 - b));
}

/**
 * Pure, zero-dependency, platform-agnostic TypeScript SHA-256 implementation.
 *
 * Adheres strictly to FIPS PUB 180-4 standard test vectors.
 * Operates synchronously with zero DOM or Node.js runtime couplings,
 * ensuring identical execution across Node.js, Web Workers, and Chrome Extension service workers.
 *
 * @param str Input string (UTF-8 encoded)
 * @returns 64-character lowercase hexadecimal hash digest
 */
export function sha256(str: string): string {
  // UTF-8 encode using standard browser/universal URI encoding
  const utf8 = unescape(encodeURIComponent(str));
  const bytes: number[] = [];
  for (let i = 0; i < utf8.length; i++) {
    bytes.push(utf8.charCodeAt(i));
  }

  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }

  // 64-bit length (big-endian): upper 32 bits, then lower 32 bits
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  bytes.push((highBits >>> 24) & 0xff);
  bytes.push((highBits >>> 16) & 0xff);
  bytes.push((highBits >>> 8) & 0xff);
  bytes.push(highBits & 0xff);
  bytes.push((lowBits >>> 24) & 0xff);
  bytes.push((lowBits >>> 16) & 0xff);
  bytes.push((lowBits >>> 8) & 0xff);
  bytes.push(lowBits & 0xff);

  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(
      ((bytes[i] ?? 0) << 24) |
      ((bytes[i + 1] ?? 0) << 16) |
      ((bytes[i + 2] ?? 0) << 8) |
      (bytes[i + 3] ?? 0)
    );
  }

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Int32Array(64);

  for (let j = 0; j < words.length; j += 16) {
    for (let i = 0; i < 16; i++) {
      w[i] = words[j + i] ?? 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + s1 + ch + k[i]! + w[i]!) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  function hex(n: number): string {
    return (n >>> 0).toString(16).padStart(8, '0');
  }

  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

/**
 * Serializes the canonical manifest payload into a deterministic compact JSON string.
 *
 * Rules for canonicalization:
 * 1. Properties are sorted alphabetically: 'dictionaryVersion', 'publishedAt', 'schemaVersion', 'words'.
 * 2. Words are trimmed, converted to uppercase ASCII, deduplicated, and sorted in ascending ASCII order.
 * 3. Zero incidental whitespace, indentation, or trailing commas.
 *
 * @param payload Object containing canonical payload fields
 * @returns Deterministic compact JSON string
 */
export function canonicalizeManifestPayload(payload: {
  readonly schemaVersion: number;
  readonly dictionaryVersion: number;
  readonly publishedAt: string;
  readonly words: readonly string[];
}): string {
  const normalizedWords = Array.from(
    new Set(payload.words.map((w) => normalizeContributionWord(w)))
  ).sort();

  const canonicalObj = {
    dictionaryVersion: payload.dictionaryVersion,
    publishedAt: payload.publishedAt,
    schemaVersion: payload.schemaVersion,
    words: normalizedWords,
  };

  return JSON.stringify(canonicalObj);
}

/**
 * Computes the SHA-256 hexadecimal digest over the canonical manifest payload.
 *
 * @param payload Canonical payload fields
 * @returns 64-character lowercase hexadecimal hash
 */
export function computeManifestChecksum(payload: {
  readonly schemaVersion: number;
  readonly dictionaryVersion: number;
  readonly publishedAt: string;
  readonly words: readonly string[];
}): string {
  return sha256(canonicalizeManifestPayload(payload));
}

/**
 * Creates a validated, deterministic, frozen DictionaryManifest document.
 *
 * @param params Manifest creation parameters
 * @returns Frozen DictionaryManifest
 * @throws {Error} If parameters fail structural or vocabulary validation
 */
export function createDictionaryManifest(params: CreateManifestParams): DictionaryManifest {
  const schemaVersion = params.schemaVersion ?? CURRENT_MANIFEST_SCHEMA_VERSION;
  if (!Number.isInteger(schemaVersion) || schemaVersion !== CURRENT_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema version ${schemaVersion}: expected ${CURRENT_MANIFEST_SCHEMA_VERSION}.`
    );
  }

  if (!Number.isInteger(params.dictionaryVersion) || params.dictionaryVersion < 1) {
    throw new Error(
      `Dictionary version must be a positive integer (received ${params.dictionaryVersion}).`
    );
  }

  const publishedAt = params.publishedAt ?? new Date().toISOString();
  if (!isValidRfc3339Timestamp(publishedAt)) {
    throw new Error(
      `Publication timestamp '${publishedAt}' is not a valid RFC 3339 UTC timestamp.`
    );
  }

  if (!Array.isArray(params.words)) {
    throw new Error('Manifest words must be an array.');
  }

  const normalizedWords: string[] = [];
  const seen = new Set<string>();

  for (const rawWord of params.words) {
    const word = normalizeContributionWord(rawWord);
    if (!isValidWord(word)) {
      throw new Error(
        `Invalid approved word '${rawWord}': must be exactly 5 uppercase alphabetic characters.`
      );
    }
    if (params.validGuesses && !params.validGuesses.includes(word)) {
      throw new Error(
        `Approved word '${word}' is not present in allowable valid-guesses dictionary.`
      );
    }
    if (!seen.has(word)) {
      seen.add(word);
      normalizedWords.push(word);
    }
  }

  // Canonical ASCII sort
  normalizedWords.sort();

  const canonicalPayload: CanonicalManifestPayload = {
    schemaVersion,
    dictionaryVersion: params.dictionaryVersion,
    publishedAt,
    words: Object.freeze(normalizedWords),
  };

  const checksum = computeManifestChecksum(canonicalPayload);

  const manifest: DictionaryManifest = {
    schemaVersion,
    dictionaryVersion: params.dictionaryVersion,
    publishedAt,
    wordCount: normalizedWords.length,
    words: canonicalPayload.words,
    checksumAlgorithm: 'sha256',
    checksum,
    publisher: params.publisher,
    releaseNotes: params.releaseNotes,
  };

  return Object.freeze(manifest);
}

/**
 * Strictly validates an untrusted dictionary manifest object against Stage 9D specifications.
 *
 * Validation checks:
 * 1. Payload must be a non-null object with no array shape.
 * 2. schemaVersion must be an integer matching CURRENT_MANIFEST_SCHEMA_VERSION.
 * 3. dictionaryVersion must be a positive integer >= 1.
 * 4. publishedAt must be a valid RFC 3339 UTC timestamp.
 * 5. checksumAlgorithm must equal 'sha256'.
 * 6. checksum must be a 64-character lowercase hexadecimal string.
 * 7. words must be an array of valid 5-letter uppercase ASCII strings with no duplicates.
 * 8. words must be sorted lexicographically in ascending ASCII order.
 * 9. If allowable validGuesses dictionary is provided, all approved words must exist in it.
 * 10. wordCount must equal words.length.
 * 11. Recomputed SHA-256 over canonical payload must match manifest.checksum.
 *
 * @param data Untrusted manifest object from remote network or storage
 * @param validGuesses Optional allowable guess dictionary for defense-in-depth verification
 * @returns ManifestValidationResult with status and frozen typed manifest on success
 */
export function validateManifest(
  data: unknown,
  validGuesses?: readonly string[]
): ManifestValidationResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      valid: false,
      error: 'Manifest payload must be a non-null object.',
    };
  }

  const raw = data as Record<string, unknown>;

  // 1. Schema version check
  if (typeof raw['schemaVersion'] !== 'number' || !Number.isInteger(raw['schemaVersion'])) {
    return {
      valid: false,
      error: 'Manifest schemaVersion must be an integer.',
    };
  }
  if (raw['schemaVersion'] !== CURRENT_MANIFEST_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `Unsupported manifest schemaVersion ${raw['schemaVersion']}: expected ${CURRENT_MANIFEST_SCHEMA_VERSION}.`,
    };
  }

  // 2. Dictionary version check
  if (
    typeof raw['dictionaryVersion'] !== 'number' ||
    !Number.isInteger(raw['dictionaryVersion']) ||
    raw['dictionaryVersion'] < 1
  ) {
    return {
      valid: false,
      error: `Manifest dictionaryVersion must be a positive integer >= 1 (received ${raw['dictionaryVersion']}).`,
    };
  }

  // 3. Publication timestamp check
  if (
    typeof raw['publishedAt'] !== 'string' ||
    !isValidRfc3339Timestamp(raw['publishedAt'])
  ) {
    return {
      valid: false,
      error: `Manifest publishedAt '${raw['publishedAt']}' is not a valid RFC 3339 UTC timestamp.`,
    };
  }

  // 4. Checksum algorithm check
  if (raw['checksumAlgorithm'] !== 'sha256') {
    return {
      valid: false,
      error: `Unsupported checksumAlgorithm '${raw['checksumAlgorithm']}': expected 'sha256'.`,
    };
  }

  // 5. Checksum format check
  if (
    typeof raw['checksum'] !== 'string' ||
    !/^[0-9a-f]{64}$/.test(raw['checksum'])
  ) {
    return {
      valid: false,
      error: 'Manifest checksum must be a 64-character lowercase hexadecimal string.',
    };
  }

  // 6. Words array check
  if (!Array.isArray(raw['words'])) {
    return {
      valid: false,
      error: 'Manifest words must be an array of strings.',
    };
  }

  const words = raw['words'] as unknown[];
  const validatedWords: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < words.length; i++) {
    const item = words[i];
    if (typeof item !== 'string' || !/^[A-Z]{5}$/.test(item)) {
      return {
        valid: false,
        error: `Manifest word at index ${i} ('${item}') is invalid: must be exactly 5 uppercase ASCII letters.`,
      };
    }

    if (seen.has(item)) {
      return {
        valid: false,
        error: `Manifest contains duplicate word '${item}' at index ${i}.`,
      };
    }
    seen.add(item);

    // Assert lexicographical ordering
    if (i > 0) {
      const prev = validatedWords[i - 1]!;
      if (item < prev) {
        return {
          valid: false,
          error: `Manifest words must be sorted in ascending ASCII order ('${item}' found after '${prev}').`,
        };
      }
    }

    // Vocabulary containment defense-in-depth check
    if (validGuesses && !validGuesses.includes(item)) {
      return {
        valid: false,
        error: `Manifest word '${item}' is not present in allowable valid-guesses list.`,
      };
    }

    validatedWords.push(item);
  }

  // 7. Word count check
  if (
    typeof raw['wordCount'] !== 'number' ||
    !Number.isInteger(raw['wordCount']) ||
    raw['wordCount'] !== validatedWords.length
  ) {
    return {
      valid: false,
      error: `Manifest wordCount (${raw['wordCount']}) does not match words array length (${validatedWords.length}).`,
    };
  }

  // 8. Recomputed checksum verification
  const computedChecksum = computeManifestChecksum({
    schemaVersion: raw['schemaVersion'],
    dictionaryVersion: raw['dictionaryVersion'],
    publishedAt: raw['publishedAt'],
    words: validatedWords,
  });

  if (computedChecksum !== raw['checksum']) {
    return {
      valid: false,
      error: `Manifest checksum mismatch: expected '${raw['checksum']}', computed '${computedChecksum}'.`,
    };
  }

  const manifest: DictionaryManifest = {
    schemaVersion: raw['schemaVersion'],
    dictionaryVersion: raw['dictionaryVersion'],
    publishedAt: raw['publishedAt'],
    wordCount: validatedWords.length,
    words: Object.freeze(validatedWords),
    checksumAlgorithm: 'sha256',
    checksum: raw['checksum'],
    publisher: typeof raw['publisher'] === 'string' ? raw['publisher'] : undefined,
    releaseNotes: typeof raw['releaseNotes'] === 'string' ? raw['releaseNotes'] : undefined,
  };

  return {
    valid: true,
    manifest: Object.freeze(manifest),
  };
}

/**
 * Pure function combining bundled curated answers with a validated list of approved additions.
 *
 * Invariants:
 * 1. Immutability: Neither bundledAnswers nor approvedAnswers is mutated.
 * 2. Determinism: Output is deduplicated and deterministically sorted in ascending ASCII order.
 * 3. Base Preservation: All valid bundled answers are guaranteed to remain in the returned pool.
 * 4. Boundary Protection: Approved words must be 5-letter uppercase ASCII. If allowable validGuesses
 *    is provided, approved words must also exist within validGuesses. Arbitrary or malformed
 *    words are strictly rejected and dropped.
 * 5. Offline Fallback: If approvedAnswers is empty, undefined, or missing, the bundled answers
 *    are returned with zero degradation.
 *
 * @param params Bundled answers, approved additions, and allowable guesses
 * @returns Frozen array of active primary answer candidates
 */
export function mergeActiveAnswers(params: MergeActiveAnswersParams): readonly string[];
export function mergeActiveAnswers(
  bundledAnswers: readonly string[],
  approvedAnswers?: readonly string[],
  validGuesses?: readonly string[]
): readonly string[];
export function mergeActiveAnswers(
  paramsOrBundled: MergeActiveAnswersParams | readonly string[],
  approvedAnswersArg?: readonly string[],
  validGuessesArg?: readonly string[]
): readonly string[] {
  let bundled: readonly string[];
  let approved: readonly string[] | undefined;
  let guesses: readonly string[] | undefined;

  if (Array.isArray(paramsOrBundled)) {
    bundled = paramsOrBundled;
    approved = approvedAnswersArg;
    guesses = validGuessesArg;
  } else if (
    typeof paramsOrBundled === 'object' &&
    paramsOrBundled !== null &&
    'bundledAnswers' in paramsOrBundled
  ) {
    const params = paramsOrBundled as MergeActiveAnswersParams;
    bundled = params.bundledAnswers;
    approved = params.approvedAnswers;
    guesses = params.validGuesses;
  } else {
    throw new TypeError('bundledAnswers must be an array of strings or MergeActiveAnswersParams.');
  }

  if (!Array.isArray(bundled)) {
    throw new TypeError('bundledAnswers must be an array of strings.');
  }

  const set = new Set<string>();

  // Add all valid bundled answers
  for (const raw of bundled) {
    const word = normalizeContributionWord(raw);
    if (isValidWord(word)) {
      set.add(word);
    }
  }

  // Add approved additions with strict validation
  if (Array.isArray(approved) && approved.length > 0) {
    for (const raw of approved) {
      const word = normalizeContributionWord(raw);
      if (!isValidWord(word)) {
        continue; // Reject malformed words
      }
      if (guesses && !guesses.includes(word)) {
        continue; // Reject words not present in valid-guesses
      }
      set.add(word);
    }
  }

  return Object.freeze(Array.from(set).sort());
}
