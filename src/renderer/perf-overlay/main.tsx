import React from 'react';
import ReactDOM from 'react-dom/client';
import PerfOverlay from './PerfOverlay';
import '../styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PerfOverlay />
  </React.StrictMode>,
);
