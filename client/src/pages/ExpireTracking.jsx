import { useState, useEffect } from 'react';
import { groceryAPI, branchesAPI, itemsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ExpireTracking = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [groceryStocks, setGroceryStocks] = useState([]);
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [expiryData, setExpiryData] = useState([]);
  
  // Filter states
  const [filterBranch, setFilterBranch] = useState('');
  const [searchItem, setSearchItem] = useState('');
  const [filterExpiryDays, setFilterExpiryDays] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Get available branches based on user access
  const getAvailableBranches = () => {
    if (!user) return [];
    
    // Admin or users with no assigned branches see all
    if (user.role === 'admin' || !user.expireTrackingBranches || user.expireTrackingBranches.length === 0) {
      return branches;
    }
    
    // Regular users see only assigned branches
    return branches.filter(b => user.expireTrackingBranches.includes(b.name));
  };

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Load and filter expiry data when filters or data change
  useEffect(() => {
    if (groceryStocks.length > 0 && items.length > 0) {
      processExpiryData();
    }
  }, [groceryStocks, items, filterBranch, searchItem, filterExpiryDays, filterType, user]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [stocksRes, itemsRes, branchesRes] = await Promise.all([
        groceryAPI.getStocks({}),
        itemsAPI.getAll(),
        branchesAPI.getAll()
      ]);

      if (stocksRes.data.success) {
        setGroceryStocks(stocksRes.data.stocks);
      }
      if (itemsRes.data.success) {
        setItems(itemsRes.data.items);
      }
      if (branchesRes.data.success) {
        setBranches(branchesRes.data.branches);
      }
    } catch (error) {
      console.error('Load initial data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const processExpiryData = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get user access control
    const isAdmin = user?.role === 'admin';
    const userExpireTrackingBranches = user?.expireTrackingBranches || [];
    
    // Filter and process grocery stocks
    // Include ALL stocks with expiry dates, even if remaining = 0
    let processedData = groceryStocks
      .filter(stock => stock.expiryDate) // Only items with expiry dates
      .map(stock => {
        const item = items.find(i => i.code === stock.itemCode);
        const branch = branches.find(b => b.name === stock.branch);
        const expiryDate = new Date(stock.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        // Hide items after 2 days past expiry (only hide if they're expired AND have no remaining)
        // But show items with remaining = 0 if they're not yet 2 days past expiry
        if (daysUntilExpiry < -2) {
          return null;
        }
        
        // Always include the stock, even if remaining = 0
        // This ensures items with 0 remaining are visible and can be tracked
        // Use nullish coalescing to properly handle remaining = 0 (don't fallback to quantity)
        const remaining = stock.remaining !== null && stock.remaining !== undefined 
          ? parseFloat(stock.remaining) 
          : 0;
        
        return {
          ...stock,
          itemName: item ? item.name : 'Unknown Item',
          branchName: branch ? branch.name : stock.branch || 'Unknown',
          expiryDate: expiryDate,
          daysUntilExpiry: daysUntilExpiry,
          remaining: remaining, // Use remaining (can be 0), not quantity
          quantity: parseFloat(stock.quantity || 0)
        };
      })
      .filter(item => item !== null) // Remove expired items (> 2 days past)
      .filter(stock => {
        // Apply user access control
        if (!isAdmin && userExpireTrackingBranches.length > 0) {
          if (!userExpireTrackingBranches.includes(stock.branch)) return false;
        }
        
        // Apply branch filter
        if (filterBranch && stock.branch !== filterBranch) return false;
        
        // Apply search filter
        if (searchItem && !stock.itemName.toLowerCase().includes(searchItem.toLowerCase())) return false;
        
        // Apply expiry days filter
        if (filterExpiryDays) {
          const days = parseInt(filterExpiryDays);
          if (stock.daysUntilExpiry > days) return false;
        }
        
        // Apply type filter
        // Note: 'all' shows everything including items with remaining = 0
        if (filterType === 'expired' && stock.daysUntilExpiry >= 0) return false;
        if (filterType === 'zero' && stock.remaining > 0) return false;
        if (filterType === 'active' && stock.daysUntilExpiry < 0) return false;
        if (filterType === 'positive' && stock.remaining <= 0) return false;
        
        return true;
      })
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry); // Sort by expiry date (soonest first)
    
    setExpiryData(processedData);
  };

  const handleRefresh = async () => {
    await loadInitialData();
    alert('Expiry table refreshed!');
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
  };

  const getStatusClass = (daysUntilExpiry) => {
    if (daysUntilExpiry <= 3) return 'danger';
    if (daysUntilExpiry <= 7) return 'warning';
    return 'success';
  };

  const getStatusText = (daysUntilExpiry) => {
    if (daysUntilExpiry <= 3) return 'Urgent';
    if (daysUntilExpiry <= 7) return 'Warning';
    return 'OK';
  };

  const getRowClass = (daysUntilExpiry) => {
    if (daysUntilExpiry <= 3) return 'table-danger';
    if (daysUntilExpiry <= 7) return 'table-warning';
    return '';
  };

  const availableBranches = getAvailableBranches();

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      loadInitialData();
    }, 300000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }

  return (
    <div className="p-4">
      <h2 className="mb-4">
        <i className="fas fa-clock me-2"></i>Expire Tracking
      </h2>

      {/* Filters Section */}
      <div className="card mb-3">
        <div className="card-body">
          <h5>Filter Options</h5>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Branch</label>
              <select
                className="form-select"
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
              >
                <option value="">All Branches</option>
                {availableBranches.map(branch => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Item</label>
              <input
                type="text"
                className="form-control"
                placeholder="Search by item name..."
                value={searchItem}
                onChange={(e) => setSearchItem(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Days Until Expiry</label>
              <select
                className="form-select"
                value={filterExpiryDays}
                onChange={(e) => setFilterExpiryDays(e.target.value)}
              >
                <option value="">All Items</option>
                <option value="3">Expiring in 3 days or less</option>
                <option value="7">Expiring in 7 days or less</option>
                <option value="14">Expiring in 14 days or less</option>
                <option value="30">Expiring in 30 days or less</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Type</label>
              <select
                className="form-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">All</option>
                <option value="expired">Expired Items</option>
                <option value="zero">0 Remaining Items</option>
                <option value="active">Not Expired</option>
                <option value="positive">Remaining &gt; 0</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Expiry Table */}
      <div className="card">
        <div className="card-header">
          <div className="d-flex justify-content-between align-items-center">
            <span>Grocery Items Expiry Tracking</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleRefresh}
            >
              <i className="fas fa-sync-alt me-1"></i>Refresh
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="alert alert-info" role="alert">
            <i className="fas fa-info-circle me-2"></i>
            Items are ordered by expiry date (soonest first). Expired items remain visible for 2 days, then are removed automatically.
          </div>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Branch</th>
                  <th>Added Date</th>
                  <th>Added Qty</th>
                  <th>Remaining Qty</th>
                  <th>Expiry Date</th>
                  <th>Days Until Expiry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {expiryData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center text-muted">
                      No items found with the current filters.
                    </td>
                  </tr>
                ) : (
                  expiryData.map((stock, index) => {
                    const statusClass = getStatusClass(stock.daysUntilExpiry);
                    const statusText = getStatusText(stock.daysUntilExpiry);
                    const rowClass = getRowClass(stock.daysUntilExpiry);
                    
                    return (
                      <tr key={stock.id || index} className={rowClass}>
                        <td><strong>{stock.itemName}</strong></td>
                        <td>{stock.branchName}</td>
                        <td>{formatDate(stock.addedDate || stock.date)}</td>
                        <td>{stock.quantity}</td>
                        <td className={stock.remaining === 0 ? 'text-danger fw-bold' : ''}>
                          {stock.remaining}
                          {stock.remaining === 0 && <span className="badge bg-danger ms-2">Returned</span>}
                        </td>
                        <td><strong>{formatDate(stock.expiryDate)}</strong></td>
                        <td>
                          <span className={`badge bg-${statusClass}`}>
                            {stock.daysUntilExpiry} day{stock.daysUntilExpiry !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td>
                          <span className={`badge bg-${statusClass}`}>
                            {statusText}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpireTracking;
