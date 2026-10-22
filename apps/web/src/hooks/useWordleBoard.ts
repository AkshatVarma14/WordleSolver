import { useState, useCallback } from 'react';
import { FeedbackPattern, TileFeedback, TurnRecord, isValidWord } from '@wordle-solver/solver';

export interface UseWordleBoardReturn {
  readonly history: readonly TurnRecord[];
  readonly currentGuess: string;
  readonly currentFeedback: FeedbackPattern;
  readonly activeRowIndex: number;
  readonly validationError: string | null;
  readonly isComplete: boolean;
  readonly isWon: boolean;
  readonly editingRowIndex: number | null;
  readonly editingFeedback: FeedbackPattern | null;
  readonly selectedTileIndex: number;
  readonly addLetter: (char: string) => void;
  readonly deleteLetter: () => void;
  readonly toggleTileFeedback: (tileIndex: number, rowIndex?: number) => void;
  readonly setTileFeedback: (tileIndex: number, feedback: TileFeedback) => void;
  readonly setTileFeedbackDirect: (feedback: TileFeedback, tileIndex?: number) => void;
  readonly setSelectedTileIndex: (index: number) => void;
  readonly moveSelectedTile: (direction: 'left' | 'right') => void;
  readonly startEditingRow: (rowIndex: number) => void;
  readonly saveRowEdit: () => void;
  readonly cancelRowEdit: () => void;
  readonly submitTurn: () => boolean;
  readonly clearCurrentRow: () => void;
  readonly resetBoard: () => void;
  readonly applyRecommendation: (word: string) => void;
}

const DEFAULT_FEEDBACK: FeedbackPattern = [0, 0, 0, 0, 0];

