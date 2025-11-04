import { useState, useEffect } from 'react';
import { itemsAPI, branchesAPI, stocksAPI, groceryAPI, machinesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const AddStock = () => {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState('Normal Item');
  const [loading, setLoading] = useState(true);

  // Data states
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [groceryStocks, setGroceryStocks] = useState([]);
  const [machineBatches, setMachineBatches] = useState([]);

  // Filter and selection states
  const [selectedBranch, setSelectedBranch] = useState('');
  const [stockDate, setStockDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterCategory, setFilterCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Normal Items states
  const [stockQuantities, setStockQuantities] = useState({});
  const [isBatchFinished, setIsBatchFinished] = useState(false);

  // Modal states
  const [showGroceryModal, setShowGroceryModal] = useState(false);
  const [showMachineModal, setShowMachineModal] = useState(false);
  const [selectedGroceryItem, setSelectedGroceryItem] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [groceryFormData, setGroceryFormData] = useState({ quantity: '', expiryDate: '' });
  const [machineFormData, setMachineFormData] = useState({ startValue: '', date: '' });

  // Get available branches based on user role
  const getAvailableBranches = () => {
    if (!user) return [];
    if (user.role === 'admin' || !user.assignedBranches || user.assignedBranches.length === 0) {
      return branches;
    }
    return branches.filter(b => user.assignedBranches.includes(b.name));
  };

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Load stocks when branch/date changes
  useEffect(() => {
    if (selectedBranch && selectedType === 'Normal Item') {
      loadNormalStocks();
    } else if (selectedBranch && selectedType === 'Grocery Item') {
      loadGroceryStocks();
    } else if (selectedBranch && selectedType === 'Machine') {
      loadMachineBatches();
    }
  }, [selectedBranch, stockDate, selectedType]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [itemsRes, branchesRes] = await Promise.all([
        itemsAPI.getAll(),
        branchesAPI.getAll()
      ]);

      if (itemsRes.data.success) {
        setItems(itemsRes.data.items);
      }
      if (branchesRes.data.success) {
        setBranches(branchesRes.data.branches);
      }
    } catch (error) {
      console.error('Load initial data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNormalStocks = async () => {
    try {
      const response = await stocksAPI.get({ date: stockDate, branch: selectedBranch });
      if (response.data.success) {
        setStocks(response.data.stocks);
        setIsBatchFinished(response.data.isFinished);

        // Initialize quantities for all normal items (not just those with existing stock)
        const quantities = {};
        const normalItems = items.filter(item => item.itemType === 'Normal Item');
        normalItems.forEach(item => {
          quantities[item.code] = '';
        });
        setStockQuantities(quantities);
      }
    } catch (error) {
      console.error('Load normal stocks error:', error);
      // Initialize empty quantities on error
      const quantities = {};
      const normalItems = items.filter(item => item.itemType === 'Normal Item');
      normalItems.forEach(item => {
        quantities[item.code] = '';
      });
      setStockQuantities(quantities);
    }
  };

  const loadGroceryStocks = async () => {
    try {
      const response = await groceryAPI.getStocks({ branch: selectedBranch });
      if (response.data.success) {
        setGroceryStocks(response.data.stocks);
      }
    } catch (error) {
      console.error('Load grocery stocks error:', error);
    }
  };

  const loadMachineBatches = async () => {
    try {
      if (!selectedBranch) {
        setMachineBatches([]);
        return;
      }
      const response = await machinesAPI.getBatches({ branch: selectedBranch, status: 'active' });
      if (response.data.success) {
        setMachineBatches(response.data.batches || []);
      }
    } catch (error) {
      console.error('Load machine batches error:', error);
      setMachineBatches([]);
    }
  };

  // Filter items
  const getFilteredItems = () => {
    let filtered = items.filter(item => item.itemType === selectedType);
    
    if (filterCategory) {
      filtered = filtered.filter(item => item.category === filterCategory);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  };

  // Get unique categories
  const getCategories = () => {
    const filtered = items.filter(item => item.itemType === selectedType);
    return [...new Set(filtered.map(item => item.category))].sort();
  };

  // Update Normal Items stocks
  const handleUpdateStocks = async () => {
    if (!selectedBranch) {
      alert('Please select a branch first.');
      return;
    }

    if (isBatchFinished) {
      alert(`This batch is already finished for ${selectedBranch} (${stockDate}). Cannot add stock.`);
      return;
    }

    const itemsToUpdate = [];
    Object.keys(stockQuantities).forEach(itemCode => {
      const qty = parseInt(stockQuantities[itemCode]) || 0;
      if (qty > 0) {
        itemsToUpdate.push({ itemCode, quantity: qty });
      }
    });

    if (itemsToUpdate.length === 0) {
      alert('No stock quantities entered.');
      return;
    }

    try {
      const response = await stocksAPI.update({
        date: stockDate,
        branch: selectedBranch,
        items: itemsToUpdate
      });

      if (response.data.success) {
        alert('Stocks updated successfully!');
        // Reset quantities
        const resetQuantities = {};
        Object.keys(stockQuantities).forEach(code => {
          resetQuantities[code] = '';
        });
        setStockQuantities(resetQuantities);
        loadNormalStocks();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update stocks';
      alert(message);
      console.error('Update stocks error:', error);
    }
  };

  // Handle grocery stock modal
  const handleShowGroceryModal = (item) => {
    setSelectedGroceryItem(item);
    setGroceryFormData({ quantity: '', expiryDate: '' });
    setShowGroceryModal(true);
  };

  const handleAddGroceryStock = async () => {
    if (!selectedBranch || !selectedGroceryItem) return;

    const quantity = parseFloat(groceryFormData.quantity);
    if (!quantity || quantity <= 0 || !groceryFormData.expiryDate) {
      alert('Please fill all fields correctly.');
      return;
    }

    try {
      const response = await groceryAPI.addStock({
        itemCode: selectedGroceryItem.code,
        branch: selectedBranch,
        quantity: quantity,
        expiryDate: groceryFormData.expiryDate,
        date: stockDate
      });

      if (response.data.success) {
        alert('Grocery stock added successfully!');
        setShowGroceryModal(false);
        setSelectedGroceryItem(null);
        setGroceryFormData({ quantity: '', expiryDate: '' });
        // Reload stocks to refresh Total Stock display
        await loadGroceryStocks();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to add grocery stock';
      alert(message);
      console.error('Add grocery stock error:', error);
    }
  };

  // Handle machine batch modal
  const handleShowMachineModal = async (machine) => {
    setSelectedMachine(machine);
    
    // Check for active batch
    try {
      const response = await machinesAPI.getBatches({ 
        branch: selectedBranch, 
        machineCode: machine.code,
        status: 'active' 
      });

      if (response.data.success && response.data.batches.length > 0) {
        const activeBatch = response.data.batches[0];
        setMachineFormData({
          startValue: activeBatch.startValue.toString(),
          date: activeBatch.date
        });
        // Set active batch for this machine
        setMachineBatches(response.data.batches);
      } else {
        // Try to get last completed batch end value
        const completedRes = await machinesAPI.getBatches({ 
          branch: selectedBranch,
          machineCode: machine.code,
          status: 'completed'
        });
        
        let lastEndValue = '';
        if (completedRes.data.success && completedRes.data.batches.length > 0) {
          const sorted = completedRes.data.batches.sort((a, b) => 
            new Date(b.endTime || b.date) - new Date(a.endTime || a.date)
          );
          if (sorted[0].endValue != null) {
            lastEndValue = sorted[0].endValue.toString();
          }
        }
        
        setMachineFormData({
          startValue: lastEndValue,
          date: stockDate
        });
        setMachineBatches([]);
      }
    } catch (error) {
      setMachineFormData({
        startValue: '',
        date: stockDate
      });
      setMachineBatches([]);
    }

    setShowMachineModal(true);
  };

  const handleStartMachineBatch = async () => {
    if (!selectedBranch || !selectedMachine) return;

    const startValue = parseInt(machineFormData.startValue);
    if (isNaN(startValue) || startValue < 0) {
      alert('Please enter a valid start value.');
      return;
    }

    try {
      // Check if active batch exists
      const checkRes = await machinesAPI.getBatches({
        branch: selectedBranch,
        machineCode: selectedMachine.code,
        status: 'active'
      });

      if (checkRes.data.success && checkRes.data.batches.length > 0) {
        // Update existing batch
        const batch = checkRes.data.batches[0];
        const updateRes = await machinesAPI.updateBatch(batch.id, {
          startValue: startValue,
          date: machineFormData.date
        });

        if (updateRes.data.success) {
          alert('Start value updated successfully!');
          setShowMachineModal(false);
          loadMachineBatches();
        }
      } else {
        // Start new batch
        const response = await machinesAPI.startBatch({
          machineCode: selectedMachine.code,
          branch: selectedBranch,
          startValue: startValue,
          date: machineFormData.date
        });

        if (response.data.success) {
          alert('Machine batch started successfully!');
          setShowMachineModal(false);
          loadMachineBatches();
        }
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to start/update batch';
      alert(message);
      console.error('Start machine batch error:', error);
    }
  };

  // Get available stock for grocery item - Total Stock = sum of remaining from all batches
  const getGroceryAvailableStock = (itemCode) => {
    if (!selectedBranch) return 0;
    const itemStocks = groceryStocks.filter(s => s.itemCode === itemCode && s.branch === selectedBranch);
    // Total Stock = sum of remaining from all batches (current available stock)
    const total = itemStocks.reduce((sum, s) => sum + parseFloat(s.remaining || 0), 0);
    return total;
  };

  // Get stock data for normal item
  const getNormalItemStock = (itemCode) => {
    const stock = stocks.find(s => s.itemCode === itemCode);
    if (!stock) return { available: 0, added: 0, returned: 0, transferred: 0 };
    return {
      available: stock.available || 0,
      added: stock.added || 0,
      returned: stock.returned || 0,
      transferred: stock.transferred || 0
    };
  };

  // Check if machine has active batch
  const getMachineStatus = (machineCode) => {
    const batch = machineBatches.find(b => b.machineCode === machineCode);
    return batch ? { status: 'Active', batch } : { status: 'Not Started', batch: null };
  };

  const availableBranches = getAvailableBranches();
  const filteredItems = getFilteredItems();
  const categories = getCategories();
  const hasActiveBatch = selectedMachine && machineBatches.length > 0 && 
    machineBatches.some(b => b.machineCode === selectedMachine.code && b.status === 'active');

  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }

  return (
    <div className="p-4">
      <h2 className="mb-4">Add Item Stock</h2>

      {/* Item Type Navigation */}
      <nav className="navbar navbar-expand navbar-light bg-light mb-3">
        <ul className="navbar-nav">
          <li className="nav-item">
            <button
              className={`nav-link btn btn-link ${selectedType === 'Normal Item' ? 'active' : ''}`}
              onClick={() => setSelectedType('Normal Item')}
            >
              Normal Items
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link btn btn-link ${selectedType === 'Grocery Item' ? 'active' : ''}`}
              onClick={() => setSelectedType('Grocery Item')}
            >
              Grocery Item
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link btn btn-link ${selectedType === 'Machine' ? 'active' : ''}`}
              onClick={() => setSelectedType('Machine')}
            >
              Machine
            </button>
          </li>
        </ul>
      </nav>

      {/* Filters Section */}
      <div className="card mb-3">
        <div className="card-body">
          <h4>Filter Items</h4>
          <div className="row g-3">
            <div className="col-md-3">
              <select
                className="form-select"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <input
                type="text"
                className="form-control"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="">Select Branch</option>
                {availableBranches.map(branch => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </div>
            {selectedType === 'Normal Item' && (
              <div className="col-md-3">
                <input
                  type="date"
                  className="form-control"
                  value={stockDate}
                  onChange={(e) => setStockDate(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Normal Items Stock Table */}
      {selectedType === 'Normal Item' && (
        <div className="card mb-4">
          <div className="card-header">
            <div className="d-flex justify-content-between align-items-center">
              <span>Inventory Stock</span>
            </div>
          </div>
          <div className="card-body">
            {!selectedBranch ? (
              <div className="text-center text-warning p-3">
                Please select a branch first.
              </div>
            ) : isBatchFinished ? (
              <div className="text-center text-danger p-3">
                This batch is already finished for {selectedBranch} ({stockDate}). Cannot add stock.
              </div>
            ) : (
              <>
                <button
                  className="btn btn-primary mb-3"
                  onClick={handleUpdateStocks}
                >
                  Update Stocks
                </button>
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Category</th>
                      <th>Price (Rs.)</th>
                      <th>Available Stock</th>
                      <th>Enter Stock Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center">No normal items available.</td>
                      </tr>
                    ) : (
                      filteredItems.map(item => {
                        const stock = getNormalItemStock(item.code);
                        return (
                          <tr key={item.code}>
                            <td>{item.name}</td>
                            <td>{item.category}</td>
                            <td>Rs {parseFloat(item.price).toFixed(2)}</td>
                            <td>{stock.available}</td>
                            <td>
                              <input
                                type="number"
                                className="form-control"
                                value={stockQuantities[item.code] || ''}
                                onChange={(e) => setStockQuantities({
                                  ...stockQuantities,
                                  [item.code]: e.target.value
                                })}
                                min="0"
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {/* Grocery Items Stock Table */}
      {selectedType === 'Grocery Item' && (
        <div className="card mb-4">
          <div className="card-header">Grocery Stock</div>
          <div className="card-body">
            {!selectedBranch ? (
              <div className="text-center text-warning p-3">
                Please select a branch first.
              </div>
            ) : (
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Price (Rs.)</th>
                    <th>Available Stock</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center">No grocery items available.</td>
                    </tr>
                  ) : (
                    filteredItems.map(item => {
                      const availableStock = getGroceryAvailableStock(item.code);
                      return (
                        <tr key={item.code}>
                          <td>{item.name}</td>
                          <td>{item.category}</td>
                          <td>Rs {parseFloat(item.price).toFixed(2)}</td>
                          <td>
                            {item.soldByWeight 
                              ? Number(availableStock).toFixed(3) 
                              : Math.trunc(availableStock)}
                          </td>
                          <td>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleShowGroceryModal(item)}
                            >
                              Select Item
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Machine Stock Table */}
      {selectedType === 'Machine' && (
        <div>
          <div className="alert alert-info mb-3">
            <i className="fas fa-info-circle me-2"></i>
            Select a machine to start a new batch. Machines track sales based on start and end values.
          </div>
          {!selectedBranch ? (
            <div className="text-center text-warning p-3">
              Please select a branch first.
            </div>
          ) : (
            <table className="table table-hover">
              <thead className="table-dark">
                <tr>
                  <th>Machine Name</th>
                  <th>Price per Unit (Rs.)</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center">No machines available.</td>
                  </tr>
                ) : (
                  filteredItems.map(machine => {
                    const { status } = getMachineStatus(machine.code);
                    return (
                      <tr key={machine.code}>
                        <td>{machine.name}</td>
                        <td>Rs {parseFloat(machine.price).toFixed(2)}</td>
                        <td className={status === 'Active' ? 'text-success' : ''}>
                          {status}
                        </td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleShowMachineModal(machine)}
                          >
                            Select Machine
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add Grocery Stock Modal */}
      {showGroceryModal && selectedGroceryItem && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Grocery Stock</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowGroceryModal(false);
                    setSelectedGroceryItem(null);
                    setGroceryFormData({ quantity: '', expiryDate: '' });
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">
                    <strong>Item:</strong> {selectedGroceryItem.name}
                  </label>
                </div>
                <div className="mb-3">
                  <label className="form-label">Quantity</label>
                  <input
                    type="number"
                    className="form-control"
                    value={groceryFormData.quantity}
                    onChange={(e) => setGroceryFormData({
                      ...groceryFormData,
                      quantity: e.target.value
                    })}
                    min={selectedGroceryItem.soldByWeight ? "0.001" : "1"}
                    step={selectedGroceryItem.soldByWeight ? "0.001" : "1"}
                    placeholder={selectedGroceryItem.soldByWeight 
                      ? "Enter quantity (e.g., 0.500 for 500g)" 
                      : "Enter quantity (integer)"}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Expiry Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={groceryFormData.expiryDate}
                    onChange={(e) => setGroceryFormData({
                      ...groceryFormData,
                      expiryDate: e.target.value
                    })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowGroceryModal(false);
                    setSelectedGroceryItem(null);
                    setGroceryFormData({ quantity: '', expiryDate: '' });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAddGroceryStock}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start Machine Batch Modal */}
      {showMachineModal && selectedMachine && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Start Machine Batch</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowMachineModal(false);
                    setSelectedMachine(null);
                    setMachineFormData({ startValue: '', date: '' });
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">
                    <strong>Machine:</strong> {selectedMachine.name}
                  </label>
                </div>
                <div className="mb-3">
                  <label className="form-label">
                    <strong>Price per Unit:</strong> Rs {parseFloat(selectedMachine.price).toFixed(2)}
                  </label>
                </div>
                <div className="mb-3">
                  <label className="form-label">Start Value</label>
                  <input
                    type="number"
                    className="form-control"
                    value={machineFormData.startValue}
                    onChange={(e) => setMachineFormData({
                      ...machineFormData,
                      startValue: e.target.value
                    })}
                    min="0"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={machineFormData.date || stockDate}
                    onChange={(e) => setMachineFormData({
                      ...machineFormData,
                      date: e.target.value
                    })}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">
                    <strong>Status:</strong>
                    <span className={hasActiveBatch ? "text-info ms-2" : "text-success ms-2"}>
                      {hasActiveBatch ? 'Active Batch Exists' : 'Ready to Start'}
                    </span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowMachineModal(false);
                    setSelectedMachine(null);
                    setMachineFormData({ startValue: '', date: '' });
                  }}
                >
                  Cancel
                </button>
                {hasActiveBatch && (
                  <button
                    type="button"
                    className="btn btn-warning"
                    onClick={handleStartMachineBatch}
                  >
                    Update Start Value
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartMachineBatch}
                >
                  {hasActiveBatch ? 'Update Start Value' : 'Start Machine'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddStock;
