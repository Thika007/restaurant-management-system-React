import { useState, useEffect } from 'react';
import { itemsAPI, branchesAPI, stocksAPI, groceryAPI, machinesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/helpers';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

const AddReturn = () => {
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
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterCategory, setFilterCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Normal Items states
  const [returnQuantities, setReturnQuantities] = useState({});
  const [isBatchFinished, setIsBatchFinished] = useState(false);

  // Grocery states
  const [groceryRemaining, setGroceryRemaining] = useState({});
  const [groceryReturnQty, setGroceryReturnQty] = useState({});

  // Machine states
  const [machineEndValues, setMachineEndValues] = useState({});

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

  // Load data when branch/date/type changes
  useEffect(() => {
    if (!selectedBranch) return;

    if (selectedType === 'Normal Item') {
      loadNormalStocks();
    } else if (selectedType === 'Grocery Item') {
      loadGroceryStocks();
    } else if (selectedType === 'Machine') {
      loadMachineBatches();
    }
  }, [selectedBranch, returnDate, selectedType]);

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
      const response = await stocksAPI.get({ date: returnDate, branch: selectedBranch });
      if (response.data.success) {
        setStocks(response.data.stocks);
        setIsBatchFinished(response.data.isFinished);

        // Initialize return quantities
        const quantities = {};
        response.data.stocks.forEach(stock => {
          quantities[stock.itemCode] = '';
        });
        setReturnQuantities(quantities);
      }
    } catch (error) {
      console.error('Load normal stocks error:', error);
      setStocks([]);
      setIsBatchFinished(false);
    }
  };

  const loadGroceryStocks = async (preserveReturnQty = false) => {
    try {
      if (!selectedBranch) {
        setGroceryStocks([]);
        return;
      }
      
      const response = await groceryAPI.getStocks({ branch: selectedBranch });
      if (response.data.success) {
        const freshStocks = response.data.stocks || [];
        setGroceryStocks(freshStocks);

        // Initialize remaining and return quantities from fresh data
        const remaining = {};
        const returnQty = {};
        const groceryItems = items.filter(item => item.itemType === 'Grocery Item');
        
        groceryItems.forEach(item => {
          const itemStocks = freshStocks.filter(s => s.itemCode === item.code);
          // Total Stock = sum of remaining from all batches for this item
          const totalStock = itemStocks.reduce((sum, s) => sum + parseFloat(s.remaining || 0), 0);
          
          // Initialize remaining with current total stock from database
          // This ensures the field shows the current available stock
          if (totalStock > 0) {
            remaining[item.code] = item.soldByWeight ? Number(totalStock).toFixed(3) : Math.trunc(totalStock).toString();
          } else {
            remaining[item.code] = '0';
          }
          
          // Preserve return quantity only if preserveReturnQty is true and user has entered something
          if (preserveReturnQty) {
            const existingReturnQty = groceryReturnQty[item.code];
            returnQty[item.code] = existingReturnQty && existingReturnQty !== '' ? existingReturnQty : '';
          } else {
            returnQty[item.code] = '';
          }
        });
        
        // Ensure all grocery items are in the state, even if they have no stocks
        groceryItems.forEach(item => {
          if (!remaining.hasOwnProperty(item.code)) {
            remaining[item.code] = '0';
          }
          if (!returnQty.hasOwnProperty(item.code)) {
            returnQty[item.code] = '';
          }
        });
        
        // Always update remaining quantities with fresh API data
        setGroceryRemaining(remaining);
        
        // Update return quantities based on preserve flag
        if (preserveReturnQty) {
          setGroceryReturnQty(prev => {
            const merged = { ...prev };
            Object.keys(returnQty).forEach(code => {
              if (returnQty[code] !== '') {
                merged[code] = returnQty[code];
              }
            });
            return merged;
          });
        } else {
          setGroceryReturnQty(returnQty);
        }
      }
    } catch (error) {
      console.error('Load grocery stocks error:', error);
      setGroceryStocks([]);
    }
  };

  const loadMachineBatches = async () => {
    try {
      if (!selectedBranch) {
        setMachineBatches([]);
        return;
      }
      const response = await machinesAPI.getBatches({ 
        branch: selectedBranch, 
        status: 'active',
        date: returnDate
      });
      if (response.data.success) {
        const batches = response.data.batches || [];
        setMachineBatches(batches);

        // Initialize end values with start values
        const endValues = {};
        batches.forEach(batch => {
          endValues[batch.id] = batch.startValue ? batch.startValue.toString() : '';
        });
        setMachineEndValues(endValues);
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

  // Normal Items - Update Returns
  const handleUpdateReturns = async () => {
    if (!selectedBranch) {
      alert('Please select a branch first.');
      return;
    }

    if (isBatchFinished) {
      alert(`This batch is already finished for ${selectedBranch} (${returnDate}).`);
      return;
    }

    const itemsToReturn = [];
    Object.keys(returnQuantities).forEach(itemCode => {
      const qty = parseInt(returnQuantities[itemCode]) || 0;
      if (qty > 0) {
        itemsToReturn.push({ itemCode, quantity: qty });
      }
    });

    if (itemsToReturn.length === 0) {
      alert('No return quantities entered.');
      return;
    }

    try {
      const response = await stocksAPI.updateReturns({
        date: returnDate,
        branch: selectedBranch,
        items: itemsToReturn
      });

      if (response.data.success) {
        alert('Returns updated successfully!');
        // Reset quantities
        const resetQuantities = {};
        Object.keys(returnQuantities).forEach(code => {
          resetQuantities[code] = '';
        });
        setReturnQuantities(resetQuantities);
        loadNormalStocks();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update returns';
      alert(message);
      console.error('Update returns error:', error);
    }
  };

  // Normal Items - Clear Returns
  const handleClearReturns = () => {
    const resetQuantities = {};
    Object.keys(returnQuantities).forEach(code => {
      resetQuantities[code] = '';
    });
    setReturnQuantities(resetQuantities);
  };

  // Normal Items - Finish Batch
  const handleFinishBatch = async () => {
    if (!selectedBranch) {
      alert('Please select a branch.');
      return;
    }

    if (isBatchFinished) {
      alert(`This batch is already finished for ${selectedBranch} (${returnDate}).`);
      return;
    }

    if (!confirm('Are you sure you want to finish this batch? This will calculate sold quantities and lock the batch.')) {
      return;
    }

    try {
      const response = await stocksAPI.finishBatch({
        date: returnDate,
        branch: selectedBranch
      });

      if (response.data.success) {
        alert('Batch finished! Sold quantities calculated.');
        loadNormalStocks();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to finish batch';
      alert(message);
      console.error('Finish batch error:', error);
    }
  };

  // Grocery - Update Remaining (records sales)
  const handleUpdateGroceryRemaining = async () => {
    if (!selectedBranch) {
      alert('Please select a branch.');
      return;
    }

    const updates = [];
    Object.keys(groceryRemaining).forEach(itemCode => {
      const item = items.find(i => i.code === itemCode);
      const newRemainingValue = groceryRemaining[itemCode];
      
      // Allow 0 as a valid value; only skip when truly empty
      if (newRemainingValue === '' || newRemainingValue === null || newRemainingValue === undefined) {
        return;
      }

      const newRemaining = item && item.soldByWeight 
        ? parseFloat(newRemainingValue) 
        : parseFloat(newRemainingValue);
      
      if (!isNaN(newRemaining) && newRemaining >= 0) {
        // Validate newRemaining doesn't exceed total stock
        const currentTotalStock = getGroceryStockTotal(itemCode);
        if (newRemaining > currentTotalStock) {
          alert(`${item?.name || itemCode}: Remaining quantity (${newRemaining}) cannot exceed total stock (${currentTotalStock}).`);
          return;
        }
        
        updates.push({ itemCode, newRemaining });
      }
    });

    if (updates.length === 0) {
      alert('No valid remaining quantities entered.');
      return;
    }

    try {
      const response = await groceryAPI.updateRemaining({
        branch: selectedBranch,
        updates: updates
      });

      if (response.data.success) {
        alert('Grocery remaining updated! Sales recorded. Total Stock updated.');
        // Reload stocks to get updated remaining quantities from database
        // This will refresh Total Stock display on both pages
        await loadGroceryStocks(false);
        
        // Clear return quantities after updating remaining
        setGroceryReturnQty({});
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update grocery remaining';
      alert(message);
      console.error('Update grocery remaining error:', error);
    }
  };

  // Grocery - Update Returns
  const handleUpdateGroceryReturns = async () => {
    if (!selectedBranch) {
      alert('Please select a branch.');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const itemsToReturn = [];
    const returnQuantitiesMap = {}; // Track return quantities for each item

    Object.keys(groceryReturnQty).forEach(itemCode => {
      const item = items.find(i => i.code === itemCode);
      const returnQtyValue = groceryReturnQty[itemCode];
      
      if (!returnQtyValue || returnQtyValue === '') {
        return;
      }
      
      const returnQty = item && item.soldByWeight 
        ? parseFloat(returnQtyValue) 
        : parseInt(returnQtyValue);
      
      if (returnQty > 0 && !isNaN(returnQty)) {
        // Validate return quantity doesn't exceed available stock
        const totalStock = getGroceryStockTotal(itemCode);
        if (returnQty > totalStock) {
          alert(`${item?.name || itemCode}: Return quantity (${returnQty}) cannot exceed available stock (${totalStock}).`);
          return;
        }
        
        itemsToReturn.push({
          itemCode,
          itemName: item?.name || '',
          branch: selectedBranch,
          date: returnDate || today,
          returnedQty: returnQty,
          reason: 'waste'
        });

        // Store return quantity to update remaining after return
        returnQuantitiesMap[itemCode] = returnQty;
      }
    });

    if (itemsToReturn.length === 0) {
      alert('No valid grocery return quantities entered.');
      return;
    }

    try {
      // Process each return - backend will update remaining stock in database
      for (const returnItem of itemsToReturn) {
        await groceryAPI.recordReturn(returnItem);
      }

      // Small delay to ensure database transactions complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reload stocks to get updated remaining quantities from database
      // This will fetch fresh data from backend which has updated remaining values
      await loadGroceryStocks(false);

      // Clear return quantities after successful return
      setGroceryReturnQty(prev => {
        const cleared = { ...prev };
        Object.keys(returnQuantitiesMap).forEach(itemCode => {
          cleared[itemCode] = '';
        });
        return cleared;
      });

      alert('Grocery returns recorded! Stock quantities updated.');
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to record grocery returns';
      alert(message);
      console.error('Update grocery returns error:', error);
    }
  };

  // Machine - Finish Batch
  const handleFinishMachineBatch = async (batchId) => {
    const endValue = parseInt(machineEndValues[batchId]);
    
    if (isNaN(endValue) || endValue < 0) {
      alert('Please enter a valid end value.');
      return;
    }

    const batch = machineBatches.find(b => b.id === batchId);
    if (!batch) {
      alert('Batch not found.');
      return;
    }

    if (endValue < batch.startValue) {
      alert('End value cannot be less than start value.');
      return;
    }

    try {
      const response = await machinesAPI.finishBatch(batchId, {
        endValue: endValue
      });

      if (response.data.success) {
        alert(`Batch completed! Sold ${response.data.soldQty} units. Total: Rs ${response.data.totalCash?.toFixed(2) || '0.00'}`);
        loadMachineBatches();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to finish machine batch';
      alert(message);
      console.error('Finish machine batch error:', error);
    }
  };

  // Get stock data for normal item
  const getNormalItemStock = (itemCode) => {
    const stock = stocks.find(s => s.itemCode === itemCode);
    if (!stock || !stock.added) return null;
    
    const availableForReturn = (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0);
    return {
      totalReturned: stock.returned || 0,
      maxReturn: Math.max(0, availableForReturn)
    };
  };

  // Get grocery stock totals - calculates current remaining from all batches
  const getGroceryStockTotal = (itemCode) => {
    if (!selectedBranch) return 0;
    const itemStocks = groceryStocks.filter(s => s.itemCode === itemCode && s.branch === selectedBranch);
    // Total Stock = sum of remaining from all batches (not quantity, but remaining)
    return itemStocks.reduce((sum, s) => sum + parseFloat(s.remaining || 0), 0);
  };

  const buildFilename = (prefix) => {
    const parts = [prefix];
    if (selectedBranch) parts.push(selectedBranch.replace(/\s+/g, '_'));
    if (returnDate) parts.push(returnDate);
    const base = parts.filter(Boolean).join('_');
    return base || prefix;
  };

  const getNormalReturnExportRows = () => {
    if (!selectedBranch || stocks.length === 0) return [];
    return filteredItems.reduce((rows, item) => {
      const stockData = getNormalItemStock(item.code);
      if (!stockData) return rows;
      rows.push([
        item.name,
        item.category,
        stockData.totalReturned,
        returnQuantities[item.code] || 0
      ]);
      return rows;
    }, []);
  };

  const getGroceryReturnExportRows = () => {
    if (!selectedBranch) return [];
    return filteredItems.reduce((rows, item) => {
      const totalStock = getGroceryStockTotal(item.code);
      if (totalStock <= 0) return rows;
      const remaining = groceryRemaining[item.code] ?? '';
      const returnQty = groceryReturnQty[item.code] || '';
      rows.push([
        item.name,
        item.category,
        item.soldByWeight ? Number(totalStock).toFixed(3) : Math.round(totalStock),
        remaining === '' ? '' : remaining,
        returnQty
      ]);
      return rows;
    }, []);
  };

  const getMachineReturnExportRows = () => {
    if (!selectedBranch || machineBatches.length === 0) return [];
    return machineBatches.map(batch => {
      const machine = items.find(item => item.code === batch.machineCode);
      return [
        machine ? machine.name : batch.machineCode,
        batch.startValue ?? '',
        machineEndValues[batch.id] || '',
        formatCurrency(machine?.price || 0)
      ];
    });
  };

  const handleExport = (format) => {
    if (!selectedBranch) {
      alert('Please select a branch first.');
      return;
    }

    let headers = [];
    let rows = [];
    let title = '';
    let filename = '';

    if (selectedType === 'Normal Item') {
      headers = ['Item Name', 'Category', 'Total Returned', 'Entered Return Qty'];
      rows = getNormalReturnExportRows();
      title = `Inventory Returns - ${selectedBranch} (${returnDate})`;
      filename = buildFilename('inventory_returns');
    } else if (selectedType === 'Grocery Item') {
      headers = ['Item Name', 'Category', 'Total Stock', 'Remaining Quantity', 'Return Quantity'];
      rows = getGroceryReturnExportRows();
      title = `Grocery Returns - ${selectedBranch}`;
      filename = buildFilename('grocery_returns');
    } else if (selectedType === 'Machine') {
      headers = ['Machine Name', 'Start Value', 'End Value', 'Price per Unit (Rs.)'];
      rows = getMachineReturnExportRows();
      title = `Machine Returns - ${selectedBranch}`;
      filename = buildFilename('machine_returns');
    }

    if (!rows || rows.length === 0) {
      alert('No data available to export.');
      return;
    }

    if (format === 'excel') {
      exportToExcel({ filename, sheetName: 'Report', headers, rows });
    } else {
      exportToPDF({ filename, title, headers, rows });
    }
  };

  const availableBranches = getAvailableBranches();
  const filteredItems = getFilteredItems();
  const categories = getCategories();

  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }

  return (
    <div className="p-4">
      <h2 className="mb-4">Add Return Stock</h2>

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
              Grocery Items
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
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Normal Items Return Table */}
      {selectedType === 'Normal Item' && (
        <div className="card mb-4">
          <div className="card-header">
            <div className="d-flex justify-content-between align-items-center">
              <span>Inventory Returns</span>
              {selectedBranch && (
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleExport('excel')}
                    disabled={getNormalReturnExportRows().length === 0}
                  >
                    Export Excel
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleExport('pdf')}
                    disabled={getNormalReturnExportRows().length === 0}
                  >
                    Export PDF
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="card-body">
            {!selectedBranch ? (
              <div className="text-center text-warning p-3">
                Please select a branch first.
              </div>
            ) : stocks.length === 0 ? (
              <div className="text-center text-danger p-3">
                No stocks added for this date and branch.
              </div>
            ) : isBatchFinished ? (
              <div className="text-center text-danger p-3">
                This batch is already finished for {selectedBranch} ({returnDate}).
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <button
                    className="btn btn-primary me-2"
                    onClick={handleUpdateReturns}
                  >
                    Update Returns
                  </button>
                  <button
                    className="btn btn-secondary me-2"
                    onClick={handleClearReturns}
                  >
                    Clear
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleFinishBatch}
                  >
                    Finish Batch
                  </button>
                </div>
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Category</th>
                      <th>Total Returned</th>
                      <th>Enter Return Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center">No normal items available.</td>
                      </tr>
                    ) : (
                      filteredItems.map(item => {
                        const stockData = getNormalItemStock(item.code);
                        if (!stockData) return null;
                        
                        return (
                          <tr key={item.code}>
                            <td>{item.name}</td>
                            <td>{item.category}</td>
                            <td>{stockData.totalReturned}</td>
                            <td>
                              <input
                                type="number"
                                className="form-control"
                                value={returnQuantities[item.code] || ''}
                                onChange={(e) => setReturnQuantities({
                                  ...returnQuantities,
                                  [item.code]: e.target.value
                                })}
                                min="0"
                                max={stockData.maxReturn}
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

      {/* Grocery Items Return Table */}
      {selectedType === 'Grocery Item' && (
        <div className="card mb-4">
          <div className="card-header">
            <div className="d-flex justify-content-between align-items-center">
              <span>Grocery Returns</span>
              {selectedBranch && (
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleExport('excel')}
                    disabled={getGroceryReturnExportRows().length === 0}
                  >
                    Export Excel
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleExport('pdf')}
                    disabled={getGroceryReturnExportRows().length === 0}
                  >
                    Export PDF
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="card-body">
            {!selectedBranch ? (
              <div className="text-center text-warning p-3">
                Please select a branch first.
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <button
                    className="btn btn-primary me-2"
                    onClick={handleUpdateGroceryRemaining}
                  >
                    Update Remaining
                  </button>
                  <button
                    className="btn btn-warning"
                    onClick={handleUpdateGroceryReturns}
                  >
                    Update Returns
                  </button>
                </div>
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Category</th>
                      <th>Total Stock</th>
                      <th>Remaining Quantity</th>
                      <th>Return Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center">No grocery items available.</td>
                      </tr>
                    ) : (() => {
                      // Filter items to only show those with stock > 0
                      const itemsWithStock = filteredItems.filter(item => {
                        const totalStock = getGroceryStockTotal(item.code);
                        return totalStock > 0;
                      });

                      if (itemsWithStock.length === 0) {
                        return (
                          <tr>
                            <td colSpan="5" className="text-center text-warning">
                              No grocery items with available stock. Please add stocks first before adding returns.
                            </td>
                          </tr>
                        );
                      }

                      return itemsWithStock.map(item => {
                        const totalStock = getGroceryStockTotal(item.code);
                        return (
                          <tr key={item.code}>
                            <td>{item.name}</td>
                            <td>{item.category}</td>
                            <td id={`totalStock_${item.code}`}>
                              {item.soldByWeight 
                                ? Number(totalStock).toFixed(3) 
                                : Math.round(totalStock)}
                            </td>
                            <td>
                              <input
                                type="number"
                                className="form-control"
                                id={`groceryRemainQty_${item.code}`}
                                value={groceryRemaining[item.code] ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setGroceryRemaining({
                                    ...groceryRemaining,
                                    [item.code]: value
                                  });
                                }}
                                min="0"
                                max={totalStock}
                                step={item.soldByWeight ? "0.001" : "1"}
                                placeholder={item.soldByWeight ? Number(totalStock).toFixed(3) : Math.trunc(totalStock).toString()}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="form-control"
                                value={groceryReturnQty[item.code] || ''}
                                onChange={(e) => setGroceryReturnQty({
                                  ...groceryReturnQty,
                                  [item.code]: e.target.value
                                })}
                                min="0"
                                step={item.soldByWeight ? "0.001" : "1"}
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {/* Machine Return Table */}
      {selectedType === 'Machine' && (
        <div className="card mb-4">
          <div className="card-header">
            <div className="d-flex justify-content-between align-items-center">
              <span>Machine Returns</span>
              {selectedBranch && (
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleExport('excel')}
                    disabled={getMachineReturnExportRows().length === 0}
                  >
                    Export Excel
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleExport('pdf')}
                    disabled={getMachineReturnExportRows().length === 0}
                  >
                    Export PDF
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="card-body">
            {!selectedBranch ? (
              <div className="text-center text-warning p-3">
                Please select a branch first.
              </div>
            ) : (
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Machine Name</th>
                    <th>Start Value</th>
                    <th>End Value</th>
                    <th>Price per Unit</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {machineBatches.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center">No active machine batches.</td>
                    </tr>
                  ) : (
                    machineBatches.map(batch => {
                      const machine = items.find(item => item.code === batch.machineCode);
                      return (
                        <tr key={batch.id}>
                          <td>{machine ? machine.name : 'Unknown Machine'}</td>
                          <td>{batch.startValue}</td>
                          <td>
                            <input
                              type="number"
                              className="form-control"
                              value={machineEndValues[batch.id] || ''}
                              onChange={(e) => setMachineEndValues({
                                ...machineEndValues,
                                [batch.id]: e.target.value
                              })}
                              min={batch.startValue || 0}
                            />
                          </td>
                          <td>Rs {machine ? parseFloat(machine.price).toFixed(2) : '0.00'}</td>
                          <td>
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleFinishMachineBatch(batch.id)}
                            >
                              Finish Batch
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
    </div>
  );
};

export default AddReturn;
