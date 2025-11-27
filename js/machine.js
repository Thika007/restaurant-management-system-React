// machine.js - Machine Management Functions

// Initialize machine data
function initMachineData() {
  if (!localStorage.getItem('machineBatches')) {
      localStorage.setItem('machineBatches', JSON.stringify([]));
  }
  if (!localStorage.getItem('machineSales')) {
      localStorage.setItem('machineSales', JSON.stringify([]));
  }
}

// Load machines for the add-stock page
function loadMachines() {
  const branch = document.getElementById('branchSelect')?.value;
  const items = JSON.parse(localStorage.getItem('items')) || [];
  const machines = items.filter(item => item.itemType === 'Machine');
  const tableBody = document.getElementById('machineStockTableBody');
  
  if (!tableBody) return;
  
  // Check if branches are available
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  if (branches.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">No branches available. Please add branches first before managing stock.</td></tr>';
    return;
  }
  
  // Check if branch is selected
  if (!branch) {
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-warning">Please select a branch first.</td></tr>';
    return;
  }
  
  if (machines.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" class="text-center">No machines available.</td></tr>';
      return;
  }
  
  // Get active batches for the current branch to check status
  const machineBatches = JSON.parse(localStorage.getItem('machineBatches')) || [];
  
  tableBody.innerHTML = machines.map(machine => {
      // Check if this machine has an active batch for the current branch
      const activeBatch = machineBatches.find(b => 
          b.machineCode === machine.code && 
          b.branch === branch && 
          b.status === 'active'
      );
      
      const statusText = activeBatch ? 'Active' : 'Not Started';
      const statusClass = activeBatch ? 'text-success' : '';
      
      return `
      <tr>
          <td>${machine.name}</td>
          <td>Rs ${machine.price.toFixed(2)}</td>
          <td id="machineStatus_${machine.code}" class="${statusClass}">${statusText}</td>
          <td>
              <button class="btn btn-primary btn-sm select-machine" 
                      data-code="${machine.code}" 
                      data-name="${machine.name}"
                      data-price="${machine.price}">
                  Select Machine
              </button>
          </td>
      </tr>
  `;
  }).join('');
  
  // Add event listeners to the buttons
  document.querySelectorAll('.select-machine').forEach(btn => {
      btn.addEventListener('click', () => {
          const code = btn.dataset.code;
          const name = btn.dataset.name;
          const price = btn.dataset.price;
          showMachineStartModal(code, name, price);
      });
  });
}

// Show machine start modal
function showMachineStartModal(code, name, price) {
  document.getElementById('machineStartCode').value = code;
  document.getElementById('machineStartName').textContent = name;
  document.getElementById('machineStartPrice').textContent = `Rs ${price}`;
  document.getElementById('machineStartValue').value = '';
  // Always set today's date as default - user can change it if needed
  document.getElementById('machineStartDate').value = getCurrentDate();
  
  // Check if there's an active batch for this machine AND current branch
  const machineBatches = JSON.parse(localStorage.getItem('machineBatches')) || [];
  const branch = document.getElementById('branchSelect')?.value;
  const activeBatch = machineBatches.find(batch => 
      batch.machineCode === code && batch.status === 'active' && batch.branch === branch
  );
  
  if (activeBatch) {
      document.getElementById('machineStartValue').value = activeBatch.startValue;
      // Keep today's date as default even when updating - user can change it
      document.getElementById('machineStartDate').value = getCurrentDate();
      document.getElementById('updateStartBtn').style.display = 'block';
      document.getElementById('startMachineBtn').style.display = 'none';
      document.getElementById('machineStartStatus').textContent = 'Active Batch Exists';
  } else {
      document.getElementById('updateStartBtn').style.display = 'none';
      document.getElementById('startMachineBtn').style.display = 'block';
      // Default start value to last completed end value for this machine and current branch
      let lastEnd = null;
      if (branch) {
        const completed = machineBatches
          .filter(b => b.machineCode === code && b.branch === branch && b.status === 'completed' && typeof b.endValue === 'number')
          .sort((a,b) => new Date(b.endTime || b.date).getTime() - new Date(a.endTime || a.date).getTime());
        if (completed.length > 0) lastEnd = completed[0].endValue;
      }
      if (lastEnd != null) {
        document.getElementById('machineStartValue').value = lastEnd;
        document.getElementById('machineStartStatus').textContent = 'Ready (prefilled from last end value)';
      } else {
        document.getElementById('machineStartStatus').textContent = 'Ready to Start';
      }
  }
  
  bootstrap.Modal.getOrCreateInstance(document.getElementById('startMachineModal')).show();
}

