#!/usr/bin/env node
/**
 * Wordle Solver — Stage 9C Administrator Review CLI
 *
 * Safe local administrative tool for reviewing quarantined missing-answer contributions.
 *
 * Security & Spark Plan Invariants:
 * - NEVER embedded into client-side bundles (web app or Chrome extension).
 * - Requires local environment credentials (FIREBASE_PROJECT_ID, FIREBASE_ADMIN_TOKEN).
 * - Supports an offline --demo mode using InMemoryAdminReviewProvider for local testing without cloud resources.
 * - Under Firebase Spark, administrators can alternatively perform review directly in the Firebase Console:
 *   https://console.firebase.google.com/
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AdminReviewService,
  InMemoryAdminReviewProvider,
  FirestoreRestAdminReviewProvider,
  ReviewEvidence,
} from '../packages/solver/src/index';

const guessesPath = path.resolve(__dirname, '../data/valid-guesses.txt');
const ALL_VALID_GUESSES: string[] = fs.existsSync(guessesPath)
  ? fs
      .readFileSync(guessesPath, 'utf-8')
      .trim()
      .split(/\r?\n/)
      .map((w) => w.trim().toUpperCase())
      .filter(Boolean)
  : [];

function printUsage(): void {
  console.log(`
Wordle Solver — Admin Review CLI (Stage 9C)
Usage:
  npx tsx scripts/admin-review.ts [options] <command> [arguments]

Commands:
  list                                           List pending candidate contributions
  inspect <WORD>                                 Inspect pending report and review history
  verify <WORD> --source <URL> [options]         Independently verify an official NYT answer
  reject <WORD> --reason <REASON> [options]      Reject a candidate with administrative justification

Verification Options:
  --source <URL>        Authoritative proof reference (mandatory for verify)
  --puzzle <NUMBER>     Official NYT Wordle puzzle index (e.g. 1588)
  --date <YYYY-MM-DD>   Official puzzle publication date
  --notes <NOTE>        Concise editorial notes
  --reviewer <ID>       Reviewer identity (default: admin-cli or $USER)

General Options:
  --demo                Run in-memory demo mode with simulated pending contributions
  --project <ID>        Firebase project ID (or set FIREBASE_PROJECT_ID)
  --token <BEARER>      Admin OAuth2 bearer token (DEPRECATED & INSECURE; leaks in process listings / shell history; use FIREBASE_ADMIN_TOKEN env variable)
  --help                Show this help message
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const isDemo = args.includes('--demo');
  const projectIndex = args.indexOf('--project');
  const projectId =
    projectIndex !== -1 ? args[projectIndex + 1] : process.env.FIREBASE_PROJECT_ID;
  const tokenIndex = args.indexOf('--token');
  const adminToken =
    tokenIndex !== -1 ? args[tokenIndex + 1] : process.env.FIREBASE_ADMIN_TOKEN;

  if (tokenIndex !== -1) {
    console.warn(
      '[SECURITY WARNING] The --token flag is DEPRECATED and INSECURE because command-line arguments are visible in system process tables (ps aux / WMI) and shell history files. Please use the FIREBASE_ADMIN_TOKEN environment variable instead.'
    );
  }

  let service: AdminReviewService;

  if (isDemo) {
    const memoryProvider = new InMemoryAdminReviewProvider();
    memoryProvider.seedPending([
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
    ]);
    service = new AdminReviewService(memoryProvider, ALL_VALID_GUESSES);
    console.log('[Mode: Demo In-Memory] Seeded with 2 demo pending contributions (HOLEY, TRILL).');
  } else {
    if (!projectId || !adminToken) {
      console.error(`
[Error: Unconfigured Admin Credentials]
Firebase project ID or admin bearer token not supplied.
To run authenticated admin review:
  export FIREBASE_PROJECT_ID="your-project-id"
  export FIREBASE_ADMIN_TOKEN="$(gcloud auth print-access-token)"
  npx tsx scripts/admin-review.ts list

Or run the offline dry-run demonstration without credentials:
  npx tsx scripts/admin-review.ts --demo list

Or perform manual review directly via the Firebase Console:
  https://console.firebase.google.com/
`);
      process.exit(1);
    }

    const provider = new FirestoreRestAdminReviewProvider({
      projectId,
      adminBearerToken: adminToken,
    });
    service = new AdminReviewService(provider, ALL_VALID_GUESSES);
  }

  const nonFlagArgs = args.filter((arg, i) => {
    if (arg.startsWith('--')) return false;
    const prev = args[i - 1];
    if (
      prev === '--project' ||
      prev === '--token' ||
      prev === '--source' ||
      prev === '--puzzle' ||
      prev === '--date' ||
      prev === '--notes' ||
      prev === '--reason' ||
      prev === '--reviewer'
    ) {
      return false;
    }
    return true;
  });

  const command = nonFlagArgs[0]?.toLowerCase();

  const getFlagValue = (flagName: string): string | undefined => {
    const idx = args.indexOf(flagName);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const reviewerId =
    getFlagValue('--reviewer') ?? process.env.USER ?? process.env.USERNAME ?? 'admin-cli';

  switch (command) {
    case 'list': {
      try {
        const pending = await service.listPending();
        console.log(`\nFound ${pending.length} pending candidate contribution(s):`);
        for (const item of pending) {
          console.log(
            ` - ${item.word.padEnd(7)} [${item.clientPlatform.padEnd(9)}] turns: ${
              item.solveTurns
            }, reported: ${item.clientTimestamp}`
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n[Failed to list pending contributions] ${msg}`);
        process.exit(1);
      }
      break;
    }

    case 'inspect': {
      const word = nonFlagArgs[1];
      if (!word) {
        console.error('Error: Candidate word required. Example: inspect HOLEY');
        process.exit(1);
      }
      try {
        const candidate = await service.inspectCandidate(word);
        console.log(`\n--- Candidate Inspection: ${word.toUpperCase()} ---`);
        console.log('Pending Contribution:', candidate.pending ?? '(None)');
        console.log('Review Record:      ', candidate.review ?? '(None)');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n[Failed to inspect candidate] ${msg}`);
        process.exit(1);
      }
      break;
    }

    case 'verify': {
      const word = nonFlagArgs[1];
      if (!word) {
        console.error('Error: Candidate word required. Example: verify HOLEY --source <URL>');
        process.exit(1);
      }
      const source = getFlagValue('--source');
      if (!source) {
        console.error('Error: --source <URL> is strictly mandatory to verify an official answer.');
        process.exit(1);
      }
      const puzzleStr = getFlagValue('--puzzle');
      const publicationDate = getFlagValue('--date');
      const notes = getFlagValue('--notes');

      const evidence: ReviewEvidence = {
        source,
        puzzleNumber: puzzleStr ? parseInt(puzzleStr, 10) : undefined,
        publicationDate,
        notes,
      };

      console.log(
        `[Audit Notice] Operator label: reviewerId='${reviewerId}'. Authorization enforced by Google Cloud IAM token.`
      );
      const result = await service.verifyCandidate(word, reviewerId, evidence);
      console.log('\nVerification Result:', result);
      break;
    }

    case 'reject': {
      const word = nonFlagArgs[1];
      if (!word) {
        console.error('Error: Candidate word required. Example: reject FOOBAR --reason <REASON>');
        process.exit(1);
      }
      const reason = getFlagValue('--reason');
      if (!reason) {
        console.error('Error: --reason <TEXT> is strictly mandatory to reject a candidate.');
        process.exit(1);
      }
      console.log(
        `[Audit Notice] Operator label: reviewerId='${reviewerId}'. Authorization enforced by Google Cloud IAM token.`
      );
      const result = await service.rejectCandidate(word, reviewerId, reason);
      console.log('\nRejection Result:', result);
      break;
    }

    default:
      console.error(`Unknown command: '${command}'`);
      printUsage();
      process.exit(1);
  }
}

void main().catch((err) => {
  console.error('Unexpected CLI failure:', err);
  process.exit(1);
});
