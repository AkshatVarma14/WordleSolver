# docs/REQUIREMENTS.md — System Requirements Specification

## 1. Project Context & Objectives

- **Project Title:** Wordle Solver
- **Course:** Artificial Intelligence and Soft Computing (AISC), CSE3121
- **Academic Mission:** Design, implement, and rigorously evaluate algorithmic techniques for sequential decision-making under uncertainty, specifically contrasting greedy information-theoretic heuristics with bounded adversarial game-tree search.
- **Delivery Scope:** Deliver a high-performance, deterministic TypeScript solver core deployed across two client-side interfaces: a responsive standalone web application and a Chrome browser extension (Manifest V3).

---

## 2. Shared Solver Engine Requirements (Core Package)

### FR-ENGINE-1: Word Representation & Vocabulary Separation
- **Length Constraint:** Exclusively operate on 5-letter words consisting of ASCII alphabetical characters `[A-Z]`, normalized to uppercase.
- **Dataset Partitioning:**
  - **Answer Space ($A$):** The vocabulary of possible secret target solutions (e.g., standard $\approx 2,309$ curated common English words).
  - **Allowed Guess Space ($G$):** The complete vocabulary of allowable guess submissions (e.g., standard $\approx 12,972$ valid English 5-letter words).
  - **Constraint:** $A \subseteq G$. The solver must explicitly recognize that playing a guess $g \in G \setminus A$ is often mathematically advantageous to maximize information gain, even though $g$ cannot be the target answer itself.

### FR-ENGINE-2: Precise Feedback Modeling (Wordle Color Semantics)
- For any guess $g = g_0 g_1 g_2 g_3 g_4$ and secret answer $w = w_0 w_1 w_2 w_3 w_4$, compute a ternary feedback vector $p = (p_0, p_1, p_2, p_3, p_4) \in \{0, 1, 2\}^5$:
  - `2` (Green / Correct): Letter is present in $w$ at the exact identical position ($g_i = w_i$).
  - `1` (Yellow / Present): Letter is present elsewhere in $w$, but not in position $i$.
  - `0` (Grey / Absent): Letter does not occur in $w$, or all occurrences in $w$ have already been matched by other Green/Yellow tiles.
- **Repeated-Letter Precedence Rules:**
  1. **Pass 1 (Green Priority):** All exact positional matches ($g_i = w_i$) are assigned Green, and corresponding letters in $w$ are marked as consumed.
  2. **Pass 2 (Yellow Left-to-Right Allocation):** For all non-green positions ($g_i \neq w_i$), if letter $g_i$ appears unconsumed in $w$, assign Yellow and decrement the available frequency of that letter in $w$.
  3. **Pass 3 (Grey Default):** Any remaining unassigned letters are marked Grey.
- **Edge Cases:** Must accurately evaluate inputs with multiple identical letters in guess (e.g., `SPEED` against `ABIDE`), multiple identical letters in answer (e.g., `ABIDE` against `SPEED`), and identical duplicates in both (e.g., `ERASE` against `STEAL`).

### FR-ENGINE-3: Candidate Filtering & Partitioning
- Given a candidate set $C_k \subseteq A$, a guess $g \in G$, and an observed feedback pattern $p \in \{0, 1, 2\}^5$, compute the updated candidate set:
  $$C_{k+1} = \{ w \in C_k \mid \text{feedback}(g, w) = p \}$$
- **State Monotonicity:** $C_{k+1} \subseteq C_k$.
- **Inconsistency Handling:** If $C_{k+1} = \emptyset$, flag an explicit `EMPTY_CANDIDATE_SET` error, indicating either an inconsistent feedback input or a word not present in dictionary $A$.

### FR-ENGINE-4: Fast Strategy (Information-Theoretic Heuristic)
- For every candidate guess $g \in G$, compute the feedback distribution over the current candidate set $C$:
  $$P(p \mid g) = \frac{|\{ w \in C \mid \text{feedback}(g, w) = p\}|}{|C|}$$
