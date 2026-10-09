import React from 'react';
import ReactDOM from 'react-dom/client';
// Fuentes del rediseño, empaquetadas con la app (sin red): titulares, interfaz y cifras/teclas.
import '@fontsource/anton/400.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/400-italic.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/600.css';
import App from './App';
import './styles.css';
import './styles/shell.css';
import './styles/library.css';
import './styles/settings.css';
import './styles/editor.css';
import './styles/auth.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
