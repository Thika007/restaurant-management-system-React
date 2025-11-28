import { useState, useEffect, useRef, useCallback } from 'react';
import { branchesAPI, stocksAPI, cashAPI, groceryAPI, machinesAPI, itemsAPI, transfersAPI, usersAPI, activitiesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getCurrentDate, formatCurrency, getDateRange } from '../utils/helpers';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalSales: 0,
    itemsSold: 0,
    cashAccuracy: 'N/A',
    returnItems: 0,
    expectedCash: 0,
    stockValueNormal: 0,
    stockValueGrocery: 0,
    machineSalesCash: 0
  });
  // Initialize branch state based on user role
  const [branch, setBranch] = useState(() => {
    if (user && user.role !== 'admin' && user.assignedBranches && user.assignedBranches.length > 0) {
      return user.assignedBranches[0];
    }
    return '';
  });
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(getCurrentDate());
  const [branches, setBranches] = useState([]);
  const [items, setItems] = useState([]);
  const [topSellingItems, setTopSellingItems] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const salesChartRef = useRef(null);
  const chartInstanceRef = useRef(null);

  // Get available branches based on user role
  const getAvailableBranches = () => {
    if (!user) return [];
    if (user.role === 'admin' || !user.assignedBranches || user.assignedBranches.length === 0) {
      return branches;
    }
    return branches.filter(b => user.assignedBranches.includes(b.name));
  };

  // Load recent activities function - must be defined before useEffect hooks
  const loadRecentActivities = useCallback(async () => {
    try {
      console.log('Loading recent activities...'); // Debug log
      
      // Calculate date range for recent activities (last 30 days to get more records)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30);
      const recentDateStr = recentDate.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];

      // Build query parameters - expand to 30 days or remove date filter to see all
      const params = {
        // Temporarily remove date filtering to test - comment out dateFrom/dateTo
        // dateFrom: recentDateStr,
        // dateTo: todayStr,
        limit: 100
      };
      
      console.log('Date range calculated:', { recentDateStr, todayStr }); // Debug log

      // Filter by branch if selected
      if (branch && branch !== 'All Branches') {
        params.branch = branch;
      }

      console.log('Fetching activities with params:', params); // Debug log

      // Fetch activities from the new API
      const activitiesRes = await activitiesAPI.getRecentActivities(params);
      
      console.log('Activities API response:', activitiesRes.data); // Debug log
      
      if (activitiesRes.data && activitiesRes.data.success) {
        const activitiesArray = activitiesRes.data.activities || [];
        console.log(`Received ${activitiesArray.length} activities from API`);
        
        const activities = activitiesArray.map((activity, idx) => {
          try {
            // Handle timestamp - backend sends ISO string
            let timestampDate;
            if (activity.timestamp) {
              timestampDate = typeof activity.timestamp === 'string' 
                ? new Date(activity.timestamp) 
                : new Date(activity.timestamp);
            } else if (activity.date) {
              timestampDate = typeof activity.date === 'string'
                ? new Date(activity.date)
                : new Date(activity.date);
            } else {
              timestampDate = new Date();
            }
            
            // Validate date
            if (isNaN(timestampDate.getTime())) {
              console.warn(`Invalid date for activity ${idx}:`, activity);
              timestampDate = new Date();
            }
            
            return {
              id: activity.id || `activity-${idx}`,
              type: activity.type || 'unknown',
              message: activity.message || '',
              branch: activity.branch || null,
              date: timestampDate,
              timestamp: timestampDate.getTime()
            };
          } catch (parseError) {
            console.error(`Error parsing activity ${idx}:`, parseError, activity);
            return null;
          }
        }).filter(activity => activity !== null);
        
        // Sort by timestamp descending (most recent first)
        activities.sort((a, b) => b.timestamp - a.timestamp);
        
        console.log(`Successfully parsed ${activities.length} activities`); // Debug log
        setRecentActivities(activities);
        setCurrentPage(1); // Reset to first page when activities reload
      } else {
        console.warn('No activities returned. Response:', activitiesRes.data);
        setRecentActivities([]);
      }
    } catch (error) {
      console.error('Error loading recent activities:', error);
      console.error('Error details:', error.response?.data || error.message);
      setRecentActivities([]);
    }
  }, [branch]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'admin') return;
    if (branch) return;

    if (user.assignedBranches && user.assignedBranches.length > 0) {
      setBranch(user.assignedBranches[0]);
    }
  }, [user, branch]);

  useEffect(() => {
    if (branches.length > 0 && items.length > 0) {
      loadDashboard();
    }
  }, [branch, dateFrom, dateTo, branches, items]);

  // Load recent activities independently - doesn't need branches/items to be loaded
  useEffect(() => {
    // Load immediately on mount
    loadRecentActivities();
    
    // Auto-refresh recent activities every 30 seconds for real-time updates
    const interval = setInterval(() => {
      loadRecentActivities();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [branch, loadRecentActivities]);

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
        setItems(itemsRes.data.items);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = (start, end) => {
    const dates = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    const current = new Date(startDate);
    
    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  };

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const availableBranches = getAvailableBranches();
      const branchesToFetch = branch && branch !== 'All Branches' 
        ? [branch]
        : availableBranches.map(b => b.name);

      let totalSales = 0;
      let totalItemsSold = 0;
      let totalReturnItems = 0;
      let totalExpectedCash = 0;
      let stockValueNormal = 0;
      let stockValueGrocery = 0;
      let machineSalesCash = 0;
      let normalItemSales = 0; // Track sales from finished normal item batches
      let totalActualCash = 0;
      let totalExpectedCashForAccuracy = 0;
      let entryCount = 0;

      const salesData = {};
      const salesByItemCode = {};

      // Get dates in range
      const dates = getDateRange(dateFrom, dateTo);

      // Process normal item stocks (finished batches only for sales, all for stock value)
      for (const branchName of branchesToFetch) {
        for (const date of dates) {
          try {
            const stockRes = await stocksAPI.get({ date, branch: branchName });
            if (stockRes.data.success) {
              const normalItems = items.filter(i => i.itemType === 'Normal Item');
              
              for (const stock of stockRes.data.stocks || []) {
                const item = normalItems.find(i => i.code === stock.itemCode);
                if (!item) continue;

                const soldQty = Math.max(0, (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0));
                const available = Math.max(0, (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0));
                
                // Stock value (only unfinished batches - finished batches have 0 available stock)
                if (!stockRes.data.isFinished) {
                  stockValueNormal += available * (item.price || 0);
                }

                // Sales from finished batches (track separately for Expected Cash calculation)
                if (stockRes.data.isFinished) {
                  const revenue = soldQty * (item.price || 0);
                  totalSales += revenue;
                  normalItemSales += revenue; // Track normal item sales separately
                  totalItemsSold += soldQty;
                  totalReturnItems += stock.returned || 0;

                  // Sales chart data
                  if (!salesData[date]) salesData[date] = 0;
                  salesData[date] += revenue;

                  // Top items data
                  if (!salesByItemCode[stock.itemCode]) {
                    salesByItemCode[stock.itemCode] = { name: item.name, qty: 0, value: 0 };
                  }
                  salesByItemCode[stock.itemCode].qty += soldQty;
                  salesByItemCode[stock.itemCode].value += revenue;
                }
              }
            }
          } catch (err) {
            // Skip if no data for this date/branch
          }
        }
      }

      // Get grocery sales
      try {
        const params = { dateFrom, dateTo };
        if (branch && branch !== 'All Branches') {
          params.branch = branch;
        }
        const grocerySalesRes = await groceryAPI.getSales(params);
        
        if (grocerySalesRes.data.success) {
          for (const sale of grocerySalesRes.data.sales || []) {
            const saleDate = sale.date ? (typeof sale.date === 'string' ? sale.date : sale.date.toISOString().split('T')[0]) : '';
            const revenue = parseFloat(sale.totalCash || 0);
            totalSales += revenue;
            totalItemsSold += sale.soldQty || 0;
            totalExpectedCash += revenue;

            // Sales chart data
            if (!salesData[saleDate]) salesData[saleDate] = 0;
            salesData[saleDate] += revenue;

            // Top items data
            if (!salesByItemCode[sale.itemCode]) {
              salesByItemCode[sale.itemCode] = { name: sale.itemName, qty: 0, value: 0 };
            }
            salesByItemCode[sale.itemCode].qty += sale.soldQty || 0;
            salesByItemCode[sale.itemCode].value += revenue;
          }
        }
      } catch (error) {
        console.error('Error fetching grocery sales:', error);
      }

      // Get grocery returns
      try {
        const params = { dateFrom, dateTo };
        if (branch && branch !== 'All Branches') {
          params.branch = branch;
        }
        const groceryReturnsRes = await groceryAPI.getReturns(params);
        
        if (groceryReturnsRes.data.success) {
          for (const ret of groceryReturnsRes.data.returns || []) {
            totalReturnItems += ret.returnedQty || 0;
          }
        }
      } catch (error) {
        console.error('Error fetching grocery returns:', error);
      }

      // Get grocery stocks for stock value
      try {
        const params = { dateFrom, dateTo };
        if (branch && branch !== 'All Branches') {
          params.branch = branch;
        }
        const groceryStocksRes = await groceryAPI.getStocks(params);
        
        if (groceryStocksRes.data.success) {
          for (const stock of groceryStocksRes.data.stocks || []) {
            const item = items.find(i => i.code === stock.itemCode && i.itemType === 'Grocery Item');
            if (!item) continue;
            
            const remaining = stock.remaining || 0;
            stockValueGrocery += remaining * (item.price || 0);
          }
        }
      } catch (error) {
        console.error('Error fetching grocery stocks:', error);
      }

      // Get machine sales
      try {
        const params = { dateFrom, dateTo };
        if (branch && branch !== 'All Branches') {
          params.branch = branch;
        }
        const machineSalesRes = await machinesAPI.getSales(params);
        
        if (machineSalesRes.data.success) {
          for (const sale of machineSalesRes.data.sales || []) {
            const saleDate = sale.date ? (typeof sale.date === 'string' ? sale.date : sale.date.toISOString().split('T')[0]) : '';
            const revenue = parseFloat(sale.totalCash || 0);
            totalSales += revenue;
            totalItemsSold += sale.soldQty || 0;
            totalExpectedCash += revenue;
            machineSalesCash += revenue;

            // Sales chart data
            if (!salesData[saleDate]) salesData[saleDate] = 0;
            salesData[saleDate] += revenue;

            // Top items data
            const machineItem = items.find(i => i.code === sale.machineCode && i.itemType === 'Machine');
            if (machineItem) {
              if (!salesByItemCode[sale.machineCode]) {
                salesByItemCode[sale.machineCode] = { name: sale.machineName, qty: 0, value: 0 };
              }
              salesByItemCode[sale.machineCode].qty += sale.soldQty || 0;
              salesByItemCode[sale.machineCode].value += revenue;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching machine sales:', error);
      }

      // Get cash entries for accuracy calculation
      try {
        const params = { dateFrom, dateTo };
        if (branch && branch !== 'All Branches') {
          params.branch = branch;
        }
        const cashRes = await cashAPI.getEntries(params);
        
        if (cashRes.data.success) {
          for (const entry of cashRes.data.entries || []) {
            totalActualCash += parseFloat(entry.actual || 0);
            totalExpectedCashForAccuracy += parseFloat(entry.expected || 0);
            entryCount++;
          }
        }
      } catch (error) {
        console.error('Error fetching cash entries:', error);
      }

      // Calculate cash accuracy
      let cashAccuracy = 'N/A';
      if (entryCount > 0 && totalExpectedCashForAccuracy > 0) {
        const accuracy = Math.round((totalActualCash / totalExpectedCashForAccuracy) * 100);
        cashAccuracy = `${Math.max(0, Math.min(100, accuracy))}%`;
      }

      // Calculate Expected Cash:
      // - Normal items: finished batches contribute sales (normalItemSales); unfinished contribute stock value (stockValueNormal)
      // - Grocery: expected cash is based on sales only (not remaining stock value)
      // - Machine: sales contribute to expected cash
      // Expected Cash = Normal Item Sales (finished) + Normal Stock Value (unfinished) + Grocery Sales + Machine Sales + Available Stock Value (Grocery)
      const calculatedExpectedCash = normalItemSales + stockValueNormal + stockValueGrocery + totalExpectedCash;

      // Update stats
      setStats({
        totalSales,
        itemsSold: totalItemsSold,
        cashAccuracy,
        returnItems: totalReturnItems,
        expectedCash: calculatedExpectedCash,
        stockValueNormal,
        stockValueGrocery,
        machineSalesCash
      });

      // Update top selling items
      const top = Object.entries(salesByItemCode)
        .map(([code, v]) => ({ code, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      setTopSellingItems(top);

      // Update sales chart
      updateSalesChart(salesData);

      // Load recent activities
      await loadRecentActivities();

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSalesChart = (salesData) => {
    const ctx = salesChartRef.current;
    if (!ctx) return;

    // Sort dates and prepare chart data
    const sortedDates = Object.keys(salesData).sort();
    const chartLabels = sortedDates;
    const chartData = sortedDates.map(date => salesData[date]);

    // Destroy previous chart if it exists
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    // Create new chart
    chartInstanceRef.current = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [{
          label: 'Daily Sales (Rs)',
          data: chartData,
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return 'Rs ' + value;
              }
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        }
      }
    });
  };

  const availableBranches = getAvailableBranches();

  const formatActivityType = (type) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Pagination calculations
  const totalPages = Math.ceil(recentActivities.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedActivities = recentActivities.slice(startIndex, endIndex);
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 className="h2">Dashboard</h1>
        <div className="btn-toolbar mb-2 mb-md-0">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {/* Show branch dropdown only for admin users or users with multiple branches */}
            {(user?.role === 'admin' || availableBranches.length > 1) && (
              <select 
                className="form-select" 
                style={{ width: 'auto' }}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                {user?.role === 'admin' && <option value="">All Branches</option>}
                {availableBranches.map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            )}
            {/* Show branch name for non-admin users with single branch */}
            {user?.role !== 'admin' && availableBranches.length === 1 && (
              <div className="badge bg-primary p-2">
                <i className="fas fa-store me-1"></i>{availableBranches[0].name}
              </div>
            )}
            <div className="d-flex align-items-center gap-2">
              <label className="mb-0 fw-semibold">From:</label>
              <input 
                type="date" 
                className="form-control" 
                style={{ width: 'auto' }}
                value={dateFrom}
                max={dateTo}
                onChange={(e) => {
                  const newDateFrom = e.target.value;
                  if (newDateFrom <= dateTo) {
                    setDateFrom(newDateFrom);
                  }
                }}
              />
            </div>
            <div className="d-flex align-items-center gap-2">
              <label className="mb-0 fw-semibold">To:</label>
              <input 
                type="date" 
                className="form-control" 
                style={{ width: 'auto' }}
                value={dateTo}
                min={dateFrom}
                max={getCurrentDate()}
                onChange={(e) => {
                  const newDateTo = e.target.value;
                  if (newDateTo >= dateFrom) {
                    setDateTo(newDateTo);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="row">
        <div className="col-xl-3 col-md-6 mb-4">
          <div className="card stats-card primary">
            <div className="card-body">
              <span className="metric-icon"><i className="fa-solid fa-coins"></i></span>
              <div className="metric-texts">
                <div className="metric-value">{formatCurrency(stats.totalSales)}</div>
                <div className="metric-label">Total Sales</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6 mb-4">
          <div className="card stats-card success">
            <div className="card-body">
              <span className="metric-icon"><i className="fa-solid fa-cart-shopping"></i></span>
              <div className="metric-texts">
                <div className="metric-value">{stats.itemsSold}</div>
                <div className="metric-label">Items Sold</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6 mb-4">
          <div className="card stats-card warning">
            <div className="card-body">
              <span className="metric-icon"><i className="fa-solid fa-scale-balanced"></i></span>
              <div className="metric-texts">
                <div className="metric-value">{stats.cashAccuracy}</div>
                <div className="metric-label">Cash Accuracy</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6 mb-4">
          <div className="card stats-card danger">
            <div className="card-body">
              <span className="metric-icon"><i className="fa-solid fa-rotate-left"></i></span>
              <div className="metric-texts">
                <div className="metric-value">{stats.returnItems}</div>
                <div className="metric-label">Return Items</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6 mb-4">
          <div className="card stats-card info">
            <div className="card-body">
              <span className="metric-icon"><i className="fa-solid fa-wallet"></i></span>
              <div className="metric-texts">
                <div className="metric-value">{formatCurrency(stats.expectedCash)}</div>
                <div className="metric-label">Expected Cash</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6 mb-4">
          <div className="card stats-card secondary">
            <div className="card-body">
              <span className="metric-icon"><i className="fa-solid fa-box"></i></span>
              <div className="metric-texts">
                <div className="metric-value">{formatCurrency(stats.stockValueNormal)}</div>
                <div className="metric-label">Available Stock Value (Normal)</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6 mb-4">
          <div className="card stats-card secondary">
            <div className="card-body">
              <span className="metric-icon"><i className="fa-solid fa-basket-shopping"></i></span>
              <div className="metric-texts">
                <div className="metric-value">{formatCurrency(stats.stockValueGrocery)}</div>
                <div className="metric-label">Available Stock Value (Grocery)</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6 mb-4">
          <div className="card stats-card info">
            <div className="card-body">
              <span className="metric-icon"><i className="fa-solid fa-microchip"></i></span>
              <div className="metric-texts">
                <div className="metric-value">
                  {stats.machineSalesCash > 0 ? formatCurrency(stats.machineSalesCash) : 'N/A'}
                </div>
                <div className="metric-label">Machine Sales (If Any)</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sales Chart and Top Items */}
      <div className="row">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">Sales Overview</div>
            <div className="card-body">
              <canvas ref={salesChartRef} height="250"></canvas>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card">
            <div className="card-header">Top Selling Items</div>
            <div className="card-body">
              {topSellingItems.length === 0 ? (
                <div className="text-muted">No sales data</div>
              ) : (
                topSellingItems.map((item, index) => (
                  <div key={index} className="d-flex justify-content-between border-bottom py-2">
                    <span>{item.name} ({item.qty})</span>
                    <strong>{formatCurrency(item.value)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="row mt-4">
        <div className="col-12">
          <div className="card">
            <div className="card-header">Recent Activity</div>
            <div className="card-body">
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Activity</th>
                      <th>Details</th>
                      <th>Branch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedActivities.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center text-muted">No recent activity</td>
                      </tr>
                    ) : (
                      paginatedActivities.map((activity, index) => {
                        const dateStr = activity.date instanceof Date 
                          ? activity.date.toLocaleString()
                          : (activity.date ? new Date(activity.date).toLocaleString() : 'N/A');
                        return (
                          <tr key={`${activity.id || activity.timestamp || index}-${index}`}>
                            <td>{dateStr}</td>
                            <td>{formatActivityType(activity.type)}</td>
                            <td>{activity.message || ''}</td>
                            <td>{activity.branch || '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {recentActivities.length > 0 && (
                <div className="card-footer">
                  <div className="d-flex justify-content-between align-items-center flex-wrap">
                    <div className="mb-2 mb-md-0">
                      <span className="text-muted">
                        Showing {startIndex + 1} to {Math.min(endIndex, recentActivities.length)} of {recentActivities.length} activities
                      </span>
                    </div>
                    <nav>
                      <ul className="pagination mb-0">
                        <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                          <button
                            className="page-link"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                          >
                            Previous
                          </button>
                        </li>
                        {getPageNumbers().map(pageNum => (
                          <li key={pageNum} className={`page-item ${currentPage === pageNum ? 'active' : ''}`}>
                            <button
                              className="page-link"
                              onClick={() => setCurrentPage(pageNum)}
                            >
                              {pageNum}
                            </button>
                          </li>
                        ))}
                        <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                          <button
                            className="page-link"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Next
                          </button>
                        </li>
                      </ul>
                    </nav>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
