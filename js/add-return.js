// =========================
// add-return.js - Add Return functionality
// =========================

function toggleItemType(itemType) {
  const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.textContent.trim() === (itemType === 'Normal Item' ? 'Normal Items' : itemType)) {
      link.classList.add('active');
    }
  });
  localStorage.setItem('selectedItemType', itemType);

  document.getElementById('datePickerContainer').style.display = itemType === 'Normal Item' ? 'block' : 'none';
  document.getElementById('normalReturnControls').style.display = itemType === 'Normal Item' ? 'block' : 'none';
  document.getElementById('normalReturnTable').style.display = itemType === 'Normal Item' ? 'block' : 'none';
  document.getElementById('groceryReturnTable').style.display = itemType === 'Grocery Item' ? 'block' : 'none';
  document.getElementById('machineReturnTable').style.display = itemType === 'Machine' ? 'block' : 'none';

  if (itemType === 'Machine') {
    loadMachineReturns();
  } else {
    filterReturnItems();
  }
}

function filterReturnItems() {
  const selectedItemType = localStorage.getItem('selectedItemType') || 'Normal Item';
  const branch = document.getElementById('returnBranchSelect')?.value;
  const date = document.getElementById('returnDate')?.value || getCurrentDate();
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};
  const key = `${date}_${branch}`;

  // Show/hide export buttons
  const exportButtons = document.getElementById('exportButtons');
  if (branch && exportButtons) {
    exportButtons.style.display = 'flex';
  } else if (exportButtons) {
    exportButtons.style.display = 'none';
  }

  let filteredItems = items.filter(item => item.itemType === selectedItemType);

  if (selectedItemType === 'Normal Item') {
    const tableBody = document.getElementById('normalReturnTableBody');

    if (!branch) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-warning">Please select a branch first.</td></tr>`;
      return;
    }

    if (!stocks[key] || Object.keys(stocks[key]).length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">No stocks added for this date and branch.</td></tr>`;
      return;
    }

    if (finishedBatches[key]) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">This batch is already finished for ${branch} (${date}).</td></tr>`;
      return;
    }

    let html = filteredItems.map(item => {
      const stockData = stocks[key]?.[item.code];
      if (!stockData || !stockData.added) return '';
      const totalReturn = stockData.returned || 0;
      const availableForReturn = (stockData.added || 0) - (stockData.returned || 0) - (stockData.transferred || 0);
      const maxReturn = Math.max(0, availableForReturn);
      return `
        <tr>
          <td>${item.name}</td>
          <td>${item.category}</td>
          <td id="totalReturn_${item.code}">${totalReturn}</td>
          <td><input type="number" class="form-control" id="returnQty_${item.code}" value="0" min="0" max="${maxReturn}"></td>
        </tr>
      `;
    }).join('');
    tableBody.innerHTML = html || '<tr><td colspan="4" class="text-center">No added stock items available.</td></tr>';
  }

  if (selectedItemType === 'Grocery Item') {
    loadGroceryReturnItems(branch); // 🔗 moved to grocery.js
  }
}

// ================= NORMAL ITEMS =================
function updateReturns() {
  const branch = document.getElementById('returnBranchSelect')?.value;
  const date = document.getElementById('returnDate')?.value || getCurrentDate();
  const key = `${date}_${branch}`;
  let stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  if (!stocks[key]) stocks[key] = {};
  const items = JSON.parse(localStorage.getItem('items')) || [];
  let updated = false;

  items.filter(item => item.itemType === 'Normal Item').forEach(item => {
    const qtyInput = document.getElementById(`returnQty_${item.code}`);
    if (qtyInput) {
      const qty = parseInt(qtyInput.value) || 0;
      if (qty > 0) {
        if (!stocks[key][item.code]) stocks[key][item.code] = { added: 0, returned: 0, sold: 0 };
        const availableForReturn = (stocks[key][item.code].added || 0) - (stocks[key][item.code].returned || 0) - (stocks[key][item.code].transferred || 0);
        if (qty > availableForReturn) {
          alert(`Cannot return ${qty} ${item.name}. Only ${availableForReturn} items available for return (after accounting for transfers).`);
          qtyInput.value = 0;
          return;
        }
        stocks[key][item.code].returned += qty;
        qtyInput.value = 0;
        updated = true;
      }
    }
  });

  if (updated) {
    localStorage.setItem('stocks', JSON.stringify(stocks));
    recalculateSoldQuantities(branch, date);
    filterReturnItems();
    alert('Returns updated!');
  } else {
    alert('No return quantities entered.');
  }
}

function recalculateSoldQuantities(branch, date) {
  const key = `${date}_${branch}`;
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  if (stocks[key]) {
    Object.keys(stocks[key]).forEach(itemCode => {
      const itemData = stocks[key][itemCode];
      itemData.sold = (itemData.added || 0) - (itemData.returned || 0) - (itemData.transferred || 0);
    });
    localStorage.setItem('stocks', JSON.stringify(stocks));
  }
}

