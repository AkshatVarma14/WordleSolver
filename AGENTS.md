# AGENTS.md — Operational Instructions for AI Agents

Welcome, Agent. You are assisting in developing the **Wordle Solver** project for the **Artificial Intelligence and Soft Computing (AISC, CSE3121)** course. This document contains mandatory rules that govern your actions in this repository.

---

## 1. Golden Rules of Workspace Isolation

1. **Strict Target Workspace:**
   Your authorized workspace is exclusively:
   ```text
   C:\Users\aksha\OneDrive\Documents\WordleSolver
   ```
2. **Zero Interaction with Other Projects:**
   - Under NO circumstances should you navigate into, search within, read from, edit, rename, or delete files belonging to `LifeHub` or any other project directory on the host machine.
   - Do NOT run directory scans on parent paths (`..` or `C:\Users\aksha\...`).
   - If any command prompt or tool call defaults to an outside path, stop immediately and reset to the workspace root.
3. **No External Config Tampering:**
   Do NOT modify global settings in user home directories, global Antigravity config, or shell profiles.

---

## 2. Gated Stage Execution

You must follow the 8-stage roadmap sequentially:
- **Stage 0:** Specification, architecture, project instructions, and roadmap (Current).
- **Stage 1:** Repository setup, monorepo configuration, and tested feedback engine.
- **Stage 2:** Candidate filtering and fast information-gain (entropy) strategy.
- **Stage 3:** Bounded deeper-search strategy with honest guarantee statuses.
- **Stage 4:** Standalone web application (React + Vite).
- **Stage 5:** Chrome extension (Manifest V3) and verified target-site integration.
- **Stage 6:** Simulation harness, comparative evaluation, and benchmark analysis.
- **Stage 7:** Documentation, release packaging, deployment, and viva defense preparation.

> **CRITICAL RULE:**
> Never proceed to the next stage automatically. When your stage work is complete, deliver the Stage Completion Report, present the Stage Checklist for the next stage, and **STOP**. Wait for explicit user approval before beginning the next stage.

---

## 3. Engineering & Implementation Rules

1. **Pure TypeScript Monorepo:**
   - Shared solver logic belongs strictly in `packages/solver` with zero DOM or Node.js runtime couplings.
   - Both the web application (`apps/web`) and extension (`apps/extension`) must consume this shared solver package.
   - Maintain strict typing (`"strict": true` in `tsconfig.json`). Avoid `any` types.
2. **Zero-Cost & Offline Execution:**
   - No external APIs, paid LLM endpoints, backend microservices, or databases.
   - The application must function entirely client-side in the browser.
3. **Test-Driven & Verification-First:**
   - Implement tests in parallel with algorithms using Vitest.
   - Every algorithmic change must be validated with automated tests and type checks (`npx vitest run`, `npx tsc --noEmit`).
   - Include specific edge cases: duplicate letters, disjoint sets, empty candidate lists, and search depth cutoffs.
4. **Honesty & Academic Integrity:**
   - Never fabricate benchmark results, solve times, or node counts. If an evaluation has not been executed, state that clearly.
   - Differentiate strictly between a heuristic choice, a provably verified win within budget $k$, a disproved win, and an unresolved search due to resource limits (timeout/node cap).
   - Never label a resource-limited search as a mathematical proof that no solution exists.

---

## 4. Git & File Integrity

1. **Pre-edit Check:** Always run `git status` or inspect existing files before making changes.
2. **Non-destructive Policy:** Do not perform destructive operations (`git reset --hard`, `git clean -f`, deleting user files) unless explicitly instructed by the user.
3. **Preserve User Code:** If the user adds custom files, comments, or configurations, preserve them.
4. **Checkpoints:** Each stage should culminate in a clean Git commit with a standardized commit message format once Git is initialized in Stage 1.

---

## 5. Decision Escalation Protocol

Stop and ask the user directly when:
- An essential decision is ambiguous (e.g., choice of target Wordle site for the extension).
- A dataset license or provenance cannot be confirmed as free and open.
- A technical trade-off significantly affects performance or system scope.
- Stage exit criteria are met and sign-off is needed to advance.
