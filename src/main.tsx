import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import StartPage from './pages/StartPage';
import OrderPage from './pages/OrderPage';

// Hash links (…/#/g/code) work on GitHub Pages, which has no server to handle other paths.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/g/:code" element={<OrderPage />} />
        <Route path="*" element={<StartPage />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
