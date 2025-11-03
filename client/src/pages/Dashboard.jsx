import { useState, useEffect, useRef } from 'react';
import { branchesAPI, stocksAPI, cashAPI, groceryAPI, machinesAPI, itemsAPI, transfersAPI, usersAPI } from '../services/api';
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
  const [branch, setBranch] = useState('');
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

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (branches.length > 0 && items.length > 0) {
      loadDashboard();
    }
  }, [branch, dateFrom, dateTo, branches, items]);

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
                
                // Stock value (all batches)
                stockValueNormal += available * (item.price || 0);

                // Sales and expected cash (finished batches only)
                if (stockRes.data.isFinished) {
                  const revenue = soldQty * (item.price || 0);
                  totalSales += revenue;
                  totalItemsSold += soldQty;
                  totalReturnItems += stock.returned || 0;
                  totalExpectedCash += revenue;

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

      // Update stats
      setStats({
        totalSales,
        itemsSold: totalItemsSold,
        cashAccuracy,
        returnItems: totalReturnItems,
        expectedCash: totalExpectedCash,
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

  const loadRecentActivities = async () => {
    try {
      const activities = [];
      const availableBranches = getAvailableBranches();
      const branchesToFetch = branch && branch !== 'All Branches' 
        ? [branch]
        : availableBranches.map(b => b.name);

      // Get users for operator name resolution
      let users = [];
      try {
        const usersRes = await usersAPI.getAll();
        if (usersRes.data.success) {
          users = usersRes.data.users || [];
        }
      } catch (error) {
        console.error('Error fetching users for activities:', error);
      }

      // Get grocery stocks (additions) - limit to recent
      try {
        for (const branchName of branchesToFetch) {
          const groceryStocksRes = await groceryAPI.getStocks({ branch: branchName });
          if (groceryStocksRes.data.success) {
            const stocks = groceryStocksRes.data.stocks || [];
            // Filter to recent stocks (last 7 days)
            const recentDate = new Date();
            recentDate.setDate(recentDate.getDate() - 7);
            
            for (const stock of stocks) {
              const stockDate = stock.addedDate ? new Date(stock.addedDate) : (stock.date ? new Date(stock.date) : new Date());
              if (stockDate >= recentDate) {
                const item = items.find(i => i.code === stock.itemCode);
                if (item) {
                  activities.push({
                    type: 'grocery_stock_added',
                    date: stockDate,
                    branch: stock.branch,
                    message: `${stock.quantity} ${item.name} added to ${stock.branch}`,
                    timestamp: stockDate.getTime()
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching grocery stocks for activities:', error);
      }

      // Get normal item stocks (additions and returns) - fetch for recent dates only
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 7); // Last 7 days
      const recentDateStr = recentDate.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];
      
      // Limit to last 7 days to avoid too many API calls
      for (const branchName of branchesToFetch) {
        const dates = getDateRange(recentDateStr, todayStr);
        // Only check last 7 days, limit to avoid performance issues
        const limitedDates = dates.slice(-7);
        for (const date of limitedDates) {
          try {
            const stockRes = await stocksAPI.get({ date, branch: branchName });
            if (stockRes.data.success) {
              for (const stock of stockRes.data.stocks || []) {
                const item = items.find(i => i.code === stock.itemCode && i.itemType === 'Normal Item');
                if (!item) continue;

                if (stock.added > 0) {
                  const activityDate = new Date(date + 'T12:00:00');
                  activities.push({
                    type: 'stock_added',
                    date: activityDate,
                    branch: branchName,
                    message: `${stock.added} ${item.name} added to ${branchName}`,
                    timestamp: activityDate.getTime()
                  });
                }

                if (stock.returned > 0) {
                  const activityDate = new Date(date + 'T12:00:00');
                  activities.push({
                    type: 'return',
                    date: activityDate,
                    branch: branchName,
                    message: `${stock.returned} ${item.name} returned at ${branchName}`,
                    timestamp: activityDate.getTime()
                  });
                }
              }
            }
          } catch (err) {
            // Skip if no data
          }
        }
      }

      // Get cash entries
      try {
        const params = { dateFrom: recentDateStr, dateTo: todayStr };
        if (branch && branch !== 'All Branches') {
          params.branch = branch;
        }
        const cashRes = await cashAPI.getEntries(params);
        
        if (cashRes.data.success) {
          for (const entry of cashRes.data.entries || []) {
            const entryDate = entry.timestamp ? new Date(entry.timestamp) : (entry.date ? new Date(entry.date + 'T12:00:00') : new Date());
            const isDiscrepancy = Math.abs(entry.difference || 0) > 0;
            
            // Resolve operator name from users list
            let operatorName = entry.operatorName || entry.operatorId || 'Unknown';
            if (entry.operatorId && !entry.operatorName) {
              const user = users.find(u => u.id === entry.operatorId || u.username === entry.operatorId);
              if (user && user.fullName) operatorName = user.fullName;
              else if (entry.operatorId === 'admin') operatorName = 'Administrator';
            }
            
            activities.push({
              type: isDiscrepancy ? 'cash_discrepancy' : 'cash_entry',
              date: entryDate,
              branch: entry.branch,
              message: `${operatorName} recorded cash for ${entry.branch}: Actual Rs ${parseFloat(entry.actual || 0).toFixed(2)} vs Expected Rs ${parseFloat(entry.expected || 0).toFixed(2)} (Diff Rs ${parseFloat(entry.difference || 0).toFixed(2)})`,
              timestamp: entryDate.getTime()
            });
          }
        }
      } catch (error) {
        console.error('Error fetching cash entries for activities:', error);
      }

      // Get machine batches (completed)
      try {
        for (const branchName of branchesToFetch) {
          const machinesRes = await machinesAPI.getBatches({ branch: branchName, status: 'completed' });
          if (machinesRes.data.success) {
            for (const batch of machinesRes.data.batches || []) {
              const machine = items.find(i => i.code === batch.machineCode && i.itemType === 'Machine');
              if (machine && batch.status === 'completed') {
                const soldQty = (batch.endValue || 0) - (batch.startValue || 0);
                const activityDate = batch.endTime ? new Date(batch.endTime) : (batch.date ? new Date(batch.date + 'T12:00:00') : new Date());
                activities.push({
                  type: 'machine_sale',
                  date: activityDate,
                  branch: batch.branch,
                  message: `${soldQty} ${machine.name} sales at ${batch.branch}`,
                  timestamp: activityDate.getTime()
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching machine batches for activities:', error);
      }

      // Get grocery sales
      try {
        const params = { dateFrom: recentDateStr, dateTo: todayStr };
        if (branch && branch !== 'All Branches') {
          params.branch = branch;
        }
        const grocerySalesRes = await groceryAPI.getSales(params);
        
        if (grocerySalesRes.data.success) {
          for (const sale of grocerySalesRes.data.sales || []) {
            const saleDate = sale.timestamp ? new Date(sale.timestamp) : (sale.date ? new Date(sale.date + 'T12:00:00') : new Date());
            activities.push({
              type: 'grocery_sale',
              date: saleDate,
              branch: sale.branch,
              message: `${sale.soldQty} ${sale.itemName} sold at ${sale.branch}`,
              timestamp: saleDate.getTime()
            });
          }
        }
      } catch (error) {
        console.error('Error fetching grocery sales for activities:', error);
      }

      // Get grocery returns
      try {
        const params = { dateFrom: recentDateStr, dateTo: todayStr };
        if (branch && branch !== 'All Branches') {
          params.branch = branch;
        }
        const groceryReturnsRes = await groceryAPI.getReturns(params);
        
        if (groceryReturnsRes.data.success) {
          for (const ret of groceryReturnsRes.data.returns || []) {
            const retDate = ret.timestamp ? new Date(ret.timestamp) : (ret.date ? new Date(ret.date + 'T12:00:00') : new Date());
            activities.push({
              type: 'grocery_return',
              date: retDate,
              branch: ret.branch,
              message: `${ret.returnedQty} ${ret.itemName} returned (waste) at ${ret.branch}`,
              timestamp: retDate.getTime()
            });
          }
        }
      } catch (error) {
        console.error('Error fetching grocery returns for activities:', error);
      }

      // Get transfer history
      try {
        const params = { dateFrom: recentDateStr, dateTo: todayStr };
        if (branch && branch !== 'All Branches') {
          params.branch = branch;
        }
        const transfersRes = await transfersAPI.get(params);
        
        if (transfersRes.data.success) {
          for (const transfer of transfersRes.data.transfers || []) {
            const transferDate = transfer.processedAt ? new Date(transfer.processedAt) : (transfer.date ? new Date(transfer.date + 'T12:00:00') : new Date());
            const itemNames = transfer.items.map(item => item.itemName).join(', ');
            activities.push({
              type: 'transfer',
              date: transferDate,
              branch: transfer.senderBranch,
              message: `Internal transfer: ${transfer.items.length} ${transfer.itemType.toLowerCase()} items (${itemNames}) from ${transfer.senderBranch} to ${transfer.receiverBranch}`,
              timestamp: transferDate.getTime()
            });
          }
        }
      } catch (error) {
        console.error('Error fetching transfers for activities:', error);
      }

      // Sort activities by timestamp (newest first) and get top 5
      activities.sort((a, b) => b.timestamp - a.timestamp);
      const recent = activities.slice(0, 5);
      
      setRecentActivities(recent);
    } catch (error) {
      console.error('Error loading recent activities:', error);
      setRecentActivities([]);
    }
  };

  const availableBranches = getAvailableBranches();

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 className="h2">Dashboard</h1>
        <div className="btn-toolbar mb-2 mb-md-0">
          <div className="btn-group me-2">
            <select 
              className="form-select me-2" 
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              <option value="">All Branches</option>
              {availableBranches.map(b => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
            <input 
              type="date" 
              className="form-control me-2" 
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <input 
              type="date" 
              className="form-control" 
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
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
                    {recentActivities.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center text-muted">No recent activity</td>
                      </tr>
                    ) : (
                      recentActivities.map((activity, index) => (
                        <tr key={index}>
                          <td>{new Date(activity.date).toLocaleString()}</td>
                          <td>{activity.type.replace('_', ' ')}</td>
                          <td>{activity.message}</td>
                          <td>{activity.branch || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
