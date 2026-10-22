import React from 'react';

interface KeyboardProps {
  readonly onKeyPress: (key: string) => void;
  readonly onDelete: () => void;
  readonly onSubmit: () => void;
  readonly disabled?: boolean;
}

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
];

export const Keyboard: React.FC<KeyboardProps> = ({
  onKeyPress,
  onDelete,
  onSubmit,
  disabled = false,
}) => {
  const handleClick = (key: string) => {
    if (disabled) return;
    if (key === 'ENTER') {
      onSubmit();
    } else if (key === 'BACKSPACE') {
      onDelete();
    } else {
      onKeyPress(key);
    }
  };

  return (
    <div className="keyboard-container" role="group" aria-label="On-screen Keyboard">
      {KEYBOARD_ROWS.map((row, rowIdx) => (
        <div key={rowIdx} className="keyboard-row">
          {row.map((key) => {
            const isSpecial = key === 'ENTER' || key === 'BACKSPACE';
            const displayLabel = key === 'BACKSPACE' ? '⌫' : key;

            return (
              <button
                key={key}
                type="button"
                className={`keyboard-key ${isSpecial ? 'keyboard-key-special' : ''}`}
                onClick={() => handleClick(key)}
                disabled={disabled}
                aria-label={key === 'BACKSPACE' ? 'Backspace' : key === 'ENTER' ? 'Submit Guess' : key}
              >
                {displayLabel}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
