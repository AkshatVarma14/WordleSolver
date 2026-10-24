import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TurnRecord,
  FeedbackPattern,
  TileFeedback,
  filterByLayeredHistory,
  getUnifiedRecommendation,
  UnifiedRecommendation,
  isValidWord,
} from '@wordle-solver/solver';
import { INITIAL_ANSWERS, ALL_VALID_GUESSES } from '../data/words';
import { extensionContributionService } from '../services/contribution';
import { GetBoardStateResponse, BoardMutatedNotification } from '../types/messages';
import './PopupApp.css';

// Pre-computed canonical opening recommendation (<1ms)
const INITIAL_REC: UnifiedRecommendation = getUnifiedRecommendation(
  INITIAL_ANSWERS,
  ALL_VALID_GUESSES,
  6
);

export const PopupApp: React.FC = () => {
  // Sync state with active NYT Wordle tab
  const [isLiveSync, setIsLiveSync] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>('Connecting to Wordle page...');
  const [turns, setTurns] = useState<readonly TurnRecord[]>([]);

  // Manual entry state (fallback or override)
  const [isManualMode, setIsManualMode] = useState<boolean>(false);
  const [manualGuess, setManualGuess] = useState<string>('');
  const [manualFeedback, setManualFeedback] = useState<FeedbackPattern>([0, 0, 0, 0, 0]);

  // Request counter to avoid stale async responses overwriting newer state
  const latestRequestIdRef = useRef<number>(0);

  // Request live board state from active tab's content script
  const requestLiveBoard = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;

    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      setIsLiveSync(false);
      setIsManualMode(true);
      setSyncMessage('Manual Mode (Not in Chrome extension context)');
      return;
    }

    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (requestId < latestRequestIdRef.current) return;

      const currentTab = activeTabs[0];

      if (!currentTab || !currentTab.id) {
        setIsLiveSync(false);
        setIsManualMode(true);
        setSyncMessage('Manual Mode (No active tab found)');
        return;
      }

      const isNytWordle =
        currentTab.url && currentTab.url.includes('nytimes.com/games/wordle');

      if (!isNytWordle) {
        setIsLiveSync(false);
        setIsManualMode(true);
        setSyncMessage('Manual Mode (Active tab is not NYT Wordle)');
        return;
      }

      // Query content script
      chrome.tabs.sendMessage<unknown, GetBoardStateResponse>(
        currentTab.id,
        { type: 'GET_BOARD_STATE' },
        (response) => {
          if (requestId < latestRequestIdRef.current) return;

          if (chrome.runtime.lastError || !response || !response.payload) {
            setIsLiveSync(false);
            setIsManualMode(true);
            setSyncMessage('Manual Mode (Could not reach Wordle board — refresh NYT tab to sync)');
            return;
          }

          const result = response.payload;
          if (result.success) {
            setIsLiveSync(true);
            setIsManualMode(false);
            setTurns(result.turns);
            setSyncMessage(
              result.turns.length === 0
                ? `Live Synced (Empty board) · Strategy: ${result.strategy}`
                : `Live Synced (${result.turns.length} ${result.turns.length === 1 ? 'turn' : 'turns'}) · Strategy: ${result.strategy}`
            );
          } else {
            setIsLiveSync(false);
            setIsManualMode(true);
            setSyncMessage('Manual Mode (Wordle board not found or splash screen active)');
          }
        }
      );
    } catch {
      if (requestId < latestRequestIdRef.current) return;
      setIsLiveSync(false);
      setIsManualMode(true);
      setSyncMessage('Manual Mode (Extension connection failed)');
    }
  }, []);

  // Fetch board state on popup open & subscribe to live mutations
  useEffect(() => {
    requestLiveBoard();

    // Listen for live updates broadcast by content script
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const messageListener = (message: unknown) => {
        const notif = message as BoardMutatedNotification;
        if (notif?.type === 'BOARD_MUTATED' && notif.payload?.success) {
          latestRequestIdRef.current++;
          setIsLiveSync(true);
          setIsManualMode(false);
          setTurns(notif.payload.turns);
          setSyncMessage(
            notif.payload.turns.length === 0
              ? `Live Synced (Empty board) · Strategy: ${notif.payload.strategy}`
              : `Live Synced (${notif.payload.turns.length} ${notif.payload.turns.length === 1 ? 'turn' : 'turns'}) · Strategy: ${notif.payload.strategy}`
          );
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);
      return () => {
        chrome.runtime.onMessage.removeListener(messageListener);
      };
    }
    return undefined;
  }, [requestLiveBoard]);

  // Compute candidates and recommendations from shared engine
  const {
    candidates,
    isContradiction,
    contradictionDiagnosis,
    recommendation,
    isExpandedFallback,
  } = useMemo(() => {
    const layeredResult = filterByLayeredHistory(INITIAL_ANSWERS, ALL_VALID_GUESSES, turns);
    const remaining = layeredResult.candidates;
    let rec: UnifiedRecommendation;

    if (layeredResult.isContradiction) {
      rec = getUnifiedRecommendation([], ALL_VALID_GUESSES, 6 - turns.length, {
        candidateScope: layeredResult.scope,
        isExpandedFallback: false,
      });
    } else if (turns.length === 0) {
      rec = INITIAL_REC;
    } else {
      rec = getUnifiedRecommendation(remaining, ALL_VALID_GUESSES, 6 - turns.length, {
        candidateScope: layeredResult.scope,
        isExpandedFallback: layeredResult.isExpandedFallback,
      });
    }

    return {
      candidates: remaining,
      isContradiction: layeredResult.isContradiction,
      contradictionDiagnosis: layeredResult.contradictionDiagnosis,
      recommendation: rec,
      isExpandedFallback: layeredResult.isExpandedFallback,
    };
  }, [turns]);

  // Manual Mode handlers
  const handleToggleManualMode = () => {
    setIsManualMode((prev: boolean) => {
      const next = !prev;
      if (!next) {
        requestLiveBoard();
      }
      return next;
    });
  };

  const handleManualFeedbackToggle = (colIndex: number) => {
    setManualFeedback((prev: FeedbackPattern) => {
      const next: [TileFeedback, TileFeedback, TileFeedback, TileFeedback, TileFeedback] = [
        prev[0],
        prev[1],
        prev[2],
        prev[3],
        prev[4],
      ];
      next[colIndex] = (((next[colIndex] ?? 0) + 1) % 3) as TileFeedback;
      return next;
    });
  };

  const handleAddManualTurn = () => {
    const trimmed = manualGuess.trim().toUpperCase();
    if (trimmed.length !== 5 || !isValidWord(trimmed)) return;

    setTurns((prev: readonly TurnRecord[]) => [...prev, { guess: trimmed, feedback: manualFeedback }]);
    setManualGuess('');
    setManualFeedback([0, 0, 0, 0, 0]);
  };

  const handleResetManual = () => {
    setTurns([]);
    setManualGuess('');
    setManualFeedback([0, 0, 0, 0, 0]);
  };

  // Round completion detection
  const isWon = turns.some((t: TurnRecord) => t.feedback.every((tile: TileFeedback) => tile === 2));

  // Automatic missing-answer contribution upon puzzle win (Stage 9B)
  useEffect(() => {
    if (isWon) {
      void extensionContributionService.evaluateAndSubmit(
        turns,
        INITIAL_ANSWERS,
        ALL_VALID_GUESSES,
        'extension'
      );
    }
  }, [isWon, turns]);

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="header-brand">
          <div className="logo-badge">W</div>
          <div>
            <h1>Wordle Solver</h1>
            <span className="version-pill">v0.1.0 · MV3</span>
          </div>
        </div>

        <div className="status-row">
          <span className={`status-badge ${isLiveSync && !isManualMode ? 'live' : 'manual'}`}>
            {isLiveSync && !isManualMode ? '● Synced' : '○ Manual'}
          </span>
          <div className="header-actions">
            <button
              type="button"
              className="refresh-btn"
              onClick={() => requestLiveBoard()}
              title="Refresh board from active tab"
              aria-label="Refresh board"
            >
              ↻
            </button>
            <button
              type="button"
              className="toggle-mode-btn"
              onClick={handleToggleManualMode}
              title={isManualMode ? 'Switch to Live Sync' : 'Switch to Manual Input'}
            >
              {isManualMode ? 'Use Live Sync' : 'Manual Mode'}
            </button>
          </div>
        </div>
        <p className="sync-detail">{syncMessage}</p>
      </header>

      {/* Main Board View */}
      <section className="popup-board-section">
        <div className="board-grid">
          {Array.from({ length: 6 }, (_, r) => {
            const turn = turns[r];
            const isManualActive = isManualMode && r === turns.length && !isWon;

            if (turn) {
              return (
                <div key={r} className="board-row submitted">
                  {turn.guess.split('').map((char, c) => {
                    const fb = turn.feedback[c] ?? 0;
                    const stateClass = fb === 2 ? 'correct' : fb === 1 ? 'present' : 'absent';
                    return (
                      <div key={c} className={`tile ${stateClass}`}>
                        {char}
                      </div>
                    );
                  })}
                </div>
              );
            }

            if (isManualActive) {
              return (
                <div key={r} className="board-row active-manual">
                  {Array.from({ length: 5 }, (_, c) => {
                    const char = manualGuess[c] ?? '';
                    const fb = manualFeedback[c] ?? 0;
                    const stateClass = char ? (fb === 2 ? 'correct' : fb === 1 ? 'present' : 'absent') : 'empty';
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`tile ${stateClass} interactive`}
                        onClick={() => handleManualFeedbackToggle(c)}
                        title="Click to toggle feedback: Grey -> Yellow -> Green"
                        aria-label={`Toggle tile ${c + 1} feedback`}
                      >
                        {char}
                      </button>
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={r} className="board-row empty">
                {Array.from({ length: 5 }, (_, c) => (
                  <div key={c} className="tile empty" />
                ))}
              </div>
            );
          })}
        </div>

        {/* Manual Input Controls */}
        {isManualMode && !isWon && turns.length < 6 && (
          <div className="manual-controls">
            <div className="input-group">
              <input
                type="text"
                maxLength={5}
                value={manualGuess}
                onChange={(e) => setManualGuess(e.target.value.toUpperCase().slice(0, 5))}
                placeholder="TYPE GUESS"
                className="manual-input"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddManualTurn}
                disabled={manualGuess.length !== 5 || !isValidWord(manualGuess)}
              >
                Add ↵
              </button>
            </div>
            <div className="hint-row">
              <small>Click letters to toggle feedback. 1: Grey, 2: Yellow, 3: Green.</small>
              {turns.length > 0 && (
                <button type="button" className="btn-link" onClick={handleResetManual}>
                  Reset
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Recommendation Panel */}
      <section className="popup-rec-section">
        {isWon ? (
          <div className="rec-card solved">
            <span className="badge-tag won">Puzzle Solved</span>
            <h3>Round Complete</h3>
            <p>Target identified in {turns.length} {turns.length === 1 ? 'turn' : 'turns'}.</p>
          </div>
        ) : isContradiction && contradictionDiagnosis ? (
          <div className="rec-card contradiction">
            <span className="badge-tag contradiction">Contradiction Detected</span>
            <h3>No Matching Words</h3>
            <p className="contradiction-desc">{contradictionDiagnosis.explanation}</p>
          </div>
        ) : (
          <div className="rec-card active">
            <div className="rec-header-row">
              <span className="rec-label">Recommended Guess</span>
              <span className={`badge-tag ${isExpandedFallback ? 'fallback' : recommendation.status.toLowerCase()}`}>
                {isExpandedFallback ? 'Fallback (Unverified)' : recommendation.status}
              </span>
            </div>

            {isExpandedFallback && (
              <div className="fallback-banner">
                Curated answer list exhausted. Showing matches from accepted guesses.
              </div>
            )}

            <div className="recommended-word-box">
              <span className="word-text">{recommendation.recommendedGuess ?? '—'}</span>
            </div>

            <div className="metrics-row">
              <div className="metric">
                <span className="metric-label">{isExpandedFallback ? 'Fallback Pool' : 'Surviving'}</span>
                <span className="metric-value">
                  {candidates.length.toLocaleString()} / {isExpandedFallback ? '12,972' : '2,315'}
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">Information Gain</span>
                <span className="metric-value">
                  {recommendation.entropyBits ? `${recommendation.entropyBits.toFixed(2)} bits` : '—'}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Advisory Footer */}
      <footer className="popup-footer">
        <p className="disclaimer">
          Decision Support Only · Enters no automated keystrokes.
        </p>
      </footer>
    </div>
  );
};
