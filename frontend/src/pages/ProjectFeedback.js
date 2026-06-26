import * as XLSX from 'xlsx';
import './ProjectFeedback.css';
import React, { useState, useRef } from 'react';
import { saveAs } from 'file-saver';

const ProjectFeedback = () => {
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [fileName, setFileName] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCards, setSelectedCards] = useState([]);

  // eslint-disable-next-line no-unused-vars
  const GRID_COLUMNS = [
    "Associate Name",
    "Please specify the skill category"
  ];

  const MODAL_COLUMNS = [
    "Manager Name",
    "Associate Name",
    "Reason for Release",
    "Please specify the skill category",
    "Project End Date",
    "Comment on the technical knowledge",
    "Quality of Work - Project Specific (Consider the associate's ability to meet deadlines, quality standards, and project goals.)",
    "Comment on the Communication Skills",
    "Strengths",
    "Area of improvement"
  ];

  const COLUMN_SHORT_NAMES = {
    "Manager Name": "Manager",
    "Associate Name": "Associate",
    "Reason for Release": "Release Reason",
    "Please specify the skill category": "Skill Category",
    "Project End Date": "Project End Date",
    "End Date": "End Date",
    "Comment on the technical knowledge": "Tech Knowledge",
    "Quality of Work - Project Specific (Consider the associate's ability to meet deadlines, quality standards, and project goals.)": "Quality of Work",
    "Comment on the Communication Skills": "Communication",
    "StrengthsAdaptability (Measure how quickly associates can learn and adapt to new technologies or processes introduced in the project)": "Adaptability",
    "Strengths": "Strengths",
    "Area of improvement": "Area of Improvement"
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      // Store all columns from the Excel file
      setColumns(data[0] || []);
      // Store all data rows
      setTableData(data.slice(1));
    };
    reader.readAsBinaryString(file);
  };

  const handleCardSelect = (idx) => {
    setSelectedCards(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  const handleCardClick = (e, idx) => {
    // Don't open modal if clicking on checkbox
    if (e.target.type === 'checkbox') return;
    setSelectedIdx(idx);
  };

  const handleDownloadSelected = () => {
    if (selectedCards.length === 0) return;
    // Format date columns before writing to Excel
    const dateCols = ["Project End Date", "End Date"];
    const dateColIndexes = dateCols.map(col => columns.findIndex(c => c === col)).filter(idx => idx !== -1);
    const selectedRows = selectedCards.map(idx => {
      const row = [...tableData[idx]];
      dateColIndexes.forEach(colIdx => {
        if (row[colIdx]) {
          row[colIdx] = excelDateToJSDate(row[colIdx]);
        }
      });
      return row;
    });
    const ws = XLSX.utils.aoa_to_sheet([columns, ...selectedRows]);
    // Make header row bold
    const headerRange = XLSX.utils.decode_range(ws['!ref']);
    for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!ws[cellAddress]) continue;
      ws[cellAddress].s = { font: { bold: true } };
    }
    // Set column widths for better visibility
    ws['!cols'] = columns.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Selected Feedback');
    ws['!protect'] = { sheet: true, objects: true, scenarios: true, formatColumns: false, formatRows: false };
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'selected_feedback.xlsx');
  };

  const fileInputRef = useRef();
  return (
    <section className="project-feedback-section">
      <div className="project-feedback-file-input-wrapper">
        <span className="project-feedback-title-top">Project Feedback Upload</span>
        <input
          ref={fileInputRef}
          id="customFileInput"
          className="project-feedback-file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <label htmlFor="customFileInput" className="custom-file-label">
          <span role="img" aria-label="upload" style={{marginRight: '8px'}}>📁</span>
          {fileName ? 'Change File' : 'Choose File'}
        </label>
      </div>
      {/* Download button at the top */}
      {columns.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn-primary" onClick={handleDownloadSelected} disabled={selectedCards.length === 0}>
            Download Selected
          </button>
        </div>
      )}
      <div className="project-feedback-header" />
  {/* File name is already shown under the button, so no need to show again */}
      {columns.length > 0 && (
        <div className="feedback-grid-container">
          <input
            type="text"
            className="feedback-search-input"
            placeholder="Search by name or skill..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{marginBottom: '1.2rem', padding: '0.5rem 1rem', fontSize: '1rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', maxWidth: '400px'}}
          />
          {tableData.length === 0 ? (
            <div className="no-data">No data found.</div>
          ) : (
            <div className="feedback-grid">
              {tableData
                .map((row, i) => ({ row, i }))
                .filter(({ row }) => {
                  const nameIdx = columns.findIndex(c => c === "Associate Name");
                  const skillIdx = columns.findIndex(c => c === "Please specify the skill category");
                  const name = (nameIdx !== -1 ? row[nameIdx] : '')?.toString().toLowerCase() || "";
                  const skill = (skillIdx !== -1 ? row[skillIdx] : '')?.toString().toLowerCase() || "";
                  const term = searchTerm.toLowerCase();
                  return name.includes(term) || skill.includes(term);
                })
                .map(({ row, i }) => {
                  const nameIdx = columns.findIndex(c => c === "Associate Name");
                  const skillIdx = columns.findIndex(c => c === "Please specify the skill category");
                  
                  return (
                    <div className="feedback-card" key={i} onClick={(e) => handleCardClick(e, i)}>
                      <input
                        type="checkbox"
                        checked={selectedCards.includes(i)}
                        onChange={() => handleCardSelect(i)}
                        style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}
                      />
                      <div className="feedback-card-label"><strong>Name:</strong></div>
                      <div className="feedback-card-title">{nameIdx !== -1 ? row[nameIdx] : '-'}</div>
                      <div className="feedback-card-label"><strong>Skill:</strong></div>
                      <div className="feedback-card-skill">{skillIdx !== -1 ? row[skillIdx] : '-'}</div>
                    </div>
                  );
                })}
            </div>
          )}
          {selectedIdx !== null && (
            <div className="feedback-modal-overlay" onClick={() => setSelectedIdx(null)}>
              <div className="feedback-modal" onClick={e => e.stopPropagation()}>
                <h3>Feedback Details</h3>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {
                    MODAL_COLUMNS.map((col) => {
                      const colIdx = columns.findIndex(c => c === col);
                      let value = colIdx !== -1 ? tableData[selectedIdx][colIdx] : '';
                      // Format date columns if needed
                      if ((col === "Project End Date" || col === "End Date") && value) {
                        value = excelDateToJSDate(value);
                      }
                      // Handle null/empty improvements and other fields
                      if (!value || value === null || value === "") {
                        value = 'N/A';
                      }
                      return (
                        <div key={col} style={{ marginBottom: '8px' }}>
                          <strong>{COLUMN_SHORT_NAMES[col] || col}:</strong> {value}
                        </div>
                      );
                    })
                  }
                </div>
                <button className="modal-close-btn" onClick={() => setSelectedIdx(null)}>Close</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default ProjectFeedback;

function excelDateToJSDate(serial) {
  if (!serial || isNaN(serial)) return '';
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().split('T')[0];
}
