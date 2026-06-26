import React from 'react';

const Loader = ({ message = 'Loading...' }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    width: '100%',
    gap: '16px'
  }}>
    <div style={{
      width: '36px',
      height: '36px',
      border: '3px solid #e2e8f0',
      borderTop: '3px solid #1d4ed8',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      flexShrink: 0
    }} />
    <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 500 }}>{message}</span>
    <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
  </div>
);

export default Loader;
