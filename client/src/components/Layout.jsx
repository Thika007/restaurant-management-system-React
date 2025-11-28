import { useState, useEffect, useRef } from 'react';
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { systemAPI, notificationsAPI, branchesAPI, healthAPI } from '../services/api';
import Dashboard from '../pages/Dashboard';
import Inventory from '../pages/Inventory';
import AddStock from '../pages/AddStock';
import InternalTransfer from '../pages/InternalTransfer';
import AddReturn from '../pages/AddReturn';
import CashManagement from '../pages/CashManagement';
import Reports from '../pages/Reports';
import ExpireTracking from '../pages/ExpireTracking';
import BranchManagement from '../pages/BranchManagement';
import UserManagement from '../pages/UserManagement';

const Layout = () => {
  const { user, logout } = useAuth();
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [notificationBranchFilter, setNotificationBranchFilter] = useState('');
  const [availableBranches, setAvailableBranches] = useState([]);
  const notificationPanelRef = useRef(null);
  const [notifPollingEnabled, setNotifPollingEnabled] = useState(false);
  const notifFailureCountRef = useRef(0);
  const [showClearDataModal, setShowClearDataModal] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleClearDataClick = () => {
    if (!user || user.role !== 'admin') {
      showWarning('Only admins can clear transaction data.');
      return;
    }
    setShowClearDataModal(true);
  };

  const closeClearDataModal = () => {
    setShowClearDataModal(false);
  };

  const confirmClearData = async () => {
    try {
      const response = await systemAPI.clearTransactionData();
      if (response.data.success) {
        showSuccess('All transaction data cleared successfully! Dashboard, Reports, and Expire Tracking will now show no data. Users, branches, and items are preserved.');
        closeClearDataModal();
        // Reload the page to refresh data
        window.location.reload();
      } else {
        showError('Failed to clear data: ' + (response.data.message || 'Unknown error'));
        closeClearDataModal();
      }
    } catch (error) {
      console.error('Error clearing data:', error);
      showError('Error clearing data: ' + (error.response?.data?.message || error.message || 'Unknown error'));
      closeClearDataModal();
    }
  };

  const canAccess = (accessName) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.accesses && user.accesses.includes(accessName);
  };

  // Load branches for notification filter
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await branchesAPI.getAll();
        if (response.data.success) {
          setAvailableBranches(response.data.branches || []);
        }
      } catch (error) {
        console.error('Error loading branches:', error);
      }
    };
    loadBranches();
  }, []);

  // Load notifications
  const loadNotifications = async ({ override = false } = {}) => {
    if (!user) return;
    try {
      if (!notifPollingEnabled && !override) return;
      const params = {
        userId: user.id || user.role,
        userRole: user.role,
        assignedBranches: JSON.stringify(user.assignedBranches || [])
      };
      if (notificationBranchFilter) {
        params.branch = notificationBranchFilter;
      }
      const response = await notificationsAPI.get(params);
      if (response.data.success) {
        const allNotifications = response.data.notifications || [];
        
        // Additional frontend filtering based on user's assigned branches
        let filteredNotifications = allNotifications;
        if (user.role !== 'admin' && user.assignedBranches && user.assignedBranches.length > 0) {
          filteredNotifications = allNotifications.filter(n => 
            !n.branch || user.assignedBranches.includes(n.branch)
          );
        }
        
        // Filter out notifications that are already read by this user
        const userId = user.id || user.role;
        const unreadNotifications = filteredNotifications.filter(n => {
          const readBy = n.readBy || [];
          return !readBy.includes(userId);
        });
        
        // Sanitize messages to remove any batch identifiers like "(Batch: ...)"
        const sanitizeMessage = (message) => {
          if (!message) return '';
          try {
            return message
              .replace(/\s*\(Batch:\s*[^)]+\)\s*/gi, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          } catch {
            return message;
          }
        };

        // Only show unread notifications to the user, with sanitized messages
        const sanitized = unreadNotifications.map(n => ({
          ...n,
          message: sanitizeMessage(n.message)
        }));
        setNotifications(sanitized);
        setUnreadCount(unreadNotifications.length);
      }
      // reset failure count on success
      notifFailureCountRef.current = 0;
    } catch (error) {
      // Increment failures and temporarily disable polling if backend is down
      notifFailureCountRef.current += 1;
      if (notifFailureCountRef.current >= 3) {
        setNotifPollingEnabled(false);
        // Re-enable after 60s
        setTimeout(() => setNotifPollingEnabled(true), 60000);
      }
      // Silently ignore network errors
    }
  };

  // Check for expiring items periodically (every 5 minutes)
  useEffect(() => {
    // Only attempt if polling is enabled
    if (user && notifPollingEnabled) {
      notificationsAPI.checkExpiring().catch(() => {});
    }
  }, [user]);

  // Initialize polling based on server health; load notifications on filter changes
  useEffect(() => {
    let interval;
    let expiringInterval;
    const setup = async () => {
      if (!user) return;
      try {
        await healthAPI.ping();
        setNotifPollingEnabled(true);
      } catch {
        setNotifPollingEnabled(false);
        // retry enabling after 60s
        setTimeout(() => setNotifPollingEnabled(true), 60000);
      }

      // Kick off first load once (override guard so it runs immediately)
      loadNotifications({ override: true });

      // Refresh notifications every 30 seconds
      interval = setInterval(() => {
        loadNotifications();
      }, 30000);

      // Check for expiring items every 5 minutes
      expiringInterval = setInterval(() => {
        if (notifPollingEnabled) {
          notificationsAPI.checkExpiring()
            .then(() => loadNotifications())
            .catch(() => {});
        }
      }, 300000);
    };
    setup();

    return () => {
      if (interval) clearInterval(interval);
      if (expiringInterval) clearInterval(expiringInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, notificationBranchFilter]);

  useEffect(() => {
    if (!user) return;
    if (!notifPollingEnabled) return;
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifPollingEnabled]);

  useEffect(() => {
    if (!user) return;
    loadNotifications({ override: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationBranchFilter]);

  // Mark notification as read and remove from UI
  const markNotificationAsRead = async (notificationId, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!user) return;
    try {
      const userId = user.id || user.role;
      const response = await notificationsAPI.markAsRead(notificationId, userId);
      if (response.data.success) {
        // Remove notification from local state immediately
        setNotifications(prevNotifications => 
          prevNotifications.filter(n => n.id !== notificationId)
        );
        // Update unread count
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Reload on error to sync with server
      loadNotifications();
    }
  };

  // Mark all notifications as read and remove from UI
  const markAllAsRead = async () => {
    if (!user) return;
    try {
      const userId = user.id || user.role;
      const unreadNotifications = notifications.filter(n => {
        const readBy = n.readBy || [];
        return !readBy.includes(userId);
      });
      
      // Mark all as read on server
      await Promise.all(
        unreadNotifications.map(n => notificationsAPI.markAsRead(n.id, userId))
      );
      
      // Remove all notifications from UI
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      // Reload on error to sync with server
      loadNotifications();
    }
  };

  // Toggle notification panel
  const toggleNotificationPanel = () => {
    setShowNotificationPanel(!showNotificationPanel);
  };

  // Close notification panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationPanelRef.current && !notificationPanelRef.current.contains(event.target)) {
        const bellButton = event.target.closest('button[aria-label="Notifications"]');
        if (!bellButton) {
          setShowNotificationPanel(false);
        }
      }
    };

    if (showNotificationPanel) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotificationPanel]);

  // Get branches for filter (admin sees all, others see assigned)
  const getNotificationBranches = () => {
    if (user?.role === 'admin' || !user?.assignedBranches || user.assignedBranches.length === 0) {
      return availableBranches.map(b => b.name);
    }
    return availableBranches
      .filter(b => user.assignedBranches.includes(b.name))
      .map(b => b.name);
  };

  // Filter notifications by branch filter and sort by date (newest first)
  // Note: Notifications are already filtered by user's branch access in loadNotifications
  const filteredNotifications = (notificationBranchFilter
    ? notifications.filter(n => n.branch === notificationBranchFilter)
    : notifications
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="main-container">
      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-dark">
        <div className="container-fluid">
          <a className="navbar-brand" href="#">
            Restaurant Management System
          </a>
          <div className="navbar-nav ms-auto">
            <button 
              className="btn btn-link position-relative me-3" 
              style={{ color: '#fff' }}
              onClick={toggleNotificationPanel}
              aria-label="Notifications"
            >
              <i className={`fas fa-bell ${unreadCount > 0 ? 'ring-animation' : ''}`}></i>
              {unreadCount > 0 && (
                <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <div className="nav-item dropdown">
              <a className="nav-link dropdown-toggle" href="#" id="userDropdown" data-bs-toggle="dropdown" style={{ color: '#fff' }}>
                <i className="fas fa-user me-1"></i> <span id="userRole">{user?.fullName || user?.role || 'User'}</span>
              </a>
              <ul className="dropdown-menu">
                <li><a className="dropdown-item" href="#"><i className="fas fa-cog me-2"></i>Settings</a></li>
                {user?.role === 'admin' && (
                  <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); handleClearDataClick(); }}><i className="fas fa-trash-alt me-2"></i>Clear Data</a></li>
                )}
                <li><hr className="dropdown-divider" /></li>
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}><i className="fas fa-sign-out-alt me-2"></i>Logout</a></li>
              </ul>
            </div>
          </div>
        </div>
      </nav>

      {/* Notification Panel */}
      {showNotificationPanel && (
        <div 
          ref={notificationPanelRef}
          className="position-fixed end-0 bg-white shadow p-3"
          style={{ 
            width: '360px', 
            maxHeight: '70vh', 
            overflow: 'auto', 
            zIndex: 1060, 
            marginTop: '56px', 
            marginRight: '12px',
            borderRadius: '8px',
            border: '1px solid #dee2e6'
          }}
        >
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button 
                className="btn btn-sm btn-outline-secondary" 
                onClick={markAllAsRead}
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="mb-2">
            <select 
              className="form-select form-select-sm"
              value={notificationBranchFilter}
              onChange={(e) => setNotificationBranchFilter(e.target.value)}
            >
              <option value="">All Branches</option>
              {getNotificationBranches().map(branchName => (
                <option key={branchName} value={branchName}>{branchName}</option>
              ))}
            </select>
          </div>
          <div>
            {filteredNotifications.length === 0 ? (
              <div className="text-muted small text-center py-3">No notifications</div>
            ) : (
              filteredNotifications.map(notification => {
                const userId = user?.id || user?.role;
                const readBy = notification.readBy || [];
                const isRead = readBy.includes(userId);
                
                return (
                  <div 
                    key={notification.id}
                    className={`border rounded p-2 mb-2 position-relative ${!isRead ? 'bg-light' : ''}`}
                  >
                    <button 
                      type="button" 
                      className="btn-close position-absolute end-0 top-0 m-2" 
                      aria-label="Close"
                      onClick={(e) => markNotificationAsRead(notification.id, e)}
                      style={{ zIndex: 10 }}
                    ></button>
                    <div className="small text-muted">
                      {new Date(notification.createdAt).toLocaleString()} 
                      {notification.branch && ` • ${notification.branch}`}
                    </div>
                    <div>{(() => {
                      const msg = notification.message || '';
                      try {
                        return msg
                          .replace(/\s*\(Batch:\s*[^)]+\)\s*/gi, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();
                      } catch {
                        return msg;
                      }
                    })()}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className="content-wrapper">
        {/* Sidebar */}
        <nav className="sidebar">
          <div className="position-sticky pt-3">
            <ul className="nav flex-column">
              {canAccess('Dashboard') && (
                <li className="nav-item">
                  <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-tachometer-alt me-2"></i>Dashboard
                  </NavLink>
                </li>
              )}
              {canAccess('Master Creation') && (
                <li className="nav-item">
                  <NavLink to="/inventory" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-boxes me-2"></i>Master Creation
                  </NavLink>
                </li>
              )}
              {canAccess('Add Item Stock') && (
                <li className="nav-item">
                  <NavLink to="/add-stock" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-plus-circle me-2"></i>Add Item Stock
                  </NavLink>
                </li>
              )}
              {canAccess('Internal Transfer') && (
                <li className="nav-item">
                  <NavLink to="/internal-transfer" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-exchange-alt me-2"></i>Internal Transfer
                  </NavLink>
                </li>
              )}
              {canAccess('Add Return Stock') && (
                <li className="nav-item">
                  <NavLink to="/add-return" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-undo me-2"></i>Add Return Stock
                  </NavLink>
                </li>
              )}
              {canAccess('Cash Management') && (
                <li className="nav-item">
                  <NavLink to="/cash-management" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-money-bill-wave me-2"></i>Cash Management
                  </NavLink>
                </li>
              )}
              {canAccess('Reports') && (
                <li className="nav-item">
                  <NavLink to="/reports" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-chart-bar me-2"></i>Reports
                  </NavLink>
                </li>
              )}
              {canAccess('Expire Tracking') && (
                <li className="nav-item">
                  <NavLink to="/expire-tracking" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-clock me-2"></i>Expire Tracking
                  </NavLink>
                </li>
              )}
              {canAccess('Branch Management') && (
                <li className="nav-item">
                  <NavLink to="/branch-management" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-store me-2"></i>Branch Management
                  </NavLink>
                </li>
              )}
              {user?.role === 'admin' && (
                <li className="nav-item">
                  <NavLink to="/user-management" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <i className="fas fa-users me-2"></i>User Management
                  </NavLink>
                </li>
              )}
            </ul>
          </div>
        </nav>

        {/* Main Content */}
        <main className="main-content">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/add-stock" element={<AddStock />} />
            <Route path="/internal-transfer" element={<InternalTransfer />} />
            <Route path="/add-return" element={<AddReturn />} />
            <Route path="/cash-management" element={<CashManagement />} />
            <Route path="/reports" element={<Reports />} />
            <Route 
              path="/expire-tracking" 
              element={
                user?.role === 'admin' || (user?.accesses && user.accesses.includes('Expire Tracking')) 
                  ? <ExpireTracking /> 
                  : <Navigate to="/dashboard" replace />
              } 
            />
            <Route path="/branch-management" element={<BranchManagement />} />
            <Route path="/user-management" element={<UserManagement />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>

      {/* Clear Data Confirmation Modal */}
      {showClearDataModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  Confirm Clear All Data
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeClearDataModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-warning mb-3">
                  <strong>Warning:</strong> This action cannot be undone!
                </div>
                <p className="mb-3">
                  Are you sure you want to clear <strong>ALL transaction data</strong>?
                </p>
                <div className="mb-3">
                  <strong>This will clear:</strong>
                  <ul className="mb-0">
                    <li>All sales data (normal items, grocery, machines)</li>
                    <li>All stock additions and returns</li>
                    <li>All transfers</li>
                    <li>All cash entries</li>
                    <li>All expiry tracking data</li>
                  </ul>
                  <p className="mt-2 mb-0 text-muted small">
                    After clearing, Dashboard, Reports, and Expire Tracking pages will show NO data.
                  </p>
                </div>
                <div className="mb-0">
                  <strong>This will NOT delete:</strong>
                  <ul className="mb-0">
                    <li>Users</li>
                    <li>Branches</li>
                    <li>Items (master data)</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeClearDataModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmClearData}
                >
                  <i className="fas fa-trash-alt me-2"></i>Clear All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;

