import { evaluateFeedbackRaw, isValidWord, validateWord } from './feedback';
import { evaluateGuess, patternToCode } from './entropy';
import {
  DEFAULT_SEARCH_BUDGET,
  GuaranteeStatus,
  GuessEvaluation,
  RecommendationResult,
  SearchBudget,
  SearchMetrics,
} from './types';

/**
 * Entry stored in the Transposition Table for memoizing evaluated candidate states.
 */
export interface MemoEntry {
  readonly worstCaseTurns: number;
  readonly bestGuess: string;
  readonly remainingBudget: number;
  readonly isExact: boolean;
}

/**
 * Internal result returned from minimax tree search nodes.
 */
export interface SearchNodeResult {
  readonly worstCaseTurns: number;
  readonly bestGuess: string;
  readonly isExact: boolean;
  readonly status: GuaranteeStatus;
}

/**
 * Mutable context tracking diagnostics, resource budgets, and memoization tables during search.
 */
export interface SearchContext {
  readonly startTime: number;
  readonly budget: SearchBudget;
  readonly allowedGuesses: readonly string[];
  nodesExpanded: number;
  memoHits: number;
  maxDepthReached: number;
  hitResourceLimit: boolean;
  readonly transpositionTable: Map<string, MemoEntry>;
}

/**
 * Produces a stable, collision-free canonical key representing a set of candidate words.
 *
 * Guarantees that any two candidate arrays containing identical words (regardless of order)
 * generate the identical canonical key.
 *
 * @param candidates Array of candidate words
 * @returns Sorted, comma-separated string representation
 */
export function getCanonicalStateKey(candidates: readonly string[]): string {
  if (candidates.length === 0) return '';
  if (candidates.length === 1) return candidates[0]!;
  return candidates.slice().sort().join(',');
}

/**
 * Partitions a candidate answer set according to the feedback patterns produced by a guess.
 *
 * @param candidates Normalized uppercase candidate words
 * @param normalizedGuess Normalized uppercase guess word
 * @returns Map from feedback pattern code (0..242) to array of matching candidate words
 */
export function partitionCandidatesByPattern(
  candidates: readonly string[],
  normalizedGuess: string
): Map<number, string[]> {
  const partitions = new Map<number, string[]>();

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const feedback = evaluateFeedbackRaw(normalizedGuess, candidate);
    const code = patternToCode(feedback);

    let list = partitions.get(code);
    if (!list) {
      list = [];
      partitions.set(code, list);
    }
    list.push(candidate);
  }

  return partitions;
}

/**
 * Selects and orders candidate moves to expand for a search node.
 *
 * Heuristic move ordering:
 * 1. For root node (depth 1): Explores top guesses ordered by Shannon entropy / partition quality,
 *    bounded by maxBranchCandidates.
 * 2. For deeper nodes (depth > 1): Prioritizes candidates within C (which offer immediate win potential),
 *    plus top-ranked distinguishing probes.
 *
 * @param candidates Current candidate set
 * @param allowedGuesses Global pool of allowed guesses
 * @param currentDepth Current ply in the search tree (1-based)
 * @param maxBranches Maximum candidate moves to consider
 * @returns Ordered array of candidate guess words to evaluate
 */
export function selectBranchGuesses(
  candidates: readonly string[],
  allowedGuesses: readonly string[],
  _currentDepth: number,
  maxBranches: number
): string[] {
  if (candidates.length <= 2) {
    return [...candidates];
  }

  // Pre-rank candidate guesses by Shannon entropy
  const candidateSet = new Set(candidates);
  const pool = allowedGuesses.length > 0 ? allowedGuesses : candidates;

  const scored: Array<{ guess: string; entropy: number; isCandidate: boolean }> = [];
  for (let i = 0; i < pool.length; i++) {
    const g = pool[i]!;
    const evalResult = evaluateGuess(g, candidates, candidateSet);
    scored.push({
      guess: g,
      entropy: evalResult.entropyBits,
      isCandidate: evalResult.isCandidate,
    });
  }

  // Sort: higher entropy first, candidates preferred when entropy is tied
  scored.sort((a, b) => {
    const diff = b.entropy - a.entropy;
    if (Math.abs(diff) > 1e-6) return diff;
    if (a.isCandidate !== b.isCandidate) return a.isCandidate ? -1 : 1;
    return a.guess.localeCompare(b.guess);
  });

  const limit = Math.min(scored.length, Math.max(1, maxBranches));
  return scored.slice(0, limit).map((s) => s.guess);
}

