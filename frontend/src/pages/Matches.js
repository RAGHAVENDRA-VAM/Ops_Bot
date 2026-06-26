

import React, { useEffect, useState } from 'react';
import Loader from '../components/Loader';

// Helper to group matches by RRF (position)
function groupByRRF(matches) {
  // matches: [{ rrf_id, pos_title, recommended_candidates: [...] }]
  if (!Array.isArray(matches)) return [];
  return matches.map(match => ({
    rrf_id: match.rrf_id,
    pos_title: match.pos_title,
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

  if (loading) return <Loader message="Loading matches..." />;

  // Expect matches to be the array from ai_matching.gemini_analysis.matches
  const groupedRRFs = groupByRRF(matches);
  return (
    <section className="matching-section">
      <div className="matching-info">
        <div className="info-card">
          <h4>Current Data in Database</h4>
          <p><strong>Open RRFs:</strong> {rrfCount} positions available for matching</p>
          <p><strong>Bench Employees:</strong> {benchCount} candidates available</p>
          <p className="info-note">
            ℹ️ You can re-run matching here, or go to the Upload section to upload new files and match.
          </p>
        </div>
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
        <button
          className="btn-primary"
          onClick={handleMatchCandidates}
          disabled={matching}
        >
          {matching ? 'Matching Candidates...' : 'Re-run Matching'}
        </button>
        {(rrfCount === 0 || benchCount === 0) && (
          <p className="matching-warning">
            ⚠️ Please upload both RRF and Bench files in the Upload section first.
          </p>
        )}
      </div>
      {groupedRRFs.length > 0 && (
        <div className="matches-container">
          <div className="matches-header">
            <h3>Matching Results (Grouped by RRF/Position)</h3>
            <button
              className="btn-download"
              onClick={handleDownloadExcel}
              title="Download results as Excel file"
            >
              📥 Download Excel
            </button>
          </div>
          {groupedRRFs.map((rrf, idx) => (
            <div key={idx} className="rrf-group">
              <h4>RRF ID: {rrf.rrf_id} | Position: {rrf.pos_title} {rrf.account ? `| Account: ${rrf.account}` : ''}</h4>
              {rrf.recommended_candidates.length === 0 ? (
                <div className="no-candidates">No recommended candidates for this position</div>
              ) : (
                <div className="matches-table-container" style={{overflowX: 'auto'}}>
                  <table className="matches-table" style={{minWidth: '700px', width: '100%', tableLayout: 'fixed'}}>
                    <thead>
                      <tr>
                        <th style={{width: '120px'}}>Name</th>
                        <th style={{width: '70px'}}>VAM ID</th>
                        <th style={{width: '60px'}}>Grade</th>
                        <th style={{width: '80px'}}>Skill</th>
                        <th style={{width: '60px'}}>Score</th>
                        <th style={{width: '120px'}}>Account</th>
                        <th style={{width: '180px'}}>Reasoning</th>
                        <th style={{width: '120px'}}>Gaps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rrf.recommended_candidates.map((cand, cidx) => (
                        <tr key={cidx}>
                          <td>{cand.employee_details?.name || '-'}</td>
                          <td>{cand.vamid || '-'}</td>
                          <td>{cand.employee_details?.grade || '-'}</td>
                          <td>{cand.employee_details?.skill || cand.employee_details?.current_skill || '-'}</td>
                          <td>{cand.match_score || '-'}</td>
                          <td>{cand.employee_details?.account_summary || '-'}</td>
                          <td style={{fontSize: '12px'}}>{cand.reasoning || '-'}</td>
                          <td style={{fontSize: '12px'}}>{Array.isArray(cand.potential_gaps) ? cand.potential_gaps.join(', ') : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default Matches;
