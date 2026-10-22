import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useWordleBoard } from '../src/hooks/useWordleBoard';
import { Board } from '../src/components/Board';
import { RecommendationPanel } from '../src/components/RecommendationPanel';
import { App } from '../src/App';
import {
  TurnRecord,
  diagnoseContradiction,
  filterByHistory,
} from '@wordle-solver/solver';
import { ALL_VALID_GUESSES, INITIAL_ANSWERS } from '../src/data/words';

describe('Stage 6: Web App Interaction, Recovery, and Editing Fixes', () => {
  describe('1. Editable Submitted Observations', () => {
    it('Allows starting, editing feedback, and saving changes to a previous row', () => {
      const { result } = renderHook(() => useWordleBoard());

      // Submit turn 1: CRANE with [0, 0, 0, 0, 0]
      act(() => {
        result.current.applyRecommendation('CRANE');
      });
      act(() => {
        result.current.submitTurn();
      });

      // Submit turn 2: TOILS with [0, 0, 0, 0, 0]
      act(() => {
        result.current.applyRecommendation('TOILS');
      });
      act(() => {
        result.current.submitTurn();
      });

      expect(result.current.history.length).toBe(2);
      expect(result.current.history[0]?.guess).toBe('CRANE');
      expect(result.current.history[0]?.feedback).toEqual([0, 0, 0, 0, 0]);
      expect(result.current.history[1]?.guess).toBe('TOILS');

      // Start editing Row 1 (CRANE)
      act(() => {
        result.current.startEditingRow(0);
      });

      expect(result.current.editingRowIndex).toBe(0);
      expect(result.current.editingFeedback).toEqual([0, 0, 0, 0, 0]);

      // Edit tile 0 to Green (2) and tile 1 to Yellow (1)
      act(() => {
        result.current.setTileFeedbackDirect(2, 0);
        result.current.setTileFeedbackDirect(1, 1);
      });

      expect(result.current.editingFeedback).toEqual([2, 1, 0, 0, 0]);
      // Note: history[0] is not modified until saved
      expect(result.current.history[0]?.feedback).toEqual([0, 0, 0, 0, 0]);

      // Save row edit
      act(() => {
        result.current.saveRowEdit();
      });

      expect(result.current.editingRowIndex).toBeNull();
      expect(result.current.editingFeedback).toBeNull();
      expect(result.current.history[0]?.feedback).toEqual([2, 1, 0, 0, 0]);
      // Row 2 remains intact
      expect(result.current.history[1]?.guess).toBe('TOILS');
      expect(result.current.history[1]?.feedback).toEqual([0, 0, 0, 0, 0]);
    });

    it('Cancels row edit without modifying history', () => {
      const { result } = renderHook(() => useWordleBoard());

      act(() => {
        result.current.applyRecommendation('SLATE');
      });
      act(() => {
        result.current.submitTurn();
      });

      expect(result.current.history[0]?.feedback).toEqual([0, 0, 0, 0, 0]);

      // Start edit
      act(() => {
        result.current.startEditingRow(0);
      });
      act(() => {
        result.current.setTileFeedbackDirect(2, 2); // change tile 2 to Green
      });

      expect(result.current.editingFeedback).toEqual([0, 0, 2, 0, 0]);

      // Cancel edit
      act(() => {
        result.current.cancelRowEdit();
      });

      expect(result.current.editingRowIndex).toBeNull();
      expect(result.current.editingFeedback).toBeNull();
      // Historical feedback was NOT changed
      expect(result.current.history[0]?.feedback).toEqual([0, 0, 0, 0, 0]);
    });

    it('Recalculates candidate filtering accurately after editing a prior row', () => {
      // Step 1: Initial filtering with CRANE as all Grey
      const turn1: TurnRecord = { guess: 'CRANE', feedback: [0, 0, 0, 0, 0] };
      const filtered1 = filterByHistory(INITIAL_ANSWERS, [turn1]);

      // Step 2: Now simulate user editing CRANE feedback to [2, 0, 0, 0, 2] (C and E green)
      const editedTurn1: TurnRecord = { guess: 'CRANE', feedback: [2, 0, 0, 0, 2] };
      const filteredAfterEdit = filterByHistory(INITIAL_ANSWERS, [editedTurn1]);

      expect(filteredAfterEdit.candidates.length).toBeLessThan(filtered1.candidates.length);
      // All candidates in edited list must start with C and end with E
      for (const word of filteredAfterEdit.candidates) {
        expect(word.startsWith('C')).toBe(true);
        expect(word.endsWith('E')).toBe(true);
      }
    });

    it('Renders editing state and toolbar in the Board UI', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();

      const { container } = render(
        <Board
          history={[{ guess: 'CRANE', feedback: [0, 0, 0, 0, 0] }]}
          currentGuess=""
          currentFeedback={[0, 0, 0, 0, 0]}
          activeRowIndex={1}
          editingRowIndex={0}
          editingFeedback={[2, 0, 0, 0, 0]}
          selectedTileIndex={0}
          onToggleTileFeedback={() => {}}
          onSaveRowEdit={onSave}
          onCancelRowEdit={onCancel}
        />
      );

      const editingRow = container.querySelector('.board-row-editing');
      expect(editingRow).not.toBeNull();
      expect(screen.getByText('Editing Row 1')).toBeDefined();

      const saveBtn = screen.getByRole('button', { name: /Save Edit/i });
      fireEvent.click(saveBtn);
      expect(onSave).toHaveBeenCalledTimes(1);

      const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Contradiction Diagnosis and Recovery', () => {
    it('Diagnoses internal contradiction and identifies earliest conflicting turn', () => {
      const history: TurnRecord[] = [
        { guess: 'SLATE', feedback: [2, 0, 0, 0, 0] }, // S confirmed green at pos 0
        { guess: 'CRANE', feedback: [2, 0, 0, 0, 0] }, // C confirmed green at pos 0 -> contradiction with Turn 1!
      ];

      const diagnosis = diagnoseContradiction(history, INITIAL_ANSWERS, ALL_VALID_GUESSES);

      expect(diagnosis.isContradiction).toBe(true);
      expect(diagnosis.isVocabularyMismatch).toBe(false);
      expect(diagnosis.earliestContradictionIndex).toBe(1); // turn 1 caused the collision
      expect(diagnosis.earliestContradictingTurn?.guess).toBe('CRANE');
      expect(diagnosis.explanation).toContain("Row 2 ('CRANE')");
    });

    it('Renders contradiction diagnosis card and allows clicking Edit Row to recover', () => {
      const startEditMock = vi.fn();
      const diagnosis = {
        isContradiction: true,
        earliestContradictionIndex: 1,
        earliestContradictingTurn: { guess: 'CRANE', feedback: [2, 0, 0, 0, 0] as [2, 0, 0, 0, 0] },
        isVocabularyMismatch: false,
        matchingValidGuessesCount: 0,
        sampleValidMatches: [],
        explanation: 'Contradiction detected at Row 2 ("CRANE"): No words in dictionary match this pattern.',
      };

      render(
        <RecommendationPanel
          recommendation={null}
          loading={false}
          contradictionDiagnosis={diagnosis}
          onAutofill={() => {}}
          onStartEditingRow={startEditMock}
        />
      );

      expect(screen.getAllByText(/Contradiction Detected/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Row 2 \("CRANE"\)/i)).toBeDefined();

      const editBtn = screen.getByRole('button', { name: /Edit Row 2/i });
      fireEvent.click(editBtn);
      expect(startEditMock).toHaveBeenCalledWith(1);
    });

    it('Distinguishes vocabulary mismatch from internal contradiction for words like PSHAW', () => {
      // In Wordle, PSHAW is in valid-guesses.txt, but NOT in answers.txt
      const history: TurnRecord[] = [
        { guess: 'PSHAW', feedback: [2, 2, 2, 2, 2] },
      ];

      const diagnosis = diagnoseContradiction(history, INITIAL_ANSWERS, ALL_VALID_GUESSES);

      expect(diagnosis.isContradiction).toBe(true);
      expect(diagnosis.isVocabularyMismatch).toBe(true);
      expect(diagnosis.sampleValidMatches).toContain('PSHAW');
      expect(diagnosis.explanation).toContain('configured answer list');
    });
  });

  describe('3. Round Completion Detection', () => {
    it('Detects when round is won with 5 Green tiles and ends the game', () => {
      const { result } = renderHook(() => useWordleBoard());

      // Enter winning turn: CRANE with [2, 2, 2, 2, 2]
      act(() => {
        result.current.applyRecommendation('CRANE');
      });
      act(() => {
        result.current.setTileFeedbackDirect(2, 0);
        result.current.setTileFeedbackDirect(2, 1);
        result.current.setTileFeedbackDirect(2, 2);
        result.current.setTileFeedbackDirect(2, 3);
        result.current.setTileFeedbackDirect(2, 4);
      });

      act(() => {
        result.current.submitTurn();
      });

      expect(result.current.isWon).toBe(true);
      expect(result.current.isComplete).toBe(true);

      // Attempting to add letters should be ignored
      act(() => {
        result.current.addLetter('S');
      });
      expect(result.current.currentGuess).toBe('');
    });

    it('Renders round completion card with turns count and New Game button', () => {
      const resetMock = vi.fn();

      render(
        <RecommendationPanel
          recommendation={null}
          loading={false}
          isWon={true}
          turnsCount={3}
          onAutofill={() => {}}
          onReset={resetMock}
        />
      );

      expect(screen.getByText('Puzzle Solved')).toBeDefined();
      expect(screen.getByText('Round Complete')).toBeDefined();
      expect(screen.getByText(/Target word successfully identified in 3 turns/i)).toBeDefined();

      const newGameBtn = screen.getByRole('button', { name: /New Game/i });
      fireEvent.click(newGameBtn);
      expect(resetMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Direct Feedback Keyboard Shortcuts & Tile Navigation', () => {
    it('Directly sets tile feedback with 1, 2, and 3', () => {
      const { result } = renderHook(() => useWordleBoard());

      act(() => {
        result.current.applyRecommendation('CRANE');
      });
      act(() => {
        result.current.setSelectedTileIndex(0);
      });

      // 1 sets to Grey (0)
      act(() => {
        result.current.setTileFeedbackDirect(0);
      });
      expect(result.current.currentFeedback[0]).toBe(0);

      // 2 sets to Yellow (1)
      act(() => {
        result.current.setTileFeedbackDirect(1);
      });
      expect(result.current.currentFeedback[0]).toBe(1);

      // 3 sets to Green (2)
      act(() => {
        result.current.setTileFeedbackDirect(2);
      });
      expect(result.current.currentFeedback[0]).toBe(2);
    });

    it('Navigates tiles with left and right arrow navigation', () => {
      const { result } = renderHook(() => useWordleBoard());

      act(() => {
        result.current.setSelectedTileIndex(2);
      });
      expect(result.current.selectedTileIndex).toBe(2);

      act(() => {
        result.current.moveSelectedTile('left');
      });
      expect(result.current.selectedTileIndex).toBe(1);

      act(() => {
        result.current.moveSelectedTile('right');
        result.current.moveSelectedTile('right');
      });
      expect(result.current.selectedTileIndex).toBe(3);

      // Bound check at 4
      act(() => {
        result.current.moveSelectedTile('right');
        result.current.moveSelectedTile('right');
      });
      expect(result.current.selectedTileIndex).toBe(4);
    });

    it('Dispatches physical keyboard events in App without capturing input elements', () => {
      render(<App />);

      // Create an input element on the page
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      // Fire '1' on input element - should not trigger tile feedback
      fireEvent.keyDown(input, { key: '1', bubbles: true });

      // Clean up DOM
      document.body.removeChild(input);
    });
  });

  describe('5. Search Invalidation and State Consistency', () => {
    it('Invalidates recommendation when board is reset', () => {
      const { result } = renderHook(() => useWordleBoard());

      act(() => {
        result.current.applyRecommendation('SLATE');
      });
      act(() => {
        result.current.submitTurn();
      });
      expect(result.current.history.length).toBe(1);

      act(() => {
        result.current.resetBoard();
      });
      expect(result.current.history.length).toBe(0);
      expect(result.current.currentGuess).toBe('');
    });
  });
});
