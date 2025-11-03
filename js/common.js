// common.js - Common functions for Bakery Management System

// Initialize all data structures
function initData() {
  // Start with empty collections so the system uses user-provided data only
  if (!localStorage.getItem('items')) {
      localStorage.setItem('items', JSON.stringify([]));
  }
  if (!localStorage.getItem('branches')) {
      localStorage.setItem('branches', JSON.stringify([]));
  }
  // Remove any leftover sample/demo entries from previous runs
  try {
    const sampleItemCodes = ['ITEM001','ITEM002','ITEM003','ITEM004','ITEM005'];
    const sampleItemNames = ['Croissant','Whole Wheat Bread','Orange Juice','Coffee Machine','Nescafe Machine'];
    const sampleBranchNames = ['Colombo Branch','Kandy Branch'];

    let items = JSON.parse(localStorage.getItem('items')) || [];
    const filteredItems = items.filter(i => !(i && (sampleItemCodes.includes(i.code) || sampleItemNames.includes(i.name))));
    if (filteredItems.length !== items.length) {
      localStorage.setItem('items', JSON.stringify(filteredItems));
    }

    let branches = JSON.parse(localStorage.getItem('branches')) || [];
    const filteredBranches = branches.filter(b => !(b && sampleBranchNames.includes(b.name)));
    if (filteredBranches.length !== branches.length) {
      localStorage.setItem('branches', JSON.stringify(filteredBranches));
    }
  } catch (e) {
    // If parsing fails, reset to empty arrays to be safe
    localStorage.setItem('items', JSON.stringify([]));
    localStorage.setItem('branches', JSON.stringify([]));
  }
  if (!localStorage.getItem('users')) localStorage.setItem('users', JSON.stringify([]));
  if (!localStorage.getItem('stocks')) localStorage.setItem('stocks', JSON.stringify({}));
  if (!localStorage.getItem('cashEntries')) localStorage.setItem('cashEntries', JSON.stringify([]));
  if (!localStorage.getItem('finishedBatches')) localStorage.setItem('finishedBatches', JSON.stringify({}));
  if (!localStorage.getItem('role')) localStorage.setItem('role', '');
  if (!localStorage.getItem('groceryStocks')) localStorage.setItem('groceryStocks', JSON.stringify([]));
  if (!localStorage.getItem('grocerySales')) localStorage.setItem('grocerySales', JSON.stringify([]));
  if (!localStorage.getItem('machineBatches')) localStorage.setItem('machineBatches', JSON.stringify([]));
  if (!localStorage.getItem('machineSales')) localStorage.setItem('machineSales', JSON.stringify([]));
  if (!localStorage.getItem('notifications')) localStorage.setItem('notifications', JSON.stringify([]));
  if (!localStorage.getItem('groceryReturns')) localStorage.setItem('groceryReturns', JSON.stringify([]));
  if (!localStorage.getItem('transferHistory')) localStorage.setItem('transferHistory', JSON.stringify([]));
}

// Clear all data from system (admin only)
function clearAllData() {
  if (localStorage.getItem('role') !== 'admin') {
      alert('Only admins can clear all data.');
      return;
  }
  if (confirm('Clear all bakery data? This cannot be undone.')) {
      localStorage.clear();
      initData();
      if (typeof loadDashboard === 'function') loadDashboard();
      if (typeof loadBranches === 'function') loadBranches();
      alert('Data cleared.');
  }
}

// Login function
function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  const users = JSON.parse(localStorage.getItem('users')) || [];

  // First, try custom users
  const user = users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (user) {
      localStorage.setItem('role', 'custom');
      localStorage.setItem('currentUserId', user.id);
      localStorage.setItem('currentAccesses', JSON.stringify(user.accesses || []));
      localStorage.setItem('currentBranches', JSON.stringify(user.assignedBranches || []));
      // update last login
      user.lastLogin = new Date().toISOString();
      localStorage.setItem('users', JSON.stringify(users));
      window.location.href = 'pages/dashboard.html';
      return;
  }

  // Fallback demo accounts
  if (username === 'admin' && password === 'admin') {
      localStorage.setItem('role', 'admin');
      localStorage.setItem('currentUserId', 'admin');
      localStorage.setItem('currentAccesses', JSON.stringify(['Dashboard','Master Creation','Add Item Stock','Internal Transfer','Add Return Stock','Cash Management','Reports','Branch Management','User Management']));
      localStorage.setItem('currentBranches', JSON.stringify([]));
      window.location.href = 'pages/dashboard.html';
  } else if (username === 'operator' && password === 'operator') {
      localStorage.setItem('role', 'operator');
      localStorage.setItem('currentUserId', 'operator');
      localStorage.setItem('currentAccesses', JSON.stringify(['Dashboard']));
      localStorage.setItem('currentBranches', JSON.stringify([]));
      window.location.href = 'pages/dashboard.html';
  } else {
      alert('Invalid credentials.');
  }
}

