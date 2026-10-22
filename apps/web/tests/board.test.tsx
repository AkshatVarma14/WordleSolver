import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { Board } from '../src/components/Board';
import { Tile } from '../src/components/Tile';
import { useWordleBoard } from '../src/hooks/useWordleBoard';

describe('Web Board Interactions & Hooks', () => {
  describe('Tile Component', () => {
    it('Renders letter and correct accessibility attributes', () => {
      render(<Tile letter="C" feedback={2} position={0} isEditable={false} />);
      const tileBtn = screen.getByRole('button');
      expect(tileBtn.textContent).toContain('C');
      expect(tileBtn.getAttribute('aria-label')).toContain('Tile 1: C, State: Green');
      expect(tileBtn.className).toContain('tile-green');
    });

    it('Triggers onClick callback when editable', () => {
      let clicked = false;
      render(
        <Tile
          letter="R"
          feedback={1}
          position={1}
          isEditable={true}
          onClick={() => {
            clicked = true;
          }}
        />
      );
      const tileBtn = screen.getByRole('button');
      fireEvent.click(tileBtn);
      expect(clicked).toBe(true);
      expect(tileBtn.className).toContain('tile-yellow');
    });
  });

  describe('Board Component', () => {
    it('Renders 6 rows of 5 tiles each (30 tiles total)', () => {
      render(
        <Board
          history={[]}
          currentGuess=""
          currentFeedback={[0, 0, 0, 0, 0]}
          activeRowIndex={0}
          onToggleTileFeedback={() => {}}
        />
      );

      const allTiles = screen.getAllByRole('button');
      expect(allTiles.length).toBe(30);
    });

    it('Renders submitted historical row letters and active row letters', () => {
      render(
        <Board
          history={[{ guess: 'CRANE', feedback: [0, 1, 2, 0, 0] }]}
          currentGuess="SLAT"
          currentFeedback={[0, 0, 0, 0, 0]}
          activeRowIndex={1}
          onToggleTileFeedback={() => {}}
        />
      );

      // Verify letters from submitted row
      expect(screen.getByLabelText(/Tile 1: C, State: Grey/i)).toBeDefined();
      expect(screen.getByLabelText(/Tile 3: A, State: Green/i)).toBeDefined();

      // Verify letters from active row
      expect(screen.getByLabelText(/Tile 1: S/i)).toBeDefined();
      expect(screen.getByLabelText(/Tile 2: L/i)).toBeDefined();
    });

    it('Visually distinguishes the next tile to receive a letter with active cursor', () => {
      // With 2 letters typed ('SL'), tile index 2 (position 3) should have .tile-cursor
      const { container } = render(
        <Board
          history={[]}
          currentGuess="SL"
          currentFeedback={[0, 0, 0, 0, 0]}
          activeRowIndex={0}
          onToggleTileFeedback={() => {}}
        />
      );

      const activeRow = container.querySelector('.board-row-active');
      expect(activeRow).toBeDefined();

      const tiles = activeRow?.querySelectorAll('.tile');
      expect(tiles).toBeDefined();
      expect(tiles?.length).toBe(5);

      // Tile 0: 'S' (not cursor)
      expect(tiles?.[0]?.className).not.toContain('tile-cursor');
      // Tile 1: 'L' (not cursor)
      expect(tiles?.[1]?.className).not.toContain('tile-cursor');
      // Tile 2: Empty (is active cursor!)
      expect(tiles?.[2]?.className).toContain('tile-cursor');
      // Tile 3: Empty (not cursor yet)
      expect(tiles?.[3]?.className).not.toContain('tile-cursor');
    });

    it('Marks active row as ready for submission when all 5 letters are typed', () => {
      const { container } = render(
        <Board
          history={[]}
          currentGuess="SLATE"
          currentFeedback={[0, 0, 0, 0, 0]}
          activeRowIndex={0}
          onToggleTileFeedback={() => {}}
        />
      );

      const activeRow = container.querySelector('.board-row-active');
      expect(activeRow?.className).toContain('board-row-ready');

      // No individual tile should have tile-cursor when full
      const cursorTile = activeRow?.querySelector('.tile-cursor');
      expect(cursorTile).toBeNull();

      // All tiles in ready row have tile-ready
      const readyTiles = activeRow?.querySelectorAll('.tile-ready');
      expect(readyTiles?.length).toBe(5);
    });
  });

  describe('useWordleBoard Hook Logic', () => {
    it('Adds letters up to max length of 5 and prevents 6th letter', () => {
      const { result } = renderHook(() => useWordleBoard());

      act(() => {
        result.current.addLetter('c');
        result.current.addLetter('R');
        result.current.addLetter('A');
        result.current.addLetter('n');
        result.current.addLetter('E');
      });

      expect(result.current.currentGuess).toBe('CRANE');

      // Attempt adding 6th letter
      act(() => {
        result.current.addLetter('S');
      });

      expect(result.current.currentGuess).toBe('CRANE');
    });

    it('Deletes letters with backspace', () => {
      const { result } = renderHook(() => useWordleBoard());

      act(() => {
        result.current.addLetter('C');
        result.current.addLetter('R');
        result.current.deleteLetter();
      });

      expect(result.current.currentGuess).toBe('C');
    });

    it('Cycles tile feedback 0 -> 1 -> 2 -> 0', () => {
      const { result } = renderHook(() => useWordleBoard());

      expect(result.current.currentFeedback[0]).toBe(0);

      act(() => {
        result.current.toggleTileFeedback(0);
      });
      expect(result.current.currentFeedback[0]).toBe(1);

      act(() => {
        result.current.toggleTileFeedback(0);
      });
      expect(result.current.currentFeedback[0]).toBe(2);

      act(() => {
        result.current.toggleTileFeedback(0);
      });
      expect(result.current.currentFeedback[0]).toBe(0);
    });

    it('Validates submission: rejects < 5 letters and submits valid 5 letters', () => {
      const { result } = renderHook(() => useWordleBoard());

      act(() => {
        result.current.addLetter('C');
        result.current.addLetter('A');
        result.current.addLetter('R');
      });

      let submitted = false;
      act(() => {
        submitted = result.current.submitTurn();
      });

      expect(submitted).toBe(false);
      expect(result.current.validationError).toContain('5-letter word');
      expect(result.current.history.length).toBe(0);

      // Complete the word
      act(() => {
        result.current.addLetter('T');
        result.current.addLetter('S');
      });

      act(() => {
        submitted = result.current.submitTurn();
      });

      expect(submitted).toBe(true);
      expect(result.current.history.length).toBe(1);
      expect(result.current.history[0]?.guess).toBe('CARTS');
      expect(result.current.currentGuess).toBe('');
      expect(result.current.activeRowIndex).toBe(1);
    });

    it('Resets board completely', () => {
      const { result } = renderHook(() => useWordleBoard());

      act(() => {
        result.current.addLetter('C');
        result.current.addLetter('R');
        result.current.addLetter('A');
        result.current.addLetter('N');
        result.current.addLetter('E');
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
      expect(result.current.activeRowIndex).toBe(0);
    });

    it('Applies recommendation autofill directly to active guess', () => {
      const { result } = renderHook(() => useWordleBoard());

      act(() => {
        result.current.applyRecommendation('SOARE');
      });

      expect(result.current.currentGuess).toBe('SOARE');
    });
  });
});
