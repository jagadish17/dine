import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import OrderPage from './pages/OrderPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/g/:code" element={<OrderPage />} />
        <Route path="*" element={<OrderPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
