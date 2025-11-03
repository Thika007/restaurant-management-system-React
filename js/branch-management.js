// branch-management.js - Branch Management Functions

// Clear add branch form
function clearBranchForm() {
  document.getElementById('originalBranchName').value = '';
  document.getElementById('branchName').value = '';
  document.getElementById('branchAddress').value = '';
  document.getElementById('managerName').value = '';
  document.getElementById('branchPhone').value = '';
  document.getElementById('branchEmail').value = '';
  
  // Reset modal title and button text for add mode
  document.getElementById('branchModalTitle').textContent = 'Add New Branch';
  document.getElementById('branchSubmitButton').textContent = 'Save Branch';
}

// Save branch (handles both add and edit)
function saveBranch() {
  const originalName = document.getElementById('originalBranchName').value;
  const name = document.getElementById('branchName').value;
  const address = document.getElementById('branchAddress').value;
  const manager = document.getElementById('managerName').value;
  const phone = document.getElementById('branchPhone').value;
  const email = document.getElementById('branchEmail').value;

  if (!name || !address || !manager) {
      alert('Please fill all required fields.');
      return;
  }

  let branches = JSON.parse(localStorage.getItem('branches')) || [];
  const isEditMode = originalName !== '';
  
  if (isEditMode) {
    // Edit mode - update existing branch
    const index = branches.findIndex(branch => branch.name === originalName);
    if (index === -1) {
      alert('Branch not found.');
      return;
    }
    
    // Check if new name conflicts with another branch (but not the one being edited)
    const nameConflict = branches.find(branch => branch.name === name && branch.name !== originalName);
    if (nameConflict) {
      alert('A branch with this name already exists.');
      return;
    }
    
    branches[index] = {name, address, manager, phone, email};
    localStorage.setItem('branches', JSON.stringify(branches));
    alert('Branch updated successfully!');
  } else {
    // Add mode - create new branch
    const existingBranch = branches.find(branch => branch.name === name);
    if (existingBranch) {
      alert('A branch with this name already exists.');
      return;
    }
    
    branches.push({name, address, manager, phone, email});
    localStorage.setItem('branches', JSON.stringify(branches));
    alert('Branch added successfully!');
  }
  
  loadBranches();
  clearBranchForm();
  bootstrap.Modal.getInstance(document.getElementById('addBranchModal')).hide();
  
  // Refresh branches in dropdowns across the system
  loadBranchesForDropdowns();
}

// Open add branch modal
function openAddBranchModal() {
  clearBranchForm();
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addBranchModal'));
  modal.show();
}

// Add branch (wrapper for backward compatibility) - This is called by the form, but saveBranch handles everything
function addBranch() {
  // This function is kept for backward compatibility
  // The form now calls saveBranch() directly
  saveBranch();
}

// Load branches
function loadBranches() {
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  const branchList = document.getElementById('branchList');
  
  if (!branchList) return;
  
  if (branches.length === 0) {
      branchList.innerHTML = '<div class="col-12"><div class="alert alert-info">No branches available. Add your first branch.</div></div>';
      return;
  }
  
  branchList.innerHTML = branches.map(branch => `
      <div class="col-md-6 col-lg-4 mb-4">
          <div class="card h-100">
              <div class="card-header bg-primary text-white">
                  <h5 class="card-title mb-0">${branch.name}</h5>
              </div>
              <div class="card-body">
                  <p class="card-text"><strong>Address:</strong> ${branch.address}</p>
                  <p class="card-text"><strong>Manager:</strong> ${branch.manager}</p>
                  <p class="card-text"><strong>Phone:</strong> ${branch.phone || '-'}</p>
                  <p class="card-text"><strong>Email:</strong> ${branch.email || '-'}</p>
              </div>
              <div class="card-footer">
                  <button class="btn btn-sm btn-outline-primary" onclick="editBranch('${branch.name}')">
                      <i class="fas fa-edit me-1"></i>Edit
                  </button>
                  <button class="btn btn-sm btn-outline-danger float-end" onclick="deleteBranch('${branch.name}')">
                      <i class="fas fa-trash me-1"></i>Delete
                  </button>
              </div>
          </div>
      </div>
  `).join('');
}

// Edit branch - load branch data into the form
function editBranch(branchName) {
  const branches = JSON.parse(localStorage.getItem('branches')) || [];
  const branch = branches.find(b => b.name === branchName);
  
  if (!branch) {
    alert('Branch not found.');
    return;
  }
  
  // Populate form with branch data
  document.getElementById('originalBranchName').value = branch.name;
  document.getElementById('branchName').value = branch.name;
  document.getElementById('branchAddress').value = branch.address || '';
  document.getElementById('managerName').value = branch.manager || '';
  document.getElementById('branchPhone').value = branch.phone || '';
  document.getElementById('branchEmail').value = branch.email || '';
  
  // Update modal title and button text for edit mode
  document.getElementById('branchModalTitle').textContent = 'Edit Branch';
  document.getElementById('branchSubmitButton').textContent = 'Update Branch';
  
  // Show the modal
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addBranchModal'));
  modal.show();
}

// Delete branch
function deleteBranch(branchName) {
  if (!confirm(`Are you sure you want to delete ${branchName}? This action cannot be undone.`)) {
      return;
  }
  
  let branches = JSON.parse(localStorage.getItem('branches')) || [];
  branches = branches.filter(branch => branch.name !== branchName);
  localStorage.setItem('branches', JSON.stringify(branches));
  loadBranches();
  alert('Branch deleted successfully!');
  
  // Refresh branches in dropdowns across the system
  loadBranchesForDropdowns();
}

// Initialize branch management page
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('branch-management.html')) {
      loadBranches();
      
      // When modal is closed, clear the form to prepare for next use
      const addBranchModal = document.getElementById('addBranchModal');
      if (addBranchModal) {
        addBranchModal.addEventListener('hidden.bs.modal', clearBranchForm);
      }
  }
});