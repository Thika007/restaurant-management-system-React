// ===================== GROCERY MANAGEMENT =====================

// --- STOCK PAGE (add-stock.html) ---
function loadGroceryItems() {
  const branch = document.getElementById('branchSelect')?.value;
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const tableBody = document.getElementById('groceryStockTableBody');
  if (!tableBody) return;

  // Check if branches are available
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  if (branches.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">No branches available. Please add branches first before managing stock.</td></tr>`;
    return;
  }

  // Check if branch is selected
  if (!branch) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-warning">Please select a branch first.</td></tr>`;
    return;
  }

  const groceryItems = items.filter(i => i.itemType === 'Grocery Item');
  if (groceryItems.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center">No grocery items available.</td></tr>`;
    return;
  }

  tableBody.innerHTML = groceryItems.map(item => {
    const stockData = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
    const currentStock = stockData.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);

    return `
      <tr>
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>Rs ${Number(item.price || 0).toFixed(2)}</td>
        <td id="groceryStock_${item.code}">${item.soldByWeight ? Number(currentStock).toFixed(3) : Math.trunc(currentStock)}</td>
        <td><button class="btn btn-primary btn-sm select-grocery" data-code="${item.code}" data-name="${item.name}">Select Item</button></td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.select-grocery').forEach(btn => {
    btn.addEventListener('click', () => {
      showAddGroceryStockModal(btn.dataset.code, btn.dataset.name);
    });
  });
}

function showAddGroceryStockModal(code, name) {
  document.getElementById('groceryStockItemCode').value = code;
  document.getElementById('groceryStockItemName').textContent = name;
  document.getElementById('groceryStockQuantity').value = '';
  document.getElementById('groceryStockExpiry').value = '';
  // Configure quantity input based on item settings
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const item = items.find(i => i.code === code);
  const qtyInput = document.getElementById('groceryStockQuantity');
  if (qtyInput) {
    if (item && item.soldByWeight) {
      qtyInput.min = '0.001';
      qtyInput.step = '0.001';
      qtyInput.placeholder = 'Enter quantity (e.g., 0.500 for 500g)';
    } else {
      qtyInput.min = '1';
      qtyInput.step = '1';
      qtyInput.placeholder = 'Enter quantity (integer)';
    }
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('addGroceryStockModal')).show();
}

function addGroceryStock() {
  // Check if branches are available
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  if (branches.length === 0) {
    alert('No branches available. Please add branches first before managing stock.');
    return;
  }

  const itemCode = document.getElementById('groceryStockItemCode')?.value;
  const quantity = parseFloat(document.getElementById('groceryStockQuantity')?.value) || 0;
  const expiryDate = document.getElementById('groceryStockExpiry')?.value;
  const branch = document.getElementById('branchSelect')?.value;
  const stockDate = document.getElementById('stockDate')?.value || getCurrentDate();

  if (!itemCode || !branch || quantity <= 0 || !expiryDate) return alert('Please fill all fields correctly.');

  // Generate batch ID
  function generateBatchId() {
    return 'B' + Date.now() + Math.random().toString(36).substr(2, 9);
  }

  let groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  groceryStocks.push({ 
    itemCode, 
    quantity, 
    remaining: quantity, 
    expiryDate, 
    branch, 
    // Keep legacy 'date' for backward compatibility and add 'addedDate' for new features
    date: stockDate,
    addedDate: stockDate,
    batchId: generateBatchId()
  });
  localStorage.setItem('groceryStocks', JSON.stringify(groceryStocks));

  // Clear form fields
  document.getElementById('groceryStockItemCode').value = '';
  document.getElementById('groceryStockItemName').textContent = '';
  document.getElementById('groceryStockQuantity').value = '';
  document.getElementById('groceryStockExpiry').value = '';
  
  bootstrap.Modal.getInstance(document.getElementById('addGroceryStockModal')).hide();
  loadGroceryItems();
  checkExpiringItems();
  // Notify listeners (other tabs)
  localStorage.setItem('lastGroceryUpdate', Date.now().toString());
  alert('Grocery stock added successfully!');
}

// --- RETURN PAGE (add-return.html) ---
function loadGroceryReturnItems(branch) {
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const tableBody = document.getElementById('groceryReturnTableBody');

  // Filter to only show grocery items with stock > 0
  const groceryItems = items.filter(i => i.itemType === 'Grocery Item');
  const itemsWithStock = groceryItems.filter(item => {
    const stockData = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
    const totalStock = stockData.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);
    return totalStock > 0;
  });

  if (itemsWithStock.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-warning">No grocery items with available stock. Please add stocks first before adding returns.</td></tr>';
    const controls = document.getElementById('groceryReturnControls');
    if (controls) controls.style.display = 'none';
    return;
  }

  let html = itemsWithStock.map(item => {
    const stockData = groceryStocks.filter(s => s.itemCode === item.code && s.branch === branch);
    const totalStock = stockData.reduce((sum, s) => sum + (s.remaining ?? s.quantity), 0);

    return `
      <tr>
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td id="totalStock_${item.code}">${item.soldByWeight ? Number(totalStock).toFixed(3) : Math.trunc(totalStock)}</td>
        <td><input type="number" class="form-control" id="groceryRemainQty_${item.code}" value="${item.soldByWeight ? Number(totalStock).toFixed(3) : Math.trunc(totalStock)}" min="0" step="${item.soldByWeight ? '0.001' : '1'}"></td>
        <td><input type="number" class="form-control" id="groceryReturnQty_${item.code}" value="0" min="0" step="${item.soldByWeight ? '0.001' : '1'}"></td>
      </tr>
    `;
  }).join('');

  tableBody.innerHTML = html;
  
  // Show controls for grocery section
  const controls = document.getElementById('groceryReturnControls');
  if (controls) controls.style.display = 'block';
}

function updateGroceryRemaining() {
  const branch = document.getElementById('returnBranchSelect')?.value;
  if (!branch) return alert('Please select a branch.');

  let groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const items = JSON.parse(localStorage.getItem('items')) || [];
  let grocerySales = JSON.parse(localStorage.getItem('grocerySales')) || [];

  let updated = false;
  const today = getCurrentDate();
  const now = new Date();

  groceryStocks.forEach(stock => {
    if (stock.branch !== branch) return;

    const input = document.getElementById(`groceryRemainQty_${stock.itemCode}`);
    if (input) {
      const item = items.find(i => i.code === stock.itemCode);
      const newRemaining = (item && item.soldByWeight ? parseFloat : parseInt)(input.value) || 0;
      const prevRemaining = stock.remaining ?? stock.quantity;
      const soldQty = prevRemaining - newRemaining;

      if (soldQty < 0) {
        const displayPrev = item && item.soldByWeight ? Number(prevRemaining).toFixed(3) : Math.trunc(prevRemaining);
        alert(`Remaining quantity for ${stock.itemCode} cannot be greater than stock (${displayPrev}).`);
        return;
      }

      stock.remaining = newRemaining;

      if (soldQty > 0) {
        const item = items.find(i => i.code === stock.itemCode);
        if (item) {
          grocerySales.push({
            itemCode: stock.itemCode,
            itemName: item.name,
            branch,
            date: today,
            soldQty,
            totalCash: soldQty * (item.price || 0),
            timestamp: now.toISOString()
          });
        }
      }
      updated = true;
      input.value = item && item.soldByWeight ? '0.000' : '0';
    }
  });

  if (updated) {
    localStorage.setItem('groceryStocks', JSON.stringify(groceryStocks));
    localStorage.setItem('grocerySales', JSON.stringify(grocerySales));
    filterReturnItems();
    loadGroceryItems();
    alert('Grocery remaining updated! Sales recorded.');
  } else {
    alert('No valid remaining quantities entered.');
  }
}

// Record grocery returns without affecting sales
function updateGroceryReturns() {
  const branch = document.getElementById('returnBranchSelect')?.value;
  const date = document.getElementById('returnDate')?.value || getCurrentDate();
  if (!branch) return alert('Please select a branch.');

  let groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  let groceryReturns = JSON.parse(localStorage.getItem('groceryReturns')) || [];
  const items = JSON.parse(localStorage.getItem('items')) || [];

  let updated = false;

  // For each grocery item, read the return quantity input and record a return entry
  items.filter(i => i.itemType === 'Grocery Item').forEach(item => {
    const input = document.getElementById(`groceryReturnQty_${item.code}`);
    if (!input) return;

    const returnQty = (item && item.soldByWeight ? parseFloat : parseInt)(input.value) || 0;
    if (returnQty <= 0) return;

    // Reduce remaining stock (prefer earliest entries)
    let remainingToReturn = returnQty;
    for (let s of groceryStocks) {
      if (s.itemCode !== item.code || s.branch !== branch) continue;
      const currentRemaining = s.remaining ?? s.quantity;
      if (currentRemaining <= 0) continue;
      const deduct = Math.min(currentRemaining, remainingToReturn);
      s.remaining = currentRemaining - deduct;
      remainingToReturn -= deduct;
      if (remainingToReturn === 0) break;
    }

    // Record return entry (not sales)
    groceryReturns.push({
      itemCode: item.code,
      itemName: item.name,
      branch,
      date,
      returnedQty: returnQty,
      reason: 'waste',
      timestamp: new Date().toISOString()
    });

    input.value = 0;
    updated = true;
  });

  if (updated) {
    localStorage.setItem('groceryStocks', JSON.stringify(groceryStocks));
    localStorage.setItem('groceryReturns', JSON.stringify(groceryReturns));
    filterReturnItems();
    alert('Grocery returns recorded!');
  } else {
    alert('No grocery return quantities entered.');
  }
}

// --- EXPIRY REMINDER ---
function checkExpiringItems() {
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const today = new Date();
  let notifications = JSON.parse(localStorage.getItem('notifications')) || [];

  groceryStocks.forEach(stock => {
    if (!stock.expiryDate) return;
    const expiry = new Date(stock.expiryDate);
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (diffDays === 2) {
      const item = items.find(i => i.code === stock.itemCode);
      if (!item) return;
      
      // Only notify if the item has notifyExpiry enabled
      if (!item.notifyExpiry) return;
      
      const msg = `${stock.date} added ${stock.quantity} ${item.name} will be expire soon in ${stock.expiryDate}`;
      const exists = notifications.some(n => n.type === 'expiry' && n.itemCode === stock.itemCode && n.branch === stock.branch && n.expiryDate === stock.expiryDate && n.dateAdded === stock.date);
      if (!exists) {
        notifications.push({
          id: 'N' + Date.now() + Math.random().toString(36).slice(2,6),
          type: 'expiry',
          branch: stock.branch,
          itemCode: stock.itemCode,
          itemName: item.name,
          quantity: stock.quantity,
          dateAdded: stock.date,
          expiryDate: stock.expiryDate,
          message: msg,
          createdAt: new Date().toISOString(),
          readBy: []
        });
      }
    }
  });

  localStorage.setItem('notifications', JSON.stringify(notifications));
}
