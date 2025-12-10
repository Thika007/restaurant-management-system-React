// user-management.js - User Management Functions

// Format date for display
function formatDate(dateString) {
  if (!dateString || dateString === 'Never') {
    return 'Never';
  }
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString; // Return original if invalid date
    }
    
    // Format: "Nov 30, 2025 11:45 PM"
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    return date.toLocaleString('en-US', options);
  } catch (error) {
    return dateString; // Return original if formatting fails
  }
}

// Clear add user form
function clearUserForm() {
  document.getElementById('userName').value = '';
  document.getElementById('userEmail').value = '';
  document.getElementById('userPassword').value = '';
  
  // Uncheck all access checkboxes
  const accessCheckboxes = document.querySelectorAll('#accessCheckboxes input[name="accesses"]');
  accessCheckboxes.forEach(checkbox => checkbox.checked = false);
  
  // Uncheck all branch checkboxes
  const branchCheckboxes = document.querySelectorAll('#branchCheckboxes input[name="branches"]');
  branchCheckboxes.forEach(checkbox => checkbox.checked = false);
}

// Add user
function addUser() {
  const username = document.getElementById('userName').value.trim();
  const fullName = document.getElementById('userEmail').value.trim();
  const password = document.getElementById('userPassword').value;

  if (!username || !fullName || !password) {
      alert('Please fill all required fields.');
      return;
  }

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const id = 'U' + (users.length + 1).toString().padStart(3, '0');
  const status = 'Active';
  const lastLogin = '';

  // Ensure unique username
  const existingUser = users.find(user => user.username && user.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
      alert('A user with this username already exists.');
      return;
  }

  // Collect accesses from checkboxes
  const accessElems = Array.from(document.querySelectorAll('#accessCheckboxes input[name="accesses"]'));
  const accesses = accessElems.filter(el => el.checked).map(el => el.value);

  // Collect assigned branches from checkboxes
  const branchElems = Array.from(document.querySelectorAll('#branchCheckboxes input[name="branches"]'));
  const assignedBranches = branchElems.filter(el => el.checked).map(el => el.value);

  // Use assigned branches as expire tracking branches
  const expireTrackingBranches = assignedBranches;

  users.push({id, username, fullName, password, accesses, assignedBranches, expireTrackingBranches, status, lastLogin});
  localStorage.setItem('users', JSON.stringify(users));
  loadUsers();
  clearUserForm();
  bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
  alert('User added successfully!');
}

// Load users
function loadUsers() {
  if (!document.getElementById('userTableBody')) return;
  
  const users = JSON.parse(localStorage.getItem('users')) || [];
  let tableBody = '';
  
  users.forEach(user => {
      tableBody += `
          <tr>
              <td>${user.id}</td>
              <td>${user.username || '-'}</td>
              <td>${user.fullName || '-'}</td>
              <td>${(user.accesses || []).join(', ') || '-'}</td>
              <td>${(user.assignedBranches || []).join(', ') || '-'}</td>
              <td>
                  <span class="badge bg-success">${user.status}</span>
              </td>
              <td>${formatDate(user.lastLogin)}</td>
              <td>
                  <button class="btn btn-sm btn-primary me-1" onclick="editUser('${user.id}')">
                      <i class="fas fa-edit"></i>
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')">
                      <i class="fas fa-trash"></i>
                  </button>
              </td>
          </tr>
      `;
  });
  
  document.getElementById('userTableBody').innerHTML = tableBody || '<tr><td colspan="8" class="text-center">No users available.</td></tr>';
}

