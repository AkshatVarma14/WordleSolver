import React from 'react';
import { FeedbackPattern, TurnRecord } from '@wordle-solver/solver';
import { Tile } from './Tile';

interface BoardProps {
  readonly history: readonly TurnRecord[];
  readonly currentGuess: string;
  readonly currentFeedback: FeedbackPattern;
  readonly activeRowIndex: number;
  readonly isComplete?: boolean;
  readonly editingRowIndex?: number | null;
  readonly editingFeedback?: FeedbackPattern | null;
  readonly selectedTileIndex?: number;
  readonly onToggleTileFeedback: (tileIndex: number, rowIndex?: number) => void;
  readonly onStartEditingRow?: (rowIndex: number) => void;
  readonly onSaveRowEdit?: () => void;
  readonly onCancelRowEdit?: () => void;
  readonly onSelectTile?: (colIndex: number) => void;
}

export const Board: React.FC<BoardProps> = ({
  history,
  currentGuess,
  currentFeedback,
  activeRowIndex,
  isComplete = false,
  editingRowIndex = null,
  editingFeedback = null,
  selectedTileIndex = 0,
  onToggleTileFeedback,
  onStartEditingRow,
  onSaveRowEdit,
  onCancelRowEdit,
  onSelectTile,
}) => {
  const rows = Array.from({ length: 6 }, (_, rowIndex) => {
    const isSubmitted = rowIndex < history.length;
    const isEditing = editingRowIndex === rowIndex;
    const isActive = !isComplete && rowIndex === activeRowIndex && editingRowIndex === null;

    let rowLetters = ['', '', '', '', ''];
    let rowFeedback: FeedbackPattern | undefined = undefined;

    if (isEditing) {
      const record = history[rowIndex]!;
      rowLetters = record.guess.split('');
      rowFeedback = editingFeedback ?? record.feedback;
    } else if (isSubmitted) {
      const record = history[rowIndex]!;
      rowLetters = record.guess.split('');
      rowFeedback = record.feedback;
    } else if (isActive) {
      rowLetters = Array.from({ length: 5 }, (_, i) => currentGuess[i] ?? '');
      rowFeedback = currentFeedback;
    }

    const isRowReady = isActive && currentGuess.length === 5;

    return (
      <div key={rowIndex} className="board-row-wrapper">
        <div
          className={`board-row ${isActive ? 'board-row-active' : ''} ${
            isSubmitted ? 'board-row-submitted' : ''
          } ${isEditing ? 'board-row-editing' : ''} ${
            isRowReady ? 'board-row-ready' : ''
          }`.trim()}
          role="group"
          aria-label={`Row ${rowIndex + 1}: ${
            isEditing
              ? `Editing submitted guess ${history[rowIndex]?.guess}`
              : isSubmitted
              ? `Submitted guess ${history[rowIndex]?.guess}`
              : isActive
              ? 'Active guess in progress'
              : 'Unused row'
          }`}
        >
          {rowLetters.map((letter, colIndex) => {
            const isCursor = isActive && currentGuess.length < 5 && colIndex === currentGuess.length;
            const isSelected = (isEditing || isActive) && selectedTileIndex === colIndex;
            const isReady = isActive && currentGuess.length === 5;
            const isEditable = isEditing || (isActive && currentGuess.length > colIndex);

            const handleTileClick = () => {
              onSelectTile?.(colIndex);
              if (isEditing) {
                onToggleTileFeedback(colIndex, rowIndex);
              } else if (isActive && currentGuess.length > colIndex) {
                onToggleTileFeedback(colIndex);
              } else if (isSubmitted && editingRowIndex === null) {
                onStartEditingRow?.(rowIndex);
              }
            };

            return (
              <Tile
                key={colIndex}
                letter={letter}
                feedback={rowFeedback ? rowFeedback[colIndex] : undefined}
                isEditable={isEditable || isSubmitted}
                isCursor={isCursor}
                isSelected={isSelected}
                isReady={isReady}
                onClick={handleTileClick}
                position={colIndex}
              />
            );
          })}

          {/* Edit button on submitted rows when not currently editing */}
          {isSubmitted && editingRowIndex === null && onStartEditingRow && (
            <button
              type="button"
              className="row-edit-trigger"
              onClick={() => onStartEditingRow(rowIndex)}
              aria-label={`Edit Row ${rowIndex + 1} feedback`}
              title="Edit this row's feedback"
            >
              Edit
            </button>
          )}
        </div>

        {/* Row edit inline controls */}
        {isEditing && (
          <div className="row-edit-toolbar" role="region" aria-label={`Editing Row ${rowIndex + 1}`}>
            <span className="edit-pill">Editing Row {rowIndex + 1}</span>
            <div className="edit-actions">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={onSaveRowEdit}
                title="Save updated feedback and recalculate candidates"
              >
                Save Edit ↵
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={onCancelRowEdit}
                title="Cancel and discard changes"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="board-container" aria-label="Wordle Game Board">
      <div className="board-grid">{rows}</div>
      <div className="board-instructions">
        <small>
          Shortcuts: <kbd>1</kbd> Grey · <kbd>2</kbd> Yellow · <kbd>3</kbd> Green · <kbd>←</kbd>/<kbd>→</kbd> Navigate · <kbd>Enter</kbd> Submit
        </small>
      </div>
    </div>
  );
};
