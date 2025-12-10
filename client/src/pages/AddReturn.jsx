import { useState, useEffect } from 'react';
import { itemsAPI, branchesAPI, stocksAPI, groceryAPI, machinesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/helpers';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { usePopup } from '../context/PopupContext';

const AddReturn = () => {
  const { user } = useAuth();
  const { showPopup, showConfirm } = usePopup();
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
  const [isGroceryFinished, setIsGroceryFinished] = useState(false);

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
          // Keep remaining field empty for better UX (user will fill it)
          remaining[item.code] = '';
          
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
            remaining[item.code] = '';
          }
          if (!returnQty.hasOwnProperty(item.code)) {
            returnQty[item.code] = '';
          }
        });
        
        // Always update remaining quantities (empty fields)
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
        
        // Check if grocery batch is finished for this date and branch
        try {
          const finishCheckRes = await groceryAPI.checkFinished({ date: returnDate, branch: selectedBranch });
          if (finishCheckRes.data.success) {
            setIsGroceryFinished(finishCheckRes.data.isFinished || false);
          }
        } catch (error) {
          console.error('Error checking grocery finish status:', error);
          setIsGroceryFinished(false);
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
      await showPopup('⚠️ Warning', 'Please select a branch first.', 'warning');
      return;
    }

    if (isBatchFinished) {
      await showPopup('⚠️ WARNING', `This batch is already finished for ${selectedBranch} (${returnDate}). Cannot update returns.`, 'warning');
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
      await showPopup('⚠️ Warning', 'No return quantities entered. Please enter at least one return quantity.', 'warning');
      return;
    }

    try {
      const response = await stocksAPI.updateReturns({
        date: returnDate,
        branch: selectedBranch,
        items: itemsToReturn
      });

      if (response.data.success) {
        const itemCount = itemsToReturn.length;
        await showPopup('✅ Success', `${itemCount} item(s) returned for ${selectedBranch} on ${returnDate}.`, 'success');
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
      await showPopup('❌ Error', message, 'error');
      console.error('Update returns error:', error);
    }
  };

  // Normal Items - Clear Returns
  const handleClearReturns = async () => {
    // Check if there are any entered quantities
    const hasEnteredQuantities = Object.values(returnQuantities).some(qty => qty && qty.trim() !== '');
    
    if (!hasEnteredQuantities) {
      await showPopup('ℹ️ Info', 'No return quantities to clear.', 'info');
      return;
    }

    const confirmed = await showConfirm('⚠️ Confirmation', 'Are you sure you want to clear all entered return quantities? This action cannot be undone.', 'warning');
    if (!confirmed) {
      return;
    }

    const resetQuantities = {};
    Object.keys(returnQuantities).forEach(code => {
      resetQuantities[code] = '';
    });
    setReturnQuantities(resetQuantities);
    await showPopup('✅ Success', 'All return quantities have been cleared.', 'success');
  };

  // Normal Items - Finish Batch
  const handleFinishBatch = async () => {
    if (!selectedBranch) {
      await showPopup('⚠️ Warning', 'Please select a branch first.', 'warning');
      return;
    }

    if (isBatchFinished) {
      await showPopup('⚠️ WARNING', `This batch is already finished for ${selectedBranch} (${returnDate}). Cannot finish again.`, 'warning');
      return;
    }

    const confirmed = await showConfirm(
      '⚠️ CONFIRMATION', 
      `Are you sure you want to finish this batch?\n\nBranch: ${selectedBranch}\nDate: ${returnDate}\n\nThis will:\n- Calculate sold quantities\n- Lock the batch permanently\n- Prevent further stock updates\n\nThis action cannot be undone.`,
      'warning'
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await stocksAPI.finishBatch({
        date: returnDate,
        branch: selectedBranch
      });

      if (response.data.success) {
        await showPopup('✅ Success', `Batch finished successfully!\n\nBranch: ${selectedBranch}\nDate: ${returnDate}\n\nSold quantities have been calculated and the batch is now locked.`, 'success');
        loadNormalStocks();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to finish batch';
      await showPopup('❌ Error', message, 'error');
      console.error('Finish batch error:', error);
    }
  };

  // Grocery - Combined Update (handles both remaining and returns)
  const handleUpdateGrocery = async () => {
    if (!selectedBranch) {
      await showPopup('⚠️ Warning', 'Please select a branch first.', 'warning');
      return;
    }

    if (isGroceryFinished) {
      await showPopup('⚠️ WARNING', `Grocery batch is already finished for ${selectedBranch} (${returnDate}). Cannot update.`, 'warning');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const updates = [];
    const itemsToReturn = [];
    const errors = [];
    
    // Process remaining quantities (for sales)
    Object.keys(groceryRemaining).forEach(itemCode => {
      const item = items.find(i => i.code === itemCode);
      const newRemainingValue = groceryRemaining[itemCode];
      
      // Skip if empty (user may only want to update returns)
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
          errors.push(`${item?.name || itemCode}: Remaining quantity (${newRemaining}) cannot exceed total stock (${currentTotalStock})`);
          return;
        }
        
        updates.push({ itemCode, newRemaining });
      }
    });

    // Process return quantities
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
          errors.push(`${item?.name || itemCode}: Return quantity (${returnQty}) cannot exceed available stock (${totalStock})`);
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
      }
    });

    if (errors.length > 0) {
      await showPopup('❌ Error', `${errors.join('\n')}\n\nPlease correct the values and try again.`, 'error');
      return;
    }

    if (updates.length === 0 && itemsToReturn.length === 0) {
      await showPopup('⚠️ Warning', 'No quantities entered. Please enter at least one remaining or return quantity.', 'warning');
      return;
    }

    // Confirmation
    const itemCount = Math.max(updates.length, itemsToReturn.length);
    const updateText = updates.length > 0 ? `\n- Update remaining: ${updates.length} item(s)` : '';
    const returnText = itemsToReturn.length > 0 ? `\n- Record returns: ${itemsToReturn.length} item(s)` : '';
    
    const confirmed = await showConfirm(
      '⚠️ CONFIRMATION', 
      `Update Grocery Stock\n\nBranch: ${selectedBranch}\nDate: ${returnDate || today}\nTotal Items: ${itemCount} item(s)${updateText}${returnText}\n\nThis will:\n- Update remaining quantities (record sales)${updates.length > 0 ? '' : ' (if entered)'}\n- Record returns as waste${itemsToReturn.length > 0 ? '' : ' (if entered)'}\n- Update Total Stock\n\nDo you want to continue?`,
      'warning'
    );
    if (!confirmed) {
      return;
    }

    try {
      // Update remaining quantities first (records sales)
      if (updates.length > 0) {
        await groceryAPI.updateRemaining({
          branch: selectedBranch,
          date: returnDate,
          updates: updates
        });
      }

      // Record returns
      if (itemsToReturn.length > 0) {
        for (const returnItem of itemsToReturn) {
          await groceryAPI.recordReturn(returnItem);
        }
      }

      // Small delay to ensure database transactions complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reload stocks
      await loadGroceryStocks(false);

      // Clear all quantities after successful update
      setGroceryReturnQty({});
      setGroceryRemaining({});

      const updateMsg = updates.length > 0 ? `\n- Remaining quantities updated (${updates.length} item(s))` : '';
      const returnMsg = itemsToReturn.length > 0 ? `\n- Returns recorded (${itemsToReturn.length} item(s))` : '';
      
      await showPopup('✅ Success', `Grocery stock updated!\n\nBranch: ${selectedBranch}\nDate: ${returnDate || today}${updateMsg}${returnMsg}\n\nStock quantities have been updated.`, 'success');
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update grocery stock';
      await showPopup('❌ Error', message, 'error');
      console.error('Update grocery error:', error);
    }
  };

  // Grocery - Finish Batch
  const handleFinishGroceryBatch = async () => {
    if (!selectedBranch) {
      await showPopup('⚠️ Warning', 'Please select a branch first.', 'warning');
      return;
    }

    if (isGroceryFinished) {
      await showPopup('⚠️ WARNING', `Grocery batch is already finished for ${selectedBranch} (${returnDate}). Cannot finish again.`, 'warning');
      return;
    }

    const confirmed = await showConfirm(
      '⚠️ CONFIRMATION', 
      `Finish Grocery Batch\n\nBranch: ${selectedBranch}\nDate: ${returnDate}\n\nThis will:\n- Lock the batch permanently\n- Prevent further remaining quantity updates\n- Must be done before cash management entry\n\nThis action cannot be undone.\n\nDo you want to continue?`,
      'warning'
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await groceryAPI.finishBatch({
        date: returnDate,
        branch: selectedBranch
      });

      if (response.data.success) {
        await showPopup('✅ Success', `Grocery batch finished successfully!\n\nBranch: ${selectedBranch}\nDate: ${returnDate}\n\nThe batch is now locked and cannot be updated.`, 'success');
        setIsGroceryFinished(true);
        loadGroceryStocks(false);
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to finish grocery batch';
      await showPopup('❌ Error', message, 'error');
      console.error('Finish grocery batch error:', error);
    }
  };

  // Grocery - Update Remaining (records sales) - DEPRECATED, kept for reference
  const handleUpdateGroceryRemaining = async () => {
    if (!selectedBranch) {
      await showPopup('⚠️ Warning', 'Please select a branch first.', 'warning');
      return;
    }

    const updates = [];
    const errors = [];
    
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
          errors.push(`${item?.name || itemCode}: Remaining quantity (${newRemaining}) cannot exceed total stock (${currentTotalStock})`);
          return;
        }
        
        updates.push({ itemCode, newRemaining });
      }
    });

    if (errors.length > 0) {
      await showPopup('❌ Error', `${errors.join('\n')}\n\nPlease correct the values and try again.`, 'error');
      return;
    }

    if (updates.length === 0) {
      await showPopup('⚠️ Warning', 'No valid remaining quantities entered. Please enter at least one remaining quantity.', 'warning');
      return;
    }

    // Confirmation before updating remaining (records sales)
    const itemCount = updates.length;
    
    // Get item names for the confirmation message
    const itemNames = updates.map(update => {
      const item = items.find(i => i.code === update.itemCode);
      return item ? item.name : update.itemCode;
    }).join(', ');
    
    const itemListText = itemCount <= 5 
      ? `\nItems: ${itemNames}` 
      : `\nItems: ${itemCount} item(s) (${itemNames.split(',').slice(0, 3).join(', ')}... and ${itemCount - 3} more)`;
    
    const confirmed = await showConfirm(
      '⚠️ CONFIRMATION', 
      `Update Remaining Quantities (Record Sales)\n\nBranch: ${selectedBranch}\nTotal Items: ${itemCount} item(s)${itemListText}\n\nThis will:\n- Record sales based on remaining quantities\n- Update Total Stock for all items\n- Clear any entered return quantities\n\nDo you want to continue?`,
      'warning'
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await groceryAPI.updateRemaining({
        branch: selectedBranch,
        updates: updates
      });

      if (response.data.success) {
        await showPopup('✅ Success', `Grocery remaining quantities updated!\n\nBranch: ${selectedBranch}\nItems Updated: ${itemCount} item(s)\n\n- Sales have been recorded\n- Total Stock has been updated\n- Return quantities have been cleared`, 'success');
        // Reload stocks to get updated remaining quantities from database
        // This will refresh Total Stock display on both pages
        await loadGroceryStocks(false);
        
        // Clear return quantities after updating remaining
        setGroceryReturnQty({});
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update grocery remaining';
      await showPopup('❌ Error', message, 'error');
      console.error('Update grocery remaining error:', error);
    }
  };

  // Grocery - Update Returns
  const handleUpdateGroceryReturns = async () => {
    if (!selectedBranch) {
      await showPopup('⚠️ Warning', 'Please select a branch first.', 'warning');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const itemsToReturn = [];
    const returnQuantitiesMap = {}; // Track return quantities for each item
    const errors = [];

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
          errors.push(`${item?.name || itemCode}: Return quantity (${returnQty}) cannot exceed available stock (${totalStock})`);
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

    if (errors.length > 0) {
      await showPopup('❌ Error', `${errors.join('\n')}\n\nPlease correct the values and try again.`, 'error');
      return;
    }

    if (itemsToReturn.length === 0) {
      await showPopup('⚠️ Warning', 'No valid grocery return quantities entered. Please enter at least one return quantity.', 'warning');
      return;
    }

    // Confirmation before recording returns
    const itemCount = itemsToReturn.length;
    const totalReturnQty = itemsToReturn.reduce((sum, item) => sum + item.returnedQty, 0);
    const itemNames = itemsToReturn.map(item => `- ${item.itemName}: ${item.returnedQty}`).join('\n');
    
    const confirmed = await showConfirm(
      '⚠️ CONFIRMATION', 
      `Record Grocery Returns\n\nBranch: ${selectedBranch}\nDate: ${returnDate || today}\nItems: ${itemCount} item(s)\nTotal Quantity: ${totalReturnQty}\n\nItems to return:\n${itemNames}\n\nThis will:\n- Record returns as waste\n- Update stock quantities\n- Cannot be undone\n\nDo you want to continue?`,
      'warning'
    );
    if (!confirmed) {
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

      await showPopup('✅ Success', `Grocery returns recorded!\n\nBranch: ${selectedBranch}\nDate: ${returnDate || today}\nItems Returned: ${itemCount} item(s)\nTotal Quantity: ${totalReturnQty}\n\nStock quantities have been updated.`, 'success');
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to record grocery returns';
      await showPopup('❌ Error', message, 'error');
      console.error('Update grocery returns error:', error);
    }
  };

  // Machine - Finish Batch
  const handleFinishMachineBatch = async (batchId) => {
    const endValue = machineEndValues[batchId];
    
    if (!endValue || endValue.trim() === '') {
      await showPopup('⚠️ Warning', 'Please enter an end value to finish the batch.', 'warning');
      return;
    }

    const parsedEndValue = parseInt(endValue);
    
    if (isNaN(parsedEndValue) || parsedEndValue < 0) {
      await showPopup('⚠️ Warning', 'Please enter a valid end value. The value must be a number greater than or equal to 0.', 'warning');
      return;
    }

    const batch = machineBatches.find(b => b.id === batchId);
    if (!batch) {
      await showPopup('❌ Error', 'Batch not found.', 'error');
      return;
    }

    const machine = items.find(item => item.code === batch.machineCode);
    const machineName = machine ? machine.name : batch.machineCode;
    const price = machine ? parseFloat(machine.price) : 0;

    if (parsedEndValue < batch.startValue) {
      await showPopup('❌ Error', `End value (${parsedEndValue}) cannot be less than start value (${batch.startValue}).`, 'error');
      return;
    }

    const soldQty = parsedEndValue - batch.startValue;
    const totalCash = soldQty * price;

    // Confirmation before finishing machine batch
    const confirmed = await showConfirm(
      '⚠️ CONFIRMATION', 
      `Finish Machine Batch\n\nMachine: ${machineName}\nBranch: ${selectedBranch}\nDate: ${returnDate}\nStart Value: ${batch.startValue}\nEnd Value: ${parsedEndValue}\nSold Quantity: ${soldQty} units\nTotal Cash: Rs ${totalCash.toFixed(2)}\n\nThis will:\n- Complete the batch permanently\n- Record the sales\n- Lock the batch\n\nThis action cannot be undone.\n\nDo you want to continue?`,
      'warning'
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await machinesAPI.finishBatch(batchId, {
        endValue: parsedEndValue
      });

      if (response.data.success) {
        const soldQtyResult = response.data.soldQty || soldQty;
        const totalCashResult = response.data.totalCash || totalCash;
        await showPopup('✅ Success', `Machine batch completed!\n\nMachine: ${machineName}\nBranch: ${selectedBranch}\nDate: ${returnDate}\nStart Value: ${batch.startValue}\nEnd Value: ${parsedEndValue}\n\nSold Quantity: ${soldQtyResult} units\nTotal Cash: Rs ${totalCashResult.toFixed(2)}\n\nThe batch has been completed and locked.`, 'success');
        loadMachineBatches();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to finish machine batch';
      await showPopup('❌ Error', message, 'error');
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

  const handleExport = async (format) => {
    if (!selectedBranch) {
      await showPopup('⚠️ Warning', 'Please select a branch first before exporting.', 'warning');
      return;
    }

    let headers = [];
    let rows = [];
    let title = '';
    let filename = '';
    let reportType = '';

    if (selectedType === 'Normal Item') {
      headers = ['Item Name', 'Category', 'Total Returned', 'Entered Return Qty'];
      rows = getNormalReturnExportRows();
      title = `Inventory Returns - ${selectedBranch} (${returnDate})`;
      filename = buildFilename('inventory_returns');
      reportType = 'Inventory Returns';
    } else if (selectedType === 'Grocery Item') {
      headers = ['Item Name', 'Category', 'Total Stock', 'Remaining Quantity', 'Return Quantity'];
      rows = getGroceryReturnExportRows();
      title = `Grocery Returns - ${selectedBranch}`;
      filename = buildFilename('grocery_returns');
      reportType = 'Grocery Returns';
    } else if (selectedType === 'Machine') {
      headers = ['Machine Name', 'Start Value', 'End Value', 'Price per Unit (Rs.)'];
      rows = getMachineReturnExportRows();
      title = `Machine Returns - ${selectedBranch}`;
      filename = buildFilename('machine_returns');
      reportType = 'Machine Returns';
    }

    if (!rows || rows.length === 0) {
      await showPopup('⚠️ Warning', `No data available to export.\n\nPlease ensure:\n- Branch is selected\n- Data exists for ${reportType}\n- Filters are set correctly`, 'warning');
      return;
    }

    try {
      const formatName = format === 'excel' ? 'Excel' : 'PDF';
      const rowCount = rows.length;
      
      if (format === 'excel') {
        exportToExcel({ filename, sheetName: 'Report', headers, rows });
        setTimeout(async () => {
          await showPopup('✅ Success', `Export completed!\n\nReport Type: ${reportType}\nFormat: ${formatName}\nBranch: ${selectedBranch}\nRows: ${rowCount} item(s)\n\nFile: ${filename}.xlsx\n\nThe file has been downloaded.`, 'success');
        }, 500);
      } else {
        exportToPDF({ filename, title, headers, rows });
        setTimeout(async () => {
          await showPopup('✅ Success', `Export completed!\n\nReport Type: ${reportType}\nFormat: ${formatName}\nBranch: ${selectedBranch}\nRows: ${rowCount} item(s)\n\nFile: ${filename}.pdf\n\nThe file has been downloaded.`, 'success');
        }, 500);
      }
    } catch (error) {
      await showPopup('❌ Error', `Failed to export ${format.toUpperCase()} file.\n\nPlease try again or contact support if the problem persists.`, 'error');
      console.error('Export error:', error);
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
            <div className="col-md-3">
              <input
                type="date"
                className="form-control"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </div>
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
                    onClick={handleUpdateGrocery}
                    disabled={isGroceryFinished}
                  >
                    Update
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleFinishGroceryBatch}
                    disabled={isGroceryFinished}
                  >
                    Finish
                  </button>
                  {isGroceryFinished && (
                    <span className="ms-3 text-danger">
                      <i className="fas fa-lock me-1"></i>
                      Grocery batch is finished for {selectedBranch} ({returnDate})
                    </span>
                  )}
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
                                disabled={isGroceryFinished}
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
                                disabled={isGroceryFinished}
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
