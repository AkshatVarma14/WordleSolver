import React from 'react';
import { GuaranteeStatus, RecommendationResult, StrategyType } from '@wordle-solver/solver';

interface RecommendationPanelProps {
  readonly recommendation: RecommendationResult | null;
  readonly loading: boolean;
  readonly strategy: StrategyType;
  readonly onAutofill: (word: string) => void;
}

const STATUS_LABELS: Record<GuaranteeStatus, { label: string; className: string; description: string }> = {
  WON: {
    label: 'Target Solved',
    className: 'status-won',
    description: 'Target word identified uniquely with 100% certainty.',
  },
  PROVED_WIN: {
    label: 'Proved Win Guaranteed',
    className: 'status-proved',
    description: 'Mathematically verified strategy guarantees a win for all remaining candidates within turn budget.',
  },
  DISPROVED_WIN: {
    label: 'Unwinnable Within Budget',
    className: 'status-disproved',
    description: 'Exhaustively proved that no sequence of moves can guarantee solving all candidates in the remaining turns.',
  },
  UNRESOLVED_RESOURCE_LIMIT: {
    label: 'Bounded Heuristic (Resource Cap)',
    className: 'status-unresolved',
    description: 'Search stopped due to time budget or node limit. The recommendation is a strong heuristic choice, not a mathematical proof.',
  },
};

export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  recommendation,
  loading,
  strategy,
  onAutofill,
}) => {
  if (loading) {
    return (
      <div className="recommendation-card loading-card" aria-live="polite" aria-busy="true">
        <div className="spinner" />
        <div className="loading-text">
          <strong>Evaluating game tree...</strong>
          <small>
            {strategy === 'FAST_ENTROPY'
              ? 'Computing Shannon information gain across vocabulary'
              : 'Exploring multi-ply minimax lookahead with branch pruning'}
          </small>
        </div>
      </div>
    );
  }

  if (!recommendation || !recommendation.recommendedGuess) {
    if (recommendation?.isContradiction) {
      return (
        <div className="recommendation-card contradiction-card" role="alert">
          <h3>No Recommendation Available</h3>
          <p>The feedback sequence contains contradictory information resulting in 0 candidates.</p>
        </div>
      );
    }
    return (
      <div className="recommendation-card empty-card">
        <h3>Ready to Solve</h3>
        <p>Enter your guess and set the tile colors above to view AI recommendations.</p>
      </div>
    );
  }

  const { recommendedGuess, evaluation, searchMetrics, status, explanation, warning } = recommendation;
  const statusMeta = status ? STATUS_LABELS[status] : null;

  return (
    <section className="recommendation-card" aria-label="AI Move Recommendation">
      <div className="rec-header">
        <div className="rec-meta">
          <span className="strategy-tag">
            {strategy === 'FAST_ENTROPY' ? '⚡ Fast Shannon Entropy' : '🌲 Bounded Deeper Search'}
          </span>
          {statusMeta && (
            <span
              className={`status-tag ${statusMeta.className}`}
              title={statusMeta.description}
            >
              {statusMeta.label}
            </span>
          )}
        </div>

        <div className="rec-word-hero">
          <div className="rec-word-display">
            <span className="rec-label">Recommended Guess:</span>
            <span className="rec-word">{recommendedGuess}</span>
          </div>
          <button
            type="button"
            className="btn btn-primary autofill-btn"
            onClick={() => onAutofill(recommendedGuess)}
            title={`Fill '${recommendedGuess}' into the active row`}
          >
            Fill Word ↵
          </button>
        </div>
      </div>

      {warning && (
        <div className="warning-banner" role="status">
          <span className="warning-icon">ℹ️</span>
          <span>{warning}</span>
        </div>
      )}

      {evaluation && (
        <div className="metrics-grid">
          <div className="metric-box">
            <span className="metric-title">Information Gain</span>
            <span className="metric-val">{evaluation.entropyBits.toFixed(2)}</span>
            <span className="metric-sub">bits of entropy</span>
          </div>

          <div className="metric-box">
            <span className="metric-title">Expected Pool</span>
            <span className="metric-val">{evaluation.expectedRemaining.toFixed(1)}</span>
            <span className="metric-sub">remaining candidates</span>
          </div>

          <div className="metric-box">
            <span className="metric-title">Worst-Case Size</span>
            <span className="metric-val">{evaluation.worstCasePartitionSize}</span>
            <span className="metric-sub">largest partition</span>
          </div>

          <div className="metric-box">
            <span className="metric-title">Immediate Win</span>
            <span className="metric-val">
              {(evaluation.immediateWinProbability * 100).toFixed(1)}%
            </span>
            <span className="metric-sub">
              {evaluation.isCandidate ? 'in candidate set' : 'exploratory probe'}
            </span>
          </div>

          {searchMetrics && (
            <>
              <div className="metric-box">
                <span className="metric-title">Nodes Expanded</span>
                <span className="metric-val">{searchMetrics.nodesExpanded.toLocaleString()}</span>
                <span className="metric-sub">{searchMetrics.durationMs}ms runtime</span>
              </div>

              <div className="metric-box">
                <span className="metric-title">Worst-Case Turns</span>
                <span className="metric-val">
                  {searchMetrics.worstCaseTurns !== undefined
                    ? `${searchMetrics.worstCaseTurns} turns`
                    : 'Unresolved'}
                </span>
                <span className="metric-sub">depth {searchMetrics.depthReached} reached</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="explanation-box">
        <p className="explanation-text">{explanation}</p>
      </div>
    </section>
  );
};
