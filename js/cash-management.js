// cash-management.js - Cash Management Functions

// Clear cash entry form
function clearCashEntryForm() {
  document.getElementById('cashBranch').value = '';
  document.getElementById('cashDate').value = getCurrentDate();
  document.getElementById('actualCash').value = '';
  document.getElementById('cardPayment').value = '';
  document.getElementById('cashNotes').value = '';
}

// Add cash entry
function addCashEntry() {
  const branch = document.getElementById('cashBranch').value;
  const date = document.getElementById('cashDate').value;
  const actualCash = parseFloat(document.getElementById('actualCash').value);
  const cardPayment = parseFloat(document.getElementById('cardPayment').value) || 0;
  const actual = (isNaN(actualCash) ? 0 : actualCash) + cardPayment;
  const notes = document.getElementById('cashNotes').value;

  if (!branch) { alert('Please select a branch.'); return; }
  if (!date) { alert('Please select a date.'); return; }
  if (isNaN(actualCash)) { alert('Please enter actual cash amount.'); return; }

  // Prevent duplicate entry for same branch+date
  const cashEntriesExisting = JSON.parse(localStorage.getItem('cashEntries')) || [];
  const duplicate = cashEntriesExisting.some(e => e.branch === branch && e.date === date);
  if (duplicate) { alert('A cash entry for this branch and date already exists.'); return; }

  // Preconditions validation
  const precheck = validateCashPreconditions(branch, date);
  if (!precheck.ok) { alert(precheck.message); return; }

  // Calculate expected cash from sales data (normal sold + grocery + machine)
  const expected = calculateExpectedCash(branch, date);
  // If there are no sales (expected <= 0), no need to add a cash entry
  if (expected <= 0) {
    alert('No sales recorded for this branch and date. Cash entry is not required.');
    return;
  }
  const difference = actual - expected;
  const status = difference === 0 ? 'Match' : difference > 0 ? 'Overage' : 'Shortage';
  const operatorId = localStorage.getItem('currentUserId') || localStorage.getItem('role') || '';
  // Resolve operator full name
  let operatorName = operatorId;
  try {
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const user = users.find(u => u.id === operatorId || u.username === operatorId);
    if (user && user.fullName) operatorName = user.fullName;
    if (operatorId === 'admin') operatorName = 'Administrator';
    if (operatorId === 'operator' && !user) operatorName = 'Operator';
  } catch (e) {}

  const entry = {
    date,
    branch,
    expected,
    actual,
    difference,
    status,
    operatorId,
    operatorName,
    notes,
    actualCash,
    cardPayment,
    timestamp: Date.now()
  };

  const cashEntries = JSON.parse(localStorage.getItem('cashEntries')) || [];
  cashEntries.push(entry);
  localStorage.setItem('cashEntries', JSON.stringify(cashEntries));

  loadCashEntries();
  clearCashEntryForm();
  bootstrap.Modal.getInstance(document.getElementById('addCashModal')).hide();
  alert('Cash entry added successfully!');
}

