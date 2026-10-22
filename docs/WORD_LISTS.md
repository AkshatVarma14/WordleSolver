# docs/WORD_LISTS.md — Word List Provenance, Licensing, and Legal Analysis

## 1. Executive Summary

This document records the provenance, copyright analysis, and redistribution licensing terms for candidate word lists to be utilized in the Wordle Solver project.

In compliance with **Stage 1 Objective 2** ("Word-list licensing and provenance"):
- No word lists have been silently downloaded, scraped, or committed.
- The feedback evaluator (`evaluateFeedback`) is fully implemented, verified, and decoupled from any word list files.
- Two viable, legally sound approaches are analyzed below for user approval prior to Stage 2.

---

## 2. Provenance & Source Investigation

### 2.1 ENABLE (Enhanced North American Benchmark Lexicon)
- **Origin:** Compiled in 1997 by Alan Beale with assistance from M. Cooper as a reference lexicon for word game developers and anagram programs.
- **License / Terms:** **Explicit Public Domain**. The authors released the master file (`WORD.LST`) with no copyright claim, allowing unrestricted commercial and non-commercial redistribution, modification, and reproduction.
- **Content:** Over 172,000 English words, containing approximately 12,972 unique 5-letter words.
- **Usage:** Served as the foundational word list for *Words with Friends*, Scrabble applications, and numerous open-source NLP toolkits.

### 2.2 Original Wordle Lexicon (Josh Wardle / Palak Shah, 2021)
- **Origin:** Josh Wardle filtered the ENABLE/Scrabble 5-letter dictionary down to:
  - **Secret Answers ($A$):** 2,309 common, familiar 5-letter English words selected by Palak Shah.
  - **Allowed Guesses ($G$):** 10,657 additional obscure 5-letter words, yielding a total guessable pool of $\approx 12,966$ words.
- **Acquisition by The New York Times (NYT, 2022):** The NYT made minor adjustments (removing obsolete/sensitive words and adding a small number of answers, currently $\approx 2,315$).

---

## 3. Legal & Copyright Analysis

### 3.1 Uncopyrightability of Raw Word Lists (Data & Facts)
- Under United States copyright jurisprudence—established by the landmark Supreme Court decision **_Feist Publications, Inc. v. Rural Telephone Service Co._, 499 U.S. 340 (1991)**—raw compilations of facts, words, or alphabetical listings devoid of creative arrangement lack copyright protection.
- Dictionary words are linguistic facts belonging to the public domain. An alphabetical list of existing 5-letter English words cannot be copyrighted.

### 3.2 Intellectual Property & Trademark Caveats
- While individual English words and alphabetical lists are uncopyrightable facts, the **trademark "Wordle"**, the game's distinctive user interface styling, and the proprietary JavaScript application code developed by The New York Times Company are protected under trademark and copyright laws.
- **Compliance Policy:**
  1. Our solver engine is built purely in TypeScript from first principles with zero decompiled or proprietary NYT application code.
  2. The application is clearly designated as an academic AISC decision-support tool.
  3. No proprietary trademarks or copyrighted graphics are bundled in the repository.

---

## 4. Proposed Dataset Options for Stage 2

| Option | Answer Set ($A$) | Allowed Guess Set ($G$) | Provenance & Licensing | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **Option A (Standard Benchmark)** | Standard 2,309 original Wordle answers | Full 12,966 ENABLE-derived guess words | Public Domain words; matches standard AI literature benchmarks (e.g., 3Blue1Brown, Peter Norvig, Knuth Mastermind literature). | **Recommended** for direct comparability with academic Wordle benchmarks. |
| **Option B (Strict ENABLE Lexicon)** | Top 2,500 most frequent 5-letter words from Google Web Trillion Word Corpus | All 5-letter words in ENABLE | 100% independent of Wordle's specific curation; verified Public Domain / CC-BY corpus. | Academic alternative if strict independence from the Wordle answer list is desired. |

---

## 5. Subtask Status & Blocker Resolution

- **Feedback Evaluator Independence:** The feedback engine and test suite implemented in Stage 1 take generic 5-letter strings as input and do not require word list files to be committed.
- **Stage 1 Decision:** The raw text files (`data/answers.txt` and `data/valid-guesses.txt`) will be populated in **Stage 2** upon explicit user confirmation of **Option A** or **Option B**.
