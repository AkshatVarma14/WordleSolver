import React, { useState } from 'react';
import { SearchBudget, StrategyType } from '@wordle-solver/solver';

interface StrategyControlsProps {
  readonly strategy?: StrategyType;
  readonly onSelectStrategy?: (strat: StrategyType) => void;
  readonly budget?: SearchBudget;
  readonly onUpdateBudget?: (budget: SearchBudget) => void;
  readonly onCompare?: () => void;
  readonly onReset: () => void;
  readonly onClearRow: () => void;
  readonly onSubmitRow: () => void;
  readonly hasRowInput: boolean;
}

export const StrategyControls: React.FC<StrategyControlsProps> = ({
  strategy = 'FAST_ENTROPY',
  onSelectStrategy,
  budget,
  onUpdateBudget,
  onCompare,
  onReset,
  onClearRow,
  onSubmitRow,
  hasRowInput,
}) => {
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const handleUpdateTimeout = (timeoutMs: number) => {
    if (budget && onUpdateBudget) {
      onUpdateBudget({ ...budget, timeoutMs });
    }
  };

  const handleUpdateDepth = (maxDepth: number) => {
    if (budget && onUpdateBudget) {
      onUpdateBudget({ ...budget, maxDepth });
    }
  };

  const handleUpdateBranchCandidates = (maxBranchCandidates: number) => {
    if (budget && onUpdateBudget) {
      onUpdateBudget({ ...budget, maxBranchCandidates });
    }
  };

  return (
    <div className="controls-panel" aria-label="Game Board Controls">
      {onSelectStrategy && (
        <div className="strategy-toggle-group" role="radiogroup" aria-label="Strategy Selection">
          <button
            type="button"
            className={`btn-strategy ${strategy === 'FAST_ENTROPY' ? 'active' : ''}`}
            onClick={() => onSelectStrategy('FAST_ENTROPY')}
            role="radio"
            aria-checked={strategy === 'FAST_ENTROPY'}
          >
            Fast Entropy
          </button>
          <button
            type="button"
            className={`btn-strategy ${strategy === 'BOUNDED_MINIMAX' ? 'active' : ''}`}
            onClick={() => onSelectStrategy('BOUNDED_MINIMAX')}
            role="radio"
            aria-checked={strategy === 'BOUNDED_MINIMAX'}
          >
            Bounded Deeper Search
          </button>
        </div>
      )}

      <div className="action-buttons-group">
        {hasRowInput && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSubmitRow}
              title="Apply this row and update candidate analysis"
            >
              Submit Guess ↵
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClearRow}
              title="Clear active row"
            >
              Clear Row
            </button>
          </>
        )}

        {onCompare && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCompare}
            title="Compare Fast Entropy and Bounded Minimax side-by-side"
          >
            Compare Strategies
          </button>
        )}

        {budget && onUpdateBudget && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowSettings((prev) => !prev)}
            title="Configure search limits"
            aria-expanded={showSettings}
          >
            Settings
          </button>
        )}

        <button
          type="button"
          className="btn btn-danger"
          onClick={onReset}
          title="Reset board and restart analysis"
        >
          Reset Board
        </button>
      </div>

      {showSettings && budget && onUpdateBudget && (
        <div className="budget-settings-card" role="region" aria-label="Search Budget Configuration">
          <h4>Bounded Search Parameters</h4>
          <div className="setting-row">
            <label htmlFor="budget-timeout">Timeout (ms):</label>
            <input
              id="budget-timeout"
              type="number"
              min={50}
              max={3000}
              step={50}
              value={budget.timeoutMs}
              onChange={(e) => handleUpdateTimeout(Math.max(50, Number(e.target.value)))}
            />
          </div>

          <div className="setting-row">
            <label htmlFor="budget-depth">Max Lookahead Depth:</label>
            <select
              id="budget-depth"
              value={budget.maxDepth}
              onChange={(e) => handleUpdateDepth(Number(e.target.value))}
            >
              <option value={1}>1 Ply (Greedy Lookahead)</option>
              <option value={2}>2 Plies (Recommended)</option>
              <option value={3}>3 Plies (Deep)</option>
            </select>
          </div>

          <div className="setting-row">
            <label htmlFor="budget-branches">Branch Candidates Cap:</label>
            <input
              id="budget-branches"
              type="number"
              min={5}
              max={50}
              step={5}
              value={budget.maxBranchCandidates}
              onChange={(e) => handleUpdateBranchCandidates(Math.max(5, Number(e.target.value)))}
            />
          </div>
        </div>
      )}
    </div>
  );
};
