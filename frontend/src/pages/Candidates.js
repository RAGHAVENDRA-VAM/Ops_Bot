

import React, { useEffect, useMemo, useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Select from 'react-select';
import axios from 'axios';
import API_BASE from '../config';
import Loader from '../components/Loader';
import './Candidates.css';


const PAGE_SIZE = 8;

const Candidates = ({ statuses, handleCandidateTableChange, handleCandidateSave }) => {
  const [candidatesTableData, setCandidatesTableData] = useState([]);
  const [otherCandidates, setOtherCandidates] = useState([]);
  const [positions, setPositions] = useState([]); // Will hold rrf_id list
  const [accounts, setAccounts] = useState([]); // eslint-disable-line no-unused-vars
  const [rrfMap, setRrfMap] = useState({}); // rrf_id -> rrf object
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [page, setPage] = useState(1);
  // No need for rrfSearch with react-select

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/candidates`),
      axios.get(`${API_BASE}/rrf`)
    ]).then(([candidatesRes, rrfRes]) => {
      const data = candidatesRes.data || {};
      const bench = Array.isArray(data.bench_candidates) ? data.bench_candidates : [];
      const allocated = Array.isArray(data.allocated_resources) ? data.allocated_resources : [];

      setCandidatesTableData(bench.map(c => ({
        vamid: c.vamid,
        name: c.name,
        grade: c.grade,
        tsc: c.tsc,
        workspace: c.workspace,
        current_skill: c.current_skill,
        secondary_skill: c.secondary_skill,
        third_skill: c.third_skill,
        vam_exp: c.vam_exp,
        total_exp: c.total_exp,
        account_summary: c.account_summary,
        bench_days_assigned: c.bench_days_assigned,
        allocation_status: 'BB'
      })));
      setOtherCandidates(allocated.map(c => ({
        vamid: c.vamid,
        name: c.name,
        grade: c.grade,
        tsc: c.tsc,
        workspace: c.workspace,
        current_skill: c.current_skill,
        account_summary: c.account_summary,
        allocation_status: 'Allocated'
      })));

      let rrfList = [];
      if (Array.isArray(rrfRes.data)) rrfList = rrfRes.data;
      else if (rrfRes.data && Array.isArray(rrfRes.data.rrf)) rrfList = rrfRes.data.rrf;
      setPositions([...new Set(rrfList.map(r => r.rrf_id).filter(Boolean))]);
      setAccounts([...new Set(rrfList.map(r => r.account).filter(Boolean))]);
      const map = {};
      rrfList.forEach(r => { if (r.rrf_id) map[r.rrf_id] = r; });
      setRrfMap(map);
    }).catch(() => {
      setCandidatesTableData([]);
      setOtherCandidates([]);
      setPositions([]);
      setAccounts([]);
      setRrfMap({});
      setError('Unable to load candidates right now. Please try again.');
    }).finally(() => setLoading(false));
  }, []);

  // Local state for table edits
  const [tableRows, setTableRows] = useState([]);

  // Sync fetched candidatesTableData to local tableRows
  useEffect(() => {
    setTableRows(candidatesTableData.map(row => ({
      ...row,
      status: row.allocation_status || row.status || 'Available'
    })));
  }, [candidatesTableData]);

  useEffect(() => {
    setPage(1);
  }, [query, gradeFilter, accountFilter]);

  // Handler for table changes
  const handleTableChange = (idx, field, value) => {
    setTableRows(prev => {
      const updated = [...prev];
      let row = { ...updated[idx] };
      if (field === 'position') {
        row.position = value;
        // Auto-set account if rrfMap has it
        if (value && rrfMap[value]) {
          row.account = rrfMap[value].account || '';
        }
      } else if (field === 'account') {
        row.account = value;
      } else if (field === 'status') {
        row.status = value;
      }
      updated[idx] = row;
      return updated;
    });
  };

  const refreshCandidates = async () => {
    try {
      const cRes = await axios.get(`${API_BASE}/candidates`);
      const data = cRes.data || {};
      const bench = Array.isArray(data.bench_candidates) ? data.bench_candidates : [];
      const allocated = Array.isArray(data.allocated_resources) ? data.allocated_resources : [];
      setCandidatesTableData(bench.map(c => ({
        vamid: c.vamid, name: c.name, grade: c.grade, tsc: c.tsc,
        workspace: c.workspace, current_skill: c.current_skill,
        secondary_skill: c.secondary_skill, third_skill: c.third_skill,
        vam_exp: c.vam_exp, total_exp: c.total_exp,
        account_summary: c.account_summary, bench_days_assigned: c.bench_days_assigned,
        allocation_status: 'BB'
      })));
      setOtherCandidates(allocated.map(c => ({
        vamid: c.vamid, name: c.name, grade: c.grade, tsc: c.tsc,
        workspace: c.workspace, current_skill: c.current_skill,
        account_summary: c.account_summary, allocation_status: 'Allocated'
      })));
      try { window.dispatchEvent(new Event('refreshDashboard')); } catch (e) { }
      try { window.dispatchEvent(new Event('refreshCounts')); } catch (e) { }
    } catch (err) {
      console.error('Error refreshing candidates:', err);
    }
  };

  // Save handler
  const handleSave = (row) => {
    if (row.position && row.vamid) {
      axios.post(`${API_BASE}/update_position/${row.position}/${row.vamid}`)
        .then(async () => {
          toast.success('Position updated successfully!');
          await refreshCandidates();
        })
        .catch(() => {
          toast.error('Failed to update position.');
        });
    } else {
      toast.warn('Please select an RRF ID before saving.');
    }
    if (typeof handleCandidateSave === 'function') handleCandidateSave(row);
  };

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tableRows.filter(row => {
      const accountText = (row.account_summary || row.account || '').toString();
      const skillText = [row.current_skill, row.secondary_skill, row.third_skill].filter(Boolean).join(' ');
      const matchesSearch = !term || [row.vamid, row.name, row.grade, row.tsc, row.workspace, accountText, skillText]
        .some(value => (value || '').toString().toLowerCase().includes(term));
      const matchesGrade = !gradeFilter || row.grade === gradeFilter;
      const matchesAccount = !accountFilter || accountText.includes(accountFilter);
      return matchesSearch && matchesGrade && matchesAccount;
    });
  }, [accountFilter, gradeFilter, query, tableRows]);

  const grades = [...new Set(tableRows.map(row => row.grade).filter(Boolean))].sort();
  const accountHints = [...new Set(tableRows.map(row => row.account_summary).filter(Boolean))].sort();
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) return <Loader message="Loading candidates..." />;

  return (
    <section className="candidates-section">
      <div className="table-toolbar">
        <div>
          <h2>Candidates Table</h2>
          <p className="table-toolbar-subtitle">Search, filter, and assign candidates to open RRFs.</p>
        </div>
        <div className="table-toolbar-metrics">
          <span className="mini-metric"><strong>{filteredRows.length}</strong> shown</span>
          <span className="mini-metric"><strong>{otherCandidates.length}</strong> allocated</span>
        </div>
      </div>
      <div className="table-filters">
        <input
          className="table-search-input"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by VAM ID, name, skill, workspace, grade, or account"
        />
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}>
          <option value="">All grades</option>
          {grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
        </select>
        <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="">All accounts</option>
          {accountHints.map(account => <option key={account} value={account}>{account}</option>)}
        </select>
        <button className="btn-secondary" onClick={() => { setQuery(''); setGradeFilter(''); setAccountFilter(''); }}>Clear</button>
      </div>
      {error && <div className="empty-state-panel error"><strong>Couldn't load candidates.</strong><span>{error}</span></div>}

      <div className="candidates-table-container">
        <table className="candidates-table">
          <thead>
            <tr>
              <th>VAM ID</th>
              <th>Candidate Name</th>
              <th>Grade</th>
              <th>TSC</th>
              <th>Workspace</th>
              <th>Primary Skill</th>
              <th>Secondary Skill</th>
              <th>VAM Exp (yrs)</th>
              <th>Total Exp (yrs)</th>
              <th>Bench Days</th>
              <th>Account History</th>
              <th>Position</th>
              <th>Account</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan="14"><div className="table-empty-row"><strong>No candidates match the current filters.</strong><span>Try clearing the search or narrowing only one filter at a time.</span></div></td></tr>
            ) : (
              visibleRows.map((row, idx) => (
                <tr key={row.vamid || row.name || row.id || idx}>
                  <td>{row.vamid}</td>
                  <td>{row.name}</td>
                  <td><span className="grade-pill">{row.grade || '-'}</span></td>
                  <td>{row.tsc || '-'}</td>
                  <td>{row.workspace || '-'}</td>
                  <td>{row.current_skill || '-'}</td>
                  <td>
                    {[row.secondary_skill, row.third_skill].filter(Boolean).join(', ') || '-'}
                  </td>
                  <td>{row.vam_exp != null ? Number(row.vam_exp).toFixed(1) : '-'}</td>
                  <td>{row.total_exp != null ? Number(row.total_exp).toFixed(1) : '-'}</td>
                  <td>
                    <span className={`bench-days ${row.bench_days_assigned > 180 ? 'high' : row.bench_days_assigned > 90 ? 'medium' : 'low'}`}>
                      {row.bench_days_assigned ?? '-'}
                    </span>
                  </td>
                  <td className="account-history">{row.account_summary || '-'}</td>
                  <td>
                    <Select
                      options={positions.map(rrfId => ({ value: rrfId, label: rrfId }))}
                      value={row.position ? { value: row.position, label: row.position } : null}
                      onChange={option => handleTableChange(tableRows.indexOf(row), 'position', option ? option.value : '')}
                      placeholder="Select RRF ID"
                      isClearable
                      styles={{ container: base => ({ ...base, minWidth: 160 }) }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.account || ''}
                      readOnly={!!row.position}
                      placeholder="Auto-fill"
                      style={{ background: row.position ? '#f7f9fa' : undefined, minWidth: 120 }}
                    />
                  </td>
                  <td>
                    <button className="btn-primary" onClick={() => handleSave(row)} disabled={!row.position}>Save</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</button>
        <span>Page {currentPage} of {pageCount}</span>
        <button className="btn-secondary" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount}>Next</button>
      </div>
      <div style={{marginTop:24}}>
        <details className="other-candidates">
          <summary style={{cursor:'pointer', fontWeight:600}}>
            Allocated Resources ({otherCandidates.length})
          </summary>
          <div style={{padding:'8px 0'}}>
            {otherCandidates.length === 0 ? (
              <div style={{color:'#94a3b8', padding:'8px 12px'}}>No allocated resources.</div>
            ) : (
              <div className="candidates-table-container">
                <table className="candidates-table small">
                  <thead>
                    <tr>
                      <th>VAM ID</th>
                      <th>Name</th>
                      <th>Grade</th>
                      <th>TSC</th>
                      <th>Workspace</th>
                      <th>Skill</th>
                      <th>Account History</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherCandidates.map((c, i) => (
                      <tr key={c.vamid || i}>
                        <td>{c.vamid}</td>
                        <td>{c.name}</td>
                        <td><span className="grade-pill">{c.grade || '-'}</span></td>
                        <td>{c.tsc || '-'}</td>
                        <td>{c.workspace || '-'}</td>
                        <td>{c.current_skill || '-'}</td>
                        <td className="account-history">{c.account_summary || '-'}</td>
                        <td><span style={{color:'#16a34a', fontWeight:600}}>Allocated</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      </div>
      <ToastContainer position="top-right" autoClose={1200} hideProgressBar={false} newestOnTop closeOnClick pauseOnFocusLoss draggable pauseOnHover />
    </section>
  );
};

export default Candidates;
