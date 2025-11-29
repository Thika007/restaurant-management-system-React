// dashboard.js - Dashboard functionality
let salesChart = null;
let categoryChart = null;

// Load dashboard stats
function loadDashboard() {
    const branch = document.getElementById('dashBranch')?.value;
    const dateFrom = document.getElementById('dateFrom')?.value;
    const dateTo = document.getElementById('dateTo')?.value;
    const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
    const items = JSON.parse(localStorage.getItem('items')) || [];
    const cashEntries = JSON.parse(localStorage.getItem('cashEntries')) || [];
    const grocerySales = JSON.parse(localStorage.getItem('grocerySales')) || [];
    const machineSales = JSON.parse(localStorage.getItem('machineSales')) || [];
    const groceryReturns = JSON.parse(localStorage.getItem('groceryReturns')) || [];
    const transferHistory = JSON.parse(localStorage.getItem('transferHistory')) || [];
    const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};

    // Get user's assigned branches for filtering
    const assignedBranches = JSON.parse(localStorage.getItem('currentBranches') || '[]');
    const role = localStorage.getItem('role');
    const shouldFilterByAssignedBranches = role !== 'admin' && assignedBranches.length > 0;

    let totalSales = 0, totalItemsSold = 0, totalReturnItems = 0, totalTransfers = 0;
    let cashAccuracy = 100;
    let stockValueNormal = 0;
    let stockValueGrocery = 0;
    let machineSalesCash = 0;

    // Calculate normal item stats (only include finished batches)
    Object.keys(stocks).forEach(key => {
        const [date, stockBranch] = key.split('_');
        const batchKey = `${date}_${stockBranch}`;
        const isFinished = !!finishedBatches[batchKey];
        
        const branchMatches = branch ? stockBranch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(stockBranch) : true);
        
        if (
            (!dateFrom || date >= dateFrom) &&
            (!dateTo || date <= dateTo) &&
            branchMatches &&
            isFinished  // Only include finished batches
        ) {
            Object.keys(stocks[key]).forEach(code => {
                const entry = stocks[key][code];
                const item = items.find(i => i.code === code);
                
                if (item && item.itemType === 'Normal Item') {
                    // Always recalculate sold quantity from scratch (accounting for transfers)
                    // This ensures consistency even if old sold values exist
                    const soldQty = Math.max(0, (entry.added || 0) - (entry.returned || 0) - (entry.transferred || 0));
                    // Update the entry with calculated sold quantity
                    entry.sold = soldQty;
                    
                    totalSales += soldQty * item.price;
                    totalItemsSold += soldQty;
                    totalReturnItems += entry.returned || 0;
                    // nothing additional here; expected cash will be computed consistently below
                }
            });
        }
    });

    // Save updated stocks with calculated sold quantities
    localStorage.setItem('stocks', JSON.stringify(stocks));

    // Add grocery sales to calculations
    grocerySales.forEach(sale => {
        const branchMatches = branch ? sale.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(sale.branch) : true);
        
        if (
            (!dateFrom || sale.date >= dateFrom) &&
            (!dateTo || sale.date <= dateTo) &&
            branchMatches
        ) {
            totalSales += sale.totalCash || 0;
            totalItemsSold += sale.soldQty || 0;
        }
    });

    // Add machine sales to calculations
    machineSales.forEach(sale => {
        const branchMatches = branch ? sale.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(sale.branch) : true);
        
        if (
            (!dateFrom || sale.date >= dateFrom) &&
            (!dateTo || sale.date <= dateTo) &&
            branchMatches
        ) {
            totalSales += sale.totalCash || 0;
            totalItemsSold += sale.soldQty || 0;
            machineSalesCash += sale.totalCash || 0;
        }
    });

    // Add grocery returns to totalReturnItems (do not affect sales)
    groceryReturns.forEach(ret => {
        const branchMatches = branch ? ret.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(ret.branch) : true);
        
        if (
            (!dateFrom || ret.date >= dateFrom) &&
            (!dateTo || ret.date <= dateTo) &&
            branchMatches
        ) {
            totalReturnItems += ret.returnedQty || 0;
        }
    });

    // Add transfer statistics
    transferHistory.forEach(transfer => {
        const isSenderAssigned = shouldFilterByAssignedBranches ? assignedBranches.includes(transfer.senderBranch) : true;
        const isReceiverAssigned = shouldFilterByAssignedBranches ? assignedBranches.includes(transfer.receiverBranch) : true;
        let branchMatches;
        
        if (branch) {
            branchMatches = transfer.senderBranch === branch || transfer.receiverBranch === branch;
        } else {
            branchMatches = shouldFilterByAssignedBranches ? (isSenderAssigned || isReceiverAssigned) : true;
        }
        
        if (
            (!dateFrom || transfer.date >= dateFrom) &&
            (!dateTo || transfer.date <= dateTo) &&
            branchMatches
        ) {
            totalTransfers += transfer.items.length;
        }
    });

    // Calculate cash accuracy by comparing actual vs expected cash
    let totalActualCash = 0;
    let totalExpectedCash = 0;
    let entryCount = 0;
    
    cashEntries.forEach(entry => {
        const branchMatches = branch ? entry.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(entry.branch) : true);
        
        if (
            (!dateFrom || entry.date >= dateFrom) &&
            (!dateTo || entry.date <= dateTo) &&
            branchMatches
        ) {
            totalActualCash += entry.actual || 0;
            totalExpectedCash += entry.expected || 0;
            entryCount++;
        }
    });
    
    // Calculate accuracy as percentage of expected that was actually received
    if (entryCount > 0 && totalExpectedCash > 0) {
        cashAccuracy = Math.round((totalActualCash / totalExpectedCash) * 100);
        cashAccuracy = Math.max(0, Math.min(100, cashAccuracy)); // Ensure between 0-100
    }

    // Update DOM
    if (document.getElementById('todaySales')) document.getElementById('todaySales').innerText = `Rs ${totalSales.toFixed(2)}`;
    if (document.getElementById('itemsSold')) document.getElementById('itemsSold').innerText = totalItemsSold;
    if (document.getElementById('cashAccuracy')) {
        const accuracyElement = document.getElementById('cashAccuracy');
        if (entryCount === 0) {
            accuracyElement.innerText = 'N/A';
            accuracyElement.title = 'No cash entries found for the selected date range/branch';
        } else {
            accuracyElement.innerText = `${cashAccuracy}%`;
            accuracyElement.title = '';
        }
    }
    if (document.getElementById('returnItems')) document.getElementById('returnItems').innerText = totalReturnItems;
    // Compute expected cash consistently with cash management: sum of sold normal items + grocery + machine within filters
    // Treat blank or 'All Branches' consistently
    const branchParam = (branch === 'All Branches') ? '' : branch;
    const expectedCash = computeExpectedCashForFilters(branchParam, dateFrom, dateTo);
    if (document.getElementById('expectedCash')) document.getElementById('expectedCash').innerText = `Rs ${expectedCash.toFixed(2)}`;

    // Available Stock Value (Normal) within filters (no finished-batch restriction)
    Object.keys(stocks).forEach(key => {
        const [d, stockBranch] = key.split('_');
        const branchMatches = branch ? stockBranch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(stockBranch) : true);
        if (
            (!dateFrom || d >= dateFrom) &&
            (!dateTo || d <= dateTo) &&
            branchMatches
        ) {
            Object.keys(stocks[key]).forEach(code => {
                const item = items.find(i => i.code === code && i.itemType === 'Normal Item');
                if (!item) return;
                const entry = stocks[key][code] || {};
                const available = Math.max(0, (entry.added || 0) - (entry.returned || 0) - (entry.transferred || 0));
                stockValueNormal += available * (item.price || 0);
            });
        }
    });

    // Available Stock Value (Grocery) using remaining quantities
    const groceryStocksAll = JSON.parse(localStorage.getItem('groceryStocks')) || [];
    groceryStocksAll.forEach(s => {
        const item = items.find(i => i.code === s.itemCode && i.itemType === 'Grocery Item');
        if (!item) return;
        const sDate = s.addedDate || s.date || '';
        const branchMatches = branch ? s.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(s.branch) : true);
        if (
            (!dateFrom || sDate >= dateFrom) &&
            (!dateTo || sDate <= dateTo) &&
            branchMatches
        ) {
            const remaining = (typeof s.remaining === 'number') ? s.remaining : (s.quantity || 0);
            stockValueGrocery += remaining * (item.price || 0);
        }
    });

    if (document.getElementById('stockValueNormal')) document.getElementById('stockValueNormal').innerText = `Rs ${stockValueNormal.toFixed(2)}`;
    if (document.getElementById('stockValueGrocery')) document.getElementById('stockValueGrocery').innerText = `Rs ${stockValueGrocery.toFixed(2)}`;
    if (document.getElementById('machineSalesCash')) document.getElementById('machineSalesCash').innerText = machineSalesCash > 0 ? `Rs ${machineSalesCash.toFixed(2)}` : 'N/A';

    // Load Sales Chart, Top Items and Recent Activity
    loadSalesChart();
    loadTopSellingItems();
    loadRecentActivity();
}

