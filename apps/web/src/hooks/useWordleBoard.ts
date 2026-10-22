import { useState, useCallback } from 'react';
import { FeedbackPattern, TileFeedback, TurnRecord, isValidWord } from '@wordle-solver/solver';

export interface UseWordleBoardReturn {
  readonly history: readonly TurnRecord[];
  readonly currentGuess: string;
  readonly currentFeedback: FeedbackPattern;
  readonly activeRowIndex: number;
  readonly validationError: string | null;
  readonly isComplete: boolean;
  readonly addLetter: (char: string) => void;
  readonly deleteLetter: () => void;
  readonly toggleTileFeedback: (tileIndex: number) => void;
  readonly setTileFeedback: (tileIndex: number, feedback: TileFeedback) => void;
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

  const activeRowIndex = history.length;
  const isComplete = activeRowIndex >= 6;

  // Add letter to the current active guess row
  const addLetter = useCallback(
    (char: string) => {
      if (isComplete) return;
      setValidationError(null);
      if (/^[a-zA-Z]$/.test(char) && currentGuess.length < 5) {
        setCurrentGuess((prev) => (prev + char.toUpperCase()).slice(0, 5));
      }
    },
    [isComplete, currentGuess.length]
  );

  // Backspace / delete letter
  const deleteLetter = useCallback(() => {
    if (isComplete) return;
    setValidationError(null);
    setCurrentGuess((prev) => prev.slice(0, -1));
  }, [isComplete]);

  // Cycle tile state: 0 (Grey) -> 1 (Yellow) -> 2 (Green) -> 0 (Grey)
  const toggleTileFeedback = useCallback(
    (tileIndex: number) => {
      if (isComplete || tileIndex < 0 || tileIndex >= 5) return;
      setValidationError(null);
      setCurrentFeedback((prev) => {
        const next = [...prev] as [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback];
        const current = next[tileIndex]!;
        next[tileIndex] = ((current + 1) % 3) as TileFeedback;
        return next;
      });
    },
    [isComplete]
  );

  // Directly set tile feedback
  const setTileFeedback = useCallback(
    (tileIndex: number, feedback: TileFeedback) => {
      if (isComplete || tileIndex < 0 || tileIndex >= 5) return;
      setCurrentFeedback((prev) => {
        const next = [...prev] as [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback];
        next[tileIndex] = feedback;
        return next;
      });
    },
    [isComplete]
  );

  // Submit active row as a confirmed observation
  const submitTurn = useCallback((): boolean => {
    if (isComplete) return false;

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
    setValidationError(null);
    return true;
  }, [isComplete, currentGuess, currentFeedback]);

  // Clear current active row
  const clearCurrentRow = useCallback(() => {
    setCurrentGuess('');
    setCurrentFeedback(DEFAULT_FEEDBACK);
    setValidationError(null);
  }, []);

  // Reset entire board & history
  const resetBoard = useCallback(() => {
    setHistory([]);
    setCurrentGuess('');
    setCurrentFeedback(DEFAULT_FEEDBACK);
    setValidationError(null);
  }, []);

  // Autofill recommended guess into active row
  const applyRecommendation = useCallback(
    (word: string) => {
      if (isComplete) return;
      if (word.length === 5 && isValidWord(word)) {
        setCurrentGuess(word.toUpperCase());
        setValidationError(null);
      }
    },
    [isComplete]
  );

  return {
    history,
    currentGuess,
    currentFeedback,
    activeRowIndex,
    validationError,
    isComplete,
    addLetter,
    deleteLetter,
    toggleTileFeedback,
    setTileFeedback,
    submitTurn,
    clearCurrentRow,
    resetBoard,
    applyRecommendation,
  };
}
