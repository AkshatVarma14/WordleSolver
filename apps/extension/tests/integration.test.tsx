import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { PopupApp } from '../src/popup/PopupApp';
import { GetBoardStateResponse, BoardMutatedNotification } from '../src/types/messages';

type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void | Promise<void>;

describe('Chrome Extension Integration & Live Sync (Stage 8C)', () => {
  let messageListeners: MessageListener[] = [];
  let mockSendMessageResponse: GetBoardStateResponse | null = null;
  let mockActiveTab: chrome.tabs.Tab = {
    id: 1,
    index: 0,
    windowId: 1,
    active: true,
    url: 'https://www.nytimes.com/games/wordle',
  };
  let mockLastError: { message?: string } | undefined = undefined;

  beforeEach(() => {
    messageListeners = [];
    mockLastError = undefined;
    mockActiveTab = {
      id: 1,
      index: 0,
      windowId: 1,
      active: true,
      url: 'https://www.nytimes.com/games/wordle',
    };

    // Default mock response: clean empty board
    mockSendMessageResponse = {
      type: 'BOARD_STATE_RESULT',
      payload: {
        success: true,
        strategy: 'CSS_MODULES',
        turns: [],
        activeRowIndex: 0,
        isRoundWon: false,
        isRoundLost: false,
        isComplete: false,
        rawRowsFound: 6,
      },
    };

    // Construct global chrome mock
    (global as unknown as { chrome: unknown }).chrome = {
      tabs: {
        query: vi.fn().mockImplementation(() => Promise.resolve([mockActiveTab])),
        sendMessage: vi.fn().mockImplementation((_tabId: number, _msg: unknown, callback?: (res: unknown) => void) => {
          if (callback) {
            callback(mockSendMessageResponse);
          }
          return Promise.resolve(mockSendMessageResponse);
        }),
      },
      runtime: {
        get lastError() {
          return mockLastError;
        },
        onMessage: {
          addListener: vi.fn().mockImplementation((fn: MessageListener) => {
            messageListeners.push(fn);
          }),
          removeListener: vi.fn().mockImplementation((fn: MessageListener) => {
            messageListeners = messageListeners.filter((l) => l !== fn);
          }),
        },
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
      action: {
        setBadgeText: vi.fn().mockResolvedValue(undefined),
        setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Active Tab Detection and Live Sync Flow', () => {
    it('Syncs with live NYT Wordle tab and displays canonical opening for empty board', async () => {
      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByText(/Live Synced \(Empty board\)/i)).toBeTruthy();
      });

      // Status badge should show live sync
      const badge = screen.getByText(/● Synced/i);
      expect(badge).toBeTruthy();

      // Recommended guess should be pre-computed SALET
      expect(screen.getByText('SALET')).toBeTruthy();
      expect(screen.getByText(/2,315 \/ 2,315/i)).toBeTruthy();
    });

    it('Syncs existing submitted turns from NYT Wordle and recalculates recommendation', async () => {
      mockSendMessageResponse = {
        type: 'BOARD_STATE_RESULT',
        payload: {
          success: true,
          strategy: 'CSS_MODULES',
          turns: [
            {
              guess: 'SLATE',
              feedback: [0, 0, 1, 0, 2], // S:0, L:0, A:1, T:0, E:2
            },
          ],
          activeRowIndex: 1,
          isRoundWon: false,
          isRoundLost: false,
          isComplete: false,
          rawRowsFound: 6,
        },
      };

      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByText(/Live Synced \(1 turn\) · Strategy: CSS_MODULES/i)).toBeTruthy();
      });

      // Verify surviving candidates is reduced from 2315
      await waitFor(() => {
        const survivingText = screen.getByText(/\/ 2,315/i);
        expect(survivingText).toBeTruthy();
        expect(survivingText.textContent).not.toBe('2,315 / 2,315');
      });

      // Verify the submitted row tiles are rendered
      expect(screen.getByText('S')).toBeTruthy();
      expect(screen.getByText('L')).toBeTruthy();
      expect(screen.getByText('A')).toBeTruthy();
      expect(screen.getByText('T')).toBeTruthy();
      expect(screen.getByText('E')).toBeTruthy();
    });
  });

  describe('2. Unsupported Page and Error Fallbacks', () => {
    it('Falls back to manual mode when active tab is not NYT Wordle', async () => {
      mockActiveTab = {
        id: 2,
        index: 0,
        windowId: 1,
        active: true,
        url: 'https://www.google.com',
      };

      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByText(/Manual Mode \(Active tab is not NYT Wordle\)/i)).toBeTruthy();
      });

      expect(screen.getByText(/○ Manual/i)).toBeTruthy();
      expect(screen.getByPlaceholderText('TYPE GUESS')).toBeTruthy();
    });

    it('Falls back to manual mode when content script is unreachable (lastError)', async () => {
      mockLastError = { message: 'Could not establish connection. Receiving end does not exist.' };
      mockSendMessageResponse = null;

      render(<PopupApp />);

      await waitFor(() => {
        expect(
          screen.getByText(/Manual Mode \(Could not reach Wordle board — refresh NYT tab to sync\)/i)
        ).toBeTruthy();
      });

      expect(screen.getByText(/○ Manual/i)).toBeTruthy();
      expect(screen.getByPlaceholderText('TYPE GUESS')).toBeTruthy();
    });

    it('Falls back to manual mode when page DOM returns unsupported structure or splash screen is active', async () => {
      mockSendMessageResponse = {
        type: 'BOARD_STATE_RESULT',
        payload: {
          success: false,
          strategy: 'NONE',
          turns: [],
          activeRowIndex: 0,
          isRoundWon: false,
          isRoundLost: false,
          isComplete: false,
          error: 'UNSUPPORTED_DOM_STRUCTURE',
          rawRowsFound: 0,
        },
      };

      render(<PopupApp />);

      await waitFor(() => {
        expect(
          screen.getByText(/Manual Mode \(Wordle board not found or splash screen active\)/i)
        ).toBeTruthy();
      });

      expect(screen.getByPlaceholderText('TYPE GUESS')).toBeTruthy();
    });
  });

  describe('3. Live Observer Updates & Mutation Subscriptions', () => {
    it('Receives live BOARD_MUTATED messages and updates recommendation without reopening popup', async () => {
      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByText(/Live Synced \(Empty board\)/i)).toBeTruthy();
      });

      // Broadcast live mutation from content script (user typed and submitted CRANE on page)
      const mutationNotification: BoardMutatedNotification = {
        type: 'BOARD_MUTATED',
        payload: {
          success: true,
          strategy: 'CSS_MODULES',
          turns: [
            {
              guess: 'CRANE',
              feedback: [0, 0, 2, 0, 0],
            },
          ],
          activeRowIndex: 1,
          isRoundWon: false,
          isRoundLost: false,
          isComplete: false,
          rawRowsFound: 6,
        },
      };

      act(() => {
        messageListeners.forEach((listener) => {
          listener(mutationNotification, {}, () => {});
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Live Synced \(1 turn\) · Strategy: CSS_MODULES/i)).toBeTruthy();
      });

      // Verify the tile is displayed
      expect(screen.getByText('C')).toBeTruthy();
      expect(screen.getByText('R')).toBeTruthy();
    });

    it('Prevents race condition: slow get_board_state response cannot overwrite newer mutation', async () => {
      let pendingCallback: ((res: unknown) => void) | null = null;

      // Mock sendMessage to delay invocation
      const chromeMock = (global as unknown as { chrome: typeof chrome }).chrome;
      chromeMock.tabs.sendMessage = vi.fn().mockImplementation((_id: number, _msg: unknown, cb?: (res: unknown) => void) => {
        if (cb) {
          pendingCallback = cb;
        }
        return Promise.resolve();
      });

      render(<PopupApp />);

      // A newer live mutation arrives with 2 turns BEFORE the initial sendMessage resolves
      const mutationNotification: BoardMutatedNotification = {
        type: 'BOARD_MUTATED',
        payload: {
          success: true,
          strategy: 'CSS_MODULES',
          turns: [
            { guess: 'SLATE', feedback: [0, 0, 0, 0, 0] },
            { guess: 'CORNY', feedback: [0, 2, 0, 0, 0] },
          ],
          activeRowIndex: 2,
          isRoundWon: false,
          isRoundLost: false,
          isComplete: false,
          rawRowsFound: 6,
        },
      };

      act(() => {
        messageListeners.forEach((listener) => {
          listener(mutationNotification, {}, () => {});
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Live Synced \(2 turns\) · Strategy: CSS_MODULES/i)).toBeTruthy();
      });

      // Now the delayed initial response (having 0 turns) finally arrives
      act(() => {
        if (pendingCallback) {
          pendingCallback({
            type: 'BOARD_STATE_RESULT',
            payload: {
              success: true,
              strategy: 'CSS_MODULES',
              turns: [],
              activeRowIndex: 0,
              isRoundWon: false,
              isRoundLost: false,
              isComplete: false,
              rawRowsFound: 6,
            },
          });
        }
      });

      // Board must NOT revert back to 0 turns!
      expect(screen.getByText(/Live Synced \(2 turns\) · Strategy: CSS_MODULES/i)).toBeTruthy();
      expect(screen.queryByText(/Live Synced \(Empty board\)/i)).toBeNull();
    });
  });

  describe('4. Contradiction Diagnosis and Solved States', () => {
    it('Diagnoses contradiction when candidate pool drops to 0', async () => {
      mockSendMessageResponse = {
        type: 'BOARD_STATE_RESULT',
        payload: {
          success: true,
          strategy: 'CSS_MODULES',
          turns: [
            // Contradictory pattern: S is both correct (green at 0) and absent (grey at 0)
            { guess: 'SALET', feedback: [2, 0, 0, 0, 0] },
            { guess: 'SOARE', feedback: [0, 0, 0, 0, 0] },
          ],
          activeRowIndex: 2,
          isRoundWon: false,
          isRoundLost: false,
          isComplete: false,
          rawRowsFound: 6,
        },
      };

      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByText(/Contradiction Detected/i)).toBeTruthy();
        expect(screen.getByText(/No Matching Words/i)).toBeTruthy();
      });

      expect(screen.getByText(/internally contradictory/i)).toBeTruthy();
    });

    it('Detects puzzle solved state when all tiles are green', async () => {
      mockSendMessageResponse = {
        type: 'BOARD_STATE_RESULT',
        payload: {
          success: true,
          strategy: 'CSS_MODULES',
          turns: [
            { guess: 'CRANE', feedback: [2, 2, 2, 2, 2] },
          ],
          activeRowIndex: 1,
          isRoundWon: true,
          isRoundLost: false,
          isComplete: true,
          rawRowsFound: 6,
        },
      };

      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByText(/Puzzle Solved/i)).toBeTruthy();
        expect(screen.getByText(/Round Complete/i)).toBeTruthy();
        expect(screen.getByText(/Target identified in 1 turn\./i)).toBeTruthy();
      });

      // Manual input controls should be suppressed when solved
      expect(screen.queryByPlaceholderText('TYPE GUESS')).toBeNull();
    });
  });

  describe('5. Manual Entry Mode Controls and Feedback Toggling', () => {
    it('Allows typing a guess, cycling feedback, submitting, and resetting manually', async () => {
      // Start in manual mode
      mockActiveTab = {
        id: 3,
        index: 0,
        windowId: 1,
        active: true,
        url: 'https://example.com',
      };

      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByText(/○ Manual/i)).toBeTruthy();
      });

      const input = screen.getByPlaceholderText('TYPE GUESS');
      const addBtn = screen.getByRole('button', { name: /Add ↵/i });

      // Initially Add button is disabled
      expect(addBtn.hasAttribute('disabled')).toBe(true);

      // Type 5-letter word
      fireEvent.change(input, { target: { value: 'slate' } });
      expect(addBtn.hasAttribute('disabled')).toBe(false);

      // Click the first interactive tile to cycle feedback: 0 (absent) -> 1 (present)
      const tiles = screen.getAllByRole('button', { name: /Toggle tile/i });
      expect(tiles.length).toBe(5);

      // Toggle first tile to yellow
      fireEvent.click(tiles[0]!);
      // Toggle again to green
      fireEvent.click(tiles[0]!);

      // Click Add
      fireEvent.click(addBtn);

      // S-L-A-T-E submitted into board
      expect(screen.getByText('S')).toBeTruthy();
      expect(input.getAttribute('value')).toBe('');

      // Recommendation updates
      await waitFor(() => {
        const surviving = screen.getByText(/\/ 2,315/i);
        expect(surviving.textContent).not.toBe('2,315 / 2,315');
      });

      // Reset button clears turns
      const resetBtn = screen.getByRole('button', { name: /Reset/i });
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(screen.getByText('2,315 / 2,315')).toBeTruthy();
      });
    });

    it('Switches between manual mode and live sync when toggled, and supports manual refresh', async () => {
      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByText(/● Synced/i)).toBeTruthy();
      });

      // Toggle to manual
      const toggleBtn = screen.getByRole('button', { name: /Manual Mode/i });
      fireEvent.click(toggleBtn);

      expect(screen.getByText(/○ Manual/i)).toBeTruthy();
      expect(screen.getByPlaceholderText('TYPE GUESS')).toBeTruthy();

      // Toggle back to live sync
      const useLiveBtn = screen.getByRole('button', { name: /Use Live Sync/i });
      fireEvent.click(useLiveBtn);

      await waitFor(() => {
        expect(screen.getByText(/● Synced/i)).toBeTruthy();
      });

      // Refresh button re-invokes requestLiveBoard
      const refreshBtn = screen.getByRole('button', { name: /Refresh board/i });
      fireEvent.click(refreshBtn);

      expect(screen.getByText(/● Synced/i)).toBeTruthy();
    });
  });
});