// Load Sales Chart
function loadSalesChart() {
    const branch = document.getElementById('dashBranch')?.value;
    const dateFrom = document.getElementById('dateFrom')?.value;
    const dateTo = document.getElementById('dateTo')?.value;
    const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
    const items = JSON.parse(localStorage.getItem('items')) || [];
    const grocerySales = JSON.parse(localStorage.getItem('grocerySales')) || [];
    const machineSales = JSON.parse(localStorage.getItem('machineSales')) || [];
    const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};
    
    // Get user's assigned branches for filtering
    const assignedBranches = JSON.parse(localStorage.getItem('currentBranches') || '[]');
    const role = localStorage.getItem('role');
    const shouldFilterByAssignedBranches = role !== 'admin' && assignedBranches.length > 0;
    
    // Prepare data for chart
    const salesData = {};
    
    // Process normal items sales (only finished batches)
    Object.keys(stocks).forEach(key => {
        const [date, stockBranch] = key.split('_');
        const batchKey = `${date}_${stockBranch}`;
        const isFinished = !!finishedBatches[batchKey];
        
        const branchMatches = branch ? stockBranch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(stockBranch) : true);
        
        if (
            (!dateFrom || date >= dateFrom) &&
            (!dateTo || date <= dateTo) &&
            branchMatches &&
            isFinished  // Only include finished batches
        ) {
            Object.keys(stocks[key]).forEach(code => {
                const entry = stocks[key][code];
                const item = items.find(i => i.code === code);
                
                if (item && item.itemType === 'Normal Item') {
                    // Always recalculate from scratch
                    const soldQty = Math.max(0, (entry.added || 0) - (entry.returned || 0) - (entry.transferred || 0));
                    const salesValue = soldQty * item.price;
                    
                    if (!salesData[date]) {
                        salesData[date] = 0;
                    }
                    salesData[date] += salesValue;
                }
            });
        }
    });
    
    // Process grocery sales
    grocerySales.forEach(sale => {
        const branchMatches = branch ? sale.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(sale.branch) : true);
        
        if (
            (!dateFrom || sale.date >= dateFrom) &&
            (!dateTo || sale.date <= dateTo) &&
            branchMatches
        ) {
            if (!salesData[sale.date]) {
                salesData[sale.date] = 0;
            }
            salesData[sale.date] += sale.totalCash || 0;
        }
    });
    
    // Process machine sales
    machineSales.forEach(sale => {
        const branchMatches = branch ? sale.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(sale.branch) : true);
        
        if (
            (!dateFrom || sale.date >= dateFrom) &&
            (!dateTo || sale.date <= dateTo) &&
            branchMatches
        ) {
            if (!salesData[sale.date]) {
                salesData[sale.date] = 0;
            }
            salesData[sale.date] += sale.totalCash || 0;
        }
    });
    
    // Sort dates and prepare chart data
    const sortedDates = Object.keys(salesData).sort();
    const chartLabels = sortedDates;
    const chartData = sortedDates.map(date => salesData[date]);
    
    // Get canvas context
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    
    const ctxContext = ctx.getContext('2d');
    
    // Destroy previous chart if it exists
    if (salesChart) {
        salesChart.destroy();
    }
    
    // Create new chart
    salesChart = new Chart(ctxContext, {
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
}

// Helper: compute expected cash across filters (based on added items total value - returns + transfers)
function computeExpectedCashForFilters(branch, dateFrom, dateTo) {
    const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
    const items = JSON.parse(localStorage.getItem('items')) || [];
    const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
    const groceryReturns = JSON.parse(localStorage.getItem('groceryReturns')) || [];
    const machineSales = JSON.parse(localStorage.getItem('machineSales')) || [];
    const transferHistory = JSON.parse(localStorage.getItem('transferHistory')) || [];
    const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};
    
    // Get user's assigned branches for filtering
    const assignedBranches = JSON.parse(localStorage.getItem('currentBranches') || '[]');
    const role = localStorage.getItem('role');
    const shouldFilterByAssignedBranches = role !== 'admin' && assignedBranches.length > 0;
    
    let expected = 0;

    // Calculate expected cash based on total added items value for normal items (only finished batches)
    Object.keys(stocks).forEach(key => {
        const [date, stockBranch] = key.split('_');
        const batchKey = `${date}_${stockBranch}`;
        const isFinished = !!finishedBatches[batchKey];
        
        const branchMatches = branch ? stockBranch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(stockBranch) : true);
        
        if (
            (!dateFrom || date >= dateFrom) &&
            (!dateTo || date <= dateTo) &&
            branchMatches &&
            isFinished  // Only include finished batches
        ) {
            Object.keys(stocks[key]).forEach(code => {
                const entry = stocks[key][code];
                const item = items.find(i => i.code === code);
                if (item && item.itemType === 'Normal Item') {
                    // Calculate available quantity (added - returned - transferred)
                    const addedQty = entry.added || 0;
                    const returnedQty = entry.returned || 0;
                    const transferredOut = entry.transferred || 0;
                    const availableQty = addedQty - returnedQty - transferredOut;
                    
                    // Use available quantity for expected cash (only if positive)
                    if (availableQty > 0) {
                        expected += availableQty * (item.price || 0);
                    }
                }
            });
        }
    });

    // Grocery expected cash should be the total of grocery sales only (not remaining stock)
    const grocerySales = JSON.parse(localStorage.getItem('grocerySales')) || [];
    grocerySales.forEach(sale => {
        const branchMatches = branch ? sale.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(sale.branch) : true);
        
        if (
            (!dateFrom || sale.date >= dateFrom) &&
            (!dateTo || sale.date <= dateTo) &&
            branchMatches
        ) {
            expected += Number(sale.totalCash || 0);
        }
    });

    // Add machine sales
    machineSales.forEach(sale => {
        const branchMatches = branch ? sale.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(sale.branch) : true);
        
        if (
            (!dateFrom || sale.date >= dateFrom) &&
            (!dateTo || sale.date <= dateTo) &&
            branchMatches
        ) {
            expected += sale.totalCash || 0;
        }
    });
    
    // Internal transfers are already accounted for:
    // - For normal items: sender's "transferred" field is subtracted above
    // - For grocery items: sender's "remaining" is reduced, receiver's "remaining" is added
    // No need to process transfer history here since we use current stock data

    return expected;
}

