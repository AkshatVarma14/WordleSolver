import React from 'react';
import {
  ContradictionDiagnosis,
  GuaranteeStatus,
  RecommendationResult,
  StrategyType,
  UnifiedRecommendation,
} from '@wordle-solver/solver';

interface RecommendationPanelProps {
  readonly recommendation: RecommendationResult | UnifiedRecommendation | null;
  readonly loading: boolean;
  readonly isWon?: boolean;
  readonly turnsCount?: number;
  readonly contradictionDiagnosis?: ContradictionDiagnosis | null;
  readonly strategy?: StrategyType | 'UNIFIED';
  readonly onAutofill: (word: string) => void;
  readonly onStartEditingRow?: (rowIndex: number) => void;
  readonly onReset?: () => void;
}

const STATUS_LABELS: Record<
  GuaranteeStatus | 'HEURISTIC',
  { label: string; className: string; description: string }
> = {
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
    description: 'Exhaustively proved that no sequence of moves can guarantee solving all candidates in remaining turns.',
  },
  UNRESOLVED_RESOURCE_LIMIT: {
    label: 'Bounded Heuristic (Resource Cap)',
    className: 'status-unresolved',
    description: 'Search stopped due to budget limits. Recommendation is a sound heuristic choice, not an exhaustive proof.',
  },
  HEURISTIC: {
    label: 'Information Gain Heuristic',
    className: 'status-heuristic',
    description: 'Greedily maximizes Shannon entropy across examined moves to partition remaining candidates.',
  },
};