/**
 * Recursive minimax search minimizing worst-case remaining guesses within a turn budget.
 *
 * Recurrence:
 * W(C) = 1 + min_{g in G} max_{p in P, C_{g,p} != empty, p != allGreen} W(C_{g,p})
 *
 * Pruning rules:
 * 1. Immediate Win: If g in C and target == g, the all-green partition is solved in 0 additional turns.
 * 2. Alpha-Bound Cutoff: If for any partition p, W(C_{g,p}) >= current_best_bound - 1, guess g cannot
 *    improve over the best known strategy. Exploration of g is aborted immediately.
 * 3. Budget Cutoff: If for any partition p, W(C_{g,p}) > remainingBudget - 1, guess g cannot guarantee
 *    a win within remainingBudget. Exploration of g is pruned.
 * 4. Lower-Bound Pigeonhole: In 1 remaining turn, at most 1 candidate can be solved. If |C| > 1 and
 *    remainingBudget <= 1, branch is mathematically unwinnable.
 *
 * @param candidates Current surviving candidate set
 * @param remainingBudget Maximum turns allowed to solve all remaining candidates
 * @param currentDepth Current depth in the search tree (starts at 1)
 * @param alphaBound Current upper bound on worst-case turns (for branch-and-bound pruning)
 * @param context Search context tracking budgets, nodes, and memoization
 * @returns SearchNodeResult
 */
