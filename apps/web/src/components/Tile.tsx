import React from 'react';
import { TileFeedback, TileState } from '@wordle-solver/solver';

interface TileProps {
  readonly letter?: string;
  readonly feedback?: TileFeedback;
  readonly isEditable?: boolean;
  readonly isCursor?: boolean;
  readonly isSelected?: boolean;
  readonly isReady?: boolean;
  readonly onClick?: () => void;
  readonly position: number;
}

const FEEDBACK_NAMES: Record<TileFeedback, string> = {
  [TileState.GREY]: 'Grey (Absent)',
  [TileState.YELLOW]: 'Yellow (Present elsewhere)',
  [TileState.GREEN]: 'Green (Correct position)',
};

const FEEDBACK_SYMBOLS: Record<TileFeedback, string> = {
  [TileState.GREY]: '✕',
  [TileState.YELLOW]: '◑',
  [TileState.GREEN]: '✓',
};

export const Tile: React.FC<TileProps> = ({
  letter = '',
  feedback,
  isEditable = false,
  isCursor = false,
  isSelected = false,
  isReady = false,
  onClick,
  position,
}) => {
  const hasLetter = letter.trim().length > 0;
  const hasFeedback = feedback !== undefined;

  let stateClass = 'tile-empty';
  if (hasFeedback) {
    switch (feedback) {
      case TileState.GREEN:
        stateClass = 'tile-green';
        break;
      case TileState.YELLOW:
        stateClass = 'tile-yellow';
        break;
      case TileState.GREY:
        stateClass = 'tile-grey';
        break;
    }
  } else if (hasLetter) {
    stateClass = 'tile-filled';
  }

  const cursorClass = isCursor ? 'tile-cursor' : '';
  const selectedClass = isSelected ? 'tile-selected' : '';
  const readyClass = isReady ? 'tile-ready' : '';

  const label = isEditable
    ? `Tile ${position + 1}: ${letter || 'Empty'}, State: ${
        feedback !== undefined ? FEEDBACK_NAMES[feedback] : 'Unassigned'
      }. Click to cycle color.`
    : `Tile ${position + 1}: ${letter || 'Empty'}, State: ${
        feedback !== undefined ? FEEDBACK_NAMES[feedback] : 'Empty'
      }`;

  return (
    <button
      type="button"
      className={`tile ${stateClass} ${isEditable ? 'tile-editable' : ''} ${cursorClass} ${selectedClass} ${readyClass}`.trim()}
      onClick={isEditable ? onClick : undefined}
      disabled={!isEditable}
      aria-label={label}
      title={isEditable ? 'Click to toggle Grey → Yellow → Green' : undefined}
    >
      <span className="tile-letter">{letter}</span>
      {hasFeedback && (
        <span className="tile-indicator" aria-hidden="true">
          {FEEDBACK_SYMBOLS[feedback]}
        </span>
      )}
    </button>
  );
};
