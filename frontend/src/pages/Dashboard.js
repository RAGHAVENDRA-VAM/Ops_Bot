import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE from '../config';
import './Dashboard.css';

const SkeletonRow = ({ cols }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i}><div className="skeleton-cell" /></td>
    ))}
  </tr>
);

const Dashboard = () => {
  const [benchCount, setBenchCount] = useState(0);
  const [rrfCount, setRrfCount] = useState(0);
  const [showRrfTable, setShowRrfTable] = useState(false);
  const [showBenchTable, setShowBenchTable] = useState(false);
  const [rrfRows, setRrfRows] = useState([]);
  const [benchRows, setBenchRows] = useState([]);
  const [loadingRrf, setLoadingRrf] = useState(false);
  const [loadingBench, setLoadingBench] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_BASE}/dashboard`)
      .then(res => {
        const val = res.data && res.data.value ? res.data.value : {};
        setBenchCount(val.bench_count || 0);
        setRrfCount(val.rrf_count || 0);
        setInitialLoading(false);
      })
      .catch(() => {
        setBenchCount(0);
        setRrfCount(0);
        setInitialLoading(false);
      });
    // listen for refresh events from other components
    const onRefresh = () => {
      axios.get(`${API_BASE}/dashboard`)
        .then(res => {
          const val = res.data && res.data.value ? res.data.value : {};
          setBenchCount(val.bench_count || 0);
          setRrfCount(val.rrf_count || 0);
        }).catch(() => {});
    };
    window.addEventListener('refreshDashboard', onRefresh);
    return () => window.removeEventListener('refreshDashboard', onRefresh);
  }, []);

  // Fetch RRF table
  const handleShowRrfTable = () => {
    setShowRrfTable(true);
    setShowBenchTable(false);
    setLoadingRrf(true);
    axios.get(`${API_BASE}/rrf`)
      .then(res => {
        let arr = [];
        if (Array.isArray(res.data)) arr = res.data;
        else if (res.data && Array.isArray(res.data.rrf)) arr = res.data.rrf;
        setRrfRows(arr);
      })
      .catch(() => setRrfRows([]))
      .finally(() => setLoadingRrf(false));
  };

  const handleShowBenchTable = () => {
    setShowBenchTable(true);
    setShowRrfTable(false);
    setLoadingBench(true);
    axios.get(`${API_BASE}/candidates`)
      .then(res => {
        // Support { available_candidates, other_candidates } shape
        let arr = [];
        if (res.data) {
          if (Array.isArray(res.data.available_candidates)) {
            arr = res.data.available_candidates.concat(res.data.other_candidates || []);
          } else if (Array.isArray(res.data)) arr = res.data;
          else if (Array.isArray(res.data.candidates)) arr = res.data.candidates;
        }
        setBenchRows(arr.map(c => ({
          vamid: c.vamid,
          name: c.name,
          skill: c.primary_skill || c.current_skill || '-',
          grade: c.grade
        })));
      })
      .catch(() => setBenchRows([]))
      .finally(() => setLoadingBench(false));
  };

  if (initialLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #1d4ed8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
        <div style={{ color: '#64748b', marginTop: '16px', fontSize: '0.9rem', fontWeight: 500 }}>Loading Dashboard...</div>
        <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  return (
    <section className="dashboard-section">
      <div className="dashboard-cards">
        <div className="card" onClick={handleShowRrfTable}>
          <div className="card-icon">📋</div>
          <div className="card-content">
            <h3>Open RRFs</h3>
            <p className="card-value">{rrfCount}</p>
          </div>
        </div>
        <div className="card" onClick={handleShowBenchTable}>
          <div className="card-icon">👥</div>
          <div className="card-content">
            <h3>Bench People</h3>
            <p className="card-value">{benchCount}</p>
          </div>
        </div>
      </div>
      {showRrfTable && (
        <div className="dashboard-table-container">
          <h3>Open RRFs</h3>
          {loadingRrf ? (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>RRF ID</th><th>Account</th><th>Position</th><th>Role</th><th>Status</th><th>Project Name</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
              </tbody>
            </table>
          ) : (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>RRF ID</th>
                  <th>Account</th>
                  <th>Position</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Project Name</th>
                </tr>
              </thead>
              <tbody>
                {rrfRows.length === 0 ? (
                  <tr><td colSpan="6" style={{textAlign:'center',color:'#94a3b8',padding:'24px'}}>No RRFs found.</td></tr>
                ) : (
                  rrfRows.map((row, idx) => (
                    <tr key={row.rrf_id || idx}>
                      <td><span className="badge">{row.rrf_id}</span></td>
                      <td>{row.account}</td>
                      <td>{row.pos_title}</td>
                      <td>{row.role}</td>
                      {
                        (() => {
                          const s = (row.status || '').toString();
                          const normalized = s.toLowerCase();
                          const cls = normalized === 'closed' ? 'badge badge-red' : 'badge badge-green';
                          return <td><span className={cls}>{s}</span></td>;
                        })()
                      }
                      <td>{row.project_name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
      {showBenchTable && (
        <div className="dashboard-table-container">
          <h3>Bench People</h3>
          {loadingBench ? (
            <div className="dashboard-loading">Loading...</div>
          ) : (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>VAM ID</th>
                  <th>Name</th>
                  <th>Skill</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {benchRows.length === 0 ? (
                  <tr><td colSpan="4" style={{textAlign:'center',color:'#94a3b8',padding:'24px'}}>No Bench People found.</td></tr>
                ) : (
                  benchRows.map((row, idx) => (
                    <tr key={row.vamid || idx}>
                      <td><span className="badge">{row.vamid}</span></td>
                      <td style={{fontWeight:600}}>{row.name}</td>
                      <td>{row.skill}</td>
                      <td>{row.grade}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
};

export default Dashboard;