// Update machine start value
function updateMachineStartValue() {
  // Check if branches are available
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  if (branches.length === 0) {
    alert('No branches available. Please add branches first before managing stock.');
    return;
  }

  const machineCode = document.getElementById('machineStartCode').value;
  const startValue = parseInt(document.getElementById('machineStartValue').value) || 0;
  const date = document.getElementById('machineStartDate').value;
  const branch = document.getElementById('branchSelect').value;
  
  if (!machineCode || isNaN(startValue) || startValue < 0) {
      alert('Please enter a valid start value.');
      return;
  }
  
  if (!branch) {
      alert('Please select a branch first.');
      return;
  }
  
  let machineBatches = JSON.parse(localStorage.getItem('machineBatches')) || [];
  // Fix: Check both machineCode AND branch to prevent updating wrong machine
  const batchIndex = machineBatches.findIndex(batch => 
      batch.machineCode === machineCode && batch.status === 'active' && batch.branch === branch
  );
  
  if (batchIndex !== -1) {
      machineBatches[batchIndex].startValue = startValue;
      machineBatches[batchIndex].date = date;
      localStorage.setItem('machineBatches', JSON.stringify(machineBatches));
      alert('Start value updated successfully!');
      bootstrap.Modal.getInstance(document.getElementById('startMachineModal')).hide();
      loadMachines();
  } else {
      alert('Active batch not found for this machine and branch.');
  }
}

// Start machine batch
function startMachineBatch() {
  // Check if branches are available
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  if (branches.length === 0) {
    alert('No branches available. Please add branches first before managing stock.');
    return;
  }

  const machineCode = document.getElementById('machineStartCode').value;
  const startValue = parseInt(document.getElementById('machineStartValue').value) || 0;
  const date = document.getElementById('machineStartDate').value;
  const branch = document.getElementById('branchSelect').value;
  
  if (!machineCode || isNaN(startValue) || startValue < 0) {
      alert('Please enter a valid start value.');
      return;
  }
  
  if (!branch) {
      alert('Please select a branch first.');
      return;
  }
  
  let machineBatches = JSON.parse(localStorage.getItem('machineBatches')) || [];
  
  // Check if there's already an active batch for this machine AND branch
  const existingBatch = machineBatches.find(batch => 
      batch.machineCode === machineCode && batch.status === 'active' && batch.branch === branch
  );
  
  if (existingBatch) {
      alert('This machine already has an active batch for this branch. Please update instead.');
      return;
  }
  
  // Create new batch
  const batch = {
      id: 'B' + Date.now(),
      machineCode,
      startValue,
      endValue: null,
      date,
      branch,
      status: 'active',
      startTime: new Date().toISOString()
  };
  
  machineBatches.push(batch);
  localStorage.setItem('machineBatches', JSON.stringify(machineBatches));
  
  // Update machine status
  const statusElement = document.getElementById(`machineStatus_${machineCode}`);
  if (statusElement) {
      statusElement.textContent = 'Active';
      statusElement.className = 'text-success';
  }
  
  alert('Machine batch started successfully!');
  bootstrap.Modal.getInstance(document.getElementById('startMachineModal')).hide();
  loadMachines();
}

