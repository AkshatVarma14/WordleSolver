import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="title-area">
          <div className="logo-badge">W</div>
          <div>
            <h1>Wordle Solver &amp; AI Decision Assistant</h1>
            <p className="subtitle">
              Artificial Intelligence &amp; Soft Computing (AISC, CSE3121) — Information Gain &amp; Minimax Lookahead
            </p>
          </div>
        </div>

        <div className="header-badges">
          <span className="course-pill">Course: AISC (CSE3121)</span>
          <span className="offline-pill">100% Client-Side</span>
        </div>
      </div>
    </header>
  );
};
