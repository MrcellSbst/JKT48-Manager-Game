import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { VoucherProvider } from './context/VoucherContext.jsx';
import './styles.css';
import './voucherAdmin.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider><VoucherProvider><App /></VoucherProvider></AuthProvider>
  </StrictMode>,
);
