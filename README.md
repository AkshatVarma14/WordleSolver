# Wordle Solver — Intelligent AI Wordle Assistant

[![Course](https://img.shields.io/badge/Course-AISC%20(CSE3121)-blue.svg)](#academic-context)
[![Language](https://img.shields.io/badge/Language-TypeScript%205.x-3178c6.svg)](#technical-stack)
[![Architecture](https://img.shields.io/badge/Architecture-Shared%20Core%20Monorepo-orange.svg)](#architecture-overview)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](#licensing--provenance)

An intelligent, deterministic Wordle solver and decision-support tool developed for **Artificial Intelligence and Soft Computing (AISC, CSE3121)**. The system implements information-theoretic heuristic search (Shannon Entropy) and bounded game-tree search (Minimax with alpha-beta pruning and memoization) to evaluate and recommend optimal Wordle guesses.

The project delivers **two interfaces backed by a single deterministic TypeScript solver engine**:
1. **A Standalone Responsive Web Application** (React + Vite) with interactive grid, tile-state toggling, live candidate inspection, and heuristic comparison metrics.
2. **A Chrome Browser Extension (Manifest V3)** designed to read target Wordle game boards directly with an automatic manual-input fallback.

Both interfaces execute 100% locally in the browser with **zero backend servers, zero paid AI APIs, zero databases, and zero recurring hosting costs**.

---

## Academic Context (AISC CSE3121)

This project models Wordle as a **partially observable sequential decision process / deterministic observation game**. It explores and contrasts two distinct algorithmic paradigms:
- **Greedy Heuristic Search (Information Gain):** Maximizing Expected Information Gain (Shannon Entropy $H(g)$) to partition the remaining candidate space into maximum-uniformity clusters.
- **Bounded Adversarial/Game-Tree Search (Minimax with Pruning):** Treating the feedback pattern as an adversarial response or worst-case branching factor, minimizing worst-case remaining turns with memoized transposition tables and branch-and-bound cutoffs.

### Key Theoretical Highlights
- **Exact Feedback Semantics:** Formal implementation of Wordle's color assignment rules (Green exact matches prioritize first, Yellow positional matches consume remaining answer letter frequencies left-to-right, excess becomes Grey).
- **Separation of Answer Space ($A$) and Guess Space ($G$):** Correctly models that probing words outside the candidate set $C \subseteq A$ often provides higher entropy than playing within $C$.
- **Honest Strategy Guarantees:** Mathematically sound classification of search outcomes (`WON`, `PROVED_WIN`, `DISPROVED_WIN`, `UNRESOLVED_RESOURCE_LIMIT`) without false proofs or unverified claims of global optimality.

---

## Architecture Overview

```text
Wordle-Solver/
├── apps/
│   ├── web/                  # Standalone React + Vite web application
│   └── extension/            # Manifest V3 Chrome extension (popup + content script)
├── packages/
│   └── solver/               # Pure deterministic TypeScript solver engine (zero DOM deps)
│       ├── src/
│       │   ├── feedback.ts   # Exact tile feedback evaluator & repeated letter logic
│       │   ├── filter.ts     # Candidate state partitioner & candidate reducer
│       │   ├── entropy.ts    # Shannon entropy & expected remaining candidates
│       │   ├── search.ts     # Bounded minimax lookahead, memoization & pruning
│       │   ├── contribution.ts # Missing-answer discovery & telemetry queue
│       │   ├── review.ts     # Authoritative verification & audit records
│       │   ├── manifest.ts   # Canonical dictionary manifest & SHA-256 integrity
│       │   ├── sync.ts       # Runtime-agnostic sync coordinator & offline cache
│       │   └── types.ts      # Core domain types & guarantee enumerations
├── data/
│   ├── answers.txt           # Secret target dictionary (candidate set A)
│   └── valid-guesses.txt     # Complete allowed guess dictionary (guess set G)
├── tests/                    # Integration and small-state exhaustive test suites
├── scripts/                  # Simulation runner, benchmark & administrative tools
├── docs/                     # Comprehensive architecture and developer documentation
│   ├── REQUIREMENTS.md       # Functional & non-functional requirements
│   ├── ARCHITECTURE.md       # Monorepo architecture & component interaction
│   ├── ALGORITHMS.md         # Detailed mathematical derivations & algorithm specs
│   ├── TESTING.md            # Test harnesses, edge-case specs & small-state proofs
│   ├── CONTRIBUTION_PIPELINE.md # Missing-answer contribution pipeline specification
│   ├── ADMIN_REVIEW.md       # Manual administrator review workflow & CLI
│   └── TRUSTED_DICTIONARY_ARCHITECTURE.md # Trusted dictionary lifecycle & sync service
└── README.md                 # Project presentation & portfolio overview
```

---

## Algorithm Summary

| Strategy | Objective Function | Complexity (per turn) | Strengths | Limitations |
| :--- | :--- | :--- | :--- | :--- |
| **Fast Strategy (Entropy)** | Maximize Shannon Entropy: $H(g) = -\sum P(p) \log_2 P(p)$ | $O(\|G\| \cdot \|C\|)$ | Very fast ($\approx 10\text{--}50\text{ ms}$), minimizes average remaining candidates. | Greedy single-ply; does not foresee 2-ply trap patterns (e.g. `_OUND`). |
| **Bounded Deeper Search** | Minimax turn minimization: $\min_g \max_p d^*(C_{g,p})$ | $O\left((\|G\| \cdot 243)^d\right)$ (pruned via branch bounds & memoization) | Defends against worst-case dead ends; guarantees win if proof completes. | Computationally intensive; requires strict time and node budgets on client. |

---

## Honest Guarantee Reporting Framework

Unlike naive solvers that declare a solution impossible if a shallow search fails, this system enforces rigorous status outcomes:

- `WON`: The secret target word has been uniquely identified and confirmed.
- `PROVED_WIN`: Exhaustive game-tree search verified that all words in $C$ can be solved within the remaining turn budget $k$.
- `DISPROVED_WIN`: Complete, unpruned game-tree exploration proved no sequence of guesses can guarantee a win for all words in $C$ within $k$ turns.
- `UNRESOLVED_RESOURCE_LIMIT`: Search halted due to node expansion ceiling, time budget cutoff, or depth limit. The system explicitly reports this as an unresolved search, never as a proof of impossibility.
- `GLOBAL_OPTIMALITY`: Never claimed for the initial 2,309-word game unless cross-referenced with complete, published mathematical proofs.

---

## Project Status & Implementation Milestones

The project has completed core solver development, interface packaging, rigorous testing (298/298 tests passing), and zero-trust synchronization foundations:

- [x] **Stage 0: Specification, Architecture, and Project Governance** — Formal problem formulation, game-tree modeling, and information-theoretic design.
- [x] **Stage 1: Repository Setup, Monorepo Configuration, and Tested Feedback Engine** — High-performance zero-allocation ternary feedback evaluator (`feedback.ts`).
- [x] **Stage 2: Candidate Filtering and Fast Information-Gain (Entropy) Strategy** — Shannon entropy calculation and candidate state reducer (`filter.ts`, `entropy.ts`).
- [x] **Stage 3: Bounded Deeper-Search Strategy with Honest Guarantee Statuses** — Minimax turn minimization with memoization and branch-and-bound cutoffs (`search.ts`).
- [x] **Stage 4: Standalone Responsive Web Application** — Interactive React 19 + Vite interface with Web Worker solving (`apps/web`).
- [x] **Stage 5: Chrome Browser Extension (Manifest V3)** — Direct Wordle DOM extraction with popup interface and manual fallback (`apps/extension`).
- [x] **Stage 6: Simulation Harness and Comparative Benchmark** — End-to-end game simulation runner and AISC benchmark evaluation (`scripts/simulate.ts`, `scripts/benchmark.ts`).
- [x] **Stage 7 & 8: Performance Optimization, Production Polish, and Presentation Freeze** — Layered candidate recovery, sub-millisecond execution, and complete documentation.
- [ ] **Stage 9: Community-Driven Trusted Dictionary Integration (Offline-First, Zero-Cost)**
  - [x] **Stage 9B:** Client win detection and quarantined contribution pipeline (`packages/solver/src/contribution.ts`).
  - [x] **Stage 9C:** Authoritative administrator review workflow and verification CLI (`packages/solver/src/review.ts`, `scripts/admin-review.ts`).
  - [x] **Stage 9D.1:** Canonical dictionary manifest schema, FIPS 180-4 SHA-256 integrity, and deterministic merge logic (`packages/solver/src/manifest.ts`).
  - [x] **Stage 9D.2:** Platform-agnostic sync coordinator, cache contracts, 12-hour TTL, and offline fallback (`packages/solver/src/sync.ts`).
  - [ ] **Stage 9D.3:** Web application and Chrome extension synchronization integration (Planned).
  - [ ] **Stage 9D.4:** Administrator publication CLI (`scripts/admin-publish.ts`) and production deployment (Planned).

---

## Setup & Development

```bash
# Clone the repository
git clone https://github.com/AkshatVarma14/WordleSolver.git
cd WordleSolver

# Install dependencies across all workspaces
npm install

# Run automated test suites (298 tests)
npm test

# Type-check all packages
npm run typecheck

# Launch standalone web application locally (Vite dev server)
npm run dev

# Build standalone web application for production
npm run build:web

# Build Manifest V3 Chrome extension package
npm run build:extension

# Build all packages and applications
npm run build
```

---

## Licensing & Provenance

- **Source Code:** Released under the [MIT License](LICENSE).
- **Word Lists:** Word lists bundled in `data/` (`answers.txt` and `valid-guesses.txt`) are curated from standard open-source Wordle word lists with non-infringing provenance. No proprietary or copyrighted assets are bundled.
