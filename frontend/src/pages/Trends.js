import React, { useState, useEffect } from 'react';
import Loader from '../components/Loader';

const Trends = ({ trendsData }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (trendsData) setLoading(false);
  }, [trendsData]);

  if (loading) return <Loader message="Loading trends..." />;

  return (
  <section className="trends-section">
    <div className="trends-content">
      {trendsData.length === 0 ? (
        <p>No trends data available.</p>
      ) : (
        <ul className="trends-list">
          {trendsData.map((trend, idx) => (
            <li key={idx}>
              <strong>{trend.label}:</strong> {trend.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
  );
};

export default Trends;