// Load Recent Activity into table on dashboard
function loadRecentActivity() {
    const tableBody = document.getElementById('recentActivityTable');
    if (!tableBody) return;
    
    const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
    const cashEntries = JSON.parse(localStorage.getItem('cashEntries')) || [];
    const items = JSON.parse(localStorage.getItem('items')) || [];
    const machineBatches = JSON.parse(localStorage.getItem('machineBatches')) || [];
    const grocerySales = JSON.parse(localStorage.getItem('grocerySales')) || [];
    const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const transferHistory = JSON.parse(localStorage.getItem('transferHistory')) || [];
    
    // Get user's assigned branches for filtering
    const assignedBranches = JSON.parse(localStorage.getItem('currentBranches') || '[]');
    const role = localStorage.getItem('role');
    const shouldFilterByAssignedBranches = role !== 'admin' && assignedBranches.length > 0;
    
    let activities = [];
    
    // Add grocery stock addition activities
    groceryStocks.forEach(stock => {
        // Filter by assigned branches
        if (shouldFilterByAssignedBranches && !assignedBranches.includes(stock.branch)) return;
        
        const activityDate = stock.date ? new Date(stock.date + 'T12:00:00') : new Date();
        const item = items.find(i => i.code === stock.itemCode);
        if (item) {
            activities.push({
                type: 'grocery_stock_added',
                date: activityDate,
                branch: stock.branch,
                message: `${stock.quantity} ${item.name} added to ${stock.branch}`,
                alertClass: 'alert-info',
                timestamp: activityDate.getTime()
            });
        }
    });
    
    // Add stock activities with proper timestamps
    Object.keys(stocks).forEach(key => {
        const [date, branch] = key.split('_');
        
        // Filter by assigned branches
        if (shouldFilterByAssignedBranches && !assignedBranches.includes(branch)) return;
        
        Object.keys(stocks[key]).forEach(code => {
            const stockData = stocks[key][code];
            const item = items.find(i => i.code === code);
            
            if (item && stockData.added > 0) {
                // Use current time for recent activities, or date + time if available
                const activityDate = new Date();
                activities.push({
                    type: 'stock_added',
                    date: activityDate,
                    branch: branch,
                    message: `${stockData.added} ${item.name} added to ${branch}`,
                    alertClass: 'alert-info',
                    timestamp: activityDate.getTime()
                });
            }
            
            if (item && stockData.returned > 0) {
                const activityDate = new Date();
                activities.push({
                    type: 'return',
                    date: activityDate,
                    branch: branch,
                    message: `${stockData.returned} ${item.name} returned at ${branch}`,
                    alertClass: 'alert-warning',
                    timestamp: activityDate.getTime()
                });
            }
        });
    });
    
    // Add cash activities (always show entries; highlight discrepancies)
    cashEntries.forEach(entry => {
        // Filter by assigned branches
        if (shouldFilterByAssignedBranches && !assignedBranches.includes(entry.branch)) return;
        
        const activityDate = entry.timestamp ? new Date(entry.timestamp) : new Date(entry.date + 'T12:00:00');
        const name = entry.operatorName || (() => {
            const user = users.find(u => u.id === entry.operatorId || u.username === entry.operatorId);
            return user && user.fullName ? user.fullName : (entry.operatorId || 'Unknown');
        })();
        const isDiscrepancy = Math.abs(entry.difference || 0) > 0;
        activities.push({
            type: isDiscrepancy ? 'cash_discrepancy' : 'cash_entry',
            date: activityDate,
            branch: entry.branch,
            message: `${name} recorded cash for ${entry.branch}: Actual Rs ${Number(entry.actual||0).toFixed(2)} vs Expected Rs ${Number(entry.expected||0).toFixed(2)} (Diff Rs ${Number(entry.difference||0).toFixed(2)})`,
            alertClass: isDiscrepancy ? (entry.difference < 0 ? 'alert-danger' : 'alert-warning') : 'alert-success',
            timestamp: activityDate.getTime()
        });
    });
    
    // Add machine activities with proper timestamps
    machineBatches.forEach(batch => {
        // Filter by assigned branches
        if (shouldFilterByAssignedBranches && !assignedBranches.includes(batch.branch)) return;
        
        if (batch.status === 'completed') {
            const machine = items.find(i => i.code === batch.machineCode);
            if (machine) {
                const soldQty = batch.endValue - batch.startValue;
                // Use endTime if available, otherwise use current time
                const activityDate = batch.endTime ? new Date(batch.endTime) : new Date();
                activities.push({
                    type: 'machine_sale',
                    date: activityDate,
                    branch: batch.branch,
                    message: `${soldQty} ${machine.name} sales at ${batch.branch}`,
                    alertClass: 'alert-info',
                    timestamp: activityDate.getTime()
                });
            }
        }
    });
    
    // Add grocery sales activities
    grocerySales.forEach(sale => {
        // Filter by assigned branches
        if (shouldFilterByAssignedBranches && !assignedBranches.includes(sale.branch)) return;
        
        const activityDate = sale.timestamp ? new Date(sale.timestamp) : new Date(sale.date + 'T12:00:00');
        activities.push({
            type: 'grocery_sale',
            date: activityDate,
            branch: sale.branch,
            message: `${sale.soldQty} ${sale.itemName} sold at ${sale.branch}`,
            alertClass: 'alert-success',
            timestamp: activityDate.getTime()
        });
    });

    // Add grocery return activities
    const groceryReturns = JSON.parse(localStorage.getItem('groceryReturns')) || [];
    groceryReturns.forEach(ret => {
        // Filter by assigned branches
        if (shouldFilterByAssignedBranches && !assignedBranches.includes(ret.branch)) return;
        
        const activityDate = ret.timestamp ? new Date(ret.timestamp) : new Date(ret.date + 'T12:00:00');
        activities.push({
            type: 'grocery_return',
            date: activityDate,
            branch: ret.branch,
            message: `${ret.returnedQty} ${ret.itemName} returned (waste) at ${ret.branch}`,
            alertClass: 'alert-warning',
            timestamp: activityDate.getTime()
        });
    });
    
    // Add transfer activities
    transferHistory.forEach(transfer => {
        // Filter by assigned branches (show if sender OR receiver is assigned)
        const isSenderAssigned = shouldFilterByAssignedBranches ? assignedBranches.includes(transfer.senderBranch) : true;
        const isReceiverAssigned = shouldFilterByAssignedBranches ? assignedBranches.includes(transfer.receiverBranch) : true;
        if (shouldFilterByAssignedBranches && !isSenderAssigned && !isReceiverAssigned) return;
        
        const activityDate = transfer.processedAt ? new Date(transfer.processedAt) : new Date(transfer.date + 'T12:00:00');
        const itemNames = transfer.items.map(item => item.itemName).join(', ');
        activities.push({
            type: 'transfer',
            date: activityDate,
            branch: transfer.senderBranch,
            message: `Internal transfer: ${transfer.items.length} ${transfer.itemType.toLowerCase()} items (${itemNames}) from ${transfer.senderBranch} to ${transfer.receiverBranch}`,
            alertClass: 'alert-primary',
            timestamp: activityDate.getTime()
        });
    });
    
    // Sort activities by timestamp (newest first) and get top 5
    activities.sort((a, b) => b.timestamp - a.timestamp);
    const recentActivities = activities.slice(0, 5);
    
    // Display activities in table rows
    if (recentActivities.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center">No recent activity</td></tr>';
        return;
    }

    tableBody.innerHTML = recentActivities.map(activity => `
        <tr>
            <td>${new Date(activity.date).toLocaleString()}</td>
            <td>${activity.type.replace('_', ' ')}</td>
            <td>${activity.message}</td>
            <td>${activity.branch || '-'}</td>
        </tr>
    `).join('');
}

