import React, { useState, useEffect } from 'react';
import Loader from '../components/Loader';

const History = ({ historyData }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (historyData) setLoading(false);
  }, [historyData]);

  if (loading) return <Loader message="Loading history..." />;

  return (
  <section className="history-section">
    <div className="history-table-container">
      <table className="history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {historyData.length === 0 ? (
            <tr><td colSpan="3">No history found.</td></tr>
          ) : (
            historyData.map((row, idx) => (
              <tr key={idx}>
                <td>{row.date}</td>
                <td>{row.action}</td>
                <td>{row.details}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
  );
};

export default History;
