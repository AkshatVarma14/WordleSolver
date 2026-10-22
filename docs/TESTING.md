# docs/TESTING.md — Verification, Testing, and Evaluation Protocol

## 1. Testing Philosophy & Standards

To ensure academic and professional rigor, all algorithmic logic in this project is verified through automated test suites before being integrated into application interfaces.
- **Framework:** Vitest (fast, native TypeScript runner).
- **Rule of Integrity:** Zero fabricated metrics or synthetic pass rates. All reported benchmark numbers must originate from executable scripts with documented, reproducible parameters.
- **Test Categories:**
  1. Unit tests (Feedback engine & repeated-letter edge cases).
  2. Integration tests (Candidate filtering & belief state update).
  3. Small-state exhaustive tests (Ground-truth verification against hand-calculated game trees).
  4. Search resource limit & honest status validation.
  5. Determinism & stability tests.
  6. End-to-end simulation benchmarks.

---

## 2. Test Suites Specification

### 2.1 Suite 1: Feedback Engine & Repeated-Letter Verification (`tests/unit/feedback.test.ts`)

| Test ID | Guess | Answer | Expected Feedback | Description |
| :--- | :--- | :--- | :--- | :--- |
| `TC-FB-01` | `CRANE` | `CRANE` | `[2, 2, 2, 2, 2]` | Exact match (All Green) |
| `TC-FB-02` | `PLUMB` | `FIGHT` | `[0, 0, 0, 0, 0]` | Completely disjoint letters (All Grey) |
| `TC-FB-03` | `ROBOT` | `TORCH` | `[1, 2, 0, 0, 1]` | Mixed positions without duplicates |
| `TC-FB-04` | `SPEED` | `ELAND` / `ABIDE` | `[0, 0, 1, 0, 2]` / `[0, 0, 1, 0, 1]` | Guess has 2 `E`s. In `ELAND`, pos 2 `E` is Yellow, pos 3 `E` is Grey, pos 4 `D` is Green. In `ABIDE`, pos 4 `D` is Yellow. |
| `TC-FB-05` | `ERASE` | `PLEAT` / `STEAL` | `[1, 0, 1, 0, 0]` / `[1, 0, 1, 1, 0]` | Guess has 2 `E`s. In `PLEAT`, pos 0 `E` is Yellow, pos 4 `E` is Grey, pos 2 `A` is Yellow. In `STEAL`, pos 3 `S` is also Yellow. |
| `TC-FB-06` | `GEESE` | `CRANE` | `[0, 0, 0, 0, 2]` | Guess has 3 `E`s, Answer has 1 `E`. Pos 4 exact match (Green) prioritizes over earlier `E`s. Pos 1 and 2 become Grey. |
| `TC-FB-07` | `ALLOY` | `LLAMA` | `[1, 2, 1, 0, 0]` | Answer has 2 `L`s and 2 `A`s. Pos 1 exact match (Green); Pos 0 matches `A` (Yellow); Pos 2 matches remaining `L` (Yellow). |
| `TC-FB-08` | `KAPPA` | `PUPPY` | `[0, 0, 2, 2, 0]` | Guess has 2 `P`s, Answer has 3 `P`s. Both `P`s in guess are Green. |

### 2.2 Suite 2: Candidate Filtering (`tests/unit/filter.test.ts`)

- **`TC-FILT-01: Monotonic Reduction`**
  - Verify that $|C_{k+1}| \le |C_k|$ for all valid guesses and observations.
- **`TC-FILT-02: Target Preservation`**
  - For any true target $w^* \in C_k$, applying feedback $p = \mathcal{F}(g, w^*)$ must guarantee $w^* \in C_{k+1}$.
- **`TC-FILT-03: Empty Candidate Handling`**
  - When contradictory feedback is supplied (e.g., claiming tile 0 is both Green for `A` and Green for `B`), candidate set shrinks to $\emptyset$ and solver returns `EMPTY_CANDIDATE_SET` error.
- **`TC-FILT-04: Non-Candidate Guess Filtering`**
  - Verify that guessing $g \in G \setminus A$ correctly partitions and filters $C \subseteq A$ without error.

### 2.3 Suite 3: Small-State Exhaustive Game-Tree Tests (`tests/small-state/mini-tree.test.ts`)

To mathematically verify the bounded search without relying on heuristics:
- Define a micro-universe:
  $$A_{\text{mini}} = \{\text{CAT}, \text{BAT}, \text{HAT}, \text{CAR}\}$$
  $$G_{\text{mini}} = \{\text{CAT}, \text{BAT}, \text{HAT}, \text{CAR}, \text{BAR}, \text{TAB}\}$$
  *(Adapted to 5-letter analogues or scaled 3-letter micro-rules)*
- **Hand-Calculated Ground Truth:**
  - With 2 turns remaining, can guess `BAR` partition the candidate set into singletons?
  - Verify that search algorithm outputs `PROVED_WIN` if and only if hand-calculated tree proves all candidates can be solved within remaining turns.
  - Verify that if budget is reduced to 1 turn with 4 candidates, search algorithm outputs `DISPROVED_WIN`.

### 2.4 Suite 4: Search Resource Budget & Honest Guarantees (`tests/search/guarantees.test.ts`)

- **`TC-GUAR-01: Honest Timeout Handling`**
  - Configure search budget with `timeoutMs: 1` (forced timeout on large candidate set $|C| = 2,309$).
  - Assert that solver returns status `UNRESOLVED_RESOURCE_LIMIT`.
  - **Critical Assertion:** Ensure returned status is **NEVER** `DISPROVED_WIN` or `PROVED_WIN`.
- **`TC-GUAR-02: Honest Node Ceiling Handling`**
  - Configure search budget with `maxNodeExpansions: 5`.
  - Assert that solver halts immediately upon reaching 5 node expansions with status `UNRESOLVED_RESOURCE_LIMIT`.
- **`TC-GUAR-03: Determinism Check`**
  - Execute Fast Entropy and Bounded Minimax 10 times consecutively with identical inputs.
  - Assert that recommended word, metrics, and partition stats are 100% identical across all 10 runs.

---

## 3. Empirical Evaluation & Benchmarking Protocol (Stage 6)

During Stage 6, the system will execute empirical evaluation scripts comparing the two strategies.

### 3.1 Evaluation Metrics
For every benchmark evaluation, the following metrics will be collected and reported separately:
1. **Solution Quality:**
   - **Solve Rate:** Percentage of target words solved within $\le 6$ guesses ($\%$).
   - **Mean Turn Count ($\mu$):** Average number of guesses required for solved games.
   - **Worst-Case Turn Count ($\max$):** Maximum number of guesses required on any game in the test set.
   - **Distribution of Turns:** Frequency table of wins on turn 1, 2, 3, 4, 5, 6, and losses ($> 6$).
2. **Computational Performance:**
   - **Mean Latency per Turn:** Average runtime per recommendation (milliseconds).
   - **Worst-Case Turn Latency:** Maximum single-turn decision runtime (milliseconds).
   - **Search Node Expansions:** Mean and maximum nodes explored per turn (for Minimax search).

### 3.2 Benchmark Protocol & Datasets
- **Dataset A (Standard Benchmark):** Fixed subset of 100 randomly sampled target words using a fixed PRNG seed (`seed = 42`).
- **Dataset B (Complete Answer Vocabulary):** Full evaluation over all 2,309 official answer words (executed offline via `scripts/benchmark.ts`).
- **Separation of Measurements:** Quality (turns) and performance (runtime) must be reported in distinct columns without conflation.
