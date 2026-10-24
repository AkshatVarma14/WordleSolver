import React, { useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Board } from './components/Board';
import { Keyboard } from './components/Keyboard';
import { StrategyControls } from './components/StrategyControls';
import { RecommendationPanel } from './components/RecommendationPanel';
import { CandidateViewer } from './components/CandidateViewer';
import { useWordleBoard } from './hooks/useWordleBoard';
import { useSolverWorker } from './hooks/useSolverWorker';
import { INITIAL_ANSWERS, ALL_VALID_GUESSES } from './data/words';
import { webContributionService } from './services/contribution';
import './App.css';

export const App: React.FC = () => {
  const {
    history,
    currentGuess,
    currentFeedback,
    activeRowIndex,
    validationError,
    isComplete,
    isWon,
    editingRowIndex,
    editingFeedback,
    selectedTileIndex,
    addLetter,
    deleteLetter,
    toggleTileFeedback,
    setTileFeedbackDirect,
    setSelectedTileIndex,
    moveSelectedTile,
    startEditingRow,
    saveRowEdit,
    cancelRowEdit,
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
    contradictionDiagnosis,
    isExpandedFallback,
    error: workerError,
    requestSolve,
    resetSolve,
  } = useSolverWorker();

  // Execute unified solver whenever game observation history changes
  useEffect(() => {
    requestSolve(history);
  }, [history, requestSolve]);

  // Automatic missing-answer contribution upon puzzle win (Stage 9B)
  useEffect(() => {
    if (isWon) {
      void webContributionService.evaluateAndSubmit(
        history,
        INITIAL_ANSWERS,
        ALL_VALID_GUESSES,
        'web'
      );
    }
  }, [isWon, history]);

  const handleReset = useCallback(() => {
    resetBoard();
    resetSolve();
  }, [resetBoard, resetSolve]);

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

      // 1. Direct feedback shortcuts: 1 = Grey, 2 = Yellow, 3 = Green
      if (e.key === '1') {
        e.preventDefault();
        setTileFeedbackDirect(0);
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        setTileFeedbackDirect(1);
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        setTileFeedbackDirect(2);
        return;
      }

      // 2. Navigation shortcuts: Left / Right arrows
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveSelectedTile('left');
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveSelectedTile('right');
        return;
      }

      // 3. Edit actions: Escape cancels, Enter saves or submits
      if (e.key === 'Escape') {
        if (editingRowIndex !== null) {
          e.preventDefault();
          cancelRowEdit();
          return;
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (editingRowIndex !== null) {
          saveRowEdit();
        } else {
          submitTurn();
        }
        return;
      }

      // 4. Letter typing (only when not editing an earlier row)
      if (editingRowIndex === null && !isComplete) {
        if (e.key === 'Backspace') {
          e.preventDefault();
          deleteLetter();
        } else if (/^[a-zA-Z]$/.test(e.key)) {
          e.preventDefault();
          addLetter(e.key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    editingRowIndex,
    isComplete,
    setTileFeedbackDirect,
    moveSelectedTile,
    saveRowEdit,
    cancelRowEdit,
    submitTurn,
    deleteLetter,
    addLetter,
  ]);

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
            isComplete={isComplete}
            editingRowIndex={editingRowIndex}
            editingFeedback={editingFeedback}
            selectedTileIndex={selectedTileIndex}
            onToggleTileFeedback={toggleTileFeedback}
            onStartEditingRow={startEditingRow}
            onSaveRowEdit={saveRowEdit}
            onCancelRowEdit={cancelRowEdit}
            onSelectTile={setSelectedTileIndex}
          />

          <StrategyControls
            onReset={handleReset}
            onClearRow={clearCurrentRow}
            onSubmitRow={submitTurn}
            hasRowInput={currentGuess.length > 0}
          />

          <Keyboard
            onKeyPress={addLetter}
            onDelete={deleteLetter}
            onSubmit={submitTurn}
            disabled={isComplete || editingRowIndex !== null}
          />
        </div>

        <div className="solver-sidebar">
          <RecommendationPanel
            recommendation={recommendation}
            loading={loading}
            isWon={isWon}
            turnsCount={history.length}
            contradictionDiagnosis={contradictionDiagnosis}
            onAutofill={applyRecommendation}
            onStartEditingRow={startEditingRow}
            onReset={handleReset}
          />

          <CandidateViewer
            candidates={remainingCandidates}
            totalInitial={INITIAL_ANSWERS.length}
            isContradiction={isContradiction}
            isExpandedFallback={isExpandedFallback}
            onSelectWord={applyRecommendation}
          />
        </div>
      </main>
    </div>
  );
};