export function minimaxWorstCase(
  candidates: readonly string[],
  remainingBudget: number,
  currentDepth: number,
  alphaBound: number,
  context: SearchContext
): SearchNodeResult {
  // Check resource bounds (timeout or node ceiling)
  if (
    context.nodesExpanded >= context.budget.maxNodeExpansions ||
    Date.now() - context.startTime >= context.budget.timeoutMs
  ) {
    context.hitResourceLimit = true;
    return {
      worstCaseTurns: Infinity,
      bestGuess: candidates[0] ?? '',
      isExact: false,
      status: 'UNRESOLVED_RESOURCE_LIMIT',
    };
  }

  context.nodesExpanded++;
  if (currentDepth > context.maxDepthReached) {
    context.maxDepthReached = currentDepth;
  }

  const numCandidates = candidates.length;

  // Base Case 1: Empty candidate pool (contradiction or already resolved)
  if (numCandidates === 0) {
    return {
      worstCaseTurns: 0,
      bestGuess: '',
      isExact: true,
      status: 'WON',
    };
  }

  // Base Case 2: Exactly 1 candidate remains -> Immediate win on next guess
  if (numCandidates === 1) {
    const singleWord = candidates[0]!;
    if (remainingBudget >= 1) {
      return {
        worstCaseTurns: 1,
        bestGuess: singleWord,
        isExact: true,
        status: currentDepth === 1 ? 'WON' : 'PROVED_WIN',
      };
    }
    return {
      worstCaseTurns: Infinity,
      bestGuess: singleWord,
      isExact: true,
      status: 'DISPROVED_WIN',
    };
  }

  // Lower-bound check: Cannot solve > 1 candidates in 1 turn
  if (remainingBudget <= 1) {
    return {
      worstCaseTurns: Infinity,
      bestGuess: candidates[0]!,
      isExact: true,
      status: 'DISPROVED_WIN',
    };
  }

  // Base Case 3: Exactly 2 candidates remain
  if (numCandidates === 2) {
    if (remainingBudget >= 2) {
      // Guessing either candidate wins in 1 (if target == guess) or 2 (if target != guess)
      return {
        worstCaseTurns: 2,
        bestGuess: candidates[0]!,
        isExact: true,
        status: 'PROVED_WIN',
      };
    }
    return {
      worstCaseTurns: Infinity,
      bestGuess: candidates[0]!,
      isExact: true,
      status: 'DISPROVED_WIN',
    };
  }

  // Depth-limit cutoff
  if (currentDepth >= context.budget.maxDepth) {
    context.hitResourceLimit = true;
    return {
      worstCaseTurns: Infinity,
      bestGuess: candidates[0] ?? '',
      isExact: false,
      status: 'UNRESOLVED_RESOURCE_LIMIT',
    };
  }

  // Check Transposition Table (Memoization)
  const stateKey = getCanonicalStateKey(candidates);
  const memo = context.transpositionTable.get(stateKey);
  if (memo && memo.isExact && memo.remainingBudget >= remainingBudget) {
    context.memoHits++;
    return {
      worstCaseTurns: memo.worstCaseTurns,
      bestGuess: memo.bestGuess,
      isExact: true,
      status:
        memo.worstCaseTurns <= remainingBudget ? 'PROVED_WIN' : 'DISPROVED_WIN',
    };
  }

  // Select branch moves to explore
  const branchGuesses = selectBranchGuesses(
    candidates,
    context.allowedGuesses,
    currentDepth,
    context.budget.maxBranchCandidates
  );

  let bestWorstCase = Infinity;
  let bestGuess = branchGuesses[0] ?? candidates[0] ?? '';
  let allBranchesExact = true;

  // Evaluate candidate moves
  for (let gIdx = 0; gIdx < branchGuesses.length; gIdx++) {
    const guess = branchGuesses[gIdx]!;
    const partitions = partitionCandidatesByPattern(candidates, guess);

    let guessWorstCase = 1; // 1 turn consumed by playing this guess
    let guessPruned = false;

    // Check each non-empty feedback partition
    for (const [code, partition] of partitions.entries()) {
      // Code 242 is all-green [2,2,2,2,2]. If guess in C, this partition is solved immediately!
      if (code === 242) {
        continue;
      }

      // If partition size exceeds remaining budget capability
      if (partition.length > 1 && remainingBudget - 1 <= 1) {
        guessPruned = true;
        break;
      }

      const effectiveAlpha = Math.min(alphaBound - 1, bestWorstCase - 1);
      const subResult = minimaxWorstCase(
        partition,
        remainingBudget - 1,
        currentDepth + 1,
        effectiveAlpha,
        context
      );

      if (!subResult.isExact) {
        allBranchesExact = false;
      }

      const totalBranchTurns = 1 + subResult.worstCaseTurns;
      if (totalBranchTurns > guessWorstCase) {
        guessWorstCase = totalBranchTurns;
      }

      // Branch-and-bound pruning: cannot beat current best
      if (
        guessWorstCase >= bestWorstCase ||
        guessWorstCase > remainingBudget ||
        guessWorstCase >= alphaBound
      ) {
        guessPruned = true;
        break;
      }
    }

    if (!guessPruned && guessWorstCase < bestWorstCase) {
      bestWorstCase = guessWorstCase;
      bestGuess = guess;

      // Cannot beat 1 turn on >1 candidates
      if (bestWorstCase <= 2 && remainingBudget >= 2 && numCandidates <= 2) {
        break;
      }
    }

    if (context.hitResourceLimit) {
      break;
    }
  }

  const isExact = allBranchesExact && !context.hitResourceLimit;

  // Memoize exact results
  if (isExact && bestWorstCase < Infinity) {
    context.transpositionTable.set(stateKey, {
      worstCaseTurns: bestWorstCase,
      bestGuess,
      remainingBudget,
      isExact: true,
    });
  }

  let status: GuaranteeStatus;
  if (context.hitResourceLimit) {
    status = 'UNRESOLVED_RESOURCE_LIMIT';
  } else if (bestWorstCase <= remainingBudget) {
    status = 'PROVED_WIN';
  } else {
    // If the candidate guess pool was truncated by maxBranchCandidates, unexamined moves
    // in allowedGuesses might exist. We cannot claim mathematical disproof across all legal guesses.
    const poolSize =
      context.allowedGuesses.length > 0
        ? context.allowedGuesses.length
        : numCandidates;
    const isFullMoveSpaceExplored = branchGuesses.length >= poolSize;

    if (isFullMoveSpaceExplored) {
      status = 'DISPROVED_WIN';
    } else {
      status = 'UNRESOLVED_RESOURCE_LIMIT';
    }
  }

  return {
    worstCaseTurns: bestWorstCase,
    bestGuess,
    isExact,
    status,
  };
}