function clearReturns() {
  const items = JSON.parse(localStorage.getItem('items')) || [];
  items.filter(item => item.itemType === 'Normal Item').forEach(item => {
    const qtyInput = document.getElementById(`returnQty_${item.code}`);
    if (qtyInput) qtyInput.value = 0;
  });
}

function finishBatch() {
  const branch = document.getElementById('returnBranchSelect')?.value;
  const date = document.getElementById('returnDate')?.value || getCurrentDate();
  const key = `${date}_${branch}`;
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};

  if (branches.length === 0) return alert('No branches available.');
  if (!branch) return alert('Please select a branch.');
  if (!date) return alert('Please select a date.');

  if (stocks[key]) {
    Object.keys(stocks[key]).forEach(itemCode => {
      const itemData = stocks[key][itemCode];
      itemData.sold = (itemData.added || 0) - (itemData.returned || 0);
    });
    localStorage.setItem('stocks', JSON.stringify(stocks));
  }

  let finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};
  finishedBatches[key] = true;
  localStorage.setItem('finishedBatches', JSON.stringify(finishedBatches));
  filterReturnItems();
  alert('Batch finished! Sold quantities calculated.');
}

// ================= INIT =================
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('add-return.html')) {
    document.getElementById('returnDate').value = getCurrentDate();
    loadBranchesForDropdowns();
    toggleItemType('Normal Item');
    document.getElementById('filterCategory')?.addEventListener('change', filterReturnItems);
    document.getElementById('searchInput')?.addEventListener('input', filterReturnItems);
    document.getElementById('returnBranchSelect')?.addEventListener('change', filterReturnItems);
    document.getElementById('returnDate')?.addEventListener('change', filterReturnItems);
  }
});

// ===================== EXPORT FUNCTIONS =====================
function exportReturnExcel() {
  const branch = document.getElementById('returnBranchSelect')?.value;
  const date = document.getElementById('returnDate')?.value || getCurrentDate();
  const selectedItemType = localStorage.getItem('selectedItemType') || 'Normal Item';
  
  if (!branch) {
    alert('Please select a branch first.');
    return;
  }
  
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  const groceryReturns = JSON.parse(localStorage.getItem('groceryReturns')) || [];
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const key = `${date}_${branch}`;
  
  let data = [];
  
  if (selectedItemType === 'Normal Item') {
    // Add normal items with return data
    const normalItems = items.filter(item => item.itemType === 'Normal Item');
    const stockData = stocks[key] || {};
    
    normalItems.forEach(item => {
      const stock = stockData[item.code];
      if (stock && stock.added) {
        data.push({
          'Item Name': item.name,
          'Category': item.category,
          'Added Stock': stock.added || 0,
          'Returned Stock': stock.returned || 0,
          'Available Stock': (stock.added || 0) - (stock.returned || 0),
          'Price (Rs.)': Number(item.price || 0).toFixed(2),
          'Return Value (Rs.)': ((stock.returned || 0) * (item.price || 0)).toFixed(2)
        });
      }
    });
  } else if (selectedItemType === 'Grocery Item') {
    // Add grocery items with return data
    const groceryItems = items.filter(item => item.itemType === 'Grocery Item');
    
    groceryItems.forEach(item => {
      // Get returns for this item on this date and branch
      const returnsForItem = groceryReturns.filter(r => 
        r.itemCode === item.code && r.branch === branch && r.date === date
      );
      const totalReturns = returnsForItem.reduce((sum, r) => sum + (r.returnedQty || 0), 0);
      
      // Get current stock
      const stockList = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
      const currentStock = stockList.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);
      
      if (totalReturns > 0 || currentStock > 0) {
        data.push({
          'Item Name': item.name,
          'Category': item.category,
          'Total Stock': item.soldByWeight ? Number(currentStock).toFixed(3) : Math.trunc(currentStock),
          'Returned Quantity': item.soldByWeight ? Number(totalReturns).toFixed(3) : Math.trunc(totalReturns),
          'Remaining Stock': item.soldByWeight ? Number(currentStock).toFixed(3) : Math.trunc(currentStock),
          'Price (Rs.)': Number(item.price || 0).toFixed(2)
        });
      }
    });
  } else {
    // Add normal items
    const normalItems = items.filter(item => item.itemType === 'Normal Item');
    const stockData = stocks[key] || {};
    
    normalItems.forEach(item => {
      const stock = stockData[item.code];
      if (stock && stock.added) {
        data.push({
          'Type': 'Normal Item',
          'Item Name': item.name,
          'Category': item.category,
          'Added': stock.added || 0,
          'Returned': stock.returned || 0,
          'Available': (stock.added || 0) - (stock.returned || 0)
        });
      }
    });
    
    // Add grocery items
    const groceryItems = items.filter(item => item.itemType === 'Grocery Item');
    groceryItems.forEach(item => {
      const returnsForItem = groceryReturns.filter(r => 
        r.itemCode === item.code && r.branch === branch && r.date === date
      );
      const totalReturns = returnsForItem.reduce((sum, r) => sum + (r.returnedQty || 0), 0);
      
      const stockList = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
      const currentStock = stockList.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);
      
      if (totalReturns > 0 || currentStock > 0) {
        data.push({
          'Type': 'Grocery Item',
          'Item Name': item.name,
          'Category': item.category,
          'Total Stock': item.soldByWeight ? Number(currentStock).toFixed(3) : Math.trunc(currentStock),
          'Returned': item.soldByWeight ? Number(totalReturns).toFixed(3) : Math.trunc(totalReturns),
          'Available': item.soldByWeight ? Number(currentStock).toFixed(3) : Math.trunc(currentStock)
        });
      }
    });
  }
  
  if (data.length === 0) {
    alert('No return data available for export.');
    return;
  }
  
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Return Report');
  XLSX.writeFile(wb, `return_report_${branch}_${date}.xlsx`);
}

