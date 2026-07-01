import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { MdCloudUpload, MdFilterList, MdGroups, MdSearch } from 'react-icons/md';
import API_BASE from '../config';
import Loader from '../components/Loader';
import './Associates.css';

const emptySummary = {
  total_associates: 0,
  total_accounts: 0,
  total_skills: 0
};

const PAGE_SIZE = 10;

const Associates = () => {
  const fileInputRef = useRef(null);
  const [associates, setAssociates] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');

  const fetchAssociates = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/associates`);
      setAssociates(response.data.associates || []);
      setSummary(response.data.summary || emptySummary);
      setError('');
    } catch (error) {
      setAssociates([]);
      setSummary(emptySummary);
      setError('Unable to load associates right now. Please try again.');
      toast.error('Unable to load associates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssociates();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, accountFilter, skillFilter]);

  const accounts = useMemo(
    () => [...new Set(associates.map(item => item.account).filter(Boolean))].sort(),
    [associates]
  );

  const skills = useMemo(
    () => [...new Set(associates.map(item => item.skill || item.primary_skill).filter(Boolean))].sort(),
    [associates]
  );

  const filteredAssociates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return associates.filter(item => {
      const skill = item.skill || item.primary_skill || '';
      const matchesSearch = !term || [
        item.name,
        item.vamid,
        item.email,
        item.account,
        skill,
        item.designation
      ].some(value => (value || '').toString().toLowerCase().includes(term));

      const matchesAccount = !accountFilter || item.account === accountFilter;
      const matchesSkill = !skillFilter || skill === skillFilter;
      return matchesSearch && matchesAccount && matchesSkill;
    });
  }, [accountFilter, associates, query, skillFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredAssociates.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleAssociates = filteredAssociates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleUpload = async event => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('associates_file', file);
    setUploading(true);

    try {
      const response = await axios.post(`${API_BASE}/associates/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(
        `Added ${response.data.inserted || 0} new associates. Updated ${response.data.updated || 0}. Skipped ${response.data.skipped || 0}.`
      );
      await fetchAssociates();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload associates');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  if (loading) return <Loader message="Loading associates..." />;

  return (
    <section className="associates-section">
      <div className="table-toolbar">
        <div>
          <h2>Associates Directory</h2>
          <p className="table-toolbar-subtitle">Search, filter, and maintain associates across accounts and skills.</p>
        </div>
        <div className="table-toolbar-metrics">
          <span className="mini-metric"><strong>{filteredAssociates.length}</strong> shown</span>
          <span className="mini-metric"><strong>{summary.total_associates}</strong> total</span>
        </div>
      </div>
      <div className="page-toolbar compact-toolbar">
        <button
          className="compact-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <MdCloudUpload size={18} />
          {uploading ? 'Uploading' : 'Upload Excel'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
      </div>

      <div className="associate-metrics">
        <div className="metric-box">
          <span className="metric-icon"><MdGroups size={20} /></span>
          <div>
            <p>Total Associates</p>
            <strong>{summary.total_associates}</strong>
          </div>
        </div>
        <div className="metric-box">
          <span className="metric-icon account">AC</span>
          <div>
            <p>Total Accounts</p>
            <strong>{summary.total_accounts}</strong>
          </div>
        </div>
        <div className="metric-box">
          <span className="metric-icon skill">SK</span>
          <div>
            <p>Total Skills</p>
            <strong>{summary.total_skills}</strong>
          </div>
        </div>
      </div>

      <div className="directory-panel">
        <div className="directory-filters">
          <div className="search-control">
            <MdSearch size={18} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search associates, VAM ID, account, skill"
            />
          </div>
          <div className="filter-control">
            <MdFilterList size={18} />
            <select value={accountFilter} onChange={event => setAccountFilter(event.target.value)}>
              <option value="">All accounts</option>
              {accounts.map(account => <option key={account} value={account}>{account}</option>)}
            </select>
          </div>
          <div className="filter-control">
            <select value={skillFilter} onChange={event => setSkillFilter(event.target.value)}>
              <option value="">All skills</option>
              {skills.map(skill => <option key={skill} value={skill}>{skill}</option>)}
            </select>
          </div>
          <button className="btn-secondary" onClick={() => { setQuery(''); setAccountFilter(''); setSkillFilter(''); }}>Clear</button>
        </div>

        {error && <div className="empty-state-panel error"><strong>Couldn't load associates.</strong><span>{error}</span></div>}

        <div className="directory-table-wrap">
          <table className="directory-table">
            <thead>
              <tr>
                <th>Associate</th>
                <th>VAM ID</th>
                <th>Account</th>
                <th>Skill</th>
                <th>Grade</th>
                <th>Designation</th>
                <th>Manager</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssociates.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">No associates match the current filters.</td>
                </tr>
              ) : (
                visibleAssociates.map((associate, index) => (
                  <tr key={associate.vamid || associate.email || index}>
                    <td>
                      <div className="associate-name">{associate.name || '-'}</div>
                      <div className="associate-email">{associate.email || '-'}</div>
                    </td>
                    <td><span className="id-pill">{associate.vamid || '-'}</span></td>
                    <td>{associate.account || '-'}</td>
                    <td>{associate.skill || associate.primary_skill || '-'}</td>
                    <td>{associate.grade || '-'}</td>
                    <td>{associate.designation || '-'}</td>
                    <td>{associate.manager || '-'}</td>
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
      </div>
    </section>
  );
};

export default Associates;
