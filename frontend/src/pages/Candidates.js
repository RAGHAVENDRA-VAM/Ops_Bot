

import React, { useEffect, useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Select from 'react-select';
import axios from 'axios';
import API_BASE from '../config';
import Loader from '../components/Loader';
import './Candidates.css';


const Candidates = ({ statuses, handleCandidateTableChange, handleCandidateSave }) => {
  const [candidatesTableData, setCandidatesTableData] = useState([]);
  const [otherCandidates, setOtherCandidates] = useState([]);
  const [positions, setPositions] = useState([]); // Will hold rrf_id list
  const [accounts, setAccounts] = useState([]); // eslint-disable-line no-unused-vars
  const [rrfMap, setRrfMap] = useState({}); // rrf_id -> rrf object
  const [loading, setLoading] = useState(true);
  // No need for rrfSearch with react-select

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/candidates`),
      axios.get(`${API_BASE}/rrf`)
    ]).then(([candidatesRes, rrfRes]) => {
      // Support new API contract: { available_candidates, other_candidates }
      let available = [];
      let others = [];
      if (candidatesRes.data) {
        if (Array.isArray(candidatesRes.data.available_candidates)) {
          available = candidatesRes.data.available_candidates;
        } else if (Array.isArray(candidatesRes.data)) {
          available = candidatesRes.data;
        } else if (Array.isArray(candidatesRes.data.candidates)) {
          available = candidatesRes.data.candidates;
        }
        if (Array.isArray(candidatesRes.data.other_candidates)) {
          others = candidatesRes.data.other_candidates;
        }
      }
      setCandidatesTableData(available.map(c => ({ vamid: c.vamid, name: c.name, allocation_status: c.allocation_status })));
      setOtherCandidates(others.map(c => ({ vamid: c.vamid, name: c.name, allocation_status: c.allocation_status })));
      
      let rrfList = [];
      if (Array.isArray(rrfRes.data)) {
        rrfList = rrfRes.data;
      } else if (rrfRes.data && Array.isArray(rrfRes.data.rrf)) {
        rrfList = rrfRes.data.rrf;
      }
      setPositions([...new Set(rrfList.map(r => r.rrf_id).filter(Boolean))]);
      setAccounts([...new Set(rrfList.map(r => r.account).filter(Boolean))]);
      const map = {};
      rrfList.forEach(r => { if (r.rrf_id) map[r.rrf_id] = r; });
      setRrfMap(map);
    }).catch(() => {
      setCandidatesTableData([]);
      setPositions([]);
      setAccounts([]);
      setRrfMap({});
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

  // Save handler
  const handleSave = (row) => {
    const statusRaw = (row.status || row.allocation_status || '').toString();
    const statusNorm = statusRaw.toLowerCase().trim().replace(/\s+/g, '-');
    // If user set On-Hold, do not call allocation API; refresh lists/dashboard to reflect counts
    if (statusNorm === 'on-hold') {
      toast.success('Marked On-Hold locally — refreshing lists.');
      // Refresh candidates and dashboard to reflect server state (On-Hold is local and shouldn't affect bench counts)
      (async () => {
        try {
          const [cRes] = await Promise.all([
            axios.get(`${API_BASE}/candidates`),
            axios.get(`${API_BASE}/dashboard`)
          ]);
          let available = [];
          let others = [];
          if (cRes.data) {
            if (Array.isArray(cRes.data.available_candidates)) available = cRes.data.available_candidates;
            else if (Array.isArray(cRes.data)) available = cRes.data;
            else if (Array.isArray(cRes.data.candidates)) available = cRes.data.candidates;
            if (Array.isArray(cRes.data.other_candidates)) others = cRes.data.other_candidates;
          }
          setCandidatesTableData(available.map(c => ({ vamid: c.vamid, name: c.name, allocation_status: c.allocation_status })));
          setOtherCandidates(others.map(c => ({ vamid: c.vamid, name: c.name, allocation_status: c.allocation_status })));
          try { window.dispatchEvent(new Event('refreshDashboard')); } catch (e) { /* noop */ }
        } catch (err) {
          // ignore errors but notify user
          console.error('Error refreshing after On-Hold:', err);
        }
      })();
      if (typeof handleCandidateSave === 'function') handleCandidateSave(row);
      return;
    }
    if (row.position && row.vamid) {
      axios.post(`${API_BASE}/update_position/${row.position}/${row.vamid}`)
        .then(async () => {
          toast.success('Position updated successfully!');
          try {
            const [cRes] = await Promise.all([
              axios.get(`${API_BASE}/candidates`),
              axios.get(`${API_BASE}/dashboard`)
            ]);
            // update candidates lists
            let available = [];
            let others = [];
            if (cRes.data) {
              if (Array.isArray(cRes.data.available_candidates)) available = cRes.data.available_candidates;
              else if (Array.isArray(cRes.data)) available = cRes.data;
              else if (Array.isArray(cRes.data.candidates)) available = cRes.data.candidates;
              if (Array.isArray(cRes.data.other_candidates)) others = cRes.data.other_candidates;
            }
            setCandidatesTableData(available.map(c => ({ vamid: c.vamid, name: c.name, allocation_status: c.allocation_status })));
            setOtherCandidates(others.map(c => ({ vamid: c.vamid, name: c.name, allocation_status: c.allocation_status })));
            // Notify other components (Dashboard, App) to refresh counts/state
            try { window.dispatchEvent(new Event('refreshDashboard')); } catch (e) { /* noop */ }
            try { window.dispatchEvent(new Event('refreshCounts')); } catch (e) { /* noop */ }
          } catch (err) {
            // ignore refresh errors, but still inform user
          }
        })
        .catch(() => {
          toast.error('Failed to update position.');
        });
    } else {
      toast.warn('Please select both RRF ID and candidate VAM ID.');
    }
    if (typeof handleCandidateSave === 'function') {
      handleCandidateSave(row);
    }
  };

  if (loading) return <Loader message="Loading candidates..." />;

  return (
    <section className="candidates-section">
      <h2>Candidates Table</h2>
      <div className="candidates-table-container">
        <table className="candidates-table">
          <thead>
            <tr>
              <th>VAM ID</th>
              <th>Candidate Name</th>
              <th>Position</th>
              <th>Status</th>
              <th>Account</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr><td colSpan="6">No candidates found.</td></tr>
            ) : (
              tableRows.map((row, idx) => (
                <tr key={row.vamid || row.name || row.id || idx}>
                  <td>{row.vamid}</td>
                  <td>{row.name}</td>
                  <td>
                    <Select
                      options={positions.map(rrfId => ({ value: rrfId, label: rrfId }))}
                      value={row.position ? { value: row.position, label: row.position } : null}
                      onChange={option => handleTableChange(idx, 'position', option ? option.value : '')}
                      placeholder="Select or search RRF ID"
                      isClearable
                      styles={{ container: base => ({ ...base, minWidth: 180 }) }}
                    />
                  </td>
                  <td>
                    {
                      (() => {
                        const s = (row.status || '').toString();
                        const norm = s.toLowerCase();
                        if (norm === 'available') {
                          return <span style={{fontWeight:600,color:'#0f5132'}}>Available</span>;
                        }
                        // show dropdown of non-available statuses
                        const opts = statuses.filter(st => st.toLowerCase() !== 'available');
                        return (
                          <select value={row.status || ''} onChange={e => handleTableChange(idx, 'status', e.target.value)}>
                            <option value="">Select Status</option>
                            {opts.map((status, i) => <option key={i} value={status}>{status}</option>)}
                          </select>
                        );
                      })()
                    }
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.account || ''}
                      readOnly={!!row.position}
                      placeholder="Account will auto-fill"
                      style={{ background: row.position ? '#f7f9fa' : undefined }}
                    />
                  </td>
                  <td>
                    <button className="btn-primary" onClick={() => handleSave(row)} disabled={((row.status||'').toString().toLowerCase() === 'available')}>Save</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:16}}>
        <details className="other-candidates">
          <summary style={{cursor:'pointer'}}>Other Candidates ({otherCandidates.length})</summary>
          <div style={{padding:'8px 12px'}}>
            {otherCandidates.length === 0 ? (
              <div style={{color:'#94a3b8'}}>No other candidates.</div>
            ) : (
              <table className="candidates-table small">
                <thead>
                  <tr><th>VAM ID</th><th>Name</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {otherCandidates.map((c, i) => (
                    <tr key={c.vamid || i}><td>{c.vamid}</td><td>{c.name}</td><td>{(c.allocation_status||'').toString()}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      </div>
      <ToastContainer position="top-right" autoClose={1200} hideProgressBar={false} newestOnTop closeOnClick pauseOnFocusLoss draggable pauseOnHover />
    </section>
  );
};

export default Candidates;
