import React, { useState, useEffect } from 'react';
import { DEFAULT_SEARCH_BUDGET, SearchBudget, StrategyType } from '@wordle-solver/solver';
import { Header } from './components/Header';
import { Board } from './components/Board';
import { Keyboard } from './components/Keyboard';
import { StrategyControls } from './components/StrategyControls';
import { RecommendationPanel } from './components/RecommendationPanel';
import { CandidateViewer } from './components/CandidateViewer';
import { ComparisonModal } from './components/ComparisonModal';
import { useWordleBoard } from './hooks/useWordleBoard';
import { useSolverWorker } from './hooks/useSolverWorker';
import { INITIAL_ANSWERS } from './data/words';
import './App.css';

export const App: React.FC = () => {
  const [strategy, setStrategy] = useState<StrategyType>('FAST_ENTROPY');
  const [budget, setBudget] = useState<SearchBudget>(DEFAULT_SEARCH_BUDGET);
  const [isCompareOpen, setIsCompareOpen] = useState<boolean>(false);

  const {
    history,
    currentGuess,
    currentFeedback,
    activeRowIndex,
    validationError,
    isComplete,
    addLetter,
    deleteLetter,
    toggleTileFeedback,
    submitTurn,
    clearCurrentRow,
    resetBoard,
    applyRecommendation,
  } = useWordleBoard();

  const {
    loading,
    recommendation,
    remainingCandidates,
    candidatesCount,
    isContradiction,
    error: workerError,
    compareData,
    requestSolve,
    requestCompare,
    clearCompare,
  } = useSolverWorker();

  // Re-run solver whenever history, strategy, or budget changes
  useEffect(() => {
    requestSolve(history, strategy, budget);
  }, [history, strategy, budget, requestSolve]);

  // Physical keyboard event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture keyboard shortcuts if user is typing in a search/input element
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        isCompareOpen
      ) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        submitTurn();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        deleteLetter();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        addLetter(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitTurn, deleteLetter, addLetter, isCompareOpen]);

  const handleOpenCompare = () => {
    requestCompare(history, budget);
    setIsCompareOpen(true);
  };

  const handleCloseCompare = () => {
    setIsCompareOpen(false);
    clearCompare();
  };

  return (
    <div className="app-layout">
      <Header />

      <main className="main-content">
        <div className="board-section">
          {validationError && (
            <div className="validation-alert" role="alert">
              ⚠️ {validationError}
            </div>
          )}

          {workerError && (
            <div className="worker-error-alert" role="alert">
              ⚠️ {workerError}
            </div>
          )}

          <Board
            history={history}
            currentGuess={currentGuess}
            currentFeedback={currentFeedback}
            activeRowIndex={activeRowIndex}
            onToggleTileFeedback={toggleTileFeedback}
          />

          <StrategyControls
            strategy={strategy}
            onSelectStrategy={setStrategy}
            budget={budget}
            onUpdateBudget={setBudget}
            onCompare={handleOpenCompare}
            onReset={resetBoard}
            onClearRow={clearCurrentRow}
            onSubmitRow={submitTurn}
            hasRowInput={currentGuess.length > 0}
          />

          <Keyboard
            onKeyPress={addLetter}
            onDelete={deleteLetter}
            onSubmit={submitTurn}
            disabled={isComplete}
          />
        </div>

        <div className="solver-sidebar">
          <RecommendationPanel
            recommendation={recommendation}
            loading={loading}
            strategy={strategy}
            onAutofill={applyRecommendation}
          />

          <CandidateViewer
            candidates={remainingCandidates}
            totalInitial={INITIAL_ANSWERS.length}
            isContradiction={isContradiction}
            onSelectWord={applyRecommendation}
          />
        </div>
      </main>

      <ComparisonModal
        isOpen={isCompareOpen}
        onClose={handleCloseCompare}
        fastResult={compareData?.fastResult ?? null}
        deeperResult={compareData?.deeperResult ?? null}
        candidatesCount={candidatesCount}
      />
    </div>
  );
};
