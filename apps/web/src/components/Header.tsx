import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="title-area">
          <div className="logo-badge">W</div>
          <div>
            <h1>Wordle Solver</h1>
            <p className="subtitle">
              Fast Information Gain &amp; Verified End-Game Lookahead
            </p>
          </div>
        </div>
        <div className="header-badges">
          <span className="offline-pill">Offline &amp; Client-Side</span>
        </div>
      </div>
    </header>
  );
};
