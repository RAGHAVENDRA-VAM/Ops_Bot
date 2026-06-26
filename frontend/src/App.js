import React, { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import './App.css';
import logo from './assets/ValueMomentum_logo.png';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  MdDashboard, MdPeople, MdUploadFile,
  MdFeedback, MdChevronLeft, MdChevronRight, MdGroups
} from 'react-icons/md';
import API_BASE from './config';
import Dashboard from './pages/Dashboard';
import Candidates from './pages/Candidates';
import Upload from './pages/Upload';
import Matches from './pages/Matches';
import History from './pages/History';
import Trends from './pages/Trends';
import NotFound from './pages/NotFound';
import ProjectFeedback from './pages/ProjectFeedback';
import Associates from './pages/Associates';

const API_BASE_URL = API_BASE;

function App() {
  // Use React Router's location to determine the current route
  // eslint-disable-next-line no-unused-vars
  const location = typeof window !== 'undefined' && window.location ? { pathname: window.location.pathname } : { pathname: '/' };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rrfCount, setRrfCount] = useState(0);
  const [benchCount, setBenchCount] = useState(0);
  const [rrfFile, setRrfFile] = useState(null);
  const [benchFile, setBenchFile] = useState(null);
  const [uploadingRrf, setUploadingRrf] = useState(false);
  const [uploadingBench, setUploadingBench] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [useEnhancedMatching, setUseEnhancedMatching] = useState(true);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  // Remove activeSection, use routing instead
  // For Candidates Table
  const [candidatesTableData, setCandidatesTableData] = useState([]);
  const [positions, setPositions] = useState([]);
  const [statuses] = useState(['Available', 'Matched', 'On Hold', 'Closed']);
  const [accounts, setAccounts] = useState([]);
  // Fetch bench candidates, positions, and accounts for Candidates table
  // Fetch bench candidates, positions, and accounts for Candidates table
  useEffect(() => {
    // Only fetch when on /candidates route
    if (window.location.pathname === '/candidates') {
      axios.get(`${API_BASE_URL}/candidates`)
        .then(res => {
          setCandidatesTableData(res.data.candidates || []);
        })
        .catch(() => setCandidatesTableData([]));
      axios.get(`${API_BASE_URL}/rrf`)
        .then(res => {
          const rrfRows = res.data.rrf || [];
          setPositions(rrfRows.map(r => r.pos_title).filter(Boolean));
          setAccounts(Array.from(new Set(rrfRows.map(r => r.account).filter(Boolean))));
        })
        .catch(() => {
          setPositions([]);
          setAccounts([]);
        });
    }
  }, []);
  // Handler for dropdown changes in Candidates table
  const handleCandidateTableChange = (idx, field, value) => {
    setCandidatesTableData(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  // Handler for Save button in Candidates table
  const handleCandidateSave = (row) => {
    toast.success(`Saved: ${row.name}, Position: ${row.position}, Status: ${row.status}, Account: ${row.account}`);
    // Refresh global counts after a successful candidate allocation/save
    fetchCounts();
  };

  // Fetch counts on component mount and after uploads
  const fetchCounts = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/dashboard`);
      setRrfCount(response.data.value?.rrf_count || 0);
      setBenchCount(response.data.value?.bench_count || 0);
    } catch (err) {
      console.error('Error fetching counts:', err);
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const handleRrfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setRrfFile(file);
    setUploadingRrf(true);
    setError(null);

    const formData = new FormData();
    formData.append('rrf_file', file);

    try {
      const response = await axios.post(`${API_BASE}/upload-files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data.success) {
        setWarnings([]);
        toast.success(`RRF file uploaded successfully! ${response.data.file_info.rrf_file.filename}`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setError(response.data.message || 'Failed to upload RRF file');
      }
      fetchCounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload RRF file');
      console.error('Error uploading RRF file:', err);
    } finally {
      setUploadingRrf(false);
    }
  };

  const handleBenchUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBenchFile(file);
    setUploadingBench(true);
    setError(null);
    const formData = new FormData();
    formData.append('bench_file', file);
    try {
      const response = await axios.post(`${API_BASE}/upload-files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data.success) {
        setWarnings([]);
        toast.success(`Bench file uploaded successfully! ${response.data.file_info.bench_file.filename}`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setError(response.data.message || 'Failed to upload Bench file');
      }
      fetchCounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload Bench file');
      console.error('Error uploading Bench file:', err);
    } finally {
      setUploadingBench(false);
    }
  };

  const handleMatchCandidates = async () => {
    setMatching(true);
    setError(null);
    setMatches([]);
    try {
      const response = await axios.get(`${API_BASE}/matching`);
      // Support new API response structure
      let matches = [];
      if (response.data && response.data.ai_matching && response.data.ai_matching.gemini_analysis && Array.isArray(response.data.ai_matching.gemini_analysis.matches)) {
        matches = response.data.ai_matching.gemini_analysis.matches.map(m => ({
          ...m,
          rrf_id: m.rrf_id,
          pos_title: m.pos_title,
          account: m.account || (m.employee_details && m.employee_details.account) || '',
          candidates: Array.isArray(m.recommended_candidates) ? m.recommended_candidates.map(rc => ({
            ...rc,
            ...rc.employee_details,
            score: rc.match_score,
            reasoning: rc.reasoning
          })) : []
        }));
      } else if (Array.isArray(response.data.matches)) {
        matches = response.data.matches;
      }
      setMatches(matches);
      // Print only the candidates data for each match
      if (matches.length > 0) {
        matches.forEach((match, idx) => {
          console.log(`Candidates for RRF #${idx + 1}:`, match.candidates);
        });
        // Print candidate analysis for each match
        matches.forEach((match, idx) => {
          console.log(`RRF #${idx + 1}:`, match.rrf);
          if (match.candidates && Array.isArray(match.candidates)) {
            match.candidates.forEach((candidate, cidx) => {
              console.log(`  Candidate #${cidx + 1}:`, candidate);
            });
          } else {
            console.log('  No candidates found for this RRF.');
          }
        });
      }
      if (response.data.batchCount) {
        console.log(`Processed in ${response.data.batchCount} batches`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to match candidates');
      console.error('Error matching candidates:', err);
    } finally {
      setMatching(false);
    }
  };

  const fetchUploadHistory = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/upload-history?limit=20`);
      setUploadHistory(response.data.history);
    } catch (err) {
      console.error('Error fetching upload history:', err);
      setError('Failed to load upload history');
    }
  };

  const fetchTrends = async () => {
    try {
      const summaryResponse = await axios.get(`${API_BASE_URL}/trends/summary?days=30`);
      setTrends(summaryResponse.data);
    } catch (err) {
      console.error('Error fetching trends:', err);
      setError('Failed to load trends');
    }
  };

  // Fetch data when switching to history or trends sections
  // Fetch history and trends when those pages are visited
  useEffect(() => {
    if (window.location.pathname === '/history') {
      fetchUploadHistory();
    }
    if (window.location.pathname === '/trends') {
      fetchTrends();
    }
  }, []);
  
  // Remove hash/activeSection logic


  // Helper to format Excel serial dates to YYYY-MM-DD
  function excelDateToJSDate(serial) {
    if (!serial || isNaN(serial)) return '';
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toISOString().split('T')[0];
  }

  const handleDownloadExcel = async () => {
    if (matches.length === 0) {
      alert('No matching results to download. Please run matching first.');
      return;
    }

    // Format project start/end dates before sending to backend
    const formattedMatches = matches.map(match => {
      const rrf = { ...match.rrf };
      // Format date fields if present
      if (rrf.project_start_date) {
        rrf.project_start_date = excelDateToJSDate(rrf.project_start_date);
      }
      if (rrf.project_end_date) {
        rrf.project_end_date = excelDateToJSDate(rrf.project_end_date);
      }
      // Also check for other possible date fields
      if (rrf.start_date) {
        rrf.start_date = excelDateToJSDate(rrf.start_date);
      }
      if (rrf.end_date) {
        rrf.end_date = excelDateToJSDate(rrf.end_date);
      }
      return {
        ...match,
        rrf,
      };
    });

    try {
      const response = await axios.post(
        `${API_BASE_URL}/download-matches`,
        { matches: formattedMatches },
        {
          responseType: 'blob',
        }
      );

      // Check if response is actually an error (JSON error response)
      // When responseType is 'blob', error responses might still be blobs
      if (response.headers['content-type'] && response.headers['content-type'].includes('application/json')) {
        const text = await response.data.text();
        const errorData = JSON.parse(text);
        throw new Error(errorData.error || 'Failed to download Excel file');
      }

      // Verify it's actually an Excel file
      if (!response.data || response.data.size === 0) {
        throw new Error('Received empty file from server');
      }

      // Create blob and download
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `rrf_matching_results_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      // Clean up after a short delay
      setTimeout(() => {
        link.remove();
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      let errorMessage = 'Failed to download Excel file';
      
      if (err.response) {
        // If it's a blob error response, try to parse it
        if (err.response.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorMessage;
          } catch (parseErr) {
            errorMessage = err.response.statusText || errorMessage;
          }
        } else {
          errorMessage = err.response.data?.error || err.response.statusText || errorMessage;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      console.error('Error downloading Excel:', err);
      alert(`Error: ${errorMessage}`);
    }
  };

  useEffect(() => {
    // Wait for all initial data to load before showing content
    Promise.all([
      axios.get(`${API_BASE_URL}/dashboard`),
      axios.get(`${API_BASE_URL}/candidates`),
      axios.get(`${API_BASE_URL}/rrf`)
    ]).then(() => {
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1f3d', gap: '16px' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.15)', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', fontWeight: 500 }}>Loading...</div>
        <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  const navClass = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`;

  return (
    <Router>
      <div className="app">
        <ToastContainer position="top-right" autoClose={1200} hideProgressBar={false} newestOnTop closeOnClick pauseOnFocusLoss draggable pauseOnHover />
        <div className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
          <div className="sidebar-header">
            {!sidebarCollapsed && (
              <img src={logo} alt="ValueMomentum Logo" style={{ height: '36px' }} />
            )}
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <MdChevronRight size={20} /> : <MdChevronLeft size={20} />}
            </button>
          </div>
          <nav className="sidebar-nav">
            <NavLink to="/dashboard" className={navClass} title="Dashboard">
              <MdDashboard size={20} />{!sidebarCollapsed && 'Dashboard'}
            </NavLink>
            <NavLink to="/candidates" className={navClass} title="Candidates">
              <MdPeople size={20} />{!sidebarCollapsed && 'Candidates'}
            </NavLink>
            <NavLink to="/associates" className={navClass} title="Associates">
              <MdGroups size={20} />{!sidebarCollapsed && 'Associates'}
            </NavLink>
            <NavLink to="/upload" className={navClass} title="Upload Files">
              <MdUploadFile size={20} />{!sidebarCollapsed && 'Upload Files'}
            </NavLink>
            <NavLink to="/project-feedback" className={navClass} title="Project Feedback">
              <MdFeedback size={20} />{!sidebarCollapsed && 'Project Feedback'}
            </NavLink>
          </nav>
        </div>
        <div className="main-content">
          <div className="content">
            {error && <div className="error-banner"><strong>Error:</strong> {error}</div>}
            {warnings.length > 0 && (
              <div className="warning-banner">
                <strong>Warnings:</strong>
                <ul>
                  {warnings.slice(0, 5).map((warning, idx) => <li key={idx}>{warning}</li>)}
                  {warnings.length > 5 && <li>... and {warnings.length - 5} more warnings</li>}
                </ul>
              </div>
            )}
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={
                <>
                  <div className="header">
                    <div>
                      <h1>Operations Dashboard</h1>
                      <p className="subtitle">Automated RRF Allocation System</p>
                    </div>
                  </div>
                  <div style={{padding:'28px 32px'}}><Dashboard rrfCount={rrfCount} benchCount={benchCount} /></div>
                </>
              } />
              <Route path="/candidates" element={
                <>
                  <div className="header"><h1>Candidates</h1></div>
                  <div style={{padding:'28px 32px'}}><Candidates candidatesTableData={candidatesTableData} positions={positions} statuses={statuses} accounts={accounts} handleCandidateTableChange={handleCandidateTableChange} handleCandidateSave={handleCandidateSave} /></div>
                </>
              } />
              <Route path="/associates" element={
                <>
                  <div className="header"><h1>Associates</h1></div>
                  <div className="page-content"><Associates /></div>
                </>
              } />
              <Route path="/upload" element={
                <>
                  <div className="header"><h1>Upload Files</h1></div>
                  <div style={{padding:'28px 32px'}}><Upload rrfFile={rrfFile} benchFile={benchFile} uploadingRrf={uploadingRrf} uploadingBench={uploadingBench} rrfCount={rrfCount} benchCount={benchCount} handleRrfUpload={handleRrfUpload} handleBenchUpload={handleBenchUpload} useEnhancedMatching={useEnhancedMatching} setUseEnhancedMatching={setUseEnhancedMatching} handleMatchCandidates={handleMatchCandidates} matching={matching} matches={matches} handleDownloadExcel={handleDownloadExcel} /></div>
                </>
              } />
              <Route path="/matches" element={
                <>
                  <div className="header"><h1>Candidate Matches</h1></div>
                  <div style={{padding:'28px 32px'}}><Matches rrfCount={rrfCount} benchCount={benchCount} useEnhancedMatching={useEnhancedMatching} setUseEnhancedMatching={setUseEnhancedMatching} handleMatchCandidates={handleMatchCandidates} matching={matching} matches={matches} handleDownloadExcel={handleDownloadExcel} /></div>
                </>
              } />
              <Route path="/history" element={
                <>
                  <div className="header"><h1>Upload History</h1></div>
                  <div style={{padding:'28px 32px'}}><History historyData={uploadHistory} /></div>
                </>
              } />
              <Route path="/trends" element={
                <>
                  <div className="header"><h1>Trends & Analytics</h1></div>
                  <div style={{padding:'28px 32px'}}><Trends trendsData={trends ? [
                    { label: 'Current RRFs', value: trends.current?.rrfCount },
                    { label: 'Current Bench', value: trends.current?.benchCount },
                    { label: 'Unique RRFs Matched (30d)', value: trends.matching?.unique_rrfs_matched },
                    { label: 'Total Matches (30d)', value: trends.matching?.total_matches },
                    { label: 'Avg Match Score (30d)', value: trends.matching?.avg_match_score ? Math.round(trends.matching.avg_match_score * 100) / 100 : 'N/A' }
                  ] : []} /></div>
                </>
              } />
              <Route path="/project-feedback" element={
                <>
                  <div className="header"><h1>Project Feedback</h1></div>
                  <div style={{padding:'28px 32px'}}><ProjectFeedback /></div>
                </>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
