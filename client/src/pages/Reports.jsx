import { useState, useEffect } from 'react';
import { reportsAPI, branchesAPI, itemsAPI, cashAPI, transfersAPI, stocksAPI, groceryAPI, machinesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [tableHead, setTableHead] = useState([]);
  const [tableBody, setTableBody] = useState([]);
  
  // Filter states
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [filterBranch, setFilterBranch] = useState('All Branches');
  const [reportType, setReportType] = useState('item');
  const [itemFilter, setItemFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');
  
  // Data states
  const [branches, setBranches] = useState([]);
  const [items, setItems] = useState([]);

  const isAdmin = user?.role === 'admin';

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
      generateReport();
    }
  }, [dateFrom, dateTo, filterBranch, reportType, itemFilter, itemTypeFilter, branches, items]);

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
      console.error('Load initial data error:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!dateFrom || !dateTo) {
      setTableHead([]);
      setTableBody([{ cells: ['Please select date range'], colSpan: 7 }]);
      return;
    }

    try {
      setLoading(true);
      
      // Generate report based on type
      if (reportType === 'item' || reportType === 'type' || reportType === 'branch') {
        await generateSalesReport();
      } else if (reportType === 'returns') {
        await generateReturnsReport();
      } else if (reportType === 'cash') {
        await generateCashReport();
      } else if (reportType === 'addedItems') {
        await generateAddedItemsReport();
      } else if (reportType === 'zeroAdded') {
        await generateZeroAddedReport();
      } else if (reportType === 'transfer') {
        await generateTransferReport();
      }
    } catch (error) {
      console.error('Generate report error:', error);
      alert('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const generateSalesReport = async () => {
    const head = ['Date', 'Branch', reportType === 'branch' ? 'Group' : 'Item Name', 'Type', 'Returned', 'Sold', 'Sales (Rs.)'];
    setTableHead(head);
    
    const body = [];
    let totalRevenue = 0;

    // Get normal item stocks - fetch date by date (API limitation)
    if (filterBranch === 'All Branches' || filterBranch) {
      const branchesToFetch = filterBranch === 'All Branches' 
        ? getAvailableBranches().map(b => b.name)
        : [filterBranch];

      const dates = getDateRange(dateFrom, dateTo);
      
      for (const branch of branchesToFetch) {
        if (!branch) continue;
        for (const date of dates) {
          try {
            const stockRes = await stocksAPI.get({ date, branch });
            if (stockRes.data.success && stockRes.data.isFinished) {
              const normalItems = items.filter(i => i.itemType === 'Normal Item');
              for (const stock of stockRes.data.stocks || []) {
                const item = normalItems.find(i => i.code === stock.itemCode);
                if (!item) continue;
                
                if (itemFilter && item.name !== itemFilter) continue;
                if (itemTypeFilter && item.itemType !== itemTypeFilter) continue;
                
                const soldQty = Math.max(0, (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0));
                if (reportType === 'item' && soldQty <= 0) continue;
                
                const revenue = soldQty * (item.price || 0);
                totalRevenue += revenue;
                
                const groupLabel = reportType === 'branch' ? branch : item.name;
                body.push([
                  date,
                  branch,
                  groupLabel,
                  'Normal Item',
                  stock.returned || 0,
                  soldQty,
                  `Rs ${revenue.toFixed(2)}`
                ]);
              }
            }
          } catch (err) {
            // Skip if no data for this date/branch
          }
        }
      }
    }

    // Get grocery sales
    try {
      const params = { dateFrom, dateTo };
      if (filterBranch !== 'All Branches') {
        params.branch = filterBranch;
      }
      const grocerySalesRes = await groceryAPI.getSales(params);
      
      if (grocerySalesRes.data.success) {
        for (const sale of grocerySalesRes.data.sales || []) {
          const saleDate = sale.date ? (typeof sale.date === 'string' ? sale.date : sale.date.toISOString().split('T')[0]) : '';
          if (itemFilter && sale.itemName !== itemFilter) continue;
          if (itemTypeFilter && 'Grocery Item' !== itemTypeFilter) continue;
          if (reportType === 'item' && (sale.soldQty || 0) <= 0) continue;
          
          const revenue = parseFloat(sale.totalCash || 0);
          totalRevenue += revenue;
          const label = reportType === 'branch' ? sale.branch : (sale.itemName + ' (Grocery)');
          
          body.push([
            saleDate,
            sale.branch,
            label,
            'Grocery Item',
            0, // Returns handled separately
            sale.soldQty || 0,
            `Rs ${revenue.toFixed(2)}`
          ]);
        }
      }
    } catch (error) {
      console.error('Error fetching grocery sales:', error);
    }

    // Get machine sales
    try {
      const params = { dateFrom, dateTo };
      if (filterBranch !== 'All Branches') {
        params.branch = filterBranch;
      }
      const machineSalesRes = await machinesAPI.getSales(params);
      
      if (machineSalesRes.data.success) {
        for (const sale of machineSalesRes.data.sales || []) {
          const saleDate = sale.date ? (typeof sale.date === 'string' ? sale.date : sale.date.toISOString().split('T')[0]) : '';
          if (itemFilter && sale.machineName !== itemFilter) continue;
          if (itemTypeFilter && 'Machine' !== itemTypeFilter) continue;
          if (reportType === 'item' && (sale.soldQty || 0) <= 0) continue;
          
          const revenue = parseFloat(sale.totalCash || 0);
          totalRevenue += revenue;
          const label = reportType === 'branch' ? sale.branch : (sale.machineName + ' (Machine)');
          
          body.push([
            saleDate,
            sale.branch,
            label,
            'Machine',
            '-',
            sale.soldQty || 0,
            `Rs ${revenue.toFixed(2)}`
          ]);
        }
      }
    } catch (error) {
      console.error('Error fetching machine sales:', error);
    }

    // Add total row
    body.push({
      isTotal: true,
      cells: ['', '', '', '', '', 'Total Revenue', `Rs ${totalRevenue.toFixed(2)}`]
    });

    setTableBody(body);
  };

  const generateReturnsReport = async () => {
    const head = ['Item', 'Type', 'Total Waste Qty'];
    setTableHead(head);
    
    const body = [];
    const wasteByItem = {};

    // Process normal item returns from stocks
    if (filterBranch === 'All Branches' || filterBranch) {
      const branchesToFetch = filterBranch === 'All Branches' 
        ? getAvailableBranches().map(b => b.name)
        : [filterBranch];

      for (const branch of branchesToFetch) {
        if (!branch) continue;
        const dates = getDateRange(dateFrom, dateTo);
        for (const date of dates) {
          try {
            const stockRes = await stocksAPI.get({ date, branch });
            if (stockRes.data.success) {
              for (const stock of stockRes.data.stocks || []) {
                const item = items.find(i => i.code === stock.itemCode && i.itemType === 'Normal Item');
                if (!item || !stock.returned || stock.returned <= 0) continue;
                
                if (itemFilter && item.name !== itemFilter) continue;
                if (itemTypeFilter && 'Normal Item' !== itemTypeFilter) continue;
                
                const wasteKey = `${item.code}||Normal Item`;
                if (!wasteByItem[wasteKey]) {
                  wasteByItem[wasteKey] = { name: item.name, type: 'Normal Item', qty: 0 };
                }
                wasteByItem[wasteKey].qty += stock.returned || 0;
              }
            }
          } catch (err) {
            // Skip if no data
          }
        }
      }
    }

    // Process grocery returns
    try {
      const params = { dateFrom, dateTo };
      if (filterBranch !== 'All Branches') {
        params.branch = filterBranch;
      }
      const groceryReturnsRes = await groceryAPI.getReturns(params);
      
      if (groceryReturnsRes.data.success) {
        for (const ret of groceryReturnsRes.data.returns || []) {
          if (itemFilter && ret.itemName !== itemFilter) continue;
          if (itemTypeFilter && 'Grocery Item' !== itemTypeFilter) continue;
          
          const wasteKey = `${ret.itemCode}||Grocery Item`;
          if (!wasteByItem[wasteKey]) {
            wasteByItem[wasteKey] = { name: ret.itemName, type: 'Grocery Item', qty: 0 };
          }
          wasteByItem[wasteKey].qty += ret.returnedQty || 0;
        }
      }
    } catch (error) {
      console.error('Error fetching grocery returns:', error);
    }

    // Convert to table rows
    Object.values(wasteByItem).forEach(waste => {
      body.push([waste.name, waste.type, waste.qty]);
    });

    if (body.length === 0) {
      body.push({ cells: ['No return data available.'], colSpan: 3 });
    }

    setTableBody(body);
  };

  const generateCashReport = async () => {
    const head = ['Date', 'Branch', 'Expected (Rs.)', 'Actual (Rs.)', 'Difference (Rs.)', 'Status', 'Operator'];
    setTableHead(head);
    
    const body = [];

    try {
      const params = { dateFrom, dateTo };
      if (filterBranch !== 'All Branches') {
        params.branch = filterBranch;
      }
      
      const cashRes = await cashAPI.getEntries(params);
      if (cashRes.data.success) {
        for (const entry of cashRes.data.entries || []) {
          const entryDate = entry.date ? (typeof entry.date === 'string' ? entry.date : entry.date.toISOString().split('T')[0]) : '';
          body.push([
            entryDate,
            entry.branch,
            `Rs ${parseFloat(entry.expected || 0).toFixed(2)}`,
            `Rs ${parseFloat(entry.actual || 0).toFixed(2)}`,
            `Rs ${parseFloat(entry.difference || 0).toFixed(2)}`,
            entry.status,
            entry.operatorName || entry.operatorId || '-'
          ]);
        }
      }
    } catch (error) {
      console.error('Error fetching cash entries:', error);
    }

    if (body.length === 0) {
      body.push({ cells: ['No cash data available.'], colSpan: 7 });
    }

    setTableBody(body);
  };

  const generateAddedItemsReport = async () => {
    const head = ['Date', 'Branch', 'Item Name', 'Type', 'Added', 'Returned', 'Transferred', 'Available'];
    setTableHead(head);
    
    const body = [];

    try {
      // Normal Items - fetch stocks for date range
      if (filterBranch === 'All Branches' || filterBranch) {
        const branchesToFetch = filterBranch === 'All Branches' 
          ? getAvailableBranches().map(b => b.name)
          : [filterBranch];

        const dates = getDateRange(dateFrom, dateTo);
        
        for (const branch of branchesToFetch) {
          if (!branch) continue;
          for (const date of dates) {
            try {
              const stockRes = await stocksAPI.get({ date, branch });
              if (stockRes.data.success) {
                const normalItems = items.filter(i => i.itemType === 'Normal Item');
                for (const stock of stockRes.data.stocks || []) {
                  const item = normalItems.find(i => i.code === stock.itemCode);
                  if (!item) continue;
                  
                  if (itemFilter && item.name !== itemFilter) continue;
                  if (itemTypeFilter && item.itemType !== itemTypeFilter) continue;
                  
                  const added = stock.added || 0;
                  const returned = stock.returned || 0;
                  const transferred = stock.transferred || 0;
                  const available = Math.max(0, added - returned - transferred);
                  
                  // Show if any activity (added, returned, transferred, or available)
                  if (added > 0 || returned > 0 || transferred > 0 || available > 0) {
                    body.push([
                      date,
                      branch,
                      item.name,
                      'Normal Item',
                      added,
                      returned,
                      transferred,
                      available
                    ]);
                  }
                }
              }
            } catch (err) {
              // Skip if no data for this date/branch
            }
          }
        }
      }

      // Grocery Items - aggregate by date|branch|itemCode
      const groceryAgg = {};
      
      // Get grocery stocks (added)
      try {
        const branchesToFetch = filterBranch === 'All Branches' 
          ? getAvailableBranches().map(b => b.name)
          : [filterBranch];
        
        for (const branchName of branchesToFetch) {
          const groceryStocksRes = await groceryAPI.getStocks({ branch: branchName });
          if (groceryStocksRes.data.success) {
            for (const stock of groceryStocksRes.data.stocks || []) {
              const stockDate = stock.date || stock.addedDate || '';
              if (
                (!dateFrom || stockDate >= dateFrom) &&
                (!dateTo || stockDate <= dateTo)
              ) {
                const keyAgg = `${stockDate}|${stock.branch}|${stock.itemCode}`;
                if (!groceryAgg[keyAgg]) {
                  groceryAgg[keyAgg] = {
                    date: stockDate,
                    branch: stock.branch,
                    itemCode: stock.itemCode,
                    added: 0,
                    returned: 0,
                    transferred: 0
                  };
                }
                groceryAgg[keyAgg].added += parseFloat(stock.quantity || 0);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching grocery stocks:', error);
      }

      // Get grocery returns
      try {
        const params = { dateFrom, dateTo };
        if (filterBranch !== 'All Branches') {
          params.branch = filterBranch;
        }
        const groceryReturnsRes = await groceryAPI.getReturns(params);
        
        if (groceryReturnsRes.data.success) {
          for (const ret of groceryReturnsRes.data.returns || []) {
            const keyAgg = `${ret.date}|${ret.branch}|${ret.itemCode}`;
            if (!groceryAgg[keyAgg]) {
              groceryAgg[keyAgg] = {
                date: ret.date,
                branch: ret.branch,
                itemCode: ret.itemCode,
                added: 0,
                returned: 0,
                transferred: 0
              };
            }
            groceryAgg[keyAgg].returned += parseFloat(ret.returnedQty || 0);
          }
        }
      } catch (error) {
        console.error('Error fetching grocery returns:', error);
      }

      // Get transfers for grocery items (count as negative at sender, positive at receiver)
      try {
        const params = { dateFrom, dateTo };
        if (filterBranch !== 'All Branches') {
          params.branch = filterBranch;
        }
        const transfersRes = await transfersAPI.get(params);
        
        if (transfersRes.data.success) {
          for (const transfer of transfersRes.data.transfers || []) {
            if (transfer.itemType !== 'Grocery Item') continue;
            
            const shouldInclude = filterBranch === 'All Branches' 
              ? true
              : (transfer.senderBranch === filterBranch || transfer.receiverBranch === filterBranch);
            
            if (!shouldInclude) continue;
            
            const transferItems = Array.isArray(transfer.items) ? transfer.items : [];
            for (const item of transferItems) {
              // Sender: count as transferred (negative)
              const senderKey = `${transfer.date}|${transfer.senderBranch}|${item.itemCode}`;
              if (!groceryAgg[senderKey]) {
                groceryAgg[senderKey] = {
                  date: transfer.date,
                  branch: transfer.senderBranch,
                  itemCode: item.itemCode,
                  added: 0,
                  returned: 0,
                  transferred: 0
                };
              }
              groceryAgg[senderKey].transferred += parseFloat(item.quantity || 0);
              
              // Receiver: count as added (positive)
              const receiverKey = `${transfer.date}|${transfer.receiverBranch}|${item.itemCode}`;
              if (!groceryAgg[receiverKey]) {
                groceryAgg[receiverKey] = {
                  date: transfer.date,
                  branch: transfer.receiverBranch,
                  itemCode: item.itemCode,
                  added: 0,
                  returned: 0,
                  transferred: 0
                };
              }
              groceryAgg[receiverKey].added += parseFloat(item.quantity || 0);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching transfers:', error);
      }

      // Process grocery aggregated data
      for (const row of Object.values(groceryAgg)) {
        const item = items.find(i => i.code === row.itemCode && i.itemType === 'Grocery Item');
        if (!item) continue;
        
        if (itemFilter && item.name !== itemFilter) continue;
        if (itemTypeFilter && 'Grocery Item' !== itemTypeFilter) continue;
        
        // Get available quantity from current grocery stocks
        try {
          const groceryStocksRes = await groceryAPI.getStocks({ branch: row.branch, itemCode: row.itemCode });
          const availableBatches = groceryStocksRes.data.success ? (groceryStocksRes.data.stocks || []) : [];
          const availableQty = availableBatches.reduce((sum, s) => sum + parseFloat(s.remaining || s.quantity || 0), 0);
          
          const addedDisplay = item.soldByWeight ? Number(row.added || 0).toFixed(3) : Math.trunc(row.added || 0);
          const returnedDisplay = item.soldByWeight ? Number(row.returned || 0).toFixed(3) : Math.trunc(row.returned || 0);
          const transferredDisplay = item.soldByWeight ? Number(row.transferred || 0).toFixed(3) : Math.trunc(row.transferred || 0);
          const availableDisplay = item.soldByWeight ? Number(availableQty).toFixed(3) : Math.trunc(availableQty);
          
          body.push([
            row.date,
            row.branch,
            `${item.name} (Grocery)`,
            'Grocery Item',
            addedDisplay,
            returnedDisplay,
            transferredDisplay,
            availableDisplay
          ]);
        } catch (error) {
          // If can't fetch available, still show the row with calculated available
          const calculatedAvailable = Math.max(0, (row.added || 0) - (row.returned || 0) - (row.transferred || 0));
          const addedDisplay = item.soldByWeight ? Number(row.added || 0).toFixed(3) : Math.trunc(row.added || 0);
          const returnedDisplay = item.soldByWeight ? Number(row.returned || 0).toFixed(3) : Math.trunc(row.returned || 0);
          const transferredDisplay = item.soldByWeight ? Number(row.transferred || 0).toFixed(3) : Math.trunc(row.transferred || 0);
          const availableDisplay = item.soldByWeight ? Number(calculatedAvailable).toFixed(3) : Math.trunc(calculatedAvailable);
          
          body.push([
            row.date,
            row.branch,
            `${item.name} (Grocery)`,
            'Grocery Item',
            addedDisplay,
            returnedDisplay,
            transferredDisplay,
            availableDisplay
          ]);
        }
      }

    } catch (error) {
      console.error('Error generating added items report:', error);
      body.push({ cells: ['Error loading added items data.'], colSpan: 8 });
    }

    if (body.length === 0) {
      body.push({ cells: ['No added items data available.'], colSpan: 8 });
    }

    setTableBody(body);
  };

  const generateZeroAddedReport = async () => {
    const head = ['Date', 'Branch', 'Item Name', 'Type', 'Added'];
    setTableHead(head);
    
    const body = [];
    
    // This would need to check all items and branches for zero added quantities
    if (body.length === 0) {
      body.push({ cells: ['This report type requires additional data aggregation.'], colSpan: 5 });
    }

    setTableBody(body);
  };

  const generateTransferReport = async () => {
    const head = ['Date', 'From Branch', 'To Branch', 'Item Type', 'Items Transferred', 'Total Quantity', 'Processed By'];
    setTableHead(head);
    
    const body = [];

    try {
      const params = { dateFrom, dateTo };
      if (filterBranch !== 'All Branches') {
        params.branch = filterBranch;
      }
      
      const transfersRes = await transfersAPI.get(params);
      if (transfersRes.data.success) {
        for (const transfer of transfersRes.data.transfers || []) {
          if (itemTypeFilter && transfer.itemType !== itemTypeFilter) continue;
          
          // Ensure items is an array
          const transferItems = Array.isArray(transfer.items) ? transfer.items : [];
          
          if (transferItems.length === 0) {
            // If no items, still show the transfer but with a message
            const transferDate = transfer.date ? (typeof transfer.date === 'string' ? transfer.date : transfer.date.toISOString().split('T')[0]) : '';
            body.push([
              transferDate,
              transfer.senderBranch || '-',
              transfer.receiverBranch || '-',
              transfer.itemType || '-',
              'No items',
              0,
              transfer.processedBy || 'Unknown'
            ]);
            continue;
          }
          
          const transferDate = transfer.date ? (typeof transfer.date === 'string' ? transfer.date : transfer.date.toISOString().split('T')[0]) : '';
          
          // Build item names list with quantities
          const itemNamesList = transferItems.map(item => {
            // Get item name from transfer data or lookup from items list
            let itemName = item.itemName || item.name;
            if (!itemName && item.itemCode) {
              const foundItem = items.find(i => i.code === item.itemCode);
              itemName = foundItem ? foundItem.name : item.itemCode;
            }
            if (!itemName) {
              itemName = 'Unknown Item';
            }
            
            // Get quantity
            const quantity = item.quantity || item.qty || 0;
            
            // Determine if sold by weight (check item or lookup)
            let soldByWeight = item.soldByWeight;
            if (soldByWeight === undefined && item.itemCode) {
              const foundItem = items.find(i => i.code === item.itemCode);
              soldByWeight = foundItem ? foundItem.soldByWeight : false;
            }
            
            // Format quantity based on type
            const qtyDisplay = soldByWeight ? Number(quantity).toFixed(3) : Math.trunc(quantity);
            
            return `${itemName} (${qtyDisplay})`;
          });
          
          const itemNames = itemNamesList.join(', ');
          
          // Calculate total quantity
          const totalQty = transferItems.reduce((sum, item) => {
            const qty = item.quantity || item.qty || 0;
            return sum + parseFloat(qty);
          }, 0);
          
          // Determine if sold by weight for display format
          const isGrocery = transfer.itemType === 'Grocery Item';
          const firstItem = transferItems[0];
          let isSoldByWeight = false;
          if (firstItem) {
            isSoldByWeight = firstItem.soldByWeight;
            if (isSoldByWeight === undefined && firstItem.itemCode) {
              const foundItem = items.find(i => i.code === firstItem.itemCode);
              isSoldByWeight = foundItem ? foundItem.soldByWeight : false;
            }
          }
          
          const totalQtyDisplay = isGrocery && isSoldByWeight 
            ? Number(totalQty).toFixed(3) 
            : Math.trunc(totalQty);
          
          body.push([
            transferDate,
            transfer.senderBranch || '-',
            transfer.receiverBranch || '-',
            transfer.itemType || '-',
            itemNames || '-',
            totalQtyDisplay,
            transfer.processedBy || 'Unknown'
          ]);
        }
      }
    } catch (error) {
      console.error('Error fetching transfers:', error);
      body.push({ cells: ['Error loading transfer data.'], colSpan: 7 });
    }

    if (body.length === 0) {
      body.push({ cells: ['No transfer data available.'], colSpan: 7 });
    }

    setTableBody(body);
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

  const exportExcel = () => {
    const table = document.getElementById('reportTable');
    if (!table) return;
    
    const wb = XLSX.utils.table_to_book(table, { sheet: 'Report' });
    XLSX.writeFile(wb, `report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPDF = () => {
    if (!tableHead || tableHead.length === 0) {
      alert('No data to export. Please generate a report first.');
      return;
    }

    try {
      const doc = new jsPDF('l', 'pt', 'a4');
      
      // Report title
      const reportTitle = `Report - ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`;
      doc.setFontSize(16);
      doc.text(reportTitle, 40, 30);
      
      // Date range info
      doc.setFontSize(10);
      let currentY = 45;
      doc.text(`Period: ${dateFrom} to ${dateTo}`, 40, currentY);
      currentY += 10;
      if (filterBranch !== 'All Branches') {
        doc.text(`Branch: ${filterBranch}`, 40, currentY);
        currentY += 10;
      }
      
      // Process table body
      const head = tableHead;
      const body = [];
      
      tableBody.forEach(row => {
        if (row.isTotal) {
          // Total row - ensure it has correct length
          const totalRow = [...row.cells];
          while (totalRow.length < head.length) {
            totalRow.unshift('');
          }
          body.push(totalRow);
        } else if (row.colSpan) {
          // Message row - convert to single cell spanning all columns
          const messageRow = [row.cells];
          // Fill remaining cells with empty strings
          for (let i = 1; i < head.length; i++) {
            messageRow.push('');
          }
          body.push(messageRow);
        } else if (Array.isArray(row)) {
          // Regular row
          body.push(row);
        }
      });
      
      // Validate body data
      if (body.length === 0) {
        alert('No data to export in PDF.');
        return;
      }
      
      // Ensure all rows have the same length as headers
      const normalizedBody = body.map(row => {
        const normalizedRow = Array.isArray(row) ? [...row] : [String(row)];
        while (normalizedRow.length < head.length) {
          normalizedRow.push('');
        }
        return normalizedRow.slice(0, head.length);
      });
      
      // Generate PDF table - start below the header info
      const startY = currentY + 10;
      autoTable(doc, {
        head: [head],
        body: normalizedBody,
        startY: startY,
        styles: { 
          fontSize: 8,
          cellPadding: 3
        },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        margin: { top: 65, left: 40, right: 40 },
        tableWidth: 'auto'
      });
      
      // Save PDF
      const fileName = `report_${reportType}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please check the console for details.');
    }
  };

  const availableBranches = getAvailableBranches();

  if (loading && reportData.length === 0) {
    return <div className="text-center p-5">Loading...</div>;
  }

  return (
    <div className="container-fluid p-4">
      <h2 className="mb-4">Reports</h2>
      
      {/* Filter Section */}
      <div className="card p-3 mb-4">
        <div className="row g-3">
          <div className="col-md-2">
            <label className="form-label">From</label>
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <label className="form-label">To</label>
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Branch</label>
            <select
              className="form-select"
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
            >
              <option value="All Branches">All Branches</option>
              {availableBranches.map(branch => (
                <option key={branch.name} value={branch.name}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Report Type</label>
            <select
              className="form-select"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="item">Item-wise Sales</option>
              <option value="branch">Branch-wise Sales</option>
              <option value="type">Type-wise Sales</option>
              <option value="returns">Returns</option>
              <option value="cash">Branch-wise Cash</option>
              <option value="zeroAdded">Zero Added Items</option>
              <option value="transfer">Internal Transfer</option>
              <option value="addedItems">Added Items</option>
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Filter (Item / Type)</label>
            <div className="d-flex gap-2">
              <select
                className="form-select"
                value={itemFilter}
                onChange={(e) => setItemFilter(e.target.value)}
              >
                <option value="">All Items</option>
                {items.map(item => (
                  <option key={item.code} value={item.name}>{item.name}</option>
                ))}
              </select>
              <select
                className="form-select"
                value={itemTypeFilter}
                onChange={(e) => setItemTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="Normal Item">Normal Item</option>
                <option value="Grocery Item">Grocery Item</option>
                <option value="Machine">Machine</option>
              </select>
            </div>
          </div>
          <div className="col-12 d-flex justify-content-end gap-2">
            <button className="btn btn-primary" onClick={generateReport}>
              Generate
            </button>
            <button className="btn btn-success" onClick={exportExcel}>
              <i className="fas fa-file-excel me-1"></i>Export Excel
            </button>
            <button className="btn btn-danger" onClick={exportPDF}>
              <i className="fas fa-file-pdf me-1"></i>Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Report Results */}
      <div className="card">
        <div className="card-header">Report Results</div>
        <div className="card-body">
          {loading ? (
            <div className="text-center p-3">Generating report...</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped" id="reportTable">
                <thead>
                  <tr>
                    {tableHead.map((header, index) => (
                      <th key={index}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableBody.length === 0 ? (
                    <tr>
                      <td colSpan={tableHead.length} className="text-center">
                        No data available.
                      </td>
                    </tr>
                  ) : (
                    tableBody.map((row, index) => {
                      if (row.isTotal) {
                        return (
                          <tr key={index} style={{ fontWeight: 'bold', backgroundColor: '#e9ecef' }}>
                            {row.cells.map((cell, cellIndex) => (
                              <td key={cellIndex}>{cell}</td>
                            ))}
                          </tr>
                        );
                      }
                      if (row.colSpan) {
                        return (
                          <tr key={index}>
                            <td colSpan={row.colSpan} className="text-center">
                              {row.cells}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={index}>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex}>{cell}</td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