// Check if user is logged in
function checkLogin() {
  const role = localStorage.getItem('role');
  if (!role) {
      window.location.href = '../index.html';
      return false;
  }
  
  // Access control: hide admin-only and by access list
  const accesses = JSON.parse(localStorage.getItem('currentAccesses') || '[]');
  const page = window.location.pathname.split('/').pop();
  const pageAccessMap = {
    'dashboard.html': 'Dashboard',
    'inventory.html': 'Master Creation',
    'add-stock.html': 'Add Item Stock',
    'internal-transfer.html': 'Internal Transfer',
    'add-return.html': 'Add Return Stock',
    'cash-management.html': 'Cash Management',
    'reports.html': 'Reports',
    'branch-management.html': 'Branch Management',
    'user-management.html': 'User Management'
  };
  const requiredAccess = pageAccessMap[page];
  if (role === 'custom' && requiredAccess && !accesses.includes(requiredAccess)) {
      alert('You do not have access to this page.');
      window.location.href = 'dashboard.html';
      return false;
  }
  // Hide admin-only elements for non-admins
  if (role !== 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => {
          el.style.display = 'none';
      });
  }
  
  return true;
}

// Show settings function
function showSettings() {
  alert('Settings functionality coming soon!');
}

// Logout function
function logout() {
  localStorage.setItem('role', '');
  window.location.href = '../index.html';
}

// Get current date in YYYY-MM-DD format
function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

