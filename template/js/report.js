// reports.js - Reports functionality

// Format date to display only date part (YYYY-MM-DD)
function formatDateOnly(dateString) {
  if (!dateString) return '';
  
  // If it's already in YYYY-MM-DD format, return as is
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  
  // If it's an ISO string with time, extract just the date part
  if (typeof dateString === 'string' && dateString.includes('T')) {
    return dateString.split('T')[0];
  }
  
  // Try to parse as Date and format
  try {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (error) {
    // If parsing fails, return original
  }
  
  return dateString;
}

// Generate financial report
function generateReport() {
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  const branch = document.getElementById('reportBranch').value;
  const type = document.getElementById('reportType')?.value || 'item';
  const itemFilter = document.getElementById('reportItem')?.value || '';
  const itemTypeFilter = document.getElementById('reportItemType')?.value || '';
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const grocerySales = JSON.parse(localStorage.getItem('grocerySales')) || [];
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const machineSales = JSON.parse(localStorage.getItem('machineSales')) || [];
  const groceryReturns = JSON.parse(localStorage.getItem('groceryReturns')) || [];
  const cashEntries = JSON.parse(localStorage.getItem('cashEntries')) || [];
  const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};
  
  let tableBody = '';
  let tableHead = '';
  let totalRevenue = 0;
  
  if (type === 'item' || type === 'type' || type === 'branch') {
    tableHead = `
      <tr>
        <th>Date</th>
        <th>Branch</th>
        <th>${type==='branch'?'Group':'Item Name'}</th>
        <th>Type</th>
        <th>Returned</th>
        <th>Sold</th>
        <th>Sales (Rs.)</th>
      </tr>`;

    // Normal items (only show finished batches)
    Object.keys(stocks).forEach(key => {
        const [date, stockBranch] = key.split('_');
        const batchKey = `${date}_${stockBranch}`;
        const isFinished = !!finishedBatches[batchKey];
        
        if (
            (!dateFrom || date >= dateFrom) &&
            (!dateTo || date <= dateTo) &&
            (branch === 'All Branches' || stockBranch === branch) &&
            isFinished  // Only include finished batches
        ) {
            Object.keys(stocks[key]).forEach(code => {
                const item = items.find(i => i.code === code && i.itemType === 'Normal Item');
                if (item) {
                    if (itemFilter && item.name !== itemFilter) return;
                    if (itemTypeFilter && item.itemType !== itemTypeFilter) return;
                    const entry = stocks[key][code];
                    // Always recalculate from scratch to ensure accuracy (accounting for transfers)
                    const soldQty = Math.max(0, (entry.added || 0) - (entry.returned || 0) - (entry.transferred || 0));
                    const revenue = (soldQty || 0) * (item.price || 0);
                    if (type === 'item' && (soldQty || 0) <= 0) return; // Hide zero-sold items in item-wise view
                    totalRevenue += revenue;
                    const groupLabel = type==='branch' ? stockBranch : item.name;
                    tableBody += `
                        <tr>
                            <td>${date}</td>
                            <td>${stockBranch}</td>
                            <td>${groupLabel}</td>
                            <td>Normal Item</td>
                            <td>${entry.returned || 0}</td>
                            <td>${soldQty || 0}</td>
                            <td>Rs ${Number(revenue).toFixed(2)}</td>
                        </tr>
                    `;
                }
            });
        }
    });

    // Grocery items (aggregate per date-branch-item): show Added from groceryStocks, Returned from groceryReturns, and Sold from grocerySales
    const groceryAgg = {};
    // Aggregate sales
    grocerySales.forEach(sale => {
      if (
        (!dateFrom || sale.date >= dateFrom) &&
        (!dateTo || sale.date <= dateTo) &&
        (branch === 'All Branches' || sale.branch === branch)
      ) {
        const normalizedDate = formatDateOnly(sale.date);
        const key = `${normalizedDate}|${sale.branch}|${sale.itemCode}`;
        if (!groceryAgg[key]) {
          groceryAgg[key] = { date: normalizedDate, branch: sale.branch, itemCode: sale.itemCode, itemName: sale.itemName, soldQty: 0, revenue: 0, addedQty: 0 };
        }
        groceryAgg[key].soldQty += Number(sale.soldQty || 0);
        groceryAgg[key].revenue += Number(sale.totalCash || 0);
      }
    });
    // Aggregate added from stocks
    groceryStocks.forEach(stock => {
      if (
        (!dateFrom || stock.date >= dateFrom) &&
        (!dateTo || stock.date <= dateTo) &&
        (branch === 'All Branches' || stock.branch === branch)
      ) {
        const normalizedDate = formatDateOnly(stock.date);
        const key = `${normalizedDate}|${stock.branch}|${stock.itemCode}`;
        if (!groceryAgg[key]) {
          const item = items.find(i => i.code === stock.itemCode);
          groceryAgg[key] = { date: normalizedDate, branch: stock.branch, itemCode: stock.itemCode, itemName: item ? item.name : stock.itemCode, soldQty: 0, revenue: 0, addedQty: 0 };
        }
        groceryAgg[key].addedQty += Number(stock.quantity || 0);
      }
    });
    // Aggregate returns
    groceryReturns.forEach(ret => {
      if (
        (!dateFrom || ret.date >= dateFrom) &&
        (!dateTo || ret.date <= dateTo) &&
        (branch === 'All Branches' || ret.branch === branch)
      ) {
        const normalizedDate = formatDateOnly(ret.date);
        const key = `${normalizedDate}|${ret.branch}|${ret.itemCode}`;
        if (!groceryAgg[key]) {
          const item = items.find(i => i.code === ret.itemCode);
          groceryAgg[key] = { date: normalizedDate, branch: ret.branch, itemCode: ret.itemCode, itemName: item ? item.name : ret.itemName || ret.itemCode, soldQty: 0, revenue: 0, addedQty: 0, returnedQty: 0 };
        }
        groceryAgg[key].returnedQty = (groceryAgg[key].returnedQty || 0) + Number(ret.returnedQty || 0);
      }
    });

    // Render grocery rows
    Object.values(groceryAgg).forEach(row => {
      const item = items.find(i => i.code === row.itemCode);
      if (itemFilter && item && item.name !== itemFilter) return;
      if (itemTypeFilter && 'Grocery Item' !== itemTypeFilter) return;
      if (type === 'item' && (row.soldQty || 0) <= 0) return; // Hide zero-sold items in item-wise view
      totalRevenue += Number(row.revenue || 0);
      const label = type==='branch' ? row.branch : (row.itemName + ' (Grocery)');
      tableBody += `
        <tr class="table-success">
          <td>${formatDateOnly(row.date)}</td>
          <td>${row.branch}</td>
          <td>${label}</td>
          <td>Grocery Item</td>
          <td>${row.returnedQty || 0}</td>
          <td>${row.soldQty || 0}</td>
          <td>Rs ${Number(row.revenue || 0).toFixed(2)}</td>
        </tr>
      `;
    });

    // Machine items (sales)
    machineSales.forEach(sale => {
        if (
            (!dateFrom || sale.date >= dateFrom) &&
            (!dateTo || sale.date <= dateTo) &&
            (branch === 'All Branches' || sale.branch === branch)
        ) {
            if (itemFilter && sale.machineName !== itemFilter) return;
            if (itemTypeFilter && 'Machine' !== itemTypeFilter) return;
            const revenue = sale.totalCash || 0;
            if (type === 'item' && (sale.soldQty || 0) <= 0) return; // Typically machine aggregated by item name; hide if zero
            totalRevenue += revenue;
            const label = type==='branch' ? sale.branch : (sale.machineName + ' (Machine)');
            tableBody += `
                <tr class="table-warning">
                    <td>${sale.date}</td>
                    <td>${sale.branch}</td>
                    <td>${label}</td>
                    <td>Machine</td>
                    <td>-</td>
                    <td>${sale.soldQty || 0}</td>
                    <td>Rs ${Number(revenue).toFixed(2)}</td>
                </tr>
            `;
        }
    });

    tableBody += `
        <tr style="font-weight: bold; background-color: #e9ecef;">
            <td colspan="6">Total Revenue</td>
            <td>Rs ${Number(totalRevenue).toFixed(2)}</td>
        </tr>
    `;
  } else if (type === 'returns') {
    tableHead = `
      <tr>
        <th>Item</th>
        <th>Type</th>
        <th>Total Waste Qty</th>
      </tr>`;
    // Aggregate returns by item (both normal items and grocery items)
    const wasteByItem = {};
    
    // Process normal item returns from stocks
    Object.keys(stocks).forEach(stockKey => {
      const [date, stockBranch] = stockKey.split('_');
      if (
        (!dateFrom || date >= dateFrom) &&
        (!dateTo || date <= dateTo) &&
        (branch === 'All Branches' || stockBranch === branch)
      ) {
        Object.keys(stocks[stockKey]).forEach(code => {
          const entry = stocks[stockKey][code];
          const item = items.find(i => i.code === code && i.itemType === 'Normal Item');
          if (item && entry.returned > 0) {
            if (itemFilter && item.name !== itemFilter) return;
            if (itemTypeFilter && 'Normal Item' !== itemTypeFilter) return;
            // Use item code + type as unique key
            const wasteKey = `${item.code}||Normal Item`;
            if (!wasteByItem[wasteKey]) {
              wasteByItem[wasteKey] = { name: item.name, type: 'Normal Item', qty: 0 };
            }
            wasteByItem[wasteKey].qty += entry.returned || 0;
          }
        });
      }
    });
    
    // Process grocery returns
    groceryReturns.forEach(ret => {
      if (
        (!dateFrom || ret.date >= dateFrom) &&
        (!dateTo || ret.date <= dateTo) &&
        (branch === 'All Branches' || ret.branch === branch)
      ) {
        if (itemFilter && ret.itemName !== itemFilter) return;
        if (itemTypeFilter && 'Grocery Item' !== itemTypeFilter) return;
        // Use item code + type as unique key
        const item = items.find(i => i.code === ret.itemCode);
        const wasteKey = item ? `${ret.itemCode}||Grocery Item` : `${ret.itemName}||Grocery Item`;
        if (!wasteByItem[wasteKey]) {
          wasteByItem[wasteKey] = { name: ret.itemName, type: 'Grocery Item', qty: 0 };
        }
        wasteByItem[wasteKey].qty += ret.returnedQty || 0;
      }
    });
    
    // Display aggregated returns
    Object.values(wasteByItem).forEach(waste => {
      tableBody += `
        <tr>
          <td>${waste.name}</td>
          <td>${waste.type}</td>
          <td>${waste.qty}</td>
        </tr>
      `;
    });
    
    if (!tableBody) {
      tableBody = '<tr><td colspan="3" class="text-center">No return data available.</td></tr>';
    }
  } else if (type === 'cash') {
    tableHead = `
      <tr>
        <th>Date</th>
        <th>Branch</th>
        <th>Expected (Rs.)</th>
        <th>Actual (Rs.)</th>
        <th>Difference (Rs.)</th>
        <th>Status</th>
        <th>Operator</th>
      </tr>`;
    cashEntries.forEach(e => {
      if (
        (!dateFrom || e.date >= dateFrom) &&
        (!dateTo || e.date <= dateTo) &&
        (branch === 'All Branches' || e.branch === branch)
      ) {
        tableBody += `
          <tr>
            <td>${e.date}</td>
            <td>${e.branch}</td>
            <td>Rs ${Number(e.expected||0).toFixed(2)}</td>
            <td>Rs ${Number(e.actual||0).toFixed(2)}</td>
            <td class="${(e.difference||0)<0?'text-danger':'text-success'}">Rs ${Number(e.difference||0).toFixed(2)}</td>
            <td>${e.status}</td>
            <td>${e.operatorName || e.operatorId || '-'}</td>
          </tr>
        `;
      }
    });
  }
  else if (type === 'addedItems') {
    tableHead = `
      <tr>
        <th>Date</th>
        <th>Branch</th>
        <th>Item Name</th>
        <th>Type</th>
        <th>Added</th>
        <th>Returned</th>
        <th>Transferred</th>
        <th>Available</th>
      </tr>`;

    // Normal Items
    Object.keys(stocks).forEach(key => {
      const [date, stockBranch] = key.split('_');
      if (
        (!dateFrom || date >= dateFrom) &&
        (!dateTo || date <= dateTo) &&
        (branch === 'All Branches' || stockBranch === branch)
      ) {
        Object.keys(stocks[key]).forEach(code => {
          const item = items.find(i => i.code === code && i.itemType === 'Normal Item');
          if (!item) return;
          if (itemFilter && item.name !== itemFilter) return;
          if (itemTypeFilter && item.itemType !== itemTypeFilter) return;
          const entry = stocks[key][code] || {};
          const added = Number(entry.added || 0);
          const returned = Number(entry.returned || 0);
          const transferred = Number(entry.transferred || 0);
          const available = Math.max(0, added - returned - transferred);
          if (added > 0 || returned > 0 || transferred > 0 || available > 0) {
            tableBody += `
              <tr>
                <td>${date}</td>
                <td>${stockBranch}</td>
                <td>${item.name}</td>
                <td>Normal Item</td>
                <td>${added}</td>
                <td>${returned}</td>
                <td>${transferred}</td>
                <td>${available}</td>
              </tr>
            `;
          }
        });
      }
    });

    // Grocery Items - include ALL grocery stock additions
    const groceryAgg = {};
    // Start with added batches - ensure all stocks are included
    (groceryStocks || []).forEach(s => {
      // Use addedDate first (when stock was added), fallback to date
      let stockDate = s.addedDate || s.date || '';
      // Normalize date format (remove time if present)
      if (stockDate && stockDate.includes('T')) {
        stockDate = stockDate.split('T')[0];
      }
      // If date is still missing, use createdAt or current date
      if (!stockDate) {
        if (s.createdAt) {
          const createdDate = new Date(s.createdAt);
          stockDate = createdDate.toISOString().split('T')[0];
        } else {
          stockDate = new Date().toISOString().split('T')[0];
        }
      }
      
      // Filter by date range - check both date and addedDate
      const dateMatches = (!dateFrom || stockDate >= dateFrom) && (!dateTo || stockDate <= dateTo);
      const branchMatches = (branch === 'All Branches' || s.branch === branch);
      
      if (dateMatches && branchMatches) {
        const keyAgg = `${stockDate}|${s.branch}|${s.itemCode}`;
        if (!groceryAgg[keyAgg]) {
          groceryAgg[keyAgg] = { 
            date: stockDate, 
            branch: s.branch, 
            itemCode: s.itemCode, 
            added: 0, 
            returned: 0, 
            transferred: 0 
          };
        }
        // Add the quantity (original added quantity) to the aggregation
        groceryAgg[keyAgg].added += Number(s.quantity || 0);
      }
    });
    // Returns
    (groceryReturns || []).forEach(r => {
      if (
        (!dateFrom || r.date >= dateFrom) &&
        (!dateTo || r.date <= dateTo) &&
        (branch === 'All Branches' || r.branch === branch)
      ) {
        const normalizedDate = formatDateOnly(r.date);
        const keyAgg = `${normalizedDate}|${r.branch}|${r.itemCode}`;
        if (!groceryAgg[keyAgg]) groceryAgg[keyAgg] = { date: normalizedDate, branch: r.branch, itemCode: r.itemCode, added: 0, returned: 0, transferred: 0 };
        groceryAgg[keyAgg].returned += Number(r.returnedQty || 0);
      }
    });
    // Transfers: infer from transferHistory for grocery item type
    const transferHistory = JSON.parse(localStorage.getItem('transferHistory')) || [];
    transferHistory.forEach(t => {
      if (t.itemType !== 'Grocery Item') return;
      if (
        (!dateFrom || t.date >= dateFrom) &&
        (!dateTo || t.date <= dateTo) &&
        (branch === 'All Branches' || t.senderBranch === branch || t.receiverBranch === branch)
      ) {
        t.items.forEach(it => {
          // As addedItems is per date-branch, count transfers as negative at sender and positive at receiver
          const normalizedDate = formatDateOnly(t.date);
          const senderKey = `${normalizedDate}|${t.senderBranch}|${it.itemCode}`;
          if (!groceryAgg[senderKey]) groceryAgg[senderKey] = { date: normalizedDate, branch: t.senderBranch, itemCode: it.itemCode, added: 0, returned: 0, transferred: 0 };
          groceryAgg[senderKey].transferred += Number(it.quantity || 0);

          const receiverKey = `${normalizedDate}|${t.receiverBranch}|${it.itemCode}`;
          if (!groceryAgg[receiverKey]) groceryAgg[receiverKey] = { date: normalizedDate, branch: t.receiverBranch, itemCode: it.itemCode, added: 0, returned: 0, transferred: 0 };
          // For receiver, reflect as added stock
          groceryAgg[receiverKey].added += Number(it.quantity || 0);
        });
      }
    });

    // Process grocery aggregated data - show ALL rows where added > 0 (even if no returns/transfers)
    Object.values(groceryAgg).forEach(row => {
      const item = items.find(i => i.code === row.itemCode && i.itemType === 'Grocery Item');
      if (!item) return;
      if (itemFilter && item.name !== itemFilter) return;
      if (itemTypeFilter && 'Grocery Item' !== itemTypeFilter) return;
      
      // Show if any activity (added, returned, transferred, or calculated available)
      // IMPORTANT: Include all rows where added > 0, even if no returns or transfers
      const hasActivity = (row.added || 0) > 0 || (row.returned || 0) > 0 || (row.transferred || 0) > 0;
      if (!hasActivity) return;
      
      // Calculate available quantity from current grocery stocks
      const availableBatches = (groceryStocks || []).filter(s => s.itemCode === row.itemCode && s.branch === row.branch);
      const availableQty = availableBatches.reduce((sum, s) => sum + parseFloat(s.remaining || s.quantity || 0), 0);
      const calculatedAvailable = Math.max(0, (row.added || 0) - (row.returned || 0) - (row.transferred || 0));
      
      // Use actual available quantity if available, otherwise use calculated
      const available = availableQty > 0 ? availableQty : calculatedAvailable;
      
      const addedDisplay = item.soldByWeight ? Number(row.added || 0).toFixed(3) : Math.round(row.added || 0);
      const returnedDisplay = item.soldByWeight ? Number(row.returned || 0).toFixed(3) : Math.round(row.returned || 0);
      const transferredDisplay = item.soldByWeight ? Number(row.transferred || 0).toFixed(3) : Math.round(row.transferred || 0);
      const availableDisplay = item.soldByWeight ? Number(available).toFixed(3) : Math.round(available);
      
      tableBody += `
        <tr class="table-success">
          <td>${formatDateOnly(row.date)}</td>
          <td>${row.branch}</td>
          <td>${item.name} (Grocery)</td>
          <td>Grocery Item</td>
          <td>${addedDisplay}</td>
          <td>${returnedDisplay}</td>
          <td>${transferredDisplay}</td>
          <td>${availableDisplay}</td>
        </tr>
      `;
    });

    if (!tableBody) {
      tableBody = '<tr><td colspan="8" class="text-center">No added items data available.</td></tr>';
    }
  }
  else if (type === 'zeroAdded') {
    tableHead = `
      <tr>
        <th>Date</th>
        <th>Branch</th>
        <th>Item Name</th>
        <th>Type</th>
        <th>Added</th>
      </tr>`;

    const itemsAll = (items || []).filter(i => i.itemType === 'Normal Item' || i.itemType === 'Grocery Item');
    const branches = JSON.parse(localStorage.getItem('branches')) || [];

    // Helper to iterate dates
    function* dateRange(start, end) {
      const cur = new Date(start);
      const last = new Date(end);
      while (cur <= last) {
        yield cur.toISOString().split('T')[0];
        cur.setDate(cur.getDate() + 1);
      }
    }

    const targetBranches = (branch === 'All Branches') ? branches.map(b => b.name) : [branch];

    for (const b of targetBranches) {
      if (!b) continue;
      for (const d of dateRange(dateFrom || '1970-01-01', dateTo || new Date().toISOString().split('T')[0])) {
        const key = `${d}_${b}`;
        const stockForDay = stocks[key] || {};
        const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
        
        itemsAll.forEach(it => {
          if (itemFilter && it.name !== itemFilter) return;
          if (itemTypeFilter && it.itemType !== itemTypeFilter) return;

          let addedQty = 0;
          
          if (it.itemType === 'Normal Item') {
            // Check Stocks for this date/branch/itemCode
            const entry = stockForDay[it.code];
            addedQty = Number(entry?.added || 0);
          } else if (it.itemType === 'Grocery Item') {
            // Check GroceryStocks - sum all quantities for this date/branch/itemCode
            // Use addedDate first, then date field
            const stocksForDate = groceryStocks.filter(s => {
              if (s.itemCode !== it.code || s.branch !== b) return false;
              
              // Normalize date comparison
              let stockDate = s.addedDate || s.date || '';
              if (stockDate && stockDate.includes('T')) {
                stockDate = stockDate.split('T')[0];
              }
              
              return stockDate === d;
            });
            
            addedQty = stocksForDate.reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0);
          }

          // If added quantity is 0, include in report
          if (addedQty === 0) {
            tableBody += `
              <tr>
                <td>${d}</td>
                <td>${b}</td>
                <td>${it.name}</td>
                <td>${it.itemType}</td>
                <td>0</td>
              </tr>
            `;
          }
        });
      }
    }
    
    if (!tableBody) {
      tableBody = '<tr><td colspan="5" class="text-center">No zero added items found for the selected criteria.</td></tr>';
    }
  }
  else if (type === 'transfer') {
    tableHead = `
      <tr>
        <th>Date</th>
        <th>From Branch</th>
        <th>To Branch</th>
        <th>Item Type</th>
        <th>Items Transferred</th>
        <th>Total Quantity</th>
        <th>Processed By</th>
      </tr>`;
    
    const transferHistory = JSON.parse(localStorage.getItem('transferHistory')) || [];
    
    transferHistory.forEach(transfer => {
      if (
        (!dateFrom || transfer.date >= dateFrom) &&
        (!dateTo || transfer.date <= dateTo) &&
        (branch === 'All Branches' || transfer.senderBranch === branch || transfer.receiverBranch === branch)
      ) {
        if (itemTypeFilter && transfer.itemType !== itemTypeFilter) return;
        
        const itemNames = transfer.items.map(item => {
          const qty = item.soldByWeight ? Number(item.quantity).toFixed(3) : Math.trunc(item.quantity);
          return `${item.itemName} (${qty})`;
        }).join(', ');
        
        const totalQty = transfer.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const totalQtyDisplay = transfer.itemType === 'Grocery Item' && transfer.items[0]?.soldByWeight 
          ? Number(totalQty).toFixed(3) 
          : Math.trunc(totalQty);
        
        const users = JSON.parse(localStorage.getItem('users')) || [];
        let processedBy = transfer.processedBy || 'Unknown';
        if (transfer.processedBy) {
          const user = users.find(u => u.id === transfer.processedBy || u.username === transfer.processedBy);
          if (user && user.fullName) processedBy = user.fullName;
          else if (transfer.processedBy === 'admin') processedBy = 'Administrator';
          else if (transfer.processedBy === 'operator' && !user) processedBy = 'Operator';
        }
        
        tableBody += `
          <tr>
            <td>${transfer.date}</td>
            <td>${transfer.senderBranch}</td>
            <td>${transfer.receiverBranch}</td>
            <td>${transfer.itemType}</td>
            <td>${itemNames}</td>
            <td>${totalQtyDisplay}</td>
            <td>${processedBy}</td>
          </tr>
        `;
      }
    });
    
    if (!tableBody) {
      tableBody = '<tr><td colspan="7" class="text-center">No transfer data available.</td></tr>';
    }
  }
  
  // Remove second duplicate revenue summary rows outside the main type branches
  
  if (document.getElementById('reportTableBody')) {
      const headEl = document.getElementById('reportTableHead');
      if (headEl) headEl.innerHTML = tableHead;
      document.getElementById('reportTableBody').innerHTML = tableBody || '<tr><td colspan="7">No data available.</td></tr>';
  }
}