// Edit user
function editUser(userId) {
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const user = users.find(u => u.id === userId);
  
  if (!user) {
    alert('User not found.');
    return;
  }
  
  // Populate form fields
  document.getElementById('editUserId').value = user.id;
  document.getElementById('editUserName').value = user.username || '';
  document.getElementById('editFullName').value = user.fullName || '';
  document.getElementById('editPassword').value = '';
  document.getElementById('editUserStatus').value = user.status || 'Active';
  
  // Populate access checkboxes
  const accessCheckboxes = document.querySelectorAll('#editAccessCheckboxes input[name="editAccesses"]');
  accessCheckboxes.forEach(checkbox => {
    checkbox.checked = user.accesses && user.accesses.includes(checkbox.value);
  });
  
  // Populate branch checkboxes
  const branchCheckboxes = document.querySelectorAll('#editBranchCheckboxes input[name="editBranches"]');
  branchCheckboxes.forEach(checkbox => {
    checkbox.checked = user.assignedBranches && user.assignedBranches.includes(checkbox.value);
  });
  
  // Open modal
  const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
  modal.show();
}

// Update user
function updateUser() {
  const userId = document.getElementById('editUserId').value;
  const username = document.getElementById('editUserName').value.trim();
  const fullName = document.getElementById('editFullName').value.trim();
  const password = document.getElementById('editPassword').value;
  const status = document.getElementById('editUserStatus').value;
  
  if (!username || !fullName) {
    alert('Please fill all required fields.');
    return;
  }
  
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    alert('User not found.');
    return;
  }
  
  // Check if username is already taken by another user
  const existingUser = users.find(u => u.id !== userId && u.username && u.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
    alert('A user with this username already exists.');
    return;
  }
  
  // Collect accesses from checkboxes
  const accessElems = Array.from(document.querySelectorAll('#editAccessCheckboxes input[name="editAccesses"]'));
  const accesses = accessElems.filter(el => el.checked).map(el => el.value);
  
  // Collect assigned branches from checkboxes
  const branchElems = Array.from(document.querySelectorAll('#editBranchCheckboxes input[name="editBranches"]'));
  const assignedBranches = branchElems.filter(el => el.checked).map(el => el.value);
  
  // Use assigned branches as expire tracking branches
  const expireTrackingBranches = assignedBranches;
  
  // Update user data
  users[userIndex].username = username;
  users[userIndex].fullName = fullName;
  if (password) {
    users[userIndex].password = password;
  }
  users[userIndex].status = status;
  users[userIndex].accesses = accesses;
  users[userIndex].assignedBranches = assignedBranches;
  users[userIndex].expireTrackingBranches = expireTrackingBranches;
  
  localStorage.setItem('users', JSON.stringify(users));
  loadUsers();
  bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
  alert('User updated successfully!');
}

// Delete user
function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?')) {
      return;
  }
  
  let users = JSON.parse(localStorage.getItem('users')) || [];
  users = users.filter(user => user.id !== userId);
  localStorage.setItem('users', JSON.stringify(users));
  loadUsers();
  alert('User deleted successfully!');
}

// Initialize user management page
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('user-management.html')) {
      loadUsers();
      // Populate branch checkboxes in add modal
      const branches = JSON.parse(localStorage.getItem('branches')) || [];
      const container = document.getElementById('branchCheckboxes');
      if (container) {
          container.innerHTML = branches.length === 0 ? '<div class="text-muted small">No branches available</div>' : branches.map(b => `
              <div class="col">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="branch_${b.name}" name="branches" value="${b.name}">
                  <label class="form-check-label" for="branch_${b.name}">${b.name}</label>
                </div>
              </div>
          `).join('');
      }
      
      // Populate branch checkboxes in edit modal
      const editContainer = document.getElementById('editBranchCheckboxes');
      if (editContainer) {
          editContainer.innerHTML = branches.length === 0 ? '<div class="text-muted small">No branches available</div>' : branches.map(b => `
              <div class="col">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="edit_branch_${b.name}" name="editBranches" value="${b.name}">
                  <label class="form-check-label" for="edit_branch_${b.name}">${b.name}</label>
                </div>
              </div>
          `).join('');
      }
      
      // Clear form when modal is opened
      const addUserModal = document.getElementById('addUserModal');
      if (addUserModal) {
        addUserModal.addEventListener('show.bs.modal', clearUserForm);
      }
  }
});