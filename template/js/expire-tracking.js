// expire-tracking.js - Expire Tracking functionality

// Generate unique batch ID
function generateBatchId() {
  return 'B' + Date.now() + Math.random().toString(36).substr(2, 9);
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('expire-tracking.html')) {
    // Load branches for filter based on user access
    const currentUser = JSON.parse(localStorage.getItem('currentUser')) || {};
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const currentUserData = users.find(u => u.username === currentUser.username) || {};
    const userExpireTrackingBranches = currentUserData.expireTrackingBranches || [];
    const isAdmin = currentUser.role === 'admin';
    
    const branches = JSON.parse(localStorage.getItem('branches')) || [];
    const filterBranchSelect = document.getElementById('filterBranch');
    
    if (filterBranchSelect) {
      filterBranchSelect.innerHTML = '<option value="">All Branches</option>';
      
      branches.forEach(branch => {
        // Only show branches user has access to (or all for admin)
        if (isAdmin || userExpireTrackingBranches.length === 0 || userExpireTrackingBranches.includes(branch.name)) {
          filterBranchSelect.innerHTML += `<option value="${branch.name}">${branch.name}</option>`;
        }
      });
    }
    
    loadExpiryTable();
    
    // Add event listeners
    document.getElementById('filterBranch')?.addEventListener('change', loadExpiryTable);
    document.getElementById('searchItem')?.addEventListener('input', loadExpiryTable);
    document.getElementById('filterExpiryDays')?.addEventListener('change', loadExpiryTable);
    document.getElementById('filterType')?.addEventListener('change', loadExpiryTable);
    
    // Auto-refresh every 5 minutes
    setInterval(() => {
      loadExpiryTable();
    }, 300000);
  }
});

