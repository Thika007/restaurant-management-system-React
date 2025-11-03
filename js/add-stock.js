// ===================== DISABLE STOCK INPUTS =====================
function disableStockInputs() {
  // Disable branch select
  const branchSelect = document.getElementById('branchSelect');
  if (branchSelect) {
    branchSelect.disabled = true;
  }
  
  // Disable date input
  const stockDate = document.getElementById('stockDate');
  if (stockDate) {
    stockDate.disabled = true;
  }
  
  // Disable filter controls
  const filterCategory = document.getElementById('filterCategory');
  const searchInput = document.getElementById('searchInput');
  if (filterCategory) filterCategory.disabled = true;
  if (searchInput) searchInput.disabled = true;
  
  // Disable update button
  const updateButton = document.querySelector('#normalStockControls button');
  if (updateButton) {
    updateButton.disabled = true;
    updateButton.textContent = 'No branches available';
  }
}

// ===================== ENABLE STOCK INPUTS =====================
function enableStockInputs() {
  // Enable branch select
  const branchSelect = document.getElementById('branchSelect');
  if (branchSelect) {
    branchSelect.disabled = false;
  }
  
  // Enable date input
  const stockDate = document.getElementById('stockDate');
  if (stockDate) {
    stockDate.disabled = false;
  }
  
  // Enable filter controls
  const filterCategory = document.getElementById('filterCategory');
  const searchInput = document.getElementById('searchInput');
  if (filterCategory) filterCategory.disabled = false;
  if (searchInput) searchInput.disabled = false;
  
  // Enable update button
  const updateButton = document.querySelector('#normalStockControls button');
  if (updateButton) {
    updateButton.disabled = false;
    updateButton.textContent = 'Update Stocks';
  }
}

// ===================== TOGGLE ITEM TYPE =====================
function toggleItemType(itemType) {
  const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.textContent.trim() === (itemType === 'Normal Item' ? 'Normal Items' : itemType)) {
      link.classList.add('active');
    }
  });

  localStorage.setItem('selectedItemType', itemType);

  // Show/hide sections
  document.getElementById('datePickerContainer').style.display = itemType === 'Normal Item' ? 'block' : 'none';
  document.getElementById('normalStockControls').style.display = itemType === 'Normal Item' ? 'block' : 'none';
  document.getElementById('normalStockTable').style.display = itemType === 'Normal Item' ? 'block' : 'none';
  document.getElementById('groceryStockTable').style.display = itemType === 'Grocery Item' ? 'block' : 'none';
  document.getElementById('machineStockTable').style.display = itemType === 'Machine' ? 'block' : 'none';

  // Check if branches are available
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  const hasBranches = branches.length > 0;
  
  if (!hasBranches) {
    // No branches available - show error message
    const normalTableBody = document.getElementById('normalStockTableBody');
    const groceryTableBody = document.getElementById('groceryStockTableBody');
    const machineTableBody = document.getElementById('machineStockTableBody');
    
    if (normalTableBody) normalTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">No branches available. Please add branches first before managing stock.</td></tr>`;
    if (groceryTableBody) groceryTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">No branches available. Please add branches first before managing stock.</td></tr>`;
    if (machineTableBody) machineTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">No branches available. Please add branches first before managing stock.</td></tr>`;
    
    disableStockInputs();
    return;
  }

  // Only load data if branch is selected
  const branch = document.getElementById('branchSelect')?.value;
  if (branch) {
    if (itemType === 'Normal Item') {
      loadNormalStockItems();
    } else if (itemType === 'Grocery Item') {
      loadGroceryItems(); // 🔗 from grocery.js
    } else if (itemType === 'Machine') {
      loadMachines();
    }
    
    // Show export buttons
    const exportButtons = document.getElementById('exportButtons');
    if (exportButtons) {
      exportButtons.style.display = 'flex';
    }
  } else {
    // Clear tables if no branch selected
    const normalTableBody = document.getElementById('normalStockTableBody');
    const groceryTableBody = document.getElementById('groceryStockTableBody');
    const machineTableBody = document.getElementById('machineStockTableBody');
    
    if (normalTableBody) normalTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-warning">Please select a branch first.</td></tr>`;
    if (groceryTableBody) groceryTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-warning">Please select a branch first.</td></tr>`;
    if (machineTableBody) machineTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-warning">Please select a branch first.</td></tr>`;
    
    // Hide export buttons
    const exportButtons = document.getElementById('exportButtons');
    if (exportButtons) {
      exportButtons.style.display = 'none';
    }
  }
}

