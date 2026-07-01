import React, { useEffect, useMemo, useState } from 'react';
import Loader from '../components/Loader';

function groupByRRF(matches) {
  if (!Array.isArray(matches)) return [];
  return matches.map(match => ({
    rrf_id: match.rrf_id,
    pos_title: match.pos_title,
    account: match.account,
    recommended_candidates: match.recommended_candidates || []
  }));
}

const Matches = ({
  rrfCount, benchCount, useEnhancedMatching, setUseEnhancedMatching, handleMatchCandidates, matching, matches, handleDownloadExcel
}) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (rrfCount !== undefined && benchCount !== undefined) setLoading(false);
  }, [rrfCount, benchCount]);

  const groupedRRFs = useMemo(() => groupByRRF(matches), [matches]);
  const totalCandidates = groupedRRFs.reduce((sum, item) => sum + (item.recommended_candidates?.length || 0), 0);

  if (loading) return <Loader message="Loading matches..." />;

  return (
    <section className="matching-section">
      <div className="matching-info">
        <div className="info-card">
          <h4>Current Data in Database</h4>
          <p><strong>Open RRFs:</strong> {rrfCount} positions available for matching</p>
          <p><strong>Bench Employees:</strong> {benchCount} candidates available</p>
          <p className="info-note">Info: You can re-run matching here, or go to the Upload section to upload new files and match.</p>
        </div>
      </div>

      <div className="matches-summary-row">
        <div className="summary-chip"><strong>{groupedRRFs.length}</strong><span>RRFs matched</span></div>
        <div className="summary-chip"><strong>{totalCandidates}</strong><span>Total recommendations</span></div>
        <div className="summary-chip"><strong>{useEnhancedMatching ? 'On' : 'Off'}</strong><span>Enhanced scoring</span></div>
      </div>

      <div className="matching-controls">
        <div className="matching-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useEnhancedMatching}
              onChange={(e) => setUseEnhancedMatching(e.target.checked)}
            />
            <span>Use Enhanced Matching (Multi-factor scoring)</span>
          </label>
        </div>
        <button className="btn-primary" onClick={handleMatchCandidates} disabled={matching}>
          {matching ? 'Matching Candidates...' : 'Re-run Matching'}
        </button>
        {(rrfCount === 0 || benchCount === 0) && (
          <p className="matching-warning">Warning: Please upload both RRF and Bench files in the Upload section first.</p>
        )}
      </div>

      {matching && <Loader message="Finding the best candidate matches..." />}

      {!matching && groupedRRFs.length === 0 ? (
        <div className="empty-state-panel">
          <strong>No matching results yet.</strong>
          <span>Run matching to see ranked candidates for each open RRF.</span>
        </div>
      ) : null}

      {groupedRRFs.length > 0 && (
        <div className="matches-container">
          <div className="matches-header">
            <h3>Matching Results</h3>
            <button className="btn-download" onClick={handleDownloadExcel} title="Download results as Excel file">
              Download Excel
            </button>
          </div>

          {groupedRRFs.map((rrf, idx) => {
            const topScore = rrf.recommended_candidates?.[0]?.match_score ?? 'N/A';
            return (
              <div key={idx} className="match-card">
                <div className="match-header">
                  <div>
                    <h4>
                      {rrf.pos_title || 'Position'}
                      {rrf.rrf_id && ` (RRF ID: ${rrf.rrf_id})`}
                    </h4>
                    <div className="match-subtitle">
                      <span className="badge">{rrf.account || 'No account'}</span>
                      <span className="match-subtle">Top score: {topScore}</span>
                    </div>
                  </div>
                  <div className="candidate-count-pill">
                    {rrf.recommended_candidates.length} candidate{rrf.recommended_candidates.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="candidates-list">
                  {rrf.recommended_candidates.length === 0 ? (
                    <div className="empty-state-panel">No recommended candidates for this position.</div>
                  ) : (
                    rrf.recommended_candidates.map((candidate, cidx) => (
                      <div key={cidx} className="candidate-item compact">
                        <div className="candidate-header">
                          <span className="candidate-name">{candidate.employee_details?.name || candidate.name || 'Unnamed candidate'}</span>
                          <span className="candidate-score">{candidate.match_score ?? 'N/A'}</span>
                        </div>
                        <div className="candidate-meta">
                          <span>{candidate.vamid || '-'}</span>
                          <span>{candidate.employee_details?.grade || '-'}</span>
                          <span>{candidate.employee_details?.designation || '-'}</span>
                        </div>
                        <div className="candidate-skill">
                          {candidate.skill_alignment || candidate.employee_details?.skill || candidate.employee_details?.current_skill || 'No skill details available'}
                        </div>
                        {candidate.reasoning && <div className="candidate-reasoning">{candidate.reasoning}</div>}
                        {Array.isArray(candidate.potential_gaps) && candidate.potential_gaps.length > 0 && (
                          <div className="candidate-gaps"><strong>Gaps:</strong> {candidate.potential_gaps.join(', ')}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default Matches;
