import React from 'react';
import { RecommendationResult } from '@wordle-solver/solver';

interface ComparisonModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly fastResult: RecommendationResult | null;
  readonly deeperResult: RecommendationResult | null;
  readonly candidatesCount: number;
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({
  isOpen,
  onClose,
  fastResult,
  deeperResult,
  candidatesCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Strategy Comparison">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Algorithm & Strategy Comparison</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-intro">
            Comparing evaluations for <strong>{candidatesCount.toLocaleString()}</strong> surviving candidate words.
          </p>

          <div className="comparison-table-wrapper">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Metric / Dimension</th>
                  <th>⚡ Fast Shannon Entropy</th>
                  <th>🌲 Bounded Minimax Search</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Mathematical Objective</strong></td>
                  <td>Maximize Expected Information Gain: H(g) = -∑ P(p) log₂(P(p))</td>
                  <td>Minimize Worst-Case Turns: min_g max_p W(C_g,p)</td>
                </tr>
                <tr>
                  <td><strong>Recommended Move</strong></td>
                  <td className="highlight-cell">{fastResult?.recommendedGuess ?? '—'}</td>
                  <td className="highlight-cell">{deeperResult?.recommendedGuess ?? '—'}</td>
                </tr>
                <tr>
                  <td><strong>Information Gain</strong></td>
                  <td>{fastResult?.evaluation?.entropyBits.toFixed(2) ?? '—'} bits</td>
                  <td>{deeperResult?.evaluation?.entropyBits.toFixed(2) ?? '—'} bits</td>
                </tr>
                <tr>
                  <td><strong>Expected Remaining Candidates</strong></td>
                  <td>{fastResult?.evaluation?.expectedRemaining.toFixed(1) ?? '—'}</td>
                  <td>{deeperResult?.evaluation?.expectedRemaining.toFixed(1) ?? '—'}</td>
                </tr>
                <tr>
                  <td><strong>Worst-Case Partition</strong></td>
                  <td>{fastResult?.evaluation?.worstCasePartitionSize ?? '—'} words</td>
                  <td>{deeperResult?.evaluation?.worstCasePartitionSize ?? '—'} words</td>
                </tr>
                <tr>
                  <td><strong>Immediate Win Chance</strong></td>
                  <td>
                    {fastResult?.evaluation
                      ? `${(fastResult.evaluation.immediateWinProbability * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td>
                    {deeperResult?.evaluation
                      ? `${(deeperResult.evaluation.immediateWinProbability * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td><strong>Worst-Case Turns to Win</strong></td>
                  <td>Not computed (1-ply greedy)</td>
                  <td>
                    {deeperResult?.searchMetrics?.worstCaseTurns !== undefined
                      ? `${deeperResult.searchMetrics.worstCaseTurns} turns`
                      : 'Unresolved'}
                  </td>
                </tr>
                <tr>
                  <td><strong>Guarantee Status</strong></td>
                  <td>Heuristic (No proof claimed)</td>
                  <td>
                    <span className={`status-badge-inline ${deeperResult?.status ?? ''}`}>
                      {deeperResult?.status ?? 'UNRESOLVED_RESOURCE_LIMIT'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td><strong>Nodes Expanded / Runtime</strong></td>
                  <td>1 pass / &lt;10ms</td>
                  <td>
                    {deeperResult?.searchMetrics
                      ? `${deeperResult.searchMetrics.nodesExpanded.toLocaleString()} nodes (${deeperResult.searchMetrics.durationMs}ms)`
                      : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="comparison-notes">
            <h4>AISC Academic Insight:</h4>
            <p>
              <strong>Fast Entropy</strong> aims to reduce candidate uncertainty as rapidly as possible on average.
              However, when candidate families share common suffixes (e.g. <code>_ATCH</code> or <code>_OUND</code>),
              greedy entropy can walk into multi-turn traps.
            </p>
            <p>
              <strong>Bounded Minimax</strong> guards against worst-case dead ends by looking ahead multiple plies and
              proving whether all remaining candidates can be resolved within the turn limit.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
