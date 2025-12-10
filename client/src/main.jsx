import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { initializeApiUrl } from './services/api';
import './styles/index.css';

// Initialize API URL from connection.txt before rendering the app
async function initApp() {
  // Wait for API URL to be loaded
  await initializeApiUrl();
  
  // Now render the app
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

// Start the app initialization
initApp();