// Load machines for return page
function loadMachineReturns() {
  const branch = document.getElementById('returnBranchSelect')?.value;
  const date = document.getElementById('returnDate')?.value || getCurrentDate();
  const machineBatches = JSON.parse(localStorage.getItem('machineBatches')) || [];
  const items = JSON.parse(localStorage.getItem('items')) || [];
  
  const tableBody = document.getElementById('machineReturnTableBody');
  if (!tableBody) return;
  
  // Filter active batches for selected branch and date
  const activeBatches = machineBatches.filter(batch => 
      batch.status === 'active' && 
      batch.branch === branch &&
      batch.date === date
  );
  
  if (activeBatches.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No active machine batches.</td></tr>';
      return;
  }
  
  tableBody.innerHTML = activeBatches.map(batch => {
      const machine = items.find(item => item.code === batch.machineCode);
      return `
          <tr>
              <td>${machine ? machine.name : 'Unknown Machine'}</td>
              <td>${batch.startValue}</td>
              <td><input type="number" class="form-control" id="endValue_${batch.id}" value="${batch.startValue}" min="${batch.startValue}"></td>
              <td>Rs ${machine ? machine.price.toFixed(2) : '0.00'}</td>
              <td>
                  <button class="btn btn-success btn-sm" onclick="finishMachineBatch('${batch.id}')">
                      Finish Batch
                  </button>
              </td>
          </tr>
      `;
  }).join('');
}

// Finish machine batch
function finishMachineBatch(batchId) {
  const endValueInput = document.getElementById(`endValue_${batchId}`);
  const endValue = parseInt(endValueInput.value) || 0;
  
  if (endValue < 0) {
      alert('Please enter a valid end value.');
      return;
  }
  
  let machineBatches = JSON.parse(localStorage.getItem('machineBatches')) || [];
  let machineSales = JSON.parse(localStorage.getItem('machineSales')) || [];
  const items = JSON.parse(localStorage.getItem('items')) || [];
  
  const batchIndex = machineBatches.findIndex(batch => batch.id === batchId);
  
  if (batchIndex === -1) {
      alert('Batch not found.');
      return;
  }
  
  const batch = machineBatches[batchIndex];
  
  if (endValue < batch.startValue) {
      alert('End value cannot be less than start value.');
      return;
  }
  
  const soldQty = endValue - batch.startValue;
  const machine = items.find(item => item.code === batch.machineCode);
  
  if (!machine) {
      alert('Machine details not found.');
      return;
  }
  
  // Update batch with completion timestamp
  batch.endValue = endValue;
  batch.status = 'completed';
  batch.endTime = new Date().toISOString(); // Add precise timestamp
  
  // Record sale with timestamp
  machineSales.push({
      machineCode: batch.machineCode,
      machineName: machine.name,
      date: batch.date,
      branch: batch.branch,
      startValue: batch.startValue,
      endValue: batch.endValue,
      soldQty: soldQty,
      unitPrice: machine.price,
      totalCash: soldQty * machine.price,
      timestamp: new Date().toISOString() // Add precise timestamp
  });

  // Update UI status on add-stock machine table
  const statusElement = document.getElementById(`machineStatus_${batch.machineCode}`);
  if (statusElement) {
    statusElement.textContent = 'Completed';
    statusElement.className = 'text-muted';
  }
  
  localStorage.setItem('machineBatches', JSON.stringify(machineBatches));
  localStorage.setItem('machineSales', JSON.stringify(machineSales));
  
  alert(`Batch completed! Sold ${soldQty} units. Total: Rs ${(soldQty * machine.price).toFixed(2)}`);
  loadMachineReturns();
}

// Initialize machine data on page load
document.addEventListener('DOMContentLoaded', () => {
  initMachineData();
  
  if (window.location.pathname.includes('add-stock.html')) {
      loadMachines();
      
      // Reload machines when branch changes
      const branchSelect = document.getElementById('branchSelect');
      if (branchSelect) {
          branchSelect.addEventListener('change', loadMachines);
      }
  }
  
  if (window.location.pathname.includes('add-return.html')) {
      loadMachineReturns();
      document.getElementById('returnBranchSelect')?.addEventListener('change', loadMachineReturns);
      document.getElementById('returnDate')?.addEventListener('change', loadMachineReturns);
  }
});