function exportReturnPDF() {
  const branch = document.getElementById('returnBranchSelect')?.value;
  const date = document.getElementById('returnDate')?.value || getCurrentDate();
  const selectedItemType = localStorage.getItem('selectedItemType') || 'Normal Item';
  
  if (!branch) {
    alert('Please select a branch first.');
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'pt', 'a4');
  
  // Title
  doc.setFontSize(18);
  doc.text('Return Stock Activity Report', 40, 40);
  doc.setFontSize(12);
  doc.text(`Branch: ${branch}`, 40, 60);
  doc.text(`Date: ${date}`, 40, 75);
  doc.text(`Type: ${selectedItemType}`, 40, 90);
  
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  const groceryReturns = JSON.parse(localStorage.getItem('groceryReturns')) || [];
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const key = `${date}_${branch}`;
  
  let data = [];
  
  if (selectedItemType === 'Normal Item') {
    const normalItems = items.filter(item => item.itemType === 'Normal Item');
    const stockData = stocks[key] || {};
    
    data = normalItems.map(item => {
      const stock = stockData[item.code];
      if (!stock || !stock.added) return null;
      
      return [
        item.name,
        item.category,
        stock.added || 0,
        stock.returned || 0,
        (stock.added || 0) - (stock.returned || 0),
        `Rs ${Number(item.price || 0).toFixed(2)}`,
        `Rs ${((stock.returned || 0) * (item.price || 0)).toFixed(2)}`
      ];
    }).filter(row => row !== null);
    
    const headers = [['Item Name', 'Category', 'Added', 'Returned', 'Available', 'Price', 'Return Value']];
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
      const returnsForItem = groceryReturns.filter(r => 
        r.itemCode === item.code && r.branch === branch && r.date === date
      );
      const totalReturns = returnsForItem.reduce((sum, r) => sum + (r.returnedQty || 0), 0);
      
      const stockList = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
      const currentStock = stockList.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);
      
      if (totalReturns === 0 && currentStock === 0) return null;
      
      return [
        item.name,
        item.category,
        item.soldByWeight ? Number(currentStock).toFixed(3) : Math.trunc(currentStock),
        item.soldByWeight ? Number(totalReturns).toFixed(3) : Math.trunc(totalReturns),
        item.soldByWeight ? Number(currentStock).toFixed(3) : Math.trunc(currentStock),
        `Rs ${Number(item.price || 0).toFixed(2)}`
      ];
    }).filter(row => row !== null);
    
    const headers = [['Item Name', 'Category', 'Total Stock', 'Returned', 'Remaining', 'Price']];
    doc.autoTable({ 
      head: headers, 
      body: data, 
      startY: 110, 
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [102, 126, 234] }
    });
  } else {
    // Combine normal and grocery
    const normalItems = items.filter(item => item.itemType === 'Normal Item');
    const stockData = stocks[key] || {};
    
    normalItems.forEach(item => {
      const stock = stockData[item.code];
      if (stock && stock.added) {
        data.push([
          'Normal Item',
          item.name,
          item.category,
          stock.added || 0,
          stock.returned || 0,
          (stock.added || 0) - (stock.returned || 0)
        ]);
      }
    });
    
    const groceryItems = items.filter(item => item.itemType === 'Grocery Item');
    groceryItems.forEach(item => {
      const returnsForItem = groceryReturns.filter(r => 
        r.itemCode === item.code && r.branch === branch && r.date === date
      );
      const totalReturns = returnsForItem.reduce((sum, r) => sum + (r.returnedQty || 0), 0);
      
      const stockList = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
      const currentStock = stockList.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);
      
      if (totalReturns > 0 || currentStock > 0) {
        data.push([
          'Grocery Item',
          item.name,
          item.category,
          item.soldByWeight ? Number(currentStock).toFixed(3) : Math.trunc(currentStock),
          item.soldByWeight ? Number(totalReturns).toFixed(3) : Math.trunc(totalReturns),
          item.soldByWeight ? Number(currentStock).toFixed(3) : Math.trunc(currentStock)
        ]);
      }
    });
    
    const headers = [['Type', 'Item Name', 'Category', 'Total/Added', 'Returned', 'Available']];
    doc.autoTable({ 
      head: headers, 
      body: data, 
      startY: 110, 
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [102, 126, 234] }
    });
  }
  
  if (data.length === 0) {
    alert('No return data available for export.');
    return;
  }
  
  doc.save(`return_report_${branch}_${date}.pdf`);
}
