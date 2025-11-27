import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { branchesAPI } from '../services/api';

const BranchManagement = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    manager: '',
    phone: '',
    email: ''
  });

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const response = await branchesAPI.getAll();
      if (response.data.success) {
        setBranches(response.data.branches);
      }
    } catch (error) {
      console.error('Load branches error:', error);
      showError('Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingBranch(null);
    setFormData({
      name: '',
      address: '',
      manager: '',
      phone: '',
      email: ''
    });
    setShowModal(true);
  };

  const openEditModal = (branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name || '',
      address: branch.address || '',
      manager: branch.manager || '',
      phone: branch.phone || '',
      email: branch.email || ''
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBranch(null);
    setFormData({
      name: '',
      address: '',
      manager: '',
      phone: '',
      email: ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.address || !formData.manager) {
      showWarning('Please fill all required fields (Name, Address, Manager).');
      return;
    }

    try {
      if (editingBranch) {
        // Update existing branch
        const response = await branchesAPI.update(editingBranch.name, formData);
        if (response.data.success) {
          showSuccess('Branch updated successfully!');
          closeModal();
          loadBranches();
        }
      } else {
        // Create new branch
        const response = await branchesAPI.create(formData);
        if (response.data.success) {
          showSuccess('Branch added successfully!');
          closeModal();
          loadBranches();
        }
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to save branch';
      showError(message);
      console.error('Save branch error:', error);
    }
  };

  const handleDelete = async (branchName) => {
    if (!confirm(`Are you sure you want to delete "${branchName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await branchesAPI.delete(branchName);
      if (response.data.success) {
        showSuccess('Branch deleted successfully!');
        loadBranches();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to delete branch';
      showError(message);
      console.error('Delete branch error:', error);
    }
  };

  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Branch Management</h2>
        <button className="btn btn-primary" onClick={openAddModal}>
          <i className="fas fa-plus me-2"></i>Add New Branch
        </button>
      </div>

      {branches.length === 0 ? (
        <div className="alert alert-info">
          No branches available. Add your first branch.
        </div>
      ) : (
        <div className="row">
          {branches.map((branch) => (
            <div key={branch.name} className="col-md-6 col-lg-4 mb-4">
              <div className="card h-100">
                <div className="card-header bg-primary text-white">
                  <h5 className="card-title mb-0">{branch.name}</h5>
                </div>
                <div className="card-body">
                  <p className="card-text">
                    <strong>Address:</strong> {branch.address}
                  </p>
                  <p className="card-text">
                    <strong>Manager:</strong> {branch.manager}
                  </p>
                  <p className="card-text">
                    <strong>Phone:</strong> {branch.phone || '-'}
                  </p>
                  <p className="card-text">
                    <strong>Email:</strong> {branch.email || '-'}
                  </p>
                </div>
                <div className="card-footer">
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => openEditModal(branch)}
                  >
                    <i className="fas fa-edit me-1"></i>Edit
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger float-end"
                    onClick={() => handleDelete(branch.name)}
                  >
                    <i className="fas fa-trash me-1"></i>Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Branch Modal */}
      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {editingBranch ? 'Edit Branch' : 'Add New Branch'}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closeModal}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="branchName" className="form-label">
                      Branch Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="branchName"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="branchAddress" className="form-label">
                      Address <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="branchAddress"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="managerName" className="form-label">
                      Manager Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="managerName"
                      value={formData.manager}
                      onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="branchPhone" className="form-label">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      className="form-control"
                      id="branchPhone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="branchEmail" className="form-label">
                      Email
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      id="branchEmail"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={closeModal}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      {editingBranch ? 'Update Branch' : 'Save Branch'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchManagement;
