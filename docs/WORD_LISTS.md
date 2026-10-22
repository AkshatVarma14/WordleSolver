# docs/WORD_LISTS.md — Word List Provenance, Licensing, and Dataset Verification

## 1. Executive Summary

This document records the exact provenance, licensing terms, validation metrics, and actual word counts for the datasets incorporated into the Wordle Solver project in **Stage 2**.

Both datasets are hosted in `data/`:
- `data/answers.txt`: Curated target solution vocabulary ($A$).
- `data/valid-guesses.txt`: Comprehensive allowable guess vocabulary ($G$).

---

## 2. Provenance, Licensing, and Attribution

### 2.1 Primary Repository Source
- **Repository:** [`joshstephenson/Wordle-Solver`](https://github.com/joshstephenson/Wordle-Solver)
- **Author:** Josh Stephenson
- **License:** **MIT License** (verified from source repository root `LICENSE`)
- **License Text / Permissions:**
  ```text
  MIT License
  Copyright (c) 2025 Josh Stephenson
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so...
  ```
- **Attribution Notice:** Word list files derived from Josh Stephenson's open-source Wordle Solver repository, distributed under the MIT License.

### 2.2 Underlying Linguistic Origin & Lexical History
- **ENABLE Benchmark Lexicon:** The broader 5-letter English word vocabulary traces historically to the Enhanced North American Benchmark Lexicon (ENABLE, compiled by Alan Beale and M. Cooper, 1997), explicitly placed into the **Public Domain**.
- **Wordle Solution Curation:** The ~2,315 word answer pool represents common, non-obscure 5-letter English words selected for accessibility.
- **Copyright Status:** Under US copyright law (*Feist Publications v. Rural Telephone Service*, 499 U.S. 340 (1991)), raw alphabetical lists of common dictionary words are uncopyrightable facts. The MIT-licensed packaging by Josh Stephenson provides explicit redistribution rights under open-source software terms.

---

## 3. Dataset Validation & Measured Word Counts

Both files were verified using programmatic integrity checks (`tests` and validation scripts) ensuring strict adherence to the Wordle problem formulation:

| Metric | `data/answers.txt` | `data/valid-guesses.txt` | Combined / Invariant Check |
| :--- | :--- | :--- | :--- |
| **Actual Word Count** | **2,315** | **12,953** | 10,638 non-answer valid guesses |
| **Word Length** | Exactly 5 characters (100%) | Exactly 5 characters (100%) | $L = 5$ invariant held |
| **Character Set** | ASCII lowercase `[a-z]` | ASCII lowercase `[a-z]` | Zero symbols, spaces, or numbers |
| **Duplicates** | 0 (all unique) | 0 (all unique) | Sets strictly deduplicated |
| **Ordering** | Lexicographical (alphabetical) | Lexicographical (alphabetical) | Deterministic indexing |
| **Subset Invariant** | $A \subset G$ | $G \supset A$ | **Verified:** Every word in $A$ exists in $G$ |

---

## 4. Academic Relevance & Problem Formulation

- **Probing Guesses Outside Answers ($G \setminus A$):** The 10,638 non-answer allowable guesses provide the AI solver with exploratory probes. Often, a word with high vowel/consonant diversity from $G \setminus A$ (e.g., `SOARE`, `ROATE`, `TARES`, `SALET`) delivers higher Shannon entropy than any candidate in $A$, accelerating candidate set reduction even though it cannot win immediately.

---

## 5. Live NYT Wordle Divergence & Graceful Discrepancy Handling

### 5.1 Classical Wordle Baseline vs. Live NYT Editorial Adjustments
- **Classical Baseline:** The 2,315 words in `data/answers.txt` and 12,953 words in `data/valid-guesses.txt` match the classical original Wordle baseline (created by Josh Wardle in 2021).
- **Post-2022 NYT Editorial Changes:** Following The New York Times' acquisition of Wordle in February 2022 and the subsequent appointment of a dedicated Wordle editor (Tracy Bennett, late 2022), the live game has experienced editorial alterations:
  - Removal of sensitive, archaic, or offensive words (e.g., `AGORA`, `PUPAL`, `SLAVE`, `WENCH`).
  - Addition of modern slang and colloquial expressions to the accepted valid-guesses dictionary.
  - Periodic reordering and ad-hoc editorial selection of daily solution words rather than strictly following the original static chronological array.
- **Honest Accuracy Disclosure:** We explicitly do **not** claim real-time synchronization with proprietary live NYT editorial servers. The included word lists represent the open-source classical Wordle benchmark, universally recognized in academic solver literature.

### 5.2 Graceful Discrepancy Handling in Web App & Extension
To ensure uninterrupted operation when encountering words altered by NYT editors:
1. **Permissive Input Validation:** The guess input validation logic accepts any valid 5-letter alphabetical sequence (`[A-Za-z]{5}`). The solver never blocks a user from entering an unlisted guess that NYT accepts.
2. **Dynamic Candidate Filtering:** Filtering operates strictly on ternary feedback patterns ($0, 1, 2$) generated against candidate words. Probing with an unlisted word filters the remaining candidates with complete mathematical consistency.
3. **Contradiction State Detection:** If NYT selects an answer not present in the classical 2,315-word answer dictionary, candidate filtering will narrow the pool to 0 remaining words. Rather than throwing an exception or hanging, the solver cleanly renders a contradiction alert informing the user that 0 dictionary words match the observed feedback, allowing immediate review or manual board adjustment.
4. **Manual Feedback Override:** All tiles in the active row (and in the extension UI) support cycling feedback states (Grey → Yellow → Green) with single clicks, giving the user complete authority to match whatever feedback appears on their screen.