- Compute the **Shannon Entropy** (Information Gain in bits):
  $$H(g) = -\sum_{p \in \mathcal{P}} P(p \mid g) \log_2 P(p \mid g)$$
- Compute the **Expected Remaining Candidates**:
  $$E[|C'| \mid g] = \sum_{p \in \mathcal{P}} P(p \mid g) \cdot |\{ w \in C \mid \text{feedback}(g, w) = p\}| = \frac{1}{|C|} \sum_{p \in \mathcal{P}} |C_{g, p}|^2$$
- **Ranking & Tie-Breaking:**
  1. Highest entropy $H(g)$ (or equivalently lowest $E[|C'|]$).
  2. Candidate Membership Preference: If two guesses have equal entropy within $\epsilon = 10^{-6}$, rank $g \in C$ over $g \in G \setminus C$ (as $g \in C$ offers a non-zero immediate win probability $P(\text{win}) = 1/|C|$).
  3. Lexicographical stability for full determinism.

### FR-ENGINE-5: Bounded Deeper-Search Strategy (Minimax Game-Tree)
- Formulate Wordle as a multi-stage tree search minimizing worst-case or average remaining turns within turn budget $k \le 6$.
- **Adversarial / Chance Formulation:**
  - **Max Node (Agent):** Chooses guess $g \in G$ to minimize remaining turns.
  - **Min / Nature Node (Wordle):** Returns partition $C_{g, p}$ that maximizes remaining difficulty or represents worst-case partition size $\max_p |C_{g, p}|$.
- **Branch-and-Bound Pruning:** Prune branches where worst-case candidate partitions exceed current known alpha-beta bounds.
- **Memoization / Transposition Table:** Cache evaluations indexed by canonical candidate set identifiers (bitmasks or sorted ID tuples).
- **Strict Resource Budgeting:**
  - Maximum search depth $d_{\max}$ (default: 2 or 3 plies).
  - Maximum branch candidate ceiling $B$ (e.g., top $K$ entropy candidates).
  - Execution deadline / timeout (e.g., 500 ms).
  - Maximum node expansions $N_{\max}$ (e.g., 25,000 nodes).

### FR-ENGINE-6: Recommendation Explanations
Every recommendation returned by the solver must include structured rationale:
- Recommended guess word.
- Strategy utilized (Fast Entropy vs Bounded Minimax).
- Quantitative metrics:
  - Expected bits of information gain ($H(g)$).
  - Expected candidates remaining after guess ($E[|C'|]$).
  - Immediate win probability ($1/|C|$ if $g \in C$, else $0\%$).
  - Worst-case partition size ($\max_p |C_{g, p}|$).
  - Number of distinct feedback patterns generated.
- Human-readable narrative explanation (e.g., *"Reduces 84 candidates to an average of 4.2 across 23 distinct feedback patterns with 4.32 bits of entropy"*).

### FR-ENGINE-7: Strategy Guarantees & Honest Status Classification
The solver must categorize search outcomes into strictly defined statuses:
1. `WON`: Secret word identified and verified.
2. `PROVED_WIN`: Complete search verified that every candidate in $C$ can be solved within remaining turn budget $k$.
3. `DISPROVED_WIN`: Exhaustive exploration proved no sequence of guesses can guarantee a win for all candidates in $C$ within $k$ turns.
4. `UNRESOLVED_RESOURCE_LIMIT`: The search terminated early due to depth cutoff, node cap, or execution timeout. **Under no circumstances should this status be labeled as a proof that no solution exists.**
5. `GLOBAL_OPTIMALITY`: Must NOT be claimed for full-game strategies unless supported by an exact mathematical proof over the exact datasets used.

---

## 3. Standalone Web Application Requirements (`apps/web`)

### FR-WEB-1: Interactive Wordle Grid
- Render a 6-row by 5-column grid reflecting standard Wordle layout.
- Support responsive rendering across desktop, tablet, and mobile displays.

### FR-WEB-2: Input Modes & Feedback Entry
- Support manual keyboard entry of 5-letter guesses.
- Support interactive tile color toggling: clicking an active tile cycles its state (`Grey -> Yellow -> Green -> Grey`).
- Keyboard shortcuts for color assignment (e.g., numeric keys 0, 1, 2 or clicking).

### FR-WEB-3: Candidate & Strategy Inspector
- Real-time display of candidate count ($|C|$) and scrollable list of remaining candidates.
- Strategy selector dropdown allowing user to switch between:
  - *Fast Information Gain (Shannon Entropy)*
  - *Bounded Deeper Search (Minimax)*
- Display top $N$ candidate guesses with comparative metrics (Entropy, Expected Remaining, Immediate Win %).

### FR-WEB-4: State Management & Limit Indicators
- Display loading indicators during search execution.
- Prominent alerts for:
  - Invalid 5-letter word input.
  - Empty candidate set (`EMPTY_CANDIDATE_SET`) warning user of contradictory feedback.
  - Resource-limit warnings (`Search bounded: 500ms time limit reached; displaying best heuristic choice`).
- Fully operable offline without network connectivity or target website access.

---

## 4. Chrome Browser Extension Requirements (`apps/extension`)

### FR-EXT-1: Architecture & Distribution
- Built on Chrome **Manifest V3**.
- Executable entirely client-side; zero external backend or remote code injection.
- Distributed via GitHub Releases as an unpacked ZIP archive, installable via `chrome://extensions` in Developer Mode without a paid Chrome Web Store developer account.

### FR-EXT-2: Target-Site DOM Extraction & Verification Policy
- In Stage 0, the target Wordle website is treated as an **unresolved decision** pending live DOM inspection in Stage 5.
- The extension will not rely on hardcoded guessed CSS selectors.
- In Stage 5, selectors and DOM structure will be explicitly inspected, verified, and documented.

### FR-EXT-3: Manual Entry Fallback
- If the target website updates its DOM, or if the user visits an unsupported Wordle variant, the extension popup automatically presents the standalone manual grid interface, ensuring zero disruption to usability.

### FR-EXT-4: Permissions Minimization
- Limit manifest permissions to the bare minimum (e.g., `activeTab` or explicit target host permissions).
- Document the precise technical rationale for every declared permission in `manifest.json`.

---

## 5. Non-Functional Requirements

### NFR-1: Performance & Responsiveness
- Fast entropy calculation on $|C| \le 2,309$ must compute in $< 50\text{ ms}$ on standard consumer hardware.
- Web interface must offload heavy search computation to a Web Worker to ensure 60 FPS UI rendering and avoid main-thread blocking.

### NFR-2: Zero Cost & Resource Conservation
- No subscriptions, paid tokens, API keys, or cloud infrastructure.
- Zero server maintenance; static client-side bundle deployable to free hosts (Cloudflare Pages / GitHub Pages).

### NFR-3: Determinism & Reproducibility
- For identical inputs $(C, G, \text{strategy})$, the solver must output identical recommendation orderings and metrics.
- Simulation test harnesses must support seedable pseudo-randomization for reproducible benchmarking.

### NFR-4: Accessibility & Visual Clarity
- High-contrast visual distinctions for tile colors (Green `#538d4e`, Yellow `#b59f3b`, Grey `#3a3a3c`, with accessible colorblind mode alternatives).
- ARIA labels on all interactive board tiles and buttons.

---

## 6. Unresolved Decisions & Assumptions

| ID | Topic | Current Status | Resolution Stage |
| :--- | :--- | :--- | :--- |
| **UD-1** | Target Wordle Website | Pending selection (e.g., NYT Wordle vs open-source clone) | Stage 5 (Live DOM inspection) |
| **UD-2** | Word List Licensing & Origin | Standard 2,309 answers / 12,972 guesses to be verified for MIT/public domain compliance | Stage 1 (Repo setup & data verification) |
| **UD-3** | Bounded Search Budget Tuning | Default 500 ms / 25,000 nodes to be calibrated empirically | Stage 3 & Stage 6 (Benchmarking) |
