import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PopupProvider } from './context/PopupContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';
import './styles/toast.css';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }
  
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }
  
  // If user is already logged in, redirect to dashboard
  return user ? <Navigate to="/dashboard" replace /> : children;
};

function App() {
  const { user, loading } = useAuth();

  // Default redirect: if not loading and no user, go to login
  // If user exists, redirect to dashboard for root path
  return (
    <ToastProvider>
      <PopupProvider>
        <Routes>
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } 
      />
      <Route
        path="/"
        element={
          loading ? (
            <div className="text-center p-5">Loading...</div>
          ) : user ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      />
        </Routes>
      </PopupProvider>
    </ToastProvider>
  );
}

export default App;

