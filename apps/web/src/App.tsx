import React, { useEffect } from 'react';
import { Header } from './components/Header';
import { Board } from './components/Board';
import { Keyboard } from './components/Keyboard';
import { StrategyControls } from './components/StrategyControls';
import { RecommendationPanel } from './components/RecommendationPanel';
import { CandidateViewer } from './components/CandidateViewer';
import { useWordleBoard } from './hooks/useWordleBoard';
import { useSolverWorker } from './hooks/useSolverWorker';
import { INITIAL_ANSWERS } from './data/words';
import './App.css';

export const App: React.FC = () => {
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
    isContradiction,
    error: workerError,
    requestSolve,
  } = useSolverWorker();

  // Execute unified solver whenever game observation history changes
  useEffect(() => {
    requestSolve(history);
  }, [history, requestSolve]);

  // Physical keyboard event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture keyboard shortcuts if user is typing in a search/input element
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
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
  }, [submitTurn, deleteLetter, addLetter]);

  return (
    <div className="app-layout">
      <Header />

      <main className="main-content">
        <div className="board-section">
          {validationError && (
            <div className="validation-alert" role="alert">
              {validationError}
            </div>
          )}

          {workerError && (
            <div className="worker-error-alert" role="alert">
              {workerError}
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
    </div>
  );
};
