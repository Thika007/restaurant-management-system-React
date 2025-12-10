import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { usersAPI, branchesAPI } from '../services/api';

// Format date for display
const formatDate = (dateString) => {
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
};

const UserManagement = () => {
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [userToDelete, setUserToDelete] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  // Form states for Add User
  const [addFormData, setAddFormData] = useState({
    username: '',
    fullName: '',
    password: '',
    confirmPassword: '',
    accesses: [],
    assignedBranches: []
  });

  // Form states for Edit User
  const [editFormData, setEditFormData] = useState({
    username: '',
    fullName: '',
    password: '',
    confirmPassword: '',
    status: 'Active',
    accesses: [],
    assignedBranches: []
  });

  // Available access options
  const accessOptions = [
    'Dashboard',
    'Master Creation',
    'Add Item Stock',
    'Internal Transfer',
    'Add Return Stock',
    'Cash Management',
    'Reports',
    'Expire Tracking',
    'Branch Management',
    'User Management'
  ];

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [usersRes, branchesRes] = await Promise.all([
        usersAPI.getAll(),
        branchesAPI.getAll()
      ]);

      if (usersRes.data.success) {
        setUsers(usersRes.data.users);
      }
      if (branchesRes.data.success) {
        setBranches(branchesRes.data.branches);
      }
    } catch (error) {
      console.error('Load initial data error:', error);
      showError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setAddFormData({
      username: '',
      fullName: '',
      password: '',
      confirmPassword: '',
      accesses: [],
      assignedBranches: []
    });
    setShowAddModal(true);
  };

  const openEditModal = async (userId) => {
    try {
      const response = await usersAPI.getById(userId);
      if (response.data.success) {
        const user = response.data.user;
        setEditingUser(user);
        
        // If user is admin, automatically set all accesses and all branches
        const isAdmin = user.role === 'admin';
        const finalAccesses = isAdmin ? accessOptions : (user.accesses || []);
        const finalBranches = isAdmin ? branches.map(b => b.name) : (user.assignedBranches || []);
        
        setEditFormData({
          username: user.username || '',
          fullName: user.fullName || '',
          password: '',
          confirmPassword: '',
          status: user.status || 'Active',
          accesses: finalAccesses,
          assignedBranches: finalBranches
        });
        setShowEditModal(true);
      }
    } catch (error) {
      console.error('Load user error:', error);
      showError('Failed to load user data');
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddFormData({
      username: '',
      fullName: '',
      password: '',
      confirmPassword: '',
      accesses: [],
      assignedBranches: []
    });
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingUser(null);
    setEditFormData({
      username: '',
      fullName: '',
      password: '',
      confirmPassword: '',
      status: 'Active',
      accesses: [],
      assignedBranches: []
    });
  };

  const handleAddAccessChange = (access, checked) => {
    setAddFormData(prev => ({
      ...prev,
      accesses: checked
        ? [...prev.accesses, access]
        : prev.accesses.filter(a => a !== access)
    }));
  };

  const handleEditAccessChange = (access, checked) => {
    // Don't allow changes if user is admin
    if (editingUser && editingUser.role === 'admin') {
      return;
    }
    
    setEditFormData(prev => ({
      ...prev,
      accesses: checked
        ? [...prev.accesses, access]
        : prev.accesses.filter(a => a !== access)
    }));
  };

  const handleAddBranchChange = (branchName, checked) => {
    setAddFormData(prev => ({
      ...prev,
      assignedBranches: checked
        ? [...prev.assignedBranches, branchName]
        : prev.assignedBranches.filter(b => b !== branchName)
    }));
  };

  const handleEditBranchChange = (branchName, checked) => {
    // Don't allow changes if user is admin
    if (editingUser && editingUser.role === 'admin') {
      return;
    }
    
    setEditFormData(prev => ({
      ...prev,
      assignedBranches: checked
        ? [...prev.assignedBranches, branchName]
        : prev.assignedBranches.filter(b => b !== branchName)
    }));
  };

  const handleAddUser = async (e) => {
    e.preventDefault();

    if (!addFormData.username || !addFormData.fullName || !addFormData.password || !addFormData.confirmPassword) {
      showWarning('Please fill all required fields.');
      return;
    }

    if (addFormData.password !== addFormData.confirmPassword) {
      showWarning('Password and Confirm Password do not match.');
      return;
    }

    if (addFormData.password.length < 6) {
      showWarning('Password must be at least 6 characters long.');
      return;
    }

    try {
      const response = await usersAPI.create({
        username: addFormData.username.trim(),
        fullName: addFormData.fullName.trim(),
        password: addFormData.password,
        accesses: addFormData.accesses,
        assignedBranches: addFormData.assignedBranches
      });

      if (response.data.success) {
        const message = `User "${addFormData.fullName}" (${addFormData.username}) created successfully!`;
        setSuccessMessage(message);
        setShowSuccessModal(true);
        closeAddModal();
        loadInitialData();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to create user';
      showError(message);
      console.error('Create user error:', error);
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();

    if (!editFormData.username || !editFormData.fullName) {
      showWarning('Please fill all required fields.');
      return;
    }

    // If password is provided, validate it
    if (editFormData.password) {
      if (editFormData.password !== editFormData.confirmPassword) {
        showWarning('Password and Confirm Password do not match.');
        return;
      }
      if (editFormData.password.length < 6) {
        showWarning('Password must be at least 6 characters long.');
        return;
      }
    }

    try {
      // If user is admin, automatically set all accesses and all branches
      const isAdmin = editingUser && editingUser.role === 'admin';
      const finalAccesses = isAdmin ? accessOptions : editFormData.accesses;
      const finalBranches = isAdmin ? branches.map(b => b.name) : editFormData.assignedBranches;
      
      const updateData = {
        username: editFormData.username.trim(),
        fullName: editFormData.fullName.trim(),
        status: editFormData.status,
        accesses: finalAccesses,
        assignedBranches: finalBranches
      };

      // Only include password if it was provided
      if (editFormData.password) {
        updateData.password = editFormData.password;
      }

      const response = await usersAPI.update(editingUser.id, updateData);

      if (response.data.success) {
        const message = `User "${editFormData.fullName}" (${editFormData.username}) updated successfully!`;
        setSuccessMessage(message);
        setShowSuccessModal(true);
        closeEditModal();
        loadInitialData();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update user';
      showError(message);
      console.error('Update user error:', error);
    }
  };

  const handleDeleteClick = (userId) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setUserToDelete({ id: userId, username: user.username || 'Unknown', fullName: user.fullName || 'Unknown' });
      setShowDeleteModal(true);
    }
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setUserToDelete(null);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;

    try {
      const response = await usersAPI.delete(userToDelete.id);
      if (response.data.success) {
        const message = `User "${userToDelete.fullName}" (${userToDelete.username}) deleted successfully!`;
        setSuccessMessage(message);
        setShowSuccessModal(true);
        closeDeleteModal();
        loadInitialData();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to delete user';
      showError(message);
      console.error('Delete user error:', error);
      closeDeleteModal();
    }
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setSuccessMessage('');
  };

  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>User Management</h2>
        <button className="btn btn-primary" onClick={openAddModal}>
          Add New User
        </button>
      </div>

      <table className="table mt-3">
        <thead>
          <tr>
            <th>User ID</th>
            <th>Username</th>
            <th>Full Name</th>
            <th>Role</th>
            <th>Accesses</th>
            <th>Branches</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan="9" className="text-center">No users available.</td>
            </tr>
          ) : (
            users.map(user => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username || '-'}</td>
                <td>{user.fullName || '-'}</td>
                <td>
                  <span className="badge bg-info">{user.role || 'custom'}</span>
                </td>
                <td>
                  {(user.accesses || []).length > 0 
                    ? (user.accesses || []).join(', ') 
                    : '-'}
                </td>
                <td>
                  {(user.assignedBranches || []).length > 0 
                    ? (user.assignedBranches || []).join(', ') 
                    : '-'}
                </td>
                <td>
                  <span className={`badge ${user.status === 'Active' ? 'bg-success' : 'bg-secondary'}`}>
                    {user.status || 'Active'}
                  </span>
                </td>
                <td>{formatDate(user.lastLogin)}</td>
                <td>
                  <button
                    className="btn btn-sm btn-primary me-1"
                    onClick={() => openEditModal(user.id)}
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeleteClick(user.id)}
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add New User</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closeAddModal}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleAddUser}>
                  <div className="mb-3">
                    <label htmlFor="userName" className="form-label">
                      Username <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="userName"
                      value={addFormData.username}
                      onChange={(e) => setAddFormData({ ...addFormData, username: e.target.value })}
                      placeholder="Enter username"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="userFullName" className="form-label">
                      Full Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="userFullName"
                      value={addFormData.fullName}
                      onChange={(e) => setAddFormData({ ...addFormData, fullName: e.target.value })}
                      placeholder="Enter full name"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="userPassword" className="form-label">
                      Password <span className="text-danger">*</span>
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      id="userPassword"
                      value={addFormData.password}
                      onChange={(e) => setAddFormData({ ...addFormData, password: e.target.value })}
                      placeholder="Enter password"
                      required
                      minLength="6"
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="userConfirmPassword" className="form-label">
                      Confirm Password <span className="text-danger">*</span>
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      id="userConfirmPassword"
                      value={addFormData.confirmPassword}
                      onChange={(e) => setAddFormData({ ...addFormData, confirmPassword: e.target.value })}
                      placeholder="Confirm password"
                      required
                      minLength="6"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Access</label>
                    <div className="row row-cols-1 row-cols-md-2 g-2">
                      {accessOptions.map(access => (
                        <div key={access} className="col">
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={`access_${access.replace(/\s+/g, '_')}`}
                              checked={addFormData.accesses.includes(access)}
                              onChange={(e) => handleAddAccessChange(access, e.target.checked)}
                            />
                            <label
                              className="form-check-label"
                              htmlFor={`access_${access.replace(/\s+/g, '_')}`}
                            >
                              {access}
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Assigned Branches</label>
                    <div className="row row-cols-1 row-cols-md-2 g-2">
                      {branches.length === 0 ? (
                        <div className="text-muted small">No branches available</div>
                      ) : (
                        branches.map(branch => (
                          <div key={branch.name} className="col">
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`branch_${branch.name}`}
                                checked={addFormData.assignedBranches.includes(branch.name)}
                                onChange={(e) => handleAddBranchChange(branch.name, e.target.checked)}
                              />
                              <label
                                className="form-check-label"
                                htmlFor={`branch_${branch.name}`}
                              >
                                {branch.name}
                              </label>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={closeAddModal}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Save User
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit User</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closeEditModal}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleEditUser}>
                  <div className="mb-3">
                    <label htmlFor="editUserName" className="form-label">
                      Username <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="editUserName"
                      value={editFormData.username}
                      onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                      placeholder="Enter username"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editFullName" className="form-label">
                      Full Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="editFullName"
                      value={editFormData.fullName}
                      onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                      placeholder="Enter full name"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editPassword" className="form-label">
                      Password
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      id="editPassword"
                      value={editFormData.password}
                      onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                      placeholder="Leave blank to keep current password"
                      minLength="6"
                    />
                    <small className="text-muted">Leave blank if you don't want to change the password</small>
                  </div>
                  {editFormData.password && (
                    <div className="mb-3">
                      <label htmlFor="editConfirmPassword" className="form-label">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        className="form-control"
                        id="editConfirmPassword"
                        value={editFormData.confirmPassword}
                        onChange={(e) => setEditFormData({ ...editFormData, confirmPassword: e.target.value })}
                        placeholder="Confirm password"
                        minLength="6"
                      />
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="form-label">Access</label>
                    {editingUser && editingUser.role === 'admin' && (
                      <div className="alert alert-info mb-2">
                        <i className="fas fa-info-circle me-2"></i>
                        Admin users automatically have all access pages.
                      </div>
                    )}
                    <div className="row row-cols-1 row-cols-md-2 g-2">
                      {accessOptions.map(access => {
                        const isAdmin = editingUser && editingUser.role === 'admin';
                        const isChecked = isAdmin || editFormData.accesses.includes(access);
                        return (
                          <div key={access} className="col">
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`edit_access_${access.replace(/\s+/g, '_')}`}
                                checked={isChecked}
                                onChange={(e) => handleEditAccessChange(access, e.target.checked)}
                                disabled={isAdmin}
                              />
                              <label
                                className="form-check-label"
                                htmlFor={`edit_access_${access.replace(/\s+/g, '_')}`}
                              >
                                {access}
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Assigned Branches</label>
                    {editingUser && editingUser.role === 'admin' && (
                      <div className="alert alert-info mb-2">
                        <i className="fas fa-info-circle me-2"></i>
                        Admin users automatically have access to all branches.
                      </div>
                    )}
                    <div className="row row-cols-1 row-cols-md-2 g-2">
                      {branches.length === 0 ? (
                        <div className="text-muted small">No branches available</div>
                      ) : (
                        branches.map(branch => {
                          const isAdmin = editingUser && editingUser.role === 'admin';
                          const isChecked = isAdmin || editFormData.assignedBranches.includes(branch.name);
                          return (
                            <div key={branch.name} className="col">
                              <div className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`edit_branch_${branch.name}`}
                                  checked={isChecked}
                                  onChange={(e) => handleEditBranchChange(branch.name, e.target.checked)}
                                  disabled={isAdmin}
                                />
                                <label
                                  className="form-check-label"
                                  htmlFor={`edit_branch_${branch.name}`}
                                >
                                  {branch.name}
                                </label>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editUserStatus" className="form-label">
                      Status <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select"
                      id="editUserStatus"
                      value={editFormData.status}
                      onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                      required
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={closeEditModal}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Update User
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  Confirm Deletion
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeDeleteModal}
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  Are you sure you want to delete user <strong>"{userToDelete.fullName}"</strong> ({userToDelete.username})? This action cannot be undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeDeleteModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmDelete}
                >
                  <i className="fas fa-trash me-2"></i>Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title">
                  <i className="fas fa-check-circle me-2"></i>
                  Success
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeSuccessModal}
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-0" style={{ fontSize: '1.1rem' }}>
                  {successMessage}
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={closeSuccessModal}
                >
                  <i className="fas fa-check me-2"></i>OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
