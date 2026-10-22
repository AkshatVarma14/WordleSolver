import React from 'react';
import { FeedbackPattern, TurnRecord } from '@wordle-solver/solver';
import { Tile } from './Tile';

interface BoardProps {
  readonly history: readonly TurnRecord[];
  readonly currentGuess: string;
  readonly currentFeedback: FeedbackPattern;
  readonly activeRowIndex: number;
  readonly onToggleTileFeedback: (tileIndex: number) => void;
}

export const Board: React.FC<BoardProps> = ({
  history,
  currentGuess,
  currentFeedback,
  activeRowIndex,
  onToggleTileFeedback,
}) => {
  const rows = Array.from({ length: 6 }, (_, rowIndex) => {
    const isSubmitted = rowIndex < history.length;
    const isActive = rowIndex === activeRowIndex;

    let rowLetters = ['', '', '', '', ''];
    let rowFeedback: FeedbackPattern | undefined = undefined;

    if (isSubmitted) {
      const record = history[rowIndex]!;
      rowLetters = record.guess.split('');
      rowFeedback = record.feedback;
    } else if (isActive) {
      rowLetters = Array.from({ length: 5 }, (_, i) => currentGuess[i] ?? '');
      rowFeedback = currentFeedback;
    }

    const isRowReady = isActive && currentGuess.length === 5;

    return (
      <div
        key={rowIndex}
        className={`board-row ${isActive ? 'board-row-active' : ''} ${
          isSubmitted ? 'board-row-submitted' : ''
        } ${isRowReady ? 'board-row-ready' : ''}`.trim()}
        role="group"
        aria-label={`Row ${rowIndex + 1}: ${
          isSubmitted
            ? `Submitted guess ${history[rowIndex]?.guess}`
            : isActive
            ? 'Active guess in progress'
            : 'Unused row'
        }`}
      >
        {rowLetters.map((letter, colIndex) => {
          const isCursor = isActive && currentGuess.length < 5 && colIndex === currentGuess.length;
          const isReady = isActive && currentGuess.length === 5;

          return (
            <Tile
              key={colIndex}
              letter={letter}
              feedback={rowFeedback ? rowFeedback[colIndex] : undefined}
              isEditable={isActive && currentGuess.length > colIndex}
              isCursor={isCursor}
              isReady={isReady}
              onClick={() => onToggleTileFeedback(colIndex)}
              position={colIndex}
            />
          );
        })}
      </div>
    );
  });

  return (
    <div className="board-container" aria-label="Wordle Game Board">
      <div className="board-grid">{rows}</div>
      {activeRowIndex < 6 && (
        <div className="board-instructions">
          <small>
            Click letters in the active row to toggle feedback:{' '}
            <span className="badge badge-grey">Grey</span> →{' '}
            <span className="badge badge-yellow">Yellow</span> →{' '}
            <span className="badge badge-green">Green</span>
          </small>
        </div>
      )}
    </div>
  );
};