export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  recommendation,
  loading,
  isWon = false,
  turnsCount = 0,
  contradictionDiagnosis = null,
  strategy = 'UNIFIED',
  onAutofill,
  onStartEditingRow,
  onReset,
}) => {
  // 1. Round Complete State: 5 confirmed Green tiles
  if (isWon) {
    return (
      <section className="recommendation-card solved-card" aria-label="Round Complete">
        <div className="rec-header">
          <div className="rec-meta">
            <span className="status-tag status-won">Puzzle Solved</span>
          </div>
          <div className="solved-body">
            <h3>Round Complete</h3>
            <p className="solved-meta">Target word successfully identified in {turnsCount} {turnsCount === 1 ? 'turn' : 'turns'}.</p>
            {onReset && (
              <button type="button" className="btn btn-primary" onClick={onReset}>
                New Game
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // 2. Contradiction State
  if (contradictionDiagnosis || recommendation?.isContradiction) {
    const earliestIdx = contradictionDiagnosis?.earliestContradictionIndex;
    const earliestTurn = contradictionDiagnosis?.earliestContradictingTurn;
    const explanation =
      contradictionDiagnosis?.explanation ??
      'The recorded clues conflict with the configured answer vocabulary, leaving 0 matching words.';

    return (
      <div className="recommendation-card contradiction-card" role="alert">
        <div className="rec-meta">
          <span className="status-tag status-disproved">Contradiction Detected</span>
          {contradictionDiagnosis?.isVocabularyMismatch && (
            <span className="status-tag status-unresolved">Vocabulary Mismatch</span>
          )}
        </div>
        <div className="contradiction-content">
          <h3>No Candidates Remaining</h3>
          <p>{explanation}</p>
          {earliestIdx !== null && earliestIdx !== undefined && onStartEditingRow && (
            <div className="contradiction-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onStartEditingRow(earliestIdx)}
                title={`Edit Row ${earliestIdx + 1} feedback to resolve contradiction`}
              >
                Edit Row {earliestIdx + 1} {earliestTurn ? `('${earliestTurn.guess}')` : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. Loading State
  if (loading) {
    return (
      <div className="recommendation-card loading-card" aria-live="polite" aria-busy="true">
        <div className="spinner" />
        <div className="loading-text">
          <strong>Evaluating game tree...</strong>
          <small>
            {strategy === 'BOUNDED_MINIMAX'
              ? 'Exploring multi-ply minimax lookahead with branch pruning'
              : 'Computing Shannon information gain across vocabulary'}
          </small>
        </div>
      </div>
    );
  }

  // 4. Empty State
  if (!recommendation || !recommendation.recommendedGuess) {
    return (
      <div className="recommendation-card empty-card">
        <h3>Ready to Solve</h3>
        <p>Enter your guess and set the tile colors above to view recommendations.</p>
      </div>
    );
  }

  const { recommendedGuess } = recommendation;
  const status = recommendation.status ?? 'HEURISTIC';
  const statusMeta = STATUS_LABELS[status];

  // Extract metrics from either RecommendationResult or UnifiedRecommendation
  const entropyBits =
    'evaluation' in recommendation && recommendation.evaluation
      ? recommendation.evaluation.entropyBits
      : 'entropyBits' in recommendation
      ? recommendation.entropyBits
      : undefined;

  const expectedRemaining =
    'evaluation' in recommendation && recommendation.evaluation
      ? recommendation.evaluation.expectedRemaining
      : 'expectedRemaining' in recommendation
      ? recommendation.expectedRemaining
      : undefined;

  const worstCaseSize =
    'evaluation' in recommendation && recommendation.evaluation
      ? recommendation.evaluation.worstCasePartitionSize
      : undefined;

  const immediateWinProb =
    'evaluation' in recommendation && recommendation.evaluation
      ? recommendation.evaluation.immediateWinProbability
      : undefined;

  const isCandidate =
    'evaluation' in recommendation && recommendation.evaluation
      ? recommendation.evaluation.isCandidate
      : 'isCandidate' in recommendation
      ? recommendation.isCandidate
      : true;

  const nodesExpanded =
    'searchMetrics' in recommendation && recommendation.searchMetrics
      ? recommendation.searchMetrics.nodesExpanded
      : 'nodesExpanded' in recommendation
      ? recommendation.nodesExpanded
      : undefined;

  const worstCaseTurns =
    'searchMetrics' in recommendation && recommendation.searchMetrics
      ? recommendation.searchMetrics.worstCaseTurns
      : 'worstCaseTurns' in recommendation
      ? recommendation.worstCaseTurns
      : undefined;

  const reasonText =
    ('reason' in recommendation && recommendation.reason) ||
    ('explanation' in recommendation && recommendation.explanation) ||
    '';

  const warning = recommendation.warning;

  return (
    <section className="recommendation-card" aria-label="AI Move Recommendation">
      <div className="rec-header">
        <div className="rec-meta">
          <span className="strategy-tag">Authoritative Recommendation</span>
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
            <span className="rec-label">Recommended Guess</span>
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
          <span>{warning}</span>
        </div>
      )}

      {reasonText && (
        <div className="explanation-box">
          <p className="explanation-text">{reasonText}</p>
        </div>
      )}

      {(entropyBits !== undefined || nodesExpanded !== undefined) && (
        <div className="metrics-grid">
          {entropyBits !== undefined && (
            <div className="metric-box">
              <span className="metric-title">Information Gain</span>
              <span className="metric-val">{entropyBits.toFixed(2)}</span>
              <span className="metric-sub">bits of entropy</span>
            </div>
          )}

          {expectedRemaining !== undefined && (
            <div className="metric-box">
              <span className="metric-title">Expected Pool</span>
              <span className="metric-val">{expectedRemaining.toFixed(1)}</span>
              <span className="metric-sub">remaining candidates</span>
            </div>
          )}

          {worstCaseSize !== undefined && (
            <div className="metric-box">
              <span className="metric-title">Worst-Case Size</span>
              <span className="metric-val">{worstCaseSize}</span>
              <span className="metric-sub">largest partition</span>
            </div>
          )}

          {immediateWinProb !== undefined && (
            <div className="metric-box">
              <span className="metric-title">Immediate Win</span>
              <span className="metric-val">{(immediateWinProb * 100).toFixed(1)}%</span>
              <span className="metric-sub">
                {isCandidate ? 'in candidate set' : 'exploratory probe'}
              </span>
            </div>
          )}

          {nodesExpanded !== undefined && (
            <div className="metric-box">
              <span className="metric-title">Nodes Expanded</span>
              <span className="metric-val">{nodesExpanded.toLocaleString()}</span>
              <span className="metric-sub">search nodes</span>
            </div>
          )}

          {worstCaseTurns !== undefined && (
            <div className="metric-box">
              <span className="metric-title">Worst-Case Turns</span>
              <span className="metric-val">{worstCaseTurns} turns</span>
              <span className="metric-sub">guaranteed depth</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