// ===================== LOAD NORMAL ITEMS =====================
function loadNormalStockItems() {
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};

  const branch = document.getElementById('branchSelect')?.value || '';
  const date = document.getElementById('stockDate')?.value || getCurrentDate();
  const key = `${date}_${branch}`;

  const tableBody = document.getElementById('normalStockTableBody');
  if (!tableBody) return;

  if (!branch) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-warning">Please select a branch first.</td></tr>`;
    return;
  }

  if (finishedBatches[key]) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">This batch is already finished for ${branch} (${date}). Cannot add stock.</td></tr>`;
    return;
  }

  let filteredItems = items.filter(item => item.itemType === 'Normal Item');
  const categoryFilter = document.getElementById('filterCategory')?.value || '';
  const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
  if (categoryFilter) filteredItems = filteredItems.filter(i => i.category === categoryFilter);
  if (searchTerm) filteredItems = filteredItems.filter(i => i.name.toLowerCase().includes(searchTerm));

  if (filteredItems.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center">No normal items available.</td></tr>`;
    return;
  }

  tableBody.innerHTML = filteredItems.map(item => {
    const stockData = stocks[key]?.[item.code];
    const addedStock = stockData ? (Number(stockData.added) || 0) : 0;
    const returnedStock = stockData ? (Number(stockData.returned) || 0) : 0;
    const transferredStock = stockData ? (Number(stockData.transferred) || 0) : 0;
    const availableStock = addedStock - returnedStock - transferredStock;
    return `
      <tr>
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>Rs ${Number(item.price || 0).toFixed(2)}</td>
        <td id="addedStock_${item.code}">${availableStock}</td>
        <td><input type="number" class="form-control" id="enterQty_${item.code}" value="0" min="0"></td>
      </tr>
    `;
  }).join('');
}

// ===================== UPDATE NORMAL STOCKS =====================
function updateStocks() {
  // Check if branches are available
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  if (branches.length === 0) {
    alert('No branches available. Please add branches first before managing stock.');
    return;
  }

  const branch = document.getElementById('branchSelect')?.value || '';
  const date = document.getElementById('stockDate')?.value || getCurrentDate();
  const key = `${date}_${branch}`;
  const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};

  if (!branch) return alert('Please select a branch before updating stocks.');
  if (finishedBatches[key]) return alert(`This batch is already finished for ${branch} (${date}).`);

  let stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  if (!stocks[key]) stocks[key] = {};

  const items = JSON.parse(localStorage.getItem('items')) || [];
  let updated = false;

  items.filter(i => i.itemType === 'Normal Item').forEach(item => {
    const qtyInput = document.getElementById(`enterQty_${item.code}`);
    if (qtyInput) {
      const qty = parseInt(qtyInput.value) || 0;
      if (qty > 0) {
        if (!stocks[key][item.code]) stocks[key][item.code] = { added: 0, returned: 0, sold: 0 };
        stocks[key][item.code].added += qty;
        qtyInput.value = 0;
        updated = true;
      }
    }
  });

  if (updated) {
    localStorage.setItem('stocks', JSON.stringify(stocks));
    loadNormalStockItems();
    alert('Stocks updated!');
  } else {
    alert('No stock quantities entered.');
  }
}

