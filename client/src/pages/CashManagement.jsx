import { useState, useEffect } from 'react';
import { cashAPI, branchesAPI, stocksAPI, machinesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const CashManagement = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cashEntries, setCashEntries] = useState([]);
  const [branches, setBranches] = useState([]);
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    branch: '',
    date: new Date().toISOString().split('T')[0],
    actualCash: '',
    cardPayment: '',
    notes: ''
  });
  const [existingEntry, setExistingEntry] = useState(false);

  const isAdmin = user?.role === 'admin';

  // Get available branches based on user role
  const getAvailableBranches = () => {
    if (!user) return [];
    if (user.role === 'admin' || !user.assignedBranches || user.assignedBranches.length === 0) {
      return branches;
    }
    return branches.filter(b => user.assignedBranches.includes(b.name));
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (branches.length > 0) {
      loadCashEntries();
    }
  }, [filterBranch, filterDate, branches]);

  // Modal states for validation warnings
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  // Check for existing entry and validate preconditions when branch/date changes
  useEffect(() => {
    if (formData.branch && formData.date) {
      checkExistingEntry();
      validatePreconditionsOnChange(formData.branch, formData.date);
    } else {
      setExistingEntry(false);
    }
  }, [formData.branch, formData.date]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const branchesRes = await branchesAPI.getAll();
      if (branchesRes.data.success) {
        setBranches(branchesRes.data.branches);
      }
    } catch (error) {
      console.error('Load initial data error:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadCashEntries = async () => {
    try {
      const params = {};
      if (filterBranch) params.branch = filterBranch;
      if (filterDate) params.date = filterDate;

      const response = await cashAPI.getEntries(params);
      if (response.data.success) {
        setCashEntries(response.data.entries);
      }
    } catch (error) {
      console.error('Load cash entries error:', error);
    }
  };

  const checkExistingEntry = async () => {
    try {
      const params = { branch: formData.branch, date: formData.date };
      const response = await cashAPI.getEntries(params);
      if (response.data.success && response.data.entries.length > 0) {
        setExistingEntry(true);
      } else {
        setExistingEntry(false);
      }
    } catch (error) {
      console.error('Check existing entry error:', error);
      setExistingEntry(false);
    }
  };

  // Validate preconditions when branch/date changes (for real-time feedback)
  const validatePreconditionsOnChange = async (branch, date) => {
    if (!branch || !date) return;
    
    try {
      // Check if normal items exist and if batch is finished
      const stocksRes = await stocksAPI.get({ branch, date });
      if (stocksRes.data.success && stocksRes.data.stocks && stocksRes.data.stocks.length > 0) {
        // There are normal items, check if batch is finished
        if (!stocksRes.data.isFinished) {
          const message = `Cannot create cash entry: ${branch} has Normal Items added but the batch is not finished for ${date}. Please finish the batch before creating a cash entry.`;
          setValidationMessage(message);
          setShowValidationModal(true);
          return;
        }
      }

      // Check for active machine batches
      const machinesRes = await machinesAPI.getBatches({ branch, date, status: 'active' });
      if (machinesRes.data.success && machinesRes.data.batches && machinesRes.data.batches.length > 0) {
        const message = `Cannot create cash entry: ${branch} has Machine batches started but not finished for ${date}. Please enter end values and finish the machine batches before creating a cash entry.`;
        setValidationMessage(message);
        setShowValidationModal(true);
        return;
      }

      // Clear validation modal if all checks pass
      setShowValidationModal(false);
      setValidationMessage('');
    } catch (error) {
      console.error('Validate preconditions on change error:', error);
      // Don't show error on validation failure - allow user to proceed
    }
  };

  // Validate preconditions before saving (same checks, for form submission)
  const validatePreconditions = async (branch, date) => {
    try {
      // Check if normal items exist and if batch is finished
      const stocksRes = await stocksAPI.get({ branch, date });
      if (stocksRes.data.success && stocksRes.data.stocks && stocksRes.data.stocks.length > 0) {
        // There are normal items, check if batch is finished
        if (!stocksRes.data.isFinished) {
          return { ok: false, message: `Cannot create cash entry: ${branch} has Normal Items added but the batch is not finished for ${date}. Please finish the batch before creating a cash entry.` };
        }
      }

      // Check for active machine batches
      const machinesRes = await machinesAPI.getBatches({ branch, date, status: 'active' });
      if (machinesRes.data.success && machinesRes.data.batches && machinesRes.data.batches.length > 0) {
        return { ok: false, message: `Cannot create cash entry: ${branch} has Machine batches started but not finished for ${date}. Please enter end values and finish the machine batches before creating a cash entry.` };
      }

      return { ok: true };
    } catch (error) {
      console.error('Validate preconditions error:', error);
      // Allow to proceed if validation fails (graceful degradation)
      return { ok: true };
    }
  };

  const handleAddCashEntry = async (e) => {
    e.preventDefault();

    if (!formData.branch) {
      alert('Please select a branch.');
      return;
    }
    if (!formData.date) {
      alert('Please select a date.');
      return;
    }
    if (!formData.actualCash || parseFloat(formData.actualCash) < 0) {
      alert('Please enter actual cash amount.');
      return;
    }

    if (existingEntry) {
      alert('A cash entry for this branch and date already exists.');
      return;
    }

    // Validate preconditions
    const precheck = await validatePreconditions(formData.branch, formData.date);
    if (!precheck.ok) {
      setValidationMessage(precheck.message);
      setShowValidationModal(true);
      return;
    }

    // Get expected cash from backend
    try {
      const expectedRes = await cashAPI.getExpected({ branch: formData.branch, date: formData.date });
      if (!expectedRes.data.success || expectedRes.data.expected <= 0) {
        alert('No sales recorded for this branch and date. Cash entry is not required.');
        return;
      }

      const actualCash = parseFloat(formData.actualCash || 0);
      const cardPayment = parseFloat(formData.cardPayment || 0);
      const actual = actualCash + cardPayment;

      const response = await cashAPI.createEntry({
        branch: formData.branch,
        date: formData.date,
        actualCash,
        cardPayment,
        notes: formData.notes || null,
        operatorId: user?.id || null,
        operatorName: user?.fullName || null
      });

      if (response.data.success) {
        alert('Cash entry added successfully!');
        closeAddModal();
        loadCashEntries();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to create cash entry';
      alert(message);
      console.error('Create cash entry error:', error);
    }
  };

  const openAddModal = () => {
    setFormData({
      branch: '',
      date: new Date().toISOString().split('T')[0],
      actualCash: '',
      cardPayment: '',
      notes: ''
    });
    setExistingEntry(false);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setFormData({
      branch: '',
      date: new Date().toISOString().split('T')[0],
      actualCash: '',
      cardPayment: '',
      notes: ''
    });
    setExistingEntry(false);
  };

  // Filter entries based on user role
  const getFilteredEntries = () => {
    let filtered = cashEntries;

    if (!isAdmin) {
      // Non-admins see only their own entries
      filtered = cashEntries.filter(e => 
        e.operatorId === user?.id || e.operatorId === user?.role
      );
    }

    return filtered;
  };

  const getStatusBadgeClass = (status) => {
    if (status === 'Match') return 'bg-success';
    if (status === 'Overage') return 'bg-warning';
    return 'bg-danger';
  };

  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }

  const availableBranches = getAvailableBranches();
  const filteredEntries = getFilteredEntries();

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Cash Management</h2>
        <div className="d-flex gap-2 align-items-center">
          <button
            className="btn btn-primary"
            onClick={openAddModal}
          >
            Add Cash Entry
          </button>
          <div className="ms-3 d-flex align-items-center gap-2">
            <label className="mb-0">Filter:</label>
            <select
              className="form-select"
              style={{ width: 'auto' }}
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
            >
              <option value="">All Branches</option>
              {availableBranches.map(branch => (
                <option key={branch.name} value={branch.name}>{branch.name}</option>
              ))}
            </select>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto' }}
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Reconciliation Table (Admin only) */}
      {isAdmin && (
        <div className="card mb-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <span>Cash Reconciliation</span>
            <span className="text-muted small">Admin only</span>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-striped">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Branch</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Difference</th>
                    <th>Status</th>
                    <th>Operator</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center">No cash entries available.</td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry, index) => (
                      <tr key={index}>
                        <td>{entry.date}</td>
                        <td>{entry.branch}</td>
                        <td>Rs {parseFloat(entry.expected || 0).toFixed(2)}</td>
                        <td>
                          Rs {parseFloat(entry.actual || 0).toFixed(2)}
                          <div className="text-muted small">
                            Cash: Rs {parseFloat(entry.actualCash || 0).toFixed(2)} / 
                            Card: Rs {parseFloat(entry.cardPayment || 0).toFixed(2)}
                          </div>
                        </td>
                        <td className={entry.difference < 0 ? 'text-danger' : 'text-success'}>
                          Rs {parseFloat(entry.difference || 0).toFixed(2)}
                        </td>
                        <td>
                          <span className={`badge ${getStatusBadgeClass(entry.status)}`}>
                            {entry.status}
                          </span>
                        </td>
                        <td>{entry.operatorName || entry.operatorId || '-'}</td>
                        <td>{entry.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* History Table (Non-admin only) */}
      {!isAdmin && (
        <div className="card">
          <div className="card-header">Your Cash Entry History</div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-striped">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Branch</th>
                    <th>Actual</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center">No entries yet.</td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry, index) => (
                      <tr key={index}>
                        <td>{entry.date}</td>
                        <td>{entry.branch}</td>
                        <td>
                          Rs {parseFloat(entry.actualCash || 0).toFixed(2)}
                          {parseFloat(entry.cardPayment || 0) > 0 && (
                            <> (Card: Rs {parseFloat(entry.cardPayment || 0).toFixed(2)})</>
                          )}
                        </td>
                        <td>{entry.status}</td>
                        <td>{entry.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Validation Warning Modal */}
      {showValidationModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-danger">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">
                  <i className="fas fa-exclamation-triangle me-2"></i>Cannot Create Cash Entry
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => {
                    setShowValidationModal(false);
                    setValidationMessage('');
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="d-flex align-items-start mb-3">
                  <i className="fas fa-info-circle fa-2x text-danger me-3 mt-1"></i>
                  <p className="mb-0 fs-5">{validationMessage}</p>
                </div>
                <div className="alert alert-danger mb-0">
                  <i className="fas fa-lightbulb me-2"></i>
                  <strong>Required Actions:</strong>
                  <ul className="mb-0 mt-2">
                    <li>For Normal Items: Go to "Add Return Stock" page and click "Finish Batch" for the selected branch and date.</li>
                    <li>For Machine Items: Go to "Add Return Stock" page, enter end values, and click "Finish Batch" for each machine.</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setShowValidationModal(false);
                    setValidationMessage('');
                  }}
                >
                  <i className="fas fa-check me-1"></i>Understood
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Cash Entry Slide-in Form */}
      {showAddModal && (
        <>
          {/* Backdrop */}
          <div 
            className="position-fixed top-0 start-0 w-100 h-100" 
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1040 }}
            onClick={closeAddModal}
          ></div>
          
          {/* Slide-in Panel from Right */}
          <div 
            className="position-fixed top-0 end-0 h-100 bg-white shadow-lg"
            style={{ 
              width: '450px', 
              maxWidth: '90vw',
              zIndex: 1050,
              animation: 'slideInRight 0.3s ease-out',
              overflowY: 'auto'
            }}
          >
            <div className="d-flex flex-column h-100">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title mb-0">
                  <i className="fas fa-money-bill-wave me-2"></i>Add Cash Entry
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeAddModal}
                ></button>
              </div>
              <div className="modal-body flex-grow-1 p-4">
                <form onSubmit={handleAddCashEntry}>
                  <div className="mb-3">
                    <label htmlFor="cashBranch" className="form-label">
                      Branch <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select"
                      id="cashBranch"
                      value={formData.branch}
                      onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      required
                    >
                      <option value="">Select Branch</option>
                      {availableBranches.map(branch => (
                        <option key={branch.name} value={branch.name}>{branch.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label htmlFor="cashDate" className="form-label">
                      Date <span className="text-danger">*</span>
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      id="cashDate"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                    />
                  </div>
                  {existingEntry && (
                    <div className="alert alert-warning">
                      A cash entry already exists for this branch and date.
                    </div>
                  )}
                  <div className="mb-3">
                    <label htmlFor="actualCash" className="form-label">
                      Actual Cash Amount (Rs.) <span className="text-danger">*</span>
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="actualCash"
                      value={formData.actualCash}
                      onChange={(e) => setFormData({ ...formData, actualCash: e.target.value })}
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="cardPayment" className="form-label">
                      Card Payment Amount (Rs.) <span className="text-muted small">(optional)</span>
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="cardPayment"
                      value={formData.cardPayment}
                      onChange={(e) => setFormData({ ...formData, cardPayment: e.target.value })}
                      min="0"
                      step="0.01"
                      placeholder="0"
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="cashNotes" className="form-label">Notes</label>
                    <textarea
                      className="form-control"
                      id="cashNotes"
                      rows="3"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    ></textarea>
                  </div>
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={closeAddModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={existingEntry}
                      title={existingEntry ? 'A cash entry already exists for this branch and date' : ''}
                    >
                      Save Entry
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          
          {/* Add CSS animation */}
          <style>{`
            @keyframes slideInRight {
              from {
                transform: translateX(100%);
              }
              to {
                transform: translateX(0);
              }
            }
          `}</style>
        </>
      )}
    </div>
  );
};

export default CashManagement;
