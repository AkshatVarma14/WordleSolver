import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CandidateViewer } from '../src/components/CandidateViewer';
import { RecommendationPanel } from '../src/components/RecommendationPanel';
import { StrategyControls } from '../src/components/StrategyControls';
import { ComparisonModal } from '../src/components/ComparisonModal';
import { DEFAULT_SEARCH_BUDGET, RecommendationResult } from '@wordle-solver/solver';

describe('Web UI Components Specification Tests', () => {
  describe('CandidateViewer Component', () => {
    it('Displays candidate count, reduction percentage, and candidate chips', () => {
      let selected = '';
      render(
        <CandidateViewer
          candidates={['CRANE', 'SLATE', 'TRACE']}
          totalInitial={2315}
          isContradiction={false}
          onSelectWord={(w) => {
            selected = w;
          }}
        />
      );

      expect(screen.getByText('3')).toBeDefined();
      expect(screen.getByText('/ 2,315')).toBeDefined();
      expect(screen.getByText('CRANE')).toBeDefined();

      fireEvent.click(screen.getByText('CRANE'));
      expect(selected).toBe('CRANE');
    });

    it('Renders prominent alert when contradiction is detected', () => {
      render(
        <CandidateViewer
          candidates={[]}
          totalInitial={2315}
          isContradiction={true}
          onSelectWord={() => {}}
        />
      );

      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/Contradiction Detected: 0 candidates remain/i)).toBeDefined();
    });

    it('Filters candidate chips using search input', () => {
      render(
        <CandidateViewer
          candidates={['CRANE', 'SLATE', 'ROBOT']}
          totalInitial={3}
          isContradiction={false}
          onSelectWord={() => {}}
        />
      );

      const searchInput = screen.getByLabelText('Filter remaining candidate words');
      fireEvent.change(searchInput, { target: { value: 'ROB' } });

      expect(screen.getByText('ROBOT')).toBeDefined();
      expect(screen.queryByText('CRANE')).toBeNull();
      expect(screen.queryByText('SLATE')).toBeNull();
    });
  });

  describe('RecommendationPanel Component', () => {
    const sampleRec: RecommendationResult = {
      recommendedGuess: 'CRANE',
      strategy: 'FAST_ENTROPY',
      candidatesCount: 2315,
      isContradiction: false,
      isWon: false,
      evaluation: {
        guess: 'CRANE',
        isCandidate: true,
        entropyBits: 5.74,
        expectedRemaining: 48.2,
        worstCasePartitionSize: 263,
        distinctPatternsCount: 142,
        immediateWinProbability: 1 / 2315,
      },
      topRanked: [],
      explanation: "Recommended 'CRANE': Provides 5.74 bits of Shannon entropy.",
    };

    it('Renders recommended guess, autofill button, and metrics', () => {
      let autofilled = '';
      render(
        <RecommendationPanel
          recommendation={sampleRec}
          loading={false}
          strategy="FAST_ENTROPY"
          onAutofill={(w) => {
            autofilled = w;
          }}
        />
      );

      expect(screen.getByText('CRANE')).toBeDefined();
      expect(screen.getByText('5.74')).toBeDefined();
      expect(screen.getByText('48.2')).toBeDefined();

      const fillBtn = screen.getByRole('button', { name: /fill word/i });
      fireEvent.click(fillBtn);
      expect(autofilled).toBe('CRANE');
    });

    it('Displays loading state during search execution', () => {
      render(
        <RecommendationPanel
          recommendation={null}
          loading={true}
          strategy="BOUNDED_MINIMAX"
          onAutofill={() => {}}
        />
      );

      expect(screen.getByText(/Evaluating game tree.../i)).toBeDefined();
    });

    it('Renders guarantee status badge accurately (PROVED_WIN and UNRESOLVED)', () => {
      const provedRec: RecommendationResult = {
        ...sampleRec,
        status: 'PROVED_WIN',
        strategy: 'BOUNDED_MINIMAX',
        searchMetrics: {
          nodesExpanded: 45,
          durationMs: 12,
          depthReached: 2,
          worstCaseTurns: 2,
          hitResourceLimit: false,
          status: 'PROVED_WIN',
          memoHits: 5,
        },
      };

      const { rerender } = render(
        <RecommendationPanel
          recommendation={provedRec}
          loading={false}
          strategy="BOUNDED_MINIMAX"
          onAutofill={() => {}}
        />
      );

      expect(screen.getByText(/Proved Win Guaranteed/i)).toBeDefined();
      expect(screen.getByText(/45/)).toBeDefined();

      // Test UNRESOLVED status
      const unresolvedRec: RecommendationResult = {
        ...sampleRec,
        status: 'UNRESOLVED_RESOURCE_LIMIT',
        strategy: 'BOUNDED_MINIMAX',
        warning: 'Search budget limit reached',
      };

      rerender(
        <RecommendationPanel
          recommendation={unresolvedRec}
          loading={false}
          strategy="BOUNDED_MINIMAX"
          onAutofill={() => {}}
        />
      );

      expect(screen.getByText(/Bounded Heuristic/i)).toBeDefined();
      expect(screen.getByText(/Search budget limit reached/i)).toBeDefined();
    });
  });

  describe('StrategyControls Component', () => {
    it('Toggles strategy selection and triggers callbacks', () => {
      let selectedStrat = 'FAST_ENTROPY';
      let resetCalled = false;
      let compareCalled = false;

      render(
        <StrategyControls
          strategy="FAST_ENTROPY"
          onSelectStrategy={(s) => {
            selectedStrat = s;
          }}
          budget={DEFAULT_SEARCH_BUDGET}
          onUpdateBudget={() => {}}
          onCompare={() => {
            compareCalled = true;
          }}
          onReset={() => {
            resetCalled = true;
          }}
          onClearRow={() => {}}
          onSubmitRow={() => {}}
          hasRowInput={false}
        />
      );

      fireEvent.click(screen.getByRole('radio', { name: /bounded deeper search/i }));
      expect(selectedStrat).toBe('BOUNDED_MINIMAX');

      fireEvent.click(screen.getByRole('button', { name: /compare strategies/i }));
      expect(compareCalled).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: /reset/i }));
      expect(resetCalled).toBe(true);
    });
  });

  describe('ComparisonModal Component', () => {
    it('Renders side-by-side strategy comparison table and closes on click', () => {
      let closed = false;
      const fastResult: RecommendationResult = {
        recommendedGuess: 'CRANE',
        strategy: 'FAST_ENTROPY',
        candidatesCount: 100,
        isContradiction: false,
        isWon: false,
        evaluation: {
          guess: 'CRANE',
          isCandidate: true,
          entropyBits: 5.2,
          expectedRemaining: 12.0,
          worstCasePartitionSize: 18,
          distinctPatternsCount: 25,
          immediateWinProbability: 0.01,
        },
        topRanked: [],
        explanation: 'Fast Entropy recommendation.',
      };

      const deeperResult: RecommendationResult = {
        recommendedGuess: 'TRACE',
        strategy: 'BOUNDED_MINIMAX',
        candidatesCount: 100,
        isContradiction: false,
        isWon: false,
        evaluation: {
          guess: 'TRACE',
          isCandidate: true,
          entropyBits: 5.1,
          expectedRemaining: 13.0,
          worstCasePartitionSize: 15,
          distinctPatternsCount: 24,
          immediateWinProbability: 0.01,
        },
        topRanked: [],
        status: 'PROVED_WIN',
        searchMetrics: {
          nodesExpanded: 120,
          durationMs: 18,
          depthReached: 2,
          worstCaseTurns: 3,
          hitResourceLimit: false,
          status: 'PROVED_WIN',
          memoHits: 12,
        },
        explanation: 'Minimax recommendation.',
      };

      render(
        <ComparisonModal
          isOpen={true}
          onClose={() => {
            closed = true;
          }}
          fastResult={fastResult}
          deeperResult={deeperResult}
          candidatesCount={100}
        />
      );

      expect(screen.getByText('CRANE')).toBeDefined();
      expect(screen.getByText('TRACE')).toBeDefined();
      expect(screen.getByText(/5.20 bits/i)).toBeDefined();
      expect(screen.getByText(/3 turns/i)).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
      expect(closed).toBe(true);
    });
  });
});