// ===================== PAGE INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('add-stock.html')) {
    document.getElementById('stockDate').value = getCurrentDate();
    loadBranchesForDropdowns();
    
    // Check if branches are available
    const branches = JSON.parse(localStorage.getItem('branches')) || [];
    const hasBranches = branches.length > 0;
    
    // Initialize with appropriate messages based on branch availability
    const normalTableBody = document.getElementById('normalStockTableBody');
    const groceryTableBody = document.getElementById('groceryStockTableBody');
    const machineTableBody = document.getElementById('machineStockTableBody');
    
    if (!hasBranches) {
      // No branches available - disable all functionality
      if (normalTableBody) normalTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">No branches available. Please add branches first before managing stock.</td></tr>`;
      if (groceryTableBody) groceryTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">No branches available. Please add branches first before managing stock.</td></tr>`;
      if (machineTableBody) machineTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">No branches available. Please add branches first before managing stock.</td></tr>`;
      
      // Disable all input controls
      disableStockInputs();
    } else {
      // Branches available - show branch selection message
      if (normalTableBody) normalTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-warning">Please select a branch first.</td></tr>`;
      if (groceryTableBody) groceryTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-warning">Please select a branch first.</td></tr>`;
      if (machineTableBody) machineTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-warning">Please select a branch first.</td></tr>`;
    }
    
    toggleItemType('Normal Item');

    document.getElementById('filterCategory')?.addEventListener('change', () => {
      const type = localStorage.getItem('selectedItemType') || 'Normal Item';
      if (type === 'Normal Item') loadNormalStockItems();
      else if (type === 'Grocery Item') loadGroceryItems();
      else if (type === 'Machine') loadMachines();
    });
    document.getElementById('searchInput')?.addEventListener('input', () => {
      const type = localStorage.getItem('selectedItemType') || 'Normal Item';
      if (type === 'Normal Item') loadNormalStockItems();
      else if (type === 'Grocery Item') loadGroceryItems();
      else if (type === 'Machine') loadMachines();
    });
    document.getElementById('branchSelect')?.addEventListener('change', () => {
      const type = localStorage.getItem('selectedItemType') || 'Normal Item';
      const branch = document.getElementById('branchSelect')?.value;
      
      // Show/hide export buttons
      const exportButtons = document.getElementById('exportButtons');
      if (branch && exportButtons) {
        exportButtons.style.display = 'flex';
      } else if (exportButtons) {
        exportButtons.style.display = 'none';
      }
      
      if (type === 'Normal Item') loadNormalStockItems();
      else if (type === 'Grocery Item') loadGroceryItems();
      else if (type === 'Machine') loadMachines();
    });
    document.getElementById('stockDate')?.addEventListener('change', () => {
      const type = localStorage.getItem('selectedItemType') || 'Normal Item';
      if (type === 'Normal Item') loadNormalStockItems();
      else if (type === 'Grocery Item') loadGroceryItems();
      else if (type === 'Machine') loadMachines();
    });

    // Listen for transfer changes from Internal Transfer page
    window.addEventListener('storage', (e) => {
      if (e.key === 'stocks' || e.key === 'groceryStocks' || e.key === 'transferHistory') {
        console.log('Stock data updated, refreshing add-stock page...');
        // Refresh the current view when stocks are updated by transfers
        const type = localStorage.getItem('selectedItemType') || 'Normal Item';
        if (type === 'Normal Item') {
          loadNormalStockItems();
        } else if (type === 'Grocery Item') {
          loadGroceryItems();
        } else if (type === 'Machine') {
          loadMachines();
        }
      }
    });
  }
});

// ===================== EXPORT FUNCTIONS =====================
function exportStockExcel() {
  const branch = document.getElementById('branchSelect')?.value;
  const date = document.getElementById('stockDate')?.value || getCurrentDate();
  const selectedItemType = localStorage.getItem('selectedItemType') || 'Normal Item';
  
  if (!branch) {
    alert('Please select a branch first.');
    return;
  }
  
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const key = `${date}_${branch}`;
  
  let data = [];
  
  if (selectedItemType === 'Normal Item') {
    // Add normal items
    const normalItems = items.filter(item => item.itemType === 'Normal Item');
    const stockData = stocks[key] || {};
    
    normalItems.forEach(item => {
      const stock = stockData[item.code];
      const added = stock ? (stock.added || 0) : 0;
      const returned = stock ? (stock.returned || 0) : 0;
      const transferred = stock ? (stock.transferred || 0) : 0;
      const available = added - returned - transferred;
      
      data.push({
        'Item Name': item.name,
        'Category': item.category,
        'Price (Rs.)': Number(item.price || 0).toFixed(2),
        'Available Stock': available,
        'Added': added,
        'Returned': returned,
        'Transferred': transferred
      });
    });
  } else if (selectedItemType === 'Grocery Item') {
    // Add grocery items
    const groceryItems = items.filter(item => item.itemType === 'Grocery Item');
    
    groceryItems.forEach(item => {
      const stockList = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
      const totalStock = stockList.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);
      
      data.push({
        'Item Name': item.name,
        'Category': item.category,
        'Price (Rs.)': Number(item.price || 0).toFixed(2),
        'Available Stock': item.soldByWeight ? Number(totalStock).toFixed(3) : Math.trunc(totalStock),
        'Total Batches': stockList.length
      });
    });
  } else {
    // Add normal and grocery items together
    const normalItems = items.filter(item => item.itemType === 'Normal Item');
    const stockData = stocks[key] || {};
    
    normalItems.forEach(item => {
      const stock = stockData[item.code];
      const added = stock ? (stock.added || 0) : 0;
      const returned = stock ? (stock.returned || 0) : 0;
      const transferred = stock ? (stock.transferred || 0) : 0;
      const available = added - returned - transferred;
      
      data.push({
        'Type': 'Normal Item',
        'Item Name': item.name,
        'Category': item.category,
        'Price (Rs.)': Number(item.price || 0).toFixed(2),
        'Available Stock': available
      });
    });
    
    const groceryItems = items.filter(item => item.itemType === 'Grocery Item');
    groceryItems.forEach(item => {
      const stockList = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
      const totalStock = stockList.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);
      
      data.push({
        'Type': 'Grocery Item',
        'Item Name': item.name,
        'Category': item.category,
        'Price (Rs.)': Number(item.price || 0).toFixed(2),
        'Available Stock': item.soldByWeight ? Number(totalStock).toFixed(3) : Math.trunc(totalStock)
      });
    });
  }
  
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Report');
  XLSX.writeFile(wb, `stock_report_${branch}_${date}.xlsx`);
}

