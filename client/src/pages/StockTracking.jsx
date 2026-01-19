import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { stockTrackingAPI, branchesAPI, itemsAPI } from '../services/api';
import { useToast } from '../context/ToastContext';

const StockTracking = () => {
  const { user } = useAuth();
  const { showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [stockData, setStockData] = useState([]);
  const [branches, setBranches] = useState([]);
  const [groceryItems, setGroceryItems] = useState([]);
  
  // Filter states
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');

  // Get available branches based on user role
  const getAvailableBranches = () => {
    if (!user) return [];
    if (user.role === 'admin' || !user.assignedBranches || user.assignedBranches.length === 0) {
      return branches;
    }
    return branches.filter(b => user.assignedBranches.includes(b.name));
  };

  // Get unique categories from grocery items
  const getCategories = () => {
    const categories = [...new Set(groceryItems.map(item => item.category))];
    return categories.sort();
  };

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Load stock tracking data when filters change
  useEffect(() => {
    if (selectedBranch) {
      loadStockTracking();
    }
  }, [selectedBranch, selectedCategory, selectedStatus]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [branchesRes, itemsRes] = await Promise.all([
        branchesAPI.getAll(),
        itemsAPI.getAll()
      ]);

      if (branchesRes.data.success) {
        setBranches(branchesRes.data.branches);
      }
      if (itemsRes.data.success) {
        const grocery = itemsRes.data.items.filter(item => item.itemType === 'Grocery Item');
        setGroceryItems(grocery);
      }
    } catch (error) {
      console.error('Load initial data error:', error);
      showError('Failed to load initial data');
    } finally {
      setLoading(false);
    }
  };

  const loadStockTracking = async () => {
    try {
      setLoading(true);
      const params = {
        branch: selectedBranch
      };
      if (selectedCategory) {
        params.category = selectedCategory;
      }
      if (selectedStatus && selectedStatus !== 'All') {
        params.status = selectedStatus;
      }

      const response = await stockTrackingAPI.get(params);
      if (response.data.success) {
        setStockData(response.data.items);
      }
    } catch (error) {
      console.error('Load stock tracking error:', error);
      showError('Failed to load stock tracking data');
    } finally {
      setLoading(false);
    }
  };

  // Get status badge class
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Low':
        return 'bg-danger';
      case 'Medium':
        return 'bg-warning';
      case 'Full':
        return 'bg-success';
      case 'Unknown':
        return 'bg-secondary';
      default:
        return 'bg-secondary';
    }
  };

  // Format quantity display
  const formatQuantity = (qty) => {
    if (qty == null || isNaN(qty)) return '0';
    const num = parseFloat(qty);
    // If it's a whole number, show without decimals, otherwise show up to 3 decimals
    if (num % 1 === 0) {
      return num.toLocaleString();
    }
    return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 });
  };

  // Helper function to interpolate between two hex colors
  const interpolateColor = (color1, color2, ratio) => {
    // Ensure ratio is between 0 and 1
    ratio = Math.max(0, Math.min(1, ratio));
    
    // Convert hex to RGB
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    
    const r1 = parseInt(hex1.substring(0, 2), 16);
    const g1 = parseInt(hex1.substring(2, 4), 16);
    const b1 = parseInt(hex1.substring(4, 6), 16);
    
    const r2 = parseInt(hex2.substring(0, 2), 16);
    const g2 = parseInt(hex2.substring(2, 4), 16);
    const b2 = parseInt(hex2.substring(4, 6), 16);
    
    // Interpolate
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);
    
    // Convert back to hex
    const toHex = (n) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Calculate progress percentage based on min/max/current
  const calculateProgress = (item) => {
    const { minQty, maxQty, currentQty } = item;
    
    // If min/max not set, return 0
    if (minQty == null || maxQty == null) {
      return 0;
    }
    
    const min = parseFloat(minQty);
    const max = parseFloat(maxQty);
    const current = parseFloat(currentQty || 0);
    
    // Handle edge case where min equals max
    if (min === max) {
      return current >= min ? 100 : 0;
    }
    
    // Calculate percentage: (current - min) / (max - min) * 100
    let percentage = ((current - min) / (max - min)) * 100;
    
    // Clamp between 0 and 100 for display purposes
    percentage = Math.max(0, Math.min(100, percentage));
    
    return percentage;
  };

  // Get progress bar color with gradient (red → yellow → green)
  const getProgressBarColor = (percentage, minQty, maxQty, currentQty) => {
    // If min/max not available, return gray
    if (minQty == null || maxQty == null) {
      return '#6c757d'; // Bootstrap gray
    }
    
    const min = parseFloat(minQty);
    const max = parseFloat(maxQty);
    const current = parseFloat(currentQty || 0);
    
    // Define color stops
    const red = '#dc3545';    // Bootstrap danger (red)
    const yellow = '#ffc107'; // Bootstrap warning (yellow)
    const green = '#28a745';  // Bootstrap success (green)
    
    // Handle edge cases
    if (current <= min || percentage <= 0) {
      return red;
    }
    if (current >= max || percentage >= 100) {
      return green;
    }
    
    // Gradient: red → yellow (0-50%), yellow → green (50-100%)
    if (percentage <= 50) {
      // Red to Yellow
      const ratio = percentage / 50;
      return interpolateColor(red, yellow, ratio);
    } else {
      // Yellow to Green
      const ratio = (percentage - 50) / 50;
      return interpolateColor(yellow, green, ratio);
    }
  };

  if (loading && stockData.length === 0 && !selectedBranch) {
    return <div className="text-center p-5">Loading...</div>;
  }

  return (
    <div className="p-4">
      <h2 className="mb-4">Stock Tracking</h2>

      {/* Filters Section */}
      <div className="card mb-3">
        <div className="card-body">
          <h4>Filter Stock</h4>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Branch *</label>
              <select
                className="form-select"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                required
              >
                <option value="">Select Branch</option>
                {getAvailableBranches().map(branch => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {getCategories().map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="All">All Status</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="Full">Full</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>
            <div className="col-md-3 d-flex align-items-end">
              <button
                className="btn btn-primary w-100"
                onClick={loadStockTracking}
                disabled={!selectedBranch}
              >
                <i className="fas fa-filter me-2"></i>Filter
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stock Tracking Table */}
      <div className="card">
        <div className="card-header">
          <div className="d-flex justify-content-between align-items-center">
            <span>Grocery Stock Tracking</span>
            {selectedBranch && (
              <span className="text-muted small">Branch: {selectedBranch}</span>
            )}
          </div>
        </div>
        <div className="card-body">
          {!selectedBranch ? (
            <div className="text-center p-5 text-muted">
              <i className="fas fa-info-circle fa-2x mb-3"></i>
              <p>Please select a branch to view stock tracking data.</p>
            </div>
          ) : loading ? (
            <div className="text-center p-5">Loading...</div>
          ) : stockData.length === 0 ? (
            <div className="text-center p-5 text-muted">
              <i className="fas fa-box-open fa-2x mb-3"></i>
              <p>No grocery items found for the selected filters.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Current Quantity</th>
                    <th>Stock Level</th>
                    <th>Status</th>
                    <th>Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {stockData.map((item) => {
                    const progressPercentage = calculateProgress(item);
                    const progressColor = getProgressBarColor(
                      progressPercentage,
                      item.minQty,
                      item.maxQty,
                      item.currentQty
                    );
                    const hasMinMax = item.minQty != null && item.maxQty != null;
                    
                    return (
                      <tr key={item.code}>
                        <td>{item.name}</td>
                        <td>{item.category}</td>
                        <td>{formatQuantity(item.currentQty)}</td>
                        <td>
                          <div className="progress" style={{ height: '25px', minWidth: '150px' }}>
                            <div
                              className="progress-bar"
                              role="progressbar"
                              style={{
                                width: `${Math.max(0, Math.min(100, progressPercentage))}%`,
                                backgroundColor: progressColor,
                                transition: 'all 0.3s ease'
                              }}
                              aria-valuenow={progressPercentage}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            >
                              {progressPercentage > 5 && (
                                <small className="text-white fw-bold">
                                  {progressPercentage.toFixed(1)}%
                                </small>
                              )}
                            </div>
                          </div>
                          <div className="small text-muted mt-1">
                            Min: {item.minQty != null ? formatQuantity(item.minQty) : 'N/A'} | 
                            Max: {item.maxQty != null ? formatQuantity(item.maxQty) : 'N/A'}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${getStatusBadgeClass(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>{item.branch}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockTracking;

