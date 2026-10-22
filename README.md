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
│       │   └── types.ts      # Core domain types & guarantee enumerations
├── data/
│   ├── answers.txt           # Secret target dictionary (candidate set A)
│   └── valid-guesses.txt     # Complete allowed guess dictionary (guess set G)
├── tests/                    # Integration and small-state exhaustive test suites
├── scripts/                  # Simulation runner and performance benchmark scripts
├── docs/                     # Comprehensive architecture and algorithm documentation
│   ├── REQUIREMENTS.md       # Functional & non-functional requirements
│   ├── ARCHITECTURE.md       # Monorepo architecture & component interaction
│   ├── ALGORITHMS.md         # Detailed mathematical derivations & algorithm specs
│   ├── TESTING.md            # Test harnesses, edge-case specs & small-state proofs
│   └── ROADMAP.md            # Gated 8-stage implementation roadmap
├── AGENTS.md                 # Autonomous AI agent operating guidelines
├── PROJECT_INSTRUCTIONS.md   # Project governance & isolation protocols
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

## Project Status & Roadmap

The project is governed by an **8-stage gated roadmap**:

- [x] **Stage 0:** Specification, Architecture, and Project Governance
- [ ] **Stage 1:** Repository Setup, Monorepo Configuration, and Tested Feedback Engine
- [ ] **Stage 2:** Candidate Filtering and Fast Information-Gain (Entropy) Strategy
- [ ] **Stage 3:** Bounded Deeper-Search Strategy with Honest Guarantee Statuses
- [ ] **Stage 4:** Standalone Responsive Web Application (React + Vite)
- [ ] **Stage 5:** Chrome Browser Extension (Manifest V3) & Verified DOM Extraction
- [ ] **Stage 6:** Simulation Harness, Benchmark Analysis, and Comparative Evaluation
- [ ] **Stage 7:** Documentation, Release Packaging, Deployment, and Viva Defense Preparation

---

## Setup & Development (Preview)

*Note: Stage 0 is planning and specification only. Dependency installation and build steps will be activated starting in Stage 1.*

```bash
# Clone the repository
git clone https://github.com/<username>/wordle-solver.git
cd wordle-solver

# Install dependencies (from Stage 1)
npm install

# Run automated test suites
npm test

# Launch standalone web application
npm run dev --workspace=apps/web

# Build Chrome extension package
npm run build --workspace=apps/extension
```

---

## Licensing & Provenance

- **Source Code:** Released under the [MIT License](LICENSE).
- **Word Lists:** Word lists used in `data/` will be verified for open, non-infringing provenance prior to inclusion in Stage 1. No proprietary or copyrighted assets are bundled.