function exportStockPDF() {
  const branch = document.getElementById('branchSelect')?.value;
  const date = document.getElementById('stockDate')?.value || getCurrentDate();
  const selectedItemType = localStorage.getItem('selectedItemType') || 'Normal Item';
  
  if (!branch) {
    alert('Please select a branch first.');
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'pt', 'a4');
  
  // Title
  doc.setFontSize(18);
  doc.text('Stock Activity Report', 40, 40);
  doc.setFontSize(12);
  doc.text(`Branch: ${branch}`, 40, 60);
  doc.text(`Date: ${date}`, 40, 75);
  doc.text(`Type: ${selectedItemType}`, 40, 90);
  
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const key = `${date}_${branch}`;
  
  let data = [];
  
  if (selectedItemType === 'Normal Item') {
    const normalItems = items.filter(item => item.itemType === 'Normal Item');
    const stockData = stocks[key] || {};
    
    data = normalItems.map(item => {
      const stock = stockData[item.code];
      const added = stock ? (stock.added || 0) : 0;
      const returned = stock ? (stock.returned || 0) : 0;
      const transferred = stock ? (stock.transferred || 0) : 0;
      const available = added - returned - transferred;
      
      return [
        item.name,
        item.category,
        `Rs ${Number(item.price || 0).toFixed(2)}`,
        available,
        added,
        returned,
        transferred
      ];
    });
    
    const headers = [['Item Name', 'Category', 'Price (Rs.)', 'Available Stock', 'Added', 'Returned', 'Transferred']];
    doc.autoTable({ 
      head: headers, 
      body: data, 
      startY: 110, 
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [102, 126, 234] }
    });
  } else if (selectedItemType === 'Grocery Item') {
    const groceryItems = items.filter(item => item.itemType === 'Grocery Item');
    
    data = groceryItems.map(item => {
      const stockList = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
      const totalStock = stockList.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);
      
      return [
        item.name,
        item.category,
        `Rs ${Number(item.price || 0).toFixed(2)}`,
        item.soldByWeight ? Number(totalStock).toFixed(3) : Math.trunc(totalStock),
        stockList.length
      ];
    });
    
    const headers = [['Item Name', 'Category', 'Price (Rs.)', 'Available Stock', 'Total Batches']];
    doc.autoTable({ 
      head: headers, 
      body: data, 
      startY: 110, 
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [102, 126, 234] }
    });
  } else {
    const normalItems = items.filter(item => item.itemType === 'Normal Item');
    const stockData = stocks[key] || {};
    
    normalItems.forEach(item => {
      const stock = stockData[item.code];
      const added = stock ? (stock.added || 0) : 0;
      const returned = stock ? (stock.returned || 0) : 0;
      const transferred = stock ? (stock.transferred || 0) : 0;
      const available = added - returned - transferred;
      
      data.push([
        'Normal Item',
        item.name,
        item.category,
        `Rs ${Number(item.price || 0).toFixed(2)}`,
        available
      ]);
    });
    
    const groceryItems = items.filter(item => item.itemType === 'Grocery Item');
    groceryItems.forEach(item => {
      const stockList = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
      const totalStock = stockList.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);
      
      data.push([
        'Grocery Item',
        item.name,
        item.category,
        `Rs ${Number(item.price || 0).toFixed(2)}`,
        item.soldByWeight ? Number(totalStock).toFixed(3) : Math.trunc(totalStock)
      ]);
    });
    
    const headers = [['Type', 'Item Name', 'Category', 'Price (Rs.)', 'Available Stock']];
    doc.autoTable({ 
      head: headers, 
      body: data, 
      startY: 110, 
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [102, 126, 234] }
    });
  }
  
  doc.save(`stock_report_${branch}_${date}.pdf`);
}
