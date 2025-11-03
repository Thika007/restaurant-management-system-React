import { useState, useEffect } from 'react';
import { itemsAPI, branchesAPI, stocksAPI, groceryAPI, transfersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const InternalTransfer = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('Normal Item');
  
  // Data states
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [groceryStocks, setGroceryStocks] = useState([]);
  
  // Selection states
  const [senderBranch, setSenderBranch] = useState('');
  const [receiverBranch, setReceiverBranch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Transfer quantities
  const [transferQuantities, setTransferQuantities] = useState({});
  
  // Modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [transferData, setTransferData] = useState(null);
  
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

  // Load stocks when branches or type changes
  useEffect(() => {
    if (senderBranch && receiverBranch && senderBranch !== receiverBranch) {
      loadStocks();
    } else {
      setStocks([]);
      setGroceryStocks([]);
      setTransferQuantities({});
    }
  }, [senderBranch, receiverBranch, selectedType]);

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

  const loadStocks = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      if (selectedType === 'Normal Item') {
        // Load normal item stocks for both branches
        const [senderRes, receiverRes] = await Promise.all([
          stocksAPI.get({ date: today, branch: senderBranch }),
          stocksAPI.get({ date: today, branch: receiverBranch })
        ]);

        if (senderRes.data.success && receiverRes.data.success) {
          // Add branch information to each stock since API doesn't return it
          const senderStocks = senderRes.data.stocks.map(stock => ({
            ...stock,
            branch: senderBranch,
            date: today
          }));
          
          const receiverStocks = receiverRes.data.stocks.map(stock => ({
            ...stock,
            branch: receiverBranch,
            date: today
          }));
          
          const allStocks = [...senderStocks, ...receiverStocks];
          setStocks(allStocks);
          
          // Initialize transfer quantities
          const quantities = {};
          const filteredItems = getFilteredItems();
          filteredItems.forEach(item => {
            quantities[item.code] = '';
          });
          setTransferQuantities(quantities);
        }
      } else {
        // Load grocery stocks
        const [senderRes, receiverRes] = await Promise.all([
          groceryAPI.getStocks({ branch: senderBranch }),
          groceryAPI.getStocks({ branch: receiverBranch })
        ]);

        if (senderRes.data.success && receiverRes.data.success) {
          setGroceryStocks([...senderRes.data.stocks, ...receiverRes.data.stocks]);
          
          // Initialize transfer quantities
          const quantities = {};
          const filteredItems = getFilteredItems();
          filteredItems.forEach(item => {
            quantities[item.code] = '';
          });
          setTransferQuantities(quantities);
        }
      }
    } catch (error) {
      console.error('Load stocks error:', error);
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

  // Get stock for normal item
  const getNormalItemStock = (itemCode, branch) => {
    // Find stock for this branch - stocks array contains stocks for both branches
    const stock = stocks.find(s => 
      s.itemCode === itemCode && 
      s.branch === branch
    );
    
    if (!stock) return 0;
    // Use available field if present, otherwise calculate
    if (stock.available !== undefined) {
      return stock.available;
    }
    const available = (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0);
    return Math.max(0, available);
  };

  // Get stock for grocery item
  const getGroceryItemStock = (itemCode, branch) => {
    const itemStocks = groceryStocks.filter(s => s.itemCode === itemCode && s.branch === branch);
    return itemStocks.reduce((sum, s) => sum + parseFloat(s.remaining || s.quantity || 0), 0);
  };

  // Update transfer preview
  const handleQuantityChange = (itemCode, value) => {
    setTransferQuantities({
      ...transferQuantities,
      [itemCode]: value
    });
  };

  // Process transfer
  const handleProcessTransfer = async () => {
    if (!senderBranch || !receiverBranch) {
      alert('Please select both sender and receiver branches.');
      return;
    }

    if (senderBranch === receiverBranch) {
      alert('Sender and receiver branches must be different.');
      return;
    }

    // Validate and collect transfer items
    const today = new Date().toISOString().split('T')[0];
    const transferItems = [];
    const filteredItems = getFilteredItems();

    for (const item of filteredItems) {
      const qty = selectedType === 'Normal Item'
        ? parseInt(transferQuantities[item.code]) || 0
        : parseFloat(transferQuantities[item.code]) || 0;

      if (qty > 0) {
        const senderStock = selectedType === 'Normal Item'
          ? getNormalItemStock(item.code, senderBranch)
          : getGroceryItemStock(item.code, senderBranch);

        if (qty > senderStock) {
          alert(`Cannot transfer ${qty} of ${item.name}. Only ${senderStock} available at ${senderBranch}.`);
          return;
        }

        transferItems.push({
          itemCode: item.code,
          itemName: item.name,
          quantity: qty,
          soldByWeight: item.soldByWeight || false
        });
      }
    }

    if (transferItems.length === 0) {
      alert('Please enter quantities to transfer.');
      return;
    }

    // Check batch finished status for normal items
    if (selectedType === 'Normal Item') {
      try {
        const [senderCheck, receiverCheck] = await Promise.all([
          stocksAPI.getBatchStatus({ date: today, branch: senderBranch }),
          stocksAPI.getBatchStatus({ date: today, branch: receiverBranch })
        ]);

        if (senderCheck.data.isFinished) {
          alert(`Cannot transfer: ${senderBranch} has finished batch for today.`);
          return;
        }

        if (receiverCheck.data.isFinished) {
          alert(`Cannot transfer: ${receiverBranch} has finished batch for today.`);
          return;
        }
      } catch (error) {
        console.error('Batch status check error:', error);
      }
    }

    // Prepare transfer data for confirmation
    const data = {
      items: transferItems,
      senderBranch,
      receiverBranch,
      itemType: selectedType,
      date: today
    };

    setTransferData(data);
    setShowConfirmModal(true);
  };

  // Confirm and process transfer
  const handleConfirmTransfer = async () => {
    if (!transferData) return;

    try {
      const response = await transfersAPI.create({
        date: transferData.date,
        senderBranch: transferData.senderBranch,
        receiverBranch: transferData.receiverBranch,
        itemType: transferData.itemType,
        items: transferData.items.map(item => ({
          itemCode: item.itemCode,
          quantity: item.quantity
        })),
        processedBy: user?.id || user?.username || 'system'
      });

      if (response.data.success) {
        alert('Transfer completed successfully!');
        handleClearForm();
        setShowConfirmModal(false);
        setTransferData(null);
        // Reload stocks to refresh the view
        loadStocks();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to process transfer';
      alert(message);
      console.error('Process transfer error:', error);
    }
  };

  // Clear form
  const handleClearForm = () => {
    setSenderBranch('');
    setReceiverBranch('');
    setFilterCategory('');
    setSearchTerm('');
    setTransferQuantities({});
    setStocks([]);
    setGroceryStocks([]);
  };

  const availableBranches = getAvailableBranches();
  const filteredItems = getFilteredItems();
  const categories = getCategories();

  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Internal Transfer</h2>
        <div>
          <button className="btn btn-primary me-2" onClick={handleProcessTransfer}>
            <i className="fas fa-exchange-alt me-1"></i>Process Transfer
          </button>
          <button className="btn btn-secondary" onClick={handleClearForm}>
            <i className="fas fa-times me-1"></i>Clear Form
          </button>
        </div>
      </div>

      {/* Item Type Navigation */}
      <nav className="navbar navbar-expand navbar-light bg-light mb-3">
        <ul className="navbar-nav">
          <li className="nav-item">
            <button
              className={`nav-link btn btn-link ${selectedType === 'Normal Item' ? 'active' : ''}`}
              onClick={() => setSelectedType('Normal Item')}
            >
              <i className="fas fa-box me-2"></i>Normal Items
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link btn btn-link ${selectedType === 'Grocery Item' ? 'active' : ''}`}
              onClick={() => setSelectedType('Grocery Item')}
            >
              <i className="fas fa-shopping-cart me-2"></i>Grocery Items
            </button>
          </li>
        </ul>
      </nav>

      {/* Filters Section */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="mb-0"><i className="fas fa-filter me-2"></i>Transfer Filters</h5>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Category</label>
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
              <label className="form-label">Search Items</label>
              <input
                type="text"
                className="form-control"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Sender Branch</label>
              <select
                className="form-select"
                value={senderBranch}
                onChange={(e) => setSenderBranch(e.target.value)}
              >
                <option value="">Select Sender Branch</option>
                {availableBranches.map(branch => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Receiver Branch</label>
              <select
                className="form-select"
                value={receiverBranch}
                onChange={(e) => setReceiverBranch(e.target.value)}
              >
                <option value="">Select Receiver Branch</option>
                {availableBranches.map(branch => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Table */}
      <div className="card">
        <div className="card-header">
          <h5 className="mb-0"><i className="fas fa-table me-2"></i>Internal Transfer Table</h5>
        </div>
        <div className="card-body">
          {!senderBranch || !receiverBranch ? (
            <div className="text-center text-muted py-4">
              <i className="fas fa-info-circle fa-2x mb-3"></i>
              <p>Please select sender and receiver branches to view available items for transfer.</p>
            </div>
          ) : senderBranch === receiverBranch ? (
            <div className="text-center text-danger py-4">
              <i className="fas fa-exclamation-triangle fa-2x mb-3"></i>
              <p>Sender and receiver branches must be different.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center text-muted py-4">
              <i className="fas fa-info-circle fa-2x mb-3"></i>
              <p>No {selectedType.toLowerCase()} items available.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead className="table-dark">
                  <tr>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Price (Rs.)</th>
                    <th>Available Stock ({senderBranch})</th>
                    <th>Transfer Quantity</th>
                    <th>Available Stock ({receiverBranch})</th>
                    <th>Updated Stock ({receiverBranch})</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const senderStock = selectedType === 'Normal Item'
                      ? getNormalItemStock(item.code, senderBranch)
                      : getGroceryItemStock(item.code, senderBranch);
                    
                    const receiverStock = selectedType === 'Normal Item'
                      ? getNormalItemStock(item.code, receiverBranch)
                      : getGroceryItemStock(item.code, receiverBranch);
                    
                    const transferQty = selectedType === 'Normal Item'
                      ? (parseInt(transferQuantities[item.code]) || 0)
                      : (parseFloat(transferQuantities[item.code]) || 0);
                    
                    const updatedStock = receiverStock + transferQty;
                    const displayUpdated = item.soldByWeight 
                      ? Number(updatedStock).toFixed(3) 
                      : Math.trunc(updatedStock);
                    
                    return (
                      <tr key={item.code}>
                        <td>{item.name}</td>
                        <td>{item.category}</td>
                        <td>Rs {parseFloat(item.price).toFixed(2)}</td>
                        <td>
                          <span className="badge bg-primary">
                            {item.soldByWeight 
                              ? Number(senderStock).toFixed(3) 
                              : Math.trunc(senderStock)}
                          </span>
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control"
                            value={transferQuantities[item.code] || ''}
                            onChange={(e) => handleQuantityChange(item.code, e.target.value)}
                            min="0"
                            max={senderStock}
                            step={item.soldByWeight ? "0.001" : "1"}
                            placeholder="0"
                          />
                        </td>
                        <td>
                          <span className="badge bg-secondary">
                            {item.soldByWeight 
                              ? Number(receiverStock).toFixed(3) 
                              : Math.trunc(receiverStock)}
                          </span>
                        </td>
                        <td>
                          <span className="badge bg-success" id={`updated-${item.code}`}>
                            {displayUpdated}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Transfer Confirmation Modal */}
      {showConfirmModal && transferData && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fas fa-exchange-alt me-2"></i>Confirm Transfer
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setTransferData(null);
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info">
                  <i className="fas fa-info-circle me-2"></i>
                  Please review the transfer details before confirming.
                </div>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <strong>From:</strong> {transferData.senderBranch}
                  </div>
                  <div className="col-md-6">
                    <strong>To:</strong> {transferData.receiverBranch}
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <strong>Item Type:</strong> {transferData.itemType}
                  </div>
                  <div className="col-md-6">
                    <strong>Total Items:</strong> {transferData.items.length}
                  </div>
                </div>
                <hr />
                <h6>Transfer Details:</h6>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Transfer Quantity</th>
                        <th>Sender Stock</th>
                        <th>Receiver Stock</th>
                        <th>Updated Receiver Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferData.items.map((item, idx) => {
                        const senderStock = selectedType === 'Normal Item'
                          ? getNormalItemStock(item.itemCode, transferData.senderBranch)
                          : getGroceryItemStock(item.itemCode, transferData.senderBranch);
                        
                        const receiverStock = selectedType === 'Normal Item'
                          ? getNormalItemStock(item.itemCode, transferData.receiverBranch)
                          : getGroceryItemStock(item.itemCode, transferData.receiverBranch);
                        
                        const updatedStock = receiverStock + item.quantity;
                        const displayQty = item.soldByWeight 
                          ? Number(item.quantity).toFixed(3) 
                          : Math.trunc(item.quantity);
                        const displaySender = item.soldByWeight 
                          ? Number(senderStock).toFixed(3) 
                          : Math.trunc(senderStock);
                        const displayReceiver = item.soldByWeight 
                          ? Number(receiverStock).toFixed(3) 
                          : Math.trunc(receiverStock);
                        const displayUpdated = item.soldByWeight 
                          ? Number(updatedStock).toFixed(3) 
                          : Math.trunc(updatedStock);

                        return (
                          <tr key={idx}>
                            <td>{item.itemName}</td>
                            <td><span className="badge bg-primary">{displayQty}</span></td>
                            <td><span className="badge bg-secondary">{displaySender}</span></td>
                            <td><span className="badge bg-info">{displayReceiver}</span></td>
                            <td><span className="badge bg-success">{displayUpdated}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setTransferData(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmTransfer}
                >
                  <i className="fas fa-check me-1"></i>Confirm Transfer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InternalTransfer;