// Calculate expected cash from added items (not sold items)
function calculateExpectedCash(branch, date) {
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  const grocerySales = JSON.parse(localStorage.getItem('grocerySales')) || [];
  const machineSales = JSON.parse(localStorage.getItem('machineSales')) || [];
  const items = JSON.parse(localStorage.getItem('items')) || [];
  
  let expected = 0;
  const key = `${date}_${branch}`;
  
  // Calculate from normal items - use added quantity minus returned minus transferred
  if (stocks[key]) {
      Object.keys(stocks[key]).forEach(code => {
          const entry = stocks[key][code];
          const item = items.find(i => i.code === code);
          
          if (item && item.itemType === 'Normal Item') {
              // Calculate available quantity (added - returned - transferred out)
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
  
  // Grocery expected cash should be the total of grocery sales only
  grocerySales.forEach(sale => {
      if (sale.date === date && sale.branch === branch) {
          expected += Number(sale.totalCash || 0);
      }
  });
  
  // Add machine sales
  machineSales.forEach(sale => {
      if (sale.date === date && sale.branch === branch) {
          expected += sale.totalCash || 0;
      }
  });
  
  return expected;
}

// Load cash entries
function loadCashEntries() {
  const table = document.getElementById('cashTableBody');
  const historyBody = document.getElementById('cashHistoryBody');
  if (!table && !historyBody) return;

  const role = localStorage.getItem('role');
  const userId = localStorage.getItem('currentUserId');
  const cashEntries = JSON.parse(localStorage.getItem('cashEntries')) || [];

  // Filters
  const filterBranch = document.getElementById('cashFilterBranch')?.value || '';
  const filterDate = document.getElementById('cashFilterDate')?.value || '';
  const filtered = cashEntries.filter(e =>
    (!filterBranch || e.branch === filterBranch) &&
    (!filterDate || e.date === filterDate)
  );

  if (table) {
    // Admin sees reconciliation table
    const visible = role === 'admin';
    document.getElementById('adminOnlyNote')?.setAttribute('style', visible ? '' : 'display:none;');
    table.parentElement.parentElement.parentElement.style.display = visible ? '' : 'none';
    if (visible) {
      let rows = '';
      filtered.forEach(entry => {
        rows += `
          <tr>
            <td>${entry.date}</td>
            <td>${entry.branch}</td>
            <td>Rs ${Number(entry.expected || 0).toFixed(2)}</td>
            <td>Rs ${Number(entry.actual || 0).toFixed(2)}<div class="text-muted small">Cash: Rs ${Number(entry.actualCash||0).toFixed(2)} / Card: Rs ${Number(entry.cardPayment||0).toFixed(2)}</div></td>
            <td class="${entry.difference < 0 ? 'text-danger' : 'text-success'}">Rs ${Number(entry.difference||0).toFixed(2)}</td>
            <td><span class="badge ${entry.status === 'Match' ? 'bg-success' : entry.status === 'Overage' ? 'bg-warning' : 'bg-danger'}">${entry.status}</span></td>
            <td>${entry.operatorName || entry.operatorId || '-'}</td>
            <td>${entry.notes || '-'}</td>
          </tr>`;
      });
      table.innerHTML = rows || '<tr><td colspan="8" class="text-center">No cash entries available.</td></tr>';
    }
  }

  if (historyBody) {
    // Non-admins see their own history only
    const isAdmin = role === 'admin';
    document.getElementById('cashHistoryCard').style.display = isAdmin ? 'none' : '';
    // Allow admin to add cash entries as well
    const addBtn = document.getElementById('openAddCashBtn');
    if (addBtn) addBtn.style.display = '';
    if (!isAdmin) {
      const own = filtered.filter(e => (e.operatorId === userId) || (e.operatorId === role));
      let rows = '';
      own.forEach(entry => {
        rows += `
          <tr>
            <td>${entry.date}</td>
            <td>${entry.branch}</td>
            <td>Rs ${Number(entry.actualCash||0).toFixed(2)}${Number(entry.cardPayment||0)>0?` + " (Card: Rs ${Number(entry.cardPayment||0).toFixed(2)})" + `: ''}</td>
            <td>${entry.status}</td>
            <td>${entry.notes || '-'}</td>
          </tr>`;
      });
      historyBody.innerHTML = rows || '<tr><td colspan="5" class="text-center">No entries yet.</td></tr>';
    }
  }
}

// Initialize cash management page
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('cash-management.html')) {
      // role-based view setup and filters
      const branches = JSON.parse(localStorage.getItem('branches')) || [];
      const branchSelects = ['cashBranch','cashFilterBranch'];
      branchSelects.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.innerHTML = '<option value="">Select Branch</option>' + branches.map(b => `<option value="${b.name}">${b.name}</option>`).join('');
        }
      });

      document.getElementById('cashDate').value = getCurrentDate();
      document.getElementById('cashFilterDate').value = getCurrentDate();

      ['cashFilterBranch','cashFilterDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', loadCashEntries);
      });

      loadCashEntries();
      
      // Non-admins should not see reconciliation table, handled in loadCashEntries

      // Clear form when modal is opened
      const addCashModal = document.getElementById('addCashModal');
      if (addCashModal) {
        addCashModal.addEventListener('show.bs.modal', () => {
          clearCashEntryForm();
          enforceSingleEntryUI();
        });
      }

      // Live updates across tabs/windows
      window.addEventListener('storage', (e) => {
        if (['cashEntries','stocks','grocerySales','machineBatches','machineSales','groceryReturns'].includes(e.key)) {
          loadCashEntries();
        }
      });
  }
});

// Enforce at most one cash entry per branch+date at UI level
function enforceSingleEntryUI() {
  const branchEl = document.getElementById('cashBranch');
  const dateEl = document.getElementById('cashDate');
  const form = document.querySelector('#addCashModal form');
  if (!branchEl || !dateEl || !form) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const update = () => {
    const branch = branchEl.value;
    const date = dateEl.value;
    const cashEntries = JSON.parse(localStorage.getItem('cashEntries')) || [];
    const exists = branch && date && cashEntries.some(e => e.branch === branch && e.date === date);
    if (submitBtn) {
      submitBtn.disabled = !!exists;
      submitBtn.title = exists ? 'A cash entry already exists for this branch and date' : '';
    }
  };

  branchEl.removeEventListener('change', enforceSingleEntryUI._onChange);
  dateEl.removeEventListener('change', enforceSingleEntryUI._onChange);
  enforceSingleEntryUI._onChange = update;

  branchEl.addEventListener('change', update);
  dateEl.addEventListener('change', update);

  // Initial state
  update();
}

// Validate preconditions for saving cash entry
function validateCashPreconditions(branch, date) {
  // Ensure normal items entries updated at least once (sold computed from added-returned ok)
  const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const keyPrefix = `${date}_${branch}`;
  const entries = stocks[keyPrefix] || {};
  let hasAnyNormal = false;
  Object.keys(entries).forEach(code => {
    const item = items.find(i => i.code === code);
    if (item && item.itemType === 'Normal Item') {
      hasAnyNormal = true;
    }
  });

  // Normal items batch must be finished for the day and branch
  const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};
  const normalBatchFinished = !!finishedBatches[keyPrefix];

  // Machine rule: if any machine has been started (active) for the branch/date, block until finished
  const machineBatches = JSON.parse(localStorage.getItem('machineBatches')) || [];
  const hasActiveMachine = machineBatches.some(b => b.branch === branch && b.date === date && b.status === 'active');

  // Returns completed check: ensure all return forms saved for that date (proxy by presence of any returns with that date imply handled)
  const groceryReturns = JSON.parse(localStorage.getItem('groceryReturns')) || [];
  const returnsOk = groceryReturns.filter(r => r.branch === branch && r.date === date).every(r => r.completed === true || r.returnedQty >= 0);

  // Normal items: only enforce finish if any normal items were added
  if (hasAnyNormal && !normalBatchFinished) return { ok: false, message: 'Please finish the Normal Items batch before saving cash entry.' };
  // Grocery updates requirement removed: grocery activity is not mandatory for cash entry
  // Machine: only block when a machine is started but not yet ended
  if (hasActiveMachine) return { ok: false, message: 'Please finish active machine batches before cash entry.' };
  if (!returnsOk) return { ok: false, message: 'Please complete all return sections for the day.' };

  return { ok: true };
}