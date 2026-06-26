import React, { useEffect, useState } from 'react';
import Select from 'react-select';
import Loader from '../components/Loader';
import { MdCloudUpload } from 'react-icons/md';
import API_BASE from '../config';
import './Upload.css';
import axios from 'axios';

const Upload = ({
  rrfFile, benchFile, uploadingRrf, uploadingBench, rrfCount, benchCount, handleRrfUpload, handleBenchUpload, useEnhancedMatching, setUseEnhancedMatching, handleMatchCandidates, matching, matches, handleDownloadExcel
}) => {
  // State for rrf_id dropdown and analysis results
  const [rrfIdList, setRrfIdList] = useState([]);
  const [selectedRrfIds, setSelectedRrfIds] = useState([]);
  const [analyzeResults, setAnalyzeResults] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch RRF IDs for dropdown
  useEffect(() => {
    axios.get(`${API_BASE}/rrf`)
      .then(res => {
        let rrfList = Array.isArray(res.data) ? res.data : (res.data.rrf || []);
        setRrfIdList([...new Set(rrfList.map(r => r.rrf_id).filter(Boolean))]);
      })
      .catch(() => setRrfIdList([]))
      .finally(() => setLoading(false));
  }, []);

  // Analyze candidates for selected RRF ID
  const handleAnalyzeRrf = async () => {
    if (!selectedRrfIds || selectedRrfIds.length === 0) return;
    setAnalyzing(true);
    setAnalyzeResults([]);
    setError(null);
    let allResults = [];
    try {
      for (const rrfId of selectedRrfIds) {
        const response = await axios.get(`${API_BASE}/match_candidate/${rrfId}`);
        let results = [];
        if (response.data && response.data.ai_matching && response.data.ai_matching.ai_matching && Array.isArray(response.data.ai_matching.ai_matching.recommended_candidates)) {
          results = response.data.ai_matching.ai_matching.recommended_candidates;
        } else if (Array.isArray(response.data.candidates)) {
          results = response.data.candidates;
        } else if (Array.isArray(response.data.matches)) {
          results = response.data.matches;
        } else if (response.data && response.data.matching) {
          results = response.data.matching;
        }
  allResults.push(response.data);
        console.log(`Full API response for RRF ID ${rrfId}:`, response.data);
        console.log(`Results for RRF ID ${rrfId}:`, results);
      }
      setAnalyzeResults(allResults);
      console.log('All analysis results:', allResults);
    } catch (err) {
      const status = err.response?.status;
      const errMsg = err.response?.data?.error || err.response?.data?.detail || err.message || '';
      if (status === 429 || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted') || errMsg.toLowerCase().includes('rate limit')) {
        setError('⚠️ Gemini API quota exhausted. Please wait a few minutes and try again, or check your API usage limits.');
      } else {
        setError(errMsg || 'Failed to analyze candidates');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <Loader message="Loading upload page..." />;

  return (
    <section className="upload-section">
    <div className="upload-grid">
      <div className="upload-card">
        <h3>RRF File (Open Positions)</h3>
        <p className="upload-description">
          Upload an Excel file containing open RRF positions with columns: 
          account, rrf_id, pos_title, role, status
        </p>
        <div className="upload-controls">
          <label className="file-input-label">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleRrfUpload}
              disabled={!!uploadingRrf}
              style={{ display: 'none' }}
            />
            <MdCloudUpload size={20} />
            <span>{uploadingRrf ? 'Uploading...' : rrfFile ? rrfFile.name : 'Choose RRF File'}</span>
          </label>
        </div>
        {rrfCount > 0 && (
          <div className="upload-status">
            ✓ {rrfCount} RRF(s) loaded in database
          </div>
        )}
      </div>
      <div className="upload-card">
        <h3>Bench File (Available Employees)</h3>
        <p className="upload-description">
          Upload an Excel file containing bench employees with columns: 
          name, skill, open_positions
        </p>
        <div className="upload-controls">
          <label className="file-input-label">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleBenchUpload}
              disabled={!!uploadingBench}
              style={{ display: 'none' }}
            />
            <MdCloudUpload size={20} />
            <span>{uploadingBench ? 'Uploading...' : benchFile ? benchFile.name : 'Choose Bench File'}</span>
          </label>
        </div>
        {benchCount > 0 && (
          <div className="upload-status">
            ✓ {benchCount} Bench employee(s) loaded in database
          </div>
        )}
        {/* Bench People Table */}
        {benchFile && benchFile.data && Array.isArray(benchFile.data) && benchFile.data.length > 0 && (
          <div className="bench-table-container" style={{ marginTop: '1rem' }}>
            <h4>Bench People Table</h4>
            <table className="bench-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '6px' }}>Name</th>
                  <th style={{ border: '1px solid #ccc', padding: '6px' }}>Skill</th>
                  <th style={{ border: '1px solid #ccc', padding: '6px' }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {benchFile.data.map((person, idx) => (
                  <tr key={idx}>
                    <td style={{ border: '1px solid #eee', padding: '6px' }}>{person.name || '-'}</td>
                    <td style={{ border: '1px solid #eee', padding: '6px' }}>{person.skill || '-'}</td>
                    <td style={{ border: '1px solid #eee', padding: '6px' }}>{person.grade || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    {/* RRF ID Analyze Section: always show if rrfIdList is available */}
    {rrfIdList.length > 0 && (
      <div className="analyze-section">
        <h3>Analyze Candidates by RRF ID</h3>
        <div className="analyze-controls">
          <Select
            options={rrfIdList.map(id => ({ value: id, label: id }))}
            value={selectedRrfIds.map(id => ({ value: id, label: id }))}
            onChange={options => setSelectedRrfIds(options ? options.map(opt => opt.value) : [])}
            isMulti
            isClearable
            isSearchable
            placeholder="Select or search RRF ID(s)..."
            classNamePrefix="react-select"
            styles={{ container: base => ({ ...base, minWidth: 220 }) }}
            isDisabled={analyzing || rrfIdList.length === 0}
          />
          <button
            className="btn-primary styled-analyze-btn"
            onClick={handleAnalyzeRrf}
            disabled={analyzing || selectedRrfIds.length === 0}
          >
            {analyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
        {/* Results Table */}
        {error && <div className="analyze-error">{error}</div>}
        {analyzeResults.length > 0 && (
          <div className="analyze-results-table">
            {analyzeResults.map((result, idx) => (
              <div key={idx} style={{ marginBottom: '2rem', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                {/* Show RRF Details */}
                {result.rrf_details && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4>RRF Details</h4>
                    <div><strong>RRF ID:</strong> {result.rrf_details.rrf_id}</div>
                    <div><strong>Account:</strong> {result.rrf_details.account}</div>
                    <div><strong>Position Title:</strong> {result.rrf_details.pos_title}</div>
                    <div><strong>Role:</strong> {result.rrf_details.role}</div>
                  </div>
                )}
                {/* Show POS-ID and Position Name above candidates table */}
                <div style={{ marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  POS-ID: {result.rrf_details?.rrf_id || (result.results && result.results[0]?.rrf_id) || '-'}
                  {' | '}Position Name: {result.rrf_details?.pos_title || (result.results && result.results[0]?.rrf_details?.pos_title) || '-'}
                </div>
                <h4>Recommended Candidates</h4>
                <table className="analyze-table">
                  <thead>
                    <tr>
                      <th>VAM ID</th>
                      <th>Name</th>
                      <th>Skill</th>
                      <th>Score</th>
                      <th>Reasoning</th>
                      <th>Potential Gaps</th>
                      <th>Designation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      result.matching_result?.ai_matching?.recommended_candidates
                      || (Array.isArray(result.results) && result.results[0]?.matching_result?.ai_matching?.recommended_candidates)
                      || []
                    ).map((candidate, cidx) => (
                      <tr key={cidx}>
                        <td>{candidate.vamid || '-'}</td>
                        <td>{candidate.employee_details?.name || '-'}</td>
                        <td>{candidate.skill_alignment || candidate.employee_details?.primary_skill || candidate.employee_details?.current_skill || '-'}</td>
                        <td>{candidate.match_score || '-'}</td>
                        <td>{candidate.reasoning || '-'}</td>
                        <td>{Array.isArray(candidate.potential_gaps) ? candidate.potential_gaps.join(', ') : '-'}</td>
                        <td>{candidate.employee_details?.designation || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
    {/* Matching Section in Upload */}
    {rrfCount > 0 && benchCount > 0 && (
      <div className="matching-in-upload">
        {/* RRF ID Analyze Section */}
        <div className="analyze-section" style={{ marginBottom: 32 }}>
          <h3>Analyze Candidates by RRF ID</h3>
          <div className="analyze-controls" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Multi-select dropdown and analyze button are already implemented above. Remove legacy single-select code. */}
          </div>
          {/* Results Table */}
          {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
          {/* Removed legacy candidate table. Only the correct results table above is rendered. */}
        </div>
        <h3>Candidate Matching</h3>
        <div className="matching-info-inline">
          <p>Ready to match: <strong>{rrfCount} RRFs</strong> with <strong>{benchCount} Bench employees</strong></p>
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
            disabled={matching || rrfCount === 0 || benchCount === 0}
          >
            {matching ? 'Matching Candidates...' : 'Get Top 5 Candidates per RRF'}
          </button>
        </div>
        {matches.length > 0 && (
          <div className="matches-container">
            <div className="matches-header">
              <h3>Matching Results</h3>
              <button
                className="btn-download"
                onClick={handleDownloadExcel}
                title="Download results as Excel file"
              >
                📥 Download Excel
              </button>
            </div>
            {matches.map((match, index) => (
              <div key={index} className="match-card">
                <div className="match-header">
                  <h4>
                    {match.rrf?.pos_title || 'Position'}
                    {match.rrf?.rrf_id && ` (RRF ID: ${match.rrf.rrf_id})`}
                  </h4>
                  <div className="match-meta">
                    {match.rrf?.account && <span className="badge">{match.rrf.account}</span>}
                    {match.rrf?.role && <span className="badge">{match.rrf.role}</span>}
                  </div>
                </div>
                <div className="candidates-list">
                  {match.candidates && match.candidates.length > 0 ? (
                    match.candidates.map((candidate, idx) => (
                      <div key={idx} className="candidate-item">
                        <div className="candidate-header">
                          <span className="candidate-name">{candidate.name}</span>
                          <span className="candidate-score">Score: {candidate.score || 'N/A'}</span>
                        </div>
                        {candidate.skill && (
                          <div className="candidate-skill">Skills: {candidate.skill}</div>
                        )}
                        {candidate.reasoning && (
                          <div className="candidate-reasoning">{candidate.reasoning}</div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="no-candidates">No matching candidates found</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </section>
  );
};

export default Upload;
