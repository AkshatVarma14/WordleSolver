import React, { useState, useMemo } from 'react';

interface CandidateViewerProps {
  readonly candidates: readonly string[];
  readonly totalInitial: number;
  readonly isContradiction: boolean;
  readonly isExpandedFallback?: boolean;
  readonly onSelectWord: (word: string) => void;
}

const PAGE_SIZE = 100;

export const CandidateViewer: React.FC<CandidateViewerProps> = ({
  candidates,
  totalInitial,
  isContradiction,
  isExpandedFallback = false,
  onSelectWord,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showAll, setShowAll] = useState<boolean>(false);

  const filteredCandidates = useMemo(() => {
    if (!searchTerm.trim()) {
      return candidates;
    }
    const query = searchTerm.trim().toUpperCase();
    return candidates.filter((w) => w.includes(query));
  }, [candidates, searchTerm]);

  const displayedList = useMemo(() => {
    if (showAll || filteredCandidates.length <= PAGE_SIZE) {
      return filteredCandidates;
    }
    return filteredCandidates.slice(0, PAGE_SIZE);
  }, [filteredCandidates, showAll]);

  const reductionPercent =
    totalInitial > 0
      ? Math.max(0, ((totalInitial - candidates.length) / totalInitial) * 100).toFixed(1)
      : '0.0';

  return (
    <section className="candidate-viewer-card" aria-label="Candidate Words Inspector">
      <div className="candidate-header">
        <div className="candidate-count-group">
          <h3>Surviving Candidates</h3>
          <div className="candidate-badge">
            <span className="count-number">{candidates.length.toLocaleString()}</span>
            {isExpandedFallback ? (
              <span className="count-total">fallback (unverified)</span>
            ) : (
              <span className="count-total">/ {totalInitial.toLocaleString()}</span>
            )}
          </div>
        </div>
        <div className="reduction-pill">
          {isExpandedFallback ? (
            <span className="status-tag status-unresolved">Expanded Dictionary</span>
          ) : (
            <span>{reductionPercent}% eliminated</span>
          )}
        </div>
      </div>

      {isContradiction ? (
        <div className="contradiction-alert" role="alert">
          <div className="alert-content">
            <strong>Contradiction Detected: 0 candidates remain</strong>
            <p>
              No words in the dictionary match the recorded feedback pattern. Please check previously
              submitted rows for conflicting tile colors (e.g. marking a letter Grey in one row and
              Green in another).
            </p>
          </div>
        </div>
      ) : candidates.length === 0 ? (
        <div className="empty-candidates-msg">
          <p>No candidates available.</p>
        </div>
      ) : (
        <>
          <div className="candidate-search-bar">
            <input
              type="text"
              placeholder="Search remaining words..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="candidate-search-input"
              aria-label="Filter remaining candidate words"
              maxLength={5}
            />
            {searchTerm && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search query"
              >
                ✕
              </button>
            )}
          </div>

          <div className="candidate-chips-container" role="list">
            {displayedList.map((word) => (
              <button
                key={word}
                type="button"
                className="candidate-chip"
                onClick={() => onSelectWord(word)}
                title={`Click to fill '${word}' into active row`}
                role="listitem"
              >
                {word}
              </button>
            ))}
          </div>

          {filteredCandidates.length > PAGE_SIZE && !showAll && (
            <div className="candidate-pagination-hint">
              <span>
                Showing first {PAGE_SIZE} of {filteredCandidates.length.toLocaleString()} matching words.{' '}
              </span>
              <button
                type="button"
                className="btn-link"
                onClick={() => setShowAll(true)}
              >
                Show all {filteredCandidates.length.toLocaleString()}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};