export function useWordleBoard(): UseWordleBoardReturn {
  const [history, setHistory] = useState<TurnRecord[]>([]);
  const [currentGuess, setCurrentGuess] = useState<string>('');
  const [currentFeedback, setCurrentFeedback] = useState<FeedbackPattern>(DEFAULT_FEEDBACK);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Row editing state for previously submitted turns
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editingFeedback, setEditingFeedback] = useState<FeedbackPattern | null>(null);

  // Selected tile index (0..4) for keyboard navigation and direct 1/2/3 shortcut assignment
  const [selectedTileIndex, setSelectedTileIndex] = useState<number>(0);

  // Round completion check: 5 confirmed Green tiles on any submitted turn
  const isWon = history.some((turn) => turn.feedback.every((tile) => tile === 2));
  const activeRowIndex = history.length;
  const isComplete = isWon || activeRowIndex >= 6;

  // Add letter to the current active guess row
  const addLetter = useCallback(
    (char: string) => {
      if (isComplete || editingRowIndex !== null) return;
      setValidationError(null);
      if (/^[a-zA-Z]$/.test(char) && currentGuess.length < 5) {
        setCurrentGuess((prev) => {
          const next = (prev + char.toUpperCase()).slice(0, 5);
          setSelectedTileIndex(next.length < 5 ? next.length : 4);
          return next;
        });
      }
    },
    [isComplete, editingRowIndex, currentGuess.length]
  );

  // Backspace / delete letter
  const deleteLetter = useCallback(() => {
    if (isComplete || editingRowIndex !== null) return;
    setValidationError(null);
    setCurrentGuess((prev) => {
      const next = prev.slice(0, -1);
      setSelectedTileIndex(next.length);
      return next;
    });
  }, [isComplete, editingRowIndex]);

  // Navigate selected tile index with arrow keys
  const moveSelectedTile = useCallback((direction: 'left' | 'right') => {
    setSelectedTileIndex((prev) => {
      if (direction === 'left') {
        return Math.max(0, prev - 1);
      }
      return Math.min(4, prev + 1);
    });
  }, []);

  // Directly set a tile's feedback via keyboard shortcut (1 = Grey, 2 = Yellow, 3 = Green)
  const setTileFeedbackDirect = useCallback(
    (feedback: TileFeedback, tileIndex?: number) => {
      setValidationError(null);
      const targetIndex = tileIndex !== undefined ? tileIndex : selectedTileIndex;
      if (targetIndex < 0 || targetIndex >= 5) return;

      if (editingRowIndex !== null && editingFeedback !== null) {
        // Editing a previous row
        setEditingFeedback((prev) => {
          if (!prev) return prev;
          const next = [...prev] as [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback];
          next[targetIndex] = feedback;
          return next;
        });
      } else if (!isComplete && currentGuess.length > 0) {
        // Active row
        setCurrentFeedback((prev) => {
          const next = [...prev] as [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback];
          next[targetIndex] = feedback;
          return next;
        });
      }
    },
    [editingRowIndex, editingFeedback, isComplete, currentGuess.length, selectedTileIndex]
  );

  // Cycle tile state: 0 (Grey) -> 1 (Yellow) -> 2 (Green) -> 0 (Grey)
  const toggleTileFeedback = useCallback(
    (tileIndex: number, rowIndex?: number) => {
      if (tileIndex < 0 || tileIndex >= 5) return;
      setValidationError(null);
      setSelectedTileIndex(tileIndex);

      // Case 1: Editing a specific submitted row
      if (rowIndex !== undefined && rowIndex < history.length) {
        if (editingRowIndex !== rowIndex) {
          // Enter edit mode for this row
          setEditingRowIndex(rowIndex);
          const rowFeedback = history[rowIndex]!.feedback;
          const next = [...rowFeedback] as [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback];
          next[tileIndex] = (((next[tileIndex] ?? 0) + 1) % 3) as TileFeedback;
          setEditingFeedback(next);
        } else if (editingFeedback) {
          setEditingFeedback((prev) => {
            if (!prev) return prev;
            const next = [...prev] as [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback];
            next[tileIndex] = (((next[tileIndex] ?? 0) + 1) % 3) as TileFeedback;
            return next;
          });
        }
        return;
      }

      // Case 2: Editing active row
      if (editingRowIndex !== null && editingFeedback !== null) {
        setEditingFeedback((prev) => {
          if (!prev) return prev;
          const next = [...prev] as [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback];
          next[tileIndex] = (((next[tileIndex] ?? 0) + 1) % 3) as TileFeedback;
          return next;
        });
        return;
      }

      if (isComplete) return;

      setCurrentFeedback((prev) => {
        const next = [...prev] as [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback];
        const current = next[tileIndex]!;
        next[tileIndex] = ((current + 1) % 3) as TileFeedback;
        return next;
      });
    },
    [editingRowIndex, editingFeedback, history, isComplete]
  );

  // Directly set tile feedback
  const setTileFeedback = useCallback(
    (tileIndex: number, feedback: TileFeedback) => {
      setTileFeedbackDirect(feedback, tileIndex);
    },
    [setTileFeedbackDirect]
  );

  // Start editing a previously submitted row
  const startEditingRow = useCallback(
    (rowIndex: number) => {
      if (rowIndex < 0 || rowIndex >= history.length) return;
      setEditingRowIndex(rowIndex);
      setEditingFeedback([...history[rowIndex]!.feedback]);
      setSelectedTileIndex(0);
      setValidationError(null);
    },
    [history]
  );

  // Save the edited row and update observation history
  const saveRowEdit = useCallback(() => {
    if (editingRowIndex === null || editingFeedback === null) return;
    const rowIdx = editingRowIndex;
    const newFeedback = editingFeedback;

    setHistory((prev) => {
      const next = [...prev];
      if (next[rowIdx]) {
        next[rowIdx] = {
          ...next[rowIdx]!,
          feedback: newFeedback,
        };
      }
      return next;
    });

    setEditingRowIndex(null);
    setEditingFeedback(null);
    setValidationError(null);
  }, [editingRowIndex, editingFeedback]);

  // Cancel row edit and discard changes
  const cancelRowEdit = useCallback(() => {
    setEditingRowIndex(null);
    setEditingFeedback(null);
    setValidationError(null);
  }, []);

  // Submit active row as a confirmed observation
  const submitTurn = useCallback((): boolean => {
    if (isComplete || editingRowIndex !== null) return false;

    if (currentGuess.length !== 5) {
      setValidationError('Please enter a full 5-letter word before submitting.');
      return false;
    }

    if (!isValidWord(currentGuess)) {
      setValidationError('Word must consist solely of letters A-Z.');
      return false;
    }

    const newRecord: TurnRecord = {
      guess: currentGuess.toUpperCase(),
      feedback: currentFeedback,
    };

    setHistory((prev) => [...prev, newRecord]);
    setCurrentGuess('');
    setCurrentFeedback(DEFAULT_FEEDBACK);
    setSelectedTileIndex(0);
    setValidationError(null);
    return true;
  }, [isComplete, editingRowIndex, currentGuess, currentFeedback]);

  // Clear current active row
  const clearCurrentRow = useCallback(() => {
    if (editingRowIndex !== null) return;
    setCurrentGuess('');
    setCurrentFeedback(DEFAULT_FEEDBACK);
    setSelectedTileIndex(0);
    setValidationError(null);
  }, [editingRowIndex]);

  // Reset entire board & history
  const resetBoard = useCallback(() => {
    setHistory([]);
    setCurrentGuess('');
    setCurrentFeedback(DEFAULT_FEEDBACK);
    setEditingRowIndex(null);
    setEditingFeedback(null);
    setSelectedTileIndex(0);
    setValidationError(null);
  }, []);

  // Autofill recommended guess into active row
  const applyRecommendation = useCallback(
    (word: string) => {
      if (isComplete || editingRowIndex !== null) return;
      if (word.length === 5 && isValidWord(word)) {
        setCurrentGuess(word.toUpperCase());
        setSelectedTileIndex(4);
        setValidationError(null);
      }
    },
    [isComplete, editingRowIndex]
  );

  return {
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
    setTileFeedback,
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
  };
}
