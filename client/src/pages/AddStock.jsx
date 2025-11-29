import { useState, useEffect, useRef } from 'react';
import { itemsAPI, branchesAPI, stocksAPI, groceryAPI, machinesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, getCurrentDate } from '../utils/helpers';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { useToast } from '../context/ToastContext';

const AddStock = () => {
  const { user } = useAuth();
  const { showSuccess, showError, showWarning, showInfo } = useToast();
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
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedGroceryItem, setSelectedGroceryItem] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [groceryFormData, setGroceryFormData] = useState({ quantity: '', expiryDate: '', addedDate: stockDate });
  const [machineFormData, setMachineFormData] = useState({ startValue: '', date: '' });
  const [machineStatusMessage, setMachineStatusMessage] = useState('');
  const [machineStatusClass, setMachineStatusClass] = useState('text-info');
  
  // Lock body scroll when machine modal is open
  useEffect(() => {
    if (showMachineModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showMachineModal]);

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
      showWarning('Please select a branch first.');
      return;
    }

    if (isBatchFinished) {
      showWarning(`This batch is already finished for ${selectedBranch} (${stockDate}). Cannot add stock.`);
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
      showWarning('No stock quantities entered.');
      return;
    }

    try {
      const response = await stocksAPI.update({
        date: stockDate,
        branch: selectedBranch,
        items: itemsToUpdate
      });

      if (response.data.success) {
        const itemCount = itemsToUpdate.length;
        const message = `Normal items stock updated successfully! ${itemCount} item(s) added to ${selectedBranch} for ${stockDate}.`;
        setSuccessMessage(message);
        setShowSuccessModal(true);
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
      showError(message);
      console.error('Update stocks error:', error);
    }
  };

  // Handle grocery stock modal
  const handleShowGroceryModal = (item) => {
    setSelectedGroceryItem(item);
    setGroceryFormData({ quantity: '', expiryDate: '', addedDate: stockDate });
    setShowGroceryModal(true);
  };

  const handleAddGroceryStock = async () => {
    if (!selectedBranch || !selectedGroceryItem) return;

    const quantity = parseFloat(groceryFormData.quantity);
    const addedDate = groceryFormData.addedDate || stockDate;
    if (!quantity || quantity <= 0 || !groceryFormData.expiryDate || !addedDate) {
      showWarning('Please fill all fields correctly.');
      return;
    }

    try {
      const response = await groceryAPI.addStock({
        itemCode: selectedGroceryItem.code,
        branch: selectedBranch,
        quantity: quantity,
        expiryDate: groceryFormData.expiryDate,
        date: addedDate
      });

      if (response.data.success) {
        const displayQuantity = selectedGroceryItem.soldByWeight 
          ? Number(quantity).toFixed(3)
          : Math.trunc(quantity);
        const message = `Grocery stock added successfully! "${selectedGroceryItem.name}" - Quantity: ${displayQuantity}, Added to ${selectedBranch}.`;
        setSuccessMessage(message);
        setShowSuccessModal(true);
        setShowGroceryModal(false);
        setSelectedGroceryItem(null);
        setGroceryFormData({ quantity: '', expiryDate: '', addedDate: stockDate });
        // Reload stocks to refresh Total Stock display
        await loadGroceryStocks();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to add grocery stock';
      showError(message);
      console.error('Add grocery stock error:', error);
    }
  };

  // Handle machine batch modal
  const handleShowMachineModal = async (machine) => {
    setSelectedMachine(machine);
    
    // Always default to today's date - user can change it if needed
    const todayDate = getCurrentDate();
    
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
          date: todayDate
        });
        setMachineBatches(response.data.batches);
        setMachineStatusMessage('Active Batch Exists');
        setMachineStatusClass('text-info');
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
          date: todayDate
        });
        setMachineBatches([]);
        setMachineStatusMessage('Ready to Start');
        setMachineStatusClass('text-success');
      }
      
      // Check for completed batch on the default date (today)
      checkMachineDateValidation(machine.code, todayDate);
    } catch (error) {
      setMachineFormData({
        startValue: '',
        date: todayDate
      });
      setMachineBatches([]);
      setMachineStatusMessage('Ready to Start');
      setMachineStatusClass('text-success');
    }

    setShowMachineModal(true);
  };

  // Check machine date validation (future dates and completed batches)
  const checkMachineDateValidation = async (machineCode, dateToCheck) => {
    if (!machineCode || !dateToCheck) return;

    // Check if date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(dateToCheck + 'T00:00:00');
    
    if (selectedDate > today) {
      setMachineStatusMessage(`⚠️ ERROR: Cannot start machine for future dates! Today is ${today.toISOString().split('T')[0]}`);
      setMachineStatusClass('text-danger fw-bold');
      return;
    }

    // Check for completed batch
    try {
      const completedRes = await machinesAPI.getBatches({
        branch: selectedBranch,
        machineCode: machineCode,
        status: 'completed'
      });

      if (completedRes.data.success && completedRes.data.batches.length > 0) {
        const normalizedDate = dateToCheck.split('T')[0];
        const completedBatch = completedRes.data.batches.find(batch => {
          let batchDate = batch.date;
          if (batchDate) {
            if (batchDate instanceof Date) {
              batchDate = batchDate.toISOString().split('T')[0];
            } else if (typeof batchDate === 'string') {
              batchDate = batchDate.split('T')[0];
            }
          }
          return batchDate === normalizedDate;
        });

        if (completedBatch) {
          const endTime = completedBatch.endTime 
            ? new Date(completedBatch.endTime).toLocaleString() 
            : 'previously';
          setMachineStatusMessage(`⚠️ WARNING: Batch already completed for this date! Finished on ${endTime}`);
          setMachineStatusClass('text-danger fw-bold');
        } else {
          setMachineStatusMessage('Ready to Start');
          setMachineStatusClass('text-success');
        }
      } else {
        setMachineStatusMessage('Ready to Start');
        setMachineStatusClass('text-success');
      }
    } catch (error) {
      console.error('Check completed batch error:', error);
      setMachineStatusMessage('Ready to Start');
      setMachineStatusClass('text-success');
    }
  };

  const handleStartMachineBatch = async () => {
    if (!selectedBranch || !selectedMachine) return;

    // Validate start value - show popup if empty or invalid
    if (!machineFormData.startValue || machineFormData.startValue.trim() === '') {
      showWarning('⚠️ Please enter a start value to start the machine batch.');
      return;
    }

    const startValue = parseInt(machineFormData.startValue);
    if (isNaN(startValue) || startValue < 0) {
      showWarning('⚠️ Please enter a valid start value. The value must be a number greater than or equal to 0.');
      return;
    }

    if (!machineFormData.date) {
      showWarning('⚠️ Please select a date.');
      return;
    }

    // Check if date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(machineFormData.date + 'T00:00:00');
    
    if (selectedDate > today) {
      showError(`⚠️ ERROR: Cannot start a machine batch for a future date!\n\nSelected date: ${machineFormData.date}\nToday's date: ${today.toISOString().split('T')[0]}\n\nPlease select today's date or a past date only.`);
      return;
    }

    try {
      // Check if there's a completed batch that was ended on the selected date
      const completedRes = await machinesAPI.getBatches({
        branch: selectedBranch,
        machineCode: selectedMachine.code,
        status: 'completed'
      });

      if (completedRes.data.success && completedRes.data.batches.length > 0) {
        // Check if any completed batch was ended on the selected date
        const selectedDate = new Date(machineFormData.date);
        const endedOnSelectedDate = completedRes.data.batches.find(batch => {
          if (!batch.endTime) return false;
          const endDate = new Date(batch.endTime);
          // Compare dates (ignoring time)
          return endDate.toISOString().split('T')[0] === selectedDate.toISOString().split('T')[0];
        });

        if (endedOnSelectedDate) {
          const endTime = endedOnSelectedDate.endTime 
            ? new Date(endedOnSelectedDate.endTime).toLocaleString() 
            : 'previously';
          showError(`⚠️ WARNING: This machine batch has already been completed for date ${machineFormData.date} and branch ${selectedBranch}.\n\nThe batch was finished on ${endTime}.\n\nYou cannot start a new batch for the same date and branch. Please select a different date or branch.`);
          return;
        }
      }

      // Check if active batch exists for this specific machine and branch
      const checkRes = await machinesAPI.getBatches({
        branch: selectedBranch,
        machineCode: selectedMachine.code,
        status: 'active'
      });

      if (checkRes.data.success && checkRes.data.batches.length > 0) {
        // Verify the batch belongs to the correct machine and branch
        const batch = checkRes.data.batches.find(b => 
          b.machineCode === selectedMachine.code && 
          b.branch === selectedBranch && 
          b.status === 'active'
        );

        if (batch) {
          // Update existing batch - ensure we're updating the correct one by passing branch and machineCode
          const updateRes = await machinesAPI.updateBatch(batch.id, {
            startValue: startValue,
            date: machineFormData.date,
            branch: selectedBranch,
            machineCode: selectedMachine.code
          });

          if (updateRes.data.success) {
            const message = `Machine batch updated successfully! "${selectedMachine.name}" - Start value: ${startValue}, Branch: ${selectedBranch}.`;
            setSuccessMessage(message);
            setShowSuccessModal(true);
            setShowMachineModal(false);
            setSelectedMachine(null);
            setMachineFormData({ startValue: '', date: '' });
            loadMachineBatches();
          }
        } else {
          showError('Active batch not found for this machine and branch.');
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
          const message = `Machine batch started successfully! "${selectedMachine.name}" - Start value: ${startValue}, Branch: ${selectedBranch}.`;
          setSuccessMessage(message);
          setShowSuccessModal(true);
          setShowMachineModal(false);
          setSelectedMachine(null);
          setMachineFormData({ startValue: '', date: '' });
          loadMachineBatches();
        }
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to start/update batch';
      showError(message);
      console.error('Start machine batch error:', error);
    }
  };

  // Get available stock for grocery item - Total Stock = sum of remaining from all batches
  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setSuccessMessage('');
  };

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

  const buildFilename = (prefix) => {
    const parts = [prefix];
    if (selectedBranch) parts.push(selectedBranch.replace(/\s+/g, '_'));
    if (selectedType === 'Normal Item' && stockDate) parts.push(stockDate);
    const base = parts.filter(Boolean).join('_');
    return base || prefix;
  };

  const getNormalStockExportRows = () => {
    if (!selectedBranch) return [];
    return filteredItems.map(item => {
      const stock = getNormalItemStock(item.code);
      return [
        item.name,
        item.category,
        formatCurrency(item.price),
        stock.available,
        stockQuantities[item.code] || 0
      ];
    });
  };

  const getGroceryStockExportRows = () => {
    if (!selectedBranch) return [];
    return filteredItems.map(item => {
      const availableStock = getGroceryAvailableStock(item.code);
      const displayStock = item.soldByWeight
        ? Number(availableStock).toFixed(3)
        : Math.trunc(availableStock);
      return [
        item.name,
        item.category,
        formatCurrency(item.price),
        displayStock
      ];
    });
  };

  const getMachineStockExportRows = () => {
    if (!selectedBranch) return [];
    return filteredItems.map(machine => {
      const { status } = getMachineStatus(machine.code);
      return [
        machine.name,
        formatCurrency(machine.price),
        status
      ];
    });
  };

  const handleExport = (format) => {
    if (!selectedBranch) {
      showWarning('Please select a branch first.');
      return;
    }

    let headers = [];
    let rows = [];
    let title = '';
    let filename = '';

    if (selectedType === 'Normal Item') {
      headers = ['Item Name', 'Category', 'Price (Rs.)', 'Available Stock', 'Entered Quantity'];
      rows = getNormalStockExportRows();
      title = `Inventory Stock - ${selectedBranch} (${stockDate})`;
      filename = buildFilename('inventory_stock');
    } else if (selectedType === 'Grocery Item') {
      headers = ['Item Name', 'Category', 'Price (Rs.)', 'Available Stock'];
      rows = getGroceryStockExportRows();
      title = `Grocery Stock - ${selectedBranch}`;
      filename = buildFilename('grocery_stock');
    } else if (selectedType === 'Machine') {
      headers = ['Machine Name', 'Price per Unit (Rs.)', 'Status'];
      rows = getMachineStockExportRows();
      title = `Machine Batches - ${selectedBranch}`;
      filename = buildFilename('machine_stock');
    }

    if (!rows || rows.length === 0) {
      showWarning('No data available to export.');
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
              {selectedBranch && (
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleExport('excel')}
                    disabled={getNormalStockExportRows().length === 0}
                  >
                    Export Excel
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleExport('pdf')}
                    disabled={getNormalStockExportRows().length === 0}
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
          <div className="card-header">
            <div className="d-flex justify-content-between align-items-center">
              <span>Grocery Stock</span>
              {selectedBranch && (
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleExport('excel')}
                    disabled={getGroceryStockExportRows().length === 0}
                  >
                    Export Excel
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleExport('pdf')}
                    disabled={getGroceryStockExportRows().length === 0}
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
            <>
              <div className="d-flex justify-content-end gap-2 mb-3">
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handleExport('excel')}
                  disabled={getMachineStockExportRows().length === 0}
                >
                  Export Excel
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleExport('pdf')}
                  disabled={getMachineStockExportRows().length === 0}
                >
                  Export PDF
                </button>
              </div>
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
            </>
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
                    setGroceryFormData({ quantity: '', expiryDate: '', addedDate: stockDate });
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
                <div className="mb-3">
                  <label className="form-label">Added Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={groceryFormData.addedDate || ''}
                    onChange={(e) => setGroceryFormData({
                      ...groceryFormData,
                      addedDate: e.target.value
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
                    setGroceryFormData({ quantity: '', expiryDate: '', addedDate: stockDate });
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

      {/* Start Machine Batch Slide Panel */}
      {showMachineModal && selectedMachine && (
        <div 
          className={`slide-panel-overlay ${showMachineModal ? 'show' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowMachineModal(false);
              setSelectedMachine(null);
              setMachineFormData({ startValue: '', date: '' });
            }
          }}
        >
          <div className="slide-panel slide-panel-right" style={{ transform: showMachineModal ? 'translateX(0)' : 'translateX(100%)' }}>
            <div className="slide-panel-header">
              <h5 className="slide-panel-title">Start Machine Batch</h5>
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
            <div className="slide-panel-body">
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
                <label className="form-label">Start Value <span className="text-danger">*</span></label>
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
                  placeholder="Enter start value"
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Date <span className="text-danger">*</span></label>
                <input
                  type="date"
                  className="form-control"
                  value={machineFormData.date || stockDate}
                  max={getCurrentDate()}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setMachineFormData({
                      ...machineFormData,
                      date: newDate
                    });
                    if (selectedMachine) {
                      checkMachineDateValidation(selectedMachine.code, newDate);
                    }
                  }}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">
                  <strong>Status:</strong>
                  <span className={`ms-2 ${machineStatusClass}`}>
                    {machineStatusMessage || (hasActiveBatch ? 'Active Batch Exists' : 'Ready to Start')}
                  </span>
                </label>
              </div>
            </div>
            <div className="slide-panel-footer">
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
              {hasActiveBatch ? (
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={handleStartMachineBatch}
                >
                  Update Start Value
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartMachineBatch}
                >
                  Start Machine
                </button>
              )}
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

export default AddStock;