// Load Top Selling Items list
function loadTopSellingItems() {
    const container = document.getElementById('topItemsList');
    if (!container) return;

    const branch = document.getElementById('dashBranch')?.value;
    const dateFrom = document.getElementById('dateFrom')?.value;
    const dateTo = document.getElementById('dateTo')?.value;
    const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
    const items = JSON.parse(localStorage.getItem('items')) || [];
    const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};
    
    // Get user's assigned branches for filtering
    const assignedBranches = JSON.parse(localStorage.getItem('currentBranches') || '[]');
    const role = localStorage.getItem('role');
    const shouldFilterByAssignedBranches = role !== 'admin' && assignedBranches.length > 0;

    const salesByItemCode = {};
    
    // Process normal items (only finished batches)
    Object.keys(stocks).forEach(key => {
        const [date, stockBranch] = key.split('_');
        const batchKey = `${date}_${stockBranch}`;
        const isFinished = !!finishedBatches[batchKey];
        
        const branchMatches = branch ? stockBranch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(stockBranch) : true);
        
        if (
            (!dateFrom || date >= dateFrom) &&
            (!dateTo || date <= dateTo) &&
            branchMatches &&
            isFinished  // Only include finished batches
        ) {
            Object.keys(stocks[key]).forEach(code => {
                const item = items.find(i => i.code === code);
                if (!item || item.itemType !== 'Normal Item') return;
                const entry = stocks[key][code];
                // Always recalculate from scratch
                const soldQty = Math.max(0, (entry.added || 0) - (entry.returned || 0) - (entry.transferred || 0));
                if (!salesByItemCode[code]) salesByItemCode[code] = { name: item.name, qty: 0, value: 0 };
                salesByItemCode[code].qty += soldQty || 0;
                salesByItemCode[code].value += (soldQty || 0) * (item.price || 0);
            });
        }
    });
    
    // Process grocery sales
    const grocerySales = JSON.parse(localStorage.getItem('grocerySales')) || [];
    grocerySales.forEach(sale => {
        const branchMatches = branch ? sale.branch === branch : (shouldFilterByAssignedBranches ? assignedBranches.includes(sale.branch) : true);
        
        if (
            (!dateFrom || sale.date >= dateFrom) &&
            (!dateTo || sale.date <= dateTo) &&
            branchMatches
        ) {
            if (!salesByItemCode[sale.itemCode]) {
                const item = items.find(i => i.code === sale.itemCode);
                salesByItemCode[sale.itemCode] = { 
                    name: item ? item.name : sale.itemName, 
                    qty: 0, 
                    value: 0 
                };
            }
            salesByItemCode[sale.itemCode].qty += sale.soldQty || 0;
            salesByItemCode[sale.itemCode].value += sale.totalCash || 0;
        }
    });

    // Build list of top 5 by quantity sold
    const top = Object.entries(salesByItemCode)
        .map(([code, v]) => ({ code, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

    if (top.length === 0) {
        container.innerHTML = '<div class="text-muted">No sales data</div>';
        return;
    }

    container.innerHTML = top.map(t => `
        <div class="d-flex justify-content-between border-bottom py-1">
            <span>${t.name} (${t.qty})</span>
            <strong>Rs ${t.value.toFixed(2)}</strong>
        </div>
    `).join('');
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('dashboard.html')) {
        // Set both date pickers to today's date
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        if (document.getElementById('dateTo')) {
            document.getElementById('dateTo').value = todayStr;
        }
        if (document.getElementById('dateFrom')) {
            document.getElementById('dateFrom').value = todayStr;
        }
        
        // Check if user has limited branch access
        const assignedBranches = JSON.parse(localStorage.getItem('currentBranches') || '[]');
        const role = localStorage.getItem('role');
        
        // If user has specific branch assignments (and not admin), auto-select first branch
        if (assignedBranches.length > 0 && role !== 'admin') {
            const dashBranch = document.getElementById('dashBranch');
            if (dashBranch && !dashBranch.value) {
                dashBranch.value = assignedBranches[0];
            }
        }
        
        // Load dashboard data
        loadDashboard();
        
        // Add event listeners
        const dashBranch = document.getElementById('dashBranch');
        const dateFromElem = document.getElementById('dateFrom');
        const dateToElem = document.getElementById('dateTo');
        
        if (dashBranch) dashBranch.addEventListener('change', loadDashboard);
        if (dateFromElem) dateFromElem.addEventListener('change', loadDashboard);
        if (dateToElem) dateToElem.addEventListener('change', loadDashboard);
    }
});