// Load expiry table
function loadExpiryTable() {
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  const tableBody = document.getElementById('expiryTableBody');
  
  if (!tableBody) return;
  
  // Get current logged-in user
  const currentUser = JSON.parse(localStorage.getItem('currentUser')) || {};
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const currentUserData = users.find(u => u.username === currentUser.username) || {};
  
  // Get user's expire tracking branch access
  const userExpireTrackingBranches = currentUserData.expireTrackingBranches || [];
  const isAdmin = currentUser.role === 'admin';
  
  // Get filters
  const selectedBranch = document.getElementById('filterBranch')?.value || '';
  const searchTerm = document.getElementById('searchItem')?.value.toLowerCase() || '';
  const expiryDaysFilter = parseInt(document.getElementById('filterExpiryDays')?.value) || null;
  const typeFilter = document.getElementById('filterType')?.value || 'all';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Filter and process grocery stocks
  let expiryData = groceryStocks
    // Include batches with an expiry date regardless of remaining; we'll hide only after 2 days past expiry
    .filter(stock => stock.expiryDate)
    .map(stock => {
      const item = items.find(i => i.code === stock.itemCode);
      const branchName = branches.find(b => b.name === stock.branch)?.name || stock.branch || 'Unknown';
      const expiryDate = new Date(stock.expiryDate);
      expiryDate.setHours(0, 0, 0, 0);
      
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      // Hide only after 2 days past expiry
      if (daysUntilExpiry < -2) {
        return null; // Mark for removal from table view
      }
      
      return {
        ...stock,
        itemName: item ? item.name : 'Unknown Item',
        branchName: branchName,
        expiryDate: expiryDate,
        daysUntilExpiry: daysUntilExpiry,
        batchId: stock.batchId || generateBatchId() // Generate if not exists
      };
    })
    .filter(item => item !== null) // Remove expired items
    .filter(stock => {
      // Apply user access control - only show branches the user has access to
      if (!isAdmin && userExpireTrackingBranches.length > 0) {
        if (!userExpireTrackingBranches.includes(stock.branch)) return false;
      }
      
      // Apply branch filter
      if (selectedBranch && stock.branch !== selectedBranch) return false;
      
      // Apply search filter
      if (searchTerm && !stock.itemName.toLowerCase().includes(searchTerm)) return false;
      
      // Apply expiry days filter
      if (expiryDaysFilter !== null && stock.daysUntilExpiry > expiryDaysFilter) return false;
      
      // Apply type filter
      if (typeFilter === 'expired' && stock.daysUntilExpiry >= 0) return false;
      if (typeFilter === 'zero' && (stock.remaining ?? stock.quantity) > 0) return false;
      if (typeFilter === 'active' && stock.daysUntilExpiry < 0) return false;
      if (typeFilter === 'positive' && (stock.remaining ?? stock.quantity) <= 0) return false;
      
      return true;
    })
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry); // Sort by expiry date (soonest first)
  
  // Save back to localStorage with batch IDs
  groceryStocks.forEach((stock, index) => {
    if (!stock.batchId) {
      stock.batchId = generateBatchId();
    }
  });
  localStorage.setItem('groceryStocks', JSON.stringify(groceryStocks));
  
  // Render table
  if (expiryData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center text-muted">
          No items found with the current filters.
        </td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = expiryData.map(stock => {
    const statusClass = stock.daysUntilExpiry <= 3 ? 'danger' : 
                       stock.daysUntilExpiry <= 7 ? 'warning' : 
                       'success';
    const statusText = stock.daysUntilExpiry <= 3 ? 'Urgent' : 
                       stock.daysUntilExpiry <= 7 ? 'Warning' : 
                       'OK';
    
    return `
      <tr class="${stock.daysUntilExpiry <= 3 ? 'table-danger' : stock.daysUntilExpiry <= 7 ? 'table-warning' : ''}">
        <td><span class="badge bg-secondary">${stock.batchId}</span></td>
        <td><strong>${stock.itemName}</strong></td>
        <td>${stock.branchName}</td>
        <td>${formatDate(stock.addedDate || stock.date)}</td>
        <td>${stock.quantity}</td>
        <td>${(stock.remaining ?? stock.quantity)}</td>
        <td><strong>${formatDate(stock.expiryDate)}</strong></td>
        <td>
          <span class="badge bg-${statusClass}">
            ${stock.daysUntilExpiry} day${stock.daysUntilExpiry !== 1 ? 's' : ''}
          </span>
        </td>
        <td>
          <span class="badge bg-${statusClass}">
            ${statusText}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

// Refresh expiry table
function refreshExpiryTable() {
  loadExpiryTable();
  alert('Expiry table refreshed!');
}

// Format date helper
function formatDate(date) {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Auto-cleanup expired items
function cleanupExpiredItems() {
  const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let modified = false;
  
  // Remove or mark expired items
  const updatedStocks = groceryStocks.map(stock => {
    if (stock.expiryDate && stock.remaining > 0) {
      const expiryDate = new Date(stock.expiryDate);
      expiryDate.setHours(0, 0, 0, 0);
      
      if (expiryDate < today) {
        // Item has expired, remove from remaining
        modified = true;
        stock.remaining = 0;
        
        // Add notification
        const items = JSON.parse(localStorage.getItem('items')) || [];
        const item = items.find(i => i.code === stock.itemCode);
        
        if (item) {
          let notifications = JSON.parse(localStorage.getItem('notifications')) || [];
          const notificationExists = notifications.some(n => 
            n.type === 'expired' && 
            n.batchId === stock.batchId && 
            n.itemCode === stock.itemCode
          );
          
          if (!notificationExists) {
            notifications.push({
              id: 'N' + Date.now() + Math.random().toString(36).substr(2, 6),
              type: 'expired',
              branch: stock.branch,
              itemCode: stock.itemCode,
              itemName: item.name,
              batchId: stock.batchId,
              quantity: stock.quantity,
              expiryDate: stock.expiryDate,
              message: `${item.name} (Batch ${stock.batchId}) has expired and has been removed from inventory.`,
              createdAt: new Date().toISOString(),
              readBy: []
            });
            localStorage.setItem('notifications', JSON.stringify(notifications));
          }
        }
      }
    }
    return stock;
  });
  
  if (modified) {
    localStorage.setItem('groceryStocks', JSON.stringify(updatedStocks));
    loadExpiryTable(); // Refresh the table
  }
}

// Run cleanup on page load
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('expire-tracking.html')) {
    cleanupExpiredItems();
  }
});