// Get previous date
function getPreviousDate(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

// Toggle item fields based on selected type
function toggleItemFields() {
  const itemType = document.getElementById('itemType')?.value;
  const normalItemFields = document.getElementById('normalItemFields');
  const groceryItemFields = document.getElementById('groceryItemFields');
  const machineFields = document.getElementById('machineFields');
  const addItemButton = document.getElementById('addItemButton');
  const createMachineButton = document.getElementById('createMachineButton');

  // Hide all fields first
  if (normalItemFields) normalItemFields.style.display = 'none';
  if (groceryItemFields) groceryItemFields.style.display = 'none';
  if (machineFields) machineFields.style.display = 'none';
  if (addItemButton) addItemButton.style.display = 'none';
  if (createMachineButton) createMachineButton.style.display = 'none';

  // Show appropriate fields based on selection
  if (itemType === 'Normal Item') {
      if (normalItemFields) normalItemFields.style.display = 'block';
      if (addItemButton) {
          addItemButton.style.display = 'block';
          addItemButton.disabled = false;
      }
  } else if (itemType === 'Grocery Item') {
      if (groceryItemFields) groceryItemFields.style.display = 'block';
      if (addItemButton) {
          addItemButton.style.display = 'block';
          addItemButton.disabled = false;
      }
  } else if (itemType === 'Machine') {
      if (machineFields) machineFields.style.display = 'block';
      if (createMachineButton) {
          createMachineButton.style.display = 'block';
          createMachineButton.disabled = false;
      }
  }
}

// Generate unique item code
function generateItemCode() {
  return 'ITEM' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Load branches for dropdowns
function loadBranchesForDropdowns() {
  const allBranches = JSON.parse(localStorage.getItem('branches')) || [];
  const role = localStorage.getItem('role');
  const assigned = JSON.parse(localStorage.getItem('currentBranches') || '[]');
  const branches = (role === 'admin' || assigned.length === 0) ? allBranches : allBranches.filter(b => assigned.includes(b.name));
  
  // Branch selection dropdowns
  ['branchSelect', 'returnBranchSelect'].forEach(id => {
      const elem = document.getElementById(id);
      if (elem) {
          let options = branches.length > 0 ? '<option value="">Select Branch</option>' : '<option>No branches available</option>';
          branches.forEach(branch => options += `<option value="${branch.name}">${branch.name}</option>`);
          elem.innerHTML = options;
      }
  });
  
  // Branch filter dropdowns (keep All for reports, remove for dashboard)
  ['cashBranch', 'userBranch', 'reportBranch'].forEach(id => {
      const elem = document.getElementById(id);
      if (elem) {
          let options = (id === 'reportBranch' && role === 'admin') ? '<option value="All Branches">All Branches</option>' : '<option value="">Select Branch</option>';
          branches.forEach(branch => options += `<option value="${branch.name}">${branch.name}</option>`);
          elem.innerHTML = options;
      }
  });

  // Dashboard branch: no "All Branches"; force selection
  const dash = document.getElementById('dashBranch');
  if (dash) {
    let options = '<option value="">Select Branch</option>';
    branches.forEach(branch => options += `<option value="${branch.name}">${branch.name}</option>`);
    dash.innerHTML = options;
  }
}


// Fix the formatTimeAgo function in common.js
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

// Transfer utility functions
function getTransferHistory() {
  return JSON.parse(localStorage.getItem('transferHistory')) || [];
}

function getTransferHistoryByBranch(branchName) {
  const history = getTransferHistory();
  return history.filter(transfer => 
    transfer.senderBranch === branchName || transfer.receiverBranch === branchName
  );
}

function getTransferHistoryByDateRange(startDate, endDate) {
  const history = getTransferHistory();
  return history.filter(transfer => {
    const transferDate = new Date(transfer.date);
    return transferDate >= new Date(startDate) && transferDate <= new Date(endDate);
  });
}

function validateTransferQuantity(itemCode, quantity, senderBranch, itemType) {
  if (itemType === 'Normal Item') {
    const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
    const today = getCurrentDate();
    const senderKey = `${today}_${senderBranch}`;
    const stockData = stocks[senderKey]?.[itemCode];
    const availableStock = stockData ? (Number(stockData.added) || 0) - (Number(stockData.returned) || 0) - (Number(stockData.transferred) || 0) : 0;
    return quantity <= availableStock;
  } else if (itemType === 'Grocery Item') {
    const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
    const senderStocks = groceryStocks.filter(s => 
      s.itemCode === itemCode && 
      s.branch === senderBranch && 
      s.remaining > 0
    );
    const availableStock = senderStocks.reduce((sum, s) => sum + s.remaining, 0);
    return quantity <= availableStock;
  }
  return false;
}
// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  initData();
  
  // Skip login check for login page
  if (window.location.pathname.endsWith('index.html')) return;
  
  // Check if user is logged in
  if (!checkLogin()) return;
  
  // Load branches for dropdowns
  loadBranchesForDropdowns();
  
  // Set active sidebar link based on current page
  const currentPage = window.location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar .nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === currentPage) {
          link.classList.add('active');
      }
  });
  
  // Hide sidebar links based on access permissions
  try {
    const accesses = JSON.parse(localStorage.getItem('currentAccesses') || '[]');
    const linkAccessMap = {
      'dashboard.html': 'Dashboard',
      'inventory.html': 'Master Creation',
      'add-stock.html': 'Add Item Stock',
      'internal-transfer.html': 'Internal Transfer',
      'add-return.html': 'Add Return Stock',
      'cash-management.html': 'Cash Management',
      'reports.html': 'Reports',
      'branch-management.html': 'Branch Management',
      'user-management.html': 'User Management'
    };
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
      const href = link.getAttribute('href');
      const required = linkAccessMap[href];
      if (required && accesses.indexOf(required) === -1 && localStorage.getItem('role') !== 'admin') {
        // hide entire list item if possible
        const li = link.closest('li');
        if (li) {
          li.style.display = 'none';
        } else {
          link.style.display = 'none';
        }
      }
    });
  } catch (e) {
    // ignore access parsing issues
  }
  
  // Set up event listener for item type dropdown
  const itemTypeSelect = document.getElementById('itemType');
  if (itemTypeSelect) {
      itemTypeSelect.addEventListener('change', toggleItemFields);
      // Initialize the form state
      toggleItemFields();
  }

  // Live dashboard/activity refresh across tabs
  if (window.location.pathname.includes('dashboard.html')) {
    window.addEventListener('storage', (e) => {
      if (['cashEntries','stocks','grocerySales','machineBatches','machineSales','groceryReturns'].includes(e.key)) {
        if (typeof loadDashboard === 'function') loadDashboard();
      }
    });
  }
});