/**
 * Computes recommendations using the Bounded Deeper-Search Strategy (Minimax Game-Tree).
 *
 * Guarantees & Honest Reporting:
 * - WON: Target uniquely identified in 1 turn.
 * - PROVED_WIN: Verified strategy guarantees win for all candidates in C within turnsRemaining.
 * - DISPROVED_WIN: Complete exhaustive exploration proved no strategy guarantees win in turnsRemaining.
 * - UNRESOLVED_RESOURCE_LIMIT: Search aborted early due to timeout, node limit, or depth budget.
 *   The returned move is the best heuristic choice, with no false claim of proof.
 *
 * @param candidates Surviving candidate answer vocabulary
 * @param allowedGuesses Complete legal guess vocabulary (defaults to candidates)
 * @param budget Partial search budget overrides (timeout, maxDepth, node limit)
 * @param turnsRemaining Remaining guess budget (standard Wordle: 6 - turnNumber)
 * @returns RecommendationResult with metrics, search status, and explanation
 */
export function getBoundedSearchRecommendation(
  candidates: readonly string[],
  allowedGuesses: readonly string[] = candidates,
  budget: Partial<SearchBudget> = {},
  turnsRemaining: number = 6
): RecommendationResult {
  const startTime = Date.now();
  const candidatesCount = candidates.length;

  // Case 1: Contradiction / Empty Pool
  if (candidatesCount === 0) {
    return {
      recommendedGuess: null,
      strategy: 'BOUNDED_MINIMAX',
      candidatesCount: 0,
      isContradiction: true,
      isWon: false,
      evaluation: null,
      topRanked: [],
      status: 'UNRESOLVED_RESOURCE_LIMIT',
      explanation:
        'No candidate words remain matching historical feedback. Contradiction detected.',
      warning: 'Contradiction: candidate pool is empty.',
    };
  }

  // Normalize candidate inputs
  const normalizedCandidates = candidates.map((c) =>
    isValidWord(c) ? c.toUpperCase() : validateWord(c, 'answer')
  );
  const normalizedAllowed =
    allowedGuesses.length > 0
      ? allowedGuesses.map((g) =>
          isValidWord(g) ? g.toUpperCase() : validateWord(g, 'guess')
        )
      : normalizedCandidates;

  const candidateSet = new Set(normalizedCandidates);

  // Case 2: Exactly 1 candidate remains -> Terminal Win
  if (candidatesCount === 1) {
    const singleWord = normalizedCandidates[0]!;
    const singleEval: GuessEvaluation = {
      guess: singleWord,
      isCandidate: true,
      entropyBits: 0,
      expectedRemaining: 0,
      worstCasePartitionSize: 1,
      distinctPatternsCount: 1,
      immediateWinProbability: 1.0,
    };

    const metrics: SearchMetrics = {
      nodesExpanded: 1,
      durationMs: Date.now() - startTime,
      depthReached: 1,
      worstCaseTurns: 1,
      hitResourceLimit: false,
      status: 'WON',
      memoHits: 0,
    };

    return {
      recommendedGuess: singleWord,
      strategy: 'BOUNDED_MINIMAX',
      candidatesCount: 1,
      isContradiction: false,
      isWon: true,
      evaluation: singleEval,
      topRanked: [singleEval],
      status: 'WON',
      searchMetrics: metrics,
      explanation: `Target identified uniquely as '${singleWord}'. Winning terminal move.`,
    };
  }

  // Merge budget options
  const effectiveBudget: SearchBudget = {
    maxDepth: budget.maxDepth ?? DEFAULT_SEARCH_BUDGET.maxDepth,
    maxBranchCandidates:
      budget.maxBranchCandidates ?? DEFAULT_SEARCH_BUDGET.maxBranchCandidates,
    timeoutMs: budget.timeoutMs ?? DEFAULT_SEARCH_BUDGET.timeoutMs,
    maxNodeExpansions:
      budget.maxNodeExpansions ?? DEFAULT_SEARCH_BUDGET.maxNodeExpansions,
  };

  const context: SearchContext = {
    startTime,
    budget: effectiveBudget,
    allowedGuesses: normalizedAllowed,
    nodesExpanded: 0,
    memoHits: 0,
    maxDepthReached: 1,
    hitResourceLimit: false,
    transpositionTable: new Map<string, MemoEntry>(),
  };

  // Execute Minimax search
  const searchResult = minimaxWorstCase(
    normalizedCandidates,
    turnsRemaining,
    1,
    Infinity,
    context
  );

  const durationMs = Date.now() - startTime;

  // Fallback to top-ranked entropy guess if search returned invalid word
  let recommended = searchResult.bestGuess;
  if (!recommended || !isValidWord(recommended)) {
    recommended = normalizedCandidates[0]!;
  }

  // Generate evaluation metrics for the recommended word
  const evalMetrics = evaluateGuess(
    recommended,
    normalizedCandidates,
    candidateSet
  );

  const searchMetrics: SearchMetrics = {
    nodesExpanded: context.nodesExpanded,
    durationMs,
    depthReached: context.maxDepthReached,
    worstCaseTurns:
      searchResult.worstCaseTurns < Infinity
        ? searchResult.worstCaseTurns
        : undefined,
    hitResourceLimit: context.hitResourceLimit,
    status: searchResult.status,
    memoHits: context.memoHits,
  };

  // Build human-readable rationale
  let explanation = '';
  let warning: string | undefined;

  switch (searchResult.status) {
    case 'PROVED_WIN':
      explanation = `Bounded search (depth ${context.maxDepthReached}, ${context.nodesExpanded} nodes): Mathematically proved winning strategy in at most ${searchResult.worstCaseTurns} turns using '${recommended}' within remaining budget of ${turnsRemaining} turns (status: PROVED_WIN).`;
      break;
    case 'DISPROVED_WIN':
      explanation = `Bounded search (depth ${context.maxDepthReached}, ${context.nodesExpanded} nodes): Exhaustively proved no strategy can guarantee a win for all ${candidatesCount} candidates within ${turnsRemaining} turns (status: DISPROVED_WIN). Recommending best minimax heuristic '${recommended}'.`;
      break;
    case 'UNRESOLVED_RESOURCE_LIMIT':
    default:
      warning = `Search budget limit reached (${context.nodesExpanded} nodes, ${durationMs}ms). Output is a heuristic choice, not a mathematical proof.`;
      explanation = `Bounded search: Resource limit reached (${durationMs}ms, depth ${context.maxDepthReached}). Displaying best heuristic move '${recommended}' with ${evalMetrics.entropyBits.toFixed(2)} bits of entropy (status: UNRESOLVED_RESOURCE_LIMIT).`;
      break;
  }

  return {
    recommendedGuess: recommended,
    strategy: 'BOUNDED_MINIMAX',
    candidatesCount,
    isContradiction: false,
    isWon: false,
    evaluation: evalMetrics,
    topRanked: [evalMetrics],
    status: searchResult.status,
    searchMetrics,
    explanation,
    warning,
  };
}
