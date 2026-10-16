import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { loadServerConfig } from './services/aiSettings';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// Lấy cấu hình AI từ máy chủ (không kèm key) trước khi hiện giao diện
loadServerConfig().finally(() => root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
));