// Export financial report to CSV
function exportExcel() {
  const table = document.getElementById('reportTable');
  const wb = XLSX.utils.table_to_book(table, { sheet: 'Report' });
  XLSX.writeFile(wb, `report_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'pt', 'a4');
  doc.text('Report', 40, 40);
  const head = [Array.from(document.querySelectorAll('#reportTableHead th')).map(th => th.textContent)];
  const body = Array.from(document.querySelectorAll('#reportTableBody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent));
  doc.autoTable({ head, body, startY: 60, styles: { fontSize: 8 } });
  doc.save(`report_${new Date().toISOString().slice(0,10)}.pdf`);
}

// Initialize reports page
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('reports.html')) {
      // Set default date range (last 7 days)
      const dateTo = new Date();
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 7);
      
      if (document.getElementById('dateTo')) {
          document.getElementById('dateTo').value = dateTo.toISOString().split('T')[0];
      }
      if (document.getElementById('dateFrom')) {
          document.getElementById('dateFrom').value = dateFrom.toISOString().split('T')[0];
      }
      
      // Populate items dropdown
      const items = JSON.parse(localStorage.getItem('items')||'[]');
      const itemSelect = document.getElementById('reportItem');
      if (itemSelect) {
        itemSelect.innerHTML = '<option value="">All Items</option>' + items.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
      }
      generateReport();
      
      // Add event listeners
      const dateFromElem = document.getElementById('dateFrom');
      const dateToElem = document.getElementById('dateTo');
      const reportBranch = document.getElementById('reportBranch');
      const reportType = document.getElementById('reportType');
      const reportItem = document.getElementById('reportItem');
      const reportItemType = document.getElementById('reportItemType');
      
      if (dateFromElem) dateFromElem.addEventListener('change', generateReport);
      if (dateToElem) dateToElem.addEventListener('change', generateReport);
      if (reportBranch) reportBranch.addEventListener('change', generateReport);
      if (reportType) reportType.addEventListener('change', generateReport);
      if (reportItem) reportItem.addEventListener('change', generateReport);
      if (reportItemType) reportItemType.addEventListener('change', generateReport);
  }
});