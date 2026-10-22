# Wordle Solver — Project Instructions & Governance

## 1. Absolute Workspace Isolation

### 1.1 Mandatory Workspace Directory
All operations, file creations, modifications, terminal commands, tests, and configuration must take place strictly inside the verified workspace directory:
```text
C:\Users\aksha\OneDrive\Documents\WordleSolver
```

### 1.2 Prohibited Actions & Strict Boundaries
- **Never touch external projects:** Do not inspect, search, read, modify, rename, move, delete, or write files in `LifeHub` or any other project directory on this system.
- **Never alter global settings:** Do not modify user-level Antigravity settings, shared system tooling, or global environment configurations outside this project repository.
- **Self-contained repository:** All source code, assets, datasets, documentation, build outputs, and Git metadata must reside entirely within `WordleSolver`.
- **Pre-execution verification:** Before executing any command or creating any file, verify that the current working directory is `C:\Users\aksha\OneDrive\Documents\WordleSolver`. If the path is ambiguous or unexpected, halt immediately and request clarification.

---

## 2. Staged Development Lifecycle & Gate Control

This project adheres to an 8-stage gated roadmap (Stage 0 through Stage 7). Autonomous progression between stages is strictly prohibited.

### 2.1 The 8 Project Stages
- **Stage 0: Specification & Architecture (Current)** — Planning, documentation, algorithm design, testing plan, and governance rules. No application source code or package installations.
- **Stage 1: Repository Setup & Tested Feedback Engine** — Monorepo configuration, TypeScript setup, Vitest harness, and complete 5-letter feedback engine with repeated-letter handling.
- **Stage 2: Candidate Filtering & Fast Strategy** — Candidate set reduction engine and Shannon Information Gain (entropy) heuristic solver.
- **Stage 3: Bounded Deeper-Search Strategy** — Lookahead search (minimax/expectiminimax) with branch-and-bound pruning, memoization, explicit resource budgets, and honest guarantee statuses.
- **Stage 4: Standalone Web Application** — Interactive 5-letter board, color-toggle feedback input, candidate viewer, strategy selector, and explanation panel using React + Vite.
- **Stage 5: Chrome Extension (Manifest V3)** — Unpacked browser extension with verified target-site DOM extraction and seamless manual fallback.
- **Stage 6: Simulation Harness & Comparative Evaluation** — Benchmark runner, empirical performance comparisons (entropy vs deeper search), and AISC metrics collection.
- **Stage 7: Release Packaging, Documentation & Viva Preparation** — GitHub release ZIPs, installation guide, project portfolio README, and viva defense guide.

### 2.2 Stage Exit and Entry Criteria
- Each stage must satisfy all explicit exit criteria and pass all relevant test suites before completion is claimed.
- At the end of each stage, provide a concise completion report covering deliverables, test outcomes, architectural notes, and a Stage Checklist for the subsequent stage.
- **Do not begin the next stage until the user has explicitly reviewed and approved advancement.**

---

## 3. Engineering & Technical Standards

### 3.1 Architecture & Stack
- **Language:** TypeScript (strict mode enabled across all packages and apps).
- **Core Engine:** Pure, deterministic TypeScript package (`packages/solver`) with zero DOM or browser API dependencies.
- **Web Interface:** React with Vite (`apps/web`), styled with clean, responsive, accessible CSS.
- **Extension:** Chrome Manifest V3 (`apps/extension`), packaged for unpacked developer loading and release ZIP distribution.
- **Testing:** Vitest for unit, integration, and small-state exhaustive testing.
- **Scripts:** Node.js execution scripts for offline simulations and benchmarks.

### 3.2 Zero-Cost & Local Execution Mandate
- No paid AI APIs, LLM API keys, or cloud inference services.
- No backend servers, databases, user authentication systems, or cloud storage.
- All game-tree search and information-theoretic calculations must run locally on the client machine / browser runtime.
- Deployment target for the web app is limited to free static hosting (e.g., Cloudflare Pages, GitHub Pages).

### 3.3 Algorithmic Integrity & Honest Reporting
- **Never fabricate results:** Do not invent benchmark numbers, solve rates, or test results. Report actual measurements from test runs.
- **Honest status reporting:** The solver must clearly distinguish between:
  1. `WON`: The secret word was found.
  2. `PROVED_WIN`: The search algorithm exhaustively verified that all remaining candidates in candidate set $C$ can be solved within remaining turn budget $k$.
  3. `DISPROVED_WIN`: Exhaustive search proved no winning strategy exists for the defined candidate set and guess list within $k$ turns.
  4. `UNRESOLVED_RESOURCE_LIMIT`: The search terminated due to depth limit, node count cap, or execution timeout. **Never label an unresolved search as a proof that no solution exists.**
  5. `GLOBAL_OPTIMALITY`: Must never be claimed for full Wordle unless mathematically established and cited from literature for identical datasets and rules.

### 3.4 Test-Driven Development (TDD)
- Algorithmic logic (feedback evaluation, filtering, entropy scoring, minimax search) must be accompanied by comprehensive unit tests.
- Always run the relevant test suite and type checks (`tsc --noEmit`) before declaring any task complete.
- Edge cases must be explicitly tested: repeated letters, identical guess and answer, disjoint alphabets, candidate pool exhaustion, and resource-limit triggers.

---

## 4. Git & Version Control Protocol

- Check repository status (`git status`) before making edits.
- Never perform destructive Git operations (`git reset --hard`, `git clean -fd`, `git push --force`) without explicit instruction from the user.
- Maintain clean, descriptive commit messages tagged by stage (e.g., `feat(solver): implement repeated-letter feedback engine (Stage 1)`).
- Preserve existing user-authored files, comments, and configuration.

---

## 5. Decision Escalation Protocol

Stop and ask the user for guidance whenever:
1. Workspace path is ambiguous or outside `WordleSolver`.
2. A choice between conflicting external requirements arises.
3. Dataset licensing or provenance cannot be confirmed as freely redistributable.
4. The target Wordle website's DOM structure needs verification during Stage 5.
5. A stage is finished and authorization is required to proceed to the next stage.
